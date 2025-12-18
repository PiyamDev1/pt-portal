'use client'
import Link from 'next/link'

const NAV_ITEMS = [
  { title: "PAK Passport", icon: "🇵🇰", color: "bg-green-800", href: "/dashboard/passports/pak" },
  { title: "GB Passport", icon: "🇬🇧", color: "bg-blue-900", href: "/dashboard/passports/gb" },
  { title: "Nadra Services", icon: "🆔", color: "bg-green-500", href: "/dashboard/applications/nadra" },
  { title: "Visas", icon: "🛂", color: "bg-purple-600", href: "/dashboard/visas" },
]

export default function ApplicationsClient() {
  return (
    <div className="space-y-8 animate-fade-in">
      {/* 1. OPERATIONAL HEALTH BANNER */}
      <section className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pending Submission", count: "0", color: "text-blue-600", bg: "bg-blue-50" },
          { label: "In Processing", count: "0", color: "text-purple-600", bg: "bg-purple-50" },
          { label: "Ready for Collection", count: "0", color: "text-green-600", bg: "bg-green-50" },
          { label: "Urgent Holds", count: "0", color: "text-red-600", bg: "bg-red-50" },
        ].map((stat, i) => (
          <div key={i} className={`${stat.bg} p-4 rounded-xl border border-white shadow-sm`}>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{stat.label}</p>
            <p className={`text-2xl font-black mt-1 ${stat.color}`}>{stat.count}</p>
          </div>
        ))}
      </section>

      {/* 2. NAVIGATION ROW */}
      <section>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {NAV_ITEMS.map((item, i) => (
            <Link key={i} href={item.href} className="group">
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
              <span className="text-blue-500">↺</span> Recently Modified
            </h3>
            <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold uppercase">Live Feed</span>
          </div>
          <div className="p-6">
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="text-4xl mb-2">📄</div>
              <p className="text-sm italic">No recent activity found</p>
            </div>
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
          <div className="p-6">
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <div className="text-4xl mb-2">📂</div>
              <p className="text-sm italic">Hold queue is currently empty</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  )
}
