import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function checkMigration() {
  console.log("Checking migration status...\n");

  // Check NADRA tables
  const nadraTypes = await supabase.from("nadra_service_types").select("*");
  console.log("nadra_service_types count:", nadraTypes.data?.length || 0);
  if (nadraTypes.data?.length) console.log("Sample:", nadraTypes.data[0]);

  const nadraOptions = await supabase.from("nadra_service_options").select("*").limit(3);
  console.log("\nnadra_service_options count:", nadraOptions.data?.length || 0);
  if (nadraOptions.data?.length) console.log("Sample:", nadraOptions.data[0]);

  // Check Pricing tables
  const nadraPricing = await supabase.from("nadra_pricing").select("*").limit(3);
  console.log("\nnadra_pricing count:", nadraPricing.data?.length || 0);

  const pkPricing = await supabase.from("pk_passport_pricing").select("*").limit(3);
  console.log("pk_passport_pricing count:", pkPricing.data?.length || 0);

  // Check GB Passport tables
  const gbPricing = await supabase.from("gb_passport_pricing").select("*").limit(3);
  console.log("gb_passport_pricing count:", gbPricing.data?.length || 0);

  // Check if visa pricing table exists
  const visaPricing = await supabase.from("visa_pricing").select("*").limit(1);
  console.log("\nvisa_pricing exists:", !visaPricing.error, "(error:", visaPricing.error?.message || "none", ")");
}

checkMigration().catch(console.error);
