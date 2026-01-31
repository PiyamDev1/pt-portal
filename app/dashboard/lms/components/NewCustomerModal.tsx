'use client'

import { memo } from 'react'
import { toast } from 'sonner'
import { ModalWrapper } from './ModalWrapper'
import { LoadingSpinner } from './Skeletons'
import { useNewCustomer } from '../hooks/useNewCustomer'
import { CustomerDetailsForm } from './new-customer/CustomerDetailsForm'
import { InitialTransactionSection } from './new-customer/InitialTransactionSection'

interface NewCustomerModalProps {
  onClose: () => void
  onSave: () => void
  employeeId: string
}

/**
 * New Customer Modal - Create new customer with optional initial transaction
 */
function NewCustomerModalCore({ onClose, onSave, employeeId }: NewCustomerModalProps) {
  const {
    form,
    updateForm,
    addTransaction,
    setAddTransaction,
    txForm,
    updateTxForm,
    methods,
    loading,
    handleSubmit
  } = useNewCustomer({ onSave, onClose, employeeId })

  const handleFormChange = (field: string, value: string) => {
    updateForm({ [field]: value } as any)
  }

  const handleTxFormChange = (field: string, value: string) => {
    updateTxForm({ [field]: value } as any)
  }

  return (
    <ModalWrapper onClose={onClose} title="New Customer">
      <form onSubmit={handleSubmit} className="space-y-4">
        <CustomerDetailsForm
          firstName={form.firstName}
          lastName={form.lastName}
          phone={form.phone}
          email={form.email}
          address={form.address}
          onChange={handleFormChange}
        />

        {/* Transaction Checkbox */}
        <div className="flex items-center gap-2 p-3 bg-slate-50 rounded-lg">
          <input
            id="add-initial-transaction"
            type="checkbox"
            checked={addTransaction}
            onChange={e => setAddTransaction(e.target.checked)}
            className="w-4 h-4 cursor-pointer"
          />
          <label
            htmlFor="add-initial-transaction"
            className="text-sm font-bold text-slate-700 cursor-pointer"
          >
            Add Initial Transaction
          </label>
        </div>

        {/* Conditional Transaction Section */}
        {addTransaction && (
          <InitialTransactionSection
            type={txForm.type}
            amount={txForm.amount}
            paymentMethodId={txForm.paymentMethodId}
            notes={txForm.notes}
            methods={methods}
            onChange={handleTxFormChange}
          />
        )}

        <button
          type="submit"
          disabled={loading}
          className="w-full bg-slate-900 text-white py-3 rounded-lg font-bold hover:bg-black disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
        >
          {loading && <LoadingSpinner size="sm" />}
          {loading ? 'Creating...' : 'Create Customer'}
        </button>
      </form>
    </ModalWrapper>
  )
}

export const NewCustomerModal = memo(NewCustomerModalCore)
