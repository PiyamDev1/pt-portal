'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function SettingsClient({ initialLocations, initialDepts, initialRoles, initialEmployees }: any) {
  const [activeTab, setActiveTab] = useState('branches')
  const [locations, setLocations] = useState(initialLocations)
  const [employees, setEmployees] = useState(initialEmployees)
  
  // Form States
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchCode, setNewBranchCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  // --- ACTION: Add Branch ---
  const handleAddBranch = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    
    const { data, error } = await supabase
      .from('locations')
      .insert({ name: newBranchName, branch_code: newBranchCode, type: 'Branch' })
      .select()

    if (!error && data) {
      setLocations([...locations, data[0]])
      setNewBranchName('')
      setNewBranchCode('')
    } else {
      alert('Error adding branch: ' + error?.message)
    }
    setLoading(false)
  }

  // --- ACTION: Update Employee Hierarchy ---
  const handleUpdateEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editingEmployee) return
    setLoading(true)

    const { error } = await supabase
      .from('employees')
      .update({
        role_id: editingEmployee.role_id,
        department_id: editingEmployee.department_id,
        location_id: editingEmployee.location_id,
        manager_id: editingEmployee.manager_id
      })
      .eq('id', editingEmployee.id)

    if (!error) {
      // Update local state to reflect change immediately
      setEmployees(employees.map((emp: any) => emp.id === editingEmployee.id ? editingEmployee : emp))
      setEditingEmployee(null)
      router.refresh() // Refresh server data in background
    } else {
      alert('Failed to update: ' + error.message)
    }
    setLoading(false)
  }

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 flex-shrink-0">
        <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden">
          <button 
            onClick={() => setActiveTab('branches')}
            className={`w-full text-left px-4 py-3 border-l-4 ${activeTab === 'branches' ? 'border-blue-900 bg-blue-50 font-medium' : 'border-transparent hover:bg-slate-50'}`}
          >
            Branches & Locations
          </button>
          <button 
            onClick={() => setActiveTab('staff')}
            className={`w-full text-left px-4 py-3 border-l-4 ${activeTab === 'staff' ? 'border-blue-900 bg-blue-50 font-medium' : 'border-transparent hover:bg-slate-50'}`}
          >
            Staff & Hierarchy
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1">
        
        {/* --- TAB: BRANCHES --- */}
        {activeTab === 'branches' && (
          <div className="space-y-6">
            {/* Add New Branch Card */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg mb-4 text-slate-800">Add New Location</h3>
              <form onSubmit={handleAddBranch} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Branch Name</label>
                  <input 
                    type="text" placeholder="e.g. Manchester Office" required
                    className="w-full p-2 border rounded"
                    value={newBranchName} onChange={e => setNewBranchName(e.target.value)}
                  />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Code</label>
                  <input 
                    type="text" placeholder="MAN-01" required
                    className="w-full p-2 border rounded uppercase"
                    value={newBranchCode} onChange={e => setNewBranchCode(e.target.value.toUpperCase())}
                  />
                </div>
                <button disabled={loading} className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-medium">
                  {loading ? 'Adding...' : 'Add Branch'}
                </button>
              </form>
            </div>

            {/* Existing Branches List */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                  <tr>
                    <th className="px-6 py-3">Location Name</th>
                    <th className="px-6 py-3">Branch Code</th>
                    <th className="px-6 py-3">Type</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {locations.map((loc: any) => (
                    <tr key={loc.id} className="hover:bg-slate-50">
                      <td className="px-6 py-3 font-medium text-slate-900">{loc.name}</td>
                      <td className="px-6 py-3 font-mono text-slate-500">{loc.branch_code || '-'}</td>
                      <td className="px-6 py-3">
                        <span className={`px-2 py-1 rounded text-xs ${loc.type === 'HQ' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                          {loc.type}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* --- TAB: STAFF --- */}
        {activeTab === 'staff' && (
          <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
            <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
              <h3 className="font-bold text-slate-700">Staff Directory</h3>
              <button className="text-xs text-blue-600 hover:underline">Invite New User (Use Supabase Auth)</button>
            </div>
            
            <table className="w-full text-sm text-left">
              <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                <tr>
                  <th className="px-4 py-3">Name</th>
                  <th className="px-4 py-3">Role</th>
                  <th className="px-4 py-3">Branch</th>
                  <th className="px-4 py-3">Department</th>
                  <th className="px-4 py-3">Manager</th>
                  <th className="px-4 py-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {employees.map((emp: any) => (
                  <tr key={emp.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-medium">
                      {emp.full_name}
                      <div className="text-xs text-slate-400 font-normal">{emp.email}</div>
                    </td>
                    
                    {/* EDIT MODE vs VIEW MODE */}
                    {editingEmployee?.id === emp.id ? (
                      <>
                        <td className="px-2 py-3">
                          <select className="border rounded p-1 w-full" 
                            value={editingEmployee.role_id || ''}
                            onChange={e => setEditingEmployee({...editingEmployee, role_id: e.target.value})}
                          >
                            <option value="">- Role -</option>
                            {initialRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-3">
                          <select className="border rounded p-1 w-full"
                            value={editingEmployee.location_id || ''}
                            onChange={e => setEditingEmployee({...editingEmployee, location_id: e.target.value})}
                          >
                            <option value="">- Branch -</option>
                            {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-3">
                           <select className="border rounded p-1 w-full"
                            value={editingEmployee.department_id || ''}
                            onChange={e => setEditingEmployee({...editingEmployee, department_id: e.target.value})}
                          >
                            <option value="">- Dept -</option>
                            {initialDepts.map((d: any) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        </td>
                        <td className="px-2 py-3">
                           <select className="border rounded p-1 w-full"
                            value={editingEmployee.manager_id || ''}
                            onChange={e => setEditingEmployee({...editingEmployee, manager_id: e.target.value})}
                          >
                            <option value="">- Self -</option>
                            {employees.filter((m: any) => m.id !== emp.id).map((m: any) => (
                              <option key={m.id} value={m.id}>{m.full_name}</option>
                            ))}
                          </select>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex gap-2">
                            <button onClick={handleUpdateEmployee} className="text-green-600 font-bold hover:underline">Save</button>
                            <button onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:underline">Cancel</button>
                          </div>
                        </td>
                      </>
                    ) : (
                      /* VIEW MODE ROW */
                      <>
                        <td className="px-4 py-3">{initialRoles.find((r:any) => r.id === emp.role_id)?.name || '-'}</td>
                        <td className="px-4 py-3">{locations.find((l:any) => l.id === emp.location_id)?.name || '-'}</td>
                        <td className="px-4 py-3">{initialDepts.find((d:any) => d.id === emp.department_id)?.name || '-'}</td>
                        <td className="px-4 py-3">{employees.find((m:any) => m.id === emp.manager_id)?.full_name || '-'}</td>
                        <td className="px-4 py-3">
                          <button 
                            onClick={() => setEditingEmployee(emp)}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Edit
                          </button>
                        </td>
                      </>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
