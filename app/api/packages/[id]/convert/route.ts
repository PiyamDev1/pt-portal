import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import {
  buildPackageSnapshot,
  buildPassengerSummary,
  createTravelPackageReference,
  getDefaultPackageNextAction,
  getLinkedFlightOptionTotal,
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
  TravelPackageGroup,
  TravelPackageGroupMember,
  TravelPackageQuote,
} from '@/app/types/packages'
import { recordPackageAuditEvent } from '@/lib/packageAudit'
import type { Database } from '@/types/supabase'

const SCHEMA_HINT =
  'Travel package folder schema is incomplete. Run the package workflow migrations, including scripts/migrations/20260827_create_group_customer_files.sql, in Supabase SQL editor.'

type TravelPackagePaymentInsert = Database['public']['Tables']['travel_package_payments']['Insert']
type GroupTravelPackagePaymentInsert = TravelPackagePaymentInsert & {
  quote_id?: string | null
  group_member_id?: string | null
}
type TravelPackageDeadlineInsert =
  Database['public']['Tables']['travel_package_deadlines']['Insert']

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
    group_id,
    customer_file_mode,
    created_by,
    assigned_agent_id,
    sales_employee_id,
    sales_responsible_employee_id,
    booking_responsible_employee_id,
    modify_responsible_employee_id,
    service_responsible_employee_id,
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

function linkedFlightSelectionsTotal(
  combination: PackageCombination,
  payload: PackageQuotePayload,
) {
  return roundSignedMoney(
    combination.linkedFlightSelections.reduce(
      (sum, selection) =>
        sum + getLinkedFlightOptionTotal(selection.group, selection.option, payload),
      0,
    ),
  )
}

function visaQuantity(option: PackageComponentOption, payload: PackageQuotePayload) {
  return option.quantity && option.quantity > 0
    ? option.quantity
    : payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
}

async function resolveEmployeeId(
  supabase: { from: (table: string) => any },
  candidateIds: Array<string | null | undefined>,
) {
  const checkedIds = new Set<string>()
  for (const candidateId of candidateIds) {
    const cleanId = typeof candidateId === 'string' ? candidateId.trim() : ''
    if (!cleanId || checkedIds.has(cleanId)) continue
    checkedIds.add(cleanId)

    const { data } = (await supabase
      .from('employees')
      .select('id')
      .eq('id', cleanId)
      .maybeSingle()) as { data?: { id?: string | null } | null }

    if (data?.id) return data.id
  }
  return null
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
  groupMemberId,
  familyLabel,
}: {
  packageId: string
  quote: TravelPackageQuote
  payload: PackageQuotePayload
  combination: PackageCombination
  userId: string
  now: string
  groupMemberId?: string | null
  familyLabel?: string
}) {
  const servicePassengers =
    payload.adults + payload.childrenPaying + payload.childrenFree + payload.infants
  const rows: Array<Record<string, unknown>> = []
  let componentTotal = 0
  const baseRow = {
    package_id: packageId,
    quote_id: quote.id,
    ...(groupMemberId ? { group_member_id: groupMemberId } : {}),
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
    const sold = roundMoney(
      flightTotal(combination.flightOption, payload) +
        linkedFlightSelectionsTotal(combination, payload),
    )
    componentTotal += sold
    rows.push({
      ...baseRow,
      reservation_type: 'flight',
      title: `${familyLabel ? `${familyLabel} - ` : ''}Flight - ${combination.flightOption.title || 'Selected flight'}`,
      sold_price_total: sold,
      internal_notes: cleanSummary(combination.flightOption),
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        familyLabel: familyLabel || null,
        optionId: combination.flightOption.id,
        linkedFlightSelections: combination.linkedFlightSelections.map((selection) => ({
          groupId: selection.group.id,
          routeLabel: selection.group.routeLabel,
          optionId: selection.option.id,
          airlineName: selection.option.airlineName,
          summary: selection.option.summary,
        })),
      },
    })
  }

  combination.staySelections.forEach((stay) => {
    const sold = roundMoney(stay.option.price)
    componentTotal += sold
    rows.push({
      ...baseRow,
      reservation_type: 'hotel',
      title: `${familyLabel ? `${familyLabel} - ` : ''}${stay.groupLabel} hotel - ${stay.option.title || 'Selected hotel'}`,
      sold_price_total: sold,
      internal_notes: cleanSummary(stay.option),
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        familyLabel: familyLabel || null,
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
      title: `${familyLabel ? `${familyLabel} - ` : ''}Visa - ${option.title || 'Selected visa'}`,
      sold_price_total: sold,
      internal_notes: cleanSummary(option),
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        familyLabel: familyLabel || null,
        optionId: option.id,
        quantity: visaQuantity(option, payload),
        visaPassengerCategory: option.visaPassengerCategory || 'all',
      },
    })
  })

  if (combination.transportOption) {
    const sold = optionTotal(combination.transportOption, servicePassengers)
    const transportNetCost = Number(combination.transportOption.transportNetCost || 0)
    componentTotal += sold
    rows.push({
      ...baseRow,
      reservation_type: 'transport',
      title: `${familyLabel ? `${familyLabel} - ` : ''}Transport - ${combination.transportOption.title || 'Selected transport'}`,
      booked_cost_total: transportNetCost > 0 ? transportNetCost : 0,
      sold_price_total: sold,
      internal_notes: cleanSummary(combination.transportOption),
      metadata: {
        autoGenerated: true,
        source: 'final_quote_selection',
        familyLabel: familyLabel || null,
        optionId: combination.transportOption.id,
        includesZiyarat: Boolean(combination.transportOption.includesZiyarat),
        includesTourGuide: Boolean(combination.transportOption.includesTourGuide),
        transportRoutes: combination.transportOption.transportRoutes || [],
        transportMainSupplierId: combination.transportOption.transportMainSupplierId || '',
        transportMainSupplierName: combination.transportOption.transportMainSupplierName || '',
        transportNetCost,
        transportNetCurrency: combination.transportOption.transportNetCurrency || quote.currency,
      },
    })
  }

  const adjustment = roundSignedMoney(combination.totalPrice - componentTotal)
  if (adjustment > 0) {
    rows.push({
      ...baseRow,
      reservation_type: 'other',
      title: `${familyLabel ? `${familyLabel} - ` : ''}Package pricing adjustment`,
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
      title: `${familyLabel ? `${familyLabel} - ` : ''}Package discount adjustment`,
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
  groupMemberId,
  familyLabel,
}: {
  packageId: string
  quote: TravelPackageQuote
  combination: PackageCombination
  breakdown: Partial<PackagePaymentBreakdown> | null | undefined
  selection: PackageSelectionInput
  payload: PackageQuotePayload
  userId: string
  now: string
  groupMemberId?: string | null
  familyLabel?: string
}): GroupTravelPackagePaymentInsert[] {
  const familyFields = groupMemberId ? { quote_id: quote.id, group_member_id: groupMemberId } : {}
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
        ...familyFields,
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
          familyLabel: familyLabel || null,
          combinationId: combination.id,
          nonRefundable: true,
          depositPaymentMethod: depositMethod,
          baseDepositAmount: depositPayment.depositAmount,
          processingFeeTotal: depositPayment.processingFee,
          processingFeePercent: depositMethod === 'card' ? payload.cardProcessingFeePercent : 0,
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
    const baseAmount = roundMoney(Number(breakdown[key] || 0))
    const processingFee =
      key === 'card'
        ? roundMoney((baseAmount * Number(payload.cardProcessingFeePercent || 0)) / 100)
        : 0
    const amount = roundMoney(baseAmount + processingFee)
    if (amount <= 0) return []
    return [
      {
        package_id: packageId,
        ...familyFields,
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
          familyLabel: familyLabel || null,
          combinationId: combination.id,
          baseAmount,
          processingFeeTotal: processingFee,
          processingFeePercent: key === 'card' ? payload.cardProcessingFeePercent : 0,
        },
        created_by: userId,
        updated_by: userId,
      },
    ]
  })
}

type GroupConversionEntry = {
  quote: TravelPackageQuote
  payload: PackageQuotePayload
  member: TravelPackageGroupMember | null
}

function isFinalisedGroupQuote(quote: TravelPackageQuote) {
  return Boolean(
    quote.selected_option &&
    quote.selected_at &&
    (quote.finalised_at ||
      ['customer_selected', 'agent_selected', 'finalised', 'converted'].includes(quote.status)),
  )
}

async function loadGroupConversionContext(
  supabase: Awaited<ReturnType<typeof getRouteSupabaseClient>>,
  quote: TravelPackageQuote,
) {
  const { data: membershipData, error: membershipError } = await supabase
    .from('travel_package_group_members')
    .select('id, group_id')
    .eq('quote_id', quote.id)
    .maybeSingle()
  if (membershipError || !membershipData) {
    throw new Error('This quotation is not attached to a linked package group')
  }

  const membership = membershipData as unknown as { id: string; group_id: string }
  const [{ data: groupData, error: groupError }, { data: memberData, error: memberError }] =
    await Promise.all([
      supabase.from('travel_package_groups').select('*').eq('id', membership.group_id).single(),
      supabase
        .from('travel_package_group_members')
        .select('*')
        .eq('group_id', membership.group_id)
        .order('sort_order', { ascending: true }),
    ])
  if (groupError || !groupData) throw new Error('Linked package group not found')
  if (memberError) throw new Error(memberError.message || 'Unable to load linked families')

  const group = groupData as unknown as TravelPackageGroup
  const members = (memberData || []) as unknown as TravelPackageGroupMember[]
  const quoteIds = members
    .map((member) => member.quote_id)
    .filter((quoteId): quoteId is string => Boolean(quoteId))
  if (quoteIds.length === 0) throw new Error('The linked package group has no quotations')

  const { data: quoteRows, error: quoteRowsError } = await supabase
    .from('travel_package_quotes')
    .select(selectQuoteColumns())
    .in('id', quoteIds)
  if (quoteRowsError) throw new Error(quoteRowsError.message || 'Unable to load linked quotations')

  const quoteMap = new Map(
    ((quoteRows || []) as unknown as TravelPackageQuote[]).map((candidate) => [
      candidate.id,
      candidate,
    ]),
  )
  const entries: GroupConversionEntry[] = members.flatMap((member) => {
    const memberQuote = member.quote_id ? quoteMap.get(member.quote_id) : null
    return memberQuote
      ? [{ quote: memberQuote, payload: normalizePackageQuotePayload(memberQuote.payload), member }]
      : []
  })
  if (entries.length !== quoteIds.length) {
    throw new Error('One or more linked family quotations could not be loaded')
  }
  const incompleteFamily = entries.find((entry) => !isFinalisedGroupQuote(entry.quote))
  if (incompleteFamily) {
    throw new Error(
      `${incompleteFamily.member?.family_label || incompleteFamily.quote.title} must save and finalise a selection first`,
    )
  }
  const currencies = new Set(
    entries.map((entry) => entry.quote.selected_option!.combination.currency),
  )
  if (currencies.size > 1) {
    throw new Error('Linked family quotations must use the same currency for one customer file')
  }
  const packageTypes = new Set(entries.map((entry) => entry.payload.packageType))
  if (packageTypes.size > 1) {
    throw new Error('Linked family quotations must use the same package type')
  }

  return { group, members, entries }
}

function createGroupPackageReference(groupReference: string) {
  const code = groupReference.toUpperCase().match(/[A-Z0-9]{6}$/)?.[0]
  return code ? `PT-${code}` : createTravelPackageReference(groupReference)
}

function addPassengerSummaries(entries: GroupConversionEntry[]) {
  return entries.reduce(
    (total, entry) => {
      const summary = buildPassengerSummary(entry.payload)
      total.adults += summary.adults
      total.childrenPaying += summary.childrenPaying
      total.childrenFree += summary.childrenFree
      total.infants += summary.infants
      total.totalPassengers += summary.totalPassengers
      total.hotelPayingGuests += summary.hotelPayingGuests
      total.servicePassengers += summary.servicePassengers
      return total
    },
    {
      adults: 0,
      childrenPaying: 0,
      childrenFree: 0,
      infants: 0,
      totalPassengers: 0,
      hotelPayingGuests: 0,
      servicePassengers: 0,
    },
  )
}

function allocateGroupPaymentBreakdown(
  entries: GroupConversionEntry[],
  breakdown: Partial<PackagePaymentBreakdown> | null | undefined,
) {
  const allocations = new Map<string, PackagePaymentBreakdown>()
  if (!breakdown || entries.length === 0) return allocations
  const groupSubtotal = entries.reduce(
    (total, entry) => total + entry.quote.selected_option!.combination.packageSubtotalPrice,
    0,
  )
  if (groupSubtotal <= 0) return allocations

  const methods: Array<keyof PackagePaymentBreakdown> = ['cash', 'bankTransfer', 'card']
  entries.forEach((entry) => allocations.set(entry.quote.id, { cash: 0, bankTransfer: 0, card: 0 }))
  methods.forEach((method) => {
    const methodTotal = roundMoney(Number(breakdown[method] || 0))
    let allocated = 0
    entries.forEach((entry, index) => {
      const isLast = index === entries.length - 1
      const amount = isLast
        ? roundMoney(methodTotal - allocated)
        : roundMoney(
            (methodTotal * entry.quote.selected_option!.combination.packageSubtotalPrice) /
              groupSubtotal,
          )
      allocations.get(entry.quote.id)![method] = amount
      allocated = roundMoney(allocated + amount)
    })
  })
  return allocations
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

  const requestBody = (await request.json().catch(() => null)) as Record<string, unknown> | null
  const groupCustomerFileRequested =
    requestBody?.groupCustomerFile === true ||
    quote.selected_option.selection.paymentScope === 'group'
  let groupContext: Awaited<ReturnType<typeof loadGroupConversionContext>> | null = null
  if (groupCustomerFileRequested) {
    try {
      groupContext = await loadGroupConversionContext(supabase, quote)
    } catch (error) {
      return apiError(error instanceof Error ? error.message : 'Unable to prepare group file', 400)
    }
  }

  const existingPackageId = groupContext
    ? groupContext.group.customer_package_id
    : quote.converted_package_id
  if (existingPackageId) {
    const { data: existingPackage, error: existingError } = await supabase
      .from('travel_packages')
      .select(selectTravelPackageColumns())
      .eq('id', existingPackageId)
      .single()

    if (!existingError && existingPackage) {
      return apiOk({
        package: existingPackage as unknown as TravelPackageFolder,
        alreadyConverted: true,
      })
    }
  }

  const entries: GroupConversionEntry[] = groupContext?.entries || [
    { quote, payload: normalizePackageQuotePayload(quote.payload), member: null },
  ]
  const leadEntry =
    (groupContext?.group.lead_quote_id
      ? entries.find((entry) => entry.quote.id === groupContext.group.lead_quote_id)
      : null) ||
    entries.find((entry) => entry.member?.is_lead_family) ||
    entries[0]
  const leadQuote = leadEntry.quote
  const payload = leadEntry.payload
  const reference = groupContext
    ? createGroupPackageReference(groupContext.group.group_reference)
    : createTravelPackageReference(quote.title || payload.title)
  const salesEmployeeId = await resolveEmployeeId(supabase, [
    ...entries.flatMap((entry) => [
      entry.quote.finalised_by,
      entry.quote.last_shared_by,
      entry.quote.created_by,
    ]),
    user.id,
  ])
  const passengerSummary = groupContext
    ? addPassengerSummaries(entries)
    : buildPassengerSummary(payload)
  const nextAction = getDefaultPackageNextAction(leadQuote.selected_option!)
  const familySnapshots = entries.map((entry) => ({
    memberId: entry.member?.id || '',
    quoteId: entry.quote.id,
    familyLabel: entry.member?.family_label || entry.quote.customer_name || entry.quote.title,
    customerName:
      entry.quote.selected_option!.selection.customerName ||
      entry.quote.customer_name ||
      entry.payload.customerName ||
      '',
    passengerSummary: buildPassengerSummary(entry.payload),
    selection: entry.quote.selected_option!,
    payload: entry.payload,
  }))
  const snapshot = groupContext
    ? {
        quote: leadQuote,
        selection: leadQuote.selected_option,
        payload,
        group: {
          id: groupContext.group.id,
          reference: groupContext.group.group_reference,
          title: groupContext.group.title,
          families: familySnapshots,
        },
      }
    : buildPackageSnapshot(quote)
  const departureDates = entries
    .map((entry) => asDateOnly(entry.payload.departureDate))
    .filter((value): value is string => Boolean(value))
    .sort()
  const returnDates = entries
    .map((entry) => asDateOnly(entry.payload.returnDate))
    .filter((value): value is string => Boolean(value))
    .sort()
  const groupTotals = entries.reduce(
    (totals, entry) => {
      const combination = entry.quote.selected_option!.combination
      totals.packageSubtotalPrice += combination.packageSubtotalPrice
      totals.paymentSurchargeTotal += combination.paymentSurchargeTotal
      totals.totalPrice += combination.totalPrice
      return totals
    },
    { packageSubtotalPrice: 0, paymentSurchargeTotal: 0, totalPrice: 0 },
  )
  const minioBucket = getPackageMinioBucketName()
  const minioPrefix = `${reference}/`

  const { data: packageData, error: insertError } = await supabase
    .from('travel_packages')
    .insert({
      package_reference: reference,
      source_quote_id: leadQuote.id,
      ...(groupContext ? { group_id: groupContext.group.id, customer_file_mode: 'group' } : {}),
      created_by: user.id,
      assigned_agent_id: salesEmployeeId,
      sales_employee_id: salesEmployeeId,
      sales_responsible_employee_id: salesEmployeeId,
      booking_responsible_employee_id: salesEmployeeId,
      service_responsible_employee_id: salesEmployeeId,
      customer_name:
        leadQuote.selected_option!.selection.customerName ||
        leadQuote.customer_name ||
        payload.customerName ||
        null,
      customer_phone:
        leadQuote.selected_option!.selection.customerPhone ||
        leadQuote.customer_phone ||
        payload.customerPhone ||
        null,
      customer_email:
        leadQuote.selected_option!.selection.customerEmail ||
        leadQuote.customer_email ||
        payload.customerEmail ||
        null,
      package_type: payload.packageType,
      destination:
        payload.packageType === 'umrah'
          ? 'Makkah / Madinah'
          : payload.packageType === 'ziyarat'
            ? 'Ziyarat'
            : 'Holiday',
      departure_date: departureDates[0] || null,
      return_date: returnDates.at(-1) || null,
      status: 'selected',
      passenger_summary: passengerSummary,
      selected_quote_snapshot: snapshot,
      current_public_summary: {
        title: groupContext?.group.title || payload.title,
        packageSubtotalPrice: groupTotals.packageSubtotalPrice,
        paymentMethod: leadQuote.selected_option!.combination.paymentMethod,
        paymentSurchargeTotal: groupTotals.paymentSurchargeTotal,
        totalPrice: groupTotals.totalPrice,
        currency: leadQuote.selected_option!.combination.currency,
        familyCount: entries.length,
        families: familySnapshots.map((family) => ({
          quoteId: family.quoteId,
          familyLabel: family.familyLabel,
          totalPrice: family.selection.combination.totalPrice,
          discountTotal: family.selection.combination.offerDiscountTotal,
        })),
      },
      next_action: nextAction,
      risk_level: 'medium',
      minio_bucket: minioBucket,
      minio_prefix: minioPrefix,
      customer_access_last_name:
        (
          leadQuote.selected_option!.selection.customerName ||
          leadQuote.customer_name ||
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
  const removeIncompleteGroupPackage = async () => {
    if (!groupContext) return
    await supabase.from('travel_packages').delete().eq('id', packageFolder.id)
  }

  const passengerRows = entries.flatMap((entry) => {
    const summary = buildPassengerSummary(entry.payload)
    return [
      ...Array.from({ length: summary.adults }, () => 'adult'),
      ...Array.from({ length: summary.childrenPaying }, () => 'child'),
      ...Array.from({ length: summary.childrenFree }, () => 'child'),
      ...Array.from({ length: summary.infants }, () => 'infant'),
    ].map((passengerType) => ({
      package_id: packageFolder.id,
      ...(entry.member ? { quote_id: entry.quote.id, group_member_id: entry.member.id } : {}),
      passenger_type: passengerType,
      created_by: user.id,
      updated_by: user.id,
    }))
  })
  if (passengerRows.length > 0) {
    const { error: passengerInsertError } = await supabase
      .from('travel_package_passengers')
      .insert(passengerRows)
    if (groupContext && passengerInsertError) {
      await removeIncompleteGroupPackage()
      return apiError(
        passengerInsertError.message || 'Unable to create the linked family passenger records',
        500,
      )
    }
  }

  const now = new Date().toISOString()
  const reservationRows = entries.flatMap((entry) =>
    autoReservationRows({
      packageId: packageFolder.id,
      quote: entry.quote,
      payload: entry.payload,
      combination: entry.quote.selected_option!.combination,
      userId: user.id,
      now,
      groupMemberId: entry.member?.id,
      familyLabel: entry.member?.family_label,
    }),
  )
  if (reservationRows.length > 0) {
    const { error: reservationInsertError } = await supabase
      .from('travel_package_reservations')
      .insert(reservationRows)
    if (groupContext && reservationInsertError) {
      await removeIncompleteGroupPackage()
      return apiError(
        reservationInsertError.message || 'Unable to create the linked family reservations',
        500,
      )
    }
  }

  const groupPaymentSelection = entries.find(
    (entry) => entry.quote.selected_option!.selection.paymentScope === 'group',
  )?.quote.selected_option!.selection
  const allocatedGroupBreakdowns = allocateGroupPaymentBreakdown(
    entries,
    groupPaymentSelection?.groupPaymentBreakdown,
  )
  const paymentRows = entries.flatMap((entry) => {
    const selection = entry.quote.selected_option!.selection
    const breakdown =
      allocatedGroupBreakdowns.get(entry.quote.id) ||
      selection.paymentBreakdown ||
      entry.quote.selected_option!.combination.paymentBreakdown
    return autoPaymentRows({
      packageId: packageFolder.id,
      quote: entry.quote,
      combination: entry.quote.selected_option!.combination,
      breakdown,
      selection: groupPaymentSelection
        ? { ...selection, paymentIntent: groupPaymentSelection.paymentIntent }
        : selection,
      payload: entry.payload,
      userId: user.id,
      now,
      groupMemberId: entry.member?.id,
      familyLabel: entry.member?.family_label,
    })
  })
  if (paymentRows.length > 0) {
    const { error: paymentInsertError } = await supabase
      .from('travel_package_payments')
      .insert(paymentRows)
    if (groupContext && paymentInsertError) {
      await removeIncompleteGroupPackage()
      return apiError(
        paymentInsertError.message || 'Unable to create the linked family payment requests',
        500,
      )
    }
  }

  await supabase.from('travel_package_tasks').insert({
    package_id: packageFolder.id,
    quote_id: leadQuote.id,
    title: nextAction,
    description: 'Initial package action after quote conversion.',
    task_type: 'passport_status',
    priority: 'high',
    assigned_to: user.id,
    auto_generated: true,
    source_rule: 'quote_converted',
  })

  if (
    entries.some(
      (entry) => entry.quote.selected_option!.selection.paymentIntent === 'installment_request',
    )
  ) {
    await supabase.from('travel_package_tasks').insert({
      package_id: packageFolder.id,
      quote_id: leadQuote.id,
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
    quote_id: leadQuote.id,
    channel: 'internal',
    direction: 'internal',
    summary: groupContext
      ? 'Linked package group converted to one customer file with separate family accounts.'
      : 'Quote converted to package folder.',
    created_by: user.id,
  })

  await supabase.from('travel_package_versions').insert(
    entries.map((entry) => ({
      package_id: packageFolder.id,
      quote_id: entry.quote.id,
      object_type: 'selected_quote',
      object_id: entry.quote.id,
      version_number: 1,
      visibility: 'internal_only',
      snapshot: buildPackageSnapshot(entry.quote),
      internal_change_summary: groupContext
        ? `Initial finalised quote snapshot for ${entry.member?.family_label || entry.quote.title}.`
        : 'Initial finalised quote snapshot.',
      created_by: user.id,
    })),
  )

  const deadlineRows: TravelPackageDeadlineInsert[] = []
  if (packageFolder.departure_date) {
    deadlineRows.push({
      package_id: packageFolder.id,
      quote_id: leadQuote.id,
      deadline_type: 'departure_date',
      title: 'Customer departure',
      due_at: `${packageFolder.departure_date}T00:00:00.000Z`,
      severity: 'critical',
      assigned_to: user.id,
      metadata: { autoGenerated: true },
    })
  }
  if (packageFolder.return_date) {
    deadlineRows.push({
      package_id: packageFolder.id,
      quote_id: leadQuote.id,
      deadline_type: 'return_date',
      title: 'Customer return',
      due_at: `${packageFolder.return_date}T23:59:59.000Z`,
      severity: 'high',
      assigned_to: user.id,
      metadata: { autoGenerated: true },
    })
  }
  if (deadlineRows.length > 0) {
    try {
      await supabase.from('travel_package_deadlines').insert(deadlineRows)
    } catch {}
  }

  if (groupContext) {
    const { error: groupUpdateError } = await supabase
      .from('travel_package_groups')
      .update({
        customer_file_mode: 'combined',
        customer_package_id: packageFolder.id,
        customer_file_created_at: now,
        lead_package_id: packageFolder.id,
        status: 'finalised',
        updated_by: user.id,
      })
      .eq('id', groupContext.group.id)
    if (groupUpdateError) {
      await removeIncompleteGroupPackage()
      return apiError(
        groupUpdateError.message || 'The linked group customer file could not be created',
        500,
      )
    }
  }

  const quoteConversionUpdate = supabase.from('travel_package_quotes').update({
    converted_package_id: packageFolder.id,
    converted_at: now,
    status: 'converted',
  })
  const { error: quoteConversionError } = groupContext
    ? await quoteConversionUpdate.in(
        'id',
        entries.map((entry) => entry.quote.id),
      )
    : await quoteConversionUpdate.eq('id', quote.id)
  if (groupContext && quoteConversionError) {
    await supabase
      .from('travel_package_groups')
      .update({
        customer_file_mode: groupContext.group.customer_file_mode || 'separate',
        customer_package_id: groupContext.group.customer_package_id || null,
        customer_file_created_at: groupContext.group.customer_file_created_at || null,
        lead_package_id: groupContext.group.lead_package_id || null,
        status: groupContext.group.status,
        updated_by: user.id,
      })
      .eq('id', groupContext.group.id)
    await removeIncompleteGroupPackage()
    return apiError(
      quoteConversionError.message || 'The linked family quotations could not be converted',
      500,
    )
  }

  if (groupContext) {
    await supabase
      .from('travel_package_group_members')
      .update({ package_id: packageFolder.id })
      .eq('group_id', groupContext.group.id)
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: packageFolder.id,
      quoteId: leadQuote.id,
      actorId: user.id,
      eventType: groupContext ? 'package_group_converted' : 'quote_converted',
      eventSummary: groupContext
        ? 'Linked package group converted to one customer file with separate family invoices.'
        : 'Finalised quote converted to a package folder.',
      afterData: packageFolder,
      metadata: groupContext
        ? {
            groupId: groupContext.group.id,
            familyQuoteIds: entries.map((entry) => entry.quote.id),
          }
        : {},
    },
  )

  return apiOk({ package: packageFolder, alreadyConverted: false }, { status: 201 })
}
