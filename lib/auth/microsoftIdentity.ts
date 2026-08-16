import type { SupabaseClient, UserIdentity } from '@supabase/supabase-js'

export const MICROSOFT_IDENTITY_PROVIDER = 'azure'

type IdentityAuthClient = Pick<SupabaseClient['auth'], 'getUserIdentities' | 'unlinkIdentity'>

export type MicrosoftIdentityResolution =
  | { status: 'linked'; identity: UserIdentity; email: string }
  | { status: 'not-linked' }
  | { status: 'mismatch-removed' }
  | { status: 'review-required' }
  | { status: 'unavailable' }

export function normalizeIdentityEmail(value: unknown) {
  return typeof value === 'string' ? value.trim().toLowerCase() : ''
}

export function getMicrosoftIdentityEmail(identity: UserIdentity) {
  return normalizeIdentityEmail(identity.identity_data?.email)
}

export function findMicrosoftIdentity(identities: UserIdentity[]) {
  return identities.find((identity) => identity.provider === MICROSOFT_IDENTITY_PROVIDER) || null
}

/**
 * Reconciles the linked Microsoft identity against the authoritative IMS email.
 * Manual linking permits different provider emails, so a mismatch is immediately
 * removed before it can remain as an alternate login method.
 */
export async function reconcileMicrosoftIdentity(
  auth: IdentityAuthClient,
  primaryEmail: string,
): Promise<MicrosoftIdentityResolution> {
  const expectedEmail = normalizeIdentityEmail(primaryEmail)
  if (!expectedEmail) return { status: 'unavailable' }

  const { data, error } = await auth.getUserIdentities()
  if (error || !data) return { status: 'unavailable' }

  const identity = findMicrosoftIdentity(data.identities)
  if (!identity) return { status: 'not-linked' }

  const linkedEmail = getMicrosoftIdentityEmail(identity)
  if (linkedEmail === expectedEmail) {
    return { status: 'linked', identity, email: linkedEmail }
  }

  const { error: unlinkError } = await auth.unlinkIdentity(identity)
  return unlinkError ? { status: 'review-required' } : { status: 'mismatch-removed' }
}

export function getMicrosoftLinkErrorMessage(error: unknown) {
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String(error.code).toLowerCase()
      : ''
  const message = error instanceof Error ? error.message.toLowerCase() : ''
  const details = `${code} ${message}`

  if (details.includes('manual') && details.includes('link')) {
    return 'Microsoft account linking is not enabled for this portal environment yet.'
  }
  if (details.includes('already') && (details.includes('identity') || details.includes('linked'))) {
    return 'That Microsoft account is already linked to an IMS account.'
  }
  if (details.includes('session') || details.includes('jwt')) {
    return 'Your session expired. Sign in again before linking Microsoft.'
  }

  return 'Microsoft could not start the account-linking flow. Please try again.'
}
