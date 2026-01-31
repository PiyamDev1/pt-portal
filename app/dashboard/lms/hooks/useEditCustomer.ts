'use client'

import { useState, useCallback } from 'react'
import { toast } from 'sonner'
import { API_ENDPOINTS } from '../constants'

interface FormData {
  phone: string
  email: string
  address: string
  dateOfBirth: string
  notes: string
}

interface Account {
  id: string
}

export function useEditCustomer(customer: Account, employeeId: string) {
  const [form, setForm] = useState<FormData>({
    phone: '',
    email: '',
    address: '',
    dateOfBirth: '',
    notes: ''
  })
  const [loading, setLoading] = useState(false)
  const [deleteAuthCode, setDeleteAuthCode] = useState('')
  const [deleting, setDeleting] = useState(false)

  // Memoized form update handler
  const updateForm = useCallback((updates: Partial<FormData>) => {
    setForm(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSubmit = async (
    isoDateOfBirth: string,
    onSave: () => void,
    onClose: () => void
  ) => {
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

  const handleDelete = async (
    onSave: () => void,
    onClose: () => void
  ) => {
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
      console.error('[useEditCustomer] Error deleting customer:', err)
      toast.error('Failed to delete customer. Please try again or contact support.')
    } finally {
      setDeleting(false)
    }
  }

  return {
    form,
    updateForm,
    loading,
    deleteAuthCode,
    setDeleteAuthCode,
    deleting,
    handleSubmit,
    handleDelete
  }
}
