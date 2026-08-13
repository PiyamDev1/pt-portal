import { getSupabaseClient } from '@/lib/supabaseClient'
import { isValidDocumentScopeId } from '@/lib/documentSecurity'

type IdRow = { id: string }
type ApplicationScopeRow = {
  id: string
  applicant_id: string | null
  family_head_id: string | null
}
type DraftScopeRow = { id: string; draft_id: string }

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const PAK_DRAFT_ID_PATTERN = /^PKD-[A-Z0-9]{10}$/

export type ResolvedDocumentScope = {
  exists: boolean
  scopeIds: string[]
}

function uniqueScopeIds(values: Array<string | null | undefined>) {
  return Array.from(new Set(values.filter((value): value is string => Boolean(value))))
}

/**
 * Resolve every historical document owner that belongs to one application.
 *
 * Pakistani passport documents have used three owners over time: applicant
 * UUIDs, application UUIDs, and pre-tracking PKD IDs. Keeping that mapping on
 * the server lets old uploads remain available without trusting aliases from
 * the browser or mixing unrelated application documents.
 */
export async function resolveDocumentScope(scopeId: string): Promise<ResolvedDocumentScope> {
  if (!isValidDocumentScopeId(scopeId)) return { exists: false, scopeIds: [] }

  const supabase = getSupabaseClient()
  const normalizedDraftId = scopeId.toUpperCase()

  // Draft identifiers are text. Never compare them with UUID columns: doing so
  // causes PostgreSQL 22P02 errors and made valid draft uploads appear missing.
  if (PAK_DRAFT_ID_PATTERN.test(normalizedDraftId)) {
    const { data, error } = await supabase
      .from('pakistani_passport_drafts')
      .select('id, draft_id')
      .eq('draft_id', normalizedDraftId)
      .maybeSingle<DraftScopeRow>()

    if (error && error.code !== 'PGRST116') throw error
    return data ? { exists: true, scopeIds: [data.draft_id] } : { exists: false, scopeIds: [] }
  }

  if (!UUID_PATTERN.test(scopeId)) return { exists: false, scopeIds: [] }

  const [applicant, application] = await Promise.all([
    supabase.from('applicants').select('id').eq('id', scopeId).maybeSingle<IdRow>(),
    supabase
      .from('applications')
      .select('id, applicant_id, family_head_id')
      .eq('id', scopeId)
      .maybeSingle<ApplicationScopeRow>(),
  ])

  const unexpectedError = [applicant, application]
    .map((result) => result.error)
    .find((error) => error && error.code !== 'PGRST116')
  if (unexpectedError) throw unexpectedError

  if (!application.data) {
    return applicant.data
      ? { exists: true, scopeIds: [applicant.data.id] }
      : { exists: false, scopeIds: [] }
  }

  const { data: convertedDrafts, error: draftError } = await supabase
    .from('pakistani_passport_drafts')
    .select('id, draft_id')
    .eq('converted_application_id', application.data.id)

  if (draftError) throw draftError

  return {
    exists: true,
    scopeIds: uniqueScopeIds([
      application.data.id,
      application.data.applicant_id,
      application.data.family_head_id,
      ...(convertedDrafts || []).map((draft: DraftScopeRow) => draft.draft_id),
    ]),
  }
}

/**
 * Document scopes currently originate from a NADRA applicant, a submitted
 * application, or a pre-tracking Pakistani-passport draft. Rejecting unknown
 * scopes prevents authenticated callers from creating arbitrary storage paths.
 */
export async function documentScopeExists(scopeId: string): Promise<boolean> {
  return (await resolveDocumentScope(scopeId)).exists
}
