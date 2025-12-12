'use client'
import { useState, useMemo } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'

export default function SettingsClient({ initialLocations, initialDepts, initialRoles, initialEmployees }: any) {
  const [activeTab, setActiveTab] = useState('branches')
  const [locations, setLocations] = useState(initialLocations)
  const [employees, setEmployees] = useState(initialEmployees)
  
  // --- STATES FOR BRANCH EDITING ---
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchCode, setNewBranchCode] = useState('')
  const [editingBranch, setEditingBranch] = useState<any>(null)
  
  // --- STATES FOR STAFF EDITING ---
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role_id: '',
    department_ids: [] as string[],
    location_id: ''
  })

  // --- COMMON STATES ---
  const [loading, setLoading] = useState(false)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  // ------------------------------------------------------------------
  // ACTION: BRANCHES
  // ------------------------------------------------------------------
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
      alert('Error: ' + error?.message)
    }
    setLoading(false)
  }

  const handleUpdateBranch = async () => {
    if (!editingBranch) return
    setLoading(true)
    const { error } = await supabase
      .from('locations')
      .update({ name: editingBranch.name, branch_code: editingBranch.branch_code })
      .eq('id', editingBranch.id)

    if (!error) {
      setLocations(locations.map((loc: any) => loc.id === editingBranch.id ? editingBranch : loc))
      setEditingBranch(null)
      router.refresh()
    } else {
      alert('Error updating branch: ' + error.message)
    }
    setLoading(false)
  }

  // ------------------------------------------------------------------
  // ACTION: STAFF
  // ------------------------------------------------------------------
  const toggleDepartment = (deptId: string) => {
    setNewEmployee(prev => {
      const exists = prev.department_ids.includes(deptId)
      return {
        ...prev,
        department_ids: exists 
          ? prev.department_ids.filter(id => id !== deptId)
          : [...prev.department_ids, deptId]
      }
    })
  }

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
        alert('Success! User created.');
        setShowAddForm(false);
        setNewEmployee({ firstName: '', lastName: '', email: '', role_id: '', department_ids: [], location_id: '' });
        router.refresh(); 
      } else {
        alert('Error: ' + (data.error || 'Unknown error'));
      }
    } catch (err) { alert('Network Error'); }
    setLoading(false)
  }

  const handleUpdateEmployee = async () => {
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
      setEmployees(employees.map((emp: any) => emp.id === editingEmployee.id ? editingEmployee : emp))
      setEditingEmployee(null)
      router.refresh()
    } else {
      alert('Failed to update: ' + error.message)
    }
    setLoading(false)
  }

  // ------------------------------------------------------------------
  // ACTION: HIERARCHY (Tree Logic)
  // ------------------------------------------------------------------
  const handleUpdateManager = async (employeeId: string, newManagerId: string) => {
    const { error } = await supabase
      .from('employees')
      .update({ manager_id: newManagerId === 'null' ? null : newManagerId })
      .eq('id', employeeId)

    if (!error) {
      // Optimistic update
      setEmployees(employees.map((e: any) => 
        e.id === employeeId ? { ...e, manager_id: newManagerId === 'null' ? null : newManagerId } : e
      ))
      router.refresh()
    } else {
      alert('Error moving employee: ' + error.message)
    }
  }

  // Recursive Tree Renderer
  const EmployeeNode = ({ employee, level }: { employee: any, level: number }) => {
    const directReports = employees.filter((e: any) => e.manager_id === employee.id)
    
    return (
      <div className="mb-2 relative">
        <div className={`flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white shadow-sm hover:border-blue-300 transition-colors ml-${level * 6}`} 
             style={{ marginLeft: `${level * 2}rem` }}>
          
          {/* Connector Line for Children */}
          {level > 0 && (
            <div className="absolute -left-4 top-1/2 w-4 h-px bg-slate-300"></div>
          )}

          {/* Avatar / Icon */}
          <div className={`h-8 w-8 rounded-full flex items-center justify-center text-xs font-bold text-white
            ${level === 0 ? 'bg-purple-600' : level === 1 ? 'bg-blue-600' : 'bg-slate-500'}`}>
            {employee.full_name.charAt(0)}
          </div>

          <div className="flex-1">
            <p className="text-sm font-bold text-slate-800">{employee.full_name}</p>
            <p className="text-xs text-slate-500">
              {initialRoles.find((r:any) => r.id === employee.role_id)?.name} • {initialLocations.find((l:any) => l.id === employee.location_id)?.name || 'No Branch'}
            </p>
          </div>

          {/* Re-Assign Manager Dropdown */}
          <select 
            className="text-xs border rounded p-1 bg-slate-50 text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none w-40"
            value={employee.manager_id || 'null'}
            onChange={(e) => handleUpdateManager(employee.id, e.target.value)}
          >
            <option value="null">No Manager (Root)</option>
            {employees
              .filter((m: any) => m.id !== employee.id) // Can't report to self
              .map((m: any) => (
              <option key={m.id} value={m.id}>Report to: {m.full_name}</option>
            ))}
          </select>
        </div>

        {/* Render Children Recursively */}
        <div className="border-l-2 border-slate-100 ml-4">
          {directReports.map((report: any) => (
            <EmployeeNode key={report.id} employee={report} level={level + 1} />
          ))}
        </div>
      </div>
    )
  }

  // Find Root Nodes (No Manager)
  const rootEmployees = useMemo(() => employees.filter((e: any) => !e.manager_id), [employees])

  return (
    <div className="flex flex-col md:flex-row gap-8 min-h-screen">
      {/* Sidebar Navigation */}
      <div className="w-full md:w-64 flex-shrink-0">
        <div className="bg-white rounded-lg shadow border border-slate-200 overflow-hidden sticky top-24">
          <button 
            onClick={() => setActiveTab('branches')}
            className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${activeTab === 'branches' ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}
          >
            Branches & Locations
          </button>
          <button 
            onClick={() => setActiveTab('staff')}
            className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${activeTab === 'staff' ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}
          >
            Staff Management
          </button>
          <button 
            onClick={() => setActiveTab('hierarchy')}
            className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${activeTab === 'hierarchy' ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}
          >
            Hierarchy Tree
          </button>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 space-y-6">
        
        {/* --- TAB: BRANCHES --- */}
        {activeTab === 'branches' && (
          <div className="space-y-6">
            {/* Add Branch */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg mb-4 text-slate-800">Add New Location</h3>
              <form onSubmit={handleAddBranch} className="flex gap-4 items-end">
                <div className="flex-1">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Branch Name</label>
                  <input 
                    type="text" placeholder="e.g. Manchester Office" required
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newBranchName} onChange={e => setNewBranchName(e.target.value)}
                  />
                </div>
                <div className="w-32">
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Code</label>
                  <input 
                    type="text" placeholder="MAN-01" required
                    className="w-full p-2 border rounded uppercase focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newBranchCode} onChange={e => setNewBranchCode(e.target.value.toUpperCase())}
                  />
                </div>
                <button disabled={loading} className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-medium transition-colors">
                  {loading ? 'Adding...' : 'Add Branch'}
                </button>
              </form>
            </div>

            {/* List Branches */}
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                  <tr>
                    <th className="px-6 py-3">Location Name</th>
                    <th className="px-6 py-3">Branch Code</th>
                    <th className="px-6 py-3">Type</th>
                    <th className="px-6 py-3">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {locations.map((loc: any) => (
                    <tr key={loc.id} className="hover:bg-slate-50">
                      {editingBranch?.id === loc.id ? (
                        /* EDIT MODE */
                        <>
                          <td className="px-6 py-3">
                            <input 
                              className="border p-1 rounded w-full"
                              value={editingBranch.name}
                              onChange={e => setEditingBranch({...editingBranch, name: e.target.value})}
                            />
                          </td>
                          <td className="px-6 py-3">
                            <input 
                              className="border p-1 rounded w-24 uppercase"
                              value={editingBranch.branch_code}
                              onChange={e => setEditingBranch({...editingBranch, branch_code: e.target.value.toUpperCase()})}
                            />
                          </td>
                          <td className="px-6 py-3 text-slate-400">{loc.type}</td>
                          <td className="px-6 py-3 flex gap-3">
                            <button onClick={handleUpdateBranch} className="text-green-600 font-bold hover:underline">Save</button>
                            <button onClick={() => setEditingBranch(null)} className="text-slate-400 hover:underline">Cancel</button>
                          </td>
                        </>
                      ) : (
                        /* VIEW MODE */
                        <>
                          <td className="px-6 py-3 font-medium text-slate-900">{loc.name}</td>
                          <td className="px-6 py-3 font-mono text-slate-500">{loc.branch_code || '-'}</td>
                          <td className="px-6 py-3">
                            <span className={`px-2 py-1 rounded text-xs ${loc.type === 'HQ' ? 'bg-purple-100 text-purple-700' : 'bg-blue-100 text-blue-700'}`}>
                              {loc.type}
                            </span>
                          </td>
                          <td className="px-6 py-3">
                            <button 
                              onClick={() => setEditingBranch(loc)}
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
          </div>
        )}

        {/* --- TAB: STAFF --- */}
        {activeTab === 'staff' && (
          <div className="space-y-6">
            <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-4 border-b border-slate-200 bg-slate-50 flex justify-between items-center">
                <h3 className="font-bold text-slate-700">Staff Directory</h3>
                <button 
                  onClick={() => setShowAddForm(!showAddForm)}
                  className="text-sm bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 transition font-medium"
                >
                  {showAddForm ? 'Cancel' : '+ Invite New Employee'}
                </button>
              </div>

              {/* Add Employee Form */}
              {showAddForm && (
                <div className="p-6 bg-blue-50 border-b border-blue-100 animate-fade-in">
                  <h4 className="font-bold text-blue-900 mb-4">New Employee Details</h4>
                  <form onSubmit={handleAddEmployee} className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        placeholder="First Name" required
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newEmployee.firstName}
                        onChange={e => setNewEmployee({...newEmployee, firstName: e.target.value})}
                      />
                      <input 
                        placeholder="Last Name" required
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newEmployee.lastName}
                        onChange={e => setNewEmployee({...newEmployee, lastName: e.target.value})}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <input 
                        type="email" placeholder="Email Address" required
                        className="p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newEmployee.email}
                        onChange={e => setNewEmployee({...newEmployee, email: e.target.value})}
                      />
                      <select 
                        required className="p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                        value={newEmployee.role_id}
                        onChange={e => setNewEmployee({...newEmployee, role_id: e.target.value})}
                      >
                        <option value="">Select Role</option>
                        {initialRoles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
                      </select>
                    </div>

                    <div className="bg-white p-4 border rounded-lg">
                      <label className="block text-xs font-bold text-slate-500 uppercase mb-3">Assign Departments</label>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                        {initialDepts.map((d: any) => (
                          <label key={d.id} className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 transition">
                            <input 
                              type="checkbox" 
                              value={d.id}
                              checked={newEmployee.department_ids.includes(d.id)}
                              onChange={() => toggleDepartment(d.id)}
                              className="rounded border-slate-300 text-blue-900 focus:ring-blue-900 w-4 h-4"
                            />
                            {d.name}
                          </label>
                        ))}
                      </div>
                    </div>

                    <select 
                      className="w-full p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none"
                      value={newEmployee.location_id}
                      onChange={e => setNewEmployee({...newEmployee, location_id: e.target.value})}
                    >
                      <option value="">Select Branch (Optional)</option>
                      {locations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>

                    <button 
                      disabled={loading}
                      className="w-full bg-blue-900 text-white py-3 rounded hover:bg-blue-800 font-bold transition-colors"
                    >
                      {loading ? 'Creating Account & Sending Email...' : 'Create Account'}
                    </button>
                  </form>
                </div>
              )}
              
              {/* Staff List */}
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 text-slate-500 font-semibold border-b">
                  <tr>
                    <th className="px-4 py-3">Name</th>
                    <th className="px-4 py-3">Role</th>
                    <th className="px-4 py-3">Branch</th>
                    <th className="px-4 py-3">Department</th>
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
                      
                      {editingEmployee?.id === emp.id ? (
                        /* EDIT MODE */
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
                             {/* Dept logic is complex for quick edit, keeping it simple for now */}
                             <span className="text-xs text-gray-400 italic">Manage via Profile</span>
                          </td>
                          <td className="px-4 py-3 flex gap-2">
                            <button onClick={handleUpdateEmployee} className="text-green-600 font-bold hover:underline">Save</button>
                            <button onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:underline">Cancel</button>
                          </td>
                        </>
                      ) : (
                        /* VIEW MODE */
                        <>
                          <td className="px-4 py-3">{initialRoles.find((r:any) => r.id === emp.role_id)?.name || '-'}</td>
                          <td className="px-4 py-3">{locations.find((l:any) => l.id === emp.location_id)?.name || '-'}</td>
                          <td className="px-4 py-3">{initialDepts.find((d:any) => d.id === emp.department_id)?.name || '-'}</td>
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
          </div>
        )}

        {/* --- TAB: HIERARCHY (Tree View) --- */}
        {activeTab === 'hierarchy' && (
          <div className="space-y-6">
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="font-bold text-lg mb-2 text-slate-800">Organization Hierarchy</h3>
              <p className="text-sm text-slate-500 mb-6">Visualise reporting lines. Use the dropdown on any employee card to change their manager.</p>
              
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 min-h-[400px]">
                {rootEmployees.length === 0 && <p className="text-center text-gray-400 py-10">No employees found.</p>}
                
                {rootEmployees.map((root: any) => (
                  <EmployeeNode key={root.id} employee={root} level={0} />
                ))}
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
