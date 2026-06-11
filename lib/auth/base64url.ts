export function bufferToBase64url(value: ArrayBuffer | Uint8Array | Buffer | string) {
  const buffer = typeof value === 'string'
    ? Buffer.from(value)
    : value instanceof ArrayBuffer
      ? Buffer.from(new Uint8Array(value))
      : Buffer.from(value)
  return buffer.toString('base64url')
}

export function base64urlToBuffer(value: string) {
  return Buffer.from(value, 'base64url')
}

export function base64urlToArrayBuffer(value: string) {
  const buffer = base64urlToBuffer(value)
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength)
}
