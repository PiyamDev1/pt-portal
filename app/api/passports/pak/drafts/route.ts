import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getSupabaseClient } from '@/lib/supabaseClient'
import {
  generatePakPassportDraftId,
  isDuplicateTrackingError,
  isPakPassportDraftPaymentStatus,
  isPakPassportDraftStatus,
  normalizeOfficialTrackingNumber,
  splitApplicantName,
  type PakPassportDraftPaymentStatus,
  type PakPassportDraftStatus,
} from '@/lib/passports/pakDrafts'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const DRAFT_SELECT = `
  id,
  draft_id,
  applicant_id,
  applicant_name,
  applicant_cnic,
  applicant_email,
  applicant_phone,
  family_head_email,
  application_type,
  category,
  page_count,
  speed,
  old_passport_number,
  fingerprints_completed,
  requested_page_number,
  requested_page_provided,
  notes,
  status,
  payment_status,
  payment_amount,
  payment_note,
  payment_refunded_at,
  assigned_employee_id,
  created_by,
  updated_by,
  sent_to_external_at,
  converted_application_id,
  converted_by,
  converted_at,
  official_tracking_number,
  cancelled_at,
  cancelled_by,
  cancellation_reason,
  created_at,
  updated_at,
  assigned_employee:employees!pakistani_passport_drafts_assigned_employee_id_fkey(id, full_name),
  created_by_employee:employees!pakistani_passport_drafts_created_by_fkey(id, full_name)
`

const MAX_DRAFT_ID_ATTEMPTS = 5

type DraftRow = {
  id: string
  draft_id: string
  applicant_id?: string | null
  applicant_name: string
  applicant_cnic: string
  applicant_email?: string | null
  applicant_phone?: string | null
  family_head_email: string
  application_type: string
  category: string
  page_count?: string | null
  speed: string
  old_passport_number?: string | null
  fingerprints_completed?: boolean | null
  requested_page_number?: string | null
  requested_page_provided?: boolean | null
  notes?: string | null
  status: PakPassportDraftStatus
  payment_status?: PakPassportDraftPaymentStatus | null
  payment_amount?: number | string | null
  payment_note?: string | null
  converted_application_id?: string | null
  created_by?: string | null
}

function cleanPayload(payload: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
}

function cleanText(value: unknown) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
}

function nullableText(value: unknown) {
  const cleaned = cleanText(value)
  return cleaned || null
}

function normalizePaymentAmount(value: unknown) {
  if (value === null || value === undefined || value === '') return null
  const amount = Number(value)
  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error('Payment amount must be a valid positive number')
  }
  return amount
}

function normalizeCreatePayload(body: Record<string, unknown>) {
  const applicantName = cleanText(body.applicantName)
  const applicantCnic = cleanText(body.applicantCnic)
  const familyHeadEmail = cleanText(body.familyHeadEmail)
  const applicationType = cleanText(body.applicationType)
  const category = cleanText(body.category)
  const speed = cleanText(body.speed)
  const currentUserId = cleanText(body.currentUserId || body.userId)

  if (!applicantName) throw new Error('Applicant name is required')
  if (!applicantCnic) throw new Error('Applicant CNIC is required')
  if (!familyHeadEmail) throw new Error('Family head email is required')
  if (!applicationType) throw new Error('Application type is required')
  if (!category) throw new Error('Category is required')
  if (!speed) throw new Error('Speed is required')
  if (!currentUserId) throw new Error('Current user is required')

  const paymentStatus = cleanText(body.paymentStatus || 'unknown')
  if (!isPakPassportDraftPaymentStatus(paymentStatus)) {
    throw new Error('Invalid payment status')
  }

  const status = cleanText(body.status || 'Documents Pending')
  if (!isPakPassportDraftStatus(status)) {
    throw new Error('Invalid draft status')
  }

  return {
    currentUserId,
    payload: {
      applicant_name: applicantName,
      applicant_cnic: applicantCnic,
      applicant_email: nullableText(body.applicantEmail),
      applicant_phone: nullableText(body.applicantPhone),
      family_head_email: familyHeadEmail,
      application_type: applicationType,
      category,
      page_count: nullableText(body.pageCount),
      speed,
      old_passport_number: nullableText(body.oldPassportNumber)?.toUpperCase() || null,
      fingerprints_completed: !!body.fingerprintsCompleted,
      requested_page_number: nullableText(body.requestedPageNumber),
      requested_page_provided:
        !!body.requestedPageProvided && !!nullableText(body.requestedPageNumber),
      notes: nullableText(body.notes),
      status,
      payment_status: paymentStatus,
      payment_amount: normalizePaymentAmount(body.paymentAmount),
      payment_note: nullableText(body.paymentNote),
      payment_refunded_at: paymentStatus === 'refunded' ? new Date().toISOString() : null,
      assigned_employee_id: nullableText(body.assignedEmployeeId),
      created_by: currentUserId,
      updated_by: currentUserId,
    },
  }
}

function normalizeUpdatePayload(body: Record<string, unknown>) {
  const data = (body.data || body) as Record<string, unknown>
  const currentUserId = cleanText(body.currentUserId || body.userId)
  if (!currentUserId) throw new Error('Current user is required')

  const payload: Record<string, unknown> = {
    updated_by: currentUserId,
  }

  if ('applicantName' in data) payload.applicant_name = cleanText(data.applicantName)
  if ('applicantCnic' in data) payload.applicant_cnic = cleanText(data.applicantCnic)
  if ('applicantEmail' in data) payload.applicant_email = nullableText(data.applicantEmail)
  if ('applicantPhone' in data) payload.applicant_phone = nullableText(data.applicantPhone)
  if ('familyHeadEmail' in data) payload.family_head_email = cleanText(data.familyHeadEmail)
  if ('applicationType' in data) payload.application_type = cleanText(data.applicationType)
  if ('category' in data) payload.category = cleanText(data.category)
  if ('pageCount' in data) payload.page_count = nullableText(data.pageCount)
  if ('speed' in data) payload.speed = cleanText(data.speed)
  if ('oldPassportNumber' in data) {
    payload.old_passport_number = nullableText(data.oldPassportNumber)?.toUpperCase() || null
  }
  if ('fingerprintsCompleted' in data) payload.fingerprints_completed = !!data.fingerprintsCompleted
  if ('requestedPageNumber' in data) {
    payload.requested_page_number = nullableText(data.requestedPageNumber)
    payload.requested_page_provided =
      !!data.requestedPageProvided && !!nullableText(data.requestedPageNumber)
  }
  if ('notes' in data) payload.notes = nullableText(data.notes)
  if ('assignedEmployeeId' in data)
    payload.assigned_employee_id = nullableText(data.assignedEmployeeId)

  if ('status' in data) {
    const status = cleanText(data.status)
    if (!isPakPassportDraftStatus(status)) throw new Error('Invalid draft status')
    payload.status = status
    if (status === 'With External Staff') {
      payload.sent_to_external_at = new Date().toISOString()
    }
  }

  if ('paymentStatus' in data) {
    const paymentStatus = cleanText(data.paymentStatus)
    if (!isPakPassportDraftPaymentStatus(paymentStatus)) {
      throw new Error('Invalid payment status')
    }
    payload.payment_status = paymentStatus
    payload.payment_refunded_at = paymentStatus === 'refunded' ? new Date().toISOString() : null
  }

  if ('paymentAmount' in data) payload.payment_amount = normalizePaymentAmount(data.paymentAmount)
  if ('paymentNote' in data) payload.payment_note = nullableText(data.paymentNote)

  return cleanPayload(payload)
}

async function fetchDocumentCounts(
  supabase: ReturnType<typeof getSupabaseClient>,
  draftIds: string[],
) {
  if (draftIds.length === 0) return {}

  const { data, error } = await supabase
    .from('documents')
    .select('family_head_id')
    .in('family_head_id', draftIds)
    .eq('deleted', false)
    .neq('category', 'zip-archive')

  if (error) throw error

  return (data || []).reduce<Record<string, number>>(
    (acc, row: { family_head_id?: string | null }) => {
      const key = row.family_head_id
      if (!key) return acc
      acc[key] = (acc[key] || 0) + 1
      return acc
    },
    {},
  )
}

async function createDraft(body: Record<string, unknown>) {
  const supabase = getSupabaseClient()
  const { payload } = normalizeCreatePayload(body)

  let lastError: unknown = null
  for (let attempt = 0; attempt < MAX_DRAFT_ID_ATTEMPTS; attempt += 1) {
    const draftId = generatePakPassportDraftId()
    const { data, error } = await supabase
      .from('pakistani_passport_drafts')
      .insert({ ...payload, draft_id: draftId })
      .select(DRAFT_SELECT)
      .single()

    if (!error && data) {
      return apiOk({ draft: data })
    }

    lastError = error
    if ((error as { code?: string } | null)?.code !== '23505') {
      break
    }
  }

  throw lastError || new Error('Failed to create draft')
}

async function updateDraft(body: Record<string, unknown>) {
  const supabase = getSupabaseClient()
  const draftId = cleanText(body.draftId || body.id)
  if (!draftId) return apiError('Draft ID is required', 400)

  const payload = normalizeUpdatePayload(body)
  const { data, error } = await supabase
    .from('pakistani_passport_drafts')
    .update(payload)
    .eq('id', draftId)
    .select(DRAFT_SELECT)
    .single()

  if (error) throw error
  return apiOk({ draft: data })
}

async function cancelDraft(body: Record<string, unknown>) {
  const supabase = getSupabaseClient()
  const draftId = cleanText(body.draftId || body.id)
  const currentUserId = cleanText(body.currentUserId || body.userId)

  if (!draftId) return apiError('Draft ID is required', 400)
  if (!currentUserId) return apiError('Current user is required', 400)

  const { data, error } = await supabase
    .from('pakistani_passport_drafts')
    .update({
      status: 'Cancelled',
      cancelled_at: new Date().toISOString(),
      cancelled_by: currentUserId,
      cancellation_reason: nullableText(body.reason || body.cancellationReason),
      updated_by: currentUserId,
    })
    .eq('id', draftId)
    .select(DRAFT_SELECT)
    .single()

  if (error) throw error
  return apiOk({ draft: data })
}

async function convertDraft(body: Record<string, unknown>) {
  const supabase = getSupabaseClient()
  const draftId = cleanText(body.draftId || body.id)
  const currentUserId = cleanText(body.currentUserId || body.userId)
  const trackingNumber = normalizeOfficialTrackingNumber(body.trackingNumber)

  if (!draftId) return apiError('Draft ID is required', 400)
  if (!currentUserId) return apiError('Current user is required', 400)
  if (!trackingNumber) return apiError('Tracking number is required', 400)

  const { data: draft, error: draftError } = await supabase
    .from('pakistani_passport_drafts')
    .select('*')
    .eq('id', draftId)
    .single<DraftRow>()

  if (draftError || !draft) return apiError('Draft not found', 404)
  if (draft.status === 'Cancelled') return apiError('Cancelled drafts cannot be converted', 409)
  if (draft.converted_application_id) return apiError('Draft is already converted', 409)

  const { data: existingApplication, error: existingError } = await supabase
    .from('applications')
    .select('id')
    .eq('tracking_number', trackingNumber)
    .maybeSingle()

  if (existingError) throw existingError
  if (existingApplication?.id) {
    return apiError('Duplicate Tracking Number', 409, {
      details: 'This tracking number already exists.',
      errorCode: 'DUPLICATE_TRACKING',
      existingApplicationId: existingApplication.id,
      trackingNumber,
    })
  }

  let applicantId = draft.applicant_id || null
  if (!applicantId) {
    const { data: existingApplicant, error: applicantLookupError } = await supabase
      .from('applicants')
      .select('id, email, phone_number')
      .eq('citizen_number', draft.applicant_cnic)
      .maybeSingle()

    if (applicantLookupError) throw applicantLookupError

    if (existingApplicant?.id) {
      applicantId = existingApplicant.id
      await supabase
        .from('applicants')
        .update({
          email: draft.applicant_email || existingApplicant.email || null,
          phone_number: draft.applicant_phone || existingApplicant.phone_number || null,
        })
        .eq('id', existingApplicant.id)
    } else {
      const { firstName, lastName } = splitApplicantName(draft.applicant_name)
      const { data: newApplicant, error: newApplicantError } = await supabase
        .from('applicants')
        .insert({
          first_name: firstName,
          last_name: lastName,
          citizen_number: draft.applicant_cnic,
          email: draft.applicant_email || null,
          phone_number: draft.applicant_phone || null,
        })
        .select('id')
        .single()

      if (newApplicantError) throw newApplicantError
      applicantId = newApplicant.id
    }
  }

  const { data: application, error: applicationError } = await supabase
    .from('applications')
    .insert({
      tracking_number: trackingNumber,
      family_head_id: applicantId,
      applicant_id: applicantId,
      submitted_by_employee_id: currentUserId || draft.created_by,
      status: 'Pending Submission',
    })
    .select('id')
    .single()

  if (applicationError) {
    if (isDuplicateTrackingError(applicationError)) {
      return apiError('Duplicate Tracking Number', 409, {
        details: 'This tracking number already exists.',
        errorCode: 'DUPLICATE_TRACKING',
        trackingNumber,
      })
    }
    throw applicationError
  }

  const applicationId = application.id

  try {
    const { data: passportApplication, error: passportError } = await supabase
      .from('pakistani_passport_applications')
      .insert({
        application_id: applicationId,
        applicant_id: applicantId,
        employee_id: currentUserId || draft.created_by,
        family_head_email: draft.family_head_email,
        application_type: draft.application_type,
        category: draft.category,
        page_count: draft.page_count,
        speed: draft.speed,
        old_passport_number: draft.old_passport_number || null,
        is_old_passport_returned: false,
        is_refunded: false,
        fingerprints_completed: !!draft.fingerprints_completed,
        requested_page_number: draft.requested_page_number || null,
        requested_page_provided: !!draft.requested_page_provided && !!draft.requested_page_number,
        status: 'Pending Submission',
      })
      .select('id')
      .single()

    if (passportError) throw passportError

    const { error: documentError } = await supabase
      .from('documents')
      .update({ family_head_id: applicationId })
      .eq('family_head_id', draft.draft_id)

    if (documentError) throw documentError

    const { data: convertedDraft, error: updateDraftError } = await supabase
      .from('pakistani_passport_drafts')
      .update({
        status: 'Converted',
        converted_at: new Date().toISOString(),
        converted_by: currentUserId,
        converted_application_id: applicationId,
        official_tracking_number: trackingNumber,
        applicant_id: applicantId,
        updated_by: currentUserId,
      })
      .eq('id', draft.id)
      .select(DRAFT_SELECT)
      .single()

    if (updateDraftError) {
      await supabase
        .from('documents')
        .update({ family_head_id: draft.draft_id })
        .eq('family_head_id', applicationId)
      throw updateDraftError
    }

    return apiOk({
      convertedDraftId: draft.id,
      draftId: draft.draft_id,
      applicationId,
      passportApplicationId: passportApplication.id,
      trackingNumber,
      draft: convertedDraft,
    })
  } catch (conversionError) {
    await supabase.from('applications').delete().eq('id', applicationId)
    throw conversionError
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient()
    const { searchParams } = new URL(request.url)
    const includeClosed = searchParams.get('includeClosed') === 'true'

    let query = supabase
      .from('pakistani_passport_drafts')
      .select(DRAFT_SELECT)
      .order('updated_at', { ascending: false })
      .limit(1000)

    if (!includeClosed) {
      query = query.not('status', 'in', '("Converted","Cancelled")')
    }

    const { data, error } = await query
    if (error) throw error

    const drafts = data || []
    const documentCounts = await fetchDocumentCounts(
      supabase,
      drafts.map((draft: { draft_id: string }) => draft.draft_id),
    )

    return apiOk({ drafts, documentCounts })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to load Pakistani passport drafts'), 500)
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = (await request.json()) as Record<string, unknown>
    const action = cleanText(body.action || 'create')

    if (action === 'create') return createDraft(body)
    if (action === 'update') return updateDraft(body)
    if (action === 'cancel') return cancelDraft(body)
    if (action === 'convert') return convertDraft(body)

    return apiError('Invalid action', 400)
  } catch (error) {
    const message = toErrorMessage(error, 'Pakistani passport draft action failed')
    const status = message.includes('required') || message.includes('Invalid') ? 400 : 500
    return apiError(message, status)
  }
}
