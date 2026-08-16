'use client'

import type { Session, SupabaseClient, User } from '@supabase/supabase-js'
import { toast } from 'sonner'
import { getBrowserSupabaseClient } from '@/lib/auth/browserSupabase'
import {
  isWebAuthnSupported,
  preparePublicKeyRequestOptions,
  serializeAuthenticationCredential,
} from '@/lib/auth/webauthnClient'

export type PortalSessionAssurance = 'aal1' | 'aal2' | 'passkey'

type PasskeySignInResult = {
  session: Session
  user: User
}

class PortalPasskeyError extends Error {
  override name = 'PortalPasskeyError'
}

function passkeyErrorCode(error: unknown) {
  if (!error || typeof error !== 'object') return ''
  const candidate = error as { code?: unknown; name?: unknown }
  return String(candidate.code || candidate.name || '').trim()
}

export function getPasskeyErrorMessage(error: unknown, fallback = 'Unable to use this passkey') {
  if (error instanceof PortalPasskeyError) return error.message

  const code = passkeyErrorCode(error)

  if (code === 'NotAllowedError' || code === 'AbortError') {
    return 'The passkey request was cancelled or timed out.'
  }
  if (code === 'passkey_disabled') {
    return 'Passkeys are not enabled for this portal environment yet.'
  }
  if (code === 'too_many_passkeys') {
    return 'This account has reached the maximum number of passkeys.'
  }
  if (code === 'webauthn_credential_exists') {
    return 'This passkey is already registered to your account.'
  }
  if (
    code === 'webauthn_credential_not_found' ||
    code === 'webauthn_challenge_not_found' ||
    code === 'webauthn_challenge_expired' ||
    code === 'webauthn_verification_failed'
  ) {
    return 'That passkey could not be verified. Try again or use another sign-in method.'
  }
  if (code === 'insufficient_aal') {
    return 'Confirm your authenticator code before changing passkeys.'
  }

  return fallback
}

function passkeyFailure(error: unknown, fallback: string) {
  return new PortalPasskeyError(getPasskeyErrorMessage(error, fallback))
}

function authenticationMethods(claims: unknown) {
  if (!claims || typeof claims !== 'object') return []
  const amr = (claims as { amr?: unknown }).amr
  if (!Array.isArray(amr)) return []

  return amr
    .map((entry) => {
      if (typeof entry === 'string') return entry
      if (entry && typeof entry === 'object' && 'method' in entry) {
        return String((entry as { method?: unknown }).method || '')
      }
      return ''
    })
    .filter(Boolean)
}

export function getPortalAssuranceFromClaims(claims: unknown): PortalSessionAssurance {
  if (authenticationMethods(claims).includes('passkey')) return 'passkey'
  if (claims && typeof claims === 'object' && (claims as { aal?: unknown }).aal === 'aal2') {
    return 'aal2'
  }
  return 'aal1'
}

export async function getPortalSessionAssurance(
  supabase: SupabaseClient,
  accessToken: string,
): Promise<PortalSessionAssurance> {
  const { data, error } = await supabase.auth.getClaims(accessToken)
  if (error || !data?.claims) return 'aal1'
  return getPortalAssuranceFromClaims(data.claims)
}

export async function registerPasskeyForCurrentUser(name?: string) {
  if (!isWebAuthnSupported()) {
    throw new PortalPasskeyError('This browser does not support passkeys')
  }

  const supabase = getBrowserSupabaseClient()
  const { data, error } = await supabase.auth.registerPasskey()
  if (error || !data) throw passkeyFailure(error, 'Unable to register passkey')

  const friendlyName = name?.trim()
  if (friendlyName) {
    const { data: renamed, error: renameError } = await supabase.auth.passkey.update({
      passkeyId: data.id,
      friendlyName: friendlyName.slice(0, 120),
    })
    if (renameError) {
      toast.warning('Passkey added, but its name could not be updated.')
      return data
    }
    toast.success('Passkey added to your account')
    return renamed
  }

  toast.success('Passkey added to your account')
  return data
}

export async function signInWithPasskey(
  options: { conditional?: boolean; signal?: AbortSignal } = {},
): Promise<PasskeySignInResult> {
  if (!isWebAuthnSupported()) {
    throw new PortalPasskeyError('This browser does not support passkeys')
  }

  const supabase = getBrowserSupabaseClient()

  if (!options.conditional) {
    const { data, error } = await supabase.auth.signInWithPasskey({
      options: { signal: options.signal },
    })
    if (error || !data?.session || !data.user) {
      throw passkeyFailure(error, 'Passkey sign-in failed')
    }
    return { session: data.session, user: data.user }
  }

  const { data: challenge, error: challengeError } =
    await supabase.auth.passkey.startAuthentication()
  if (challengeError || !challenge) {
    throw passkeyFailure(challengeError, 'Unable to prepare passkey sign-in')
  }

  const credential = await navigator.credentials.get({
    publicKey: preparePublicKeyRequestOptions(challenge.options),
    mediation: 'conditional',
    signal: options.signal,
  })
  if (!credential || credential.type !== 'public-key') {
    throw new PortalPasskeyError('The passkey request was cancelled or timed out.')
  }

  const { data, error } = await supabase.auth.passkey.verifyAuthentication({
    challengeId: challenge.challenge_id,
    credential: serializeAuthenticationCredential(credential as PublicKeyCredential),
  })
  if (error || !data?.session || !data.user) {
    throw passkeyFailure(error, 'Passkey sign-in failed')
  }

  return { session: data.session, user: data.user }
}
