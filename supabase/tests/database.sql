-- Run in the Supabase SQL Editor as postgres. All fixture data is rolled back.
begin;
insert into auth.users (id, aud, role, email) values
  ('00000000-0000-4000-8000-000000000101', 'authenticated', 'authenticated', 'invoice-db-test-a@example.test'),
  ('00000000-0000-4000-8000-000000000102', 'authenticated', 'authenticated', 'invoice-db-test-b@example.test');
insert into public.workspace_members(email) values ('invoice-db-test-a@example.test'), ('invoice-db-test-b@example.test');
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated","email":"invoice-db-test-a@example.test"}', true);
set local role authenticated;

do $$
declare
  first_document public.documents;
  repeated_document public.documents;
  next_document public.documents;
  quote public.documents;
  counter_before integer;
  counter_after integer;
  prepared public.document_sequences;
  prepared_again public.document_sequences;
begin
  prepared := public.prepare_document_series('invoice');
  prepared_again := public.prepare_document_series('invoice');
  if prepared.series_code <> prepared_again.series_code
    or prepared.next_number <> prepared_again.next_number
    or prepared.starting_number <> prepared.next_number then
    raise exception 'Previewing the next number consumed a number or changed its series.';
  end if;
  insert into public.client_presets (document_type, name, snapshot)
    values ('invoice', 'Database verification', '{"template":"porcelain"}');
  if (select count(*) from public.client_presets) <> 1 then raise exception 'Preset write/read failed.'; end if;
  insert into public.documents (document_type, client_name, snapshot)
    values ('invoice', 'Test client', '{"fields":{"senderName":"WIZARDCOG","senderAddress":"Kolkata, West Bengal","supplierGstin":"19AAFFW5069E1ZV","clientAddress":"Test address, West Bengal","clientGstin":"URP"},"items":[{"description":"ERP implementation","qty":"1","rate":"10000","sac":"998314"}],"taxSettings":{"placeOfSupply":"19","reverseCharge":false,"recipientType":"unregistered"}}')
    returning * into first_document;
  first_document := public.finalize_document(first_document.id);
  if right(first_document.document_number, 6)::integer <> prepared.next_number then
    raise exception 'The first issued number differs from the private preview.';
  end if;
  if first_document.document_number !~ '^WC-[A-F0-9]{4}-[0-9]{6}$'
    or length(first_document.document_number) > 16 then raise exception 'Invalid invoice format.'; end if;
  if first_document.snapshot->'fields'->>'invoiceNumber' <> first_document.document_number then
    raise exception 'Snapshot number differs from assigned number.';
  end if;
  if (first_document.snapshot#>>'{totals,subtotalPaise}')::bigint <> 1000000
    or (first_document.snapshot#>>'{totals,gstPaise}')::bigint <> 180000
    or (first_document.snapshot#>>'{totals,cgstPaise}')::bigint <> 90000
    or (first_document.snapshot#>>'{totals,sgstPaise}')::bigint <> 90000
    or (first_document.snapshot#>>'{totals,totalPaise}')::bigint <> 1180000 then
    raise exception 'Server-side GST calculation failed.';
  end if;
  select next_number into counter_before from public.document_sequences where document_type = 'invoice';
  repeated_document := public.finalize_document(first_document.id);
  select next_number into counter_after from public.document_sequences where document_type = 'invoice';
  if repeated_document.document_number <> first_document.document_number or counter_before <> counter_after then
    raise exception 'Reprint consumed another number.';
  end if;
  insert into public.documents (document_type, client_name, snapshot)
    values ('invoice', 'Another client', '{"fields":{"senderName":"WIZARDCOG","senderAddress":"Kolkata, West Bengal","supplierGstin":"19AAFFW5069E1ZV","clientAddress":"Test address, West Bengal","clientGstin":"URP"},"items":[{"description":"Support","qty":"1","rate":"5000","sac":"998314"}],"taxSettings":{"placeOfSupply":"19","reverseCharge":false,"recipientType":"unregistered"}}')
    returning * into next_document;
  next_document := public.finalize_document(next_document.id);
  if left(next_document.document_number, 8) <> left(first_document.document_number, 8)
    or right(next_document.document_number, 6)::integer <> right(first_document.document_number, 6)::integer + 1 then
    raise exception 'Invoices are not consecutive in the same series.';
  end if;
  insert into public.documents (document_type, client_name, snapshot)
    values ('quotation', 'Quote client', '{"fields":{"senderName":"WIZARDCOG","senderAddress":"Kolkata, West Bengal","supplierGstin":"19AAFFW5069E1ZV","clientAddress":"Test address, West Bengal","clientGstin":"URP"},"items":[{"description":"Implementation","qty":"1","rate":"10000","sac":"998314"}],"taxSettings":{"placeOfSupply":"19","reverseCharge":false,"recipientType":"unregistered"}}')
    returning * into quote;
  quote := public.finalize_document(quote.id);
  if quote.document_number !~ '^WCQ-[A-F0-9]{4}-[0-9]{6}$' or length(quote.document_number) > 16 then
    raise exception 'Invalid quotation format.';
  end if;
  -- A never-sent invoice releases its number to the next finalization, without consuming the counter.
  select next_number into counter_before from public.document_sequences where document_type = 'invoice';
  next_document := public.release_document_number(next_document.id);
  if next_document.status <> 'cancelled' or next_document.number_released_at is null then
    raise exception 'Cancel-and-reuse did not release the number.';
  end if;
  if public.next_document_number('invoice') <> next_document.document_number then
    raise exception 'The preview does not offer the released number.';
  end if;
  insert into public.documents (document_type, client_name, snapshot)
    values ('invoice', 'Reuse client', '{"fields":{"senderName":"WIZARDCOG","senderAddress":"Kolkata, West Bengal","supplierGstin":"19AAFFW5069E1ZV","clientAddress":"Test address, West Bengal","clientGstin":"URP"},"items":[{"description":"Support","qty":"1","rate":"5000","sac":"998314"}],"taxSettings":{"placeOfSupply":"19","reverseCharge":false,"recipientType":"unregistered"}}')
    returning * into repeated_document;
  repeated_document := public.finalize_document(repeated_document.id);
  select next_number into counter_after from public.document_sequences where document_type = 'invoice';
  if repeated_document.document_number <> next_document.document_number or counter_before <> counter_after then
    raise exception 'The released number was not reused.';
  end if;
  begin
    perform public.set_document_status(next_document.id, 'issued');
    raise exception 'A released document was reopened.';
  exception when raise_exception then
    if sqlerrm not like 'This document was cancelled and its number released%' then raise; end if;
  end;
  begin
    perform public.set_document_status(first_document.id, 'paid');
    perform public.release_document_number(first_document.id);
    raise exception 'A paid document released its number.';
  exception when raise_exception then
    if sqlerrm <> 'Only an issued, unpaid document can be cancelled for number reuse.' then raise; end if;
  end;
  insert into public.documents (document_type, client_name, snapshot)
    values ('proforma', 'Proforma client', '{"fields":{"senderName":"WIZARDCOG","senderAddress":"Kolkata, West Bengal","supplierGstin":"19AAFFW5069E1ZV","clientAddress":"Test address, West Bengal","clientGstin":""},"items":[{"description":"Implementation","qty":"1","rate":"10000","sac":"998314"}],"taxSettings":{"placeOfSupply":"19","reverseCharge":false,"recipientType":"registered"}}')
    returning * into quote;
  quote := public.finalize_document(quote.id);
  if quote.document_number !~ '^WCP-[A-F0-9]{4}-[0-9]{6}$' or length(quote.document_number) > 16 then
    raise exception 'Invalid proforma format.';
  end if;
  repeated_document := public.set_document_status(first_document.id, 'paid');
  if repeated_document.status <> 'paid' then raise exception 'Status update failed.'; end if;
  begin
    update public.documents set snapshot = '{"fields":{},"items":[]}' where id = first_document.id;
    raise exception 'Issued document was editable.';
  exception
    when insufficient_privilege then null;
    when raise_exception then
      if sqlerrm <> 'Issued documents retain their original number, dates and contents.' then raise; end if;
  end;
  if not exists (select 1 from pg_policies where schemaname = 'public'
    and tablename = 'documents' and policyname = 'owner_delete' and qual like '%draft%') then
    raise exception 'The draft-only removal policy is missing.';
  end if;
end;
$$;

select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000102","role":"authenticated","email":"invoice-db-test-b@example.test"}', true);
do $$
begin
  if (select count(*) from public.documents) <> 0
    or (select count(*) from public.client_presets) <> 0
    or (select count(*) from public.document_sequences) <> 0 then
    raise exception 'A different user could read private records.';
  end if;
  begin
    insert into public.client_presets (owner_id, document_type, name, snapshot)
      values ('00000000-0000-4000-8000-000000000101', 'invoice', 'Cross-user write', '{}');
    raise exception 'A different user could write private records.';
  exception when insufficient_privilege then null;
  end;
  if has_table_privilege('anon', 'public.documents', 'SELECT')
    or has_table_privilege('anon', 'public.client_presets', 'SELECT')
    or has_function_privilege('anon', 'public.finalize_document(uuid)', 'EXECUTE') then
    raise exception 'Anonymous database access is enabled.';
  end if;
end;
$$;
select set_config('request.jwt.claims', '{"sub":"00000000-0000-4000-8000-000000000101","role":"authenticated","email":"not-approved@example.test"}', true);
do $$
begin
  if public.is_workspace_member() or (select count(*) from public.documents) <> 0 then
    raise exception 'An unapproved account could access the workspace.';
  end if;
  begin
    perform public.finalize_document('00000000-0000-4000-8000-000000000555');
    raise exception 'An unapproved account could finalize a document.';
  exception when raise_exception then
    if sqlerrm <> 'An approved WizardCog sign-in is required.' then raise; end if;
  end;
end;
$$;
reset role;
rollback;
select 'PASS: private presets, owner isolation, opaque consecutive numbering, independent quotation series, stable reprints, issued-document protection, and anonymous access restrictions. All fixtures rolled back.' as verification;
