import { getSupabaseClient } from '@/lib/supabaseClient'
import { isValidDocumentScopeId } from '@/lib/documentSecurity'

type IdRow = { id: string }

/**
 * Document scopes currently originate from a NADRA applicant, a submitted
 * application, or a pre-tracking Pakistani-passport draft. Rejecting unknown
 * scopes prevents authenticated callers from creating arbitrary storage paths.
 */
export async function documentScopeExists(scopeId: string): Promise<boolean> {
  if (!isValidDocumentScopeId(scopeId)) return false

  const supabase = getSupabaseClient()
  const [applicant, application, draft] = await Promise.all([
    supabase.from('applicants').select('id').eq('id', scopeId).maybeSingle<IdRow>(),
    supabase.from('applications').select('id').eq('id', scopeId).maybeSingle<IdRow>(),
    supabase
      .from('pakistani_passport_drafts')
      .select('id')
      .eq('draft_id', scopeId.toUpperCase())
      .maybeSingle<IdRow>(),
  ])

  const unexpectedError = [applicant, application, draft]
    .map((result) => result.error)
    .find((error) => error && error.code !== 'PGRST116')

  if (unexpectedError) throw unexpectedError
  return Boolean(applicant.data || application.data || draft.data)
}
