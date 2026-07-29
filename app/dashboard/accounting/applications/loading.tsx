export default function AccountingApplicationsLoading() {
  return (
    <div className="space-y-5 animate-pulse">
      <div className="h-16 w-full max-w-xl rounded-lg bg-slate-200" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="h-24 rounded-lg bg-white ring-1 ring-slate-200" />
        ))}
      </div>
      <div className="h-48 rounded-lg bg-white ring-1 ring-slate-200" />
      <div className="h-72 rounded-lg bg-white ring-1 ring-slate-200" />
    </div>
  )
}
