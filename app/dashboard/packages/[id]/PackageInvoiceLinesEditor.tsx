'use client'

import { useEffect, useState } from 'react'
import { Eye, EyeOff, Loader2, Plus, Save, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import type {
  TravelPackageInvoice,
  TravelPackageInvoiceLine,
  TravelPackageInvoiceLineType,
} from '@/app/types/packages'
import { formatMoney } from '@/lib/packageQuote'

type Props = {
  packageId: string
  invoice: TravelPackageInvoice
  disabled?: boolean
  onInvoiceChange: (invoice: TravelPackageInvoice) => void
}

type LineForm = {
  lineType: TravelPackageInvoiceLineType
  description: string
  quantity: string
  unitSoldPrice: string
  unitBookedCost: string
  discountAmount: string
  expectedCommission: string
  receivedCommission: string
  customerVisible: boolean
}

const LINE_TYPES: TravelPackageInvoiceLineType[] = [
  'flight',
  'hotel',
  'visa',
  'transport',
  'discount',
  'commission',
  'other',
]

function formFromLine(line?: TravelPackageInvoiceLine): LineForm {
  return {
    lineType: line?.line_type || 'other',
    description: line?.description || '',
    quantity: String(line?.quantity ?? 1),
    unitSoldPrice: String(line?.unit_sold_price || ''),
    unitBookedCost: String(line?.unit_booked_cost || ''),
    discountAmount: String(line?.discount_amount || ''),
    expectedCommission: String(line?.expected_commission || ''),
    receivedCommission: String(line?.received_commission || ''),
    customerVisible: line?.customer_visible ?? true,
  }
}

export default function PackageInvoiceLinesEditor({
  packageId,
  invoice,
  disabled,
  onInvoiceChange,
}: Props) {
  const [forms, setForms] = useState<Record<string, LineForm>>({})
  const [newLine, setNewLine] = useState<LineForm>(() => formFromLine())
  const [savingId, setSavingId] = useState<string | null>(null)

  useEffect(() => {
    setForms(Object.fromEntries((invoice.lines || []).map((line) => [line.id, formFromLine(line)])))
  }, [invoice.lines])

  const updateForm = <Key extends keyof LineForm>(
    lineId: string,
    key: Key,
    value: LineForm[Key],
  ) => {
    setForms((current) => ({
      ...current,
      [lineId]: { ...(current[lineId] || formFromLine()), [key]: value },
    }))
  }

  const saveLine = async (line: TravelPackageInvoiceLine) => {
    const form = forms[line.id] || formFromLine(line)
    setSavingId(line.id)
    try {
      const response = await fetch(`/api/travel-packages/${packageId}/invoice/lines/${line.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      })
      const data = (await response.json()) as {
        line?: TravelPackageInvoiceLine
        invoice?: TravelPackageInvoice
        error?: string
      }
      if (!response.ok || !data.line) throw new Error(data.error || 'Failed to update invoice line')
      onInvoiceChange({
        ...(data.invoice || invoice),
        lines: (invoice.lines || []).map((item) => (item.id === line.id ? data.line! : item)),
      })
      toast.success('Invoice line updated')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to update invoice line')
    } finally {
      setSavingId(null)
    }
  }

  const addLine = async () => {
    setSavingId('new')
    try {
      const response = await fetch(`/api/travel-packages/${packageId}/invoice/lines`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...newLine, invoiceId: invoice.id }),
      })
      const data = (await response.json()) as {
        line?: TravelPackageInvoiceLine
        invoice?: TravelPackageInvoice
        error?: string
      }
      if (!response.ok || !data.line) throw new Error(data.error || 'Failed to add invoice line')
      onInvoiceChange({
        ...(data.invoice || invoice),
        lines: [...(invoice.lines || []), data.line],
      })
      setNewLine(formFromLine())
      toast.success('Invoice line added')
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to add invoice line')
    } finally {
      setSavingId(null)
    }
  }

  const deleteLine = async (line: TravelPackageInvoiceLine) => {
    if (!window.confirm(`Delete invoice line "${line.description}"?`)) return
    setSavingId(line.id)
    try {
      const response = await fetch(`/api/travel-packages/${packageId}/invoice/lines/${line.id}`, {
        method: 'DELETE',
      })
      const data = (await response.json()) as { invoice?: TravelPackageInvoice; error?: string }
      if (!response.ok) throw new Error(data.error || 'Failed to delete invoice line')
      onInvoiceChange({
        ...(data.invoice || invoice),
        lines: (invoice.lines || []).filter((item) => item.id !== line.id),
      })
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to delete invoice line')
    } finally {
      setSavingId(null)
    }
  }

  const fields = (
    form: LineForm,
    update: <Key extends keyof LineForm>(key: Key, value: LineForm[Key]) => void,
  ) => (
    <>
      <select
        value={form.lineType}
        onChange={(event) => update('lineType', event.target.value as TravelPackageInvoiceLineType)}
        className="border border-slate-300 px-2 py-2 text-xs"
      >
        {LINE_TYPES.map((type) => (
          <option key={type} value={type}>
            {type}
          </option>
        ))}
      </select>
      <input
        value={form.description}
        onChange={(event) => update('description', event.target.value)}
        placeholder="Description"
        className="min-w-48 border border-slate-300 px-2 py-2 text-xs"
      />
      <input
        value={form.quantity}
        onChange={(event) => update('quantity', event.target.value)}
        type="number"
        step="0.01"
        title="Quantity"
        placeholder="Qty"
        className="w-20 border border-slate-300 px-2 py-2 text-xs"
      />
      <input
        value={form.unitSoldPrice}
        onChange={(event) => update('unitSoldPrice', event.target.value)}
        type="number"
        step="0.01"
        title="Unit sold price"
        placeholder="Sold"
        className="w-24 border border-slate-300 px-2 py-2 text-xs"
      />
      <input
        value={form.unitBookedCost}
        onChange={(event) => update('unitBookedCost', event.target.value)}
        type="number"
        step="0.01"
        title="Unit booked cost"
        placeholder="Cost"
        className="w-24 border border-slate-300 px-2 py-2 text-xs"
      />
      <input
        value={form.discountAmount}
        onChange={(event) => update('discountAmount', event.target.value)}
        type="number"
        step="0.01"
        title="Discount"
        placeholder="Discount"
        className="w-24 border border-slate-300 px-2 py-2 text-xs"
      />
      <input
        value={form.expectedCommission}
        onChange={(event) => update('expectedCommission', event.target.value)}
        type="number"
        step="0.01"
        title="Expected commission"
        placeholder="Commission"
        className="w-24 border border-slate-300 px-2 py-2 text-xs"
      />
      <button
        type="button"
        title={form.customerVisible ? 'Visible on customer invoice' : 'Internal line'}
        onClick={() => update('customerVisible', !form.customerVisible)}
        className={`p-2 ${form.customerVisible ? 'text-emerald-600' : 'text-slate-400'}`}
      >
        {form.customerVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
      </button>
    </>
  )

  return (
    <div className="mt-4 border border-slate-200">
      <div className="flex items-center justify-between border-b border-slate-200 bg-slate-50 px-3 py-2">
        <div>
          <p className="text-sm font-black text-slate-950">Invoice lines</p>
          <p className="text-xs text-slate-500">Customer visibility is controlled per line.</p>
        </div>
        <span className="text-xs font-bold text-slate-500">
          {(invoice.lines || []).length} lines
        </span>
      </div>
      {disabled && (
        <p className="border-b border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
          Start an amendment before changing a released invoice.
        </p>
      )}
      <div className="divide-y divide-slate-200 overflow-x-auto">
        {(invoice.lines || []).map((line) => {
          const form = forms[line.id] || formFromLine(line)
          return (
            <div key={line.id} className="min-w-[980px] p-3">
              <div className="flex items-center gap-2">
                {fields(form, (key, value) => updateForm(line.id, key, value))}
                <span className="ml-auto w-24 text-right text-xs font-black">
                  {formatMoney(line.total_sold_price - line.discount_amount, invoice.currency)}
                </span>
                <button
                  type="button"
                  title="Save line"
                  disabled={disabled || savingId === line.id}
                  onClick={() => void saveLine(line)}
                  className="bg-slate-900 p-2 text-white disabled:opacity-40"
                >
                  {savingId === line.id ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Save className="h-4 w-4" />
                  )}
                </button>
                <button
                  type="button"
                  title="Delete line"
                  disabled={disabled || savingId === line.id}
                  onClick={() => void deleteLine(line)}
                  className="p-2 text-red-600 disabled:opacity-40"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          )
        })}
        <div className="min-w-[980px] bg-slate-50 p-3">
          <div className="flex items-center gap-2">
            {fields(newLine, (key, value) =>
              setNewLine((current) => ({ ...current, [key]: value })),
            )}
            <button
              type="button"
              title="Add line"
              disabled={disabled || savingId === 'new' || !newLine.description.trim()}
              onClick={() => void addLine()}
              className="ml-auto inline-flex items-center gap-2 bg-[#8b1e2d] px-3 py-2 text-xs font-black text-white disabled:opacity-40"
            >
              {savingId === 'new' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
