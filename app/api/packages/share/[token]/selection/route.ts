import { NextRequest } from 'next/server'
import { z } from 'zod'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { isPackageQuoteExpired, resolvePackageSelection } from '@/lib/packageQuote'
import type { PackageSelectionInput } from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { createPublicResolvedPackageSelection } from '@/lib/packagePublicQuote'
import {
  markPackageQuoteSyncFailed,
  syncConvertedPackageFromQuotes,
} from '@/lib/packageQuoteSyncServer'

const PUBLIC_SELECTION_BODY_LIMIT_BYTES = 64 * 1024
const MAX_SELECTION_GROUPS = 50
const MAX_ADDONS_PER_STAY = 50
const selectionIdSchema = z.string().min(1).max(200)

const selectedOptionIdsSchema = z
  .record(selectionIdSchema, selectionIdSchema)
  .refine((value) => Object.keys(value).length <= MAX_SELECTION_GROUPS, {
    message: `A selection can contain at most ${MAX_SELECTION_GROUPS} groups`,
  })

const selectedAddonIdsSchema = z
  .record(selectionIdSchema, z.array(selectionIdSchema).max(MAX_ADDONS_PER_STAY))
  .refine((value) => Object.keys(value).length <= MAX_SELECTION_GROUPS, {
    message: `A selection can contain add-ons for at most ${MAX_SELECTION_GROUPS} stays`,
  })

const packageSelectionSchema = z
  .object({
    stayOptionIds: selectedOptionIdsSchema,
    hotelAddonOptionIds: selectedAddonIdsSchema.optional(),
    flightOptionId: selectionIdSchema.nullable().optional(),
    linkedFlightOptionIds: selectedOptionIdsSchema.optional(),
    visaOptionId: selectionIdSchema.nullable().optional(),
    transportOptionId: selectionIdSchema.nullable().optional(),
    paymentMethod: z.enum(['cash', 'bank_transfer', 'card']).nullable().optional(),
    paymentBreakdown: z
      .object({
        cash: z.number().optional(),
        bankTransfer: z.number().optional(),
        card: z.number().optional(),
      })
      .strip()
      .nullable()
      .optional(),
    paymentScope: z.enum(['current', 'group']).optional(),
    groupPaymentBreakdown: z
      .object({
        cash: z.number().optional(),
        bankTransfer: z.number().optional(),
        card: z.number().optional(),
      })
      .strip()
      .nullable()
      .optional(),
    paymentIntent: z
      .enum(['full_payment', 'deposit_only', 'installment_request'])
      .nullable()
      .optional(),
    installmentRequested: z.boolean().optional(),
    depositPaymentMethod: z.enum(['cash', 'bank_transfer', 'card']).nullable().optional(),
    termsAccepted: z.boolean().optional(),
    saveOnly: z.boolean().optional(),
    customerName: z.string().max(200).optional(),
    customerPhone: z.string().max(64).optional(),
    customerEmail: z.string().max(320).optional(),
    note: z.string().max(8000).optional(),
  })
  .strip()

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const cleanToken = token.trim()
  if (!cleanToken) return apiError('Missing share token', 400)

  const limit = await enforceRateLimit(request, {
    scope: 'public.package-selection',
    limit: 30,
    windowSeconds: 15 * 60,
    identities: [`ip:${getClientIp(request)}`, `token:${cleanToken}`],
  })
  if (!limit.allowed) return limit.response

  const {
    data: body,
    error: bodyError,
    issues,
  } = await parseBodyWithSchema(request, packageSelectionSchema, {
    maxBytes: PUBLIC_SELECTION_BODY_LIMIT_BYTES,
  })
  if (bodyError || !body) {
    const missingSelection = issues?.some(
      (issue) => issue.path[0] === 'stayOptionIds' && issue.code === 'invalid_type',
    )
    return apiError(
      missingSelection ? 'Missing package selection' : bodyError || 'Invalid package selection',
      bodyError === 'Request body is too large' ? 413 : 400,
    )
  }
  const saveOnly = body.saveOnly === true
  const selectionInput: PackageSelectionInput = { ...body }
  delete selectionInput.saveOnly
  if (!saveOnly && !body.termsAccepted) {
    return apiError('Please confirm that you have read the terms and conditions.', 400)
  }

  const supabase = getServiceSupabaseClient()
  const { data: quote, error } = await supabase
    .from('travel_package_quotes')
    .select('id, payload, expires_at, converted_package_id')
    .eq('share_token', cleanToken)
    .eq('share_enabled', true)
    .neq('status', 'archived')
    .single()

  if (error || !quote) {
    return apiError('Package quote not found or no longer available', 404)
  }

  if (isPackageQuoteExpired((quote as { expires_at?: string }).expires_at)) {
    return apiError(
      'This package quote has expired. Please contact your agent for an updated quote.',
      410,
    )
  }

  let resolved
  try {
    resolved = resolvePackageSelection(quote.payload, selectionInput)
  } catch (selectionError) {
    return apiError(
      selectionError instanceof Error ? selectionError.message : 'Invalid package selection',
      400,
    )
  }

  const now = new Date().toISOString()
  const updatePayload: Record<string, unknown> = saveOnly
    ? {
        selected_option: resolved,
        selected_at: now,
        selection_note: resolved.selection.note || null,
        customer_name: resolved.selection.customerName || null,
        customer_phone: resolved.selection.customerPhone || null,
        customer_email: resolved.selection.customerEmail || null,
        customer_selection_note: resolved.selection.note || null,
      }
    : {
        selected_option: resolved,
        selected_at: now,
        selection_note: resolved.selection.note || null,
        customer_name: resolved.selection.customerName || null,
        customer_phone: resolved.selection.customerPhone || null,
        customer_email: resolved.selection.customerEmail || null,
        status: 'customer_selected',
        finalised_at: now,
        finalised_source: 'customer',
        customer_selection_note: resolved.selection.note || null,
      }

  const { error: updateError } = await supabase
    .from('travel_package_quotes')
    .update(updatePayload)
    .eq('id', quote.id)

  if (updateError) {
    return apiError(updateError.message || 'Failed to save package selection', 500)
  }

  if (!saveOnly && resolved.selection.paymentScope === 'group') {
    const { data: membership } = await supabase
      .from('travel_package_group_members')
      .select('group_id')
      .eq('quote_id', quote.id)
      .maybeSingle()
    const groupId = (membership as { group_id?: string } | null)?.group_id
    if (groupId) {
      await supabase
        .from('travel_package_groups')
        .update({
          customer_file_mode: 'combined',
          customer_visibility_mode: 'shared_group_view',
          updated_at: now,
        })
        .eq('id', groupId)
    }
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      quoteId: quote.id,
      eventType: saveOnly ? 'customer_quote_selection_saved' : 'customer_quote_finalised',
      eventSummary: saveOnly
        ? 'Customer saved a linked package selection.'
        : 'Customer finalised a package selection.',
      afterData: resolved,
      metadata: { source: 'customer', saveOnly },
    },
  )

  const packageId = (quote as { converted_package_id?: string | null }).converted_package_id
  if (packageId) {
    try {
      await syncConvertedPackageFromQuotes(supabase, {
        packageId,
        triggerQuoteId: quote.id,
        reason: saveOnly
          ? 'Quotation and package operations reconciled after a customer saved linked selections.'
          : 'Quotation and package operations reconciled after customer finalisation.',
      })
    } catch (syncError) {
      await markPackageQuoteSyncFailed(supabase, packageId, syncError)
    }
  }

  return apiOk({ selected: createPublicResolvedPackageSelection(resolved), saveOnly })
}
