/**
 * API Route: Loan Account Notes
 *
 * GET  /api/lms/notes?accountId=<id>
 *   Returns all notes for a loan account, with the creator's name resolved
 *   from the employees table.
 *
 * POST /api/lms/notes
 *   Adds a new note to a loan account.
 *   Body: { accountId, note, createdBy }
 *
 * DELETE /api/lms/notes
 *   Removes a specific note.
 *   Body: { noteId }
 *
 * Authentication: Service role key
 * Response Errors: 400 Missing required fields | 500 DB error
 */
import { createClient } from '@supabase/supabase-js'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!
const supabase = createClient(supabaseUrl, supabaseKey)

type EmployeeRef = { full_name?: string } | { full_name?: string }[]

type NoteRow = {
  id: string
  note: string
  created_by: string
  created_at: string
  employees?: EmployeeRef
}

const resolveEmployeeName = (employees?: EmployeeRef): string | undefined => {
  if (Array.isArray(employees)) {
    return employees[0]?.full_name
  }
  return employees?.full_name
}

// GET - Fetch notes for an account
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const accountId = searchParams.get('accountId')

    if (!accountId) {
      return apiError('Account ID required', 400)
    }

    const { data: notes, error } = await supabase
      .from('loan_account_notes')
      .select(
        `
        id,
        note,
        created_by,
        created_at,
        employees (full_name)
      `,
      )
      .eq('loan_customer_id', accountId)
      .order('created_at', { ascending: false })

    if (error) throw error

    const formattedNotes = (notes as NoteRow[] | null)?.map((n) => ({
      id: n.id,
      note: n.note,
      created_by: n.created_by,
      created_at: n.created_at,
      employee_name: resolveEmployeeName(n.employees),
    }))

    return apiOk({ notes: formattedNotes || [] })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Failed to fetch notes'), 500)
  }
}

// POST - Create a new note
export async function POST(request: Request) {
  try {
    const { accountId, note, employeeId } = await request.json()

    if (!accountId || !note || !employeeId) {
      return apiError('Missing required fields', 400)
    }

    const { data: newNote, error } = await supabase
      .from('loan_account_notes')
      .insert({
        loan_customer_id: accountId,
        note: note.trim(),
        created_by: employeeId,
        created_at: new Date().toISOString(),
      })
      .select(
        `
        id,
        note,
        created_by,
        created_at,
        employees (full_name)
      `,
      )
      .single()

    if (error) throw error

    const typedNote = newNote as NoteRow

    const formattedNote = {
      id: newNote.id,
      note: newNote.note,
      created_by: newNote.created_by,
      created_at: newNote.created_at,
      employee_name: resolveEmployeeName(typedNote.employees),
    }

    return apiOk({ note: formattedNote })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Failed to create note'), 500)
  }
}

// DELETE - Delete a note
export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const noteId = searchParams.get('noteId')

    if (!noteId) {
      return apiError('Note ID required', 400)
    }

    const { error } = await supabase.from('loan_account_notes').delete().eq('id', noteId)

    if (error) throw error

    return apiOk({ deletedNoteId: noteId })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Failed to delete note'), 500)
  }
}
