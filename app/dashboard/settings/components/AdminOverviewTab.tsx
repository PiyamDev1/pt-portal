'use client'

import { ArrowRight, Database, GitBranch, Network, ShieldCheck, Users } from 'lucide-react'

type AdminOverviewTabProps = {
  userRole: string
  employeeCount: number
  activeEmployeeCount: number
  inactiveEmployeeCount: number
  branchCount: number
  roleCount: number
  canManageOrganization: boolean
  canAccessMaintenance: boolean
  canManageIssueReports: boolean
  onSelectTab: (tab: string) => void
}

type QuickAction = {
  id: string
  title: string
  description: string
  icon: typeof Users
  visible: boolean
}

function StatCard({
  label,
  value,
  tone = 'slate',
}: {
  label: string
  value: string | number
  tone?: 'slate' | 'green' | 'amber' | 'blue'
}) {
  const tones = {
    slate: 'border-slate-200 bg-white text-slate-900',
    green: 'border-green-200 bg-green-50 text-green-900',
    amber: 'border-amber-200 bg-amber-50 text-amber-900',
    blue: 'border-blue-200 bg-blue-50 text-blue-900',
  }

  return (
    <div className={`rounded-xl border p-4 ${tones[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-2 text-2xl font-bold">{value}</p>
    </div>
  )
}

export function AdminOverviewTab({
  userRole,
  employeeCount,
  activeEmployeeCount,
  inactiveEmployeeCount,
  branchCount,
  roleCount,
  canManageOrganization,
  canAccessMaintenance,
  canManageIssueReports,
  onSelectTab,
}: AdminOverviewTabProps) {
  const quickActions: QuickAction[] = [
    {
      id: 'staff',
      title: 'Staff Management',
      description: 'Invite employees, change roles, reset passwords, and control account access.',
      icon: Users,
      visible: canManageOrganization,
    },
    {
      id: 'branches',
      title: 'Branches & Locations',
      description: 'Maintain operational branches, codes, and location assignments.',
      icon: GitBranch,
      visible: canManageOrganization,
    },
    {
      id: 'hierarchy',
      title: 'Hierarchy Tree',
      description: 'Review reporting lines and move employees to the correct manager.',
      icon: Network,
      visible: canManageOrganization,
    },
    {
      id: 'issue-reports',
      title: 'Issue Reports',
      description: 'Review user-submitted faults, screenshots, and browser console logs.',
      icon: ShieldCheck,
      visible: canManageIssueReports,
    },
    {
      id: 'document-storage',
      title: 'Document Storage',
      description:
        'Monitor EU Server 49v2 and EU Server 45v5 health, backlog, and migration activity.',
      icon: ShieldCheck,
      visible: canAccessMaintenance,
    },
    {
      id: 'maintenance',
      title: 'Data Maintenance',
      description: 'Run controlled maintenance tasks and review the result before wider changes.',
      icon: Database,
      visible: canAccessMaintenance,
    },
  ]

  const roleSummary = canManageOrganization
    ? 'You can manage organization structure, employee accounts, and maintenance tooling from one place.'
    : 'You have maintenance-scoped access for operational tooling without full organization control.'

  return (
    <div className="space-y-6" data-testid="admin-overview-tab">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-blue-950 p-6 text-white shadow-sm">
        <div className="flex flex-col gap-6 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-3xl">
            <div className="inline-flex items-center rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-slate-200">
              Admin Console
            </div>
            <h2 className="mt-4 text-3xl font-bold tracking-tight">
              Operations, access, and maintenance
            </h2>
            <p className="mt-3 text-sm text-slate-200">{roleSummary}</p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-sm xl:max-w-sm">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-slate-300">
              Signed-in role
            </p>
            <p className="mt-2 text-xl font-bold">{userRole}</p>
            <p className="mt-2 text-sm text-slate-300">
              Use the quick actions below to jump directly into the area you need.
            </p>
          </div>
        </div>
      </section>

      <section className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Staff" value={employeeCount} />
        <StatCard label="Active Staff" value={activeEmployeeCount} tone="green" />
        <StatCard
          label="Inactive Staff"
          value={inactiveEmployeeCount}
          tone={inactiveEmployeeCount > 0 ? 'amber' : 'green'}
        />
        <StatCard label="Branches / Roles" value={`${branchCount} / ${roleCount}`} tone="blue" />
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.5fr_1fr]">
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-lg font-bold text-slate-900">Quick Actions</h3>
              <p className="mt-1 text-sm text-slate-600">
                Open the admin surface you need without digging through every tab.
              </p>
            </div>
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 lg:grid-cols-2">
            {quickActions
              .filter((action) => action.visible)
              .map((action) => {
                const Icon = action.icon

                return (
                  <button
                    key={action.id}
                    onClick={() => onSelectTab(action.id)}
                    className="group rounded-xl border border-slate-200 bg-slate-50 p-4 text-left transition hover:border-blue-300 hover:bg-blue-50"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3">
                        <div className="rounded-lg bg-white p-2 text-slate-700 shadow-sm ring-1 ring-slate-200">
                          <Icon className="h-5 w-5" />
                        </div>
                        <div>
                          <p className="font-semibold text-slate-900">{action.title}</p>
                          <p className="mt-1 text-sm text-slate-600">{action.description}</p>
                        </div>
                      </div>
                      <ArrowRight className="h-4 w-4 text-slate-400 transition group-hover:translate-x-0.5 group-hover:text-blue-700" />
                    </div>
                  </button>
                )
              })}
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h3 className="text-lg font-bold text-slate-900">Access Summary</h3>
          <div className="mt-4 space-y-4 text-sm text-slate-700">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Organization access</p>
              <p className="mt-1">
                {canManageOrganization
                  ? 'Staff, branch, hierarchy, and pricing management are available in this account.'
                  : 'Organization structure changes are intentionally hidden for this maintenance-scoped account.'}
              </p>
            </div>

            <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <p className="font-semibold text-slate-900">Maintenance access</p>
              <p className="mt-1">
                Document storage monitoring, backlog review, and data maintenance tools are
                available here.
              </p>
            </div>

            <div className="rounded-lg border border-blue-200 bg-blue-50 p-4 text-blue-900">
              <p className="font-semibold">Recommended first check</p>
              <p className="mt-1">
                Review Document Storage after any outage so you can confirm whether fallback uploads
                are clearing back to primary.
              </p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
