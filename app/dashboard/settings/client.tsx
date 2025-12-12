'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function SettingsClient({ initialLocations, initialDepts, initialRoles, initialEmployees }: any) {
  const [activeTab, setActiveTab] = useState('branches')
  const [locations, setLocations] = useState(initialLocations)
  const [employees, setEmployees] = useState(initialEmployees)
  
  // --- STATE FOR ADDING EMPLOYEE ---
  const [showAddForm, setShowAddForm] = useState(false)
  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role_id: '',
    department_ids: [] as string[], // ARRAY for multiple departments
    location_id: ''
  })
  
  // --- EXISTING STATES ---
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchCode, setNewBranchCode] = useState('')
  const [loading, setLoading] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  // --- HELPER: Toggle Department Checkbox ---
  const toggleDepartment = (deptId: string) => {
    setNewEmployee(prev => {
      const exists = prev.department_ids.includes(deptId)
      return {
        ...prev,
        department_ids: exists 
          ? prev.department_ids.filter(id => id !== deptId) // Remove
          : [...prev.department_ids, deptId] // Add
      }
    })
  }

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

  // --- ACTION: Add Employee ---
  const handleAddEmployee = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch('/api/admin/add-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newEmployee),
      });

      const data = await res.json();

      if (res.ok) {
        alert('Success! User created.')
        setShowAddForm(false)
        setNewEmployee({ firstName: '', lastName: '', email: '', role_id: '', department_ids: [], location_id: '' })
        router.refresh()
      } else {
        alert('Error: ' + (data.error || 'Unknown error'))
      }
    } catch (err) {
      alert('Network Error')
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
          <div className="space-y-6">
            
            {/* 1. TOGGLE BUTTON & ADD FORM */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">Staff Directory</h3>
                <button 
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="text-sm bg-blue-600 text-white px-3 py-1 rounded hover:bg-blue-700 transition"
                >
                  {showAddForm ? 'Cancel' : '+ Invite New Employee'}
                </button>
              </div>

              {/* ADD EMPLOYEE FORM */}
              {showAddForm && (
                <div className="p-6 bg-blue-50 border-b border-blue-100">
                  <h4 className="font-semibold text-blue-900 mb-4">New Employee Details</h4>
                  <form onSubmit={handleAddEmployee} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        placeholder="First Name" required
                        className="p-2 border rounded"
                        value={newEmployee.firstName}
                        onChange={e => setNewEmployee({...newEmployee, firstName: e.target.value})}
                      />
                      <input 
                        placeholder="Last Name" required
                        className="p-2 border rounded"
                        value={newEmployee.lastName}
                        onChange={e => setNewEmployee({...newEmployee, lastName: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="email" placeholder="Email Address" required
                        className="p-2 border rounded"
                        value={newEmployee.email}
                        onChange={e => setNewEmployee({...newEmployee, email: e.target.value})}
                      />
                      <select 
                        required className="p-2 border rounded bg-white"
                        value={newEmployee.role_id}
                        onChange={e => setNewEmployee({...newEmployee, role_id: e.target.value})}
                      >
                        <option value="">Select Role</option>
                        {initialRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>

                    {/* NEW: MULTI-SELECT DEPARTMENTS */}
                    <div className="bg-white p-3 border rounded">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-2">Assign Departments (Multiple Allowed)</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {initialDepts.map((d: any) => (
                          <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer p-1 hover:bg-slate-50 rounded">
                            <input 
                              type="checkbox" 
                              value={d.id}
                              checked={newEmployee.department_ids.includes(d.id)}
                              onChange={() => toggleDepartment(d.id)}
                              className="rounded border-slate-300 text-blue-900 focus:ring-blue-900"
                            />
                            {d.name}
                          </label>
                        ))}
                      </div>
                    </div>

                    <select 
                      className="w-full p-2 border rounded bg-white"
                      value={newEmployee.location_id}
                      onChange={e => setNewEmployee({...newEmployee, location_id: e.target.value})}
                    >
                      <option value="">Select Branch (Optional)</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>

                    <button 
                      disabled={loading}
                      className="w-full bg-blue-900 text-white py-2 rounded hover:bg-blue-800 font-medium"
                    >
                      {loading ? 'Creating Account & Sending Email...' : 'Create Account'}
                    </button>
                  </form>
                </div>
              )}
              
              {/* 2. STAFF LIST TABLE */}
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Departments</th>
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
                      <td className="px-4 py-3">{initialRoles.find((r:any) => r.id === emp.role_id)?.name || '-'}</td>
                      <td className="px-4 py-3">{locations.find((l:any) => l.id === emp.location_id)?.name || '-'}</td>
                      
                      {/* Note: Showing departments in the list requires a complex join in your page.tsx 
                          For now, this will show empty or needs a specific fetch update. 
                          It's purely visual. */}
                      <td className="px-4 py-3 text-xs text-slate-500">
                        (View in Edit)
                      </td>

                      <td className="px-4 py-3">
                        <button className="text-blue-600 hover:text-blue-800 font-medium opacity-50 cursor-not-allowed" title="Editing coming soon">
                          Edit
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
