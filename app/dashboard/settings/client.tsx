'use client'
import { useState, useMemo, useEffect } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'

export default function SettingsClient({ currentUser, initialLocations, initialDepts, initialRoles, initialEmployees }: any) {
  const [activeTab, setActiveTab] = useState('security')
  const [locations, setLocations] = useState(initialLocations)
  const [employees, setEmployees] = useState(initialEmployees)
  
  // --- STATES FOR BRANCH EDITING ---
  const [newBranchName, setNewBranchName] = useState('')
  const [newBranchCode, setNewBranchCode] = useState('')
  const [editingBranch, setEditingBranch] = useState<any>(null)
  
  // --- STATES FOR STAFF EDITING ---
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

  // --- STATES FOR MY ACCOUNT (SECURITY) ---
  const [currentPass, setCurrentPass] = useState('')
  const [newPass, setNewPass] = useState('')
  const [confirmPass, setConfirmPass] = useState('')
  const [showCodes, setShowCodes] = useState<string[] | null>(null)
  const [backupCodeCount, setBackupCodeCount] = useState(0)

  // --- COMMON STATES ---
  const [loading, setLoading] = useState(false)
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
  const router = useRouter()

  // --- HELPER: PASSWORD STRENGTH ---
  const getPasswordStrengthIndicator = (pwd: string) => {
    const errors = [] as string[]
    if (pwd.length < 8) errors.push('at least 8 characters')
    if (!/[a-z]/.test(pwd)) errors.push('a lowercase letter')
    if (!/[A-Z]/.test(pwd)) errors.push('an uppercase letter')
    if (!/[0-9]/.test(pwd)) errors.push('a number')
    if (!/[!@#$%^&*(),.?":{}|<>\-_=+\\/\[\];']/.test(pwd)) errors.push('a special character')
    const strength = 5 - errors.length
    return { strength, errors }
  }

  // ------------------------------------------------------------------
  // ACTION: MY ACCOUNT (Logic ported from account page)
  // ------------------------------------------------------------------
  
  // Fetch backup code count when tab is active
  useEffect(() => {
    if (activeTab === 'security' && currentUser) {
      fetch(`/api/auth/backup-codes/count?userId=${currentUser.id}`)
        .then(res => res.json())
        .then(data => setBackupCodeCount(data.count || 0))
        .catch(() => {})
    }
  }, [activeTab, currentUser])

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault()
    if (newPass !== confirmPass) return toast.error("New passwords do not match")

    const { strength, errors } = getPasswordStrengthIndicator(newPass)
    if (errors.length > 0) return toast.error('Password too weak', { description: errors[0] })
    
    setLoading(true)

    // 1. Verify Current Password first
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: currentUser.email,
      password: currentPass
    })

    if (signInError) {
      setLoading(false)
      return toast.error("Incorrect current password.")
    }

    // 2. Update to New Password
    const { error: updateError } = await supabase.auth.updateUser({
      password: newPass
    })

    if (updateError) {
      toast.error("Failed to update password: " + updateError.message)
    } else {
      toast.success("Password updated successfully!")
      setCurrentPass('')
      setNewPass('')
      setConfirmPass('')
    }
    setLoading(false)
  }

  const handleReset2FA = async () => {
    if (!confirm("Are you sure? This will disable your current Authenticator codes and require you to setup 2FA again.")) return;
    setLoading(true)
    const res = await fetch('/api/auth/reset-2fa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id }),
    })
    if (res.ok) {
      toast.success("2FA reset successfully")
      router.push('/login/setup-2fa')
    } else {
      const data = await res.json()
      toast.error("Failed to reset 2FA", { description: data?.error })
    }
    setLoading(false)
  }

  const handleGenerateBackupCodes = async () => {
    if (!confirm('Generate new backup codes? Previous codes will be invalidated.')) return
    setLoading(true)
    const res = await fetch('/api/auth/generate-backup-codes', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: currentUser.id, count: 10 }),
    })
    const data = await res.json()
    if (res.ok) {
      setShowCodes(data.codes || [])
      setBackupCodeCount(10)
      toast.success("New backup codes generated")
    } else {
      toast.error('Generation failed', { description: data?.error })
    }
    setLoading(false)
  }

  const handleCopyBackupCodes = async () => {
    if (!showCodes) return
    await navigator.clipboard.writeText(showCodes.join('\n'))
    toast.success('Copied to clipboard')
  }

  const handleDownloadBackupCodes = () => {
    if (!showCodes) return
    const text = 'Piyam Travels - Backup Codes\n' + showCodes.join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'backup-codes.txt'
    a.click()
  }

  // --- ACTION: AVATAR UPLOAD ---
  const handleAvatarUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!e.target.files || e.target.files.length === 0) return
    
    const file = e.target.files[0]
    const fileExt = file.name.split('.').pop()
    const filePath = `${currentUser.id}/avatar.${fileExt}`

    setLoading(true)
    const { error: uploadError } = await supabase.storage
      .from('avatars')
      .upload(filePath, file, { upsert: true })

    if (uploadError) {
      toast.error("Upload failed", { description: uploadError.message })
    } else {
      const { error: updateError } = await supabase.auth.updateUser({
        data: { avatar_updated: new Date().toISOString() }
      })
      
      if (!updateError) {
        toast.success("Profile picture updated!", { description: "Refresh the page to see changes." })
        router.refresh()
      }
    }
    setLoading(false)
  }

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
      router.refresh()
    } else {
      toast.error('Error updating branch', { description: error.message })
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
        toast.success('User created');
        setShowAddForm(false);
        setNewEmployee({ firstName: '', lastName: '', email: '', role_id: '', department_ids: [], location_id: '' });
        router.refresh(); 
      } else {
        toast.error('Failed to create user', { description: data.error || 'Unknown error' });
      }
    } catch (err) { toast.error('Network Error'); }
    setLoading(false)
  }

  // Admin helper to trigger reset-password endpoint
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
      router.refresh()
    } else {
      toast.error('Failed to update employee', { description: error.message })
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
      toast.error('Error moving employee', { description: error.message })
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
          
          <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider">
            My Account
          </div>
          <button 
            onClick={() => setActiveTab('security')}
            className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${activeTab === 'security' ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' : 'border-transparent hover:bg-slate-50 text-slate-600'}`}
          >
            Security & Password
          </button>

          <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider border-t">
            Organization
          </div>
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
        
        {/* --- TAB: SECURITY (MY ACCOUNT) --- */}
        {activeTab === 'security' && (
          <div className="space-y-6 animate-fade-in">
            <div className="flex justify-between items-center">
              <h2 className="text-xl font-bold text-slate-800">Profile & Security</h2>
              <button className="text-red-600 text-sm hover:underline" onClick={() => toast.info('This feature requires backend session management implementation.')}>Sign out of all other devices</button>
            </div>

            {/* 0. AVATAR UPLOAD (Placeholder) */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex items-center gap-6">
              <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center text-2xl font-bold text-slate-400 border-2 border-dashed border-slate-300">
                {currentUser.email?.charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-bold text-slate-800">Profile Picture</h3>
                <p className="text-sm text-slate-500 mb-3">Upload a new avatar. JPG, GIF or PNG.</p>
                <button 
                  onClick={() => toast.info('Avatar upload requires Supabase Storage setup.')}
                  className="px-4 py-2 bg-white border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 transition"
                >
                  Upload New Picture
                </button>
              </div>
            </div>
              {/* 0. AVATAR UPLOAD */}
              <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200 flex items-center gap-6">
                  <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center text-2xl font-bold text-slate-400 border-2 border-dashed border-slate-300 overflow-hidden relative">
                      {/* Display current avatar if available, else initials */}
                      <img 
                        src={`${process.env.NEXT_PUBLIC_SUPABASE_URL}/storage/v1/object/public/avatars/${currentUser.id}/avatar.png?t=${new Date().getTime()}`}
                        onError={(e) => e.currentTarget.style.display = 'none'}
                        className="absolute inset-0 w-full h-full object-cover"
                        alt="Avatar"
                      />
                      <span>{currentUser.email?.charAt(0).toUpperCase()}</span>
                  </div>
                  <div>
                      <h3 className="font-bold text-slate-800">Profile Picture</h3>
                      <p className="text-sm text-slate-500 mb-3">Upload a new avatar. JPG or PNG.</p>
                    
                      <label className="cursor-pointer px-4 py-2 bg-white border border-slate-300 rounded text-sm font-medium hover:bg-slate-50 transition">
                          Upload New Picture
                          <input 
                            type="file" 
                            accept="image/*" 
                            className="hidden" 
                            onChange={handleAvatarUpload}
                            disabled={loading}
                          />
                      </label>
                  </div>
              </div>
            
            {/* 1. PASSWORD CHANGE */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <span>🔒</span> Change Password
              </h3>
              <form onSubmit={handlePasswordChange} className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Current Password</label>
                  <input 
                    type="password" required 
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={currentPass} onChange={e => setCurrentPass(e.target.value)}
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">New Password</label>
                  <input 
                    type="password" required 
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={newPass} onChange={e => setNewPass(e.target.value)}
                  />

                  {/* PASSWORD METER UI */}
                  {newPass && (
                    <div className="mt-2">
                      <div className="flex gap-1 h-1.5 mb-1">
                        {[1,2,3,4,5].map(step => (
                          <div key={step} className={`flex-1 rounded-full transition-all duration-300 ${
                            getPasswordStrengthIndicator(newPass).strength >= step 
                              ? (getPasswordStrengthIndicator(newPass).strength < 3 ? 'bg-red-500' : 'bg-green-500') 
                              : 'bg-slate-200'
                          }`}></div>
                        ))}
                      </div>
                      <p className="text-xs text-slate-500 text-right">
                        {getPasswordStrengthIndicator(newPass).strength < 3 ? 'Weak Password' : 'Strong Password'}
                      </p>
                    </div>
                  )}
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">Confirm New Password</label>
                  <input 
                    type="password" required minLength={6}
                    className="w-full p-2 border rounded focus:ring-2 focus:ring-blue-500 outline-none"
                    value={confirmPass} onChange={e => setConfirmPass(e.target.value)}
                  />
                </div>
                <button 
                  type="submit" disabled={loading}
                  className="bg-blue-900 text-white px-6 py-2 rounded hover:bg-blue-800 font-medium transition"
                >
                  {loading ? 'Updating...' : 'Update Password'}
                </button>
              </form>
            </div>

            {/* 2. 2FA SECTION */}
            <div className="bg-white p-6 rounded-lg shadow-sm border border-slate-200">
              <h3 className="text-lg font-bold text-slate-800 mb-4 flex items-center gap-2">
                <svg className="w-5 h-5 text-blue-600" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" /></svg>
                Two-Factor Authentication
              </h3>
              
              <div className="flex items-start gap-4">
                <div className="bg-green-50 text-green-700 p-4 rounded-lg border border-green-100 flex-1">
                  <p className="font-bold">Status: Active</p>
                  <p className="text-sm mt-1">Your account is secured with Google Authenticator.</p>
                </div>
              </div>

              <div className="mt-6">
                <p className="text-sm text-slate-600 mb-3">Lost your phone or need to re-configure?</p>
                <div className="flex gap-3 items-center flex-wrap">
                  <button 
                    onClick={handleReset2FA}
                    disabled={loading}
                    className="border border-red-200 text-red-600 bg-red-50 px-4 py-2 rounded hover:bg-red-100 font-medium transition text-sm"
                  >
                    Re-install 2FA Keys
                  </button>
                  <button
                    onClick={handleGenerateBackupCodes}
                    disabled={loading}
                    className="border border-slate-200 text-slate-700 bg-white px-4 py-2 rounded hover:bg-slate-50 font-medium transition text-sm"
                  >
                    Generate Backup Codes
                  </button>
                </div>
                
                {!showCodes && backupCodeCount > 0 && (
                  <div className="mt-4 p-3 bg-blue-50 border border-blue-200 rounded text-sm text-blue-700">
                    <p><strong>Remaining backup codes:</strong> {backupCodeCount} unused</p>
                  </div>
                )}
                
                {showCodes && (
                  <div className="mt-4 p-4 bg-yellow-50 border border-yellow-100 rounded">
                    <div className="flex items-center justify-between mb-3">
                      <p className="font-bold">Backup codes (save these now — shown only once):</p>
                      <div className="flex gap-2">
                        <button onClick={handleCopyBackupCodes} className="text-xs bg-white border border-yellow-200 px-2 py-1 rounded hover:bg-yellow-100 transition">📋 Copy</button>
                        <button onClick={handleDownloadBackupCodes} className="text-xs bg-white border border-yellow-200 px-3 py-1.5 rounded hover:bg-yellow-100 transition">⬇️ Download</button>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {showCodes.map((c, idx) => (
                        <div key={idx} className="font-mono text-sm bg-white p-2 rounded border select-all">{c}</div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

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
                              <button
                                onClick={async () => {
                                  if (!confirm(`Send a temporary password to ${emp.email}?`)) return
                                  try {
                                    setResettingId(emp.id)
                                    const resp = await adminResetPassword({ employee_id: emp.id })
                                    alert(resp.message || 'Temporary password emailed')
                                  } catch (err: any) {
                                    alert('Error: ' + (err.message || err))
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
