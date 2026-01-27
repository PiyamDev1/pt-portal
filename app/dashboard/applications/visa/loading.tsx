export default function Loading() {
  return (
    <div className="min-h-screen bg-slate-50 animate-pulse">
      <div className="max-w-7xl mx-auto p-6 w-full space-y-6">
        <div className="h-6 w-48 bg-slate-200 rounded"></div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-white border border-slate-200 rounded-xl shadow-sm p-4 space-y-3">
              <div className="h-3 w-20 bg-slate-200 rounded"></div>
              <div className="h-8 w-28 bg-slate-300 rounded"></div>
              <div className="h-3 w-16 bg-slate-200 rounded"></div>
            </div>
          ))}
        </div>
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm">
          <div className="p-4 border-b border-slate-100 flex items-center gap-3">
            <div className="h-10 w-10 bg-slate-200 rounded-full"></div>
            <div className="flex-1 h-4 bg-slate-200 rounded"></div>
            <div className="h-10 w-24 bg-slate-200 rounded"></div>
          </div>
          <div className="divide-y divide-slate-100">
            {[1, 2, 3, 4, 5].map(i => (
              <div key={i} className="p-4 grid grid-cols-7 gap-3 text-sm">
                <div className="h-4 bg-slate-200 rounded col-span-2"></div>
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-4 bg-slate-200 rounded"></div>
                <div className="h-8 bg-slate-200 rounded"></div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
