import formData from 'form-data'
import Mailgun from 'mailgun.js'
import {
  ALLOWED_TEMPLATE_VARIABLES,
  type BookingTemplateValues,
  findTemplateTokens,
  validateBookingTemplate,
  renderBookingTemplate,
  buildBookingEmailHtmlFromTemplate,
} from '@/lib/bookingEmailTemplate'

export {
  ALLOWED_TEMPLATE_VARIABLES,
  findTemplateTokens,
  validateBookingTemplate,
  renderBookingTemplate,
}

const BOOKING_SENDER_EMAIL = 'noreply.appointments@piyamtravel.com'

function bookingEmailBaseUrl(): string {
  const candidate =
    process.env.APP_BASE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    'https://ims.piyamtravel.com'
  const normalized = candidate.replace(/\/$/, '')
  return /^https?:\/\//i.test(normalized) ? normalized : 'https://ims.piyamtravel.com'
}

function bookingEmailHeading(kind: 'confirmation' | 'modification' | 'cancellation'): string {
  if (kind === 'confirmation') return 'Appointment confirmed'
  if (kind === 'modification') return 'Appointment updated'
  return 'Appointment cancelled'
}

/**
 * Adds the non-secret customer-portal route and the claim code to a booking email.
 * The code lets a signed-in customer link a guest booking; it never replaces a
 * signed management grant when one is available.
 */
export function customerPortalAccessEmailBlock(
  guestCode: string | null | undefined,
  managementUrl?: string | null,
): string {
  const normalizedCode = guestCode?.trim().toUpperCase()
  if (!normalizedCode) return ''

  const portalAppointmentsUrl = `${(
    process.env.CUSTOMER_PORTAL_ALLOWED_ORIGIN || 'https://portal.piyamtravel.com'
  ).replace(/\/$/, '')}/appointments`
  const managementLine = managementUrl ? `\nManage your appointment securely: ${managementUrl}` : ''

  return [
    '',
    '',
    `Customer portal access code: ${normalizedCode}`,
    'Keep this code private. Sign in to the customer portal to add this appointment to your account.',
    `Customer portal: ${portalAppointmentsUrl}`,
    managementLine,
  ].join('\n')
}

function formatDateTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString)
  return {
    date: d.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      timeZone: 'UTC',
    }),
    time: d.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
      timeZone: 'UTC',
    }),
  }
}

export function defaultTemplate(kind: 'confirmation' | 'modification' | 'cancellation'): string {
  const opening =
    kind === 'confirmation'
      ? 'Your appointment has been booked.'
      : kind === 'modification'
        ? 'Your appointment has been updated.'
        : 'Your appointment has been cancelled.'

  return [
    'Dear [Customer Name],',
    '',
    opening,
    '',
    'Date: [date booked]',
    'Time: [time booked]',
    'Service: [service booked]',
    'Location: [branch address]',
    'Branch contact: [branch contact number]',
    '',
    'If you have questions, please contact [branch name].',
  ].join('\n')
}

export async function sendBookingEmail(params: {
  to: string
  subject: string
  kind: 'confirmation' | 'modification' | 'cancellation'
  template: string | null | undefined
  customerName: string
  serviceName: string
  startTimeISO: string
  branchName?: string
  branchAddress?: string
  branchContactNumber?: string
}): Promise<{ sent: boolean; reason?: string; senderEmail: string }> {
  const apiKey = process.env.MAILGUN_API_KEY
  const rawDomain = process.env.MAILGUN_DOMAIN
  const senderEmail = BOOKING_SENDER_EMAIL

  if (!params.to) return { sent: false, reason: 'Missing recipient email', senderEmail }
  if (!apiKey || !rawDomain) {
    return { sent: false, reason: 'Mailgun environment variables are not configured', senderEmail }
  }

  const senderDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const rawMailgunEndpoint = process.env.MAILGUN_ENDPOINT || 'https://api.mailgun.net'
  const mailgunEndpoint = /^https?:\/\//i.test(rawMailgunEndpoint)
    ? rawMailgunEndpoint
    : `https://${rawMailgunEndpoint}`

  const mailgun = new Mailgun(formData)
  const mg = mailgun.client({
    username: 'api',
    key: apiKey,
    url: mailgunEndpoint,
  })

  const { date, time } = formatDateTime(params.startTimeISO)
  const values: BookingTemplateValues = {
    'Customer Name': params.customerName,
    'date booked': date,
    'time booked': time,
    'service booked': params.serviceName,
    'branch name': params.branchName || 'our branch',
    'branch address': params.branchAddress || 'Address unavailable',
    'branch contact number': params.branchContactNumber || 'Contact unavailable',
  }

  const body = renderBookingTemplate(
    params.template?.trim() || defaultTemplate(params.kind),
    values,
  )
  const html = buildBookingEmailHtmlFromTemplate(
    params.template?.trim() || defaultTemplate(params.kind),
    values,
    {
      logoUrl: `${bookingEmailBaseUrl()}/logo.png`,
      heading: bookingEmailHeading(params.kind),
      eyebrow: 'Piyam Travel appointments',
    },
  )

  try {
    await mg.messages.create(senderDomain, {
      from: `${senderEmail}`,
      to: params.to,
      subject: params.subject,
      text: body,
      html,
    })
    return { sent: true, senderEmail }
  } catch (error) {
    return {
      sent: false,
      reason: error instanceof Error ? error.message : 'Unknown email send error',
      senderEmail,
    }
  }
}
