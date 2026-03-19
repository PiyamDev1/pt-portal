import { getSupabaseClient } from '@/lib/supabaseClient'

export type MigrationTrigger = 'status' | 'read' | 'manual' | 'cron' | 'unknown'

export type StoredMigrationEvent = {
  id: string
  event_type: 'attempt' | 'success' | 'failure' | 'batch'
  outcome: 'success' | 'failure' | 'info'
  object_key: string | null
  attempted: number | null
  migrated: number | null
  trigger_source: string | null
  error_message: string | null
  created_at: string
}

type StoredMigrationEventRow = {
  id: string
  event_type: 'attempt' | 'success' | 'failure' | 'batch'
  outcome: 'success' | 'failure' | 'info'
  object_key: string | null
  attempted: number | null
  migrated: number | null
  trigger_source: string | null
  error_message: string | null
  created_at: string
}

async function insertEvent(payload: Record<string, unknown>) {
  try {
    const supabase = getSupabaseClient()
    await supabase.from('document_migration_runs').insert(payload)
  } catch {
    // Non-fatal: table may not exist yet or DB may be temporarily unavailable.
  }
}

export async function recordPersistentMigrationAttempt(key: string, trigger: MigrationTrigger) {
  await insertEvent({
    event_type: 'attempt',
    outcome: 'info',
    object_key: key,
    trigger_source: trigger,
  })
}

export async function recordPersistentMigrationSuccess(key: string, trigger: MigrationTrigger) {
  await insertEvent({
    event_type: 'success',
    outcome: 'success',
    object_key: key,
    trigger_source: trigger,
  })
}

export async function recordPersistentMigrationFailure(
  key: string,
  trigger: MigrationTrigger,
  errorMessage: string,
) {
  await insertEvent({
    event_type: 'failure',
    outcome: 'failure',
    object_key: key,
    trigger_source: trigger,
    error_message: errorMessage,
  })
}

export async function recordPersistentMigrationBatch(
  attempted: number,
  migrated: number,
  trigger: MigrationTrigger,
) {
  await insertEvent({
    event_type: 'batch',
    outcome: migrated === attempted ? 'success' : attempted === 0 ? 'info' : 'failure',
    attempted,
    migrated,
    trigger_source: trigger,
  })
}

export async function getPersistentMigrationEvents(
  limit: number = 30,
): Promise<StoredMigrationEvent[]> {
  try {
    const supabase = getSupabaseClient()
    const { data } = await supabase
      .from('document_migration_runs')
      .select(
        'id, event_type, outcome, object_key, attempted, migrated, trigger_source, error_message, created_at',
      )
      .order('created_at', { ascending: false })
      .limit(Math.max(1, Math.min(100, limit)))

    return Array.isArray(data) ? (data as StoredMigrationEventRow[]) : []
  } catch {
    return []
  }
}
