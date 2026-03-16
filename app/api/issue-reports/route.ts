import { NextResponse } from 'next/server'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { getOptionalIssueReporter } from '@/lib/issueReportAuth'
import { uploadIssueArtifact } from '@/lib/issueReportStorage'
import {
  deriveModuleFromPath,
  normalizeIssueNotes,
  normalizeSeverity,
  parseDataUrl,
  redactSensitiveText,
  sanitizeConsoleEntries,
} from '@/lib/issueReportUtils'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const notes = normalizeIssueNotes(body?.notes)

    if (!notes) {
      return NextResponse.json({ error: 'Please describe what went wrong.' }, { status: 400 })
    }

    const pageUrl = redactSensitiveText(String(body?.pageUrl || '')).slice(0, 2000)
    const routePath = String(body?.routePath || '').slice(0, 500)

    if (!pageUrl || !routePath) {
      return NextResponse.json({ error: 'Missing page context for issue report.' }, { status: 400 })
    }

    const severity = normalizeSeverity(body?.severity)
    const includeScreenshot = Boolean(body?.includeScreenshot)
    const includeConsoleLog = Boolean(body?.includeConsoleLog)
    const browserContext = {
      viewport: body?.browserContext?.viewport || null,
      userAgent: redactSensitiveText(String(body?.browserContext?.userAgent || '')).slice(0, 1000),
      language: String(body?.browserContext?.language || '').slice(0, 50),
      platform: String(body?.browserContext?.platform || '').slice(0, 100),
      appVersion: String(body?.browserContext?.appVersion || '').slice(0, 100),
      consoleEntryCount: Array.isArray(body?.consoleEntries) ? Math.min(body.consoleEntries.length, 200) : 0,
      capturedAt: new Date().toISOString(),
    }

    const reporter = await getOptionalIssueReporter()
    const supabase = getSupabaseClient()
    const moduleKey = deriveModuleFromPath(routePath)
    const issueReportsTable = supabase.from('issue_reports') as any
    const issueReportArtifactsTable = supabase.from('issue_report_artifacts') as any
    const issueReportEventsTable = supabase.from('issue_report_events') as any

    const { data: report, error: reportError } = await issueReportsTable
      .insert({
        reporter_user_id: reporter?.id || null,
        reporter_email: reporter?.email || null,
        reporter_name: reporter?.name || null,
        page_url: pageUrl,
        route_path: routePath,
        module_key: moduleKey,
        notes,
        severity,
        browser_context: browserContext,
      })
      .select('id')
      .single()

    if (reportError || !report) {
      throw reportError || new Error('Failed to create issue report')
    }

    const artifactRows: Array<Record<string, unknown>> = []

    if (includeScreenshot && typeof body?.screenshotDataUrl === 'string' && body.screenshotDataUrl.startsWith('data:')) {
      try {
        const screenshot = parseDataUrl(body.screenshotDataUrl)
        const upload = await uploadIssueArtifact({
          ticketId: report.id,
          artifactType: 'screenshot',
          body: screenshot.buffer,
          contentType: screenshot.contentType,
        })

        artifactRows.push({
          ticket_id: report.id,
          artifact_type: 'screenshot',
          storage_provider: upload.provider,
          storage_bucket: upload.bucket,
          storage_key: upload.key,
          content_type: screenshot.contentType,
          byte_size: upload.size,
        })
      } catch (error) {
        console.error('Issue report screenshot upload failed:', error)
      }
    }

    if (includeConsoleLog) {
      const entries = sanitizeConsoleEntries(body?.consoleEntries)
      if (entries.length > 0) {
        try {
          const logBuffer = Buffer.from(JSON.stringify(entries, null, 2), 'utf8')
          const upload = await uploadIssueArtifact({
            ticketId: report.id,
            artifactType: 'console_log',
            body: logBuffer,
            contentType: 'application/json',
          })

          artifactRows.push({
            ticket_id: report.id,
            artifact_type: 'console_log',
            storage_provider: upload.provider,
            storage_bucket: upload.bucket,
            storage_key: upload.key,
            content_type: 'application/json',
            byte_size: upload.size,
          })
        } catch (error) {
          console.error('Issue report console log upload failed:', error)
        }
      }
    }

    if (artifactRows.length > 0) {
      const { error: artifactError } = await issueReportArtifactsTable.insert(artifactRows)
      if (artifactError) {
        console.error('Issue report artifact metadata insert failed:', artifactError)
      }
    }

    await issueReportsTable
      .update({
        updated_at: new Date().toISOString(),
        has_screenshot: artifactRows.some((artifact) => artifact.artifact_type === 'screenshot'),
        has_console_log: artifactRows.some((artifact) => artifact.artifact_type === 'console_log'),
      })
      .eq('id', report.id)

    await issueReportEventsTable.insert({
      ticket_id: report.id,
      actor_user_id: reporter?.id || null,
      action: 'created',
      details: {
        severity,
        routePath,
        moduleKey,
        includedArtifacts: artifactRows.map((artifact) => artifact.artifact_type),
      },
    })

    return NextResponse.json({ ok: true, ticketId: report.id })
  } catch (error: any) {
    console.error('Issue report submission failed:', error)
    return NextResponse.json({ error: error?.message || 'Failed to submit issue report' }, { status: 500 })
  }
}
