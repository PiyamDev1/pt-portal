'use client'
import { useState } from 'react'
import { toast } from 'sonner'

export default function NadraClient({ initialApplications, currentUserId }: any) {
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="space-y-6">
      {/* 1. MULTI-SEARCH SYSTEM */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg">🔍</span>
          <input 
            type="text"
            placeholder="Search by CNIC, Name, or Tracking Number..."
            className="w-full pl-10 pr-4 py-3 bg-slate-50 border-none rounded-lg focus:ring-2 focus:ring-green-500 transition"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      <div className="flex justify-between items-center">
        <h3 className="font-bold text-slate-700">Application Ledger</h3>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition flex items-center gap-2"
        >
          {showForm ? 'Cancel' : '+ New Family Entry'}
        </button>
      </div>

      {/* 2. FAMILY HEAD & APPLICATION FORM (PLACEHOLDER UI) */}
      {showForm && (
        <div className="bg-white p-6 rounded-xl border-t-4 border-green-600 shadow-md animate-fade-in-down space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-4 border-r pr-4 border-slate-100">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Family Head Details</h4>
              <input placeholder="Full Name (Family Head)" className="w-full p-2 border rounded" />
              <input placeholder="CNIC Number (######-######-#)" className="w-full p-2 border rounded font-mono" />
            </div>
            
            <div className="space-y-4">
              <h4 className="text-xs font-black uppercase text-slate-400 tracking-widest">Application Credentials</h4>
              <select className="w-full p-2 border rounded">
                <option>Service Type: NICOP</option>
                <option>Service Type: FRC</option>
                <option>Service Type: POC</option>
              </select>
              <div className="flex gap-2">
                <input placeholder="Tracking ID" className="w-2/3 p-2 border rounded font-mono" />
                <input placeholder="PIN" className="w-1/3 p-2 border rounded font-bold text-center" />
              </div>
              <input placeholder="Filing Email Address" className="w-full p-2 border rounded" />
            </div>
          </div>
          
          <button className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-black transition">
            Save Record to Ledger
          </button>
        </div>
      )}

      {/* 3. RECENT RECORDS TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="p-4 font-bold">Family Head / Applicant</th>
              <th className="p-4 font-bold">Service</th>
              <th className="p-4 font-bold">Credentials (PIN)</th>
              <th className="p-4 font-bold">Email Used</th>
              <th className="p-4 font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialApplications.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-12 text-center text-slate-400 italic">
                  No records found. Start by searching or adding a new family head.
                </td>
              </tr>
            ) : (
              initialApplications.map((app: any) => (
                <tr key={app.id} className="hover:bg-slate-50">
                   <td className="p-4">
                      <div className="font-bold text-slate-800">{app.applicants?.first_name} {app.applicants?.last_name}</div>
                      <div className="text-xs text-slate-400 font-mono">{app.applicants?.citizen_number}</div>
                   </td>
                   <td className="p-4 font-medium">{app.service_type}</td>
                   <td className="p-4">
                      <div className="font-mono text-blue-600 font-bold">{app.tracking_number}</div>
                      <div className="text-[10px] text-slate-400 font-bold">PIN: {app.application_pin || 'N/A'}</div>
                   </td>
                   <td className="p-4 text-slate-500">{app.application_email || '—'}</td>
                   <td className="p-4 text-xs font-bold text-orange-600 uppercase">{app.status}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}