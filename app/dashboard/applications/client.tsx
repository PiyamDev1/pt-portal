'use client'
import Link from 'next/link'

interface ApplicationsClientProps {
  nadraRecords: any[]
  pakPassportRecords: any[]
  gbPassportRecords: any[]
  visaRecords: any[]
}

const NAV_ITEMS = [
  { title: 'PAK Passport', icon: '🇵🇰', color: 'bg-green-800', href: '/dashboard/applications/passports' },
  { title: 'GB Passport', icon: '🇬🇧', color: 'bg-blue-900', href: '/dashboard/applications/passports-gb' },
  { title: 'Nadra Services', icon: '🆔', color: 'bg-green-500', href: '/dashboard/applications/nadra' },
  { title: 'Visas', icon: '🛂', color: 'bg-purple-600', href: '/dashboard/applications/visa' }
]

const STATUS_LABELS = ['Pending Submission', 'Submitted', 'In Progress', 'Completed', 'Cancelled'] as const

type ServiceStatus = (typeof STATUS_LABELS)[number]

type RecentRecord = {
  id: string
  applicantName: string
  identifier: string
  status: ServiceStatus
  service: string
  createdAt: string
  trackingNumber: string
}

const badgeColors: Record<ServiceStatus, string> = {
  'Pending Submission': 'bg-amber-50 text-amber-700 border-amber-200',
  Submitted: 'bg-blue-50 text-blue-700 border-blue-200',
  'In Progress': 'bg-purple-50 text-purple-700 border-purple-200',
  Completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  Cancelled: 'bg-red-50 text-red-700 border-red-200'
}

function buildNadraRecords(records: any[]): RecentRecord[] {
  return (records || []).map((item: any) => {
    const nadra = Array.isArray(item.nadra_services) ? item.nadra_services[0] : item.nadra_services
    const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
    const status = (nadra?.status || 'Pending Submission') as ServiceStatus

    return {
      id: nadra?.id || item.id,
      applicantName: `${applicant?.first_name || 'Unknown'} ${applicant?.last_name || ''}`.trim(),
      identifier: applicant?.citizen_number || 'N/A',
      status,
      service: nadra?.service_type || 'NADRA',
      createdAt: nadra?.created_at || item?.created_at || '',
      trackingNumber: nadra?.tracking_number || item?.tracking_number || '—'
    }
  })
}

function buildPakPassportRecords(records: any[]): RecentRecord[] {
  return (records || []).map((item: any) => {
    const passport = Array.isArray(item.pakistani_passport_applications) 
      ? item.pakistani_passport_applications[0] 
      : item.pakistani_passport_applications
    const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
    const status = (passport?.status || 'Pending Submission') as ServiceStatus

    return {
      id: passport?.id || item.id,
      applicantName: `${applicant?.first_name || 'Unknown'} ${applicant?.last_name || ''}`.trim(),
      identifier: applicant?.citizen_number || 'N/A',
      status,
      service: `PAK ${passport?.application_type || 'Passport'}`,
      createdAt: passport?.created_at || item?.created_at || '',
      trackingNumber: item?.tracking_number || '—'
    }
  })
}

function buildGbPassportRecords(records: any[]): RecentRecord[] {
  return (records || []).map((item: any) => {
    const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
    const application = Array.isArray(item.applications) ? item.applications[0] : item.applications
    const status = (item?.status || 'Pending Submission') as ServiceStatus

    return {
      id: item.id,
      applicantName: `${applicant?.first_name || 'Unknown'} ${applicant?.last_name || ''}`.trim(),
      identifier: 'GB Applicant',
      status,
      service: 'GB Passport',
      createdAt: item?.created_at || '',
      trackingNumber: application?.tracking_number || '—'
    }
  })
}

function buildVisaRecords(records: any[]): RecentRecord[] {
  return (records || []).map((item: any) => {
    const applicant = Array.isArray(item.applicants) ? item.applicants[0] : item.applicants
    const country = Array.isArray(item.visa_countries) ? item.visa_countries[0] : item.visa_countries
    const status = (item?.status || 'Pending Submission') as ServiceStatus

    return {
      id: item.id,
      applicantName: `${applicant?.first_name || 'Unknown'} ${applicant?.last_name || ''}`.trim(),
      identifier: applicant?.passport_number || 'N/A',
      status,
      service: `${country?.name || 'Visa'}`,
      createdAt: item?.created_at || '',
      trackingNumber: '—'
    }
  })
}

export default function ApplicationsClient({ nadraRecords, pakPassportRecords, gbPassportRecords, visaRecords }: ApplicationsClientProps) {
  const nadra = buildNadraRecords(nadraRecords)
  const pakPassports = buildPakPassportRecords(pakPassportRecords)
  const gbPassports = buildGbPassportRecords(gbPassportRecords)
  const visas = buildVisaRecords(visaRecords)

  const allRecords = [...nadra, ...pakPassports, ...gbPassports, ...visas]
    .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())

  const statusCounts = STATUS_LABELS.map((label) => ({
    label,
    count: allRecords.filter((r) => r.status === label).length
  }))

  const holdQueue = allRecords
    .filter((r) => r.status === 'Cancelled' || r.status === 'Pending Submission')
    .slice(0, 8)
  
  const recentSlice = allRecords.slice(0, 12)

  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. OPERATIONAL HEALTH BANNER */}
      <section className="grid grid-cols-2 md:grid-cols-5 gap-4">
        {statusCounts.map((stat) => (
          <div key={stat.label} className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
            <p className="text-2xl font-black mt-1 text-slate-800">{stat.count}</p>
          </div>
        ))}
      </section>

      {/* 2. NAVIGATION ROW */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {NAV_ITEMS.map((item) => (
            <Link key={item.title} href={item.href} className="group">
              <div className={`${item.color} p-6 rounded-2xl text-white shadow-sm hover:shadow-lg hover:-translate-y-1 transition-all duration-200 flex flex-col items-center text-center gap-3`}>
                <span className="text-4xl drop-shadow-md">{item.icon}</span>
                <span className="font-bold text-sm tracking-wide">{item.title}</span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* 3. TWO-COLUMN WORK QUEUE */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        
        {/* Left Column: Recently Modified */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <span className="text-blue-500">↺</span> Recent Activity
            </h3>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase">Live Feed</span>
          </div>
          <div className="p-6 divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {recentSlice.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="text-4xl mb-2">📄</div>
                <p className="text-sm italic">No recent activity found</p>
              </div>
            ) : (
              recentSlice.map((item) => (
                <div key={`${item.service}-${item.id}`} className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{item.applicantName}</p>
                    <p className="text-xs text-slate-500 font-mono">{item.identifier}</p>
                    <p className="text-xs text-slate-400 mt-1">{item.service}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${badgeColors[item.status]}`}>
                      {item.status}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1 font-mono">{item.trackingNumber}</p>
                    <p className="text-[11px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '—'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Hold Queue */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50 flex justify-between items-center">
            <h3 className="font-bold text-slate-700 flex items-center gap-2">
              <span className="text-red-500">🛑</span> Hold Queue
            </h3>
            <span className="text-[10px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold uppercase">Attention Required</span>
          </div>
          <div className="p-6 divide-y divide-slate-100 max-h-[600px] overflow-y-auto">
            {holdQueue.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                <div className="text-4xl mb-2">📂</div>
                <p className="text-sm italic">Nothing on hold right now</p>
              </div>
            ) : (
              holdQueue.map((item) => (
                <div key={`hold-${item.service}-${item.id}`} className="py-4 flex items-center justify-between gap-4">
                  <div>
                    <p className="font-bold text-slate-800 text-sm">{item.applicantName}</p>
                    <p className="text-xs text-slate-500 font-mono">{item.identifier}</p>
                    <p className="text-xs text-slate-400 mt-1">{item.service}</p>
                  </div>
                  <div className="text-right">
                    <span className={`text-[11px] font-bold px-2 py-1 rounded-full border ${badgeColors[item.status]}`}>
                      {item.status}
                    </span>
                    <p className="text-[11px] text-slate-400 mt-1 font-mono">{item.trackingNumber}</p>
                    <p className="text-[11px] text-slate-400">{item.createdAt ? new Date(item.createdAt).toLocaleDateString('en-GB') : '—'}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  )
}
