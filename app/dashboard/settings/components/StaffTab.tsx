/**
 * Staff Tab
 * Employee directory management surface for creating, editing, disabling, and deleting staff.
 *
 * @module app/dashboard/settings/components/StaffTab
 */

'use client'
import { useMemo, useReducer, useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'
import { ConfirmationDialog } from '@/components/ConfirmationDialog'
import type { SupabaseClient } from '@supabase/supabase-js'
import { StaffAddEmployeeForm } from './StaffAddEmployeeForm'

interface Employee {
  id: string
  full_name: string
  email: string
  role_id: string | null
  department_id: string | null
  location_id: string | null
  manager_id?: string | null
  is_active?: boolean
}
interface Role {
  id: string
  name: string
}
interface Department {
  id: string
  name: string
}
interface Location {
  id: string
  name: string
}
interface StaffTabProps {
  initialEmployees: Employee[]
  initialRoles: Role[]
  initialDepts: Department[]
  initialLocations: Location[]
  supabase: SupabaseClient
  userRole?: string
  loading: boolean
  setLoading: (loading: boolean) => void
}

type ConfirmAction = {
  type: 'disable' | 'reset'
  emp: Employee
}

type StaffUiState = {
  resettingId: string | null
  togglingId: string | null
  deletingId: string | null
  deleteConfirmId: string | null
  deleteConfirmEmail: string
  confirmAction: ConfirmAction | null
}

type StaffUiAction =
  | { type: 'setResettingId'; payload: string | null }
  | { type: 'setTogglingId'; payload: string | null }
  | { type: 'setDeletingId'; payload: string | null }
  | { type: 'setDeleteConfirm'; payload: { id: string | null; email: string } }
  | { type: 'setDeleteConfirmEmail'; payload: string }
  | { type: 'setConfirmAction'; payload: ConfirmAction | null }

const initialUiState: StaffUiState = {
  resettingId: null,
  togglingId: null,
  deletingId: null,
  deleteConfirmId: null,
  deleteConfirmEmail: '',
  confirmAction: null,
}

function staffUiReducer(state: StaffUiState, action: StaffUiAction): StaffUiState {
  switch (action.type) {
    case 'setResettingId':
      return { ...state, resettingId: action.payload }
    case 'setTogglingId':
      return { ...state, togglingId: action.payload }
    case 'setDeletingId':
      return { ...state, deletingId: action.payload }
    case 'setDeleteConfirm':
      return {
        ...state,
        deleteConfirmId: action.payload.id,
        deleteConfirmEmail: action.payload.email,
      }
    case 'setDeleteConfirmEmail':
      return { ...state, deleteConfirmEmail: action.payload }
    case 'setConfirmAction':
      return { ...state, confirmAction: action.payload }
    default:
      return state
  }
}

export default function StaffTab({
  initialEmployees,
  initialRoles,
  initialDepts,
  initialLocations,
  supabase,
  userRole = 'User',
  loading,
  setLoading,
}: StaffTabProps) {
  const router = useRouter()
  const [employees, setEmployees] = useState<Employee[]>(initialEmployees)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null)
  const [uiState, dispatchUi] = useReducer(staffUiReducer, initialUiState)
  const [newEmployee, setNewEmployee] = useState({
    firstName: '',
    lastName: '',
    email: '',
    role_id: '',
    department_ids: [] as string[],
    location_id: '',
  })

  const rolesById = useMemo(() => {
    const map = new Map<string, string>()
    for (const role of initialRoles) {
      map.set(role.id, role.name)
    }
    return map
  }, [initialRoles])

  const locationsById = useMemo(() => {
    const map = new Map<string, string>()
    for (const location of initialLocations) {
      map.set(location.id, location.name)
    }
    return map
  }, [initialLocations])

  const departmentsById = useMemo(() => {
    const map = new Map<string, string>()
    for (const department of initialDepts) {
      map.set(department.id, department.name)
    }
    return map
  }, [initialDepts])

  const isSuperAdmin = userRole === 'Master Admin'

  const toggleDepartment = (deptId: string) => {
    setNewEmployee((prev) => {
      const exists = prev.department_ids.includes(deptId)
      return {
        ...prev,
        department_ids: exists
          ? prev.department_ids.filter((id) => id !== deptId)
          : [...prev.department_ids, deptId],
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
        setNewEmployee({
          firstName: '',
          lastName: '',
          email: '',
          role_id: '',
          department_ids: [],
          location_id: '',
        })
        router.refresh()
      } else {
        toast.error('Failed to create user', { description: data.error || 'Unknown error' })
      }
    } catch (err) {
      toast.error('Network Error')
    }
    setLoading(false)
  }

  const adminResetPassword = async ({
    employee_id,
    email,
  }: {
    employee_id?: string
    email?: string
  }) => {
    const {
      data: { session },
    } = await supabase.auth.getSession()
    if (!session?.access_token) {
      throw new Error('Not authenticated')
    }

    const res = await fetch('/api/admin/reset-password', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify(employee_id ? { employee_id } : { email }),
    })
    const data = await res.json()
    if (!res.ok) throw new Error(data.error || 'Failed to reset password')
    return data
  }

  const performDisableEnable = async (emp: Employee, newStatus: boolean) => {
    try {
      dispatchUi({ type: 'setTogglingId', payload: emp.id })
      const res = await fetch('/api/admin/disable-enable-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: emp.id,
          isActive: newStatus,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setEmployees((currentEmployees) =>
          currentEmployees.map((e) => (e.id === emp.id ? { ...e, is_active: newStatus } : e)),
        )
        const action = newStatus ? 'enabled' : 'disabled'
        toast.success(`Employee ${action}`)
      } else {
        toast.error(data.error || `Failed to ${newStatus ? 'enable' : 'disable'} employee`)
      }
    } catch (err: unknown) {
      toast.error('Error: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      dispatchUi({ type: 'setTogglingId', payload: null })
    }
  }

  const handleDisableEnable = async (emp: Employee) => {
    const newStatus = !emp.is_active
    if (!newStatus) {
      dispatchUi({ type: 'setConfirmAction', payload: { type: 'disable', emp } })
      return
    }

    await performDisableEnable(emp, newStatus)
  }

  const handleSendTempPassword = async (emp: Employee) => {
    try {
      dispatchUi({ type: 'setResettingId', payload: emp.id })
      const resp = await adminResetPassword({ employee_id: emp.id })
      toast.success(resp.message || 'Temporary password emailed')
    } catch (err: unknown) {
      toast.error('Error: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      dispatchUi({ type: 'setResettingId', payload: null })
    }
  }

  const handleConfirmAction = async () => {
    if (!uiState.confirmAction) return

    if (uiState.confirmAction.type === 'disable') {
      await performDisableEnable(uiState.confirmAction.emp, false)
    }

    if (uiState.confirmAction.type === 'reset') {
      await handleSendTempPassword(uiState.confirmAction.emp)
    }

    dispatchUi({ type: 'setConfirmAction', payload: null })
  }

  const handleDeleteEmployee = async (emp: Employee) => {
    if (uiState.deleteConfirmEmail !== emp.email) {
      toast.error('Email does not match')
      return
    }

    try {
      dispatchUi({ type: 'setDeletingId', payload: emp.id })
      const res = await fetch('/api/admin/delete-employee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          employeeId: emp.id,
          confirmEmail: emp.email,
        }),
      })
      const data = await res.json()
      if (res.ok) {
        setEmployees((currentEmployees) => currentEmployees.filter((e) => e.id !== emp.id))
        toast.success(`${emp.full_name} has been permanently deleted`)
        dispatchUi({ type: 'setDeleteConfirm', payload: { id: null, email: '' } })
      } else {
        toast.error(data.error || 'Failed to delete employee')
      }
    } catch (err: unknown) {
      toast.error('Error: ' + (err instanceof Error ? err.message : String(err)))
    } finally {
      dispatchUi({ type: 'setDeletingId', payload: null })
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
        manager_id: editingEmployee.manager_id,
      })
      .eq('id', editingEmployee.id)

    if (!error) {
      setEmployees((currentEmployees) =>
        currentEmployees.map((emp) => (emp.id === editingEmployee.id ? editingEmployee : emp)),
      )
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

        {showAddForm && (
          <StaffAddEmployeeForm
            loading={loading}
            newEmployee={newEmployee}
            initialRoles={initialRoles}
            initialDepts={initialDepts}
            initialLocations={initialLocations}
            onSubmit={handleAddEmployee}
            onChange={(updates) => setNewEmployee((prev) => ({ ...prev, ...updates }))}
            onToggleDepartment={toggleDepartment}
          />
        )}

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
            {employees.map((emp) => (
              <tr
                key={emp.id}
                className={
                  emp.is_active === false ? 'hover:bg-slate-50 opacity-60' : 'hover:bg-slate-50'
                }
              >
                <td
                  className={`px-4 py-3 font-medium ${emp.is_active === false ? 'line-through text-slate-400' : ''}`}
                >
                  {emp.full_name}
                  <div className="text-xs text-slate-400 font-normal">{emp.email}</div>
                </td>

                {editingEmployee?.id === emp.id ? (
                  <>
                    <td className="px-2 py-3">
                      <select
                        className="border rounded p-1 w-full"
                        value={editingEmployee.role_id || ''}
                        onChange={(e) =>
                          setEditingEmployee({ ...editingEmployee, role_id: e.target.value })
                        }
                      >
                        <option value="">- Role -</option>
                        {initialRoles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {r.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <select
                        className="border rounded p-1 w-full"
                        value={editingEmployee.location_id || ''}
                        onChange={(e) =>
                          setEditingEmployee({ ...editingEmployee, location_id: e.target.value })
                        }
                      >
                        <option value="">- Branch -</option>
                        {initialLocations.map((l) => (
                          <option key={l.id} value={l.id}>
                            {l.name}
                          </option>
                        ))}
                      </select>
                    </td>
                    <td className="px-2 py-3">
                      <span className="text-xs text-gray-400 italic">Manage via Profile</span>
                    </td>
                    <td className="px-2 py-3" />
                    <td className="px-4 py-3 flex gap-2">
                      <button
                        type="button"
                        onClick={handleUpdateEmployee}
                        className="text-green-600 font-bold hover:underline"
                      >
                        Save
                      </button>
                      <button
                        type="button"
                        onClick={() => setEditingEmployee(null)}
                        className="text-slate-400 hover:underline"
                      >
                        Cancel
                      </button>
                    </td>
                  </>
                ) : (
                  <>
                    <td className="px-4 py-3">
                      {(emp.role_id ? rolesById.get(emp.role_id) : undefined) || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {(emp.location_id ? locationsById.get(emp.location_id) : undefined) || '-'}
                    </td>
                    <td className="px-4 py-3">
                      {(emp.department_id ? departmentsById.get(emp.department_id) : undefined) ||
                        '-'}
                    </td>
                    <td className="px-4 py-3">
                      {emp.is_active === false ? (
                        <span className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs font-semibold">
                          Disabled
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs font-semibold">
                          Active
                        </span>
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
                          onClick={() =>
                            dispatchUi({ type: 'setConfirmAction', payload: { type: 'reset', emp } })
                          }
                          disabled={loading || uiState.resettingId === emp.id}
                          className="text-orange-600 hover:text-orange-800 font-medium disabled:opacity-50"
                        >
                          {uiState.resettingId === emp.id ? 'Sending...' : 'Reset'}
                        </button>

                        <button
                          onClick={() => handleDisableEnable(emp)}
                          disabled={uiState.togglingId === emp.id || loading}
                          className={`font-medium ${
                            emp.is_active === false
                              ? 'text-green-600 hover:text-green-800'
                              : 'text-yellow-600 hover:text-yellow-800'
                          } disabled:opacity-50`}
                        >
                          {uiState.togglingId === emp.id
                            ? 'Updating...'
                            : emp.is_active === false
                              ? 'Enable'
                              : 'Disable'}
                        </button>

                        {isSuperAdmin && (
                          <>
                            {uiState.deleteConfirmId === emp.id ? (
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
                                  value={uiState.deleteConfirmEmail}
                                  onChange={(e) =>
                                    dispatchUi({
                                      type: 'setDeleteConfirmEmail',
                                      payload: e.target.value,
                                    })
                                  }
                                  className="w-full p-2 border border-red-300 rounded mb-2 text-sm"
                                />
                                <div className="flex gap-2">
                                  <button
                                    onClick={() => handleDeleteEmployee(emp)}
                                    disabled={
                                      uiState.deletingId === emp.id ||
                                      uiState.deleteConfirmEmail !== emp.email
                                    }
                                    className="px-3 py-1 bg-red-600 text-white rounded text-sm font-bold hover:bg-red-700 disabled:opacity-50"
                                  >
                                    {uiState.deletingId === emp.id
                                      ? 'Deleting...'
                                      : 'Permanently Delete'}
                                  </button>
                                  <button
                                    onClick={() =>
                                      dispatchUi({
                                        type: 'setDeleteConfirm',
                                        payload: { id: null, email: '' },
                                      })
                                    }
                                    className="px-3 py-1 bg-slate-300 text-slate-700 rounded text-sm font-bold hover:bg-slate-400"
                                  >
                                    Cancel
                                  </button>
                                </div>
                              </div>
                            ) : (
                              <button
                                onClick={() =>
                                  dispatchUi({
                                    type: 'setDeleteConfirm',
                                    payload: { id: emp.id, email: '' },
                                  })
                                }
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
      <ConfirmationDialog
        isOpen={!!uiState.confirmAction}
        onClose={() => dispatchUi({ type: 'setConfirmAction', payload: null })}
        onConfirm={handleConfirmAction}
        title={
          uiState.confirmAction?.type === 'disable' ? 'Disable Employee' : 'Send Temporary Password'
        }
        message={
          uiState.confirmAction?.type === 'disable'
            ? `Disable ${uiState.confirmAction?.emp?.full_name}? They will not be able to log in.`
            : `Send a temporary password to ${uiState.confirmAction?.emp?.email}?`
        }
        confirmLabel={uiState.confirmAction?.type === 'disable' ? 'Disable' : 'Send'}
        cancelLabel="Cancel"
        type={uiState.confirmAction?.type === 'disable' ? 'danger' : 'warning'}
        isLoading={!!uiState.resettingId || !!uiState.togglingId || loading}
      />
    </div>
  )
}
