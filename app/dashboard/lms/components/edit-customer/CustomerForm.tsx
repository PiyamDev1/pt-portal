'use client'

import { Phone } from 'lucide-react'

interface CustomerInfoProps {
  customer: {
    name: string
    id: string
  }
}

export function CustomerInfo({ customer }: CustomerInfoProps) {
  return (
    <div className="bg-slate-50 p-3 rounded-lg mb-4">
      <div className="text-sm font-bold text-slate-700">{customer.name}</div>
      <div className="text-xs text-slate-500">ID: {customer.id.substring(0, 8)}</div>
    </div>
  )
}

interface EditFormFieldsProps {
  form: {
    phone: string
    email: string
    address: string
    dateOfBirth: string
    notes: string
  }
  onFormChange: (updates: {
    phone?: string
    email?: string
    address?: string
    dateOfBirth?: string
    notes?: string
  }) => void
  onDateInput: (value: string) => string
}

export function EditFormFields({
  form,
  onFormChange,
  onDateInput
}: EditFormFieldsProps) {
  return (
    <>
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
            onChange={e => onFormChange({ phone: e.target.value })}
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
          onChange={e => onFormChange({ email: e.target.value })}
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
          onChange={e => onFormChange({ address: e.target.value })}
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
          onChange={e => onFormChange({ dateOfBirth: onDateInput(e.target.value) })}
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
          onChange={e => onFormChange({ notes: e.target.value })}
          className="w-full p-3 border rounded-lg"
          rows={3}
        />
      </div>
    </>
  )
}
