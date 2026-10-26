begin;

-- Private, per-user records. Money is stored as integer paise.
create table public.business_settings (
  owner_id uuid primary key default auth.uid() references auth.users(id),
  settings jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  updated_at timestamptz not null default now()
);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  name text not null check (length(trim(name)) between 1 and 250),
  details jsonb not null default '{}'::jsonb check (jsonb_typeof(details) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, owner_id)
);

create table public.client_presets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  document_type text not null check (document_type in ('invoice', 'quotation')),
  name text not null check (length(trim(name)) between 1 and 250),
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (owner_id, document_type, name)
);

create table public.document_sequences (
  owner_id uuid not null default auth.uid() references auth.users(id),
  document_type text not null check (document_type in ('invoice', 'quotation')),
  financial_year integer not null check (financial_year between 2000 and 9999),
  series_code text not null check (series_code ~ '^[A-F0-9]{4}$'),
  starting_number integer not null check (starting_number between 100000 and 899999),
  next_number integer not null check (next_number between 100000 and 1000000),
  created_at timestamptz not null default now(),
  primary key (owner_id, document_type, financial_year),
  unique (owner_id, document_type, series_code),
  check (next_number >= starting_number)
);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references auth.users(id),
  document_type text not null check (document_type in ('invoice', 'quotation')),
  client_name text not null default '',
  status text not null default 'draft' check (status in ('draft', 'issued', 'paid', 'cancelled')),
  document_number text check (document_number ~ '^[A-Z0-9/-]{1,16}$'),
  financial_year integer,
  issue_date date,
  due_date date,
  snapshot jsonb not null check (jsonb_typeof(snapshot) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  finalized_at timestamptz,
  unique (owner_id, document_number),
  check ((status = 'draft' and document_number is null and finalized_at is null)
    or (status <> 'draft' and document_number is not null and finalized_at is not null
      and financial_year is not null and issue_date is not null and due_date >= issue_date))
);

create index documents_owner_created on public.documents (owner_id, created_at desc);
create index clients_owner_name on public.clients (owner_id, name);

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create function public.protect_issued_document() returns trigger
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
  return new;
end;
$$;

create trigger protect_issued_document before update on public.documents
for each row execute function public.protect_issued_document();

-- Every table is protected even when the project-wide automatic RLS option is off.
do $$
declare table_name text;
begin
  foreach table_name in array array['business_settings', 'clients', 'client_presets', 'documents', 'document_sequences'] loop
    execute format('alter table public.%I enable row level security', table_name);
    execute format('revoke all on public.%I from anon, authenticated', table_name);
    execute format('grant select on public.%I to authenticated', table_name);
    execute format('create policy owner_read on public.%I for select to authenticated using (owner_id = (select auth.uid()))', table_name);
    if table_name <> 'document_sequences' then
      execute format('create trigger touch_updated_at before update on public.%I for each row execute function public.touch_updated_at()', table_name);
      execute format('grant insert, update, delete on public.%I to authenticated', table_name);
      if table_name = 'documents' then
        execute 'create policy owner_insert on public.documents for insert to authenticated with check (owner_id = (select auth.uid()) and status = ''draft'' and document_number is null)';
        execute 'create policy owner_update on public.documents for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()) and status = ''draft'' and document_number is null)';
        execute 'create policy owner_delete on public.documents for delete to authenticated using (owner_id = (select auth.uid()) and status = ''draft'')';
      else
        execute format('create policy owner_insert on public.%I for insert to authenticated with check (owner_id = (select auth.uid()))', table_name);
        execute format('create policy owner_update on public.%I for update to authenticated using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()))', table_name);
        execute format('create policy owner_delete on public.%I for delete to authenticated using (owner_id = (select auth.uid()))', table_name);
      end if;
    end if;
  end loop;
end;
$$;

-- Repeated calls for the same document return the same assigned number.
-- Draft locking plus an atomic counter update prevents duplicate numbering.
create function public.finalize_document(p_document_id uuid)
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
begin
  if actor is null then raise exception 'Sign in before finalizing a document.'; end if;
  select * into doc from public.documents
    where id = p_document_id and owner_id = actor for update;
  if not found then raise exception 'Document not found.'; end if;
  if doc.status <> 'draft' then return doc; end if;
  if coalesce(jsonb_array_length(doc.snapshot->'items'), 0) = 0 then
    raise exception 'Add at least one line item before finalizing.';
  end if;
  if length(trim(doc.client_name)) = 0 then raise exception 'Add a client before finalizing.'; end if;

  fy := extract(year from today)::integer - case when extract(month from today) < 4 then 1 else 0 end;
  code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 4));
  seed := 100000 + floor(random() * 700000)::integer;
  insert into public.document_sequences (owner_id, document_type, financial_year, series_code, starting_number, next_number)
    values (actor, doc.document_type, fy, code, seed, seed)
    on conflict (owner_id, document_type, financial_year) do nothing;
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

create function public.set_document_status(p_document_id uuid, p_status text)
returns public.documents
language plpgsql security definer set search_path = '' as $$
declare doc public.documents;
begin
  if auth.uid() is null then raise exception 'Sign in first.'; end if;
  if p_status not in ('issued', 'paid', 'cancelled') then raise exception 'Invalid document status.'; end if;
  update public.documents set status = p_status
    where id = p_document_id and owner_id = auth.uid() and status <> 'draft'
    returning * into doc;
  if not found then raise exception 'Issued document not found.'; end if;
  return doc;
end;
$$;

revoke all on function public.touch_updated_at() from public, anon, authenticated;
revoke all on function public.protect_issued_document() from public, anon, authenticated;
revoke all on function public.finalize_document(uuid) from public, anon;
revoke all on function public.set_document_status(uuid, text) from public, anon;
grant execute on function public.finalize_document(uuid) to authenticated;
grant execute on function public.set_document_status(uuid, text) to authenticated;

comment on table public.document_sequences is 'Private, locked counters. Opaque per-financial-year series; no public invoice-count disclosure.';
comment on table public.documents is 'Draft snapshots and immutable issued invoices/quotations. Print/reprint must not allocate another number.';

commit;
