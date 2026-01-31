#!/usr/bin/env node
/**
 * Complete setup: Create tables and seed pricing data using Supabase Management API
 */

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

async function setup() {
  console.log('🚀 Setting up pricing system...\n');

  try {
    // Extract project ref from URL (e.g., https://xxx.supabase.co)
    const projectRef = supabaseUrl.match(/https:\/\/([^.]+)\.supabase\.co/)?.[1];
    
    if (!projectRef) {
      throw new Error('Could not extract project reference from Supabase URL');
    }

    console.log(`📦 Project: ${projectRef}`);
    
    // Read SQL file
    const sqlPath = path.join(__dirname, 'create-pricing-tables.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    console.log('📝 Executing SQL...\n');

    // Execute SQL using Supabase's database API
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'return=representation'
      },
      body: JSON.stringify({ sql: sqlContent })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('⚠️  RPC method not available. Using alternative approach...\n');
      
      // Alternative: Execute via pg-meta or just seed data if tables already exist
      await seedData();
      return;
    }

    const result = await response.json();
    console.log('✅ Tables created successfully!\n');
    
    // Now seed the data
    await seedData();

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n🔧 Trying to seed data anyway...\n');
    await seedData();
  }
}

async function seedData() {
  const { createClient } = require('@supabase/supabase-js');
  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // Check if data already exists
    const { count: nadraCount } = await supabase
      .from('nadra_pricing')
      .select('*', { count: 'exact', head: true });
    
    if (nadraCount > 0) {
      console.log('✅ Data already exists. Skipping seed.\n');
      const { count: pk } = await supabase.from('pk_passport_pricing').select('*', { count: 'exact', head: true });
      const { count: gb } = await supabase.from('gb_passport_pricing').select('*', { count: 'exact', head: true });
      
      console.log('📊 Current counts:');
      console.log(`  - NADRA: ${nadraCount}`);
      console.log(`  - Pakistani Passport: ${pk}`);
      console.log(`  - GB Passport: ${gb}\n`);
      return;
    }
  } catch (error) {
    if (error.code === 'PGRST116') {
      console.log('❌ Tables do not exist yet!\n');
      console.log('📋 Manual steps required:');
      console.log('1. Visit your Supabase Dashboard SQL Editor');
      console.log('2. Paste contents from: scripts/create-pricing-tables.sql');
      console.log('3. Click RUN');
      console.log('4. Run this script again\n');
      process.exit(1);
    }
    throw error;
  }
  
  console.log('🌱 Seeding pricing data...\n');
  
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

  // Insert data in batches
  const { error: nadraError } = await supabase.from('nadra_pricing').insert(nadraPricing);
  if (nadraError) throw nadraError;
  console.log('  ✅ NADRA: 30 entries');

  const { error: pkError } = await supabase.from('pk_passport_pricing').insert(pkPricing);
  if (pkError) throw pkError;
  console.log('  ✅ Pakistani Passport: 24 entries');

  const { error: gbError } = await supabase.from('gb_passport_pricing').insert(gbPricing);
  if (gbError) throw gbError;
  console.log('  ✅ GB Passport: 27 entries\n');

  console.log('🎉 Setup complete! 81 pricing entries created.\n');
}

setup();
