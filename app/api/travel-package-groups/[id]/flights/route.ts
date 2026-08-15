import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import type { PackageQuotePayload, TravelPackageQuote } from '@/app/types/packages'
import { copySharedPackageFlights, isTravelPackageGroupSchemaError } from '@/lib/packageGroups'
import { normalizePackageQuotePayload } from '@/lib/packageQuote'

type GroupRow = {
  id: string
  metadata: Record<string, unknown> | null
  customer_visibility_mode: string
}

type GroupMemberRow = {
  quote_id: string | null
}

type QuoteRow = Pick<TravelPackageQuote, 'id' | 'payload'>

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as {
    sourceQuoteId?: unknown
    enabled?: unknown
  } | null
  const sourceQuoteId = typeof body?.sourceQuoteId === 'string' ? body.sourceQuoteId.trim() : ''
  const enabled = body?.enabled === true

  if (!sourceQuoteId) return apiError('Source quote is required', 400)

  try {
    const [{ data: groupData, error: groupError }, { data: memberData, error: memberError }] =
      await Promise.all([
        supabase
          .from('travel_package_groups')
          .select('id, metadata, customer_visibility_mode')
          .eq('id', id)
          .single(),
        supabase.from('travel_package_group_members').select('quote_id').eq('group_id', id),
      ])

    if (groupError || !groupData) throw groupError || new Error('Package group not found')
    if (memberError) throw memberError

    const group = groupData as unknown as GroupRow
    const quoteIds = [
      ...new Set(
        ((memberData || []) as unknown as GroupMemberRow[])
          .map((member) => member.quote_id)
          .filter((quoteId): quoteId is string => Boolean(quoteId)),
      ),
    ]

    if (!quoteIds.includes(sourceQuoteId)) {
      return apiError('Source quote is not a member of this package group', 400)
    }

    let syncedQuoteIds: string[] = []
    if (enabled) {
      const { data: quoteData, error: quoteError } = await supabase
        .from('travel_package_quotes')
        .select('id, payload')
        .in('id', quoteIds)

      if (quoteError) throw quoteError

      const quotes = (quoteData || []) as unknown as QuoteRow[]
      const sourceQuote = quotes.find((quote) => quote.id === sourceQuoteId)
      if (!sourceQuote) return apiError('Source quote could not be loaded', 404)

      const sourcePayload = normalizePackageQuotePayload(sourceQuote.payload)
      if (sourcePayload.flightOptions.length === 0) {
        return apiError('Add at least one flight option before sharing flights', 400)
      }

      const targetQuotes = quotes.filter((quote) => quote.id !== sourceQuoteId)
      const syncResults = await Promise.all(
        targetQuotes.map(async (quote) => {
          const targetPayload = normalizePackageQuotePayload(quote.payload)
          const payload = normalizePackageQuotePayload(
            copySharedPackageFlights(sourcePayload, targetPayload),
          )
          const { error } = await supabase
            .from('travel_package_quotes')
            .update({
              payload: payload as PackageQuotePayload,
              selected_option: null,
              selected_at: null,
              selection_note: null,
              finalised_at: null,
              finalised_by: null,
              finalised_source: null,
              customer_selection_note: null,
              agent_selection_note: null,
            })
            .eq('id', quote.id)

          if (error) throw error
          return quote.id
        }),
      )
      syncedQuoteIds = syncResults
    }

    const nextMetadata = {
      ...(group.metadata || {}),
      sharedFlightSelection: enabled,
    }
    const groupUpdate: Record<string, unknown> = {
      metadata: nextMetadata,
      updated_by: user.id,
    }
    if (enabled && group.customer_visibility_mode !== 'private') {
      groupUpdate.customer_visibility_mode = 'shared_group_view'
    }

    const { error: groupUpdateError } = await supabase
      .from('travel_package_groups')
      .update(groupUpdate)
      .eq('id', id)

    if (groupUpdateError) throw groupUpdateError

    return apiOk({
      enabled,
      syncedQuoteIds,
      syncedCount: syncedQuoteIds.length,
    })
  } catch (error) {
    if (isTravelPackageGroupSchemaError(error)) {
      return apiError('Linked package group schema is not installed', 503)
    }
    return apiError(
      (error as { message?: string })?.message || 'Failed to update shared flights',
      500,
    )
  }
}
