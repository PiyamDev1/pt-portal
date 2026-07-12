type PackageAuditClient = {
  from: (table: string) => {
    insert: (
      payload: Record<string, unknown>,
    ) => PromiseLike<{ error?: { message?: string } | null }>
  }
}

export async function recordPackageAuditEvent(
  client: PackageAuditClient,
  event: {
    packageId?: string | null
    quoteId?: string | null
    actorId?: string | null
    eventType: string
    eventSummary: string
    beforeData?: unknown
    afterData?: unknown
    metadata?: Record<string, unknown>
  },
) {
  try {
    await client.from('travel_package_audit_events').insert({
      package_id: event.packageId || null,
      quote_id: event.quoteId || null,
      actor_id: event.actorId || null,
      event_type: event.eventType,
      event_summary: event.eventSummary,
      before_data: event.beforeData ?? null,
      after_data: event.afterData ?? null,
      metadata: event.metadata || {},
    })
  } catch {
    // Auditing should not make the primary agent action fail when the new schema is pending.
  }
}
