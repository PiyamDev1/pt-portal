import { NextRequest } from 'next/server'
import { apiError } from '@/lib/api/http'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { COMMISSION_CAPABILITY_VERSION } from '@/lib/commissions/contracts'
import { hasCommissionSchemaCapability } from '@/lib/commissions/schemaCapability'

export const COMMISSION_PRIVATE_RESPONSE = {
  headers: { 'Cache-Control': 'private, no-store' },
} as const

export function commissionError(message: string, status: number) {
  return apiError(message, status, {}, COMMISSION_PRIVATE_RESPONSE)
}

export function readIdempotencyKey(request: NextRequest) {
  const value = request.headers.get('idempotency-key')?.trim()
  return value && /^[A-Za-z0-9][A-Za-z0-9:._-]{7,199}$/.test(value) ? value : null
}

export async function hasCommissionCapability(minimumVersion = COMMISSION_CAPABILITY_VERSION) {
  const { data, error } = await getServiceSupabaseClient().rpc('commission_schema_status')
  return !error && hasCommissionSchemaCapability(data, minimumVersion)
}

export function publicCommissionDatabaseError(error: { code?: string; message?: string } | null) {
  if (!error) return { message: 'Commission request failed.', status: 500 }
  if (error.code === '23505')
    return { message: 'That Commission record already exists.', status: 409 }
  if (error.code === '23P01')
    return { message: 'That assignment overlaps an existing assignment.', status: 409 }
  if (error.code === 'P0002')
    return { message: 'The requested Commission record was not found.', status: 404 }
  if (error.code === '42501') return { message: 'Forbidden', status: 403 }
  if (error.code === '55000') {
    return { message: 'That Commission record is not currently retryable.', status: 409 }
  }
  if (error.code === '22023' || error.code === '23514') {
    return { message: 'The Commission configuration is invalid.', status: 400 }
  }
  return { message: 'Commission request failed.', status: 500 }
}
