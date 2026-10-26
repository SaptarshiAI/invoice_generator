begin;

-- This is a private WizardCog workspace, rather than an open invoicing service.
create table public.workspace_members (
  email text primary key check (email = lower(trim(email))),
  created_at timestamptz not null default now()
);
alter table public.workspace_members enable row level security;
revoke all on public.workspace_members from public, anon, authenticated;
insert into public.workspace_members (email) values ('wizardcogofficial@gmail.com');

create function public.is_workspace_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists (
    select 1 from public.workspace_members
    where email = lower(auth.jwt()->>'email')
  );
$$;
revoke all on function public.is_workspace_member() from public, anon;
grant execute on function public.is_workspace_member() to authenticated;

do $$
declare table_name text;
begin
  foreach table_name in array array['business_settings', 'clients', 'client_presets', 'documents', 'document_sequences'] loop
    execute format('alter policy owner_read on public.%I using (owner_id = (select auth.uid()) and (select public.is_workspace_member()))', table_name);
    if table_name <> 'document_sequences' then
      if table_name = 'documents' then
        execute 'alter policy owner_insert on public.documents with check (owner_id = (select auth.uid()) and (select public.is_workspace_member()) and status = ''draft'' and document_number is null)';
        execute 'alter policy owner_update on public.documents using (owner_id = (select auth.uid()) and (select public.is_workspace_member())) with check (owner_id = (select auth.uid()) and (select public.is_workspace_member()) and status = ''draft'' and document_number is null)';
        execute 'alter policy owner_delete on public.documents using (owner_id = (select auth.uid()) and (select public.is_workspace_member()) and status = ''draft'')';
      else
        execute format('alter policy owner_insert on public.%I with check (owner_id = (select auth.uid()) and (select public.is_workspace_member()))', table_name);
        execute format('alter policy owner_update on public.%I using (owner_id = (select auth.uid()) and (select public.is_workspace_member())) with check (owner_id = (select auth.uid()) and (select public.is_workspace_member()))', table_name);
        execute format('alter policy owner_delete on public.%I using (owner_id = (select auth.uid()) and (select public.is_workspace_member()))', table_name);
      end if;
    end if;
  end loop;
end;
$$;

-- Apply the same membership rule to SECURITY DEFINER entry points.
create function public.require_workspace_member() returns trigger
language plpgsql set search_path = '' as $$
begin
  if auth.uid() is not null and not public.is_workspace_member() then
    raise exception 'This workspace is restricted to approved WizardCog users.';
  end if;
  return new;
end;
$$;
revoke all on function public.require_workspace_member() from public, anon, authenticated;
create trigger require_workspace_member before insert or update on public.documents
for each row execute function public.require_workspace_member();
create trigger require_workspace_member before insert or update on public.document_sequences
for each row execute function public.require_workspace_member();

create function public.prepare_document_series(p_document_type text)
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
  if p_document_type not in ('invoice', 'quotation') then raise exception 'Invalid document type.'; end if;
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
revoke all on function public.prepare_document_series(text) from public, anon;
grant execute on function public.prepare_document_series(text) to authenticated;

create or replace function public.finalize_document(p_document_id uuid)
returns public.documents
language plpgsql security definer set search_path = '' as $$
declare
  actor uuid := auth.uid();
  doc public.documents;
  counter public.document_sequences;
  today date := (now() at time zone 'Asia/Kolkata')::date;
  fy integer;
  seed integer;
  code text;
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
  perform public.prepare_document_series(doc.document_type);
  update public.document_sequences set next_number = next_number + 1
    where owner_id = actor and document_type = doc.document_type and financial_year = fy and next_number <= 999999
    returning * into counter;
  if not found then raise exception 'This numbering series is exhausted.'; end if;

  assigned_number := case when doc.document_type = 'quotation' then 'WCQ-' else 'WC-' end
    || counter.series_code || '-' || (counter.next_number - 1)::text;
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
  update public.documents set status = p_status
    where id = p_document_id and owner_id = auth.uid() and status <> 'draft'
    returning * into doc;
  if not found then raise exception 'Issued document not found.'; end if;
  return doc;
end;
$$;

commit;
