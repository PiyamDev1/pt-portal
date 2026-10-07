import type { PosBootstrapPayload } from '@/lib/pos/contracts'

export const POS_LEDGER_FILTERS = ['All', 'Cash', 'Card', 'Bank', 'Outgoing'] as const
export type PosLedgerPaymentFilter = (typeof POS_LEDGER_FILTERS)[number]

type PosLedgerFilterOptions = {
  catalogue: Array<
    Pick<PosBootstrapPayload['catalogue'][number], 'id' | 'key' | 'label' | 'optionLabel'>
  >
  suppliers: Array<Pick<PosBootstrapPayload['suppliers'][number], 'id' | 'name'>>
  tills: Array<Pick<PosBootstrapPayload['tills'][number], 'id' | 'name'>>
  employees: Array<Pick<PosBootstrapPayload['employees'][number], 'id' | 'name'>>
}

type Props = {
  options: PosLedgerFilterOptions
  activeFilter: PosLedgerPaymentFilter
  categoryFilter: string
  statusFilter: string
  outgoingFilter: string
  supplierFilter: string
  tillFilter: string
  agentFilter: string
  sourceFilter: string
  loyaltyFilter: string
  minAmountFilter: string
  maxAmountFilter: string
  onActiveFilterChange: (value: PosLedgerPaymentFilter) => void
  onCategoryChange: (value: string) => void
  onStatusChange: (value: string) => void
  onOutgoingChange: (value: string) => void
  onSupplierChange: (value: string) => void
  onTillChange: (value: string) => void
  onAgentChange: (value: string) => void
  onSourceChange: (value: string) => void
  onLoyaltyChange: (value: string) => void
  onMinimumAmountChange: (value: string) => void
  onMaximumAmountChange: (value: string) => void
  onClear: () => void
}

export default function PosLedgerFilters({
  options,
  activeFilter,
  categoryFilter,
  statusFilter,
  outgoingFilter,
  supplierFilter,
  tillFilter,
  agentFilter,
  sourceFilter,
  loyaltyFilter,
  minAmountFilter,
  maxAmountFilter,
  onActiveFilterChange,
  onCategoryChange,
  onStatusChange,
  onOutgoingChange,
  onSupplierChange,
  onTillChange,
  onAgentChange,
  onSourceChange,
  onLoyaltyChange,
  onMinimumAmountChange,
  onMaximumAmountChange,
  onClear,
}: Props) {
  return (
    <div className="flex flex-wrap gap-2 border-b border-slate-200 bg-white px-4 py-3">
      {POS_LEDGER_FILTERS.map((filter) => (
        <button
          key={filter}
          type="button"
          onClick={() => onActiveFilterChange(filter)}
          aria-pressed={activeFilter === filter}
          className={`rounded-full px-3 py-1.5 text-[11px] font-black transition ${
            activeFilter === filter
              ? 'bg-slate-950 text-white'
              : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
          }`}
        >
          {filter}
        </button>
      ))}
      <select
        aria-label="Category filter"
        value={categoryFilter}
        onChange={(event) => onCategoryChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
      >
        <option value="">All categories</option>
        {options.catalogue.map((item) => (
          <option key={item.id} value={item.key}>
            {item.label}
            {item.optionLabel ? ` · ${item.optionLabel}` : ''}
          </option>
        ))}
      </select>
      <select
        aria-label="Status filter"
        value={statusFilter}
        onChange={(event) => onStatusChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
      >
        <option value="">All statuses</option>
        <option value="POSTED">Posted</option>
        <option value="PARTIALLY_REFUNDED">Partially refunded</option>
        <option value="REFUNDED">Refunded</option>
        <option value="CORRECTED">Corrected</option>
        <option value="UNRECONCILED">Unreconciled</option>
      </select>
      <select
        aria-label="Outgoing type filter"
        value={outgoingFilter}
        onChange={(event) => onOutgoingChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
      >
        <option value="">All outgoing types</option>
        <option value="REFUND">Refund</option>
        <option value="EXPENSE">Expense</option>
        <option value="SUPPLIER_PAYMENT">Supplier payment</option>
      </select>
      <select
        aria-label="Supplier filter"
        value={supplierFilter}
        onChange={(event) => onSupplierChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
      >
        <option value="">All suppliers</option>
        {options.suppliers.map((supplier) => (
          <option key={supplier.id} value={supplier.id}>
            {supplier.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Till filter"
        value={tillFilter}
        onChange={(event) => onTillChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
      >
        <option value="">All tills</option>
        {options.tills.map((till) => (
          <option key={till.id} value={till.id}>
            {till.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Agent filter"
        value={agentFilter}
        onChange={(event) => onAgentChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
      >
        <option value="">All agents</option>
        {options.employees.map((employee) => (
          <option key={employee.id} value={employee.id}>
            {employee.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Source filter"
        value={sourceFilter}
        onChange={(event) => onSourceChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
      >
        <option value="">All source states</option>
        <option value="LMS">LMS</option>
        <option value="TICKETING">Ticketing</option>
        <option value="APPLICATIONS">Applications</option>
        <option value="PACKAGES">Packages</option>
        <option value="POS">POS</option>
        <option value="LEGACY">Legacy</option>
      </select>
      <select
        aria-label="Loyalty filter"
        value={loyaltyFilter}
        onChange={(event) => onLoyaltyChange(event.target.value)}
        className="h-8 rounded-lg border border-slate-200 px-2 text-[11px] font-bold"
      >
        <option value="">All loyalty states</option>
        <option value="ATTACHED">Attached</option>
        <option value="AWARDED">Awarded</option>
        <option value="REVERSED">Reversed</option>
        <option value="NONE">No loyalty</option>
      </select>
      <input
        aria-label="Minimum amount filter"
        value={minAmountFilter}
        onChange={(event) => onMinimumAmountChange(event.target.value)}
        inputMode="decimal"
        placeholder="Min £"
        className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-[11px]"
      />
      <input
        aria-label="Maximum amount filter"
        value={maxAmountFilter}
        onChange={(event) => onMaximumAmountChange(event.target.value)}
        inputMode="decimal"
        placeholder="Max £"
        className="h-8 w-20 rounded-lg border border-slate-200 px-2 text-[11px]"
      />
      <button
        type="button"
        onClick={onClear}
        className="rounded-full bg-rose-50 px-3 py-1.5 text-[11px] font-black text-rose-700"
      >
        Clear filters
      </button>
      <span className="ml-auto self-center text-[10px] font-bold uppercase tracking-wide text-slate-400">
        Branch scoped
      </span>
    </div>
  )
}
