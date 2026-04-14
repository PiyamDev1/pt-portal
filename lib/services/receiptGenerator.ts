/**
 * Module: lib/services/receiptGenerator.ts
 * Receipt generation engine for NADRA and passport workflows.
 */

import { createClient } from '@supabase/supabase-js'
import QRCode from 'qrcode'
import {
  RECEIPT_COMPANY_NAME,
  RECEIPT_DEFAULT_CURRENCY,
  RECEIPT_PIN_LENGTH,
  RECEIPT_VERIFY_BASE_URL,
} from '@/lib/constants/receiptConfig'
import { buildReceiptPlainText } from './receiptTemplates'
import { persistGeneratedReceipt } from './receiptStore'

export type ReceiptServiceType = 'nadra' | 'pk_passport' | 'gb_passport'
export type ReceiptType = 'submission' | 'biometrics' | 'refund' | 'collection'

type GenerateReceiptParams = {
  serviceType: ReceiptServiceType
  serviceRecordId: string
  receiptType: ReceiptType
  generatedBy?: string | null
}

type ResolvedSourceData = {
  applicationId: string
  applicantId: string
  applicantName: string
  familyHeadName: string | null
  contactNumber: string | null
  serviceName: string | null
  processingSpeed: string | null
  phone: string | null
  email: string | null
  trackingNumber: string | null
  applicationPin: string | null
  serviceDescription: string | null
  costPrice: number | null
  salePrice: number | null
}

export interface GeneratedReceipt {
  id: string
  receiptNumber: string
  applicationId: string
  applicantId: string
  applicantName: string
  familyHeadName: string | null
  contactNumber: string | null
  serviceName: string | null
  processingSpeed: string | null
  phone: string | null
  email: string | null
  serviceType: ReceiptServiceType
  receiptType: ReceiptType
  trackingNumber: string | null
  applicationPin: string | null
  receiptPin: string
  pricing: {
    serviceDescription: string | null
    costPrice: number | null
    salePrice: number | null
    currency: string
  }
  generatedAt: string
  generatedBy: string | null
  companyName: string
  verificationUrl: string | null
  qrCodeDataUrl: string | null
  plainText: string
}

function getSupabaseAdminClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !serviceRoleKey) {
    throw new Error('Missing Supabase environment variables for receipt generation')
  }

  return createClient(url, serviceRoleKey)
}

function toNumeric(value: unknown) {
  const n = Number(value)
  return Number.isFinite(n) ? n : null
}

async function fetchFamilyHeadInfo(
  supabase: ReturnType<typeof getSupabaseAdminClient>,
  applicationId: string,
) {
  const { data: application } = await supabase
    .from('applications')
    .select('family_head_id')
    .eq('id', applicationId)
    .maybeSingle()

  if (!application?.family_head_id) {
    return { familyHeadName: null, contactNumber: null }
  }

  const { data: head } = await supabase
    .from('applicants')
    .select('first_name, last_name, phone_number')
    .eq('id', application.family_head_id)
    .maybeSingle()

  const fullName = `${head?.first_name || ''} ${head?.last_name || ''}`.trim() || null
  return {
    familyHeadName: fullName,
    contactNumber: head?.phone_number || null,
  }
}

function generatePin(length = RECEIPT_PIN_LENGTH) {
  let pin = ''
  for (let i = 0; i < length; i += 1) {
    pin += Math.floor(Math.random() * 10).toString()
  }
  return pin
}

function buildVerificationUrl(trackingNumber: string | null, receiptPin: string) {
  if (!RECEIPT_VERIFY_BASE_URL || !trackingNumber) return null
  const base = RECEIPT_VERIFY_BASE_URL.replace(/\/$/, '')
  return `${base}/receipts/verify?trackingNumber=${encodeURIComponent(trackingNumber)}&pin=${encodeURIComponent(receiptPin)}`
}

function buildApplicationBoundReceiptNumber(applicationId: string, generatedAt: string, receiptPin: string) {
  const appToken = applicationId.replace(/-/g, '').slice(0, 8).toUpperCase() || 'APP'
  const date = new Date(generatedAt)
  const dateToken = Number.isNaN(date.getTime())
    ? generatedAt.slice(2, 10).replace(/-/g, '')
    : `${date.getUTCFullYear().toString().slice(-2)}${String(date.getUTCMonth() + 1).padStart(2, '0')}${String(date.getUTCDate()).padStart(2, '0')}`
  return `RC-${appToken}-${dateToken}-${receiptPin}`
}

async function resolveNadraData(serviceRecordId: string): Promise<ResolvedSourceData> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('nadra_services')
    .select(
      `
      id,
      application_id,
      applicant_id,
      service_type,
      tracking_number,
      application_pin,
      applicants(first_name, last_name, phone_number, email),
      nicop_cnic_details(service_option)
    `,
    )
    .eq('id', serviceRecordId)
    .single()

  if (error || !data) throw new Error('NADRA service not found for receipt')

  const applicant = Array.isArray(data.applicants) ? data.applicants[0] : data.applicants
  const serviceDetail = Array.isArray(data.nicop_cnic_details)
    ? data.nicop_cnic_details[0]
    : data.nicop_cnic_details

  const first = applicant?.first_name || ''
  const last = applicant?.last_name || ''
  const applicantName = `${first} ${last}`.trim()
  const serviceOption = serviceDetail?.service_option || null

  let costPrice = null
  let salePrice = null
  if (data.service_type) {
    let pricingQuery = supabase
      .from('nadra_pricing')
      .select('cost_price, sale_price')
      .eq('service_type', data.service_type)
      .eq('is_active', true)
      .limit(1)

    if (serviceOption) {
      pricingQuery = pricingQuery.eq('service_option', serviceOption)
    }

    const { data: pricing } = await pricingQuery.maybeSingle()
    costPrice = toNumeric(pricing?.cost_price)
    salePrice = toNumeric(pricing?.sale_price)
  }

  const familyHead = await fetchFamilyHeadInfo(supabase, data.application_id)

  return {
    applicationId: data.application_id,
    applicantId: data.applicant_id,
    applicantName,
    familyHeadName: familyHead.familyHeadName,
    contactNumber: familyHead.contactNumber || applicant?.phone_number || null,
    serviceName: data.service_type || 'NADRA',
    processingSpeed: serviceOption || 'Standard',
    phone: applicant?.phone_number || null,
    email: applicant?.email || null,
    trackingNumber: data.tracking_number || null,
    applicationPin: data.application_pin || null,
    serviceDescription: serviceOption ? `${data.service_type || 'NADRA'} - ${serviceOption}` : data.service_type,
    costPrice,
    salePrice,
  }
}

async function resolvePkPassportData(serviceRecordId: string): Promise<ResolvedSourceData> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('pakistani_passport_applications')
    .select(
      `
      id,
      application_id,
      applicant_id,
      application_type,
      category,
      speed,
      page_count,
      applications(tracking_number),
      applicants(first_name, last_name, phone_number, email)
    `,
    )
    .eq('id', serviceRecordId)
    .single()

  if (error || !data) throw new Error('Pakistani passport application not found for receipt')

  const applicant = Array.isArray(data.applicants) ? data.applicants[0] : data.applicants
  const application = Array.isArray(data.applications) ? data.applications[0] : data.applications

  const first = applicant?.first_name || ''
  const last = applicant?.last_name || ''
  const applicantName = `${first} ${last}`.trim()

  const { data: pricing } = await supabase
    .from('pk_passport_pricing')
    .select('cost_price, sale_price')
    .eq('application_type', data.application_type)
    .eq('category', data.category)
    .eq('speed', data.speed)
    .eq('pages', data.page_count)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle()

  const familyHead = await fetchFamilyHeadInfo(supabase, data.application_id)

  return {
    applicationId: data.application_id,
    applicantId: data.applicant_id,
    applicantName,
    familyHeadName: familyHead.familyHeadName,
    contactNumber: familyHead.contactNumber || applicant?.phone_number || null,
    serviceName: data.application_type || 'Pakistani Passport',
    processingSpeed: data.speed || 'Standard',
    phone: applicant?.phone_number || null,
    email: applicant?.email || null,
    trackingNumber: application?.tracking_number || null,
    applicationPin: null,
    serviceDescription: [data.application_type, data.category, data.speed, data.page_count]
      .filter(Boolean)
      .join(' / '),
    costPrice: toNumeric(pricing?.cost_price),
    salePrice: toNumeric(pricing?.sale_price),
  }
}

async function resolveGbPassportData(serviceRecordId: string): Promise<ResolvedSourceData> {
  const supabase = getSupabaseAdminClient()
  const { data, error } = await supabase
    .from('british_passport_applications')
    .select(
      `
      id,
      application_id,
      applicant_id,
      age_group,
      pages,
      service_type,
      cost_price,
      sale_price,
      applications(tracking_number),
      applicants(first_name, last_name, phone_number, email)
    `,
    )
    .eq('id', serviceRecordId)
    .single()

  if (error || !data) throw new Error('British passport application not found for receipt')

  const applicant = Array.isArray(data.applicants) ? data.applicants[0] : data.applicants
  const application = Array.isArray(data.applications) ? data.applications[0] : data.applications

  const first = applicant?.first_name || ''
  const last = applicant?.last_name || ''
  const applicantName = `${first} ${last}`.trim()

  const familyHead = await fetchFamilyHeadInfo(supabase, data.application_id)

  return {
    applicationId: data.application_id,
    applicantId: data.applicant_id,
    applicantName,
    familyHeadName: familyHead.familyHeadName,
    contactNumber: familyHead.contactNumber || applicant?.phone_number || null,
    serviceName: 'British Passport',
    processingSpeed: data.service_type || 'Standard',
    phone: applicant?.phone_number || null,
    email: applicant?.email || null,
    trackingNumber: application?.tracking_number || null,
    applicationPin: null,
    serviceDescription: [data.age_group, data.service_type, data.pages].filter(Boolean).join(' / '),
    costPrice: toNumeric(data.cost_price),
    salePrice: toNumeric(data.sale_price),
  }
}

async function resolveSourceData(serviceType: ReceiptServiceType, serviceRecordId: string) {
  if (serviceType === 'nadra') return resolveNadraData(serviceRecordId)
  if (serviceType === 'pk_passport') return resolvePkPassportData(serviceRecordId)
  return resolveGbPassportData(serviceRecordId)
}

export async function generateReceipt(params: GenerateReceiptParams): Promise<GeneratedReceipt> {
  const source = await resolveSourceData(params.serviceType, params.serviceRecordId)
  const receiptPin = generatePin()
  const verificationUrl = buildVerificationUrl(source.trackingNumber, receiptPin)
  const qrPayload =
    verificationUrl ||
    [
      source.serviceName || params.serviceType,
      source.trackingNumber ? `Tracking: ${source.trackingNumber}` : null,
      `PIN: ${receiptPin}`,
    ]
      .filter(Boolean)
      .join(' | ')

  let qrCodeDataUrl: string | null = null
  try {
    qrCodeDataUrl = await QRCode.toDataURL(qrPayload)
  } catch (error) {
    console.warn('[Receipt] QR generation failed:', error)
  }
  const generatedAt = new Date().toISOString()
  const receiptNumber = buildApplicationBoundReceiptNumber(source.applicationId, generatedAt, receiptPin)

  const receipt: GeneratedReceipt = {
    id: crypto.randomUUID(),
    receiptNumber,
    applicationId: source.applicationId,
    applicantId: source.applicantId,
    applicantName: source.applicantName,
    familyHeadName: source.familyHeadName,
    contactNumber: source.contactNumber,
    serviceName: source.serviceName,
    processingSpeed: source.processingSpeed,
    phone: source.phone,
    email: source.email,
    serviceType: params.serviceType,
    receiptType: params.receiptType,
    trackingNumber: source.trackingNumber,
    applicationPin: source.applicationPin,
    receiptPin,
    pricing: {
      serviceDescription: source.serviceDescription,
      costPrice: source.costPrice,
      salePrice: source.salePrice,
      currency: RECEIPT_DEFAULT_CURRENCY,
    },
    generatedAt,
    generatedBy: params.generatedBy || null,
    companyName: RECEIPT_COMPANY_NAME,
    verificationUrl,
    qrCodeDataUrl,
    plainText: '',
  }

  receipt.plainText = buildReceiptPlainText(receipt)

  // Persist best-effort so verify/list APIs can work when schema is available.
  const persistResult = await persistGeneratedReceipt({
    receipt,
    serviceRecordId: params.serviceRecordId,
  })
  if (!persistResult.persisted && persistResult.reason) {
    console.warn('[Receipt] Persistence skipped:', persistResult.reason)
  }

  return receipt
}

type StatusTriggerParams = {
  serviceType: ReceiptServiceType
  serviceRecordId: string
  status?: string | null
  isRefunded?: boolean
  generatedBy?: string | null
}

function normalizeStatus(status: string | null | undefined) {
  return String(status || '')
    .trim()
    .toLowerCase()
}

export async function tryGenerateReceiptForStatusTrigger({
  serviceType,
  serviceRecordId,
  status,
  isRefunded,
  generatedBy,
}: StatusTriggerParams) {
  const normalized = normalizeStatus(status)

  let receiptType: ReceiptType | null = null

  if (isRefunded) {
    receiptType = 'refund'
  } else if (serviceType === 'nadra' && normalized === 'submitted') {
    receiptType = 'submission'
  } else if (serviceType === 'pk_passport' && normalized === 'biometrics taken') {
    receiptType = 'biometrics'
  } else if (serviceType === 'pk_passport' && normalized === 'collected') {
    receiptType = 'collection'
  } else if (serviceType === 'gb_passport' && normalized === 'pending submission') {
    receiptType = 'submission'
  }

  if (!receiptType) return null

  try {
    return await generateReceipt({
      serviceType,
      serviceRecordId,
      receiptType,
      generatedBy,
    })
  } catch (error) {
    console.warn('[Receipt] Auto-generation failed:', error)
    return null
  }
}
