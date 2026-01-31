'use client'

import { useState, useEffect, useCallback } from 'react'
import { StickyNote, X, Plus, Trash2 } from 'lucide-react'
import { ModalWrapper } from './ModalWrapper'
import { ConfirmationModal } from './ConfirmationModal'
import { toast } from 'sonner'

interface AccountNote {
  id: string
  note: string
  created_by: string
  created_at: string
  employee_name?: string
}

interface AccountNotesModalProps {
  accountId: string
  accountName: string
  employeeId: string
  onClose: () => void
}

export function AccountNotesModal({ accountId, accountName, employeeId, onClose }: AccountNotesModalProps) {
  const [notes, setNotes] = useState<AccountNote[]>([])
  const [loading, setLoading] = useState(true)
  const [newNote, setNewNote] = useState('')
  const [saving, setSaving] = useState(false)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)

  const fetchNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/lms/notes?accountId=${accountId}`)
      if (res.ok) {
        const data = await res.json()
        setNotes(data.notes || [])
      }
    } catch (err) {
      console.error('Failed to fetch notes:', err)
      toast.error('Failed to load notes')
    } finally {
      setLoading(false)
    }
  }, [accountId])

  useEffect(() => {
    fetchNotes()
  }, [fetchNotes])

  const handleAddNote = async () => {
    if (!newNote.trim()) {
      toast.error('Please enter a note')
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/lms/notes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          note: newNote.trim(),
          employeeId
        })
      })

      if (!res.ok) throw new Error('Failed to save note')

      const data = await res.json()
      setNotes([data.note, ...notes])
      setNewNote('')
      toast.success('Note added')
    } catch (err: any) {
      toast.error(err.message || 'Failed to save note')
    } finally {
      setSaving(false)
    }
  }

  const handleDeleteNote = async (noteId: string) => {
    try {
      const res = await fetch(`/api/lms/notes?noteId=${noteId}`, {
        method: 'DELETE'
      })

      if (!res.ok) throw new Error('Failed to delete note')

      setNotes(notes.filter(n => n.id !== noteId))
      toast.success('Note deleted')
      setDeleteConfirmId(null)
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete note')
    }
  }

  return (
    <ModalWrapper onClose={onClose} title={`Notes - ${accountName}`}>
      <div className="space-y-4">
        {/* Add New Note */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <label htmlFor="new-note" className="block text-sm font-semibold text-slate-700 mb-2">Add New Note</label>
          <textarea
            id="new-note"
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Enter note about this account..."
            className="w-full px-3 py-2 border border-slate-300 rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
            rows={3}
            disabled={saving}
          />
          <button
            onClick={handleAddNote}
            disabled={saving || !newNote.trim()}
            className="mt-2 w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white rounded-lg font-medium transition-colors flex items-center justify-center gap-2"
            type="button"
          >
            <Plus className="w-4 h-4" />
            {saving ? 'Saving...' : 'Add Note'}
          </button>
        </div>

        {/* Notes List */}
        <div className="space-y-2">
          <h3 className="text-sm font-semibold text-slate-700 flex items-center gap-2">
            <StickyNote className="w-4 h-4" />
            Previous Notes ({notes.length})
          </h3>

          {loading ? (
            <div className="text-center py-8 text-slate-400" role="status" aria-live="polite">Loading notes...</div>
          ) : notes.length === 0 ? (
            <div className="text-center py-8 text-slate-400 text-sm">
              No notes yet. Add one above to get started.
            </div>
          ) : (
            <div className="max-h-96 overflow-y-auto space-y-2">
              {notes.map((note) => (
                <div key={note.id} className="bg-white border border-slate-200 rounded-lg p-3">
                  <div className="flex justify-between items-start gap-2 mb-2">
                    <div className="flex-1">
                      <p className="text-xs text-slate-500">
                        {note.employee_name || 'Unknown'} •{' '}
                        {new Date(note.created_at).toLocaleString('en-GB', {
                          day: '2-digit',
                          month: '2-digit',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                    </div>
                    <button
                      onClick={() => setDeleteConfirmId(note.id)}
                      className="text-red-600 hover:text-red-700 p-1"
                      title="Delete note"
                      type="button"
                      aria-label="Delete note"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                  <p className="text-sm text-slate-700 whitespace-pre-wrap">{note.note}</p>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Delete Confirmation */}
        <ConfirmationModal
          isOpen={deleteConfirmId !== null}
          title="Delete Note"
          message="Delete this note? This action cannot be undone."
          confirmText="Delete"
          cancelText="Cancel"
          isDangerous={true}
          onConfirm={async () => {
            if (deleteConfirmId) {
              await handleDeleteNote(deleteConfirmId)
            }
          }}
          onCancel={() => setDeleteConfirmId(null)}
        />
      </div>
    </ModalWrapper>
  )
}
