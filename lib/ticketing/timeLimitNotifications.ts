import formData from 'form-data'
import Mailgun from 'mailgun.js'

export const TICKET_TIME_LIMIT_THRESHOLDS = [
  { key: '24h', offsetHours: 24 },
  { key: '6h', offsetHours: 6 },
  { key: '2h', offsetHours: 2 },
  { key: 'expiry', offsetHours: 0 },
] as const

export type TicketTimeLimitThreshold = (typeof TICKET_TIME_LIMIT_THRESHOLDS)[number]['key']

export function formatTicketTimeLimit(isoString: string, timezone: string) {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    weekday: 'short',
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
    timeZoneName: 'short',
  }).format(new Date(isoString))
}

function thresholdLabel(threshold: TicketTimeLimitThreshold) {
  return threshold === 'expiry' ? 'the airline time limit has passed' : `${threshold} before expiry`
}

export async function sendTicketTimeLimitEmail(params: {
  to: string
  recipientName: string | null
  pnr: string
  customerName: string
  timeLimitAt: string
  timeLimitTimezone: string
  threshold: TicketTimeLimitThreshold
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.MAILGUN_API_KEY
  const rawDomain = process.env.MAILGUN_DOMAIN
  if (!params.to) return { sent: false, reason: 'Missing recipient email' }
  if (!apiKey || !rawDomain) {
    return { sent: false, reason: 'Mailgun environment variables are not configured' }
  }

  const senderDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  const endpoint = process.env.MAILGUN_ENDPOINT || 'https://api.mailgun.net'
  const mailgun = new Mailgun(formData)
  const client = mailgun.client({
    username: 'api',
    key: apiKey,
    url: /^https?:\/\//i.test(endpoint) ? endpoint : `https://${endpoint}`,
  })
  const deadline = formatTicketTimeLimit(params.timeLimitAt, params.timeLimitTimezone)
  const subject =
    params.threshold === 'expiry'
      ? `Held ticket expired: ${params.pnr}`
      : `Held ticket deadline: ${params.pnr} (${params.threshold})`
  const greeting = params.recipientName?.trim() || 'Ticketing colleague'
  const text = [
    `Hello ${greeting},`,
    '',
    `The airline time limit for PNR ${params.pnr} for ${params.customerName} is ${thresholdLabel(params.threshold)}.`,
    `Deadline: ${deadline} (${params.timeLimitTimezone})`,
    params.threshold === 'expiry'
      ? 'The booking has been marked Expired automatically.'
      : 'Please issue or otherwise action the booking before the deadline.',
    '',
    'PT Portal Ticketing',
  ].join('\n')

  try {
    await client.messages.create(senderDomain, {
      from: 'noreply.ticketing@piyamtravel.com',
      to: params.to,
      subject,
      text,
    })
    return { sent: true }
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'Unknown email error' }
  }
}
