import { apiError, apiOk } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { createWebAuthnChallenge, getChallengeExpiry } from '@/lib/auth/webauthn'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { email?: string }
  const email = body.email?.trim().toLowerCase()

  if (!email) {
    return apiError('Enter your email once to unlock biometric login on this device.', 400)
  }

  const admin = getSupabaseClient()
  const passkeysQuery = admin
    .from('user_passkeys')
    .select('credential_id, transports, user_id, user_email')
    .order('created_at', { ascending: false })

  const { data: passkeys, error } = await passkeysQuery.eq('user_email', email)

  if (error) return apiError(error.message, 500)
  if (!passkeys || passkeys.length === 0) {
    return apiError('No biometric login is enabled for this email on IMS', 404)
  }

  const challenge = createWebAuthnChallenge()
  const { error: challengeError } = await admin.from('user_passkey_challenges').insert({
    challenge,
    user_id: passkeys[0]?.user_id,
    user_email: email,
    type: 'authentication',
    expires_at: getChallengeExpiry(),
  })

  if (challengeError) return apiError(challengeError.message, 500)

  return apiOk({
    publicKey: {
      challenge,
      timeout: 60000,
      userVerification: 'required',
      allowCredentials: passkeys.map((passkey) => ({
        type: 'public-key',
        id: passkey.credential_id,
        transports: passkey.transports || [],
      })),
    },
  })
}
