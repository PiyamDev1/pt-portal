'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface StaffTabProps {
  initialEmployees: any[]
  initialRoles: any[]
  initialDepts: any[]
  initialLocations: any[]
  supabase: any
  userRole?: string
  loading: boolean
  setLoading: (loading: boolean) => void
}

export default function StaffTab({ 
  initialEmployees, 
  initialRoles, 
  initialDepts, 
  initialLocations,
  supabase, 
  userRole = 'User',
  loading, 
  setLoading 
}: StaffTabProps) {
  const router = useRouter()
  const [employees, setEmployees] = useState(initialEmployees)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [togglingId, setTogglingId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null)
  const [deleteConfirmEmail, setDeleteConfirmEmail] = useState('')
  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role_id: '',
    department_ids: [] as string[],
    location_id: ''
  })

  const isSuperAdmin = userRole === 'Master Admin'

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
      })
      const data = await res.json()
      if (res.ok) {
        toast.success('User created')
        setShowAddForm(false)
        setNewEmployee({ firstName: '', lastName: '', email: '', role_id: '', department_ids: [], location_id: '' })
        router.refresh()
      } else {
        toast.error('Failed to create user', { description: data.error || 'Unknown error' })
      }
    } catch (err) { 
      toast.error('Network Error') 
    }
    setLoading(false)
  }

  const adminResetPassword = async ({ employee_id, email }: { employee_id?: string; email?: string }) => {
    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(employee_id ? { employee_id } : { email })
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to reset password')
    return data
  }

  const handleDisableEnable = async (emp: any) => {
    const newStatus = !emp.is_active
    if (!newStatus && !confirm(`Disable ${emp.full_name}? They will not be able to log in.`)) return

    try {
      setTogglingId(emp.id)
      const res = await fetch('/api/admin/disable-enable-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: emp.id,
          isActive: newStatus
        })
      })
      const data = await res.json()
      if (res.ok) {
        setEmployees(employees.map(e => 
          e.id === emp.id ? { ...e, is_active: newStatus } : e
        ))
        const action = newStatus ? 'enabled' : 'disabled'
        toast.success(`Employee ${action}`)
      } else {
        toast.error(data.error || `Failed to ${newStatus ? 'enable' : 'disable'} employee`)
      }
    } catch (err: any) {
      toast.error('Error: ' + (err.message || err))
    } finally {
      setTogglingId(null)
    }
  }

  const handleDeleteEmployee = async (emp: any) => {
    if (deleteConfirmEmail !== emp.email) {
      toast.error('Email does not match')
      return
    }

    try {
      setDeletingId(emp.id)
      const res = await fetch('/api/admin/delete-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: emp.id,
          confirmEmail: emp.email
        })
      })
      const data = await res.json()
      if (res.ok) {
        setEmployees(employees.filter(e => e.id !== emp.id))
        toast.success(`${emp.full_name} has been permanently deleted`)
        setDeleteConfirmId(null)
        setDeleteConfirmEmail('')
      } else {
        toast.error(data.error || 'Failed to delete employee')
      }
    } catch (err: any) {
      toast.error('Error: ' + (err.message || err))
    } finally {
      setDeletingId(null)
    }
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
      toast.success('Employee updated successfully')
      router.refresh()
    } else {
      toast.error('Failed to update employee', { description: error.message })
    }
    setLoading(false)
  }

  return (
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
                {initialLocations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
              </select>

              <button 
                disabled={loading}
                className="w-full bg-blue-900 text-white py-3 rounded hover:bg-blue-800 font-bold transition-colors disabled:opacity-50"
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
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {employees.map((emp: any) => (
              <tr key={emp.id} className={emp.is_active === false ? 'hover:bg-slate-50 opacity-60' : 'hover:bg-slate-50'}>
                <td className={`px-4 py-3 font-medium ${emp.is_active === false ? 'line-through text-slate-400' : ''}`}>
                  {emp.full_name}
                  <div className="text-xs text-slate-400 font-normal">{emp.email}</div>
                </td>
                
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
                        {initialLocations.map((l: any) => <option key={l.id} value={l.id}>{l.name}</option>)}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <span className="text-xs text-gray-400 italic">Manage via Profile</span>
                    </td>
                    <td className="px-2 py-3" />
                    <td className="px-4 py-3 flex gap-2">
                      <button type="button" onClick={handleUpdateEmployee} className="text-green-600 font-bold hover:underline">Save</button>
                      <button type="button" onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:underline">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">{initialRoles.find((r:any) => r.id === emp.role_id)?.name || '-'}</td>
                    <td className="px-4 py-3">{initialLocations.find((l:any) => l.id === emp.location_id)?.name || '-'}</td>
                    <td className="px-4 py-3">{initialDepts.find((d:any) => d.id === emp.department_id)?.name || '-'}</td>
                    <td className="px-4 py-3">
                      {emp.is_active === false ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">Disabled</span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">Active</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex gap-2 flex-wrap">
                        <button 
                          onClick={() => setEditingEmployee(emp)}
                          className="text-blue-600 hover:text-blue-800 font-medium"
                        >
                          Edit
                        </button>
                        <button
                          onClick={async () => {
                            if (!confirm(`Send a temporary password to ${emp.email}?`)) return
                            try {
                              setResettingId(emp.id)
                              const resp = await adminResetPassword({ employee_id: emp.id })
                              toast.success(resp.message || 'Temporary password emailed')
                            } catch (err: any) {
                              toast.error('Error: ' + (err.message || err))
                            } finally {
                              setResettingId(null)
                            }
                          }}
                          disabled={loading || resettingId === emp.id}
                          className="text-orange-600 hover:text-orange-800 font-medium disabled:opacity-50"
                        >
                          {resettingId === emp.id ? 'Sending...' : 'Reset'}
                        </button>

                        <button
                          onClick={() => handleDisableEnable(emp)}
                          disabled={togglingId === emp.id || loading}
                          className={`font-medium ${
                            emp.is_active === false 
                              ? 'text-green-600 hover:text-green-800' 
                              : 'text-yellow-600 hover:text-yellow-800'
                          } disabled:opacity-50`}
                        >
                          {togglingId === emp.id ? 'Updating...' : (emp.is_active === false ? 'Enable' : 'Disable')}
                        </button>

                        {isSuperAdmin && (
                          <>
                            {deleteConfirmId === emp.id ? (
                              <div className="col-span-full bg-red-50 border border-red-200 rounded p-3 mt-2">
                                <p className="text-sm font-semibold text-red-900 mb-2">
                                  ⚠️ Confirm deletion of {emp.full_name}
                                </p>
                                <p className="text-xs text-red-700 mb-3">
                                  This action cannot be undone. Type their email to confirm:
                                </p>
                                <input
                                  type="text"
                                  placeholder={`Type: ${emp.email}`}
                                  value={deleteConfirmEmail}
                                  onChange={e => setDeleteConfirmEmail(e.target.value)}
                                  className="w-full p-2 border border-red-300 rounded mb-2 text-sm"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDeleteEmployee(emp)}
                                    disabled={deletingId === emp.id || deleteConfirmEmail !== emp.email}
                                    className="px-3 py-1 bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {deletingId === emp.id ? 'Deleting...' : 'Permanently Delete'}
                                  </button>
                                  <button
                                    onClick={() => {
                                      setDeleteConfirmId(null)
                                      setDeleteConfirmEmail('')
                                    }}
                                    className="px-3 py-1 bg-slate-300 text-slate-700 rounded text-sm font-bold hover:bg-slate-400"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() => setDeleteConfirmId(emp.id)}
                                className="text-red-600 hover:text-red-800 font-medium"
                              >
                                Delete
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}

