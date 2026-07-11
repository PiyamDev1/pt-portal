import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { resolvePackageSelection } from '@/lib/packageQuote'
import type { PackageSelectionInput, PackageResolvedSelection } from '@/app/types/packages'

function isPackageSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as PackageSelectionInput | null
  if (!body || !body.stayOptionIds) return apiError('Missing package selection', 400)

  const { data: quote, error } = await supabase
    .from('travel_package_quotes')
    .select('id, status, payload')
    .eq('id', id)
    .single()

  if (error || !quote) {
    if (isPackageSchemaError(error)) {
      return apiError('Package quote schema is not installed yet', 503)
    }
    return apiError('Package quote not found', 404)
  }

  if ((quote as { status?: string }).status === 'archived') {
    return apiError('Archived package quotes cannot be finalised', 400)
  }

  let resolved: PackageResolvedSelection
  try {
    resolved = resolvePackageSelection((quote as { payload?: unknown }).payload, body)
  } catch (selectionError) {
    return apiError(
      selectionError instanceof Error ? selectionError.message : 'Invalid package selection',
      400,
    )
  }

  const customerName = resolved.selection.customerName || null
  const customerPhone = resolved.selection.customerPhone || null
  const customerEmail = resolved.selection.customerEmail || null

  const { error: updateError } = await supabase
    .from('travel_package_quotes')
    .update({
      selected_option: resolved,
      selected_at: new Date().toISOString(),
      selection_note: resolved.selection.note || null,
      customer_name: customerName,
      customer_phone: customerPhone,
      customer_email: customerEmail,
    })
    .eq('id', id)

  if (updateError) {
    if (isPackageSchemaError(updateError)) {
      return apiError('Package quote schema is not installed yet', 503)
    }
    return apiError(updateError.message || 'Failed to finalise package selection', 500)
  }

  return apiOk({ selected: resolved })
}
