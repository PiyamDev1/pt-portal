import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'
import bcrypt from 'bcrypt'

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
)

function makeCode() {
  // 8 char groups like: AB12-CD34
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ23456789'
  const pick = (n) => Array.from({length:n}, () => chars[Math.floor(Math.random()*chars.length)]).join('')
  return `${pick(4)}-${pick(4)}`
}

export async function POST(request) {
  try {
    const { userId, count = 10 } = await request.json()
    if (!userId) return NextResponse.json({ error: 'userId required' }, { status: 400 })

    const codesPlain = []
    const rows = []
    for (let i=0;i<count;i++) {
      const code = makeCode()
      const hash = await bcrypt.hash(code, 12)
      codesPlain.push(code)
      rows.push({ employee_id: userId, code_hash: hash, used: false })
    }

    // remove existing unused codes for user and insert new set
    await supabaseAdmin.from('backup_codes').delete().eq('employee_id', userId)
    const { error } = await supabaseAdmin.from('backup_codes').insert(rows)
    if (error) {
      console.error('Failed to insert backup codes', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    // Return plaintext codes once (should be presented to user and not stored client-side permanently)
    return NextResponse.json({ success: true, codes: codesPlain }, { status: 200 })
  } catch (e) {
    console.error('generate-backup-codes error', e)
    return NextResponse.json({ error: e.message || String(e) }, { status: 500 })
  }
}
