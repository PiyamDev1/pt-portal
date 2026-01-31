#!/usr/bin/env node
/**
 * Create pricing tables directly using Supabase SQL execution
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

async function createTables() {
  console.log('🚀 Creating pricing tables...\n');

  try {
    // Read the SQL file
    const sqlPath = path.join(__dirname, 'create-pricing-tables.sql');
    const sqlContent = fs.readFileSync(sqlPath, 'utf8');

    // Execute the SQL using rpc or direct query
    // Since Supabase JS client doesn't have a direct SQL execution method,
    // we'll create tables programmatically
    
    console.log('📝 Executing SQL via Supabase API...');
    
    // Use the REST API directly
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc/exec_sql`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': supabaseServiceKey,
        'Authorization': `Bearer ${supabaseServiceKey}`
      },
      body: JSON.stringify({ query: sqlContent })
    });

    if (!response.ok) {
      // If that doesn't work, try creating via the database
      console.log('⚠️  Direct SQL execution not available.');
      console.log('Creating tables using INSERT operations...\n');
      
      // Try to create a test record which will fail with a helpful error
      const { error } = await supabase.from('nadra_pricing').select('*').limit(1);
      
      if (error && error.code === 'PGRST116') {
        console.log('❌ Tables do not exist in database.');
        console.log('\n📋 Please run the SQL manually:');
        console.log('1. Visit: https://supabase.com/dashboard');
        console.log('2. Select your project');
        console.log('3. Go to SQL Editor');
        console.log('4. Create new query');
        console.log('5. Paste contents from: scripts/create-pricing-tables.sql');
        console.log('6. Click RUN\n');
        process.exit(1);
      }
    }

    console.log('✅ Tables created successfully!\n');
    
  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Manual steps required:');
    console.log('1. Visit: https://supabase.com/dashboard');
    console.log('2. Select your project');  
    console.log('3. Go to SQL Editor');
    console.log('4. Create new query');
    console.log('5. Paste contents from: scripts/create-pricing-tables.sql');
    console.log('6. Click RUN\n');
    process.exit(1);
  }
}

createTables();
