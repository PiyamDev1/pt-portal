#!/usr/bin/env node
/**
 * Direct table creation and seeding using Supabase service role
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

// Load env
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
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

async function setupComplete() {
  console.log('🚀 Setting up pricing tables and data...\n');

  try {
    // Step 1: Create tables using raw SQL via REST API
    console.log('📝 Creating tables...');
    
    const sqlFile = path.join(__dirname, 'create-pricing-tables.sql');
    const sql = fs.readFileSync(sqlFile, 'utf8');
    
    // Execute via direct fetch to postgREST
    const createResponse = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`,
        'Prefer': 'params=single-object'
      },
      body: JSON.stringify({ query: sql })
    });

    if (!createResponse.ok && createResponse.status !== 404) {
      const errorText = await createResponse.text();
      console.log('⚠️  Warning:', createResponse.status, errorText);
      console.log('Attempting alternative method...\n');
    }

    // Step 2: Try creating via individual inserts (tables should exist or we'll get error)
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

    // Check if data exists
    const { count: existingNadra } = await supabase
      .from('nadra_pricing')
      .select('*', { count: 'exact', head: true });

    if (existingNadra && existingNadra > 0) {
      console.log('✅ Data already exists!');
      console.log(`   NADRA: ${existingNadra} entries\n`);
      
      const [pk, gb] = await Promise.all([
        supabase.from('pk_passport_pricing').select('*', { count: 'exact', head: true }),
        supabase.from('gb_passport_pricing').select('*', { count: 'exact', head: true })
      ]);
      
      console.log(`   PK Passport: ${pk.count || 0} entries`);
      console.log(`   GB Passport: ${gb.count || 0} entries\n`);
      return;
    }

    // Insert data
    console.log('  Inserting NADRA pricing...');
    const { error: nadraError } = await supabase
      .from('nadra_pricing')
      .insert(nadraPricing);
    
    if (nadraError) throw new Error(`NADRA: ${nadraError.message}`);
    console.log('  ✅ NADRA: 30 entries');

    console.log('  Inserting PK Passport pricing...');
    const { error: pkError } = await supabase
      .from('pk_passport_pricing')
      .insert(pkPricing);
    
    if (pkError) throw new Error(`PK Passport: ${pkError.message}`);
    console.log('  ✅ PK Passport: 24 entries');

    console.log('  Inserting GB Passport pricing...');
    const { error: gbError } = await supabase
      .from('gb_passport_pricing')
      .insert(gbPricing);
    
    if (gbError) throw new Error(`GB Passport: ${gbError.message}`);
    console.log('  ✅ GB Passport: 27 entries\n');

    console.log('🎉 Setup complete! 81 pricing entries created.\n');

  } catch (error) {
    console.error('❌ Error:', error.message);
    
    if (error.message?.includes('does not exist') || error.code === 'PGRST116' || error.code === '42P01') {
      console.log('\n⚠️  Tables not found. Creating them now via REST API...\n');
      
      // Execute SQL directly via HTTP
      const sqlFile = path.join(__dirname, 'create-pricing-tables.sql');
      const sql = fs.readFileSync(sqlFile, 'utf8');
      
      // Try posting to the database directly
      const dbResponse = await fetch(`${supabaseUrl}/rest/v1/`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'apikey': supabaseServiceKey,
          'Authorization': `Bearer ${supabaseServiceKey}`,
          'X-SQL-Query': sql
        }
      });

      console.log('SQL execution response:', dbResponse.status);
      
      if (!dbResponse.ok) {
        console.log('\n📋 Please run this SQL in Supabase Dashboard:');
        console.log('1. Go to: https://supabase.com/dashboard/project/ckubfbjfjbhuotyfwmac/sql/new');
        console.log('2. Paste SQL from: scripts/create-pricing-tables.sql');
        console.log('3. Click RUN');
        console.log('4. Then run this script again\n');
      }
    }
    
    process.exit(1);
  }
}

setupComplete();
