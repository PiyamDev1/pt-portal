import { describe, expect, it } from 'vitest'
import type {
  TravelPackageFolder,
  TravelPackageInvoice,
  TravelPackagePayment,
} from '@/app/types/packages'
import {
  calculatePackagePaymentSummary,
  canTransitionTravelPackageStatus,
  derivePackageWorkflow,
  getLifecycleTimestampUpdate,
} from '@/lib/packageWorkflow'

function packageFolder(overrides: Partial<TravelPackageFolder> = {}) {
  return {
    id: 'package-1',
    package_reference: 'PT-ABC123',
    source_quote_id: 'quote-1',
    created_by: 'agent-1',
    assigned_agent_id: 'agent-1',
    location_id: null,
    customer_name: 'Test Customer',
    customer_phone: null,
    customer_email: null,
    package_type: 'umrah',
    destination: 'Makkah / Madinah',
    departure_date: '2026-08-01',
    return_date: '2026-08-15',
    status: 'selected',
    passenger_summary: { adults: 2, totalPassengers: 2 },
    selected_quote_snapshot: {
      payload: {
        title: 'Umrah',
        packageType: 'umrah',
        currency: 'GBP',
        customerName: '',
        customerPhone: '',
        customerEmail: '',
        adults: 2,
        childrenPaying: 0,
        childrenFree: 0,
        itineraryOrder: [],
        departureDate: '',
        returnDate: '',
        stayGroups: [],
        flightOptions: [],
        visaOptions: [],
        transportOptions: [],
        limitedTimeOffers: [],
        cardProcessingFeePercent: 0,
        notes: '',
      },
    },
    current_public_summary: {},
    passport_status: 'not_requested',
    payment_status: 'not_requested',
    invoice_status: 'not_started',
    document_release_status: 'not_started',
    next_action: null,
    next_action_due_at: null,
    risk_level: 'none',
    minio_bucket: 'pt-packages',
    minio_prefix: 'PT-ABC123/',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: null,
    archived_at: null,
    closed_at: null,
    ...overrides,
  } satisfies TravelPackageFolder
}

function payment(overrides: Partial<TravelPackagePayment>): TravelPackagePayment {
  return {
    id: crypto.randomUUID(),
    package_id: 'package-1',
    invoice_id: 'invoice-1',
    amount: 0,
    currency: 'GBP',
    payment_type: 'payment',
    payment_method: 'bank_transfer',
    payment_status: 'completed',
    requested_at: null,
    due_at: null,
    received_at: '2026-07-01T00:00:00.000Z',
    received_by: 'agent-1',
    receipt_reference: null,
    receipt_document_id: null,
    notes: null,
    metadata: {},
    created_by: 'agent-1',
    updated_by: 'agent-1',
    created_at: '2026-07-01T00:00:00.000Z',
    updated_at: null,
    ...overrides,
  }
}

it('nets completed customer payments against completed refunds', () => {
  const summary = calculatePackagePaymentSummary(
    [
      payment({ amount: 1000 }),
      payment({ amount: 200, payment_type: 'refund' }),
      payment({ amount: 500, payment_status: 'pending', due_at: '2026-06-01T00:00:00.000Z' }),
    ],
    Date.parse('2026-07-01T00:00:00.000Z'),
  )

  expect(summary).toMatchObject({
    completedPayments: 1000,
    refunds: 200,
    netPaid: 800,
    pending: 500,
    overdue: 500,
  })
})

describe('package lifecycle', () => {
  it('allows operational progress but blocks skipping from selected to closed', () => {
    expect(canTransitionTravelPackageStatus('selected', 'awaiting_passports')).toBe(true)
    expect(canTransitionTravelPackageStatus('selected', 'closed')).toBe(false)
    expect(canTransitionTravelPackageStatus('returned', 'closed')).toBe(true)
  })

  it('marks close time and earned time together', () => {
    expect(getLifecycleTimestampUpdate('closed', '2026-08-20T10:00:00.000Z')).toEqual({
      closed_at: '2026-08-20T10:00:00.000Z',
      earned_at: '2026-08-20T10:00:00.000Z',
    })
  })
})

describe('package workflow calculation', () => {
  it('prioritizes passport readiness before reservations', () => {
    const workflow = derivePackageWorkflow({ packageFolder: packageFolder() })
    expect(workflow.nextAction).toBe('Request and check passport copies')
  })

  it('raises critical visa and document risks close to departure', () => {
    const folder = packageFolder({
      passport_status: 'ready',
      departure_date: '2026-07-05',
      selected_quote_snapshot: {
        payload: {
          ...packageFolder().selected_quote_snapshot.payload!,
          visaOptions: [{ id: 'visa', title: 'Visa', summary: '', price: 100 }],
        },
      },
    })
    const workflow = derivePackageWorkflow({
      packageFolder: folder,
      now: Date.parse('2026-07-02T00:00:00.000Z'),
    })

    expect(workflow.riskLevel).toBe('critical')
    expect(workflow.risks.map((risk) => risk.riskType)).toEqual(
      expect.arrayContaining(['visa_deadline', 'documents_not_released']),
    )
  })

  it('flags a negative internal margin without exposing it through customer data', () => {
    const invoice = { projected_margin: -50, total_sold: 1000 } as TravelPackageInvoice
    const workflow = derivePackageWorkflow({ packageFolder: packageFolder(), invoice })
    expect(workflow.risks.find((risk) => risk.riskType === 'negative_margin')?.severity).toBe(
      'critical',
    )
  })

  it('turns an overdue installment into the primary payment follow-up', () => {
    const workflow = derivePackageWorkflow({
      packageFolder: packageFolder({ passport_status: 'ready' }),
      installments: [
        {
          id: 'installment-1',
          plan_id: 'plan-1',
          package_id: 'package-1',
          payment_id: null,
          sequence_number: 1,
          amount: 200,
          due_on: '2026-06-30',
          status: 'scheduled',
          paid_at: null,
          notes: null,
          created_at: '2026-06-01T00:00:00.000Z',
          updated_at: null,
        },
      ],
      now: Date.parse('2026-07-02T00:00:00.000Z'),
    })

    expect(workflow.nextAction).toBe('Follow up overdue installment')
    expect(workflow.risks.some((risk) => risk.riskType === 'installment_overdue')).toBe(true)
  })
})
