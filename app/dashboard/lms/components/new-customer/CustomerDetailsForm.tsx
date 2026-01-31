'use client'

import { Phone, Mail, MapPin } from 'lucide-react'

interface CustomerFormProps {
  firstName: string
  lastName: string
  phone: string
  email: string
  address: string
  onChange: (field: string, value: string) => void
}

export function CustomerDetailsForm({
  firstName,
  lastName,
  phone,
  email,
  address,
  onChange
}: CustomerFormProps) {
  return (
    <div>
      <h4 className="text-xs font-bold text-slate-500 uppercase mb-3">Customer Information</h4>
      <div className="grid grid-cols-2 gap-3">
        <input
          placeholder="First Name *"
          value={firstName}
          onChange={e => onChange('firstName', e.target.value)}
          className="p-3 border rounded-lg"
          required
        />
        <input
          placeholder="Last Name *"
          value={lastName}
          onChange={e => onChange('lastName', e.target.value)}
          className="p-3 border rounded-lg"
          required
        />
      </div>
      <div className="relative mt-3">
        <Phone className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
        <input
          placeholder="Phone"
          value={phone}
          onChange={e => onChange('phone', e.target.value)}
          className="w-full pl-10 p-3 border rounded-lg"
        />
      </div>
      <div className="relative mt-3">
        <Mail className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
        <input
          placeholder="Email"
          type="email"
          value={email}
          onChange={e => onChange('email', e.target.value)}
          className="w-full pl-10 p-3 border rounded-lg"
        />
      </div>
      <div className="relative mt-3">
        <MapPin className="absolute left-3 top-3 w-4 h-4 text-slate-400" />
        <input
          placeholder="Address"
          value={address}
          onChange={e => onChange('address', e.target.value)}
          className="w-full pl-10 p-3 border rounded-lg"
        />
      </div>
    </div>
  )
}
