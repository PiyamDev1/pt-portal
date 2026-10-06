'use client'

import { ExternalLink } from 'lucide-react'
import type { TravelPackageTransportVoucher } from '@/app/types/packages'
import { formatDateTime, label } from './packageOperationsModel'

type PackageTransportVoucherHistoryTableProps = {
  vouchers: TravelPackageTransportVoucher[]
  editingVoucherId: string | null
  saving: boolean
  onEdit: (voucher: TravelPackageTransportVoucher) => void
  onPreview: (voucher: TravelPackageTransportVoucher) => void
  onToggleVisibility: (voucher: TravelPackageTransportVoucher, customerVisible: boolean) => void
}

export function PackageTransportVoucherHistoryTable({
  vouchers,
  editingVoucherId,
  saving,
  onEdit,
  onPreview,
  onToggleVisibility,
}: PackageTransportVoucherHistoryTableProps) {
  if (vouchers.length === 0) return null

  return (
    <div className="overflow-x-auto border border-slate-200">
      <table className="min-w-full text-left text-sm">
        <thead className="bg-slate-50 text-xs uppercase text-slate-500">
          <tr>
            <th className="px-3 py-2">Version</th>
            <th className="px-3 py-2">Generated</th>
            <th className="px-3 py-2">Status</th>
            <th className="px-3 py-2">Customer</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-200">
          {vouchers.map((voucher) => (
            <tr key={voucher.id} className={voucher.id === editingVoucherId ? 'bg-red-50/50' : ''}>
              <td className="px-3 py-2 font-black">v{voucher.version}</td>
              <td className="px-3 py-2">{formatDateTime(voucher.generated_at)}</td>
              <td className="px-3 py-2">{label(voucher.status)}</td>
              <td className="px-3 py-2">{voucher.customer_visible ? 'Released' : 'Internal'}</td>
              <td className="px-3 py-2">
                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onEdit(voucher)}
                    className="border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700"
                  >
                    Edit / Preview
                  </button>
                  <button
                    type="button"
                    onClick={() => onPreview(voucher)}
                    className="inline-flex items-center gap-1 border border-blue-200 bg-blue-50 px-2 py-1 text-xs font-black text-blue-800"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    View / Print
                  </button>
                  <button
                    type="button"
                    onClick={() => onToggleVisibility(voucher, !voucher.customer_visible)}
                    disabled={saving}
                    className={`px-2 py-1 text-xs font-black ${
                      voucher.customer_visible
                        ? 'border border-red-200 bg-red-50 text-red-700'
                        : 'bg-[#8b1e2d] text-white'
                    }`}
                  >
                    {voucher.customer_visible ? 'Revoke' : 'Release'}
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
