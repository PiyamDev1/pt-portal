const PASSKEY_PROMPT_DISMISSED_KEY = 'pt-ims-passkey-prompt-dismissed'
const HRMS_COMPANION_INSTALLED_HINT_KEY = 'pt-ims-hrms-companion-installed'
const PASSKEY_PROMPT_SNOOZE_MS = 30 * 24 * 60 * 60 * 1000

type SerializedAuthenticationCredential = {
  id: string
  rawId: string
  type: 'public-key'
  response: {
    clientDataJSON: string
    authenticatorData: string
    signature: string
    userHandle?: string
  }
  clientExtensionResults: AuthenticationExtensionsClientOutputs
  authenticatorAttachment?: AuthenticatorAttachment
}

function base64urlToArrayBuffer(value: string) {
  const base64 = value.replace(/-/g, '+').replace(/_/g, '/')
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, '=')
  const binary = window.atob(padded)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes.buffer
}

function arrayBufferToBase64url(value: ArrayBuffer) {
  const bytes = new Uint8Array(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return window.btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '')
}

export function isWebAuthnSupported() {
  return (
    typeof window !== 'undefined' &&
    Boolean(window.PublicKeyCredential) &&
    typeof navigator.credentials?.create === 'function' &&
    typeof navigator.credentials?.get === 'function'
  )
}

export async function isConditionalPasskeySupported() {
  if (!isWebAuthnSupported()) return false
  const credential = window.PublicKeyCredential as typeof PublicKeyCredential & {
    isConditionalMediationAvailable?: () => Promise<boolean>
  }
  if (typeof credential.isConditionalMediationAvailable !== 'function') return false

  try {
    return await credential.isConditionalMediationAvailable()
  } catch {
    return false
  }
}

export function getMobilePlatformLabel() {
  if (typeof navigator === 'undefined') return 'a passkey'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return 'Face ID or Touch ID'
  if (/Android/i.test(ua)) return 'fingerprint, face unlock, or screen lock'
  if (/Windows/i.test(ua)) return 'Windows Hello or a passkey'
  return 'a passkey'
}

export function isMobileDevice() {
  if (typeof navigator === 'undefined') return false
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function isIosDevice() {
  if (typeof navigator === 'undefined') return false
  return /iPhone|iPad|iPod/i.test(navigator.userAgent)
}

export function isStandalonePwa() {
  if (typeof window === 'undefined') return false
  return (
    window.matchMedia('(display-mode: standalone)').matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function hasDismissedPasskeyPrompt() {
  if (typeof window === 'undefined') return true
  const dismissedAt = Number(window.localStorage.getItem(PASSKEY_PROMPT_DISMISSED_KEY))
  return Number.isFinite(dismissedAt) && Date.now() - dismissedAt < PASSKEY_PROMPT_SNOOZE_MS
}

export function dismissPasskeyPrompt() {
  window.localStorage.setItem(PASSKEY_PROMPT_DISMISSED_KEY, String(Date.now()))
}

export function resetPasskeyPromptDismissal() {
  window.localStorage.removeItem(PASSKEY_PROMPT_DISMISSED_KEY)
}

export function hasConfirmedHrmsCompanionInstall() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(HRMS_COMPANION_INSTALLED_HINT_KEY) === '1'
}

export function confirmHrmsCompanionInstall() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(HRMS_COMPANION_INSTALLED_HINT_KEY, '1')
}

export function resetHrmsCompanionInstallConfirmation() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(HRMS_COMPANION_INSTALLED_HINT_KEY)
}

export function preparePublicKeyRequestOptions<
  T extends {
    challenge: string
    allowCredentials?: Array<{ id: string }>
  },
>(options: T) {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(String(options.challenge)),
    allowCredentials: options.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64urlToArrayBuffer(String(credential.id)),
    })),
  } as PublicKeyCredentialRequestOptions
}

export function serializeAuthenticationCredential(
  credential: PublicKeyCredential,
): SerializedAuthenticationCredential {
  const nativeCredential = credential as PublicKeyCredential & { toJSON?: () => unknown }
  if (typeof nativeCredential.toJSON === 'function') {
    return nativeCredential.toJSON() as SerializedAuthenticationCredential
  }

  const response = credential.response as AuthenticatorAssertionResponse
  const credentialWithAttachment = credential as PublicKeyCredential & {
    authenticatorAttachment?: AuthenticatorAttachment | null
  }
  return {
    id: credential.id,
    rawId: credential.id || arrayBufferToBase64url(credential.rawId),
    type: 'public-key' as const,
    response: {
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64url(response.authenticatorData),
      signature: arrayBufferToBase64url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64url(response.userHandle) : undefined,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
    authenticatorAttachment: credentialWithAttachment.authenticatorAttachment || undefined,
  }
}
