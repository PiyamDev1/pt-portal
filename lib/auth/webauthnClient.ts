const PASSKEY_PROMPT_DISMISSED_KEY = 'pt-ims-passkey-prompt-dismissed'

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
  return typeof window !== 'undefined'
    && Boolean(window.PublicKeyCredential)
    && typeof navigator.credentials?.create === 'function'
    && typeof navigator.credentials?.get === 'function'
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
  return window.matchMedia('(display-mode: standalone)').matches
    || (window.navigator as Navigator & { standalone?: boolean }).standalone === true
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
