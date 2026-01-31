#!/usr/bin/env node
/**
 * Check what tables and columns exist
 */

const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');
const path = require('path');

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
const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function checkSchema() {
  console.log('🔍 Checking database schema...\n');

  try {
    // Try to select from nadra_pricing
    const { data, error } = await supabase
      .from('nadra_pricing')
      .select('*')
      .limit(1);

    if (error) {
      console.log('❌ Error accessing nadra_pricing:');
      console.log('   Code:', error.code);
      console.log('   Message:', error.message);
      console.log('   Details:', error.details);
      console.log('   Hint:', error.hint, '\n');

      if (error.code === 'PGRST116' || error.code === '42P01') {
        console.log('Table does not exist. Tables need to be created.\n');
      }
    } else {
      console.log('✅ nadra_pricing table exists!');
      console.log('   Columns available:', Object.keys(data[0] || {}));
      console.log('   Row count:', data.length, '\n');
    }

    // Check other tables
    const tables = ['pk_passport_pricing', 'gb_passport_pricing', 'visa_pricing'];
    for (const table of tables) {
      const { data, error } = await supabase.from(table).select('*').limit(1);
      if (error) {
        console.log(`❌ ${table}: ${error.message}`);
      } else {
        console.log(`✅ ${table}: exists with ${Object.keys(data[0] || {}).length} columns`);
      }
    }

  } catch (error) {
    console.error('Error:', error.message);
  }
}

checkSchema();
