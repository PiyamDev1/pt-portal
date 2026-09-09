\set ON_ERROR_STOP on

do $$
begin
  if (public.pos_schema_status() ->> 'ready')::boolean is not true then
    raise exception 'POS capability is not ready';
  end if;
  if (public.pos_schema_status() ->> 'version')::bigint <> 2026090901 then
    raise exception 'Unexpected POS capability version';
  end if;
  if not (select relrowsecurity and relforcerowsecurity from pg_class where oid = 'public.pos_transactions'::regclass) then
    raise exception 'POS transaction RLS is not forced';
  end if;
  if has_table_privilege('authenticated', 'public.pos_transactions', 'SELECT')
    or has_table_privilege('service_role', 'public.pos_transactions', 'INSERT') then
    raise exception 'POS table grants expose a forbidden direct path';
  end if;
  if not has_function_privilege('service_role', 'public.pos_post_transaction_v2(uuid,text,jsonb)', 'EXECUTE')
    or has_function_privilege('service_role', 'public.pos_post_transaction_v1(uuid,text,jsonb)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.pos_post_transaction_v2(uuid,text,jsonb)', 'EXECUTE') then
    raise exception 'POS mutation execute grants are incorrect';
  end if;
  if (select count(*) from public.pos_categories where is_active) <> 6 then
    raise exception 'POS must expose six active top-level categories';
  end if;
  if exists (select 1 from public.pos_catalogue_items where item_key in ('supplier-payment','general-refund') and is_quick_entry) then
    raise exception 'Superseded quick-entry options remain visible';
  end if;
  if (select count(*) from public.pos_catalogue_items where group_key='remittance' and is_active and not is_system_action) <> 5 then
    raise exception 'Five remittance providers are required';
  end if;
  if not exists (select 1 from public.pos_catalogue_items where item_key='donation' and default_direction='OUT' and classification='EXPENSE')
    or not exists (select 1 from public.pos_catalogue_items where item_key='other-income' and default_direction='IN') then
    raise exception 'Plain-language Other actions have incorrect money direction';
  end if;
end
$$;

do $$
declare
  agent constant uuid := '00000000-0000-0000-0000-000000000101';
  manager constant uuid := '00000000-0000-0000-0000-000000000102';
  second_manager constant uuid := '00000000-0000-0000-0000-000000000103';
  till_id_value uuid;
  shift_id_value uuid;
  loyalty_transaction_id uuid;
  split_transaction_id uuid;
  expense_transaction_id uuid;
  supplier_id_value uuid;
  closeout_id_value uuid;
  card_tender_id uuid;
  response_value jsonb;
  balances_value jsonb;
  exception_hint text;
begin
  select id into till_id_value from public.pos_tills
  where location_id = '10000000-0000-0000-0000-000000000001';

  response_value := public.pos_open_shift_v1(manager, 'pos-test-open-0001', jsonb_build_object(
    'tillId', till_id_value, 'openingFloat', 200, 'overrideReason', 'Integration opening float'
  ));
  shift_id_value := (response_value ->> 'shiftId')::uuid;

  response_value := public.pos_post_transaction_v2(agent, 'pos-test-remittance-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'categoryKey', 'remittance', 'catalogueKey', 'ria-remittance',
    'entryMode', 'CUSTOMER_PAYMENT', 'direction', 'IN', 'totalAmount', 75,
    'customerName', 'Remittance customer', 'loyaltyCode', 'PYM-2345-6789-A',
    'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 75))
  ));
  if (response_value ->> 'loyaltyPointsAwarded')::integer <> 75 then
    raise exception 'Remittance did not award points on the complete amount';
  end if;
  if exists (
    select 1 from public.pos_supplier_balance_entries entry
    where entry.transaction_id=(response_value->>'transactionId')::uuid
  ) then
    raise exception 'Customer remittance receipt changed a supplier balance';
  end if;
  if not exists (
    select 1 from public.pos_transactions tx
    where tx.id=(response_value->>'transactionId')::uuid
      and tx.reporting_supplier_vendor_id is not null
      and tx.category_label_snapshot='Remittance'
      and tx.service_label_snapshot='Ria'
  ) then
    raise exception 'Remittance provider or historical snapshots were not recorded';
  end if;

  begin
    perform public.pos_post_transaction_v1(agent, 'pos-test-source-0001', jsonb_build_object(
      'shiftId', shift_id_value, 'catalogueKey', 'nicop-cnic', 'direction', 'IN',
      'totalAmount', 50, 'customerName', 'Tracked customer',
      'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 50))
    ));
    raise exception 'Tracked transaction without a source was accepted';
  exception when others then
    get stacked diagnostics exception_hint = pg_exception_hint;
    if exception_hint is distinct from 'POS_SOURCE_LINK_REQUIRED' then raise; end if;
  end;

  response_value := public.pos_post_transaction_v1(agent, 'pos-test-sale-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'catalogueKey', 'document-assistance', 'direction', 'IN',
    'totalAmount', 25, 'customerName', 'Loyalty customer', 'loyaltyCode', 'PYM-2345-6789-A',
    'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 25))
  ));
  loyalty_transaction_id := (response_value ->> 'transactionId')::uuid;
  if (response_value ->> 'loyaltyPointsAwarded')::integer <> 25 then
    raise exception 'Eligible POS points were not awarded';
  end if;

  response_value := public.pos_post_transaction_v1(agent, 'pos-test-sale-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'catalogueKey', 'document-assistance', 'direction', 'IN',
    'totalAmount', 25, 'customerName', 'Loyalty customer', 'loyaltyCode', 'PYM-2345-6789-A',
    'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 25))
  ));
  if (response_value ->> 'idempotentReplay')::boolean is not true
    or (select count(*) from public.pos_transactions where id = loyalty_transaction_id) <> 1 then
    raise exception 'Transaction retry was not idempotent';
  end if;

  begin
    perform public.pos_post_transaction_v1(agent, 'pos-test-refund-bypass-0001', jsonb_build_object(
      'shiftId', shift_id_value, 'catalogueKey', 'ticketing', 'direction', 'OUT',
      'outgoingType', 'REFUND', 'totalAmount', 10, 'customerName', 'Refund bypass',
      'source', jsonb_build_object('type', 'TICKETING', 'recordId', 'ticket-refund-1'),
      'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 10))
    ));
    raise exception 'Direct transaction post bypassed the controlled refund workflow';
  exception when others then
    get stacked diagnostics exception_hint = pg_exception_hint;
    if exception_hint is distinct from 'POS_REFUND_WORKFLOW_REQUIRED' then raise; end if;
  end;

  response_value := public.pos_post_transaction_v1(agent, 'pos-test-split-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'catalogueKey', 'document-assistance', 'direction', 'IN',
    'totalAmount', 100, 'customerName', 'Split customer',
    'tenders', jsonb_build_array(
      jsonb_build_object('method', 'CASH', 'amount', 40),
      jsonb_build_object('method', 'CARD', 'amount', 60, 'reconciliationStatus', 'RECORDED')
    )
  ));
  split_transaction_id := (response_value ->> 'transactionId')::uuid;
  select id into card_tender_id from public.pos_transaction_tenders
  where transaction_id = split_transaction_id and payment_method = 'CARD';
  balances_value := public.pos_expected_balances_v1(till_id_value, shift_id_value);
  if (balances_value ->> 'drawer')::numeric <> 265 then
    raise exception 'Split tender changed drawer by more than its cash component';
  end if;

  perform public.pos_record_reconciliation_v1(agent, 'pos-test-reconcile-0001', jsonb_build_object(
    'transactionTenderId', card_tender_id, 'status', 'COMPLETED', 'note', 'Integration settlement'
  ));

  response_value := public.pos_configure_supplier_v1(manager, 'pos-test-supplier-0001', jsonb_build_object(
    'name', 'Integration Supplier', 'alternateNames', jsonb_build_array('Test supplier'),
    'sourceArea', 'Ticketing', 'sourceReference', 'LMS-SUP-1', 'openingBalance', 50,
    'openingNote', 'Verified integration opening balance', 'freshFactorMethod', 'totp'
  ));
  supplier_id_value := (response_value ->> 'supplierId')::uuid;

  perform public.pos_post_transaction_v1(agent, 'pos-test-supplier-deposit-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'catalogueKey', 'ticketing-packages-supplier-payment', 'direction', 'OUT',
    'outgoingType', 'SUPPLIER_PAYMENT', 'supplierId', supplier_id_value,
    'supplierMovementType', 'DEPOSIT', 'totalAmount', 100, 'customerName', 'Integration Supplier',
    'note', 'Supplier cash deposit',
    'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 100))
  ));
  perform public.pos_post_transaction_v1(agent, 'pos-test-supplier-use-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'catalogueKey', 'ticketing-packages-supplier-payment', 'direction', 'OUT',
    'outgoingType', 'SUPPLIER_PAYMENT', 'supplierId', supplier_id_value,
    'supplierMovementType', 'USE_BALANCE', 'totalAmount', 40, 'customerName', 'Integration Supplier',
    'note', 'Supplier balance used', 'tenders', '[]'::jsonb
  ));
  if (select sum(balance_delta) from public.pos_supplier_balance_entries
      where supplier_vendor_id = supplier_id_value) <> 110 then
    raise exception 'Supplier running balance is incorrect';
  end if;

  perform public.pos_record_cash_movement_v1(agent, 'pos-test-reserve-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'movementType', 'RESERVE_IN', 'amount', 20,
    'denominations', jsonb_build_array(jsonb_build_object('valuePence', 100, 'count', 20)),
    'reason', 'Move extra coins to reserve'
  ));
  balances_value := public.pos_expected_balances_v1(till_id_value, shift_id_value);
  if (balances_value ->> 'reserve')::numeric <> 20
    or (balances_value ->> 'drawer')::numeric <> 145 then
    raise exception 'Reserve transfer did not preserve physical cash';
  end if;

  response_value := public.pos_record_refund_v1(agent, 'pos-test-refund-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'refundKind', 'LINKED',
    'originalTransactionId', loyalty_transaction_id, 'amount', 10,
    'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 10)),
    'reasonCode', 'CUSTOMER_REQUEST', 'note', 'Partial customer refund'
  ));
  if (response_value ->> 'loyaltyPointsReversed')::integer <> 10 then
    raise exception 'Partial refund did not reverse proportional loyalty points';
  end if;

  response_value := public.pos_post_transaction_v1(manager, 'pos-test-expense-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'catalogueKey', 'general-expense', 'direction', 'OUT',
    'outgoingType', 'EXPENSE', 'totalAmount', 10, 'customerName', 'Stationery',
    'note', 'Integration office supplies',
    'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 10))
  ));
  expense_transaction_id := (response_value ->> 'transactionId')::uuid;
  perform public.pos_correct_expense_v1(manager, 'pos-test-correction-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'originalTransactionId', expense_transaction_id,
    'reason', 'Duplicate expense entered during integration test', 'freshFactorMethod', 'totp'
  ));

  perform public.pos_record_refund_v1(manager, 'pos-test-general-refund-0001', jsonb_build_object(
    'shiftId', shift_id_value, 'refundKind', 'GENERAL', 'amount', 5,
    'tenders', jsonb_build_array(jsonb_build_object('method', 'BANK', 'amount', 5)),
    'reasonCode', 'LEGACY_ORIGINAL', 'note', 'Verified legacy general refund',
    'supportingReference', 'LEGACY-RECEIPT-1',
    'originalEvidence', jsonb_build_object('originalDate', '2026-09-01', 'customerName', 'Legacy customer',
      'service', 'Legacy service', 'originalAmount', 5, 'originalPaymentMethod', 'UNKNOWN'),
    'approvalReason', 'Manager verified legacy receipt evidence', 'freshFactorMethod', 'totp'
  ));

  begin
    update public.pos_transactions set note = 'tampered' where id = loyalty_transaction_id;
    raise exception 'Immutable transaction update was accepted';
  exception when sqlstate '55000' then null;
  end;

  perform public.pos_import_legacy_row_v1(manager, 'pos-test-import-0001', jsonb_build_object(
    'legacySource', 'excel-test', 'legacyRowKey', 'row-1', 'businessDate', '2026-09-01',
    'catalogueKey', 'document-assistance', 'customerName', 'Historical customer', 'direction', 'IN',
    'amount', 12, 'paymentMethod', 'CASH', 'note', 'Original historical row',
    'originalReference', 'EXCEL-1', 'freshFactorMethod', 'totp'
  ));
  if (select loyalty_points_awarded from public.pos_transactions
      where legacy_source = 'excel-test' and legacy_row_key = 'row-1') <> 0 then
    raise exception 'Legacy import awarded loyalty points';
  end if;

  balances_value := public.pos_expected_balances_v1(till_id_value, shift_id_value);
  response_value := public.pos_close_shift_v1(agent, 'pos-test-close-0001', jsonb_build_object(
    'shiftId', shift_id_value,
    'countedDrawer', (balances_value ->> 'drawer')::numeric,
    'countedReserve', (balances_value ->> 'reserve')::numeric,
    'drawerDenominations', '[]'::jsonb, 'reserveDenominations', '[]'::jsonb
  ));
  closeout_id_value := (response_value ->> 'closeoutId')::uuid;
  perform public.pos_approve_closeout_v1(second_manager, 'pos-test-approve-0001', jsonb_build_object(
    'closeoutId', closeout_id_value, 'approvalNote', 'Independent integration approval',
    'freshFactorMethod', 'totp'
  ));
  if (select status from public.pos_closeouts where id = closeout_id_value) <> 'APPROVED' then
    raise exception 'Independent closeout approval failed';
  end if;

  begin
    perform public.pos_post_transaction_v1(agent, 'pos-test-closed-0001', jsonb_build_object(
      'shiftId', shift_id_value, 'catalogueKey', 'document-assistance', 'direction', 'IN',
      'totalAmount', 1, 'customerName', 'Closed shift',
      'tenders', jsonb_build_array(jsonb_build_object('method', 'CASH', 'amount', 1))
    ));
    raise exception 'Closed shift accepted a transaction';
  exception when sqlstate '55000' then null;
  end;
end
$$;

do $$
begin
  if (select count(*) from public.pos_audit_events) < 10 then
    raise exception 'Expected POS audit events were not created';
  end if;
  if (select count(*) from public.pos_transactions where transaction_kind = 'LEGACY_IMPORT') <> 1 then
    raise exception 'Legacy duplicate preservation failed';
  end if;
end
$$;
