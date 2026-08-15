import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  isPackageQuoteExpired,
  normalizePackageExpiry,
  normalizePackageQuotePayload,
  rebuildConvertedPackageSnapshot,
} from '@/lib/packageQuote'
import type { TravelPackageFolder, TravelPackageQuote } from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'

const SCHEMA_HINT =
  'Package quote schema is not installed yet. Run scripts/migrations/20260708_create_travel_package_quotes.sql in Supabase SQL editor.'

function isPackageSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function selectPackageColumns() {
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
    finalised_at,
    finalised_by,
    finalised_source,
    customer_selection_note,
    agent_selection_note,
    last_shared_by,
    archived_at,
    created_by,
    created_at,
    updated_at
  `
}

async function requireUser() {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  return { supabase, user }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()
  if (!user) return apiError('Unauthorized', 401)

  const { data, error } = await supabase
    .from('travel_package_quotes')
    .select(selectPackageColumns())
    .eq('id', id)
    .single()

  if (error) {
    if (isPackageSchemaError(error)) {
      return apiOk({ quote: null, setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Package quote not found', 404)
  }

  return apiOk({ quote: data as unknown as TravelPackageQuote, setupRequired: false })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const { supabase, user } = await requireUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as {
    payload?: unknown
    expiresAt?: unknown
    shareEnabled?: boolean
    status?: string
  } | null

  if (!body) return apiError('Invalid request payload', 400)

  const updates: Record<string, unknown> = {}

  if (body.payload !== undefined) {
    const payload = normalizePackageQuotePayload(body.payload)
    updates.title = payload.title
    updates.package_type = payload.packageType
    updates.currency = payload.currency
    updates.customer_name = payload.customerName || null
    updates.customer_phone = payload.customerPhone || null
    updates.customer_email = payload.customerEmail || null
    updates.payload = payload
    updates.selected_option = null
    updates.selected_at = null
    updates.selection_note = null
    updates.finalised_at = null
    updates.finalised_by = null
    updates.finalised_source = null
    updates.customer_selection_note = null
    updates.agent_selection_note = null
    if (body.shareEnabled !== undefined) {
      updates.status = body.shareEnabled === true ? 'shared' : 'draft'
    }
  }

  if (body.expiresAt !== undefined) {
    const expiresAt = normalizePackageExpiry(body.expiresAt)
    if (body.shareEnabled !== false && isPackageQuoteExpired(expiresAt)) {
      return apiError('Package quote expiry must be in the future', 400)
    }
    updates.expires_at = expiresAt
  }

  if (body.status !== undefined) {
    if (
      ![
        'draft',
        'shared',
        'expired',
        'customer_selected',
        'agent_selected',
        'finalised',
        'converted',
        'archived',
      ].includes(body.status)
    ) {
      return apiError('Invalid package quote status', 400)
    }
    updates.status = body.status
  }

  if (body.shareEnabled !== undefined) {
    if (body.shareEnabled) {
      const shareExpiry = String(updates.expires_at || normalizePackageExpiry(undefined))
      if (isPackageQuoteExpired(shareExpiry)) {
        return apiError('Package quote expiry must be in the future', 400)
      }
      updates.expires_at = shareExpiry
    }
    updates.share_enabled = body.shareEnabled
    updates.status = body.shareEnabled ? 'shared' : updates.status || 'draft'
    updates.shared_at = body.shareEnabled ? new Date().toISOString() : null
    updates.last_shared_by = body.shareEnabled ? user.id : null
  }

  if (updates.status === 'archived') updates.archived_at = new Date().toISOString()

  if (Object.keys(updates).length === 0) {
    return apiError('No fields provided to update', 400)
  }

  const { data, error } = await supabase
    .from('travel_package_quotes')
    .update(updates)
    .eq('id', id)
    .select(selectPackageColumns())
    .single()

  if (error) {
    if (isPackageSchemaError(error)) {
      return apiOk({ quote: null, setupRequired: true, message: SCHEMA_HINT })
    }
    return apiError(error.message || 'Failed to update package quote', 500)
  }

  const updatedQuote = data as unknown as TravelPackageQuote
  let packageSynced: boolean | undefined
  let packageSyncMessage: string | undefined

  if (body.payload !== undefined && updatedQuote.converted_package_id) {
    packageSynced = false
    const packageId = updatedQuote.converted_package_id
    const { data: packageData, error: packageError } = await supabase
      .from('travel_packages')
      .select('id, selected_quote_snapshot')
      .eq('id', packageId)
      .maybeSingle()

    if (packageError || !packageData) {
      packageSyncMessage = 'Quote saved, but the converted package folder could not be found'
    } else {
      const previousSnapshot = (
        packageData as Pick<TravelPackageFolder, 'id' | 'selected_quote_snapshot'>
      ).selected_quote_snapshot
      try {
        const refreshed = rebuildConvertedPackageSnapshot(updatedQuote, previousSnapshot)
        const { error: packageUpdateError } = await supabase
          .from('travel_packages')
          .update({
            selected_quote_snapshot: refreshed.snapshot,
            current_public_summary: refreshed.publicSummary,
          })
          .eq('id', packageId)

        if (packageUpdateError) {
          packageSyncMessage = `Quote saved, but the package folder could not be refreshed: ${packageUpdateError.message}`
        } else {
          packageSynced = true
          packageSyncMessage = 'Converted package folder refreshed from the corrected quote'
          await recordPackageAuditEvent(
            supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
            {
              packageId,
              quoteId: updatedQuote.id,
              actorId: user.id,
              eventType: 'package_quote_snapshot_refreshed',
              eventSummary: 'Converted package snapshot refreshed after its source quote was edited.',
              beforeData: previousSnapshot,
              afterData: refreshed.snapshot,
              metadata: { reservationsPreserved: true },
            },
          )
        }
      } catch (syncError) {
        packageSyncMessage = `Quote saved, but the package folder needs a new final selection: ${
          syncError instanceof Error ? syncError.message : 'selection could not be refreshed'
        }`
      }
    }
  }

  return apiOk({
    quote: updatedQuote,
    setupRequired: false,
    packageSynced,
    packageSyncMessage,
  })
}
