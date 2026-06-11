import { apiError, apiOk } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { bufferToBase64url } from '@/lib/auth/base64url'
import { createWebAuthnChallenge, getChallengeExpiry, getWebAuthnContext } from '@/lib/auth/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user?.email) return apiError('Unauthorized', 401)

  const admin = getSupabaseClient()
  const context = getWebAuthnContext(request)
  const challenge = createWebAuthnChallenge()

  const { data: existingPasskeys, error: existingError } = await admin
    .from('user_passkeys')
    .select('credential_id, transports')
    .eq('user_id', user.id)

  if (existingError) return apiError(existingError.message, 500)

  const { error: challengeError } = await admin.from('user_passkey_challenges').insert({
    challenge,
    user_id: user.id,
    user_email: user.email.toLowerCase(),
    type: 'registration',
    expires_at: getChallengeExpiry(),
  })

  if (challengeError) return apiError(challengeError.message, 500)

  return apiOk({
    publicKey: {
      challenge,
      rp: {
        name: 'Piyam Travels IMS',
        id: context.rpId,
      },
      user: {
        id: bufferToBase64url(user.id),
        name: user.email,
        displayName: user.user_metadata?.full_name || user.email,
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },
      ],
      timeout: 60000,
      attestation: 'none',
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        residentKey: 'preferred',
        requireResidentKey: false,
        userVerification: 'required',
      },
      excludeCredentials: (existingPasskeys || []).map((passkey) => ({
        type: 'public-key',
        id: passkey.credential_id,
        transports: passkey.transports || [],
      })),
    },
  })
}
