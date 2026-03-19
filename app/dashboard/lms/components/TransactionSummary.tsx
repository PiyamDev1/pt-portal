/**
 * Transaction Summary
 * Lightweight financial summary block for service, payment, and fee transactions.
 *
 * @module app/dashboard/lms/components/TransactionSummary
 */

type TransactionSummaryProps = {
  isService: boolean
  isPayment: boolean
  isFee: boolean
  totalAmount: number
  deposit: number
  remainingAmount: number
}

export function TransactionSummary({
  isService,
  isPayment,
  isFee,
  totalAmount,
  deposit,
  remainingAmount,
}: TransactionSummaryProps) {
  if (!(isService || isPayment || isFee)) return null

  return (
    <div className="bg-slate-50 p-3 rounded-lg space-y-1">
      {isService && (
        <>
          <div className="flex justify-between text-sm">
            <span className="text-slate-600">Total Amount:</span>
            <span className="font-bold">£{totalAmount.toFixed(2)}</span>
          </div>
          {deposit > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-slate-600">Initial Deposit:</span>
              <span className="font-bold">£{deposit.toFixed(2)}</span>
            </div>
          )}
          <div className="flex justify-between text-sm border-t border-slate-200 pt-1 mt-1">
            <span className="text-slate-600">Remaining Amount:</span>
            <span className="font-bold">£{remainingAmount.toFixed(2)}</span>
          </div>
        </>
      )}
    </div>
  )
}
