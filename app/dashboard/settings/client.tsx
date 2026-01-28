'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import SecurityTab from './components/SecurityTab'
import BranchesTab from './components/BranchesTab'
import StaffTab from './components/StaffTab'
import HierarchyTab from './components/HierarchyTab'
import { MaintenanceTab } from './components/MaintenanceTab'

export default function SettingsClient({ 
  currentUser, 
  userRole, 
  initialLocations, 
  initialDepts, 
  initialRoles, 
  initialEmployees 
}: any) {
  const [activeTab, setActiveTab] = useState('security')
  const [loading, setLoading] = useState(false)
  
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // Only Master Admin and Admin roles can edit organization settings
  const isAdmin = ['Admin', 'Master Admin'].includes(userRole)

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
            className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
              activeTab === 'security' 
                ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' 
                : 'border-transparent hover:bg-slate-50 text-slate-600'
            }`}
          >
            Security & Password
          </button>

          {isAdmin && (
            <>
              <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider border-t">
                Organization
              </div>
              <button 
                onClick={() => setActiveTab('branches')}
                className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                  activeTab === 'branches' 
                    ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' 
                    : 'border-transparent hover:bg-slate-50 text-slate-600'
                }`}
              >
                Branches & Locations
              </button>
              <button 
                onClick={() => setActiveTab('staff')}
                className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                  activeTab === 'staff' 
                    ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' 
                    : 'border-transparent hover:bg-slate-50 text-slate-600'
                }`}
              >
                Staff Management
              </button>
              <button 
                onClick={() => setActiveTab('hierarchy')}
                className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                  activeTab === 'hierarchy' 
                    ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' 
                    : 'border-transparent hover:bg-slate-50 text-slate-600'
                }`}
              >
                Hierarchy Tree
              </button>
              <button 
                onClick={() => setActiveTab('maintenance')}
                className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                  activeTab === 'maintenance' 
                    ? 'border-blue-900 bg-blue-50 font-medium text-blue-900' 
                    : 'border-transparent hover:bg-slate-50 text-slate-600'
                }`}
              >
                Data Maintenance
              </button>
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 space-y-6">
        {activeTab === 'security' && (
          <SecurityTab 
            currentUser={currentUser} 
            supabase={supabase}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {activeTab === 'branches' && isAdmin && (
          <BranchesTab 
            initialLocations={initialLocations}
            supabase={supabase}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {activeTab === 'staff' && isAdmin && (
          <StaffTab 
            initialEmployees={initialEmployees}
            initialRoles={initialRoles}
            initialDepts={initialDepts}
            initialLocations={initialLocations}
            supabase={supabase}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {activeTab === 'hierarchy' && isAdmin && (
          <HierarchyTab 
            initialEmployees={initialEmployees}
            initialRoles={initialRoles}
            initialLocations={initialLocations}
            supabase={supabase}
          />
        )}

        {activeTab === 'maintenance' && isAdmin && (
          <MaintenanceTab />
        )}
      </div>
    </div>
  )
}
