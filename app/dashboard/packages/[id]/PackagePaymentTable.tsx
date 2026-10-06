'use client'

import type { Dispatch, SetStateAction } from 'react'
import { Pencil, Save, Trash2, X } from 'lucide-react'
import type {
  TravelPackagePayment,
  TravelPackagePaymentMethod,
  TravelPackagePaymentStatus,
  TravelPackagePaymentType,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'
import { PAYMENT_METHODS, PAYMENT_TYPES, formatDateTime, label } from './packageOperationsModel'

export type PackagePaymentEditForm = {
  amount: string
  paymentType: TravelPackagePaymentType
  paymentMethod: TravelPackagePaymentMethod
  paymentStatus: TravelPackagePaymentStatus
  dueAt: string
  receivedAt: string
  receiptReference: string
  notes: string
}

type PackagePaymentFamilyOption = {
  quoteId: string
  familyLabel: string
}

type PackagePaymentTableProps = {
  payments: TravelPackagePayment[]
  groupFamilies: PackagePaymentFamilyOption[]
  editingPaymentId: string | null
  paymentEditForm: PackagePaymentEditForm
  setPaymentEditForm: Dispatch<SetStateAction<PackagePaymentEditForm>>
  saving: string | null
  onStartPaymentEdit: (payment: TravelPackagePayment) => void
  onSavePaymentEdit: (payment: TravelPackagePayment) => void | Promise<void>
  onCancelPaymentEdit: () => void
  onUpdatePaymentStatus: (
    payment: TravelPackagePayment,
    status: TravelPackagePaymentStatus,
  ) => void | Promise<void>
  onDeletePayment: (payment: TravelPackagePayment) => void | Promise<void>
}

export function PackagePaymentTable({
  payments,
  groupFamilies,
  editingPaymentId,
  paymentEditForm,
  setPaymentEditForm,
  saving,
  onStartPaymentEdit,
  onSavePaymentEdit,
  onCancelPaymentEdit,
  onUpdatePaymentStatus,
  onDeletePayment,
}: PackagePaymentTableProps) {
  return (
    <div className="overflow-x-auto border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Date</th>
            {groupFamilies.length > 0 && <th className="px-3 py-2">Family</th>}
            <th className="px-3 py-2">Type</th>
            <th className="px-3 py-2">Method</th>
            <th className="px-3 py-2">Reference</th>
            <th className="px-3 py-2 text-right">Amount</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Notes</th>
            <th className="w-24 px-3 py-2" />
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {payments.map((payment) => {
            const editingThisPayment = editingPaymentId === payment.id
            const paymentFamily = groupFamilies.find(
              (family) => family.quoteId === payment.quote_id,
            )
            return (
              <tr key={payment.id}>
                <td className="min-w-48 px-3 py-2 text-xs text-slate-500">
                  {editingThisPayment ? (
                    <div className="space-y-2">
                      <label className="block text-[11px] font-bold uppercase text-slate-500">
                        Received
                        <input
                          type="datetime-local"
                          value={paymentEditForm.receivedAt}
                          onChange={(event) =>
                            setPaymentEditForm((current) => ({
                              ...current,
                              receivedAt: event.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                      <label className="block text-[11px] font-bold uppercase text-slate-500">
                        Due
                        <input
                          type="datetime-local"
                          value={paymentEditForm.dueAt}
                          onChange={(event) =>
                            setPaymentEditForm((current) => ({
                              ...current,
                              dueAt: event.target.value,
                            }))
                          }
                          className="mt-1 w-full border border-slate-300 px-2 py-1 text-xs"
                        />
                      </label>
                    </div>
                  ) : (
                    formatDateTime(payment.received_at || payment.created_at)
                  )}
                </td>
                {groupFamilies.length > 0 && (
                  <td className="min-w-36 px-3 py-2">
                    <span className="rounded-full bg-cyan-50 px-2 py-1 text-xs font-black text-cyan-900">
                      {paymentFamily?.familyLabel || 'Unallocated'}
                    </span>
                  </td>
                )}
                <td className="min-w-36 px-3 py-2 font-bold">
                  {editingThisPayment ? (
                    <select
                      value={paymentEditForm.paymentType}
                      onChange={(event) =>
                        setPaymentEditForm((current) => ({
                          ...current,
                          paymentType: event.target.value as TravelPackagePaymentType,
                        }))
                      }
                      className="w-full border border-slate-300 px-2 py-1 text-xs"
                    >
                      {PAYMENT_TYPES.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    label(payment.payment_type)
                  )}
                </td>
                <td className="min-w-36 px-3 py-2">
                  {editingThisPayment ? (
                    <select
                      value={paymentEditForm.paymentMethod}
                      onChange={(event) =>
                        setPaymentEditForm((current) => ({
                          ...current,
                          paymentMethod: event.target.value as TravelPackagePaymentMethod,
                        }))
                      }
                      className="w-full border border-slate-300 px-2 py-1 text-xs"
                    >
                      {PAYMENT_METHODS.map((item) => (
                        <option key={item.value} value={item.value}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  ) : (
                    label(payment.payment_method)
                  )}
                </td>
                <td className="min-w-44 px-3 py-2">
                  {editingThisPayment ? (
                    <input
                      value={paymentEditForm.receiptReference}
                      onChange={(event) =>
                        setPaymentEditForm((current) => ({
                          ...current,
                          receiptReference: event.target.value,
                        }))
                      }
                      placeholder="Receipt / bank reference"
                      className="w-full border border-slate-300 px-2 py-1 text-xs"
                    />
                  ) : (
                    payment.receipt_reference || '-'
                  )}
                </td>
                <td className="min-w-32 px-3 py-2 text-right font-black">
                  {editingThisPayment ? (
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      value={paymentEditForm.amount}
                      onChange={(event) =>
                        setPaymentEditForm((current) => ({
                          ...current,
                          amount: event.target.value,
                        }))
                      }
                      className="w-full border border-slate-300 px-2 py-1 text-right text-xs"
                    />
                  ) : (
                    formatMoney(payment.amount, payment.currency)
                  )}
                </td>
                <td className="min-w-36 px-3 py-2">
                  <select
                    value={
                      editingThisPayment ? paymentEditForm.paymentStatus : payment.payment_status
                    }
                    onChange={(event) => {
                      const nextStatus = event.target.value as TravelPackagePaymentStatus
                      if (editingThisPayment) {
                        setPaymentEditForm((current) => ({ ...current, paymentStatus: nextStatus }))
                        return
                      }
                      void onUpdatePaymentStatus(payment, nextStatus)
                    }}
                    className="border border-slate-300 px-2 py-1 text-xs"
                  >
                    <option value="pending">Pending</option>
                    <option value="completed">Completed</option>
                    <option value="failed">Failed</option>
                    <option value="cancelled">Cancelled</option>
                    <option value="refunded">Refunded</option>
                  </select>
                </td>
                <td className="min-w-56 px-3 py-2">
                  {editingThisPayment ? (
                    <textarea
                      value={paymentEditForm.notes}
                      onChange={(event) =>
                        setPaymentEditForm((current) => ({ ...current, notes: event.target.value }))
                      }
                      placeholder="Payment notes"
                      rows={2}
                      className="w-full border border-slate-300 px-2 py-1 text-xs"
                    />
                  ) : (
                    <span className="whitespace-pre-line text-xs text-slate-600">
                      {payment.notes || '-'}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2">
                  <div className="flex items-center gap-1">
                    {editingThisPayment ? (
                      <>
                        <button
                          type="button"
                          title="Save payment"
                          onClick={() => void onSavePaymentEdit(payment)}
                          disabled={saving === payment.id}
                          className="p-1.5 text-emerald-700 hover:bg-emerald-50 disabled:text-slate-300"
                        >
                          <Save className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          title="Cancel edit"
                          onClick={onCancelPaymentEdit}
                          disabled={saving === payment.id}
                          className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:text-slate-300"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        title="Edit payment"
                        onClick={() => onStartPaymentEdit(payment)}
                        className="p-1.5 text-slate-700 hover:bg-slate-100"
                      >
                        <Pencil className="h-4 w-4" />
                      </button>
                    )}
                    <button
                      type="button"
                      title="Delete payment"
                      onClick={() => void onDeletePayment(payment)}
                      disabled={saving === payment.id}
                      className="p-1.5 text-red-600 hover:bg-red-50 disabled:text-slate-300"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
      {payments.length === 0 && (
        <p className="p-5 text-center text-sm text-slate-500">No payments recorded.</p>
      )}
    </div>
  )
}
