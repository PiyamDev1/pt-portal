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
import type {
  PackageQuotePayload,
  PackageSelectionInput,
  TravelPackageQuote,
} from '@/app/types/packages'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import {
  createPublicPackageQuotePayload,
  createPublicResolvedPackageSelection,
} from '@/lib/packagePublicQuote'

const LINKED_PACKAGE_NOTICE =
  'This package shares travel arrangements with another family or group.'

type PublicGroupRow = {
  id: string
  group_reference: string
  title: string
  customer_visibility_mode: string
  metadata: Record<string, unknown> | null
}

type PublicGroupMemberRow = {
  quote_id: string | null
  family_label: string | null
  customer_visible: boolean
  metadata: Record<string, unknown> | null
}

type PublicQuoteSource = Pick<
  TravelPackageQuote,
  'id' | 'title' | 'payload' | 'expires_at' | 'selected_option'
> &
  Partial<
    Pick<
      TravelPackageQuote,
      'customer_name' | 'customer_phone' | 'customer_email' | 'share_token' | 'share_enabled'
    >
  >

function selectCurrentQuoteColumns() {
  return `
    id,
    title,
    customer_name,
    customer_phone,
    customer_email,
    payload,
    expires_at,
    selected_option
  `
}

function selectLinkedQuoteColumns() {
  return `
    id,
    title,
    payload,
    share_token,
    share_enabled,
    expires_at,
    selected_option
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
    customer_visibility_mode,
    metadata
  `
}

function selectPublicGroupMemberColumns() {
  return `
    quote_id,
    family_label,
    customer_visible,
    sort_order,
    metadata
  `
}

function getSharePath(quote: PublicQuoteSource) {
  return quote.share_enabled && quote.share_token && !isPackageQuoteExpired(quote.expires_at)
    ? `/packages/${quote.share_token}`
    : null
}

function buildPublicFamilySummary(
  quote: PublicQuoteSource,
  familyLabel: string,
  isCurrent: boolean,
) {
  const payload = normalizePackageQuotePayload(quote.payload)
  const baseSelection = buildPublicBaseSelection(quote, payload)
  const resolved = quote.selected_option || resolvePackageSelection(payload, baseSelection)
  const breakdown = getPackagePassengerPriceBreakdown(payload, resolved.combination)

  return {
    familyLabel,
    quoteTitle: quote.title,
    sharePath: getSharePath(quote),
    isCurrent,
    payload: createPublicPackageQuotePayload(payload),
    baseSelection,
    pricing: {
      grossPrice: resolved.combination.grossPrice,
      discountTotal: resolved.combination.offerDiscountTotal,
      totalPrice: resolved.combination.totalPrice,
      currency: resolved.combination.currency,
      breakdown,
    },
  }
}

function buildPublicBaseSelection(
  quote: PublicQuoteSource,
  payload: PackageQuotePayload,
): PackageSelectionInput {
  const defaultSelection = getDefaultPackageSelection(payload)
  const selected = quote.selected_option?.selection

  return {
    stayOptionIds: selected?.stayOptionIds || defaultSelection.stayOptionIds,
    hotelAddonOptionIds: selected?.hotelAddonOptionIds || defaultSelection.hotelAddonOptionIds,
    flightOptionId: selected?.flightOptionId ?? defaultSelection.flightOptionId,
    linkedFlightOptionIds:
      selected?.linkedFlightOptionIds || defaultSelection.linkedFlightOptionIds,
    visaOptionId: selected?.visaOptionId ?? defaultSelection.visaOptionId,
    transportOptionId: selected?.transportOptionId ?? defaultSelection.transportOptionId,
    paymentMethod: 'bank_transfer',
    paymentBreakdown: null,
  }
}

async function loadPublicLinkedGroup(
  supabase: ReturnType<typeof getServiceSupabaseClient>,
  quote: PublicQuoteSource,
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

    const groupResult = await supabase
      .from('travel_package_groups')
      .select(selectPublicGroupColumns())
      .eq('id', groupId)
      .single()

    if (groupResult.error) throw groupResult.error
    if (!groupResult.data) return null

    const group = groupResult.data as unknown as PublicGroupRow
    if (group.customer_visibility_mode === 'private') return null
    if (group.customer_visibility_mode !== 'shared_group_view') {
      return { notice: LINKED_PACKAGE_NOTICE }
    }

    const membersResult = await supabase
      .from('travel_package_group_members')
      .select(selectPublicGroupMemberColumns())
      .eq('group_id', groupId)
      .order('sort_order', { ascending: true })
      .order('created_at', { ascending: true })
    if (membersResult.error) throw membersResult.error

    const members = ((membersResult.data || []) as unknown as PublicGroupMemberRow[]).filter(
      (member) => member.customer_visible || member.quote_id === quote.id,
    )
    const quoteIds = [...new Set(members.map((member) => member.quote_id).filter(Boolean))]
    if (quoteIds.length === 0) return null

    const { data: linkedQuotes, error: linkedQuotesError } = await supabase
      .from('travel_package_quotes')
      .select(selectLinkedQuoteColumns())
      .in('id', quoteIds)
      .neq('status', 'archived')

    if (linkedQuotesError) throw linkedQuotesError

    const quoteMap = new Map(
      ((linkedQuotes || []) as unknown as PublicQuoteSource[]).map((linkedQuote) => [
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
          (linkedQuote.share_enabled && !isPackageQuoteExpired(linkedQuote.expires_at))),
      )

      if (!linkedQuote || !canShowQuote) {
        return {
          familyLabel,
          quoteTitle:
            typeof member.metadata?.quoteTitle === 'string' ? member.metadata.quoteTitle : null,
          sharePath: null,
          isCurrent,
          pricing: null,
        }
      }

      return buildPublicFamilySummary(linkedQuote, familyLabel, isCurrent)
    })

    return {
      groupReference: group.group_reference,
      title: group.title,
      sharedFlightSelection: group.metadata?.sharedFlightSelection === true,
      families,
    }
  } catch (error) {
    if (isPackageGroupSchemaError(error)) return null
    throw error
  }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params
  const cleanToken = token.trim()
  if (!cleanToken) return apiError('Missing share token', 400)

  const limit = await enforceRateLimit(request, {
    scope: 'public.package-share',
    limit: 60,
    windowSeconds: 60,
    identities: [`ip:${getClientIp(request)}`, `token:${cleanToken}`],
  })
  if (!limit.allowed) return limit.response

  const supabase = getServiceSupabaseClient()
  const { data, error } = await supabase
    .from('travel_package_quotes')
    .select(selectCurrentQuoteColumns())
    .eq('share_token', cleanToken)
    .eq('share_enabled', true)
    .neq('status', 'archived')
    .single()

  if (error || !data) {
    return apiError('Package quote not found or no longer available', 404)
  }

  const quote = data as unknown as PublicQuoteSource
  if (isPackageQuoteExpired(quote.expires_at)) {
    return apiError(
      'This package quote has expired. Please contact your agent for an updated quote.',
      410,
    )
  }

  const linkedGroup = await loadPublicLinkedGroup(supabase, quote)
  const payload = normalizePackageQuotePayload(quote.payload)
  const publicQuote = {
    payload: createPublicPackageQuotePayload(payload),
    expires_at: quote.expires_at,
    customer_name: quote.customer_name || payload.customerName || null,
    customer_phone: quote.customer_phone || payload.customerPhone || null,
    customer_email: quote.customer_email || payload.customerEmail || null,
    selected_option: createPublicResolvedPackageSelection(quote.selected_option),
  }

  return apiOk({ quote: publicQuote, linkedGroup })
}
