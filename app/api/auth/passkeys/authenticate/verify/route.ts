import { apiError, apiOk } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { getWebAuthnContext, verifyAuthenticationAssertion } from '@/lib/auth/webauthn'
import { recordAuthSecurityEvent } from '@/lib/auth/securityEvents'
import type { JsonWebKey as NodeJsonWebKey } from 'crypto'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type AuthenticationBody = {
  challenge?: string
  credential?: {
    id?: string
    rawId?: string
    response?: {
      clientDataJSON?: string
      authenticatorData?: string
      signature?: string
    }
  }
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as AuthenticationBody
  const credentialId = body.credential?.rawId || body.credential?.id

  if (
    !body.challenge ||
    !credentialId ||
    !body.credential?.response?.clientDataJSON ||
    !body.credential.response.authenticatorData ||
    !body.credential.response.signature
  ) {
    return apiError('Invalid biometric login response', 400)
  }

  const admin = getSupabaseClient()
  const { data: challengeRow, error: challengeError } = await admin
    .from('user_passkey_challenges')
    .select('id, challenge, user_id, user_email, expires_at')
    .eq('challenge', body.challenge)
    .eq('type', 'authentication')
    .is('consumed_at', null)
    .maybeSingle()

  if (challengeError) return apiError(challengeError.message, 500)
  if (!challengeRow || new Date(challengeRow.expires_at).getTime() < Date.now()) {
    return apiError('Biometric login expired. Please try again.', 400)
  }

  const passkeyQuery = admin
    .from('user_passkeys')
    .select('id, user_id, user_email, public_key_jwk, sign_count, credential_id')
    .eq('credential_id', credentialId)

  const { data: passkey, error: passkeyError } = challengeRow.user_id
    ? await passkeyQuery.eq('user_id', challengeRow.user_id).maybeSingle()
    : await passkeyQuery.maybeSingle()

  if (passkeyError) return apiError(passkeyError.message, 500)
  if (!passkey) return apiError('Biometric credential not found', 404)
  if (challengeRow.user_email && passkey.user_email !== challengeRow.user_email) {
    await recordAuthSecurityEvent({
      request,
      email: challengeRow.user_email,
      eventType: 'passkey_login',
      status: 'failed',
      metadata: { reason: 'credential_mismatch' },
    })
    return apiError('Biometric credential does not match this login challenge', 403)
  }

  try {
    const context = getWebAuthnContext(request)
    const verified = verifyAuthenticationAssertion({
      credentialId,
      authenticatorData: body.credential.response.authenticatorData,
      clientDataJSON: body.credential.response.clientDataJSON,
      signature: body.credential.response.signature,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: context.origin,
      rpId: context.rpId,
      publicKeyJwk: passkey.public_key_jwk as NodeJsonWebKey,
      storedSignCount: Number(passkey.sign_count || 0),
    })

    await admin
      .from('user_passkeys')
      .update({
        sign_count: verified.signCount,
        last_used_at: new Date().toISOString(),
      })
      .eq('id', passkey.id)

    await admin
      .from('user_passkey_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', challengeRow.id)

    const { data: linkData, error: linkError } = await admin.auth.admin.generateLink({
      type: 'magiclink',
      email: passkey.user_email,
    })

    if (linkError) return apiError(linkError.message, 500)

    const tokenHash = (linkData.properties as { hashed_token?: string } | undefined)?.hashed_token
    if (!tokenHash) return apiError('Unable to create biometric login session', 500)

    await recordAuthSecurityEvent({
      request,
      userId: passkey.user_id,
      email: passkey.user_email,
      eventType: 'passkey_login',
      status: 'success',
      metadata: { credentialId: passkey.id },
    })

    return apiOk({
      ok: true,
      token_hash: tokenHash,
      email: passkey.user_email,
      user_id: passkey.user_id,
    })
  } catch (error: unknown) {
    await recordAuthSecurityEvent({
      request,
      email: challengeRow.user_email,
      eventType: 'passkey_login',
      status: 'failed',
      metadata: { reason: error instanceof Error ? error.message : 'verify_failed' },
    })
    return apiError(
      error instanceof Error ? error.message : 'Unable to verify biometric login',
      400,
    )
  }
}
