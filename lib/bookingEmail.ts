import formData from 'form-data';
import Mailgun from 'mailgun.js';

export interface BookingTemplateValues {
  'Customer Name': string;
  'date booked': string;
  'time booked': string;
  'service booked': string;
  'branch name'?: string;
}

function formatDateTime(isoString: string): { date: string; time: string } {
  const d = new Date(isoString);
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
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
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

export function defaultTemplate(kind: 'confirmation' | 'modification' | 'cancellation'): string {
  const opening =
    kind === 'confirmation'
      ? 'Your appointment has been booked.'
      : kind === 'modification'
      ? 'Your appointment has been updated.'
      : 'Your appointment has been cancelled.';

  return [
    'Dear [Customer Name],',
    '',
    opening,
    '',
    'Date: [date booked]',
    'Time: [time booked]',
    'Service: [service booked]',
    '',
    'If you have questions, please contact [branch name].',
  ].join('\n');
}

export async function sendBookingEmail(params: {
  to: string;
  subject: string;
  kind: 'confirmation' | 'modification' | 'cancellation';
  template: string | null | undefined;
  customerName: string;
  serviceName: string;
  startTimeISO: string;
  branchName?: string;
}): Promise<{ sent: boolean; reason?: string }> {
  const apiKey = process.env.MAILGUN_API_KEY;
  const rawDomain = process.env.MAILGUN_DOMAIN;
  const senderEmail = process.env.MAILGUN_SENDER_EMAIL || process.env.MAIL_FROM_ADDRESS;

  if (!params.to) return { sent: false, reason: 'Missing recipient email' };
  if (!apiKey || !rawDomain || !senderEmail) {
    return { sent: false, reason: 'Mailgun environment variables are not configured' };
  }

  const senderDomain = rawDomain.replace(/^https?:\/\//, '').replace(/\/$/, '');
  const rawMailgunEndpoint = process.env.MAILGUN_ENDPOINT || 'https://api.mailgun.net';
  const mailgunEndpoint = /^https?:\/\//i.test(rawMailgunEndpoint)
    ? rawMailgunEndpoint
    : `https://${rawMailgunEndpoint}`;

  const mailgun = new Mailgun(formData);
  const mg = mailgun.client({
    username: 'api',
    key: apiKey,
    url: mailgunEndpoint,
  });

  const { date, time } = formatDateTime(params.startTimeISO);
  const values: BookingTemplateValues = {
    'Customer Name': params.customerName,
    'date booked': date,
    'time booked': time,
    'service booked': params.serviceName,
    'branch name': params.branchName || 'our branch',
  };

  const body = renderBookingTemplate(
    params.template?.trim() || defaultTemplate(params.kind),
    values
  );

  try {
    await mg.messages.create(senderDomain, {
      from: `${senderEmail}`,
      to: params.to,
      subject: params.subject,
      text: body,
    });
    return { sent: true };
  } catch (error) {
    return { sent: false, reason: error instanceof Error ? error.message : 'Unknown email send error' };
  }
}
