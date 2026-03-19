import { z } from 'zod'
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
  sanitizeFailedRequests,
} from '@/lib/issueReportUtils'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { toErrorMessage } from '@/lib/api/error'

const reportBodySchema = z.object({
  notes: z.string().optional(),
  pageUrl: z.string().optional(),
  routePath: z.string().optional(),
  severity: z.unknown().optional(),
  includeScreenshot: z.boolean().optional(),
  includeConsoleLog: z.boolean().optional(),
  includeFailedRequests: z.boolean().optional(),
  screenshotDataUrl: z.string().optional(),
  consoleEntries: z.unknown().optional(),
  failedRequests: z.unknown().optional(),
  browserContext: z
    .object({
      viewport: z.unknown().optional(),
      userAgent: z.string().optional(),
      language: z.string().optional(),
      platform: z.string().optional(),
      appVersion: z.string().optional(),
    })
    .optional(),
})

export async function POST(request: Request) {
  try {
    const { data: body, error: bodyError } = await parseBodyWithSchema(request, reportBodySchema)
    if (bodyError || !body) {
      return apiError(bodyError || 'Invalid request payload', 400)
    }

    const notes = normalizeIssueNotes(body?.notes)

    if (!notes) {
      return apiError('Please describe what went wrong.', 400)
    }

    const pageUrl = redactSensitiveText(String(body?.pageUrl || '')).slice(0, 2000)
    const routePath = String(body?.routePath || '').slice(0, 500)

    if (!pageUrl || !routePath) {
      return apiError('Missing page context for issue report.', 400)
    }

    const severity = normalizeSeverity(body?.severity)
    const includeScreenshot = Boolean(body?.includeScreenshot)
    const includeConsoleLog = Boolean(body?.includeConsoleLog)
    const includeFailedRequests = Boolean(body?.includeFailedRequests)
    const failedRequests = includeFailedRequests ? sanitizeFailedRequests(body?.failedRequests) : []
    const browserContext = {
      viewport: body?.browserContext?.viewport || null,
      userAgent: redactSensitiveText(String(body?.browserContext?.userAgent || '')).slice(0, 1000),
      language: String(body?.browserContext?.language || '').slice(0, 50),
      platform: String(body?.browserContext?.platform || '').slice(0, 100),
      appVersion: String(body?.browserContext?.appVersion || '').slice(0, 100),
      consoleEntryCount: Array.isArray(body?.consoleEntries)
        ? Math.min(body.consoleEntries.length, 200)
        : 0,
      failedRequestCount: failedRequests.length,
      failedRequests,
      capturedAt: new Date().toISOString(),
    }

    const reporter = await getOptionalIssueReporter()
    const supabase = getSupabaseClient()
    const moduleKey = deriveModuleFromPath(routePath)
    const issueReportsTable = supabase.from('issue_reports')
    const issueReportArtifactsTable = supabase.from('issue_report_artifacts')
    const issueReportEventsTable = supabase.from('issue_report_events')

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

    if (
      includeScreenshot &&
      typeof body?.screenshotDataUrl === 'string' &&
      body.screenshotDataUrl.startsWith('data:')
    ) {
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
        failedRequestCount: failedRequests.length,
        includedArtifacts: artifactRows.map((artifact) => artifact.artifact_type),
      },
    })

    return apiOk({ ticketId: report.id })
  } catch (error: unknown) {
    return apiError(toErrorMessage(error, 'Failed to submit issue report'), 500)
  }
}
