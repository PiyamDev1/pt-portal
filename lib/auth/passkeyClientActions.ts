import { toast } from 'sonner'
import {
  getMobilePlatformLabel,
  isWebAuthnSupported,
  preparePublicKeyCreationOptions,
  serializeRegistrationCredential,
  setPasskeyEnabledHint,
} from '@/lib/auth/webauthnClient'

type RegisterPasskeyResult = {
  credential_id: string
  email: string
  name: string
}

export async function registerPasskeyForCurrentUser(name?: string) {
  if (!isWebAuthnSupported()) {
    throw new Error('This browser does not support biometric passkeys')
  }

  const optionsResponse = await fetch('/api/auth/passkeys/register/options', {
    method: 'POST',
  })
  const optionsData = await optionsResponse.json()
  if (!optionsResponse.ok) {
    throw new Error(optionsData.error || 'Unable to start biometric setup')
  }

  const publicKey = preparePublicKeyCreationOptions(optionsData.publicKey)
  const credential = await navigator.credentials.create({ publicKey })
  if (!credential || credential.type !== 'public-key') {
    throw new Error('Biometric setup was cancelled')
  }

  const deviceName = name || `${getMobilePlatformLabel()} on this device`
  const verifyResponse = await fetch('/api/auth/passkeys/register/verify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      challenge: optionsData.publicKey.challenge,
      name: deviceName,
      device_type: getMobilePlatformLabel(),
      credential: serializeRegistrationCredential(credential as PublicKeyCredential),
    }),
  })
  const verifyData = await verifyResponse.json()
  if (!verifyResponse.ok) {
    throw new Error(verifyData.error || 'Unable to verify biometric setup')
  }

  const result = verifyData as RegisterPasskeyResult
  setPasskeyEnabledHint()
  toast.success('Biometric login enabled for this device')
  return result
}
