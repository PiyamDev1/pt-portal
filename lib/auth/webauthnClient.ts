const PASSKEY_PROMPT_DISMISSED_KEY = 'pt-ims-passkey-prompt-dismissed'
const PASSKEY_ENABLED_HINT_KEY = 'pt-ims-passkey-enabled-hint'
const PASSKEY_LAST_EMAIL_KEY = 'pt-ims-passkey-last-email'
const PASSKEY_SESSION_KEY = 'pt-ims-passkey-session'
const PASSKEY_SESSION_ID_KEY = 'pt-ims-passkey-session-id'
const HRMS_COMPANION_INSTALLED_HINT_KEY = 'pt-ims-hrms-companion-installed'

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

export function getMobilePlatformLabel() {
  if (typeof navigator === 'undefined') return 'biometrics'
  const ua = navigator.userAgent || ''
  if (/iPad|iPhone|iPod/.test(ua)) return 'Face ID or Touch ID'
  if (/Android/i.test(ua)) return 'fingerprint, face unlock, or screen lock'
  return 'biometrics or passkey'
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
  return window.localStorage.getItem(PASSKEY_PROMPT_DISMISSED_KEY) === '1'
}

export function dismissPasskeyPrompt() {
  window.localStorage.setItem(PASSKEY_PROMPT_DISMISSED_KEY, '1')
}

export function resetPasskeyPromptDismissal() {
  window.localStorage.removeItem(PASSKEY_PROMPT_DISMISSED_KEY)
}

export function setPasskeyEnabledHint() {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PASSKEY_ENABLED_HINT_KEY, '1')
}

export function hasPasskeyEnabledHint() {
  if (typeof window === 'undefined') return false
  return window.localStorage.getItem(PASSKEY_ENABLED_HINT_KEY) === '1'
}

export function setPasskeyLastEmail(email: string | null | undefined) {
  if (typeof window === 'undefined') return
  const normalized = email?.trim().toLowerCase()
  if (!normalized) return
  window.localStorage.setItem(PASSKEY_LAST_EMAIL_KEY, normalized)
}

export function getPasskeyLastEmail() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(PASSKEY_LAST_EMAIL_KEY) || ''
}

export function markPasskeySession(sessionId?: string) {
  if (typeof window === 'undefined') return
  window.localStorage.setItem(PASSKEY_SESSION_KEY, '1')
  if (sessionId) {
    window.localStorage.setItem(PASSKEY_SESSION_ID_KEY, sessionId)
  }
}

export function clearPasskeySession() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(PASSKEY_SESSION_KEY)
  window.localStorage.removeItem(PASSKEY_SESSION_ID_KEY)
}

export function getPasskeySessionId() {
  if (typeof window === 'undefined') return ''
  return window.localStorage.getItem(PASSKEY_SESSION_ID_KEY) || ''
}

export function hasPasskeySession(sessionId?: string) {
  if (typeof window === 'undefined') return false
  if (window.localStorage.getItem(PASSKEY_SESSION_KEY) !== '1') return false
  if (!sessionId) return true
  return window.localStorage.getItem(PASSKEY_SESSION_ID_KEY) === sessionId
}

export function clearPasskeyLastEmail() {
  if (typeof window === 'undefined') return
  window.localStorage.removeItem(PASSKEY_LAST_EMAIL_KEY)
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

export function preparePublicKeyCreationOptions(options: PublicKeyCredentialCreationOptions) {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(String(options.challenge)),
    user: {
      ...options.user,
      id: base64urlToArrayBuffer(String(options.user.id)),
    },
    excludeCredentials: options.excludeCredentials?.map((credential) => ({
      ...credential,
      id: base64urlToArrayBuffer(String(credential.id)),
    })),
  } as PublicKeyCredentialCreationOptions
}

export function preparePublicKeyRequestOptions(options: PublicKeyCredentialRequestOptions) {
  return {
    ...options,
    challenge: base64urlToArrayBuffer(String(options.challenge)),
    allowCredentials: options.allowCredentials?.map((credential) => ({
      ...credential,
      id: base64urlToArrayBuffer(String(credential.id)),
    })),
  } as PublicKeyCredentialRequestOptions
}

export function serializeRegistrationCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAttestationResponse
  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      attestationObject: arrayBufferToBase64url(response.attestationObject),
      transports: typeof response.getTransports === 'function' ? response.getTransports() : [],
    },
  }
}

export function serializeAuthenticationCredential(credential: PublicKeyCredential) {
  const response = credential.response as AuthenticatorAssertionResponse
  return {
    id: credential.id,
    rawId: arrayBufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: arrayBufferToBase64url(response.clientDataJSON),
      authenticatorData: arrayBufferToBase64url(response.authenticatorData),
      signature: arrayBufferToBase64url(response.signature),
      userHandle: response.userHandle ? arrayBufferToBase64url(response.userHandle) : null,
    },
  }
}
