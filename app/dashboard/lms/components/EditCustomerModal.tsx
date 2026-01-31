'use client'

import { memo } from 'react'
import { Save } from 'lucide-react'
import { toast } from 'sonner'
import { ModalWrapper } from './ModalWrapper'
import { LoadingSpinner } from './Skeletons'
import { Account } from '../types'
import { useEditCustomer } from '../hooks/useEditCustomer'
import { CustomerInfo, EditFormFields } from './edit-customer/CustomerForm'
import { DeleteCustomerSection } from './edit-customer/DeleteCustomerSection'

interface EditCustomerModalProps {
  customer: Account
  onClose: () => void
  onSave: () => void
  employeeId: string
}

function EditCustomerModalCore({
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
    const digits = value.replace(/\D/g, '')
    if (digits.length <= 2) return digits
    if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`
    return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`
  }

  // Validate date format (DD/MM/YYYY)
  const isValidDateFormat = (dateString: string): boolean => {
    if (!dateString) return true
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

  const {
    form,
    updateForm,
    loading,
    deleteAuthCode,
    setDeleteAuthCode,
    deleting,
    handleSubmit: hookHandleSubmit,
    handleDelete: hookHandleDelete
  } = useEditCustomer(customer, employeeId)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()

    if (!isValidDateFormat(form.dateOfBirth)) {
      toast.error('Invalid date format. Use DD/MM/YYYY (e.g., 15/03/1990)')
      return
    }

    const isoDateOfBirth = form.dateOfBirth ? formatToISODate(form.dateOfBirth) : ''
    await hookHandleSubmit(isoDateOfBirth, onSave, onClose)
  }

  const handleDelete = async () => {
    await hookHandleDelete(onSave, onClose)
  }

  // Initialize form with customer data
  const displayDateOfBirth = customer.dateOfBirth ? formatToDisplayDate(customer.dateOfBirth) : ''

  return (
    <ModalWrapper onClose={onClose} title={`Edit Customer - ${customer.name}`}>
      <form onSubmit={handleSubmit} className="space-y-3">
        <CustomerInfo customer={customer} />

        <EditFormFields
          form={{
            phone: form.phone || customer.phone || '',
            email: form.email || customer.email || '',
            address: form.address || customer.address || '',
            dateOfBirth: form.dateOfBirth || displayDateOfBirth,
            notes: form.notes || customer.notes || ''
          }}
          onFormChange={updateForm}
          onDateInput={handleDateInput}
        />

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

        <DeleteCustomerSection
          deleteAuthCode={deleteAuthCode}
          onAuthCodeChange={setDeleteAuthCode}
          onDelete={handleDelete}
          deleting={deleting}
        />
      </form>
    </ModalWrapper>
  )
}

export const EditCustomerModal = memo(EditCustomerModalCore)
