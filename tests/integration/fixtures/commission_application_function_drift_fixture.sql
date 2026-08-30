-- Recreate the legacy profile function with equivalent but deliberately
-- different list formatting. Production databases may preserve definitions
-- created through the dashboard or an earlier repair with this kind of drift.

do $application_profile_function_drift$
declare
  signature constant regprocedure :=
    'public.commission_create_employee_profile_2026082904(uuid,uuid,text,date,uuid,uuid,jsonb,text,text)'::regprocedure;
  definition text;
  updated_definition text;
begin
  definition := replace(pg_get_functiondef(signature), E'\r\n', E'\n');
  updated_definition := regexp_replace(
    definition,
    $pattern$service_code_value[[:space:]]+not[[:space:]]+in[[:space:]]*\([^)]*'sales_bonus'[^)]*\)$pattern$,
    $replacement$service_code_value not in (
        'tk_primary','tk_assistance','dc','r_er',
        'low_fare',  'higher_fare','package_sale',  'sales_bonus'
      )$replacement$
  );
  updated_definition := regexp_replace(
    updated_definition,
    $pattern$lower\(btrim\(service[[:space:]]*->>[[:space:]]*'recipientRole'\)\)[[:space:]]+not[[:space:]]+in[[:space:]]*\([^)]*'sales_bonus'[^)]*\)$pattern$,
    $replacement$lower(btrim(service ->> 'recipientRole')) not in (
        'primary','assistant','low_fare_actor','package_sales',  'sales_bonus'
      )$replacement$
  );
  updated_definition := replace(
    updated_definition,
    $old$service_code_value <> 'package_sale'$old$,
    $new$service_code_value  <>  'package_sale'$new$
  );

  if updated_definition = definition then
    raise exception 'Application profile drift fixture did not alter the function definition';
  end if;
  execute updated_definition;
end
$application_profile_function_drift$;
