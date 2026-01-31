import { Account } from '@/app/types/lms'

interface CustomerInfoSectionProps {
  account: Account
}

export function CustomerInfoSection({ account }: CustomerInfoSectionProps) {
  return (
    <>
      {/* Letterhead */}
      <div className="border-b-2 border-slate-900 pb-4 flex items-start justify-between gap-6 print:gap-3 print:pb-2">
        <div className="print:w-24 flex-shrink-0">
          <img src="/logo.png" alt="Company Logo" className="h-24 w-auto print:h-28 print:w-auto" />
        </div>
        <div className="flex-1 text-right print:text-right">
          <h2 className="text-xl font-bold text-slate-900 print:text-base print:mb-0">Piyam Travel</h2>
          <p className="text-slate-600 print:text-xs print:mb-0">290A Dunstable Road, LU4 8JN, Luton</p>
          <p className="text-slate-600 print:text-xs print:mb-0">01582 968538</p>
          <p className="text-slate-600 print:text-xs print:mb-0">Accounts@piyamtravel.com</p>
          <p className="text-xs text-slate-400 mt-2 print:text-[10px] print:mt-1">
            Document Reference: STM-{account.id.substring(0, 8).toUpperCase()}
          </p>
        </div>
      </div>

      {/* Customer & Period Info */}
      <div className="grid grid-cols-2 gap-6 print:gap-8 print:text-xs">
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 print:text-[10px] print:mb-1">Customer Details</h3>
          <div className="space-y-1">
            <p className="font-bold text-slate-900 print:text-xs print:mb-0">{account.name}</p>
            <p className="text-sm text-slate-600 print:text-xs print:mb-0">{account.phone}</p>
            <p className="text-sm text-slate-600 print:text-xs print:mb-0">{account.email}</p>
            <p className="text-sm text-slate-600 print:text-xs print:mb-0">{account.address || 'N/A'}</p>
          </div>
        </div>
        <div>
          <h3 className="text-xs font-bold text-slate-500 uppercase mb-2 print:text-[10px] print:mb-1">Statement Details</h3>
          <div className="space-y-1">
            <p className="text-sm print:text-xs print:mb-0">
              <span className="text-slate-600">Date:</span> <span className="font-bold">{new Date().toLocaleDateString()}</span>
            </p>
            <p className="text-sm print:text-xs print:mb-0">
              <span className="text-slate-600">Period:</span> <span className="font-bold">Full Account History</span>
            </p>
            <p className="text-sm print:text-xs print:mb-0">
              <span className="text-slate-600">Status:</span> <span className="font-bold text-blue-600">{account.status?.toUpperCase()}</span>
            </p>
            <p className="text-sm print:text-xs print:mb-0">
              <span className="text-slate-600">Balance:</span> <span className="font-bold text-slate-900">£{(account.balance || 0).toLocaleString()}</span>
            </p>
          </div>
        </div>
      </div>
    </>
  )
}
