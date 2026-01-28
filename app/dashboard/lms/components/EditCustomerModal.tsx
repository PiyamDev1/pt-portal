'use client'

import { useState, useCallback } from 'react'
import { AlertTriangle, Phone, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { ModalWrapper } from './ModalWrapper'
import { LoadingSpinner } from './Skeletons'
import { Account } from '../types'
import { API_ENDPOINTS } from '../constants'

interface EditCustomerModalProps {
  customer: Account
  onClose: () => void
  onSave: () => void
  employeeId: string
}

/**
 * Edit Customer Modal - Update customer details and delete customer
 */
export function EditCustomerModal({
  customer,
  onClose,
  onSave,
  employeeId
}: EditCustomerModalProps) {
  // Date format conversion utilities
  const formatToDisplayDate = (isoDate: string): string => {
    if (!isoDate) return ''
    const [year, month, day] = isoDate.split('-')
    return `${day}/${month}/${year}`
  }

  const formatToISODate = (displayDate: string): string => {
    if (!displayDate) return ''
    const parts = displayDate.split('/')
    if (parts.length !== 3) return ''
    const [day, month, year] = parts
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`
  }

  // Auto-format date input (DD/MM/YYYY)
  const handleDateInput = (value: string): string => {
    // Remove all non-digit characters
    const digits = value.replace(/\D/g, '')
    
    // Format as DD/MM/YYYY
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
  }

  // Validate date format (DD/MM/YYYY)
  const isValidDateFormat = (dateString: string): boolean => {
    if (!dateString) return true // Empty is valid
    const dateRegex = /^\d{2}\/\d{2}\/\d{4}$/
    if (!dateRegex.test(dateString)) return false
    
    const parts = dateString.split('/')
    const day = parseInt(parts[0])
    const month = parseInt(parts[1])
    const year = parseInt(parts[2])
    
    if (month < 1 || month > 12) return false
    if (day < 1 || day > 31) return false
    
    const date = new Date(`${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`)
    return date instanceof Date && !isNaN(date.getTime())
  }

  const displayDateOfBirth = customer.dateOfBirth ? formatToDisplayDate(customer.dateOfBirth) : ''
  const [form, setForm] = useState({
    phone: customer.phone || '',
    email: customer.email || '',
    address: customer.address || '',
    dateOfBirth: displayDateOfBirth,
    notes: customer.notes || ''
  })
  const [loading, setLoading] = useState(false)
  const [deleteAuthCode, setDeleteAuthCode] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Memoized form update handler
  const updateForm = useCallback((updates: Partial<typeof form>) => {
    setForm(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    // Validate date format
    if (!isValidDateFormat(form.dateOfBirth)) {
      toast.error('Invalid date format. Use DD/MM/YYYY (e.g., 15/03/1990)')
      return
    }

    // Convert display date to ISO format
    const isoDateOfBirth = form.dateOfBirth ? formatToISODate(form.dateOfBirth) : ''

    setLoading(true)
    try {
      const res = await fetch(API_ENDPOINTS.LMS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'update_customer',
          customerId: customer.id,
          phone: form.phone,
          email: form.email,
          address: form.address,
          dateOfBirth: isoDateOfBirth,
          notes: form.notes,
          employeeId
        })
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Customer updated!')
      onSave()
      onClose()
    } catch (err) {
      toast.error('Failed to update customer')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteAuthCode.trim()) {
      toast.error('Auth code required for deletion')
      return
    }

    setDeleting(true)
    try {
      const res = await fetch(API_ENDPOINTS.LMS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'delete_customer',
          customerId: customer.id,
          authCode: deleteAuthCode.trim(),
          userId: employeeId
        })
      })

      const data = await res.json()
      if (!res.ok) throw new Error(data.error || 'Delete failed')

      toast.success('Customer deleted')
      onSave()
      onClose()
    } catch (err: unknown) {
      const error = err as { message?: string }
      toast.error(error.message || 'Failed to delete customer')
    } finally {
      setDeleting(false)
    }
  }

  return (
    <ModalWrapper onClose={onClose} title={`Edit Customer - ${customer.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <div className="bg-slate-50 p-3 rounded-lg mb-4">
          <div className="text-sm font-bold text-slate-700">{customer.name}</div>
          <div className="text-xs text-slate-500">ID: {customer.id.substring(0, 8)}</div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Phone Number
          </label>
          <div className="relative">
            <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
            <input
              type="tel"
              placeholder="Phone number"
              value={form.phone}
              onChange={e => updateForm({ phone: e.target.value })}
              className="w-full pl-10 p-3 border rounded-lg"
            />
          </div>
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Email Address
          </label>
          <input
            type="email"
            placeholder="Email"
            value={form.email}
            onChange={e => updateForm({ email: e.target.value })}
            className="w-full p-3 border rounded-lg"
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Address
          </label>
          <textarea
            placeholder="Full address"
            value={form.address}
            onChange={e => updateForm({ address: e.target.value })}
            className="w-full p-3 border rounded-lg"
            rows={2}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Date of Birth (DD/MM/YYYY)
          </label>
          <input
            type="text"
            placeholder="DD/MM/YYYY"
            value={form.dateOfBirth}
            onChange={e => updateForm({ dateOfBirth: handleDateInput(e.target.value) })}
            className="w-full p-3 border rounded-lg"
            maxLength={10}
          />
        </div>

        <div>
          <label className="text-xs font-bold text-slate-500 uppercase mb-1 block">
            Key Notes
          </label>
          <textarea
            placeholder="Important notes about this customer..."
            value={form.notes}
            onChange={e => updateForm({ notes: e.target.value })}
            className="w-full p-3 border rounded-lg"
            rows={3}
          />
        </div>

        <div className="flex gap-2 pt-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={loading}
            className="flex-1 px-4 py-3 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <LoadingSpinner size="sm" /> : <Save className="w-4 h-4" />}
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="mt-4 p-3 border border-red-200 rounded-lg bg-red-50">
          <div className="flex items-start gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600 mt-0.5" />
            <div className="flex-1 space-y-2">
              <div className="text-sm font-bold text-red-800">Delete Customer</div>
              <p className="text-xs text-red-700">
                Enter your Google Authenticator code to permanently delete this customer and all
                related records.
              </p>
              <input
                type="text"
                value={deleteAuthCode}
                onChange={e => setDeleteAuthCode(e.target.value)}
                placeholder="Auth Code"
                className="w-full p-2 border border-red-200 rounded-lg focus:border-red-500"
              />
              <button
                type="button"
                disabled={deleting}
                onClick={handleDelete}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white font-bold rounded-lg transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {deleting ? <LoadingSpinner size="sm" /> : <Trash2 className="w-4 h-4" />}
                {deleting ? 'Deleting...' : 'Delete Customer'}
              </button>
            </div>
          </div>
        </div>
      </form>
    </ModalWrapper>
  )
}
