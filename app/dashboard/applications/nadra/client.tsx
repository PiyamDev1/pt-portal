'use client'
import { useState } from 'react'
import { toast } from 'sonner'

export default function NadraClient({ initialApplications, currentUserId }: any) {
  const [showForm, setShowForm] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')

  return (
    <div className="space-y-6">
      {/* MULTI-SEARCH SYSTEM */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
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
        <h3 className="font-bold text-slate-700 uppercase text-xs tracking-widest">Application Ledger</h3>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="bg-green-600 text-white px-4 py-2 rounded-lg font-bold hover:bg-green-700 transition flex items-center gap-2 text-sm"
        >
          {showForm ? 'Close Form' : '+ New Family Entry'}
        </button>
      </div>

      {/* DATA ENTRY FORM */}
      {showForm && (
        <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-md animate-fade-in-down space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left Column: People Details */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">1. Hierarchy</h4>
              <div className="space-y-2">
                <input placeholder="Family Head Name" className="w-full p-2 border rounded text-sm" />
                <input placeholder="Family Head CNIC" className="w-full p-2 border rounded text-sm font-mono" />
              </div>
              <div className="pt-2 space-y-2">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">2. Applicant</h4>
                <input placeholder="Applicant Name" className="w-full p-2 border rounded text-sm" />
                <input placeholder="Applicant CNIC" className="w-full p-2 border rounded text-sm font-mono" />
              </div>
            </div>
            
            {/* Right Column: Service & Credentials */}
            <div className="space-y-4">
              <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">3. Service & Urgency</h4>
              
              {/* TWO COLUMN SPLIT FOR SERVICE AND URGENCY */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Service Type</label>
                  <select className="w-full p-2 border rounded text-sm bg-white">
                    <option>NICOP</option>
                    <option>FRC</option>
                    <option>POC</option>
                    <option>CNIC</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] text-slate-400 font-bold uppercase mb-1 block">Urgency Level</label>
                  <select className="w-full p-2 border rounded text-sm bg-white font-medium">
                    <option>Normal</option>
                    <option>Executive</option>
                  </select>
                </div>
              </div>

              <div className="pt-2 space-y-4">
                <h4 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">4. Access Credentials</h4>
                <div className="flex gap-2">
                  <input placeholder="Tracking ID" className="w-2/3 p-2 border rounded text-sm font-mono" />
                  <input placeholder="PIN" className="w-1/3 p-2 border rounded text-sm font-bold text-center" />
                </div>
                <p className="text-[10px] text-slate-400 italic">
                  * Applicant email will be retrieved from existing profile.
                </p>
              </div>
            </div>
          </div>
          
          <button className="w-full bg-slate-800 text-white py-3 rounded-lg font-bold hover:bg-black transition">
            Save Application to Ledger
          </button>
        </div>
      )}

      {/* LEDGER TABLE */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500 border-b border-slate-200">
            <tr>
              <th className="p-4 font-bold">Applicant Details</th>
              <th className="p-4 font-bold">Service Info</th>
              <th className="p-4 font-bold">Access PIN</th>
              <th className="p-4 font-bold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {initialApplications.length === 0 ? (
              <tr>
                <td colSpan={4} className="p-12 text-center text-slate-400 italic">No records in the ledger.</td>
              </tr>
            ) : (
              initialApplications.map((app: any) => (
                <tr key={app.id} className="hover:bg-slate-50 transition-colors">
                   <td className="p-4">
                      <div className="font-bold text-slate-800">{app.applicants?.first_name} {app.applicants?.last_name}</div>
                      <div className="text-[10px] text-slate-400 font-mono uppercase">{app.applicants?.citizen_number}</div>
                      <div className="text-[10px] text-blue-500 lowercase">{app.applicants?.email}</div>
                   </td>
                   <td className="p-4">
                      <div className="font-bold text-slate-700">{app.service_type}</div>
                      <div className="text-[10px] text-slate-400 font-bold uppercase">Processing Mode: TBD</div>
                   </td>
                   <td className="p-4">
                      <div className="font-mono text-blue-600 font-bold">{app.tracking_number}</div>
                      <div className="text-[10px] font-bold text-slate-500">PIN: {app.application_pin || 'N/A'}</div>
                   </td>
                   <td className="p-4">
                      <span className="text-[10px] font-black bg-orange-100 text-orange-700 px-2 py-1 rounded-full uppercase">
                        {app.status}
                      </span>
                   </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}