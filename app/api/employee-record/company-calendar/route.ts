import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { getSupabaseClient } from '@/lib/supabaseClient'

type UpdateTemplateInput = {
  id: string
  holidayName?: string
  isPaid?: boolean
  countsTowardAnnualLeave?: boolean
  active?: boolean
  notes?: string | null
}

type CreateTemplateInput = {
  holidayName?: string
  isPaid?: boolean
  countsTowardAnnualLeave?: boolean
  active?: boolean
  notes?: string | null
}

type UpdateEventInput = {
  id: string
  eventDate?: string | null
  isPaid?: boolean
  countsTowardAnnualLeave?: boolean
  appliesToAllStaff?: boolean
  notes?: string | null
}

function toIsoDateOrNull(value: unknown) {
  const raw = String(value || '').trim()
  if (!raw) return null
  const parsed = new Date(raw)
  if (Number.isNaN(parsed.getTime())) return null
  return raw
}

function slugifyHolidayName(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export async function GET(request: NextRequest) {
  const auth = await requireAdminSession()
  if (!auth.authorized) return auth.response

  const url = new URL(request.url)
  const month = String(url.searchParams.get('month') || '').trim()

  let start: string | null = null
  let end: string | null = null

  if (month) {
    const parsed = new Date(`${month}-01T00:00:00Z`)
    if (Number.isNaN(parsed.getTime())) {
      return apiError('Invalid month format. Use YYYY-MM.', 400)
    }

    const year = parsed.getUTCFullYear()
    const mon = parsed.getUTCMonth()
    const startDate = new Date(Date.UTC(year, mon, 1))
    const endDate = new Date(Date.UTC(year, mon + 1, 0))

    start = startDate.toISOString().slice(0, 10)
    end = endDate.toISOString().slice(0, 10)
  }

  const supabase = getSupabaseClient()

  const templatesQuery = supabase
    .from('company_holiday_calendar')
    .select('id, holiday_key, holiday_name, is_paid, counts_toward_annual_leave, active, notes')
    .order('holiday_name', { ascending: true })

  const eventsQueryBase = supabase
    .from('company_calendar_events')
    .select('id, company_holiday_id, event_date, is_paid, counts_toward_annual_leave, applies_to_all_staff, notes')
    .order('event_date', { ascending: true })

  const eventsQuery = start && end
    ? eventsQueryBase.gte('event_date', start).lte('event_date', end)
    : eventsQueryBase

  const employeesQuery = supabase
    .from('employees')
    .select('id, full_name, email, is_active')
    .eq('is_active', true)
    .order('full_name', { ascending: true })

  const [templatesResult, eventsResult, employeesResult] = await Promise.all([
    templatesQuery,
    eventsQuery,
    employeesQuery,
  ])

  if (templatesResult.error) {
    return apiError(templatesResult.error.message || 'Failed to load company calendar templates', 500)
  }

  if (eventsResult.error) {
    return apiError(eventsResult.error.message || 'Failed to load company calendar events', 500)
  }

  if (employeesResult.error) {
    return apiError(employeesResult.error.message || 'Failed to load active employees', 500)
  }

  const templates = (templatesResult.data || []).map((row) => ({
    id: row.id,
    holidayKey: row.holiday_key,
    holidayName: row.holiday_name,
    isPaid: row.is_paid,
    countsTowardAnnualLeave: row.counts_toward_annual_leave,
    active: row.active,
    notes: row.notes,
  }))

  const templateById = new Map(
    templates.map((template) => [template.id, template] as const),
  )

  const events = (eventsResult.data || []).map((row) => ({
    id: row.id,
    companyHolidayId: row.company_holiday_id,
    eventDate: row.event_date,
    isPaid: row.is_paid,
    countsTowardAnnualLeave: row.counts_toward_annual_leave,
    appliesToAllStaff: row.applies_to_all_staff,
    notes: row.notes,
    holidayName: templateById.get(row.company_holiday_id)?.holidayName || 'Holiday',
    holidayKey: templateById.get(row.company_holiday_id)?.holidayKey || null,
  }))

  const employees = (employeesResult.data || []).map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
  }))

  const staffOffByDate: Record<string, Array<{ id: string; fullName: string; email: string }>> = {}
  for (const event of events) {
    if (!event.eventDate) continue
    if (!event.appliesToAllStaff) continue
    staffOffByDate[event.eventDate] = employees
  }

  return apiOk({ templates, events, employees, staffOffByDate })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminSession()
  if (!auth.authorized) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    companyHolidayId?: string
    eventDate?: string
    appliesToAllStaff?: boolean
    isPaid?: boolean
    countsTowardAnnualLeave?: boolean
    notes?: string | null
  }

  const companyHolidayId = String(body.companyHolidayId || '').trim()
  const eventDate = toIsoDateOrNull(body.eventDate)

  if (!companyHolidayId) return apiError('companyHolidayId is required', 400)
  if (!eventDate) return apiError('eventDate is required and must be valid', 400)

  const supabase = getSupabaseClient()

  const { data: template, error: templateError } = await supabase
    .from('company_holiday_calendar')
    .select('id, is_paid, counts_toward_annual_leave')
    .eq('id', companyHolidayId)
    .maybeSingle()

  if (templateError) {
    return apiError(templateError.message || 'Failed to load template', 400)
  }

  if (!template) return apiError('Template not found', 404)

  const payload = {
    company_holiday_id: companyHolidayId,
    event_date: eventDate,
    applies_to_all_staff:
      typeof body.appliesToAllStaff === 'boolean' ? body.appliesToAllStaff : true,
    is_paid: typeof body.isPaid === 'boolean' ? body.isPaid : template.is_paid,
    counts_toward_annual_leave:
      typeof body.countsTowardAnnualLeave === 'boolean'
        ? body.countsTowardAnnualLeave
        : template.counts_toward_annual_leave,
    notes: body.notes ?? null,
  }

  const { data, error } = await supabase
    .from('company_calendar_events')
    .upsert(payload, { onConflict: 'company_holiday_id,event_date' })
    .select(
      'id, company_holiday_id, event_date, is_paid, counts_toward_annual_leave, applies_to_all_staff, notes',
    )
    .maybeSingle()

  if (error) {
    return apiError(error.message || 'Failed to create calendar event', 400)
  }

  return apiOk({ event: data })
}

export async function PATCH(request: NextRequest) {
  const auth = await requireAdminSession()
  if (!auth.authorized) return auth.response

  const body = (await request.json().catch(() => ({}))) as {
    templates?: UpdateTemplateInput[]
    createTemplates?: CreateTemplateInput[]
    deleteTemplateIds?: string[]
    events?: UpdateEventInput[]
  }

  const templates = Array.isArray(body.templates) ? body.templates : []
  const createTemplates = Array.isArray(body.createTemplates) ? body.createTemplates : []
  const deleteTemplateIds = Array.isArray(body.deleteTemplateIds) ? body.deleteTemplateIds : []
  const events = Array.isArray(body.events) ? body.events : []

  if (
    templates.length === 0 &&
    createTemplates.length === 0 &&
    deleteTemplateIds.length === 0 &&
    events.length === 0
  ) {
    return apiError('No updates provided', 400)
  }

  const supabase = getSupabaseClient()

  if (templates.length > 0) {
    const rows = templates
      .map((item) => {
        const id = String(item.id || '').trim()
        if (!id) return null
        return {
          id,
          holiday_name: item.holidayName,
          is_paid: item.isPaid,
          counts_toward_annual_leave: item.countsTowardAnnualLeave,
          active: item.active,
          notes: item.notes,
          updated_at: new Date().toISOString(),
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))

    for (const row of rows) {
      const { id, ...updates } = row
      const { error } = await supabase
        .from('company_holiday_calendar')
        .update(updates)
        .eq('id', id)

      if (error) {
        return apiError(error.message || 'Failed to update templates', 400)
      }
    }
  }

  if (createTemplates.length > 0) {
    const rows = createTemplates
      .map((item) => {
        const holidayName = String(item.holidayName || '').trim()
        if (!holidayName) return null

        const keyBase = slugifyHolidayName(holidayName) || 'holiday'
        const uniqueSuffix = Math.random().toString(36).slice(2, 8)

        return {
          holiday_key: `${keyBase}-${uniqueSuffix}`,
          holiday_name: holidayName,
          is_paid: typeof item.isPaid === 'boolean' ? item.isPaid : true,
          counts_toward_annual_leave:
            typeof item.countsTowardAnnualLeave === 'boolean' ? item.countsTowardAnnualLeave : true,
          active: typeof item.active === 'boolean' ? item.active : true,
          notes: item.notes ?? null,
        }
      })
      .filter((row): row is NonNullable<typeof row> => Boolean(row))

    if (rows.length > 0) {
      const { error } = await supabase.from('company_holiday_calendar').insert(rows)
      if (error) {
        return apiError(error.message || 'Failed to create templates', 400)
      }
    }
  }

  if (deleteTemplateIds.length > 0) {
    const ids = deleteTemplateIds
      .map((id) => String(id || '').trim())
      .filter(Boolean)

    if (ids.length > 0) {
      const { error } = await supabase
        .from('company_holiday_calendar')
        .delete()
        .in('id', ids)

      if (error) {
        return apiError(error.message || 'Failed to delete templates', 400)
      }
    }
  }

  if (events.length > 0) {
    const rows: Array<{
      id: string
      event_date?: string | null
      is_paid?: boolean
      counts_toward_annual_leave?: boolean
      applies_to_all_staff?: boolean
      notes?: string | null
      updated_at: string
    }> = []

    for (const item of events) {
      const id = String(item.id || '').trim()
      if (!id) continue

      const eventDate =
        item.eventDate === undefined ? undefined : toIsoDateOrNull(item.eventDate)

      if (item.eventDate !== undefined && !eventDate) {
        return apiError('Invalid event date provided', 400)
      }

      rows.push({
        id,
        event_date: eventDate,
        is_paid: item.isPaid,
        counts_toward_annual_leave: item.countsTowardAnnualLeave,
        applies_to_all_staff: item.appliesToAllStaff,
        notes: item.notes,
        updated_at: new Date().toISOString(),
      })
    }

    if (rows.length > 0) {
      const { error } = await supabase
        .from('company_calendar_events')
        .upsert(rows, { onConflict: 'id' })

      if (error) {
        return apiError(error.message || 'Failed to update calendar events', 400)
      }
    }
  }

  return apiOk({ ok: true })
}

export async function DELETE(request: NextRequest) {
  const auth = await requireAdminSession()
  if (!auth.authorized) return auth.response

  const url = new URL(request.url)
  const eventId = String(url.searchParams.get('eventId') || '').trim()
  if (!eventId) return apiError('eventId is required', 400)

  const supabase = getSupabaseClient()
  const { error } = await supabase.from('company_calendar_events').delete().eq('id', eventId)

  if (error) {
    return apiError(error.message || 'Failed to delete calendar event', 400)
  }

  return apiOk({ ok: true })
}
