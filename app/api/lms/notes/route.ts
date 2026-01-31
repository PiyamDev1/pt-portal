import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

// GET - Fetch notes for an account
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')

    if (!accountId) {
      return NextResponse.json({ error: 'Account ID required' }, { status: 400 })
    }

    const { data: notes, error } = await supabase
      .from('loan_account_notes')
      .select(`
        id,
        note,
        created_by,
        created_at,
        employees (full_name)
      `)
      .eq('loan_customer_id', accountId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const formattedNotes = notes?.map((n: any) => ({
      id: n.id,
      note: n.note,
      created_by: n.created_by,
      created_at: n.created_at,
      employee_name: Array.isArray(n.employees) ? n.employees[0]?.full_name : n.employees?.full_name
    }))

    return NextResponse.json({ notes: formattedNotes || [] })
  } catch (error: any) {
    console.error('[NOTES API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// POST - Create a new note
export async function POST(request: Request) {
  try {
    const { accountId, note, employeeId } = await request.json()

    if (!accountId || !note || !employeeId) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    const { data: newNote, error } = await supabase
      .from('loan_account_notes')
      .insert({
        loan_customer_id: accountId,
        note: note.trim(),
        created_by: employeeId,
        created_at: new Date().toISOString()
      })
      .select(`
        id,
        note,
        created_by,
        created_at,
        employees (full_name)
      `)
      .single()

    if (error) throw error

    const formattedNote = {
      id: newNote.id,
      note: newNote.note,
      created_by: newNote.created_by,
      created_at: newNote.created_at,
      employee_name: Array.isArray((newNote as any).employees) ? (newNote as any).employees[0]?.full_name : (newNote as any).employees?.full_name
    }

    return NextResponse.json({ note: formattedNote })
  } catch (error: any) {
    console.error('[NOTES API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

// DELETE - Delete a note
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const noteId = searchParams.get('noteId')

    if (!noteId) {
      return NextResponse.json({ error: 'Note ID required' }, { status: 400 })
    }

    const { error } = await supabase
      .from('loan_account_notes')
      .delete()
      .eq('id', noteId)

    if (error) throw error

    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('[NOTES API] Error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
