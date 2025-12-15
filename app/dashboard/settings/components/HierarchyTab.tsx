'use client'
import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface HierarchyTabProps {
  initialEmployees: any[]
  initialRoles: any[]
  initialLocations: any[]
  supabase: any
}

export default function HierarchyTab({ 
  initialEmployees, 
  initialRoles, 
  initialLocations,
  supabase 
}: HierarchyTabProps) {
  const router = useRouter()
  const [employees, setEmployees] = useState(initialEmployees)

  const handleUpdateManager = async (employeeId: string, newManagerId: string) => {
    const { error } = await supabase
      .from('employees')
      .update({ manager_id: newManagerId === 'null' ? null : newManagerId })
      .eq('id', employeeId)

    if (!error) {
      setEmployees(employees.map((e: any) => 
        e.id === employeeId ? { ...e, manager_id: newManagerId === 'null' ? null : newManagerId } : e
      ))
      toast.success('Manager updated successfully')
      router.refresh()
    } else {
      toast.error('Error moving employee', { description: error.message })
    }
  }

  const EmployeeNode = ({ employee, level }: { employee: any, level: number }) => {
    const directReports = employees.filter((e: any) => e.manager_id === employee.id)
    
    return (
      <div className="mb-2 relative">
        <div className={`flex items-center gap-3 p-3 rounded-lg border border-slate-200 bg-white shadow-sm hover:border-blue-300 transition-colors ml-${level * 6}`} 
             style={{ marginLeft: `${level * 2}rem` }}>
          
          {level > 0 && (
            <div className="absolute -left-4 top-1/2 w-4 h-px bg-slate-300"></div>
          )}

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

          <select 
            className="text-xs border rounded p-1 bg-slate-50 text-slate-600 focus:ring-2 focus:ring-blue-500 outline-none w-40"
            value={employee.manager_id || 'null'}
            onChange={(e) => handleUpdateManager(employee.id, e.target.value)}
          >
            <option value="null">No Manager (Root)</option>
            {employees
              .filter((m: any) => m.id !== employee.id)
              .map((m: any) => (
              <option key={m.id} value={m.id}>Report to: {m.full_name}</option>
            ))}
          </select>
        </div>

        <div className="border-l-2 border-slate-100 ml-4">
          {directReports.map((report: any) => (
            <EmployeeNode key={report.id} employee={report} level={level + 1} />
          ))}
        </div>
      </div>
    )
  }

  const rootEmployees = useMemo(() => employees.filter((e: any) => !e.manager_id), [employees])

  return (
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
  )
}
