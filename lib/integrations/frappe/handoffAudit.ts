import { getSupabaseClient } from '@/lib/supabaseClient'

export type FrappeHandoffAuditStatus = 'issued' | 'not_linked' | 'unauthorized' | 'failed'
export type FrappeHandoffResponseMode = 'redirect' | 'json'
export type FrappeHandoffClientKind = 'desktop' | 'mobile' | 'standalone' | 'unknown'

type RecordFrappeHandoffEventInput = {
  employeeId?: string | null
  userEmail?: string | null
  frappeEmployeeId?: string | null
  frappeUserId?: string | null
  targetPath: string
  responseMode: FrappeHandoffResponseMode
  clientKind: FrappeHandoffClientKind
  status: FrappeHandoffAuditStatus
  reason?: string | null
  userAgent?: string | null
}

function truncate(value: string | null | undefined, maxLength: number) {
  const text = String(value || '').trim()
  if (!text) return null
  return text.slice(0, maxLength)
}

export function getFrappeHandoffClientKind(request: Request): FrappeHandoffClientKind {
  const url = new URL(request.url)
  const explicitClient = url.searchParams.get('client')
  const explicitStandalone = url.searchParams.get('standalone')

  if (explicitClient === 'standalone' || explicitStandalone === '1') return 'standalone'
  if (explicitClient === 'mobile') return 'mobile'
  if (explicitClient === 'desktop') return 'desktop'

  const userAgent = request.headers.get('user-agent') || ''
  if (/Android|iPhone|iPad|iPod/i.test(userAgent)) return 'mobile'
  if (userAgent) return 'desktop'
  return 'unknown'
}

export async function recordFrappeHandoffEvent(input: RecordFrappeHandoffEventInput) {
  try {
    const supabase = getSupabaseClient()
    const { error } = await supabase.from('frappe_handoff_events').insert({
      employee_id: input.employeeId || null,
      user_email: truncate(input.userEmail, 320),
      frappe_employee_id: truncate(input.frappeEmployeeId, 140),
      frappe_user_id: truncate(input.frappeUserId, 320),
      target_path: truncate(input.targetPath, 500) || '/hrms',
      response_mode: input.responseMode,
      client_kind: input.clientKind,
      status: input.status,
      reason: truncate(input.reason, 500),
      user_agent: truncate(input.userAgent, 500),
    })

    if (error) {
      console.warn('Unable to record Frappe handoff event:', error.message)
    }
  } catch (error) {
    console.warn(
      'Unable to record Frappe handoff event:',
      error instanceof Error ? error.message : error,
    )
  }
}
