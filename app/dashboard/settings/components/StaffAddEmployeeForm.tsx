type Role = {
  id: string
  name: string
}

type Department = {
  id: string
  name: string
}

type Location = {
  id: string
  name: string
}

type NewEmployee = {
  firstName: string
  lastName: string
  email: string
  role_id: string
  department_ids: string[]
  location_id: string
}

type StaffAddEmployeeFormProps = {
  loading: boolean
  newEmployee: NewEmployee
  initialRoles: Role[]
  initialDepts: Department[]
  initialLocations: Location[]
  onSubmit: (e: React.FormEvent) => void
  onChange: (updates: Partial<NewEmployee>) => void
  onToggleDepartment: (deptId: string) => void
}

export function StaffAddEmployeeForm({
  loading,
  newEmployee,
  initialRoles,
  initialDepts,
  initialLocations,
  onSubmit,
  onChange,
  onToggleDepartment,
}: StaffAddEmployeeFormProps) {
  return (
    <div className="p-6 bg-blue-50 border-b border-blue-100 animate-fade-in">
      <h4 className="font-bold text-blue-900 mb-4">New Employee Details</h4>
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <input
            placeholder="First Name"
            required
            className="p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            value={newEmployee.firstName}
            onChange={(e) => onChange({ firstName: e.target.value })}
          />
          <input
            placeholder="Last Name"
            required
            className="p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            value={newEmployee.lastName}
            onChange={(e) => onChange({ lastName: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 gap-4">
          <input
            type="email"
            placeholder="Email Address"
            required
            className="p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
            value={newEmployee.email}
            onChange={(e) => onChange({ email: e.target.value })}
          />
          <select
            required
            className="p-2 border rounded bg-white focus:ring-2 focus:ring-blue-500 outline-none"
            value={newEmployee.role_id}
            onChange={(e) => onChange({ role_id: e.target.value })}
          >
            <option value="">Select Role</option>
            {initialRoles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </div>

        <div className="bg-white p-4 border rounded-lg">
          <label className="block text-xs font-bold text-slate-500 uppercase mb-3">
            Assign Departments
          </label>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            {initialDepts.map((d) => (
              <label
                key={d.id}
                className="flex items-center gap-2 text-sm cursor-pointer p-2 hover:bg-slate-50 rounded border border-transparent hover:border-slate-200 transition"
              >
                <input
                  type="checkbox"
                  value={d.id}
                  checked={newEmployee.department_ids.includes(d.id)}
                  onChange={() => onToggleDepartment(d.id)}
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
          onChange={(e) => onChange({ location_id: e.target.value })}
        >
          <option value="">Select Branch (Optional)</option>
          {initialLocations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>

        <button
          disabled={loading}
          className="w-full bg-blue-900 text-white py-3 rounded hover:bg-blue-800 font-bold transition-colors disabled:opacity-50"
        >
          {loading ? 'Creating Account & Sending Email...' : 'Create Account'}
        </button>
      </form>
    </div>
  )
}
