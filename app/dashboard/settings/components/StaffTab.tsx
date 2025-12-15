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
  loading: boolean
  setLoading: (loading: boolean) => void
}

export default function StaffTab({ 
  initialEmployees, 
  initialRoles, 
  initialDepts, 
  initialLocations,
  supabase, 
  loading, 
  setLoading 
}: StaffTabProps) {
  const router = useRouter()
  const [employees, setEmployees] = useState(initialEmployees)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<any>(null)
  const [resettingId, setResettingId] = useState<string | null>(null)
  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role_id: '',
    department_ids: [] as string[],
    location_id: ''
  })

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
                    <td className="px-4 py-3 flex gap-2">
                      <button onClick={handleUpdateEmployee} className="text-green-600 font-bold hover:underline">Save</button>
                      <button onClick={() => setEditingEmployee(null)} className="text-slate-400 hover:underline">Cancel</button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">{initialRoles.find((r:any) => r.id === emp.role_id)?.name || '-'}</td>
                    <td className="px-4 py-3">{initialLocations.find((l:any) => l.id === emp.location_id)?.name || '-'}</td>
                    <td className="px-4 py-3">{initialDepts.find((d:any) => d.id === emp.department_id)?.name || '-'}</td>
                    <td className="px-4 py-3">
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
                        className="ml-3 text-red-600 hover:underline"
                      >
                        {resettingId === emp.id ? 'Sending...' : 'Reset Password'}
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
  )
}
