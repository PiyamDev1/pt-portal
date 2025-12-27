import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import PageHeader from '@/app/components/PageHeader.client'
import DashboardClientWrapper from './client-wrapper'

// --- MODULE CONFIGURATION ---
const ALL_MODULES = [
  { 
    id: 'applications', 
    title: "Applications Hub", 
    desc: "Track all your applications",
    icon: "📋", 
    color: "bg-orange-600 text-white", 
    href: "/dashboard/applications" 
  },
  { 
    id: 'ticketing', 
    title: "Ticketing", 
    desc: "Issue tickets & manage PNRs",
    icon: "✈️", 
    color: "bg-blue-600 text-white", 
    href: "/dashboard/ticketing" 
  },
  { 
    id: 'visas', 
    title: "Visas", 
    desc: "Visa application tracking",
    icon: "🛂", 
    color: "bg-purple-600 text-white", 
    href: "/dashboard/applications/visa" 
  },
  { 
    id: 'pak-passport', 
    title: "PAK Passport", 
    desc: "Renewal & New Applications",
    icon: "🇵🇰", 
    color: "bg-green-800 text-white", // Dark Green
    href: "/dashboard/applications/passports" 
  },
  { 
    id: 'gb-passport', 
    title: "GB Passport", 
    desc: "British Passport Services",
    icon: "🇬🇧", 
    color: "bg-blue-900 text-white", // Navy Blue
    href: "/dashboard/passports/gb" 
  },
  { 
    id: 'nadra', 
    title: "Nadra Applications", 
    desc: "NICOP & ID Cards",
    icon: "🆔", 
    color: "bg-green-500 text-white", // Light Green
    href: "/dashboard/applications/nadra" 
  },
  { 
    id: 'commissions', 
    title: "Commissions", 
    desc: "Track earnings & sales",
    icon: "📊", 
    color: "bg-slate-600 text-white", 
    href: "/dashboard/commissions" 
  },
  { 
    id: 'employee', 
    title: "Employee Record", 
    desc: "Payslips, Leaves & Docs",
    icon: "📁", 
    color: "bg-indigo-600 text-white", 
    href: "/dashboard/employee-record" 
  },
  { 
    id: 'lms', 
    title: "LMS", 
    desc: "Loan Management System",
    icon: "💰", 
    color: "bg-yellow-400 text-black", // Yellow
    href: "/dashboard/lms" 
  },
  { 
    id: 'settings', 
    title: "Settings", 
    desc: "Security, Devices & Org",
    icon: "⚙️", 
    color: "bg-slate-800 text-white", // Dark
    href: "/dashboard/settings" 
  },
]

// Mock User Preferences (In future, fetch these from DB)
const PINNED_IDS = ['ticketing', 'visas', 'nadra']
const RECENT_IDS = ['pak-passport', 'lms', 'settings']

export default async function Dashboard() {
  const cookieStore = await cookies()
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll() },
        setAll(cookiesToSet: any[]) {
          try { cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
        },
      },
    }
  )

  const { data: { session } } = await supabase.auth.getSession()
  if (!session) redirect('/login')

  const { data: employee } = await supabase
    .from('employees')
    .select('full_name, roles(name), locations(name, branch_code)')
    .eq('id', session.user.id)
    .single()

  const location = Array.isArray(employee?.locations) ? employee.locations[0] : employee?.locations
  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles

  const pinnedModules = ALL_MODULES.filter(m => PINNED_IDS.includes(m.id))
  const recentModules = ALL_MODULES.filter(m => RECENT_IDS.includes(m.id))
  const sortedModules = [...ALL_MODULES].sort((a, b) => a.title.localeCompare(b.title))

  // Date Formatting
  const today = new Date();
  const dateStr = today.toLocaleDateString('en-GB', { 
    weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' 
  });
  const timeStr = today.toLocaleTimeString('en-GB', { 
    hour: '2-digit', minute: '2-digit' 
  });

  const targetAmount = 5000;
  const currentSales = 3250;
  const progressPercent = Math.min((currentSales / targetAmount) * 100, 100);

  return (
    <DashboardClientWrapper>
      <div className="min-h-screen bg-slate-50 flex flex-col">
        <PageHeader 
          employeeName={employee?.full_name} 
          role={role?.name} 
          location={location} 
          userId={session.user.id} 
        />

        <main className="p-6 max-w-7xl mx-auto space-y-8 flex-grow w-full">
          
          {/* 1. WELCOME & STATS */}
          <div className="space-y-6">
            <div className="flex justify-between items-end">
              <div>
                <h2 className="text-2xl font-bold text-slate-800">Dashboard</h2>
                <p className="text-slate-500">Welcome back, {employee?.full_name}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-bold text-slate-700">{dateStr}</p>
                <p className="text-xs font-medium text-slate-500">{timeStr}</p>
              </div>
            </div>

            {/* Performance Stats Banner */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              
              {/* Today */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">My Sales Today</p>
                    <h3 className="text-2xl font-bold text-slate-800 mt-1">£250.00</h3>
                  </div>
                  <div className="h-10 w-10 bg-blue-50 text-blue-600 rounded-full flex items-center justify-center text-lg">📅</div>
                </div>
                <div className="flex gap-3 mt-4 pt-4 border-t border-slate-50">
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">✈️ 1 Ticket</span>
                    <span className="text-xs text-slate-500 bg-slate-100 px-2 py-1 rounded">🛂 0 Visas</span>
                </div>
              </div>

              {/* This Month (With Target) */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm relative overflow-hidden">
                <div className="flex justify-between items-start mb-2">
                  <div className="z-10 relative">
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">My Month to Date</p>
                    <h3 className="text-2xl font-bold text-slate-800 mt-1">£{currentSales.toLocaleString()}</h3>
                  </div>
                  <div className="h-10 w-10 bg-purple-50 text-purple-600 rounded-full flex items-center justify-center text-lg z-10 relative">🎯</div>
                </div>
                
                {/* Target Bar */}
                <div className="mt-4">
                    <div className="flex justify-between text-xs font-medium mb-1">
                        <span className="text-slate-600">Target: £{targetAmount.toLocaleString()}</span>
                        <span className={progressPercent >= 100 ? "text-green-600" : "text-blue-600"}>{Math.round(progressPercent)}%</span>
                    </div>
                    <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                        <div 
                            className={`h-full rounded-full transition-all duration-1000 ${progressPercent >= 100 ? 'bg-green-500' : 'bg-blue-500'}`} 
                            style={{ width: `${progressPercent}%` }}
                        ></div>
                    </div>
                </div>
              </div>

              {/* Last Month */}
              <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">My Last Month</p>
                    <h3 className="text-2xl font-bold text-slate-400 mt-1">£3,800</h3>
                  </div>
                  <div className="h-10 w-10 bg-slate-50 text-slate-400 rounded-full flex items-center justify-center text-lg">🗓️</div>
                </div>
                <p className="text-xs text-green-600 mt-4 font-medium flex items-center gap-1">
                    ✅ Commission Paid
                </p>
              </div>
            </div>
          </div>

          <hr className="border-slate-200" />

          {/* 2. PINNED & RECENT */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            
            {/* Pinned Section (SMALLER ICONS) */}
            <section>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="text-yellow-500 text-lg">★</span> Pinned Modules
                </h3>
                {/* Updated Grid: 4 cols on mobile, 6 on desktop -> Smaller items */}
                <div className="grid grid-cols-4 sm:grid-cols-6 gap-3">
                    {pinnedModules.map((mod) => (
                        <Link key={mod.id} href={mod.href} className="group aspect-square">
                        <div className={`w-full h-full p-2 rounded-xl border border-slate-200 shadow-sm hover:shadow-md transition-all duration-200 flex flex-col items-center justify-center text-center gap-1 ${mod.color}`}>
                            <div className="text-xl drop-shadow-sm">
                            {mod.icon}
                            </div>
                            {/* Truncate text if needed for small squares */}
                            <h4 className="font-bold text-[10px] leading-tight line-clamp-2">{mod.title}</h4>
                        </div>
                        </Link>
                    ))}
                    
                    <button className="aspect-square p-2 rounded-xl border-2 border-dashed border-slate-200 text-slate-400 hover:border-slate-300 hover:text-slate-500 transition flex flex-col items-center justify-center gap-1">
                        <span className="text-lg">+</span>
                    </button>
                </div>
            </section>

            {/* Recent Section */}
            <section>
                <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
                    <span className="text-blue-400 text-lg">↺</span> Recently Used
                </h3>
                <div className="space-y-3">
                    {recentModules.map((mod) => (
                        <Link key={mod.id} href={mod.href} className="block group">
                            <div className="bg-white p-3 rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all flex items-center gap-3">
                                <div className={`h-8 w-8 rounded flex items-center justify-center text-sm shrink-0 ${mod.color}`}>
                                    {mod.icon}
                                </div>
                                <div className="flex-1">
                                    <h4 className="font-bold text-sm text-slate-700 group-hover:text-blue-600 transition-colors">{mod.title}</h4>
                                    <p className="text-[10px] text-slate-400">{mod.desc}</p>
                                </div>
                                <span className="text-slate-300 text-xs">→</span>
                            </div>
                        </Link>
                    ))}
                </div>
            </section>
          </div>

          <div className="h-px bg-slate-100 my-4"></div>

          {/* 3. ALL MODULES */}
          <section>
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-4">All Modules</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-4">
              {sortedModules.map((mod) => (
                <Link key={mod.id} href={mod.href} className="group">
                  <div className="bg-white p-4 rounded-lg border border-slate-200 hover:border-blue-400 hover:shadow-sm transition-all flex flex-col items-center text-center gap-3 h-full">
                    <div className={`h-10 w-10 rounded-lg flex items-center justify-center text-xl shadow-sm ${mod.color}`}>
                      {mod.icon}
                    </div>
                    <div>
                      <h4 className="font-bold text-sm text-slate-800 group-hover:text-blue-600 transition-colors">{mod.title}</h4>
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </section>

        </main>
      </div>
    </DashboardClientWrapper>
  )
}
