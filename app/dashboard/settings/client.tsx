/**
 * Settings Client
 * Tabbed admin settings interface for security, staffing, hierarchy,
 * branches, maintenance, and issue-report administration.
 */
'use client'
import { useState } from 'react'
import { createBrowserClient } from '@supabase/auth-helpers-nextjs'
import SecurityTab from './components/SecurityTab'
import BranchesTab from './components/BranchesTab'
import StaffTab from './components/StaffTab'
import HierarchyTab from './components/HierarchyTab'
import { AdminOverviewTab } from './components/AdminOverviewTab'
import { DocumentMigrationOverviewTab } from './components/DocumentMigrationOverviewTab'
import { ReceiptMetricsTab } from './components/ReceiptMetricsTab'
import { MaintenanceTab } from './components/MaintenanceTab'
import { IssueReportsTab } from './components/IssueReportsTab'
import Link from 'next/link'
import type { AuthUser } from '@/app/types/auth'

interface EmployeeSummary {
  is_active?: boolean
}

interface SettingsClientProps {
  currentUser: AuthUser
  userRole: string
  initialLocations: unknown[]
  initialDepts: unknown[]
  initialRoles: unknown[]
  initialEmployees: EmployeeSummary[]
}

export default function SettingsClient({
  currentUser,
  userRole,
  initialLocations,
  initialDepts,
  initialRoles,
  initialEmployees,
}: SettingsClientProps) {
  // Organization admins can manage hierarchy/staff/branches.
  const isOrgAdmin = ['Admin', 'Master Admin'].includes(userRole)
  // Maintenance admins can access maintenance and document migration tooling.
  const canAccessMaintenance = ['Maintenance Admin', 'Admin', 'Master Admin'].includes(userRole)
  const canManageIssueReports = userRole === 'Master Admin'
  const hasAdminConsole = isOrgAdmin || canAccessMaintenance

  const [activeTab, setActiveTab] = useState(hasAdminConsole ? 'admin-overview' : 'security')
  const [loading, setLoading] = useState(false)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
  )

  const employeeCount = Array.isArray(initialEmployees) ? initialEmployees.length : 0
  const activeEmployeeCount = Array.isArray(initialEmployees)
    ? initialEmployees.filter((employee) => employee.is_active !== false).length
    : 0
  const inactiveEmployeeCount = Math.max(employeeCount - activeEmployeeCount, 0)
  const branchCount = Array.isArray(initialLocations) ? initialLocations.length : 0
  const roleCount = Array.isArray(initialRoles) ? initialRoles.length : 0

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

          {hasAdminConsole && (
            <>
              <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider border-t">
                Admin Console
              </div>
              <button
                onClick={() => setActiveTab('admin-overview')}
                className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                  activeTab === 'admin-overview'
                    ? 'border-blue-900 bg-blue-50 font-medium text-blue-900'
                    : 'border-transparent hover:bg-slate-50 text-slate-600'
                }`}
              >
                Overview
              </button>

              {canManageIssueReports && (
                <button
                  onClick={() => setActiveTab('issue-reports')}
                  className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                    activeTab === 'issue-reports'
                      ? 'border-blue-900 bg-blue-50 font-medium text-blue-900'
                      : 'border-transparent hover:bg-slate-50 text-slate-600'
                  }`}
                >
                  Issue Reports
                </button>
              )}

              {isOrgAdmin && (
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
                </>
              )}

              {canAccessMaintenance && (
                <>
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider border-t">
                    Maintenance
                  </div>
                  <button
                    onClick={() => setActiveTab('document-storage')}
                    className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                      activeTab === 'document-storage'
                        ? 'border-blue-900 bg-blue-50 font-medium text-blue-900'
                        : 'border-transparent hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    Document Storage
                  </button>
                  <button
                    onClick={() => setActiveTab('receipt-metrics')}
                    className={`w-full text-left px-4 py-3 border-l-4 transition-colors ${
                      activeTab === 'receipt-metrics'
                        ? 'border-blue-900 bg-blue-50 font-medium text-blue-900'
                        : 'border-transparent hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    Receipt Metrics
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

              {isOrgAdmin && (
                <>
                  <div className="px-4 py-3 bg-slate-100 border-b border-slate-200 text-xs font-bold text-slate-500 uppercase tracking-wider border-t">
                    Others
                  </div>
                  <Link
                    href="/dashboard/pricing"
                    className="w-full text-left px-4 py-3 border-l-4 border-transparent hover:bg-slate-50 text-slate-600 block"
                  >
                    Pricing Management
                  </Link>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 space-y-6">
        {activeTab === 'admin-overview' && hasAdminConsole && (
          <AdminOverviewTab
            userRole={userRole}
            employeeCount={employeeCount}
            activeEmployeeCount={activeEmployeeCount}
            inactiveEmployeeCount={inactiveEmployeeCount}
            branchCount={branchCount}
            roleCount={roleCount}
            canManageOrganization={isOrgAdmin}
            canAccessMaintenance={canAccessMaintenance}
            canManageIssueReports={canManageIssueReports}
            onSelectTab={setActiveTab}
          />
        )}

        {activeTab === 'issue-reports' && canManageIssueReports && <IssueReportsTab />}

        {activeTab === 'security' && (
          <SecurityTab
            currentUser={currentUser}
            supabase={supabase}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {activeTab === 'branches' && isOrgAdmin && (
          <BranchesTab
            initialLocations={initialLocations as { id: string; name: string; branch_code: string | null; type: string }[]}
            supabase={supabase}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {activeTab === 'staff' && isOrgAdmin && (
          <StaffTab
            initialEmployees={initialEmployees as unknown as { id: string; full_name: string; email: string; role_id: string | null; department_id: string | null; location_id: string | null; manager_id?: string | null; is_active?: boolean }[]}
            initialRoles={initialRoles as { id: string; name: string }[]}
            initialDepts={initialDepts as { id: string; name: string }[]}
            initialLocations={initialLocations as { id: string; name: string }[]}
            supabase={supabase}
            userRole={userRole}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {activeTab === 'hierarchy' && isOrgAdmin && (
          <HierarchyTab
            initialEmployees={initialEmployees as unknown as { id: string; full_name: string; manager_id: string | null; role_id: string | null; location_id: string | null }[]}
            initialRoles={initialRoles as { id: string; name: string }[]}
            initialLocations={initialLocations as { id: string; name: string }[]}
            supabase={supabase}
          />
        )}

        {activeTab === 'document-storage' && canAccessMaintenance && (
          <DocumentMigrationOverviewTab />
        )}

        {activeTab === 'receipt-metrics' && canAccessMaintenance && <ReceiptMetricsTab />}

        {activeTab === 'maintenance' && canAccessMaintenance && <MaintenanceTab />}

      </div>
    </div>
  )
}
