'use client'

import { Check, ExternalLink, Save, ShieldCheck } from 'lucide-react'

type PackageTransportVoucherActionsPreviewProps = {
  hasEditingVoucher: boolean
  voucherVersion: number | null
  saving: boolean
  passengerError: string
  previewHtml: string
  onSaveEdits: () => void | Promise<void>
  onGenerate: (customerVisible: boolean) => void | Promise<void>
  onOpenPreview: () => void
}

export function PackageTransportVoucherActionsPreview({
  hasEditingVoucher,
  voucherVersion,
  saving,
  passengerError,
  previewHtml,
  onSaveEdits,
  onGenerate,
  onOpenPreview,
}: PackageTransportVoucherActionsPreviewProps) {
  const actionDisabled = saving || Boolean(passengerError)

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {hasEditingVoucher && (
          <button
            type="button"
            onClick={() => void onSaveEdits()}
            disabled={actionDisabled}
            className="inline-flex items-center gap-2 border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-black text-emerald-800"
          >
            <Check className="h-4 w-4" />
            Save edits to selected voucher
          </button>
        )}
        <button
          type="button"
          onClick={() => void onGenerate(false)}
          disabled={actionDisabled}
          className="inline-flex items-center gap-2 border border-slate-300 bg-white px-3 py-2 text-xs font-black"
        >
          <Save className="h-4 w-4" />
          Generate new internal voucher
        </button>
        <button
          type="button"
          onClick={() => void onGenerate(true)}
          disabled={actionDisabled}
          className="inline-flex items-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white"
        >
          <ShieldCheck className="h-4 w-4" />
          Generate new and release
        </button>
      </div>

      <div className="border border-slate-200 bg-slate-50 p-3">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h3 className="text-sm font-black text-slate-900">Voucher preview</h3>
          <div className="flex items-center gap-2">
            <p className="text-xs font-bold text-slate-500">
              {voucherVersion !== null ? `v${voucherVersion}` : 'Unsaved preview'}
            </p>
            <button
              type="button"
              onClick={onOpenPreview}
              className="inline-flex items-center gap-1 border border-slate-300 bg-white px-2 py-1 text-xs font-black text-slate-700"
            >
              <ExternalLink className="h-3.5 w-3.5" />
              View / Print
            </button>
          </div>
        </div>
        <iframe
          title="Transport voucher preview"
          srcDoc={previewHtml}
          className="h-[34rem] w-full border border-slate-200 bg-white"
        />
      </div>
    </>
  )
}
