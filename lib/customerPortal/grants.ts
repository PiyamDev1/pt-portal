import 'server-only'

import { createHash, randomBytes } from 'node:crypto'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { CustomerIntegrationError } from './http'

type ResourceType = 'application' | 'appointment' | 'trip'

export function hashCustomerGrant(token: string) {
  return createHash('sha256').update(token).digest('base64url')
}

export async function getOrCreateResourceAlias(
  resourceType: 'application' | 'appointment' | 'trip' | 'document' | 'branch' | 'service',
  internalId: string,
  metadata: Record<string, unknown> = {},
) {
  const service = getServiceSupabaseClient()
  const { data: existing } = await service
    .from('customer_portal_resource_aliases')
    .select('public_id,metadata')
    .eq('resource_type', resourceType)
    .eq('internal_id', internalId)
    .maybeSingle()
  if (existing) return { publicId: existing.public_id as string, metadata: existing.metadata }

  const { data, error } = await service
    .from('customer_portal_resource_aliases')
    .insert({ resource_type: resourceType, internal_id: internalId, metadata })
    .select('public_id,metadata')
    .single()
  if (error || !data) {
    if (error?.code === '23505') {
      return getOrCreateResourceAlias(resourceType, internalId, metadata)
    }
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Resource alias could not be created.',
      503,
    )
  }
  return { publicId: data.public_id as string, metadata: data.metadata }
}

export async function resolveResourceAlias(
  resourceType: 'application' | 'appointment' | 'trip' | 'document' | 'branch' | 'service',
  publicId: string,
) {
  const { data, error } = await getServiceSupabaseClient()
    .from('customer_portal_resource_aliases')
    .select('internal_id,metadata')
    .eq('resource_type', resourceType)
    .eq('public_id', publicId)
    .maybeSingle()
  if (error || !data) {
    throw new CustomerIntegrationError('not_found', 'Resource not found.', 404)
  }
  return {
    internalId: data.internal_id as string,
    metadata: data.metadata as Record<string, unknown>,
  }
}

export async function createCustomerAccessGrant(input: {
  resourceType: ResourceType
  internalId: string
  publicId: string
  scopes: string[]
  customerSubject?: string | null
  ttlSeconds: number
  singleUse?: boolean
  metadata?: Record<string, unknown>
}) {
  const token = `pcg_${randomBytes(32).toString('base64url')}`
  const expiresAt = new Date(Date.now() + input.ttlSeconds * 1000).toISOString()
  const { error } = await getServiceSupabaseClient()
    .from('customer_portal_access_grants')
    .insert({
      token_hash: hashCustomerGrant(token),
      resource_type: input.resourceType,
      internal_id: input.internalId,
      public_id: input.publicId,
      customer_subject: input.customerSubject ?? null,
      scopes: input.scopes,
      single_use: Boolean(input.singleUse),
      expires_at: expiresAt,
      metadata: input.metadata ?? {},
    })
  if (error) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Access grant could not be issued.',
      503,
    )
  }
  return { token, expiresAt }
}

export async function verifyCustomerAccessGrant(input: {
  token: string
  resourceType: ResourceType
  publicId?: string
  requiredScope: string
  customerSubject?: string
  consume?: boolean
}) {
  if (!/^pcg_[A-Za-z0-9_-]{40,100}$/.test(input.token)) {
    throw new CustomerIntegrationError('not_found', 'Access grant is invalid.', 404)
  }
  const service = getServiceSupabaseClient()
  let query = service
    .from('customer_portal_access_grants')
    .select(
      'id,internal_id,public_id,customer_subject,scopes,single_use,expires_at,consumed_at,revoked_at,metadata',
    )
    .eq('token_hash', hashCustomerGrant(input.token))
    .eq('resource_type', input.resourceType)
  if (input.publicId) query = query.eq('public_id', input.publicId)
  const { data, error } = await query.maybeSingle()
  if (
    error ||
    !data ||
    data.revoked_at ||
    data.consumed_at ||
    Date.parse(data.expires_at) <= Date.now() ||
    !Array.isArray(data.scopes) ||
    !data.scopes.includes(input.requiredScope) ||
    (input.customerSubject && data.customer_subject !== input.customerSubject)
  ) {
    throw new CustomerIntegrationError('not_found', 'Access grant is invalid or expired.', 404)
  }
  if (input.consume || data.single_use) {
    const { data: consumed, error: consumeError } = await service
      .from('customer_portal_access_grants')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', data.id)
      .is('consumed_at', null)
      .select('id')
      .maybeSingle()
    if (consumeError || !consumed) {
      throw new CustomerIntegrationError('conflict', 'Access grant was already used.', 409)
    }
  }
  return {
    internalId: data.internal_id as string,
    publicId: data.public_id as string,
    customerSubject: data.customer_subject as string | null,
    scopes: data.scopes as string[],
    metadata: data.metadata as Record<string, unknown>,
  }
}
