/**
 * Document Migration Metrics
 * In-memory tracking of document migration progress and recent events
 * Used for real-time monitoring and status reporting
 * 
 * @module lib/documentMigrationMetrics
 */

type MigrationEvent = {
  key: string
  outcome: 'success' | 'failure'
  timestamp: string
  error?: string
}

type MigrationMetricsState = {
  lastAttemptAt: string | null
  lastSuccessAt: string | null
  lastFailureAt: string | null
  lastBatchAt: string | null
  lastBatchAttempted: number
  lastBatchMigrated: number
  lastError: string | null
  recentEvents: MigrationEvent[]
}

const state: MigrationMetricsState = {
  lastAttemptAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  lastBatchAt: null,
  lastBatchAttempted: 0,
  lastBatchMigrated: 0,
  lastError: null,
  recentEvents: [],
}

function pushEvent(event: MigrationEvent) {
  state.recentEvents = [event, ...state.recentEvents].slice(0, 12)
}

export function recordMigrationAttempt() {
  state.lastAttemptAt = new Date().toISOString()
}

export function recordMigrationSuccess(key: string) {
  const timestamp = new Date().toISOString()
  state.lastSuccessAt = timestamp
  state.lastError = null
  pushEvent({ key, outcome: 'success', timestamp })
}

export function recordMigrationFailure(key: string, error?: string) {
  const timestamp = new Date().toISOString()
  state.lastFailureAt = timestamp
  state.lastError = error || 'Migration failed'
  pushEvent({ key, outcome: 'failure', timestamp, error: state.lastError })
}

export function recordMigrationBatch(attempted: number, migrated: number) {
  state.lastBatchAt = new Date().toISOString()
  state.lastBatchAttempted = attempted
  state.lastBatchMigrated = migrated
}

export function getDocumentMigrationMetrics() {
  return {
    ...state,
    recentEvents: [...state.recentEvents],
  }
}
