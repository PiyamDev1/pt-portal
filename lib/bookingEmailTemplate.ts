export const ALLOWED_TEMPLATE_VARIABLES = [
  '[Customer Name]',
  '[date booked]',
  '[time booked]',
  '[service booked]',
  '[branch name]',
  '[branch address]',
  '[branch contact number]',
] as const

export interface BookingTemplateValues {
  'Customer Name': string
  'date booked': string
  'time booked': string
  'service booked': string
  'branch name'?: string
  'branch address'?: string
  'branch contact number'?: string
}

export interface BookingEmailThemeOptions {
  /** Must be a public URL when the email is sent; previews may use a relative path. */
  logoUrl?: string
  heading?: string
  eyebrow?: string
}

const TEMPLATE_TOKEN_REGEX = /\[[^\]]+\]/g

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

export function findTemplateTokens(template: string): string[] {
  const matches = template.match(TEMPLATE_TOKEN_REGEX) || []
  return [...new Set(matches)]
}

export function validateBookingTemplate(template: string): {
  valid: boolean
  invalidTokens: string[]
} {
  const tokens = findTemplateTokens(template)
  const invalidTokens = tokens.filter(
    (token) =>
      !ALLOWED_TEMPLATE_VARIABLES.includes(token as (typeof ALLOWED_TEMPLATE_VARIABLES)[number]),
  )
  return {
    valid: invalidTokens.length === 0,
    invalidTokens,
  }
}

export function renderBookingTemplate(template: string, values: BookingTemplateValues): string {
  let output = template
  for (const [key, rawValue] of Object.entries(values)) {
    const value = rawValue ?? ''
    const token = new RegExp(`\\[${escapeRegExp(key)}\\]`, 'g')
    output = output.replace(token, value)
  }
  return output
}

function linkifyEscapedText(value: string): string {
  return escapeHtml(value).replace(/(https?:\/\/[^\s<]+)/gi, (url) => {
    return `<a href="${url}" style="color:#8b1d2c;font-weight:700;text-decoration:underline;word-break:break-word;">${url}</a>`
  })
}

function renderMessageContent(content: string): string {
  const paragraphs = content
    .replace(/\r\n/g, '\n')
    .trim()
    .split(/\n\s*\n/)
    .filter(Boolean)

  if (paragraphs.length === 0) {
    return ''
  }

  return paragraphs
    .map((paragraph) => {
      const lines = paragraph.split('\n')
      const codeLineIndex = lines.findIndex((line) => /\bVISIT-[A-F0-9]{12}\b/.test(line))

      if (codeLineIndex < 0) {
        return `<p style="margin:0 0 16px;color:#3f2026;font-size:15px;line-height:1.7;">${lines.map(linkifyEscapedText).join('<br/>')}</p>`
      }

      const codeLine = lines[codeLineIndex]
      const guestCode = codeLine.match(/\bVISIT-[A-F0-9]{12}\b/)?.[0] || ''
      const remainingLines = lines.filter((_, index) => index !== codeLineIndex)
      const supportingCopy = remainingLines.length
        ? `<p style="margin:14px 0 0;color:#674048;font-size:13px;line-height:1.65;">${remainingLines
            .map(linkifyEscapedText)
            .join('<br/>')}</p>`
        : ''

      return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 18px;border:1px solid #dfb7be;border-radius:16px;background:#fff7f8;">
        <tr>
          <td style="padding:18px 20px;">
            <p style="margin:0;color:#8b1d2c;font-size:11px;font-weight:800;letter-spacing:.12em;text-transform:uppercase;">Customer portal access code</p>
            <p style="margin:8px 0 0;color:#54131f;font-family:Consolas,'Courier New',monospace;font-size:22px;font-weight:800;letter-spacing:.08em;">${escapeHtml(guestCode)}</p>
            ${supportingCopy}
          </td>
        </tr>
      </table>`
    })
    .join('')
}

function renderAppointmentDetails(values: BookingTemplateValues): string {
  const service = escapeHtml(values['service booked'] || 'Appointment')
  const date = escapeHtml(values['date booked'] || '')
  const time = escapeHtml(values['time booked'] || '')
  const branch = escapeHtml(values['branch name'] || 'Our branch')
  const address = escapeHtml(values['branch address'] || '')

  return `<table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="margin:0 0 24px;border:1px solid #ead2d6;border-radius:16px;background:#fffafa;">
    <tr>
      <td width="50%" style="padding:16px 18px;border-bottom:1px solid #ead2d6;border-right:1px solid #ead2d6;vertical-align:top;">
        <p style="margin:0;color:#8b5560;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Service</p>
        <p style="margin:6px 0 0;color:#421a22;font-size:14px;font-weight:700;line-height:1.45;">${service}</p>
      </td>
      <td width="50%" style="padding:16px 18px;border-bottom:1px solid #ead2d6;vertical-align:top;">
        <p style="margin:0;color:#8b5560;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">When</p>
        <p style="margin:6px 0 0;color:#421a22;font-size:14px;font-weight:700;line-height:1.45;">${date}${date && time ? '<br/>' : ''}${time}</p>
      </td>
    </tr>
    <tr>
      <td colspan="2" style="padding:16px 18px;vertical-align:top;">
        <p style="margin:0;color:#8b5560;font-size:10px;font-weight:800;letter-spacing:.1em;text-transform:uppercase;">Branch</p>
        <p style="margin:6px 0 0;color:#421a22;font-size:14px;font-weight:700;line-height:1.45;">${branch}</p>
        ${address ? `<p style="margin:3px 0 0;color:#674048;font-size:12px;line-height:1.45;">${address}</p>` : ''}
      </td>
    </tr>
  </table>`
}

export function withPresetEmailTemplate(
  content: string,
  values?: BookingTemplateValues,
  options: BookingEmailThemeOptions = {},
): string {
  const logoUrl = escapeHtml(options.logoUrl?.trim() || '/logo.png')
  const heading = escapeHtml(options.heading?.trim() || 'Your appointment')
  const eyebrow = escapeHtml(options.eyebrow?.trim() || 'Piyam Travel')
  const appointmentDetails = values ? renderAppointmentDetails(values) : ''
  const messageContent = renderMessageContent(content)

  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Booking Email</title>
  </head>
  <body style="margin:0;padding:28px 16px;background:#fbf4f5;font-family:Arial,Helvetica,sans-serif;color:#421a22;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e8cfd3;border-radius:20px;overflow:hidden;box-shadow:0 18px 48px rgba(73,18,29,.12);">
      <tr>
        <td style="padding:24px;background:#ffffff;border-bottom:4px solid #8b1d2c;">
          <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
            <tr>
              <td style="vertical-align:middle;">
                <p style="margin:0;color:#9d4854;font-size:10px;font-weight:800;letter-spacing:.14em;text-transform:uppercase;">${eyebrow}</p>
                <p style="margin:7px 0 0;color:#6d1827;font-size:23px;font-weight:800;line-height:1.2;">${heading}</p>
              </td>
              <td align="right" style="vertical-align:middle;">
                <img src="${logoUrl}" width="154" alt="Piyam Travel" style="display:block;height:auto;max-height:52px;max-width:154px;object-fit:contain;" />
              </td>
            </tr>
          </table>
        </td>
      </tr>
      <tr>
        <td style="padding:28px 24px;">${appointmentDetails}${messageContent}</td>
      </tr>
      <tr>
        <td style="padding:18px 24px;background:#fff7f8;border-top:1px solid #ead2d6;color:#674048;font-size:12px;line-height:1.55;">
          <strong style="color:#6d1827;">Piyam Travel</strong><br/>
          This is an automated appointment email. If you need help, please contact your branch.
        </td>
      </tr>
    </table>
  </body>
</html>`
}

export function buildBookingEmailHtmlFromTemplate(
  template: string,
  values: BookingTemplateValues,
  options?: BookingEmailThemeOptions,
): string {
  const renderedText = renderBookingTemplate(template, values)
  return withPresetEmailTemplate(renderedText, values, options)
}
