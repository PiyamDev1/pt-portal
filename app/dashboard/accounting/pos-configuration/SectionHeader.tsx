export function SectionHeader({ title, description }: { title: string; description: string }) {
  return (
    <div className="border-b border-slate-200 bg-slate-50 px-4 py-3">
      <h2 className="font-black text-slate-950">{title}</h2>
      <p className="mt-0.5 text-xs text-slate-500">{description}</p>
    </div>
  )
}
