import { createHash, timingSafeEqual } from 'node:crypto'
import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { normalizePackagePortalReference } from '@/lib/packagePortal'

function normalizeLastName(value: unknown) {
  return typeof value === 'string'
    ? value
        .trim()
        .toLowerCase()
        .normalize('NFKD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^\p{L}'-]/gu, '')
    : ''
}

function namesMatch(left: string, right: string) {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid request', 400)
  const reference = normalizePackagePortalReference(body.reference)
  const lastName = normalizeLastName(body.lastName || body.last_name)
  if (!reference || !lastName) return apiError('Package reference and surname are required', 400)

  const supabase = getServiceSupabaseClient()
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const ipHash = createHash('sha256')
    .update(forwardedFor || request.headers.get('x-real-ip') || 'unknown')
    .digest('hex')
  const attemptWindow = new Date(Date.now() - 15 * 60 * 1000).toISOString()
  const { count: recentAttempts } = await supabase
    .from('travel_package_portal_access_attempts')
    .select('id', { count: 'exact', head: true })
    .eq('ip_hash', ipHash)
    .eq('success', false)
    .gte('created_at', attemptWindow)
  if ((recentAttempts || 0) >= 10) {
    return apiError('Too many attempts. Please wait before trying again.', 429)
  }
  const { data, error } = await supabase
    .from('travel_packages')
    .select(
      'id, package_reference, customer_name, customer_access_last_name, document_access_token, document_access_enabled, document_access_expires_at',
    )
    .ilike('package_reference', reference)
    .maybeSingle()
  if (error || !data) {
    await supabase.from('travel_package_portal_access_attempts').insert({
      ip_hash: ipHash,
      package_reference: reference,
      success: false,
    })
    return apiError('Package details do not match', 404)
  }

  const storedLastName = normalizeLastName(
    data.customer_access_last_name ||
      String(data.customer_name || '')
        .trim()
        .split(/\s+/)
        .at(-1),
  )
  const expired = data.document_access_expires_at
    ? Date.parse(data.document_access_expires_at) <= Date.now()
    : false
  if (
    !data.document_access_enabled ||
    !data.document_access_token ||
    expired ||
    !namesMatch(storedLastName, lastName)
  ) {
    await supabase.from('travel_package_portal_access_attempts').insert({
      ip_hash: ipHash,
      package_reference: reference,
      success: false,
    })
    return apiError(
      expired
        ? 'Customer portal access has expired. Please contact your agent.'
        : 'Package details do not match',
      expired ? 410 : 404,
    )
  }

  await supabase.from('travel_package_portal_access_attempts').insert({
    ip_hash: ipHash,
    package_reference: reference,
    success: true,
  })

  await supabase.from('travel_package_audit_events').insert({
    package_id: data.id,
    event_type: 'customer_portal_login',
    event_summary: 'Customer accessed the package portal using reference and surname.',
    metadata: { method: 'reference_last_name' },
  })
  return apiOk({ token: data.document_access_token })
}
