#!/usr/bin/env node
const fs = require('fs');
const { createClient } = require('@supabase/supabase-js');

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('❌ Missing Supabase credentials');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

async function runSeed() {
  try {
    console.log('📚 Reading seed script...');
    const sql = fs.readFileSync('./scripts/seed-pricing-data.sql', 'utf8');
    
    console.log('🚀 Executing SQL...');
    const { error } = await supabase.rpc('exec_sql', { sql_text: sql }).catch(() => null);
    
    if (error) {
      // Try alternative approach: split by semicolon and execute individual statements
      console.log('📝 Executing statements individually...');
      const statements = sql
        .split(';')
        .map(s => s.trim())
        .filter(s => s.length > 0 && !s.startsWith('--'));
      
      let count = 0;
      for (const statement of statements) {
        const { error: err } = await supabase.rpc('exec_sql', { sql_text: statement + ';' }).catch(() => ({ error: null }));
        if (!err) {
          count++;
        }
      }
      
      console.log(`✅ Seeded ${count} statements`);
    } else {
      console.log('✅ Seeding completed successfully!');
    }
    
    // Verify by checking the pricing table counts
    console.log('\n📊 Verifying seed data...');
    
    const [nadra, pk, gb] = await Promise.all([
      supabase.from('nadra_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('pk_passport_pricing').select('count()', { count: 'exact', head: true }),
      supabase.from('gb_passport_pricing').select('count()', { count: 'exact', head: true })
    ]);
    
    console.log(`  NADRA entries: ${nadra.count || 0}`);
    console.log(`  Pakistani Passport entries: ${pk.count || 0}`);
    console.log(`  GB Passport entries: ${gb.count || 0}`);
    
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
}

runSeed();
