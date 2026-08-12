import { createHash } from 'crypto'

export const THIRD_PARTY_SHARE_TERMS = `By accessing these package documents, the recipient confirms they are authorised to receive them for the agreed travel service purpose only. The recipient accepts responsibility for keeping the documents secure on their side, not forwarding them unnecessarily, not storing them longer than needed, deleting them when no longer required, and promptly informing Piyam Travel if the documents are lost, misdirected, or exposed to an unauthorised person.`

export function hashThirdPartyShareToken(token: string) {
  return createHash('sha256').update(token).digest('hex')
}

export function hashThirdPartyShareCode(token: string, code: string) {
  return createHash('sha256').update(`${token}:${code.trim().toUpperCase()}`).digest('hex')
}
