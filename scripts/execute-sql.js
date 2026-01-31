#!/usr/bin/env node
/**
 * Execute SQL directly via Supabase postgREST
 */

const fs = require('fs');
const path = require('path');

const supabaseUrl = 'https://ckubfbjfjbhuotyfwmac.supabase.co';
const serviceKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImNrdWJmYmpmamJodW90eWZ3bWFjIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc1ODk4NjU3OCwiZXhwIjoyMDc0NTYyNTc4fQ.yTfYYA4RYZCgGS-4oJrwnLeBJF2DiAeYijaOdiE_ips';

async function executeSql() {
  console.log('🚀 Creating pricing tables via SQL...\n');

  try {
    // Read SQL file
    const sqlPath = path.join(__dirname, 'create-pricing-tables.sql');
    let sqlContent = fs.readFileSync(sqlPath, 'utf8');
    
    // Clean up SQL - remove comments and split by statement
    const statements = sqlContent
      .split(';')
      .map(s => s.trim())
      .filter(s => s.length > 0 && !s.startsWith('--'));

    console.log(`📝 Executing ${statements.length} SQL statements...\n`);

    // Execute using curl (more reliable for raw SQL)
    const sqlFile = path.join(__dirname, 'temp-create-tables.sql');
    fs.writeFileSync(sqlFile, sqlContent);
    
    // Use psql if available, otherwise provide instructions
    const { execSync } = require('child_process');
    
    // Try to detect if we can use psql
    try {
      const psqlVersion = execSync('which psql', { encoding: 'utf8' }).trim();
      
      if (psqlVersion) {
        console.log('✅ Found psql, executing SQL...\n');
        
        // Extract connection details
        const projectRef = 'ckubfbjfjbhuotyfwmac';
        const dbHost = `db.${projectRef}.supabase.co`;
        
        console.log('❌ Direct psql connection requires database password.');
        console.log('Using alternative method...\n');
      }
    } catch (e) {
      // psql not found
    }

    // Use the Management API
    console.log('📡 Using Supabase Management API...\n');
    
    const response = await fetch(`${supabaseUrl}/rest/v1/rpc`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': serviceKey,
        'Authorization': `Bearer ${serviceKey}`,
        'Prefer': 'params=single-object'
      },
      body: JSON.stringify({
        name: 'exec_sql',
        params: { query: sqlContent }
      })
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.log('⚠️  Management API not available.');
      console.log('Response:', response.status, errorText, '\n');
      
      // Final fallback: provide manual instructions
      console.log('📋 Please execute SQL manually:');
      console.log('1. Visit: https://supabase.com/dashboard/project/ckubfbjfjbhuotyfwmac/sql/new');
      console.log('2. Copy contents from: scripts/create-pricing-tables.sql');
      console.log('3. Paste into SQL Editor');
      console.log('4. Click RUN\n');
      console.log('Then run: node scripts/setup-complete.js\n');
      
      fs.unlinkSync(sqlFile);
      process.exit(1);
    }

    const result = await response.json();
    console.log('✅ SQL executed successfully!');
    console.log('Result:', result, '\n');
    
    fs.unlinkSync(sqlFile);
    
    // Now seed the data
    console.log('🌱 Now running seed script...\n');
    execSync('node scripts/setup-complete.js', { stdio: 'inherit' });

  } catch (error) {
    console.error('❌ Error:', error.message);
    console.log('\n📋 Manual steps:');
    console.log('1. Visit: https://supabase.com/dashboard/project/ckubfbjfjbhuotyfwmac/sql/new');
    console.log('2. Copy contents from: scripts/create-pricing-tables.sql');
    console.log('3. Paste and click RUN');
    console.log('4. Then run: node scripts/setup-complete.js\n');
    process.exit(1);
  }
}

executeSql();
