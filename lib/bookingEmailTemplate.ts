export const ALLOWED_TEMPLATE_VARIABLES = [
  '[Customer Name]',
  '[date booked]',
  '[time booked]',
  '[service booked]',
  '[branch name]',
  '[branch address]',
  '[branch contact number]',
] as const;

export interface BookingTemplateValues {
  'Customer Name': string;
  'date booked': string;
  'time booked': string;
  'service booked': string;
  'branch name'?: string;
  'branch address'?: string;
  'branch contact number'?: string;
}

const TEMPLATE_TOKEN_REGEX = /\[[^\]]+\]/g;

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function findTemplateTokens(template: string): string[] {
  const matches = template.match(TEMPLATE_TOKEN_REGEX) || [];
  return [...new Set(matches)];
}

export function validateBookingTemplate(template: string): {
  valid: boolean;
  invalidTokens: string[];
} {
  const tokens = findTemplateTokens(template);
  const invalidTokens = tokens.filter(
    (token) => !ALLOWED_TEMPLATE_VARIABLES.includes(token as (typeof ALLOWED_TEMPLATE_VARIABLES)[number])
  );
  return {
    valid: invalidTokens.length === 0,
    invalidTokens,
  };
}

export function renderBookingTemplate(template: string, values: BookingTemplateValues): string {
  let output = template;
  for (const [key, rawValue] of Object.entries(values)) {
    const value = rawValue ?? '';
    const token = new RegExp(`\\[${escapeRegExp(key)}\\]`, 'g');
    output = output.replace(token, value);
  }
  return output;
}

export function withPresetEmailTemplate(content: string): string {
  const escaped = escapeHtml(content).replace(/\n/g, '<br/>');
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Booking Email</title>
  </head>
  <body style="margin:0;padding:24px;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="max-width:640px;margin:0 auto;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
      <tr>
        <td style="padding:18px 24px;background:#1e3a8a;color:#ffffff;font-size:14px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;">
          Piyam Travel
        </td>
      </tr>
      <tr>
        <td style="padding:24px;font-size:14px;line-height:1.65;">${escaped}</td>
      </tr>
      <tr>
        <td style="padding:16px 24px;background:#f8fafc;color:#64748b;font-size:12px;line-height:1.4;">
          This is an automated booking email.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export function buildBookingEmailHtmlFromTemplate(
  template: string,
  values: BookingTemplateValues
): string {
  const renderedText = renderBookingTemplate(template, values);
  return withPresetEmailTemplate(renderedText);
}
