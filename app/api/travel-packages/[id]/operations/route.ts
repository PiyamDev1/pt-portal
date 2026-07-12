import { NextRequest } from 'next/server'
import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { recordPackageAuditEvent } from '@/lib/packageAudit'

const SCHEMA_HINT =
  'Package operations are not installed yet. Run scripts/migrations/20260711_create_travel_package_folders.sql, scripts/migrations/20260712_create_travel_package_documents.sql, scripts/migrations/20260712_create_travel_package_invoices.sql, then scripts/migrations/20260712_finalize_travel_package_workflow.sql.'

const RESOURCE_TABLES = {
  task: 'travel_package_tasks',
  deadline: 'travel_package_deadlines',
  risk: 'travel_package_risk_flags',
  communication: 'travel_package_communications',
} as const

type ResourceName = keyof typeof RESOURCE_TABLES

function isSchemaError(error: unknown) {
  const code = (error as { code?: string } | null)?.code
  return code === '42P01' || code === '42703'
}

function cleanText(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function resourceName(value: unknown): ResourceName | null {
  const name = cleanText(value) as ResourceName
  return name in RESOURCE_TABLES ? name : null
}

function createInsertPayload(
  resource: ResourceName,
  packageId: string,
  userId: string,
  body: Record<string, unknown>,
) {
  if (resource === 'task') {
    return {
      package_id: packageId,
      title: cleanText(body.title),
      description: cleanText(body.description) || null,
      task_type: cleanText(body.taskType || body.task_type) || 'general',
      status: 'open',
      priority: cleanText(body.priority) || 'medium',
      assigned_to: cleanText(body.assignedTo || body.assigned_to) || userId,
      due_at: cleanText(body.dueAt || body.due_at) || null,
      auto_generated: false,
      metadata: {},
    }
  }
  if (resource === 'deadline') {
    return {
      package_id: packageId,
      deadline_type: cleanText(body.deadlineType || body.deadline_type) || 'general',
      title: cleanText(body.title),
      due_at: cleanText(body.dueAt || body.due_at),
      status: 'open',
      severity: cleanText(body.severity) || 'medium',
      assigned_to: cleanText(body.assignedTo || body.assigned_to) || userId,
      notes: cleanText(body.notes) || null,
      metadata: {},
    }
  }
  if (resource === 'risk') {
    return {
      package_id: packageId,
      risk_type: cleanText(body.riskType || body.risk_type) || 'manual',
      severity: cleanText(body.severity) || 'medium',
      status: 'open',
      source: 'manual',
      title: cleanText(body.title),
      description: cleanText(body.description) || null,
      assigned_to: cleanText(body.assignedTo || body.assigned_to) || userId,
      due_at: cleanText(body.dueAt || body.due_at) || null,
      metadata: {},
    }
  }
  return {
    package_id: packageId,
    channel: cleanText(body.channel) || 'internal',
    direction: cleanText(body.direction) || 'internal',
    summary: cleanText(body.summary),
    follow_up_required: Boolean(body.followUpRequired || body.follow_up_required),
    follow_up_due_at: cleanText(body.followUpDueAt || body.follow_up_due_at) || null,
    created_by: userId,
    metadata: {},
  }
}

export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const [tasks, deadlines, risks, communications, audit, versions] = await Promise.all([
    supabase
      .from('travel_package_tasks')
      .select('*')
      .eq('package_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('travel_package_deadlines')
      .select('*')
      .eq('package_id', id)
      .order('due_at', { ascending: true }),
    supabase
      .from('travel_package_risk_flags')
      .select('*')
      .eq('package_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('travel_package_communications')
      .select('*')
      .eq('package_id', id)
      .order('created_at', { ascending: false }),
    supabase
      .from('travel_package_audit_events')
      .select('*')
      .eq('package_id', id)
      .order('created_at', { ascending: false })
      .limit(150),
    supabase
      .from('travel_package_versions')
      .select('*')
      .eq('package_id', id)
      .order('created_at', { ascending: false })
      .limit(100),
  ])

  const firstError = [tasks, deadlines, risks, communications, audit, versions].find(
    (result) => result.error,
  )?.error
  if (firstError) {
    if (isSchemaError(firstError)) {
      return apiOk({
        tasks: [],
        deadlines: [],
        risks: [],
        communications: [],
        auditEvents: [],
        versions: [],
        setupRequired: true,
        message: SCHEMA_HINT,
      })
    }
    return apiError(firstError.message || 'Failed to load package operations', 500)
  }

  return apiOk({
    tasks: tasks.data || [],
    deadlines: deadlines.data || [],
    risks: risks.data || [],
    communications: communications.data || [],
    auditEvents: audit.data || [],
    versions: versions.data || [],
    setupRequired: false,
  })
}

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)
  const resource = resourceName(body.resource)
  if (!resource) return apiError('Invalid operation resource', 400)
  const payload = createInsertPayload(resource, id, user.id, body)
  if (
    !cleanText(
      (payload as { title?: unknown; summary?: unknown }).title ||
        (payload as { summary?: unknown }).summary,
    )
  ) {
    return apiError(
      resource === 'communication' ? 'Communication summary is required' : 'Title is required',
      400,
    )
  }
  if (resource === 'deadline' && !cleanText((payload as { due_at?: unknown }).due_at)) {
    return apiError('Deadline date and time is required', 400)
  }

  const { data, error } = await supabase
    .from(RESOURCE_TABLES[resource])
    .insert(payload)
    .select('*')
    .single()
  if (error || !data) {
    if (isSchemaError(error)) return apiError(SCHEMA_HINT, 503)
    return apiError(error?.message || `Failed to create ${resource}`, 500)
  }

  if (resource === 'communication' && payload.follow_up_required) {
    await supabase.from('travel_package_tasks').insert({
      package_id: id,
      title: `Follow up: ${payload.summary}`,
      description: `Follow-up created from ${payload.channel} communication.`,
      task_type: 'customer_follow_up',
      priority: 'medium',
      assigned_to: user.id,
      due_at: payload.follow_up_due_at,
      auto_generated: true,
      source_rule: 'communication_follow_up',
    })
  }

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: `${resource}_created`,
      eventSummary: `${resource[0].toUpperCase()}${resource.slice(1)} created.`,
      afterData: data,
    },
  )
  return apiOk({ resource, item: data }, { status: 201 })
}

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return apiError('Unauthorized', 401)

  const body = (await request.json().catch(() => null)) as Record<string, unknown> | null
  if (!body) return apiError('Invalid JSON body', 400)
  const resource = resourceName(body.resource)
  const resourceId = cleanText(body.resourceId || body.resource_id)
  if (!resource || !resourceId) return apiError('Resource and resource ID are required', 400)

  const table = RESOURCE_TABLES[resource]
  const { data: before } = await supabase
    .from(table)
    .select('*')
    .eq('id', resourceId)
    .eq('package_id', id)
    .single()
  if (!before) return apiError(`${resource} not found`, 404)

  const update: Record<string, unknown> = {}
  if (resource === 'task') {
    if ('status' in body) update.status = cleanText(body.status)
    if ('priority' in body) update.priority = cleanText(body.priority)
    if ('dueAt' in body || 'due_at' in body)
      update.due_at = cleanText(body.dueAt ?? body.due_at) || null
    if (update.status === 'completed') {
      update.completed_at = new Date().toISOString()
      update.completed_by = user.id
    }
  } else if (resource === 'deadline') {
    if ('status' in body) update.status = cleanText(body.status)
    if ('dueAt' in body || 'due_at' in body) update.due_at = cleanText(body.dueAt ?? body.due_at)
    if (['met', 'missed', 'cancelled'].includes(String(update.status))) {
      update.resolved_at = new Date().toISOString()
      update.resolved_by = user.id
    }
  } else if (resource === 'risk') {
    if ('status' in body) update.status = cleanText(body.status)
    if ('resolutionNote' in body || 'resolution_note' in body) {
      update.resolution_note = cleanText(body.resolutionNote ?? body.resolution_note) || null
    }
    if (update.status === 'acknowledged') {
      update.acknowledged_at = new Date().toISOString()
      update.acknowledged_by = user.id
    }
    if (update.status === 'resolved') {
      update.resolved_at = new Date().toISOString()
      update.resolved_by = user.id
    }
  } else {
    return apiError('Communication entries are immutable; add a correction note instead', 409)
  }

  const { data, error } = await supabase
    .from(table)
    .update(update)
    .eq('id', resourceId)
    .eq('package_id', id)
    .select('*')
    .single()
  if (error || !data) return apiError(error?.message || `Failed to update ${resource}`, 500)

  await recordPackageAuditEvent(
    supabase as unknown as Parameters<typeof recordPackageAuditEvent>[0],
    {
      packageId: id,
      actorId: user.id,
      eventType: `${resource}_updated`,
      eventSummary: `${resource[0].toUpperCase()}${resource.slice(1)} updated.`,
      beforeData: before,
      afterData: data,
    },
  )
  return apiOk({ resource, item: data })
}
