import 'server-only'

import formData from 'form-data'
import Mailgun from 'mailgun.js'

import { CustomerIntegrationError } from './http'

export function maskCustomerEmail(email: string) {
  const [local = '', domain = ''] = email.split('@')
  if (!domain) return 'your recorded email'
  const shown = local.slice(0, Math.min(2, local.length))
  return `${shown}${'•'.repeat(Math.max(2, Math.min(6, local.length - shown.length)))}@${domain}`
}

function mailgunClient() {
  const apiKey = process.env.MAILGUN_API_KEY
  const domain = process.env.MAILGUN_DOMAIN?.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!apiKey || !domain) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Customer email is not configured.',
      503,
    )
  }
  const rawEndpoint = process.env.MAILGUN_ENDPOINT || 'https://api.mailgun.net'
  const endpoint = /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`
  return {
    client: new Mailgun(formData).client({ username: 'api', key: apiKey, url: endpoint }),
    domain,
  }
}

export async function sendCustomerPortalOtp(input: {
  to: string
  code: string
  purpose: 'application' | 'trip' | 'appointment'
}) {
  const { client, domain } = mailgunClient()
  const subject = `Your Piyam ${input.purpose} verification code`
  const text = [
    `Your Piyam verification code is: ${input.code}`,
    '',
    'It expires in 10 minutes and can be used once.',
    'If you did not request this, you can ignore this email.',
    'Piyam staff will never ask you to read this code over the phone.',
  ].join('\n')
  try {
    await client.messages.create(domain, {
      from: 'Piyam Customer Portal <noreply@piyamtravel.com>',
      to: input.to,
      subject,
      text,
    })
  } catch (cause) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'Verification email could not be sent.',
      503,
      { cause },
    )
  }
}

export async function sendCustomerTripInvitation(input: {
  to: string
  inviterName?: string | null
  packageReference: string
  token: string
}) {
  const { client, domain } = mailgunClient()
  const portalOrigin = (
    process.env.CUSTOMER_PORTAL_ALLOWED_ORIGIN || 'https://portal.piyamtravel.com'
  ).replace(/\/$/, '')
  const invitationUrl = `${portalOrigin}/trips/invitations/${encodeURIComponent(input.token)}`
  const text = [
    `${input.inviterName?.trim() || 'The lead traveller'} invited you to view package ${input.packageReference} in the Piyam Customer Portal.`,
    '',
    invitationUrl,
    '',
    'This private invitation expires in 72 hours and can be accepted once.',
    'If you were not expecting it, ignore this message.',
  ].join('\n')
  try {
    await client.messages.create(domain, {
      from: 'Piyam Customer Portal <noreply@piyamtravel.com>',
      to: input.to,
      subject: `Invitation to view Piyam package ${input.packageReference}`,
      text,
    })
  } catch (cause) {
    throw new CustomerIntegrationError(
      'service_unavailable',
      'The trip invitation could not be sent.',
      503,
      { cause },
    )
  }
}
