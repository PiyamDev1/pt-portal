import { apiError, apiOk } from '@/lib/api/http'
import { z } from 'zod'
import { requireStaffSession } from '@/lib/auth/staffSession'
import { POS_PRIVATE_RESPONSE, posErrorResponse } from '@/lib/pos/http'
import { loadPosReceipt } from '@/lib/pos/server'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

function escapeHtml(value: unknown) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function related<T>(value: T | T[] | null | undefined) {
  return Array.isArray(value) ? value[0] || null : value || null
}

function money(value: unknown) {
  return new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' }).format(
    Number(value) || 0,
  )
}

export async function GET(
  request: Request,
  context: { params: Promise<{ transactionId: string }> },
) {
  const access = await requireStaffSession()
  if (!access.authorized) return access.response
  const { transactionId } = await context.params
  const params = new URL(request.url).searchParams
  const keys = [...params.keys()]
  const query = z
    .object({ format: z.enum(['html', 'json', 'text']).default('html') })
    .strict()
    .safeParse(Object.fromEntries(params))
  if (
    !z.string().uuid().safeParse(transactionId).success ||
    keys.length !== new Set(keys).size ||
    !query.success
  ) {
    return apiError('Invalid transaction.', 400, {}, POS_PRIVATE_RESPONSE)
  }
  try {
    const receipt = await loadPosReceipt(access, transactionId)
    const transaction = receipt.transaction as unknown as Record<string, unknown>
    const catalogue = related(
      transaction.pos_catalogue_items as { label: string; option_label: string | null } | null,
    )
    const till = related(transaction.pos_tills as { name: string } | null)
    const employee = related(transaction.employees as { full_name: string | null } | null)
    const tenders = (transaction.pos_transaction_tenders || []) as Array<Record<string, unknown>>
    const sources = (transaction.pos_transaction_source_links || []) as Array<
      Record<string, unknown>
    >
    const format = query.data.format
    if (format === 'json') return apiOk(receipt, POS_PRIVATE_RESPONSE)

    const lines = [
      'PT Portal POS Receipt',
      receipt.branchName,
      `Reference: ${transaction.reference_number}`,
      `Date: ${transaction.occurred_at}`,
      `Till: ${till?.name || 'Till'}`,
      `Agent: ${employee?.full_name || 'Staff member'}`,
      `Customer: ${transaction.customer_name || 'Walk-in'}`,
      `Service: ${catalogue?.label || 'Service'}${catalogue?.option_label ? ` - ${catalogue.option_label}` : ''}`,
      `Total: ${money(transaction.total_amount)}`,
      `Paid: ${money(transaction.amount_paid)}`,
      ...tenders.map((tender) => `${tender.payment_method}: ${money(tender.amount)}`),
      transaction.note ? `Note: ${transaction.note}` : '',
      ...sources.map(
        (source) => `Source: ${source.source_type} ${source.display_reference || source.record_id}`,
      ),
      Number(transaction.loyalty_points_awarded) > 0
        ? `Loyalty awarded: ${transaction.loyalty_points_awarded} points`
        : '',
      `Status: ${transaction.status}`,
    ].filter(Boolean)
    if (format === 'text') {
      return new Response(lines.join('\n'), {
        headers: {
          ...POS_PRIVATE_RESPONSE.headers,
          'Content-Type': 'text/plain; charset=utf-8',
          'Content-Disposition': `attachment; filename="${String(transaction.reference_number)}.txt"`,
        },
      })
    }
    const rows = lines
      .slice(2)
      .map((line) => `<div class="row">${escapeHtml(line)}</div>`)
      .join('')
    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${escapeHtml(transaction.reference_number)}</title><style>body{font-family:ui-monospace,monospace;max-width:420px;margin:32px auto;color:#111}h1{font-size:20px;margin:0}.branch{margin:4px 0 20px}.row{padding:6px 0;border-bottom:1px dashed #bbb}.actions{margin:24px 0}@media print{.actions{display:none}}</style></head><body><h1>PT Portal POS Receipt</h1><div class="branch">${escapeHtml(receipt.branchName)}</div>${rows}<div class="actions"><button onclick="window.print()">Print receipt</button></div></body></html>`
    return new Response(html, {
      headers: { ...POS_PRIVATE_RESPONSE.headers, 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (receiptError) {
    return posErrorResponse(receiptError)
  }
}
