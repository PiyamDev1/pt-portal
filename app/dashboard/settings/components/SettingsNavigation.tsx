'use client'

import Link from 'next/link'

type SettingsNavigationProps = {
  activeTab: string
  hasAdminConsole: boolean
  isOrgAdmin: boolean
  isMaintenanceAdmin: boolean
  canAccessMaintenance: boolean
  canManageIssueReports: boolean
  isSuperAdmin: boolean
  onSelectTab: (tab: string) => void
}

type SettingsNavItem =
  | { id: string; label: string; kind: 'tab'; visible: boolean }
  | { id: string; label: string; kind: 'link'; href: string; visible: boolean }

type SettingsNavSection = {
  label: string
  visible: boolean
  items: SettingsNavItem[]
}

const baseItemClass =
  'block shrink-0 rounded-xl border px-4 py-3 text-left text-sm transition-colors md:w-full md:rounded-none md:border-0 md:border-l-4'

function SettingsNavButton({
  item,
  activeTab,
  onSelectTab,
}: {
  item: Extract<SettingsNavItem, { kind: 'tab' }>
  activeTab: string
  onSelectTab: (tab: string) => void
}) {
  const active = activeTab === item.id
  return (
    <button
      type="button"
      onClick={() => onSelectTab(item.id)}
      className={`${baseItemClass} ${
        active
          ? 'border-[#8b1e2d] bg-red-50 font-medium text-[#8b1e2d]'
          : 'border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent'
      }`}
    >
      {item.label}
    </button>
  )
}

export function SettingsNavigation({
  activeTab,
  hasAdminConsole,
  isOrgAdmin,
  isMaintenanceAdmin,
  canAccessMaintenance,
  canManageIssueReports,
  isSuperAdmin,
  onSelectTab,
}: SettingsNavigationProps) {
  const canManagePeople = isOrgAdmin || isMaintenanceAdmin
  const sections: SettingsNavSection[] = [
    {
      label: 'Security',
      visible: true,
      items: [{ id: 'security', label: 'Security & Password', kind: 'tab', visible: true }],
    },
    {
      label: 'People & HR',
      visible: canManagePeople,
      items: [
        { id: 'staff', label: 'Staff Management', kind: 'tab', visible: canManagePeople },
        {
          id: 'branches',
          label: 'Branches & Locations',
          kind: 'tab',
          visible: isOrgAdmin,
        },
        { id: 'hierarchy', label: 'Hierarchy Tree', kind: 'tab', visible: isOrgAdmin },
        {
          id: 'frappe-provisioning',
          label: 'Frappe Transfer',
          kind: 'tab',
          visible: isOrgAdmin,
        },
        {
          id: 'timeclock-devices',
          label: 'Timeclock Devices',
          kind: 'tab',
          visible: isOrgAdmin,
        },
      ],
    },
    {
      label: 'Operations',
      visible: hasAdminConsole,
      items: [
        { id: 'admin-overview', label: 'Overview', kind: 'tab', visible: hasAdminConsole },
        {
          id: 'approval-queue',
          label: 'Approval Queue',
          kind: 'tab',
          visible: hasAdminConsole,
        },
        {
          id: 'issue-reports',
          label: 'Issue Reports',
          kind: 'tab',
          visible: canManageIssueReports,
        },
        {
          id: 'notice-board',
          label: 'Notice Board',
          kind: 'tab',
          visible: isOrgAdmin,
        },
        {
          id: 'ticketing-flight-api',
          label: 'Ticket Flight API',
          kind: 'tab',
          visible: isOrgAdmin,
        },
      ],
    },
    {
      label: 'Pricing',
      visible: isOrgAdmin,
      items: [
        {
          id: 'pricing',
          label: 'Pricing Management',
          kind: 'link',
          href: '/dashboard/pricing',
          visible: isOrgAdmin,
        },
      ],
    },
    {
      label: 'Maintenance',
      visible: canAccessMaintenance,
      items: [
        {
          id: 'document-storage',
          label: 'Document Storage',
          kind: 'tab',
          visible: canAccessMaintenance,
        },
        {
          id: 'receipt-metrics',
          label: 'Receipt Metrics',
          kind: 'tab',
          visible: canAccessMaintenance,
        },
        {
          id: 'maintenance',
          label: 'Data Maintenance',
          kind: 'tab',
          visible: canAccessMaintenance,
        },
        {
          id: 'server-control',
          label: 'Server Control',
          kind: 'tab',
          visible: isSuperAdmin,
        },
      ],
    },
  ]

  return (
    <div className="settings-mobile-sidebar w-full flex-shrink-0 md:w-64">
      <nav
        aria-label="Settings by goal"
        className="settings-mobile-tabs sticky top-20 z-20 flex gap-2 overflow-x-auto rounded-2xl border border-slate-200 bg-white p-2 shadow md:top-24 md:block md:overflow-hidden md:rounded-lg md:p-0"
      >
        {sections
          .filter((section) => section.visible)
          .map((section, sectionIndex) => {
            const items = section.items.filter((item) => item.visible)
            if (items.length === 0) return null

            return (
              <div
                key={section.label}
                role="group"
                aria-label={`${section.label} settings`}
                className="contents md:block"
              >
                <div
                  className={`hidden px-4 py-3 text-xs font-bold uppercase tracking-wider text-slate-500 md:block md:border-b md:border-t md:border-slate-200 md:bg-slate-100 ${sectionIndex === 0 ? 'md:border-t-0' : ''}`}
                >
                  {section.label}
                </div>
                {items.map((item) =>
                  item.kind === 'link' ? (
                    <Link
                      key={item.id}
                      href={item.href}
                      className={`${baseItemClass} border-slate-200 text-slate-600 hover:bg-slate-50 md:border-transparent`}
                    >
                      {item.label}
                    </Link>
                  ) : (
                    <SettingsNavButton
                      key={item.id}
                      item={item}
                      activeTab={activeTab}
                      onSelectTab={onSelectTab}
                    />
                  ),
                )}
              </div>
            )
          })}
      </nav>
    </div>
  )
}
