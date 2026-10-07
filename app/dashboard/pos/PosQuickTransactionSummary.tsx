import { ArrowDownLeft, ArrowUpRight, Coins, WalletCards } from 'lucide-react'

type Props = {
  direction: 'in' | 'out' | 'transfer'
  impactSummary: string
  destinationLabel?: string
  loyaltyPoints?: number
  voucherDiscount?: string
  posting: boolean
  postButtonTitle: string
  postButtonLabel: string
  onPost: () => void
}

export default function PosQuickTransactionSummary({
  direction,
  impactSummary,
  destinationLabel,
  loyaltyPoints,
  voucherDiscount,
  posting,
  postButtonTitle,
  postButtonLabel,
  onPost,
}: Props) {
  return (
    <div
      data-pos-tour="post-summary"
      className="flex flex-col gap-2 rounded-xl bg-slate-50 p-2 sm:flex-row sm:items-center sm:justify-between"
    >
      <div className="flex items-center gap-2 text-xs text-slate-600">
        {direction === 'transfer' ? (
          <Coins className="h-4 w-4 text-amber-600" />
        ) : direction === 'out' ? (
          <ArrowDownLeft className="h-4 w-4 text-rose-600" />
        ) : (
          <ArrowUpRight className="h-4 w-4 text-emerald-600" />
        )}
        <span>{impactSummary}</span>
        {destinationLabel && (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-800">
            {destinationLabel}
          </span>
        )}
        {loyaltyPoints !== undefined && (
          <span className="rounded-full bg-emerald-100 px-2 py-1 text-[10px] font-black text-emerald-700">
            +{loyaltyPoints} pts
          </span>
        )}
        {voucherDiscount && (
          <span className="rounded-full bg-violet-100 px-2 py-1 text-[10px] font-black text-violet-700">
            Voucher −{voucherDiscount}
          </span>
        )}
      </div>
      <button
        type="button"
        data-pos-tour="post-button"
        onClick={onPost}
        disabled={posting}
        title={postButtonTitle}
        className="flex min-h-9 items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#7f1d2d] to-[#a52338] px-4 py-2 text-xs font-black text-white shadow-md shadow-red-950/15 transition hover:brightness-105 active:scale-[0.99] disabled:cursor-not-allowed disabled:opacity-45"
      >
        {direction === 'transfer' ? (
          <Coins className="h-4 w-4" />
        ) : (
          <WalletCards className="h-4 w-4" />
        )}
        {postButtonLabel}
      </button>
    </div>
  )
}
