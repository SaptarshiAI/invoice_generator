begin;

-- Proforma invoices get their own document type and numbering series (WCP-).
do $$
declare constraint_row record;
begin
  for constraint_row in
    select conrelid::regclass as table_name, conname from pg_constraint
    where conrelid in ('public.documents'::regclass, 'public.document_sequences'::regclass, 'public.client_presets'::regclass)
      and contype = 'c' and pg_get_constraintdef(oid) like '%document_type%quotation%'
  loop
    execute format('alter table %s drop constraint %I', constraint_row.table_name, constraint_row.conname);
  end loop;
end;
$$;
alter table public.documents add constraint documents_document_type_check
  check (document_type in ('invoice', 'quotation', 'proforma'));
alter table public.document_sequences add constraint document_sequences_document_type_check
  check (document_type in ('invoice', 'quotation', 'proforma'));
alter table public.client_presets add constraint client_presets_document_type_check
  check (document_type in ('invoice', 'quotation', 'proforma'));

-- A document cancelled before it reached the client can release its number.
-- The cancelled record keeps the number for audit; only one active record may hold it.
alter table public.documents add column number_released_at timestamptz;
alter table public.documents add constraint documents_released_only_when_cancelled
  check (number_released_at is null or status = 'cancelled');
alter table public.documents drop constraint documents_owner_id_document_number_key;
create unique index documents_owner_active_number on public.documents (owner_id, document_number)
  where number_released_at is null;

create or replace function public.protect_issued_document() returns trigger
language plpgsql set search_path = '' as $$
begin
  if old.status <> 'draft' and
    (new.owner_id, new.document_type, new.client_name, new.document_number,
      new.financial_year, new.issue_date, new.due_date, new.snapshot, new.finalized_at)
    is distinct from
    (old.owner_id, old.document_type, old.client_name, old.document_number,
      old.financial_year, old.issue_date, old.due_date, old.snapshot, old.finalized_at) then
    raise exception 'Issued documents retain their original number, dates and contents.';
  end if;
  if old.number_released_at is not null
    and (new.number_released_at, new.status) is distinct from (old.number_released_at, old.status) then
    raise exception 'A cancelled document whose number was reused cannot be reopened.';
  end if;
  return new;
end;
$$;

create or replace function public.prepare_document_series(p_document_type text)
returns public.document_sequences
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  fy integer := extract(year from today)::integer - case when extract(month from today) < 4 then 1 else 0 end;
  counter public.document_sequences;
  code text;
  seed integer;
  attempt integer;
begin
  if actor is null or not public.is_workspace_member() then raise exception 'An approved WizardCog sign-in is required.'; end if;
  if p_document_type not in ('invoice', 'quotation', 'proforma') then raise exception 'Invalid document type.'; end if;
  select * into counter from public.document_sequences
    where owner_id = actor and document_type = p_document_type and financial_year = fy;
  if found then return counter; end if;
  for attempt in 1..20 loop
    code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
    seed := 100000 + floor(random() * 700000)::integer;
    begin
      insert into public.document_sequences (owner_id, document_type, financial_year, series_code, starting_number, next_number)
        values (actor, p_document_type, fy, code, seed, seed)
        on conflict (owner_id, document_type, financial_year) do nothing;
      select * into counter from public.document_sequences
        where owner_id = actor and document_type = p_document_type and financial_year = fy;
      if found then return counter; end if;
    exception when unique_violation then
      continue;
    end;
  end loop;
  raise exception 'Could not create a unique document series. Please retry.';
end;
$$;

-- Returns the lowest released number in this financial year, else the next counter value.
-- With p_consume, the counter row is locked so concurrent finalizations cannot collide.
create function public.allocate_document_number(p_document_type text, p_consume boolean)
returns text
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  today date := (now() at time zone 'Asia/Kolkata')::date;
  fy integer := extract(year from today)::integer - case when extract(month from today) < 4 then 1 else 0 end;
  prefix text := case p_document_type when 'quotation' then 'WCQ-' when 'proforma' then 'WCP-' else 'WC-' end;
  counter public.document_sequences;
  reused text;
begin
  counter := public.prepare_document_series(p_document_type);
  if p_consume then
    select * into counter from public.document_sequences
      where owner_id = actor and document_type = p_document_type and financial_year = fy for update;
  end if;
  select released.document_number into reused from public.documents released
    where released.owner_id = actor and released.document_type = p_document_type
      and released.financial_year = fy and released.number_released_at is not null
      and not exists (select 1 from public.documents active
        where active.owner_id = actor and active.document_number = released.document_number
          and active.number_released_at is null)
    order by released.document_number limit 1;
  if reused is not null then return reused; end if;
  if not p_consume then return prefix || counter.series_code || '-' || counter.next_number::text; end if;
  update public.document_sequences set next_number = next_number + 1
    where owner_id = actor and document_type = p_document_type and financial_year = fy and next_number <= 999999
    returning * into counter;
  if not found then raise exception 'This numbering series is exhausted.'; end if;
  return prefix || counter.series_code || '-' || (counter.next_number - 1)::text;
end;
$$;
revoke all on function public.allocate_document_number(text, boolean) from public, anon, authenticated;

-- Preview only: never consumes a number.
create function public.next_document_number(p_document_type text)
returns text
language plpgsql security definer set search_path = '' as $$
begin
  return public.allocate_document_number(p_document_type, false);
end;
$$;
revoke all on function public.next_document_number(text) from public, anon;
grant execute on function public.next_document_number(text) to authenticated;

create or replace function public.finalize_document(p_document_id uuid)
returns public.documents
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  doc public.documents;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  fy integer;
  assigned_number text;
  supplier_gstin text;
  recipient_gstin text;
  supply_state text;
  line jsonb;
  quantity numeric;
  unit_rate numeric;
  subtotal_paise bigint := 0;
  gst_paise bigint;
  cgst_paise bigint;
  sgst_paise bigint;
  igst_paise bigint;
  reverse_charge boolean;
  interstate boolean;
begin
  if actor is null or not public.is_workspace_member() then raise exception 'An approved WizardCog sign-in is required.'; end if;
  select * into doc from public.documents
    where id = p_document_id and owner_id = actor for update;
  if not found then raise exception 'Document not found.'; end if;
  if doc.status <> 'draft' then return doc; end if;
  if coalesce(jsonb_array_length(doc.snapshot->'items'), 0) = 0 then
    raise exception 'Add at least one line item before finalizing.';
  end if;
  if length(trim(doc.client_name)) = 0 then raise exception 'Add a client before finalizing.'; end if;

  supplier_gstin := upper(regexp_replace(coalesce(doc.snapshot#>>'{fields,supplierGstin}', ''), '<[^>]*>', '', 'g'));
  recipient_gstin := upper(regexp_replace(coalesce(doc.snapshot#>>'{fields,clientGstin}', ''), '<[^>]*>', '', 'g'));
  if not public.valid_gstin(supplier_gstin) then raise exception 'A valid supplier GSTIN is required.'; end if;
  if doc.document_type = 'invoice' and recipient_gstin <> 'URP' then
    if doc.snapshot#>>'{taxSettings,recipientType}' = 'uin' then
      if recipient_gstin !~ '^[0-9]{2}[A-Z0-9]{13}$' then raise exception 'A valid recipient UIN is required.'; end if;
    elsif not public.valid_gstin(recipient_gstin) then raise exception 'A valid client GSTIN or URP is required.';
    end if;
  end if;
  if length(trim(coalesce(doc.snapshot#>>'{fields,senderName}', ''))) = 0
    or length(trim(coalesce(doc.snapshot#>>'{fields,senderAddress}', ''))) = 0
    or length(trim(coalesce(doc.snapshot#>>'{fields,clientAddress}', ''))) = 0 then
    raise exception 'Supplier and recipient names and addresses are required.';
  end if;
  supply_state := coalesce(doc.snapshot#>>'{taxSettings,placeOfSupply}', '');
  if not (supply_state = any(array['01','02','03','04','05','06','07','08','09','10','11','12','13','14','15','16','17','18','19','20','21','22','23','24','26','27','29','30','31','32','33','34','35','36','37','38','97'])) then
    raise exception 'A valid place of supply is required.';
  end if;
  for line in select value from jsonb_array_elements(doc.snapshot->'items') loop
    if coalesce(line->>'sac', '') !~ '^[0-9]{6}$' or length(trim(coalesce(line->>'description', ''))) = 0 then
      raise exception 'Every service needs a description and six-digit SAC.';
    end if;
    if coalesce(line->>'qty', '') !~ '^[0-9]+([.][0-9]+)?$' or coalesce(line->>'rate', '') !~ '^[0-9]+([.][0-9]+)?$' then
      raise exception 'Quantities and rates must be valid non-negative numbers.';
    end if;
    quantity := (line->>'qty')::numeric;
    unit_rate := (line->>'rate')::numeric;
    if quantity <= 0 then raise exception 'Quantity must be positive.'; end if;
    subtotal_paise := subtotal_paise + round(quantity * unit_rate * 100)::bigint;
  end loop;
  gst_paise := round(subtotal_paise::numeric * 0.18)::bigint;
  interstate := left(supplier_gstin, 2) <> supply_state;
  reverse_charge := coalesce((doc.snapshot#>>'{taxSettings,reverseCharge}')::boolean, false);
  cgst_paise := case when interstate then 0 else round(gst_paise::numeric / 2)::bigint end;
  sgst_paise := case when interstate then 0 else gst_paise - cgst_paise end;
  igst_paise := case when interstate then gst_paise else 0 end;
  doc.snapshot := jsonb_set(doc.snapshot, '{totals}', jsonb_build_object(
    'subtotalPaise', subtotal_paise, 'gstPaise', gst_paise, 'cgstPaise', cgst_paise,
    'sgstPaise', sgst_paise, 'igstPaise', igst_paise, 'interstate', interstate,
    'totalPaise', subtotal_paise + case when reverse_charge then 0 else gst_paise end));
  if coalesce((doc.snapshot#>>'{einvoice,enabled}')::boolean, false) then
    if coalesce(doc.snapshot#>>'{fields,irn}', '') !~ '^[a-fA-F0-9]{64}$'
      or coalesce(doc.snapshot#>>'{fields,ackNumber}', '') !~ '^[0-9]{15}$'
      or coalesce(doc.snapshot#>>'{fields,ackDate}', '') !~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}$'
      or length(coalesce(doc.snapshot#>>'{einvoice,qr}', '')) = 0 then
      raise exception 'Complete the IRP acknowledgement, IRN, date and signed QR.';
    end if;
  end if;

  fy := extract(year from today)::integer - case when extract(month from today) < 4 then 1 else 0 end;
  assigned_number := public.allocate_document_number(doc.document_type, true);
  update public.documents set
    status = 'issued', document_number = assigned_number, financial_year = fy,
    issue_date = today, due_date = today + 15, finalized_at = now(),
    snapshot = jsonb_set(jsonb_set(jsonb_set(doc.snapshot,
      '{fields,invoiceNumber}', to_jsonb(assigned_number)),
      '{fields,issueDate}', to_jsonb(to_char(today, 'FMMonth FMDD, YYYY'))),
      '{fields,dueDate}', to_jsonb(to_char(today + 15, 'FMMonth FMDD, YYYY')))
    where id = doc.id returning * into doc;
  return doc;
end;
$$;

create or replace function public.set_document_status(p_document_id uuid, p_status text)
returns public.documents
language plpgsql security definer set search_path = '' as $$
declare doc public.documents;
begin
  if auth.uid() is null or not public.is_workspace_member() then raise exception 'An approved WizardCog sign-in is required.'; end if;
  if p_status not in ('issued', 'paid', 'cancelled') then raise exception 'Invalid document status.'; end if;
  select * into doc from public.documents
    where id = p_document_id and owner_id = auth.uid() and status <> 'draft' for update;
  if not found then raise exception 'Issued document not found.'; end if;
  if doc.number_released_at is not null then
    raise exception 'This document was cancelled and its number released for reuse; it cannot be reopened.';
  end if;
  update public.documents set status = p_status where id = doc.id returning * into doc;
  return doc;
end;
$$;

-- For a printed document that was never sent: cancel it and hand its number to the
-- next document finalized in the same series and financial year.
create function public.release_document_number(p_document_id uuid)
returns public.documents
language plpgsql security definer set search_path = '' as $$
declare
  doc public.documents;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  fy integer := extract(year from today)::integer - case when extract(month from today) < 4 then 1 else 0 end;
begin
  if auth.uid() is null or not public.is_workspace_member() then raise exception 'An approved WizardCog sign-in is required.'; end if;
  select * into doc from public.documents
    where id = p_document_id and owner_id = auth.uid() for update;
  if not found then raise exception 'Issued document not found.'; end if;
  if doc.status <> 'issued' then
    raise exception 'Only an issued, unpaid document can be cancelled for number reuse.';
  end if;
  if coalesce((doc.snapshot#>>'{einvoice,enabled}')::boolean, false) then
    raise exception 'This number is registered with an IRN. Cancel it on the IRP and keep the number cancelled.';
  end if;
  if doc.financial_year <> fy then
    raise exception 'Numbers from a previous financial year cannot be reused.';
  end if;
  update public.documents set status = 'cancelled', number_released_at = now()
    where id = doc.id returning * into doc;
  return doc;
end;
$$;
revoke all on function public.release_document_number(uuid) from public, anon;
grant execute on function public.release_document_number(uuid) to authenticated;

comment on column public.documents.number_released_at is 'Set when a never-sent document is cancelled so its number can be reused by the next finalized document.';

commit;
