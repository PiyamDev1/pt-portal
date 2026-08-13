import { BookOpenText, Calculator, Construction } from 'lucide-react'

const PLACEHOLDERS = {
  refund: {
    eyebrow: 'Refund calculator',
    title: 'Refund Calculator',
    description:
      'This submodule will calculate the refundable fare, airline penalty, service charge and final amount due to the customer.',
    icon: Calculator,
    items: [
      'Ticket and passenger selection',
      'Refundable fare and tax breakdown',
      'Airline and supplier penalties',
      'Agency service charge',
      'Final customer refund summary',
    ],
  },
  ledger: {
    eyebrow: 'Ticketing ledger',
    title: 'Ticketing Ledger',
    description:
      'This submodule will hold issued-ticket records and provide the source for upcoming-flight and schedule-change monitoring.',
    icon: BookOpenText,
    items: [
      'Passenger and ticket numbers',
      'PNR, airline and supplier references',
      'Flight sectors and departure times',
      'Fare, tax and payment details',
      'Schedule-change history and finalisation',
    ],
  },
} as const

export function TicketingPlaceholder({ kind }: { kind: keyof typeof PLACEHOLDERS }) {
  const placeholder = PLACEHOLDERS[kind]
  const Icon = placeholder.icon

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <section className="rounded-[1.75rem] border border-slate-200 bg-white p-5 shadow-sm md:p-7">
        <div className="flex flex-col gap-5 md:flex-row md:items-start">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#4b0f16] text-white shadow-lg shadow-red-950/15">
            <Icon className="h-7 w-7" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-xs font-black uppercase tracking-[0.16em] text-[#8b1e2d]">
                {placeholder.eyebrow}
              </p>
              <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-wide text-amber-800 ring-1 ring-amber-200">
                <Construction className="h-3 w-3" aria-hidden="true" />
                Placeholder
              </span>
            </div>
            <h1 className="mt-2 text-3xl font-black tracking-tight text-slate-950">
              {placeholder.title}
            </h1>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-600 md:text-base">
              {placeholder.description}
            </p>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-5 md:p-6">
        <h2 className="text-lg font-black text-slate-950">Planned contents</h2>
        <ul className="mt-4 grid gap-3 md:grid-cols-2">
          {placeholder.items.map((item) => (
            <li
              key={item}
              className="flex items-start gap-3 rounded-xl bg-white p-3 text-sm font-semibold text-slate-700 ring-1 ring-slate-200"
            >
              <span className="mt-1 h-2 w-2 shrink-0 rounded-full bg-[#8b1e2d]" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <p className="rounded-xl bg-sky-50 px-4 py-3 text-sm font-semibold text-sky-900 ring-1 ring-sky-100">
        No ticketing data is loaded, calculated or saved from this placeholder.
      </p>
    </div>
  )
}
