import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  toDataURL: vi.fn(),
  persistGeneratedReceipt: vi.fn(),
}))

vi.mock('@supabase/supabase-js', () => ({ createClient: mocks.createClient }))
vi.mock('qrcode', () => ({ default: { toDataURL: mocks.toDataURL } }))
vi.mock('@/lib/services/receiptStore', () => ({
  persistGeneratedReceipt: mocks.persistGeneratedReceipt,
}))

import { generateReceipt } from '@/lib/services/receiptGenerator'

function createQuery() {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    single: vi.fn(),
  }
  query.select.mockReturnValue(query)
  query.eq.mockReturnValue(query)
  return query
}

describe('generateReceipt for Visa applications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co')
    vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', 'test-service-role-key')

    const query = createQuery()
    query.single.mockResolvedValue({
      data: {
        id: 'visa-record-1',
        applicant_id: 'applicant-1',
        internal_tracking_number: 'VISA-001',
        external_application_number: null,
        validity: '90 days',
        base_price: 50,
        customer_price: 75,
        cost_currency: 'GBP',
        applicants: {
          first_name: 'Jane',
          last_name: 'Doe',
          phone_number: '07700900000',
          email: 'jane@example.test',
        },
        visa_countries: { name: 'France' },
        visa_types: { name: 'Tourism' },
      },
      error: null,
    })
    mocks.createClient.mockReturnValue({ from: vi.fn(() => query) })
    mocks.toDataURL.mockResolvedValue('data:image/png;base64,visa')
    mocks.persistGeneratedReceipt.mockResolvedValue({ persisted: false })
  })

  afterEach(() => {
    vi.unstubAllEnvs()
  })

  it('maps Visa source fields and labels its price as recorded application data', async () => {
    const receipt = await generateReceipt({
      serviceType: 'visa',
      serviceRecordId: 'visa-record-1',
      receiptType: 'submission',
    })

    expect(receipt).toMatchObject({
      applicationId: 'visa-record-1',
      applicantId: 'applicant-1',
      applicantName: 'Jane Doe',
      contactNumber: '07700900000',
      serviceName: 'France Visa (Tourism)',
      processingSpeed: '90 days',
      serviceType: 'visa',
      receiptType: 'submission',
      trackingNumber: 'VISA-001',
      receiptPin: '',
      pricing: {
        serviceDescription: 'France / Tourism',
        costPrice: 50,
        salePrice: 75,
        currency: 'GBP',
      },
    })
    expect(receipt.plainText).toContain('Visa application details only - not proof of payment')
    expect(mocks.persistGeneratedReceipt).toHaveBeenCalledWith({
      receipt,
      serviceRecordId: 'visa-record-1',
    })
  })
})
