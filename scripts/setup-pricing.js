#!/usr/bin/env node
/**
 * Setup script to create pricing tables and seed initial data
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load environment variables manually
function loadEnv() {
  try {
    const envPath = path.join(__dirname, '..', '.env.local');
    const envContent = fs.readFileSync(envPath, 'utf8');
    envContent.split('\n').forEach(line => {
      const match = line.match(/^([^=]+)=(.*)$/);
      if (match) {
        process.env[match[1]] = match[2].replace(/^["']|["']$/g, '');
      }
    });
  } catch (error) {
    console.error('Could not load .env.local');
  }
}

loadEnv();

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials in .env.local');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function setupPricingTables() {
  console.log('🚀 Starting pricing tables setup...\n');

  try {
    // Step 1: Check if tables exist
    console.log('📊 Checking existing tables...');
    const { data: nadraCheck } = await supabase.from('nadra_pricing').select('count()').limit(1);
    
    if (nadraCheck) {
      console.log('✅ Pricing tables already exist!\n');
    } else {
      console.log('⚠️  Tables not found. Please create them in Supabase SQL Editor first.');
      console.log('📄 Run this SQL: scripts/create-pricing-tables.sql\n');
      process.exit(1);
    }

    // Step 2: Check current counts
    const [nadra, pk, gb, visa] = await Promise.all([
      supabase.from('nadra_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('pk_passport_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('gb_passport_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('visa_pricing').select('count()', { count: 'exact', head: true })
    ]);

    console.log('📈 Current record counts:');
    console.log(`  - NADRA: ${nadra.count || 0}`);
    console.log(`  - Pakistani Passport: ${pk.count || 0}`);
    console.log(`  - GB Passport: ${gb.count || 0}`);
    console.log(`  - Visa: ${visa.count || 0}\n`);

    if (nadra.count > 0 || pk.count > 0 || gb.count > 0) {
      console.log('⚠️  Data already exists. Skipping seed.');
      console.log('✅ Setup complete!\n');
      return;
    }

    // Step 3: Seed data using the API endpoint
    console.log('🌱 Seeding pricing data...');
    
    const nadraPricing = [
      { service_type: 'NICOP/CNIC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'NICOP/CNIC', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'POC', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'FRC', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'CRC', service_option: 'Cancellation', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Normal', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Executive', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Upgrade to Fast', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Modification', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Reprint', cost_price: 0, sale_price: 0 },
      { service_type: 'POA', service_option: 'Cancellation', cost_price: 0, sale_price: 0 }
    ];

    const pkPricing = [
      { category: 'Adult 10 Year', speed: 'Normal', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Normal', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Normal', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Normal', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Executive', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Executive', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Executive', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Adult 10 Year', speed: 'Executive', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Normal', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Normal', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Normal', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Normal', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Executive', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Executive', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Executive', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Adult 5 Year', speed: 'Executive', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Normal', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Normal', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Normal', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Normal', application_type: 'Lost', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Executive', application_type: 'First Time', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Executive', application_type: 'Renewal', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Executive', application_type: 'Modification', cost_price: 0, sale_price: 0 },
      { category: 'Child 5 Year', speed: 'Executive', application_type: 'Lost', cost_price: 0, sale_price: 0 }
    ];

    const gbPricing = [
      { age_group: 'Adult', pages: '32', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '32', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '32', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '48', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '48', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '48', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '52', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '52', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Adult', pages: '52', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '32', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '32', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '32', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '48', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '48', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '48', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '52', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '52', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Child', pages: '52', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '32', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '32', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '32', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '48', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '48', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '48', service_type: 'Premium', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '52', service_type: 'Standard', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '52', service_type: 'Express', cost_price: 0, sale_price: 0 },
      { age_group: 'Infant', pages: '52', service_type: 'Premium', cost_price: 0, sale_price: 0 }
    ];

    // Insert data
    await supabase.from('nadra_pricing').insert(nadraPricing);
    await supabase.from('pk_passport_pricing').insert(pkPricing);
    await supabase.from('gb_passport_pricing').insert(gbPricing);

    console.log('✅ Seeded 30 NADRA pricing entries');
    console.log('✅ Seeded 24 Pakistani Passport pricing entries');
    console.log('✅ Seeded 27 GB Passport pricing entries\n');

    // Verify
    const [nadraFinal, pkFinal, gbFinal] = await Promise.all([
      supabase.from('nadra_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('pk_passport_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('gb_passport_pricing').select('count()', { count: 'exact', head: true })
    ]);

    console.log('🎉 Setup complete!');
    console.log('📊 Final counts:');
    console.log(`  - NADRA: ${nadraFinal.count}`);
    console.log(`  - Pakistani Passport: ${pkFinal.count}`);
    console.log(`  - GB Passport: ${gbFinal.count}\n`);

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.code === 'PGRST116' || error.message.includes('does not exist')) {
      console.log('\n📝 Next steps:');
      console.log('1. Go to: https://supabase.com/dashboard/project/_/sql');
      console.log('2. Create new query');
      console.log('3. Copy and paste contents of: scripts/create-pricing-tables.sql');
      console.log('4. Click RUN');
      console.log('5. Re-run this script\n');
    }
    
    process.exit(1);
  }
}

setupPricingTables();
