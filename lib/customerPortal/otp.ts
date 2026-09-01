import 'server-only'

import { createHmac, randomInt, timingSafeEqual } from 'node:crypto'

import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { CustomerIntegrationError } from './http'
import { maskCustomerEmail, sendCustomerPortalOtp } from './otpEmail'

function otpPepper() {
  const value = process.env.CUSTOMER_PORTAL_OTP_PEPPER
  if (!value || value.length < 32) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'OTP protection is not configured.',
      503,
    )
  }
  return value
}

function otpHash(challengeId: string, code: string) {
  return createHmac('sha256', otpPepper()).update(`${challengeId}:${code}`).digest('base64url')
}

export async function createCustomerOtpChallenge(input: {
  purpose: 'link_application' | 'link_trip' | 'claim_appointment'
  resourceType: 'application' | 'trip' | 'appointment'
  internalId: string
  publicId: string
  customerSubject: string
  contactEmail: string
}) {
  const service = getServiceSupabaseClient()
  const challengeId = crypto.randomUUID()
  const code = String(randomInt(0, 1_000_000)).padStart(6, '0')
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  const { error } = await service.from('customer_portal_otp_challenges').insert({
    id: challengeId,
    purpose: input.purpose,
    resource_type: input.resourceType,
    internal_id: input.internalId,
    public_id: input.publicId,
    customer_subject: input.customerSubject,
    contact_email: input.contactEmail,
    otp_hash: otpHash(challengeId, code),
    expires_at: expiresAt,
  })
  if (error) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Verification could not be started.',
      503,
    )
  }
  await sendCustomerPortalOtp({
    to: input.contactEmail,
    code,
    purpose:
      input.resourceType === 'application'
        ? 'application'
        : input.resourceType === 'trip'
          ? 'trip'
          : 'appointment',
  })
  return {
    challengeId,
    deliveryHint: maskCustomerEmail(input.contactEmail),
    expiresAt,
  }
}

export async function verifyCustomerOtpChallenge(input: {
  challengeId: string
  code: string
  customerSubject: string
  purpose: 'link_application' | 'link_trip' | 'claim_appointment'
}) {
  const service = getServiceSupabaseClient()
  const { data, error } = await service
    .from('customer_portal_otp_challenges')
    .select('*')
    .eq('id', input.challengeId)
    .eq('customer_subject', input.customerSubject)
    .eq('purpose', input.purpose)
    .maybeSingle()
  if (
    error ||
    !data ||
    data.consumed_at ||
    data.revoked_at ||
    Date.parse(data.expires_at) <= Date.now() ||
    data.attempt_count >= data.max_attempts
  ) {
    throw new CustomerIntegrationError('expired', 'Verification code is invalid or expired.', 410)
  }
  const expected = Buffer.from(data.otp_hash)
  const supplied = Buffer.from(otpHash(input.challengeId, input.code))
  const matches = expected.length === supplied.length && timingSafeEqual(expected, supplied)
  if (!matches) {
    await service
      .from('customer_portal_otp_challenges')
      .update({ attempt_count: data.attempt_count + 1 })
      .eq('id', input.challengeId)
    throw new CustomerIntegrationError('forbidden', 'Verification code is invalid or expired.', 403)
  }
  const { data: consumed, error: consumeError } = await service
    .from('customer_portal_otp_challenges')
    .update({ consumed_at: new Date().toISOString() })
    .eq('id', input.challengeId)
    .is('consumed_at', null)
    .select('*')
    .maybeSingle()
  if (consumeError || !consumed) {
    throw new CustomerIntegrationError('conflict', 'Verification code was already used.', 409)
  }
  return {
    internalId: consumed.internal_id as string,
    publicId: consumed.public_id as string,
    resourceType: consumed.resource_type as 'application' | 'trip' | 'appointment',
    contactEmail: consumed.contact_email as string,
  }
}
