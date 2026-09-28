/**
 * Settings Client
 * Tabbed admin settings interface for security, staffing, hierarchy,
 * branches, maintenance, and issue-report administration.
 */
'use client'
import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
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
import { TimeclockDevicesTab } from './components/TimeclockDevicesTab'
import { TicketingFlightApiTab } from './components/TicketingFlightApiTab'
import { ApprovalQueueTab } from './components/ApprovalQueueTab'
import { SettingsNavigation } from './components/SettingsNavigation'
import type { AuthUser } from '@/app/types/auth'
import { getBrowserSupabaseClient } from '@/lib/auth/browserSupabase'

interface EmployeeSummary {
  is_active?: boolean
}

interface SettingsClientProps {
  currentUser: AuthUser
  userRole: string
  userDepartments?: string[]
  initialLocations: unknown[]
  initialDepts: unknown[]
  initialRoles: unknown[]
  initialEmployees: EmployeeSummary[]
}

export default function SettingsClient({
  currentUser,
  userRole,
  userDepartments = [],
  initialLocations,
  initialDepts,
  initialRoles,
  initialEmployees,
}: SettingsClientProps) {
  const searchParams = useSearchParams()
  const normalizedRole = userRole.trim().toLowerCase()
  const isSuperAdmin = normalizedRole === 'super admin'
  const isMaintenanceAdmin = normalizedRole === 'maintenance admin'
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

  const supabase = getBrowserSupabaseClient()

  const employeeCount = Array.isArray(initialEmployees) ? initialEmployees.length : 0
  const activeEmployeeCount = Array.isArray(initialEmployees)
    ? initialEmployees.filter((employee) => employee.is_active !== false).length
    : 0
  const inactiveEmployeeCount = Math.max(employeeCount - activeEmployeeCount, 0)
  const branchCount = Array.isArray(initialLocations) ? initialLocations.length : 0
  const roleCount = Array.isArray(initialRoles) ? initialRoles.length : 0

  return (
    <div className="settings-mobile-layout flex min-h-screen flex-col gap-4 md:flex-row md:gap-8">
      <SettingsNavigation
        activeTab={activeTab}
        hasAdminConsole={hasAdminConsole}
        isOrgAdmin={isOrgAdmin}
        isMaintenanceAdmin={isMaintenanceAdmin}
        canAccessMaintenance={canAccessMaintenance}
        canManageIssueReports={canManageIssueReports}
        isSuperAdmin={isSuperAdmin}
        onSelectTab={setActiveTab}
      />

      {/* Main Content Area */}
      <div className="settings-mobile-content min-w-0 flex-1 space-y-6">
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

        {activeTab === 'approval-queue' && hasAdminConsole && (
          <ApprovalQueueTab
            canReview={isOrgAdmin}
            employees={
              initialEmployees as unknown as { id: string; full_name: string; email: string }[]
            }
            roles={initialRoles as { id: string; name: string }[]}
            departments={initialDepts as { id: string; name: string }[]}
            locations={initialLocations as { id: string; name: string }[]}
          />
        )}

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
            userRole={userRole}
            userDepartments={userDepartments}
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

        {activeTab === 'staff' && (isOrgAdmin || isMaintenanceAdmin) && (
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

        {activeTab === 'ticketing-flight-api' && isOrgAdmin && <TicketingFlightApiTab />}

        {activeTab === 'frappe-provisioning' && isOrgAdmin && <FrappeProvisioningTab />}

        {activeTab === 'document-storage' && canAccessMaintenance && (
          <DocumentMigrationOverviewTab />
        )}

        {activeTab === 'receipt-metrics' && canAccessMaintenance && <ReceiptMetricsTab />}

        {activeTab === 'maintenance' && canAccessMaintenance && (
          <MaintenanceTab canRunHighRiskActions={isOrgAdmin} />
        )}

        {activeTab === 'timeclock-devices' && isOrgAdmin && (
          <TimeclockDevicesTab locations={initialLocations as { id: string; name: string }[]} />
        )}

        {activeTab === 'server-control' && isSuperAdmin && <ServerControlTab />}
      </div>
    </div>
  )
}
