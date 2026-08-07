import formData from 'form-data'
import Mailgun from 'mailgun.js'

export type PakPassportDraftAssignmentEmailParams = {
  to: string | null | undefined
  assigneeName?: string | null
  draftId: string
  applicantName: string
  applicantCnic?: string | null
  applicationType?: string | null
  category?: string | null
  pageCount?: string | null
  speed?: string | null
  assignedByName?: string | null
}

export type PakPassportDraftAssignmentEmailResult = {
  sent: boolean
  recipientEmail?: string
  senderEmail: string
  reason?: string
}

const DEFAULT_SENDER_EMAIL = 'noreply.applications@piyamtravel.com'

function clean(value: string | null | undefined) {
  return String(value || '').trim()
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

function mailgunEndpoint() {
  const rawEndpoint = process.env.MAILGUN_ENDPOINT || 'https://api.mailgun.net'
  return /^https?:\/\//i.test(rawEndpoint) ? rawEndpoint : `https://${rawEndpoint}`
}

export async function sendPakPassportDraftAssignmentEmail(
  params: PakPassportDraftAssignmentEmailParams,
): Promise<PakPassportDraftAssignmentEmailResult> {
  const recipientEmail = clean(params.to)
  const senderEmail =
    clean(process.env.MAILGUN_SENDER_EMAIL) ||
    clean(process.env.MAIL_FROM_ADDRESS) ||
    DEFAULT_SENDER_EMAIL

  if (!recipientEmail) {
    return { sent: false, reason: 'Assigned employee does not have an email address', senderEmail }
  }

  const apiKey = process.env.MAILGUN_API_KEY
  const rawDomain = process.env.MAILGUN_DOMAIN
  if (!apiKey || !rawDomain) {
    return {
      sent: false,
      recipientEmail,
      senderEmail,
      reason: 'Mailgun environment variables are not configured',
    }
  }

  const senderDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '')
  if (!senderDomain) {
    return { sent: false, recipientEmail, senderEmail, reason: 'Missing Mailgun domain' }
  }

  const assigneeName = clean(params.assigneeName) || 'there'
  const portalUrl = 'https://ims.piyamtravel.com/dashboard/applications/passports/drafts'
  const subject = `Pakistani passport draft assigned: ${params.draftId}`
  const details = [
    ['Draft ID', params.draftId],
    ['Applicant', params.applicantName],
    ['CNIC', params.applicantCnic],
    ['Application type', params.applicationType],
    ['Category', params.category],
    ['Page count', params.pageCount],
    ['Speed', params.speed],
    ['Assigned by', params.assignedByName],
  ].filter(([, value]) => clean(value))

  const text = [
    `Hello ${assigneeName},`,
    '',
    'A Pakistani passport draft has been assigned to you in IMS.',
    '',
    ...details.map(([label, value]) => `${label}: ${value}`),
    '',
    `Open draft mode: ${portalUrl}`,
  ].join('\n')

  const rows = details
    .map(
      ([label, value]) =>
        `<tr><td style="padding:6px 12px;color:#475569;font-weight:700;">${escapeHtml(
          String(label),
        )}</td><td style="padding:6px 12px;color:#0f172a;">${escapeHtml(String(value))}</td></tr>`,
    )
    .join('')

  const html = `
    <div style="font-family:Arial,sans-serif;color:#0f172a;line-height:1.5;">
      <p>Hello ${escapeHtml(assigneeName)},</p>
      <p>A Pakistani passport draft has been assigned to you in IMS.</p>
      <table style="border-collapse:collapse;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;">
        ${rows}
      </table>
      <p style="margin-top:18px;">
        <a href="${portalUrl}" style="background:#16a34a;color:white;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:700;">Open Draft Mode</a>
      </p>
    </div>
  `

  try {
    const mailgun = new Mailgun(formData)
    const mg = mailgun.client({
      username: 'api',
      key: apiKey,
      url: mailgunEndpoint(),
    })

    await mg.messages.create(senderDomain, {
      from: senderEmail,
      to: recipientEmail,
      subject,
      text,
      html,
    })

    return { sent: true, recipientEmail, senderEmail }
  } catch (error) {
    return {
      sent: false,
      recipientEmail,
      senderEmail,
      reason: error instanceof Error ? error.message : 'Unknown email send error',
    }
  }
}
