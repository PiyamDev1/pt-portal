import {
  DOCUMENT_ALLOWED_MIME_TYPES,
  DOCUMENT_MAX_FILE_SIZE_BYTES,
  DOCUMENT_MAX_FILE_SIZE_LABEL,
} from '@/lib/documentConstraints'

const DOCUMENT_SCOPE_PATTERN = /^[A-Za-z0-9][A-Za-z0-9_-]{0,127}$/
const DOCUMENT_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,159}$/
const DOCUMENT_CATEGORY_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

export const DOCUMENT_PRIVATE_CACHE_HEADERS = {
  'Cache-Control': 'private, no-store, max-age=0',
  Pragma: 'no-cache',
  Expires: '0',
} as const

export const DOCUMENT_UPLOAD_CATEGORIES = ['general', 'receipt', 'application-review'] as const

const DOCUMENT_UPLOAD_CATEGORY_SET = new Set<string>(DOCUMENT_UPLOAD_CATEGORIES)

const MIME_EXTENSIONS: Record<string, ReadonlySet<string>> = {
  'application/pdf': new Set(['pdf']),
  'image/jpeg': new Set(['jpg', 'jpeg', 'jpe', 'jfif']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
  'application/zip': new Set(['zip']),
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp'])

export type UploadValidationResult =
  | { valid: true; value: ValidatedDocumentUpload }
  | { valid: false; error: string; status: number }

export type ValidatedDocumentUpload = {
  fileName: string
  fileSize: number
  fileType: string
}

export function isUploadedFile(value: FormDataEntryValue | null): value is File {
  return Boolean(
    value &&
    typeof value !== 'string' &&
    typeof value.name === 'string' &&
    typeof value.size === 'number' &&
    typeof value.type === 'string' &&
    typeof value.arrayBuffer === 'function',
  )
}

export function requestContentLengthExceeds(request: Request, maxBytes: number): boolean {
  const contentLength = Number(request.headers?.get?.('content-length'))
  return Number.isFinite(contentLength) && contentLength > maxBytes
}

export function isValidDocumentScopeId(value: unknown): value is string {
  return typeof value === 'string' && DOCUMENT_SCOPE_PATTERN.test(value)
}

export function isValidDocumentId(value: unknown): value is string {
  return typeof value === 'string' && DOCUMENT_ID_PATTERN.test(value)
}

export function normalizeDocumentUploadCategory(value: unknown): string | null {
  const normalized = String(value || 'general')
    .trim()
    .toLowerCase()

  if (!DOCUMENT_CATEGORY_PATTERN.test(normalized)) return null
  return DOCUMENT_UPLOAD_CATEGORY_SET.has(normalized) ? normalized : null
}

/**
 * Turn a caller-provided filename into a single safe path segment.
 * The original extension is retained so content checks can compare it with
 * the detected file signature.
 */
export function sanitizeDocumentFileName(value: unknown): string | null {
  const raw = String(value || '')
    .normalize('NFKC')
    .split(/[\\/]/)
    .pop()
    ?.replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()

  if (!raw || raw === '.' || raw === '..') return null

  const sanitized = raw
    .replace(/^\.+/, '')
    .replace(/[^\p{L}\p{N} ._()\-]/gu, '_')
    .replace(/\s+/g, ' ')
    .replace(/_+/g, '_')
    .trim()

  if (!sanitized || sanitized === '.' || sanitized === '..') return null

  const extensionIndex = sanitized.lastIndexOf('.')
  const extension = extensionIndex > 0 ? sanitized.slice(extensionIndex) : ''
  const baseName = extensionIndex > 0 ? sanitized.slice(0, extensionIndex) : sanitized
  const maxBaseLength = Math.max(1, 160 - extension.length)
  const shortened = `${baseName.slice(0, maxBaseLength)}${extension}`

  return shortened || null
}

export function detectDocumentMimeType(bytes: Uint8Array): string | null {
  if (
    bytes.length >= 5 &&
    bytes[0] === 0x25 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x44 &&
    bytes[3] === 0x46 &&
    bytes[4] === 0x2d
  ) {
    return 'application/pdf'
  }

  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return 'image/jpeg'
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47 &&
    bytes[4] === 0x0d &&
    bytes[5] === 0x0a &&
    bytes[6] === 0x1a &&
    bytes[7] === 0x0a
  ) {
    return 'image/png'
  }

  if (
    bytes.length >= 12 &&
    String.fromCharCode(...bytes.subarray(0, 4)) === 'RIFF' &&
    String.fromCharCode(...bytes.subarray(8, 12)) === 'WEBP'
  ) {
    return 'image/webp'
  }

  return null
}

export function validateDocumentUpload(file: File, bytes: Uint8Array): UploadValidationResult {
  const fileSize = Math.max(Number(file.size || 0), bytes.byteLength)
  if (fileSize === 0) {
    return { valid: false, error: 'File is empty', status: 400 }
  }

  if (fileSize > DOCUMENT_MAX_FILE_SIZE_BYTES) {
    return {
      valid: false,
      error: `File size exceeds maximum of ${DOCUMENT_MAX_FILE_SIZE_LABEL}`,
      status: 413,
    }
  }

  const fileName = sanitizeDocumentFileName(file.name)
  if (!fileName) {
    return { valid: false, error: 'Invalid file name', status: 400 }
  }

  const detectedType = detectDocumentMimeType(bytes)
  if (!detectedType || !DOCUMENT_ALLOWED_MIME_TYPES.includes(detectedType)) {
    return { valid: false, error: 'File content is not a supported document type', status: 415 }
  }

  const declaredType = String(file.type || '')
    .trim()
    .toLowerCase()
  if (declaredType && declaredType !== detectedType) {
    return {
      valid: false,
      error: 'Declared file type does not match the file content',
      status: 415,
    }
  }

  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : ''
  if (!MIME_EXTENSIONS[detectedType]?.has(extension)) {
    return {
      valid: false,
      error: 'File extension does not match the file content',
      status: 415,
    }
  }

  return {
    valid: true,
    value: {
      fileName,
      fileSize,
      fileType: detectedType,
    },
  }
}

export function validateImageBytes(
  bytes: Uint8Array,
  declaredType: unknown,
  options: { maxBytes: number; maxSizeLabel: string },
):
  | { valid: true; value: { fileSize: number; fileType: string } }
  | { valid: false; error: string; status: number } {
  const fileSize = bytes.byteLength
  if (fileSize === 0) {
    return { valid: false, error: 'Image is empty', status: 400 }
  }

  if (fileSize > options.maxBytes) {
    return {
      valid: false,
      error: `Image size exceeds maximum of ${options.maxSizeLabel}`,
      status: 413,
    }
  }

  const detectedType = detectDocumentMimeType(bytes)
  if (!detectedType || !IMAGE_MIME_TYPES.has(detectedType)) {
    return { valid: false, error: 'Image content is not a supported type', status: 415 }
  }

  const normalizedDeclaredType = String(declaredType || '')
    .trim()
    .toLowerCase()
  if (normalizedDeclaredType && normalizedDeclaredType !== detectedType) {
    return {
      valid: false,
      error: 'Declared image type does not match the image content',
      status: 415,
    }
  }

  return { valid: true, value: { fileSize, fileType: detectedType } }
}

export function validateImageUpload(
  file: File,
  bytes: Uint8Array,
  options: { maxBytes: number; maxSizeLabel: string },
): UploadValidationResult {
  const image = validateImageBytes(bytes, file.type, options)
  if (!image.valid) return image

  if (file.size > options.maxBytes) {
    return {
      valid: false,
      error: `Image size exceeds maximum of ${options.maxSizeLabel}`,
      status: 413,
    }
  }

  const fileName = sanitizeDocumentFileName(file.name)
  if (!fileName) {
    return { valid: false, error: 'Invalid image file name', status: 400 }
  }

  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() || '' : ''
  if (!MIME_EXTENSIONS[image.value.fileType]?.has(extension)) {
    return {
      valid: false,
      error: 'Image extension does not match the image content',
      status: 415,
    }
  }

  return {
    valid: true,
    value: {
      fileName,
      fileSize: Math.max(file.size, image.value.fileSize),
      fileType: image.value.fileType,
    },
  }
}

export function safeStoredDocumentMimeType(value: unknown): string {
  const mimeType = String(value || '')
    .trim()
    .toLowerCase()
  if (DOCUMENT_ALLOWED_MIME_TYPES.includes(mimeType) || mimeType === 'application/zip') {
    return mimeType
  }
  return 'application/octet-stream'
}

export function isSafeInlineDocumentMimeType(value: unknown): boolean {
  const mimeType = safeStoredDocumentMimeType(value)
  return mimeType === 'application/pdf' || mimeType.startsWith('image/')
}

export function documentContentDisposition(
  fileName: string,
  mode: 'inline' | 'attachment',
): string {
  const safeName = sanitizeDocumentFileName(fileName) || 'document'
  const asciiName = safeName.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `${mode}; filename="${asciiName}"; filename*=UTF-8''${encodeURIComponent(safeName)}`
}
