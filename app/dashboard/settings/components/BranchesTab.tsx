'use client'
import { useState } from 'react'
import { toast } from 'sonner'
import { useRouter } from 'next/navigation'

interface BranchesTabProps {
  initialLocations: any[]
  supabase: any
  loading: boolean
  setLoading: (loading: boolean) => void
}

export default function BranchesTab({ initialLocations, supabase, loading, setLoading }: BranchesTabProps) {
  const router = useRouter()
  const [locations, setLocations] = useState(initialLocations)
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchCode, setNewBranchCode] = useState('')
  const [editingBranch, setEditingBranch] = useState<any>(null)

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
      toast.success('Branch added successfully')
    } else {
      toast.error('Error adding branch', { description: error?.message })
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
      toast.success('Branch updated successfully')
      router.refresh()
    } else {
      toast.error('Error updating branch', { description: error.message })
    }
    setLoading(false)
  }

  return (
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
  )
}
