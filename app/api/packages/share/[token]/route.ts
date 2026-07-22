import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import {
  getDefaultPackageSelection,
  getPackagePassengerPriceBreakdown,
  isPackageQuoteExpired,
  normalizePackageQuotePayload,
  resolvePackageSelection,
} from '@/lib/packageQuote'
import type { TravelPackageQuote } from '@/app/types/packages'

type PublicGroupRow = {
  id: string
  group_reference: string
  title: string
  customer_visibility_mode: string
}

type PublicGroupMemberRow = {
  id: string
  group_id: string
  package_id: string | null
  quote_id: string | null
  family_label: string | null
  customer_display_name: string | null
  customer_visible: boolean
  sort_order: number
  metadata: Record<string, unknown> | null
}

function selectPublicPackageColumns() {
  return `
    id,
    title,
    package_type,
    status,
    currency,
    customer_name,
    customer_phone,
    customer_email,
    payload,
    share_token,
    share_enabled,
    shared_at,
    expires_at,
    selected_option,
    selected_at,
    selection_note,
    converted_package_id,
    converted_at,
    created_by,
    created_at,
    updated_at
  `
}

function isPackageGroupSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function selectPublicGroupColumns() {
  return `
    id,
    group_reference,
    title,
    customer_visibility_mode
  `
}

function selectPublicGroupMemberColumns() {
  return `
    id,
    group_id,
    package_id,
    quote_id,
    family_label,
    customer_display_name,
    customer_visible,
    sort_order,
    metadata
  `
}

function getSharePath(quote: TravelPackageQuote) {
  return quote.share_enabled && !isPackageQuoteExpired(quote.expires_at)
    ? `/packages/${quote.share_token}`
    : null
}

function buildPublicFamilySummary(
  quote: TravelPackageQuote,
  familyLabel: string,
  isCurrent: boolean,
) {
  const payload = normalizePackageQuotePayload(quote.payload)
  const resolved =
    quote.selected_option || resolvePackageSelection(payload, getDefaultPackageSelection(payload))
  const breakdown = getPackagePassengerPriceBreakdown(payload, resolved.combination)

  return {
    quoteId: quote.id,
    familyLabel,
    quoteTitle: quote.title,
    customerName: quote.customer_name || payload.customerName || null,
    sharePath: getSharePath(quote),
    isCurrent,
    pricing: {
      grossPrice: resolved.combination.grossPrice,
      discountTotal: resolved.combination.offerDiscountTotal,
      totalPrice: resolved.combination.totalPrice,
      currency: resolved.combination.currency,
      breakdown,
    },
  }
}

async function loadPublicLinkedGroup(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  quote: TravelPackageQuote,
) {
  const payload = normalizePackageQuotePayload(quote.payload)
  const savedGroupId = payload.linkedPackageGroup?.groupId

  try {
    const groupId =
      savedGroupId ||
      (
        await supabase
          .from('travel_package_group_members')
          .select('group_id')
          .eq('quote_id', quote.id)
          .maybeSingle()
      ).data?.group_id

    if (!groupId) return null

    const [groupResult, membersResult] = await Promise.all([
      supabase
        .from('travel_package_groups')
        .select(selectPublicGroupColumns())
        .eq('id', groupId)
        .single(),
      supabase
        .from('travel_package_group_members')
        .select(selectPublicGroupMemberColumns())
        .eq('group_id', groupId)
        .order('sort_order', { ascending: true })
        .order('created_at', { ascending: true }),
    ])

    if (groupResult.error) throw groupResult.error
    if (membersResult.error) throw membersResult.error
    if (!groupResult.data) return null

    const group = groupResult.data as unknown as PublicGroupRow
    const members = ((membersResult.data || []) as unknown as PublicGroupMemberRow[]).filter(
      (member) => member.customer_visible || member.quote_id === quote.id,
    )
    const quoteIds = [...new Set(members.map((member) => member.quote_id).filter(Boolean))]
    if (quoteIds.length === 0) return null

    const { data: linkedQuotes, error: linkedQuotesError } = await supabase
      .from('travel_package_quotes')
      .select(selectPublicPackageColumns())
      .in('id', quoteIds)
      .neq('status', 'archived')

    if (linkedQuotesError) throw linkedQuotesError

    const quoteMap = new Map(
      ((linkedQuotes || []) as unknown as TravelPackageQuote[]).map((linkedQuote) => [
        linkedQuote.id,
        linkedQuote,
      ]),
    )
    quoteMap.set(quote.id, quote)

    const families = members.map((member, index) => {
      const familyLabel = member.family_label || `Family / group ${index + 1}`
      const linkedQuote = member.quote_id ? quoteMap.get(member.quote_id) : null
      const isCurrent = member.quote_id === quote.id
      const canShowQuote = Boolean(
        linkedQuote &&
        (isCurrent ||
          (linkedQuote.share_enabled &&
            linkedQuote.status !== 'archived' &&
            !isPackageQuoteExpired(linkedQuote.expires_at))),
      )

      if (!linkedQuote || !canShowQuote) {
        return {
          quoteId: member.quote_id,
          familyLabel,
          quoteTitle:
            typeof member.metadata?.quoteTitle === 'string' ? member.metadata.quoteTitle : null,
          customerName:
            member.customer_display_name ||
            (typeof member.metadata?.customerName === 'string'
              ? member.metadata.customerName
              : null),
          sharePath: null,
          isCurrent,
          pricing: null,
        }
      }

      return buildPublicFamilySummary(linkedQuote, familyLabel, isCurrent)
    })

    return {
      groupId: group.id,
      groupReference: group.group_reference,
      title: group.title,
      visibilityMode: group.customer_visibility_mode,
      families,
    }
  } catch (error) {
    if (isPackageGroupSchemaError(error)) return null
    throw error
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const cleanToken = token.trim()
  if (!cleanToken) return apiError('Missing share token', 400)

  const supabase = getServiceSupabaseClient()
  const { data, error } = await supabase
    .from('travel_package_quotes')
    .select(selectPublicPackageColumns())
    .eq('share_token', cleanToken)
    .eq('share_enabled', true)
    .neq('status', 'archived')
    .single()

  if (error || !data) {
    return apiError('Package quote not found or no longer available', 404)
  }

  const quote = data as unknown as TravelPackageQuote
  if (isPackageQuoteExpired(quote.expires_at)) {
    return apiError(
      'This package quote has expired. Please contact your agent for an updated quote.',
      410,
    )
  }

  const linkedGroup = await loadPublicLinkedGroup(supabase, quote)

  return apiOk({ quote, linkedGroup })
}
