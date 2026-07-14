import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  buildPackageSnapshot,
  buildPassengerSummary,
  createTravelPackageReference,
  getDefaultPackageNextAction,
  getPackageDepositPaymentSummary,
  normalizePackageQuotePayload,
} from '@/lib/packageQuote'
import { getPackageMinioBucketName } from '@/lib/packageIntegrations'
import type {
  PackageCombination,
  PackageComponentOption,
  PackagePaymentBreakdown,
  PackageQuotePayload,
  PackageSelectionInput,
  TravelPackageFolder,
  TravelPackageQuote,
} from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'

const SCHEMA_HINT =
  'Travel package folder schema is not installed yet. Run scripts/migrations/20260711_create_travel_package_folders.sql in Supabase SQL editor.'

function isPackageSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703' || code === '42P10'
}

function selectQuoteColumns() {
  return `
    id,
    title,
    package_type,
    status,
    currency,
    customer_name,
    customer_phone,
    customer_email,
    payload,
    share_token,
    share_enabled,
    shared_at,
    expires_at,
    selected_option,
    selected_at,
    selection_note,
    converted_package_id,
    converted_at,
    finalised_at,
    finalised_by,
    finalised_source,
    customer_selection_note,
    agent_selection_note,
    last_shared_by,
    archived_at,
    created_by,
    created_at,
    updated_at
  `
}

function selectTravelPackageColumns() {
  return `
    id,
    package_reference,
    source_quote_id,
    created_by,
    assigned_agent_id,
    location_id,
    customer_name,
    customer_phone,
    customer_email,
    package_type,
    destination,
    departure_date,
    return_date,
    status,
    passenger_summary,
    selected_quote_snapshot,
    current_public_summary,
    passport_status,
    payment_status,
    invoice_status,
    document_release_status,
    next_action,
    next_action_due_at,
    risk_level,
    minio_bucket,
    minio_prefix,
    created_at,
    updated_at,
    archived_at,
    closed_at
  `
}

function asDateOnly(value: string | null | undefined) {
  if (!value) return null
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return null
  return date.toISOString().slice(0, 10)
}

function roundMoney(value: number) {
  return Math.round(Math.max(0, value) * 100) / 100
}

function roundSignedMoney(value: number) {
  return Math.round(value * 100) / 100
}

function optionTotal(option: PackageComponentOption | null, passengerCount: number) {
  if (!option) return 0
  return roundMoney(option.price * (option.pricingMode === 'per_person' ? passengerCount : 1))
}

function hasTieredFlightPricing(option: PackageComponentOption | null) {
  if (!option) return false
  return Boolean(
    (option.adultPrice || 0) > 0 || (option.childPrice || 0) > 0 || (option.infantPrice || 0) > 0,
  )
}

function flightTotal(option: PackageComponentOption | null, payload: PackageQuotePayload) {
  if (!option) return 0
  if (!hasTieredFlightPricing(option)) {
    return optionTotal(
      option,
      payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants,
    )
  }
  return roundMoney(
    (option.adultPrice || 0) * payload.adults +
      (option.childPrice || 0) * (payload.childrenPaying + payload.childrenFree) +
      (option.infantPrice || 0) * payload.infants,
  )
}

function visaQuantity(option: PackageComponentOption, payload: PackageQuotePayload) {
  return option.quantity && option.quantity > 0
    ? option.quantity
    : payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
}

function visaTotal(option: PackageComponentOption, payload: PackageQuotePayload) {
  return roundMoney(
    option.price * (option.pricingMode === 'per_person' ? visaQuantity(option, payload) : 1),
  )
}

function cleanSummary(option: PackageComponentOption | null) {
  return option?.summary?.trim() || null
}

function autoReservationRows({
  packageId,
  quote,
  payload,
  combination,
  userId,
  now,
}: {
  packageId: string
  quote: TravelPackageQuote
  payload: PackageQuotePayload
  combination: PackageCombination
  userId: string
  now: string
}) {
  const servicePassengers =
    payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
  const rows: Array<Record<string, unknown>> = []
  let componentTotal = 0
  const baseRow = {
    package_id: packageId,
    quote_id: quote.id,
    created_by: userId,
    updated_by: userId,
    status: 'reservation_pending',
    currency: combination.currency,
    booked_cost_total: 0,
    discount_total: 0,
    commission_expected_total: 0,
    deposit_required: Boolean(payload.depositRequired),
    deposit_amount: roundMoney(payload.depositAmount || 0),
    payment_due_at: now,
    customer_visible: false,
  }

  if (combination.flightOption) {
    const sold = flightTotal(combination.flightOption, payload)
    componentTotal += sold
    rows.push({
      ...baseRow,
      reservation_type: 'flight',
      title: `Flight - ${combination.flightOption.title || 'Selected flight'}`,
      sold_price_total: sold,
      internal_notes: cleanSummary(combination.flightOption),
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        optionId: combination.flightOption.id,
      },
    })
  }

  combination.staySelections.forEach((stay) => {
    const sold = roundMoney(stay.option.price)
    componentTotal += sold
    rows.push({
      ...baseRow,
      reservation_type: 'hotel',
      title: `${stay.groupLabel} hotel - ${stay.option.title || 'Selected hotel'}`,
      sold_price_total: sold,
      internal_notes: cleanSummary(stay.option),
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        stayGroupId: stay.groupId,
        stayGroupLabel: stay.groupLabel,
        optionId: stay.option.id,
      },
    })
  })

  combination.visaOptions.forEach((option) => {
    const sold = visaTotal(option, payload)
    componentTotal += sold
    rows.push({
      ...baseRow,
      reservation_type: 'visa',
      title: `Visa - ${option.title || 'Selected visa'}`,
      sold_price_total: sold,
      internal_notes: cleanSummary(option),
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        optionId: option.id,
        quantity: visaQuantity(option, payload),
      },
    })
  })

  if (combination.transportOption) {
    const sold = optionTotal(combination.transportOption, servicePassengers)
    componentTotal += sold
    rows.push({
      ...baseRow,
      reservation_type: 'transport',
      title: `Transport - ${combination.transportOption.title || 'Selected transport'}`,
      sold_price_total: sold,
      internal_notes: cleanSummary(combination.transportOption),
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        optionId: combination.transportOption.id,
        includesZiyarat: Boolean(combination.transportOption.includesZiyarat),
        includesTourGuide: Boolean(combination.transportOption.includesTourGuide),
      },
    })
  }

  const adjustment = roundSignedMoney(combination.totalPrice - componentTotal)
  if (adjustment > 0) {
    rows.push({
      ...baseRow,
      reservation_type: 'other',
      title: 'Package pricing adjustment',
      sold_price_total: adjustment,
      internal_notes: 'Auto-generated adjustment for processing fees or package-level pricing.',
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        adjustmentType: 'surcharge',
      },
    })
  } else if (adjustment < 0) {
    rows.push({
      ...baseRow,
      reservation_type: 'other',
      title: 'Package discount adjustment',
      sold_price_total: 0,
      discount_total: Math.abs(adjustment),
      internal_notes: 'Auto-generated adjustment for package-level discounts.',
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        adjustmentType: 'discount',
      },
    })
  }

  return rows
}

function autoPaymentRows({
  packageId,
  quote,
  combination,
  breakdown,
  selection,
  payload,
  userId,
  now,
}: {
  packageId: string
  quote: TravelPackageQuote
  combination: PackageCombination
  breakdown: Partial<PackagePaymentBreakdown> | null | undefined
  selection: PackageSelectionInput
  payload: PackageQuotePayload
  userId: string
  now: string
}) {
  if (selection.paymentIntent === 'installment_request') return []
  if (selection.paymentIntent === 'deposit_only') {
    const depositMethod = selection.depositPaymentMethod || 'bank_transfer'
    const depositPayment = getPackageDepositPaymentSummary(payload, depositMethod)
    if (depositPayment.depositAmount <= 0) return []
    const depositMethodLabel =
      depositMethod === 'card' ? 'Credit Card' : depositMethod === 'cash' ? 'Cash' : 'Bank Transfer'
    return [
      {
        package_id: packageId,
        amount: depositPayment.total,
        currency: combination.currency,
        payment_type: 'deposit',
        payment_method: depositMethod,
        payment_status: 'pending',
        requested_at: now,
        due_at: now,
        notes:
          depositPayment.processingFee > 0
            ? `Customer chose to pay the minimum deposit by ${depositMethodLabel}. Deposit is non-refundable and must be paid as one full deposit payment. Includes ${payload.cardProcessingFeePercent}% Credit Card processing fee.`
            : `Customer chose to pay the minimum deposit by ${depositMethodLabel}. Deposit is non-refundable and must be paid as one full deposit payment.`,
        metadata: {
          autoGenerated: true,
          source: 'final_quote_deposit_request',
          quoteId: quote.id,
          combinationId: combination.id,
          nonRefundable: true,
          depositPaymentMethod: depositMethod,
          baseDepositAmount: depositPayment.depositAmount,
          processingFeeTotal: depositPayment.processingFee,
          processingFeePercent:
            depositMethod === 'card' ? payload.cardProcessingFeePercent : 0,
        },
        created_by: userId,
        updated_by: userId,
      },
    ]
  }

  if (!breakdown) return []
  const methods: Array<[keyof PackagePaymentBreakdown, string]> = [
    ['cash', 'cash'],
    ['bankTransfer', 'bank_transfer'],
    ['card', 'card'],
  ]
  return methods.flatMap(([key, method]) => {
    const amount = roundMoney(Number(breakdown[key] || 0))
    if (amount <= 0) return []
    return [
      {
        package_id: packageId,
        amount,
        currency: combination.currency,
        payment_type: 'payment',
        payment_method: method,
        payment_status: 'pending',
        requested_at: now,
        due_at: now,
        notes:
          'Customer requested this payment split during quotation finalisation. Agent must approve or override.',
        metadata: {
          autoGenerated: true,
          source: 'final_quote_payment_breakdown',
          quoteId: quote.id,
          combinationId: combination.id,
        },
        created_by: userId,
        updated_by: userId,
      },
    ]
  })
}

export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const { data: quoteData, error: quoteError } = await supabase
    .from('travel_package_quotes')
    .select(selectQuoteColumns())
    .eq('id', id)
    .single()

  if (quoteError || !quoteData) {
    if (isPackageSchemaError(quoteError)) {
      return apiError(SCHEMA_HINT, 503)
    }
    return apiError('Package quote not found', 404)
  }

  const quote = quoteData as unknown as TravelPackageQuote
  if (quote.status === 'archived') {
    return apiError('Archived package quotes cannot be converted', 400)
  }
  if (!quote.selected_option || !quote.selected_at) {
    return apiError('Finalise a package option before converting this quote', 400)
  }

  if (quote.converted_package_id) {
    const { data: existingPackage, error: existingError } = await supabase
      .from('travel_packages')
      .select(selectTravelPackageColumns())
      .eq('id', quote.converted_package_id)
      .single()

    if (!existingError && existingPackage) {
      return apiOk({
        package: existingPackage as unknown as TravelPackageFolder,
        alreadyConverted: true,
      })
    }
  }

  const payload = normalizePackageQuotePayload(quote.payload)
  const reference = createTravelPackageReference()
  const snapshot = buildPackageSnapshot(quote)
  const passengerSummary = buildPassengerSummary(payload)
  const nextAction = getDefaultPackageNextAction(quote.selected_option)
  const minioBucket = getPackageMinioBucketName()
  const minioPrefix = `${reference}/`

  const { data: packageData, error: insertError } = await supabase
    .from('travel_packages')
    .insert({
      package_reference: reference,
      source_quote_id: quote.id,
      created_by: user.id,
      assigned_agent_id: user.id,
      customer_name:
        quote.selected_option.selection.customerName ||
        quote.customer_name ||
        payload.customerName ||
        null,
      customer_phone:
        quote.selected_option.selection.customerPhone ||
        quote.customer_phone ||
        payload.customerPhone ||
        null,
      customer_email:
        quote.selected_option.selection.customerEmail ||
        quote.customer_email ||
        payload.customerEmail ||
        null,
      package_type: payload.packageType,
      destination:
        payload.packageType === 'umrah'
          ? 'Makkah / Madinah'
          : payload.packageType === 'ziyarat'
            ? 'Ziyarat'
            : 'Holiday',
      departure_date: asDateOnly(payload.departureDate),
      return_date: asDateOnly(payload.returnDate),
      status: 'selected',
      passenger_summary: passengerSummary,
      selected_quote_snapshot: snapshot,
      current_public_summary: {
        title: payload.title,
        packageSubtotalPrice: quote.selected_option.combination.packageSubtotalPrice,
        paymentMethod: quote.selected_option.combination.paymentMethod,
        paymentSurchargeTotal: quote.selected_option.combination.paymentSurchargeTotal,
        totalPrice: quote.selected_option.combination.totalPrice,
        currency: quote.selected_option.combination.currency,
      },
      next_action: nextAction,
      risk_level: 'medium',
      minio_bucket: minioBucket,
      minio_prefix: minioPrefix,
      customer_access_last_name:
        (
          quote.selected_option.selection.customerName ||
          quote.customer_name ||
          payload.customerName ||
          ''
        )
          .trim()
          .split(/\s+/)
          .at(-1)
          ?.toLowerCase() || null,
    })
    .select(selectTravelPackageColumns())
    .single()

  if (insertError || !packageData) {
    if (isPackageSchemaError(insertError)) {
      return apiError(SCHEMA_HINT, 503)
    }
    return apiError(insertError?.message || 'Failed to create package folder', 500)
  }

  const packageFolder = packageData as unknown as TravelPackageFolder

  const passengerRows = [
    ...Array.from({ length: passengerSummary.adults }, () => 'adult'),
    ...Array.from({ length: passengerSummary.childrenPaying }, () => 'child'),
    ...Array.from({ length: passengerSummary.childrenFree }, () => 'child'),
    ...Array.from({ length: passengerSummary.infants }, () => 'infant'),
  ].map((passengerType) => ({
    package_id: packageFolder.id,
    passenger_type: passengerType,
    created_by: user.id,
    updated_by: user.id,
  }))
  if (passengerRows.length > 0) {
    try {
      await supabase.from('travel_package_passengers').insert(passengerRows)
    } catch {}
  }

  const now = new Date().toISOString()
  const reservationRows = autoReservationRows({
    packageId: packageFolder.id,
    quote,
    payload,
    combination: quote.selected_option.combination,
    userId: user.id,
    now,
  })
  if (reservationRows.length > 0) {
    try {
      await supabase.from('travel_package_reservations').insert(reservationRows)
    } catch {}
  }

  const paymentRows = autoPaymentRows({
    packageId: packageFolder.id,
    quote,
    combination: quote.selected_option.combination,
    breakdown:
      quote.selected_option.selection.paymentBreakdown ||
      quote.selected_option.combination.paymentBreakdown,
    selection: quote.selected_option.selection,
    payload,
    userId: user.id,
    now,
  })
  if (paymentRows.length > 0) {
    try {
      await supabase.from('travel_package_payments').insert(paymentRows)
    } catch {}
  }

  await supabase.from('travel_package_tasks').insert({
    package_id: packageFolder.id,
    quote_id: quote.id,
    title: nextAction,
    description: 'Initial package action after quote conversion.',
    task_type: 'passport_status',
    priority: 'high',
    assigned_to: user.id,
    auto_generated: true,
    source_rule: 'quote_converted',
  })

  if (quote.selected_option.selection.paymentIntent === 'installment_request') {
    await supabase.from('travel_package_tasks').insert({
      package_id: packageFolder.id,
      quote_id: quote.id,
      title: 'Review installment request',
      description:
        'Customer requested an installment option. Check whether one of the 5 installment customer slots is available.',
      task_type: 'payment',
      priority: 'high',
      assigned_to: user.id,
      auto_generated: true,
      source_rule: 'installment_requested',
    })
  }

  await supabase.from('travel_package_communications').insert({
    package_id: packageFolder.id,
    quote_id: quote.id,
    channel: 'internal',
    direction: 'internal',
    summary: 'Quote converted to package folder.',
    created_by: user.id,
  })

  await supabase.from('travel_package_versions').insert({
    package_id: packageFolder.id,
    quote_id: quote.id,
    object_type: 'selected_quote',
    object_id: quote.id,
    version_number: 1,
    visibility: 'internal_only',
    snapshot,
    internal_change_summary: 'Initial finalised quote snapshot.',
    created_by: user.id,
  })

  const deadlineRows = [
    packageFolder.departure_date
      ? {
          package_id: packageFolder.id,
          quote_id: quote.id,
          deadline_type: 'departure_date',
          title: 'Customer departure',
          due_at: `${packageFolder.departure_date}T00:00:00.000Z`,
          severity: 'critical',
          assigned_to: user.id,
          metadata: { autoGenerated: true },
        }
      : null,
    packageFolder.return_date
      ? {
          package_id: packageFolder.id,
          quote_id: quote.id,
          deadline_type: 'return_date',
          title: 'Customer return',
          due_at: `${packageFolder.return_date}T23:59:59.000Z`,
          severity: 'high',
          assigned_to: user.id,
          metadata: { autoGenerated: true },
        }
      : null,
  ].filter(Boolean)
  if (deadlineRows.length > 0) {
    try {
      await supabase.from('travel_package_deadlines').insert(deadlineRows)
    } catch {}
  }

  await supabase
    .from('travel_package_quotes')
    .update({
      converted_package_id: packageFolder.id,
      converted_at: new Date().toISOString(),
      status: 'converted',
    })
    .eq('id', quote.id)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: packageFolder.id,
      quoteId: quote.id,
      actorId: user.id,
      eventType: 'quote_converted',
      eventSummary: 'Finalised quote converted to a package folder.',
      afterData: packageFolder,
    },
  )

  return apiOk({ package: packageFolder, alreadyConverted: false }, { status: 201 })
}
