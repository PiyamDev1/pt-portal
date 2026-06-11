import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { getWebAuthnContext, parseRegistrationAttestation } from '@/lib/auth/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type RegistrationBody = {
  challenge?: string
  name?: string
  device_type?: string
  credential?: {
    response?: {
      clientDataJSON?: string
      attestationObject?: string
      transports?: string[]
    }
  }
}

export async function POST(request: Request) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return apiError('Unauthorized', 401)

  const body = await request.json().catch(() => ({})) as RegistrationBody
  if (!body.challenge || !body.credential?.response?.clientDataJSON || !body.credential.response.attestationObject) {
    return apiError('Invalid biometric setup response', 400)
  }

  const admin = getSupabaseClient()
  const { data: challengeRow, error: challengeError } = await admin
    .from('user_passkey_challenges')
    .select('id, challenge, expires_at, consumed_at')
    .eq('challenge', body.challenge)
    .eq('type', 'registration')
    .eq('user_id', user.id)
    .is('consumed_at', null)
    .maybeSingle()

  if (challengeError) return apiError(challengeError.message, 500)
  if (!challengeRow || new Date(challengeRow.expires_at).getTime() < Date.now()) {
    return apiError('Biometric setup expired. Please try again.', 400)
  }

  try {
    const context = getWebAuthnContext(request)
    const parsed = parseRegistrationAttestation({
      attestationObject: body.credential.response.attestationObject,
      clientDataJSON: body.credential.response.clientDataJSON,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: context.origin,
      rpId: context.rpId,
    })

    const { error: passkeyError } = await admin.from('user_passkeys').upsert(
      {
        user_id: user.id,
        user_email: user.email.toLowerCase(),
        credential_id: parsed.credentialId,
        public_key_jwk: parsed.publicKeyJwk,
        sign_count: parsed.signCount,
        name: body.name?.trim() || 'Mobile passkey',
        transports: body.credential.response.transports || [],
        device_type: body.device_type || null,
      },
      { onConflict: 'credential_id' },
    )

    if (passkeyError) return apiError(passkeyError.message, 500)

    await admin
      .from('user_passkey_challenges')
      .update({ consumed_at: new Date().toISOString() })
      .eq('id', challengeRow.id)

    return apiOk({
      ok: true,
      credential_id: parsed.credentialId,
      email: user.email,
      name: body.name?.trim() || 'Mobile passkey',
    })
  } catch (error: unknown) {
    return apiError(error instanceof Error ? error.message : 'Unable to verify biometric setup', 400)
  }
}
