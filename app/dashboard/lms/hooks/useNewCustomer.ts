'use client'

import { useState, useEffect, useCallback } from 'react'
import { toast } from 'sonner'
import type { PaymentMethod, CustomerForm } from '../types'
import { API_ENDPOINTS } from '../constants'

interface TransactionForm {
  amount: string
  type: 'service' | 'payment' | 'fee'
  paymentMethodId: string
  notes: string
}

interface UseNewCustomerParams {
  onSave: () => void
  onClose: () => void
  employeeId: string
}

export function useNewCustomer({ onSave, onClose, employeeId }: UseNewCustomerParams) {
  const [form, setForm] = useState<CustomerForm>({
    firstName: '',
    lastName: '',
    phone: '',
    email: '',
    address: ''
  })
  const [addTransaction, setAddTransaction] = useState(false)
  const [txForm, setTxForm] = useState<TransactionForm>({
    amount: '',
    type: 'service',
    paymentMethodId: '',
    notes: ''
  })
  const [methods, setMethods] = useState<PaymentMethod[]>([])
  const [loading, setLoading] = useState(false)

  // Fetch payment methods on mount
  useEffect(() => {
    fetch(API_ENDPOINTS.PAYMENT_METHODS)
      .then(r => r.json())
      .then(d => {
        setMethods(d.methods || [])
      })
      .catch(() => {
        toast.error('Failed to load payment methods')
      })
  }, [])

  // Memoized form update handlers
  const updateForm = useCallback((updates: Partial<CustomerForm>) => {
    setForm(prev => ({ ...prev, ...updates }))
  }, [])

  const updateTxForm = useCallback((updates: Partial<TransactionForm>) => {
    setTxForm(prev => ({ ...prev, ...updates }))
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!form.firstName || !form.lastName) return toast.error('First and Last name required')
    if (addTransaction && (!txForm.amount || parseFloat(txForm.amount) <= 0)) {
      return toast.error('Valid transaction amount required')
    }

    setLoading(true)
    try {
      const res = await fetch(API_ENDPOINTS.LMS, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'create_customer',
          ...form,
          employeeId,
          initialTransaction: addTransaction ? txForm : null
        })
      })
      if (!res.ok) throw new Error('Failed')
      toast.success('Customer created!')
      onSave()
      onClose()
    } catch (err) {
      toast.error('Failed to create customer')
    } finally {
      setLoading(false)
    }
  }

  return {
    form,
    updateForm,
    addTransaction,
    setAddTransaction,
    txForm,
    updateTxForm,
    methods,
    loading,
    handleSubmit
  }
}
