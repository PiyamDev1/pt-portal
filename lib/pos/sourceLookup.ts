import type { SupabaseClient } from '@supabase/supabase-js'
import type { PosSourceOption } from '@/lib/pos/contracts'

type PosTrackedSourceType = PosSourceOption['sourceType']
type Related<T> = T | T[] | null

const RESULT_LIMIT = 12

function first<T>(value: Related<T>) {
  return Array.isArray(value) ? value[0] || null : value
}

function clean(value: unknown, fallback = '') {
  return String(value || '').trim() || fallback
}

function escapeSearch(value: string) {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`)
}

function applicationNamespace(catalogueKey: string) {
  if (['nicop-cnic', 'poc', 'frc', 'crc', 'poa'].includes(catalogueKey)) return 'nadra'
  if (catalogueKey === 'pk-passport') return 'pak_passport'
  if (catalogueKey === 'gb-passport') return 'gb_passport'
  if (catalogueKey === 'visa') return 'visa'
  return 'applications'
}

async function lookupTicketing(
  supabase: SupabaseClient,
  locationId: string,
  query: string,
): Promise<PosSourceOption[]> {
  const search = escapeSearch(query)
  const { data, error } = await supabase
    .from('ticket_bookings')
    .select('id,pnr,customer_name,operational_status,payment_status')
    .eq('location_id', locationId)
    .is('archived_at', null)
    .or(`pnr.ilike.%${search}%,customer_name.ilike.%${search}%`)
    .order('booking_date', { ascending: false })
    .limit(RESULT_LIMIT)
  if (error) throw error

  return (data || []).map((row) => ({
    sourceType: 'TICKETING',
    namespace: 'ticket_booking',
    recordId: row.id,
    displayReference: clean(row.pnr, row.id),
    title: `${clean(row.pnr, 'No PNR')} · ${clean(row.customer_name, 'Customer not recorded')}`,
    detail: 'Ticket booking at this POS branch',
    status: `${clean(row.operational_status, 'Unknown')} · ${clean(row.payment_status, 'Unknown')}`,
    path: `/dashboard/ticketing/ledger?search=${encodeURIComponent(clean(row.pnr, row.id))}`,
  }))
}

async function lookupPackages(
  supabase: SupabaseClient,
  locationId: string,
  query: string,
): Promise<PosSourceOption[]> {
  const search = escapeSearch(query)
  const { data, error } = await supabase
    .from('travel_packages')
    .select('id,package_reference,customer_name,status,payment_status')
    .eq('location_id', locationId)
    .is('archived_at', null)
    .or(`package_reference.ilike.%${search}%,customer_name.ilike.%${search}%`)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (error) throw error

  return (data || []).map((row) => ({
    sourceType: 'PACKAGES',
    namespace: 'travel_package',
    recordId: row.id,
    displayReference: clean(row.package_reference, row.id),
    title: `${clean(row.package_reference, 'Package')} · ${clean(row.customer_name, 'Customer not recorded')}`,
    detail: 'Travel package at this POS branch',
    status: `${clean(row.status, 'Unknown')} · ${clean(row.payment_status, 'Unknown')}`,
    path: `/dashboard/packages/${row.id}`,
  }))
}

type ApplicationLookupRow = {
  id: string
  status: string | null
  tracking_number?: string | null
  internal_tracking_number?: string | null
  pex_number?: string | null
  applicants: Related<{ first_name: string | null; last_name: string | null }>
  applications?: Related<{ tracking_number: string | null }>
}

async function lookupApplications(
  supabase: SupabaseClient,
  query: string,
  catalogueKey: string,
): Promise<PosSourceOption[]> {
  const search = `%${escapeSearch(query)}%`
  const namespace = applicationNamespace(catalogueKey)
  let result: { data: unknown[] | null; error: unknown }

  if (namespace === 'nadra') {
    result = await supabase
      .from('nadra_services')
      .select('id,status,tracking_number,applicants(first_name,last_name)')
      .ilike('tracking_number', search)
      .order('created_at', { ascending: false })
      .limit(RESULT_LIMIT)
  } else if (namespace === 'pak_passport') {
    result = await supabase
      .from('pakistani_passport_applications')
      .select('id,status,applicants(first_name,last_name),applications!inner(tracking_number)')
      .ilike('applications.tracking_number', search)
      .order('created_at', { ascending: false })
      .limit(RESULT_LIMIT)
  } else if (namespace === 'gb_passport') {
    result = await supabase
      .from('british_passport_applications')
      .select('id,status,pex_number,applicants(first_name,last_name),applications(tracking_number)')
      .or(`pex_number.ilike.${search}`)
      .order('created_at', { ascending: false })
      .limit(RESULT_LIMIT)
  } else if (namespace === 'visa') {
    result = await supabase
      .from('visa_applications')
      .select('id,status,internal_tracking_number,applicants(first_name,last_name)')
      .ilike('internal_tracking_number', search)
      .order('created_at', { ascending: false })
      .limit(RESULT_LIMIT)
  } else {
    return []
  }

  if (result.error) throw result.error
  return ((result.data || []) as ApplicationLookupRow[]).map((row) => {
    const applicant = first(row.applicants)
    const parent = first(row.applications || null)
    const reference = clean(
      row.tracking_number ||
        row.internal_tracking_number ||
        row.pex_number ||
        parent?.tracking_number,
      row.id,
    )
    const customer = clean(
      [applicant?.first_name, applicant?.last_name].filter(Boolean).join(' '),
      'Applicant not recorded',
    )
    return {
      sourceType: 'APPLICATIONS',
      namespace,
      recordId: row.id,
      displayReference: reference,
      title: `${reference} · ${customer}`,
      detail: namespace.replace(/_/g, ' '),
      status: clean(row.status, 'Unknown'),
      path: '/dashboard/applications',
    }
  })
}

type LmsCustomerRow = {
  id: string
  first_name: string | null
  last_name: string | null
  phone_number: string | null
  loans: Array<{ id: string; status: string | null }> | null
}

async function lookupLms(supabase: SupabaseClient, query: string): Promise<PosSourceOption[]> {
  const search = escapeSearch(query)
  const { data, error } = await supabase
    .from('loan_customers')
    .select('id,first_name,last_name,phone_number,loans(id,status)')
    .or(`first_name.ilike.%${search}%,last_name.ilike.%${search}%,phone_number.ilike.%${search}%`)
    .order('created_at', { ascending: false })
    .limit(RESULT_LIMIT)
  if (error) throw error

  return ((data || []) as LmsCustomerRow[]).flatMap((customer) => {
    const name = clean(
      [customer.first_name, customer.last_name].filter(Boolean).join(' '),
      'LMS customer',
    )
    return (customer.loans || []).slice(0, 3).map((loan) => ({
      sourceType: 'LMS' as const,
      namespace: 'loan',
      recordId: loan.id,
      displayReference: `${name} · ${loan.id.slice(0, 8)}`,
      title: name,
      detail: clean(customer.phone_number, 'No phone number'),
      status: clean(loan.status, 'Active'),
      path: `/dashboard/lms/statement/${customer.id}`,
    }))
  })
}

export async function loadPosSourceOptions(
  supabase: SupabaseClient,
  input: {
    sourceType: PosTrackedSourceType
    query: string
    catalogueKey: string
    locationId: string
  },
) {
  if (input.sourceType === 'TICKETING') {
    return lookupTicketing(supabase, input.locationId, input.query)
  }
  if (input.sourceType === 'PACKAGES') {
    return lookupPackages(supabase, input.locationId, input.query)
  }
  if (input.sourceType === 'APPLICATIONS') {
    return lookupApplications(supabase, input.query, input.catalogueKey)
  }
  return lookupLms(supabase, input.query)
}
