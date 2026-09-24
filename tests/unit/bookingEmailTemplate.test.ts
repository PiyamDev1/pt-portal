import { describe, expect, it } from 'vitest'
import { buildBookingEmailHtmlFromTemplate } from '@/lib/bookingEmailTemplate'

describe('booking email template', () => {
  it('renders the Piyam Travel visual theme, appointment details, and a customer portal code card', () => {
    const html = buildBookingEmailHtmlFromTemplate(
      'Dear [Customer Name],\n\nCustomer portal access code: VISIT-A1B2C3D4E5F6\nKeep this code private.\nCustomer portal: https://portal.piyamtravel.com/appointments',
      {
        'Customer Name': 'Alex Carter',
        'date booked': '24 April 2026',
        'time booked': '10:30',
        'service booked': 'Visa consultation',
        'branch name': 'London Branch',
        'branch address': '12 Station Road, London',
      },
      {
        logoUrl: 'https://ims.piyamtravel.com/logo.png',
        heading: 'Appointment confirmed',
      },
    )

    expect(html).toContain('https://ims.piyamtravel.com/logo.png')
    expect(html).toContain('Appointment confirmed')
    expect(html).toContain('Visa consultation')
    expect(html).toContain('Customer portal access code')
    expect(html).toContain('VISIT-A1B2C3D4E5F6')
    expect(html).toContain('href="https://portal.piyamtravel.com/appointments"')
  })

  it('escapes custom email copy instead of treating it as markup', () => {
    const html = buildBookingEmailHtmlFromTemplate(
      'Hello [Customer Name] <script>alert(1)</script>',
      {
        'Customer Name': 'Alex',
        'date booked': '24 April 2026',
        'time booked': '10:30',
        'service booked': 'Consultation',
      },
    )

    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;')
    expect(html).not.toContain('<script>alert(1)</script>')
  })
})
