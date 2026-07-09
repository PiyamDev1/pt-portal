/**
 * Settings Client
 * Tabbed admin settings interface for security, staffing, hierarchy,
 * branches, maintenance, and issue-report administration.
 */
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { FrappeProvisioningTab } from './components/FrappeProvisioningTab'
import { NoticeBoardTab } from './components/NoticeBoardTab'
import { ServerControlTab } from './components/ServerControlTab'
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
  const searchParams = useSearchParams()
  const normalizedRole = userRole.trim().toLowerCase()
  const isSuperAdmin = normalizedRole === 'super admin'
  // Organization admins can manage hierarchy/staff/branches.
  const isOrgAdmin = ['admin', 'master admin', 'super admin'].includes(normalizedRole)
  // Maintenance admins can access maintenance and document migration tooling.
  const canAccessMaintenance = [
    'maintenance admin',
    'admin',
    'master admin',
    'super admin',
  ].includes(normalizedRole)
  const canManageIssueReports = ['master admin', 'super admin'].includes(normalizedRole)
  const hasAdminConsole = isOrgAdmin || canAccessMaintenance

  const requestedTab = searchParams.get('tab')
  const [activeTab, setActiveTab] = useState(
    requestedTab || (hasAdminConsole ? 'admin-overview' : 'security'),
  )
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!requestedTab) return undefined
    const frame = window.requestAnimationFrame(() => setActiveTab(requestedTab))
    return () => window.cancelAnimationFrame(frame)
  }, [requestedTab])

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
    <div className="flex min-h-screen flex-col gap-4 md:flex-row md:gap-8">
      {/* Sidebar Navigation */}
      <div className="w-full flex-shrink-0 md:w-64">
        <div className="sticky top-20 z-20 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow md:top-24 md:block md:overflow-hidden md:rounded-lg md:p-0">
          <div className="hidden px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 md:block md:border-b md:border-slate-200 md:bg-slate-100">
            My Account
          </div>
          <button
            onClick={() => setActiveTab('security')}
            className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
              activeTab === 'security'
                ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
            }`}
          >
            Security & Password
          </button>

          {hasAdminConsole && (
            <>
              <div className="hidden px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 md:block md:border-b md:border-t md:border-slate-200 md:bg-slate-100">
                Admin Console
              </div>
              <button
                onClick={() => setActiveTab('admin-overview')}
                className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                  activeTab === 'admin-overview'
                    ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                    : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                }`}
              >
                Overview
              </button>

              {canManageIssueReports && (
                <button
                  onClick={() => setActiveTab('issue-reports')}
                  className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                    activeTab === 'issue-reports'
                      ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                  }`}
                >
                  Issue Reports
                </button>
              )}

              {isOrgAdmin && (
                <button
                  onClick={() => setActiveTab('notice-board')}
                  className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                    activeTab === 'notice-board'
                      ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                      : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                  }`}
                >
                  Notice Board
                </button>
              )}

              {isOrgAdmin && (
                <>
                  <div className="hidden px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 md:block md:border-b md:border-t md:border-slate-200 md:bg-slate-100">
                    Organization
                  </div>
                  <button
                    onClick={() => setActiveTab('branches')}
                    className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                      activeTab === 'branches'
                        ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                    }`}
                  >
                    Branches & Locations
                  </button>
                  <button
                    onClick={() => setActiveTab('staff')}
                    className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                      activeTab === 'staff'
                        ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                    }`}
                  >
                    Staff Management
                  </button>
                  <button
                    onClick={() => setActiveTab('hierarchy')}
                    className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                      activeTab === 'hierarchy'
                        ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                    }`}
                  >
                    Hierarchy Tree
                  </button>
                  <button
                    onClick={() => setActiveTab('frappe-provisioning')}
                    className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                      activeTab === 'frappe-provisioning'
                        ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                    }`}
                  >
                    Frappe Transfer
                  </button>
                </>
              )}

              {canAccessMaintenance && (
                <>
                  <div className="hidden px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 md:block md:border-b md:border-t md:border-slate-200 md:bg-slate-100">
                    Maintenance
                  </div>
                  <button
                    onClick={() => setActiveTab('document-storage')}
                    className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                      activeTab === 'document-storage'
                        ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                    }`}
                  >
                    Document Storage
                  </button>
                  <button
                    onClick={() => setActiveTab('receipt-metrics')}
                    className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                      activeTab === 'receipt-metrics'
                        ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                    }`}
                  >
                    Receipt Metrics
                  </button>
                  <button
                    onClick={() => setActiveTab('maintenance')}
                    className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                      activeTab === 'maintenance'
                        ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                        : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                    }`}
                  >
                    Data Maintenance
                  </button>
                  {isSuperAdmin && (
                    <button
                      onClick={() => setActiveTab('server-control')}
                      className={`shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4 ${
                        activeTab === 'server-control'
                          ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
                      }`}
                    >
                      Server Control
                    </button>
                  )}
                </>
              )}

              {isOrgAdmin && (
                <>
                  <div className="hidden px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 md:block md:border-b md:border-t md:border-slate-200 md:bg-slate-100">
                    Others
                  </div>
                  <Link
                    href="/dashboard/pricing"
                    className="block shrink-0 rounded-xl border border-slate-200 px-4 py-3 text-left text-sm text-slate-600 hover:bg-slate-50 md:w-full md:rounded-none md:border-0 md:border-l-4 md:border-transparent"
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
            canControlServer={isSuperAdmin}
            onSelectTab={setActiveTab}
          />
        )}

        {activeTab === 'issue-reports' && canManageIssueReports && <IssueReportsTab />}

        {activeTab === 'notice-board' && isOrgAdmin && (
          <NoticeBoardTab
            roles={initialRoles as { id: string; name: string }[]}
            departments={initialDepts as { id: string; name: string }[]}
            locations={initialLocations as { id: string; name: string }[]}
          />
        )}

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
            initialLocations={
              initialLocations as {
                id: string
                name: string
                branch_code: string | null
                type: string
                appointments_enabled?: boolean | null
              }[]
            }
            supabase={supabase}
            loading={loading}
            setLoading={setLoading}
          />
        )}

        {activeTab === 'staff' && isOrgAdmin && (
          <StaffTab
            initialEmployees={
              initialEmployees as unknown as {
                id: string
                full_name: string
                email: string
                role_id: string | null
                department_id: string | null
                location_id: string | null
                manager_id?: string | null
                is_active?: boolean
              }[]
            }
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
            initialEmployees={
              initialEmployees as unknown as {
                id: string
                full_name: string
                manager_id: string | null
                role_id: string | null
                location_id: string | null
              }[]
            }
            initialRoles={initialRoles as { id: string; name: string }[]}
            initialLocations={initialLocations as { id: string; name: string }[]}
            supabase={supabase}
          />
        )}

        {activeTab === 'frappe-provisioning' && isOrgAdmin && <FrappeProvisioningTab />}

        {activeTab === 'document-storage' && canAccessMaintenance && (
          <DocumentMigrationOverviewTab />
        )}

        {activeTab === 'receipt-metrics' && canAccessMaintenance && <ReceiptMetricsTab />}

        {activeTab === 'maintenance' && canAccessMaintenance && <MaintenanceTab />}

        {activeTab === 'server-control' && isSuperAdmin && <ServerControlTab />}
      </div>
    </div>
  )
}
