'use client'

import { useState, useEffect } from 'react'
import { toast } from 'sonner'

interface Installment {
  id: string
  installment_number: number
  due_date: string
  amount: number
  status: string
  amount_paid: number
}

interface Transaction {
  id: string
  amount: number
}

export function useInstallmentManagement(transaction: Transaction) {
  const [loading, setLoading] = useState(false)
  const [installments, setInstallments] = useState<Installment[]>([])
  const [editedInstallments, setEditedInstallments] = useState<Installment[]>([])
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchInstallments()
  }, [transaction.id])

  const fetchInstallments = async () => {
    try {
      const res = await fetch(`/api/lms/installments?transactionId=${transaction.id}`)
      if (res.ok) {
        const data = await res.json()
        const inst = data.installments || []
        setInstallments(inst)
        setEditedInstallments(JSON.parse(JSON.stringify(inst))) // Deep copy
      }
    } catch (err) {
      // Silently fail - error boundary will handle
    }
  }

  const handleInstallmentChange = (index: number, field: 'due_date' | 'amount', value: string) => {
    const updated = [...editedInstallments]
    if (field === 'due_date') {
      updated[index].due_date = value
    } else if (field === 'amount') {
      updated[index].amount = parseFloat(value) || 0
    }
    setEditedInstallments(updated)
  }

  const handleSaveSchedule = async () => {
    // Validate changes
    const hasChanges = editedInstallments.some((edited, idx) => {
      const original = installments[idx]
      return edited.due_date !== original.due_date || edited.amount !== original.amount
    })

    if (!hasChanges) {
      toast.info('No changes to save')
      return
    }

    // Validate amounts
    const totalAmount = editedInstallments.reduce((sum, inst) => sum + inst.amount, 0)
    const serviceAmount = parseFloat(transaction.amount as any)
    
    if (Math.abs(totalAmount - serviceAmount) > 0.01) {
      toast.error(`Total installments (£${totalAmount.toFixed(2)}) must equal service amount (£${serviceAmount.toFixed(2)})`)
      return
    }

    setSaving(true)
    try {
      const res = await fetch('/api/lms/update-installments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ installments: editedInstallments })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to update')
      }

      toast.success(`Updated ${data.updated.length} installment(s)`)
      await fetchInstallments()
      return true
    } catch (err: any) {
      toast.error(err.message || 'Failed to save changes')
      return false
    } finally {
      setSaving(false)
    }
  }

  const handleCancelEdit = () => {
    setEditedInstallments(JSON.parse(JSON.stringify(installments)))
  }

  const handleDelete = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/lms/delete-installment-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transactionId: transaction.id })
      })

      const data = await res.json()

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete')
      }

      toast.success('Service charge deleted and balance updated')
      return true
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete')
      setLoading(false)
      return false
    }
  }

  const totalInstallments = installments.length
  const paidInstallments = installments.filter(i => i.status === 'paid').length
  const canModify = paidInstallments === 0

  return {
    loading,
    installments,
    editedInstallments,
    saving,
    totalInstallments,
    paidInstallments,
    canModify,
    handleInstallmentChange,
    handleSaveSchedule,
    handleCancelEdit,
    handleDelete,
    fetchInstallments
  }
}
