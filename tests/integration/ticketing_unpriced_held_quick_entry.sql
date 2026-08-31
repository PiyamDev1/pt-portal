insert into public.travel_packages (
  id, package_reference, package_type, status, selected_quote_snapshot
)
values (
  '9f100000-0000-0000-0000-000000000001',
  'PKG-QUOTE-PRICE-1',
  'umrah',
  'selected',
  jsonb_build_object(
    'payload', jsonb_build_object(
      'adults', 5,
      'childrenPaying', 0,
      'childrenFree', 0,
      'infants', 0
    ),
    'selection', jsonb_build_object(
      'combination', jsonb_build_object(
        'currency', 'GBP',
        'servicePassengers', 5,
        'flightOption', jsonb_build_object(
          'id', 'flight-quote-price-1',
          'title', 'Quotation priced flight',
          'pricingMode', 'per_person',
          'adultPrice', 1020,
          'childPrice', 760,
          'infantPrice', 120
        ),
        'linkedFlightSelections', '[]'::jsonb
      )
    )
  )
);

insert into public.travel_package_reservations (
  id, package_id, reservation_type, title, booking_reference, status, metadata
)
values (
  '9f200000-0000-0000-0000-000000000001',
  '9f100000-0000-0000-0000-000000000001',
  'flight',
  'Quotation priced flight',
  'PKGPRICE1',
  'confirmed',
  '{}'::jsonb
);

do $ticketing_unpriced_held_assertions$
declare
  result jsonb;
  replay jsonb;
  package_result jsonb;
  booking_id_value uuid;
  transaction_id_value uuid;
  package_transaction_id_value uuid;
begin
  result := public.ticketing_create_quick_tk_supplied(
    '4a000000-0000-0000-0000-000000000002',
    'held-without-sale-1',
    jsonb_build_object(
      'customerName', 'Unpriced Held Passenger',
      'pnr', 'HELD-NO-SALE-1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'supplierCode', 'sabre_polani',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-31',
      'timeLimitAt', '2026-09-01T18:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 400,
          'unitSalePrice', null,
          'unitDiscount', null
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', '[]'::jsonb,
      'attributionReason', null
    )
  );

  booking_id_value := (result #>> '{booking,id}')::uuid;
  transaction_id_value := (result #>> '{transaction,id}')::uuid;

  if result #>> '{booking,operationalStatus}' <> 'held'
    or result #>> '{transaction,operationalStatus}' <> 'held'
    or result #>> '{supplier,code}' <> 'sabre_polani'
    or exists (
      select 1
      from public.ticket_transactions transaction
      where transaction.id = transaction_id_value
        and (
          transaction.sale_price_source is not null
          or transaction.sale_price_gbp is not null
        )
    )
    or exists (
      select 1
      from public.ticket_passenger_fare_lines fare
      where fare.transaction_id = transaction_id_value
        and (
          fare.unit_gross_sale_price_source is not null
          or fare.unit_gross_sale_price_gbp is not null
          or fare.unit_discount_source <> 0
          or fare.unit_discount_gbp <> 0
          or fare.unit_sale_price_source is not null
          or fare.unit_sale_price_gbp is not null
        )
    )
    or exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = transaction_id_value
        and source_event.event_type in ('ticket_issued', 'ticket_sale_completed')
    )
  then
    raise exception 'Held quick entry recorded a sale or financial Commission fact';
  end if;

  replay := public.ticketing_create_quick_tk_supplied(
    '4a000000-0000-0000-0000-000000000002',
    'held-without-sale-1',
    jsonb_build_object(
      'customerName', 'Unpriced Held Passenger',
      'pnr', 'HELD-NO-SALE-1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'supplierCode', 'sabre_polani',
      'serviceType', 'TK',
      'operationalStatus', 'held',
      'bookingDate', '2026-08-31',
      'timeLimitAt', '2026-09-01T18:00',
      'issuedAt', null,
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 1,
          'unitSupplierCost', 400,
          'unitSalePrice', null,
          'unitDiscount', null
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', '[]'::jsonb,
      'attributionReason', null
    )
  );

  if (replay ->> 'idempotentReplay')::boolean is not true
    or replay #>> '{booking,id}' <> booking_id_value::text
    or replay #>> '{transaction,id}' <> transaction_id_value::text
  then
    raise exception 'Unpriced Held quick-entry replay was not idempotent';
  end if;

  package_result := public.ticketing_create_quick_tk_supplied(
    '4a000000-0000-0000-0000-000000000002',
    'package-quote-priced-issued-1',
    jsonb_build_object(
      'customerName', 'Package Quotation Passenger',
      'pnr', 'PKGPRICE1',
      'airlineId', '50000000-0000-0000-0000-000000000001',
      'supplierCode', 'sabre_polani',
      'serviceType', 'TK',
      'operationalStatus', 'issued',
      'bookingDate', '2026-08-31',
      'timeLimitAt', null,
      'issuedAt', '2026-08-31',
      'currency', 'GBP',
      'fares', jsonb_build_array(
        jsonb_build_object(
          'passengerType', 'ADT',
          'quantity', 4,
          'unitSupplierCost', 700,
          'unitSalePrice', null,
          'unitDiscount', null
        ),
        jsonb_build_object(
          'passengerType', 'YTH',
          'quantity', 1,
          'unitSupplierCost', 700,
          'unitSalePrice', null,
          'unitDiscount', null
        )
      ),
      'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
      'assistantEmployeeIds', '[]'::jsonb,
      'attributionReason', null
    )
  );
  package_transaction_id_value := (package_result #>> '{transaction,id}')::uuid;

  if package_result #>> '{packageMatch,status}' <> 'matched'
    or package_result ->> 'pricingSource' <> 'package_quote'
    or not exists (
      select 1
      from public.ticket_transactions transaction
      where transaction.id = package_transaction_id_value
        and transaction.sale_price_source = 5100
        and transaction.sale_price_gbp = 5100
    )
    or (
      select count(*)
      from public.ticket_passenger_fare_lines fare
      where fare.transaction_id = package_transaction_id_value
        and fare.passenger_type in ('ADT', 'YTH')
        and fare.unit_gross_sale_price_source = 1020
        and fare.unit_discount_source = 0
        and fare.unit_sale_price_source = 1020
    ) <> 2
    or not exists (
      select 1
      from public.commission_source_events source_event
      where source_event.source_record_id = package_transaction_id_value
        and source_event.variables ->> 'pricing_source' = 'package_quote'
        and (source_event.variables ->> 'sale_price_gbp')::numeric = 5100
    )
  then
    raise exception 'Package-issued ticket did not use quotation passenger flight prices';
  end if;

  begin
    perform public.ticketing_create_quick_tk_supplied(
      '4a000000-0000-0000-0000-000000000002',
      'issued-without-sale-rejected',
      jsonb_build_object(
        'customerName', 'Invalid Issued Passenger',
        'pnr', 'ISSUED-NO-SALE-1',
        'airlineId', '50000000-0000-0000-0000-000000000001',
        'supplierCode', 'sabre_polani',
        'serviceType', 'TK',
        'operationalStatus', 'issued',
        'bookingDate', '2026-08-31',
        'timeLimitAt', null,
        'issuedAt', '2026-08-31',
        'currency', 'GBP',
        'fares', jsonb_build_array(
          jsonb_build_object(
            'passengerType', 'ADT',
            'quantity', 1,
            'unitSupplierCost', 400,
            'unitSalePrice', null,
            'unitDiscount', null
          )
        ),
        'responsibleEmployeeId', '4a000000-0000-0000-0000-000000000002',
        'assistantEmployeeIds', '[]'::jsonb,
        'attributionReason', null
      )
    );
    raise exception 'Issued quick entry accepted missing sale values';
  exception when invalid_parameter_value then
    null;
  end;

  if (select version from public.portal_schema_versions where component = 'ticketing')
      <> 2026083101
    or public.ticketing_schema_status() ->> 'ready' <> 'true'
    or has_function_privilege(
      'authenticated',
      'public.ticketing_package_quote_pricing_2026083101(uuid)',
      'EXECUTE'
    )
  then
    raise exception 'Quotation-priced Ticketing capability was not published securely';
  end if;
end
$ticketing_unpriced_held_assertions$;
