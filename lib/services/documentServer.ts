import { GetObjectCommand, type GetObjectCommandOutput } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getSupabaseClient } from '@/lib/supabaseClient'
import { migrateObjectFromR2ToMinio } from '@/lib/r2Migration'
import {
  documentContentDisposition,
  isValidDocumentId,
  isValidDocumentScopeId,
  isSafeInlineDocumentMimeType,
  safeStoredDocumentMimeType,
} from '@/lib/documentSecurity'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'

export type StoredDocument = {
  id: string
  fileName: string
  fileType: string
  familyHeadId: string
  bucket: string
  key: string
  category: string
}

type DocumentRow = {
  id: string
  file_name: string
  file_type: string | null
  family_head_id: string
  minio_bucket: string | null
  minio_key: string
  category: string | null
  deleted: boolean
}

const DOCUMENT_SELECT =
  'id, file_name, file_type, family_head_id, minio_bucket, minio_key, category, deleted'

export async function isDocumentStorageKeyOwnedByScope(
  familyHeadId: string,
  key: string,
): Promise<boolean> {
  if (!isValidDocumentScopeId(familyHeadId)) return false
  if (!key || key.length > 1024 || key.includes('\u0000')) return false
  if (key.startsWith(`family-${familyHeadId}/`)) return true

  const storageScope = /^family-([^/]+)\//.exec(key)?.[1]
  if (!storageScope || !/^PKD-[A-Z0-9]{10}$/.test(storageScope)) return false

  // Compatibility for drafts converted before document ownership stopped
  // being rewritten. Their database owner is the application UUID while the
  // immutable object key still contains the linked PKD identifier.
  const { data, error } = await getSupabaseClient()
    .from('pakistani_passport_drafts')
    .select('id')
    .eq('draft_id', storageScope)
    .eq('converted_application_id', familyHeadId)
    .maybeSingle<{ id: string }>()

  if (error && error.code !== 'PGRST116') throw error
  return Boolean(data)
}

async function mapStoredDocument(row: DocumentRow): Promise<StoredDocument | null> {
  if (!isValidDocumentScopeId(row.family_head_id)) return null
  if (!(await isDocumentStorageKeyOwnedByScope(row.family_head_id, row.minio_key))) return null

  const bucket = row.minio_bucket === R2_BUCKET ? R2_BUCKET : MINIO_BUCKET
  return {
    id: row.id,
    fileName: row.file_name,
    fileType: safeStoredDocumentMimeType(row.file_type),
    familyHeadId: row.family_head_id,
    bucket,
    key: row.minio_key,
    category: row.category || 'general',
  }
}

export async function findStoredDocumentById(documentId: string): Promise<StoredDocument | null> {
  if (!isValidDocumentId(documentId)) return null

  const { data, error } = await getSupabaseClient()
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('id', documentId)
    .eq('deleted', false)
    .maybeSingle<DocumentRow>()

  if (error) throw error
  return data ? await mapStoredDocument(data) : null
}

/**
 * Compatibility resolver for older UI URLs. A raw object key is never trusted:
 * it must resolve to one live document record before it can reach storage.
 */
export async function findStoredDocumentByKey(key: string): Promise<StoredDocument | null> {
  const normalizedKey = String(key || '').trim()
  if (!normalizedKey || normalizedKey.length > 1024 || normalizedKey.includes('\u0000')) return null

  const { data, error } = await getSupabaseClient()
    .from('documents')
    .select(DOCUMENT_SELECT)
    .eq('minio_key', normalizedKey)
    .eq('deleted', false)
    .maybeSingle<DocumentRow>()

  if (error) throw error
  return data ? await mapStoredDocument(data) : null
}

export async function getSignedDocumentUrl(
  document: StoredDocument,
  options: { download?: boolean; expiresIn?: number } = {},
): Promise<string> {
  const bucket = document.bucket || MINIO_BUCKET
  if (bucket === R2_BUCKET && !isR2Configured()) {
    throw new Error('Fallback document storage is unavailable')
  }
  const useR2 = bucket === R2_BUCKET && isR2Configured()
  const client = useR2 ? getR2Client() : getS3Client()
  const forceDownload = options.download || !isSafeInlineDocumentMimeType(document.fileType)
  const command = new GetObjectCommand({
    Bucket: useR2 ? R2_BUCKET : bucket,
    Key: document.key,
    ResponseContentType: document.fileType,
    ResponseContentDisposition: documentContentDisposition(
      document.fileName,
      forceDownload ? 'attachment' : 'inline',
    ),
    ResponseCacheControl: 'private, no-store, max-age=0',
  })

  return getSignedUrl(client, command, {
    expiresIn: Math.max(60, Math.min(options.expiresIn || 600, 600)),
  })
}

export async function readStoredDocument(
  document: StoredDocument,
): Promise<GetObjectCommandOutput> {
  if (document.bucket === R2_BUCKET && !isR2Configured()) {
    throw new Error('Fallback document storage is unavailable')
  }
  if (document.bucket === R2_BUCKET && isR2Configured()) {
    return getR2Client().send(new GetObjectCommand({ Bucket: R2_BUCKET, Key: document.key }))
  }

  try {
    return await getS3Client().send(
      new GetObjectCommand({ Bucket: document.bucket || MINIO_BUCKET, Key: document.key }),
    )
  } catch (primaryError) {
    if (!isR2Configured()) throw primaryError

    const result = await getR2Client().send(
      new GetObjectCommand({ Bucket: R2_BUCKET, Key: document.key }),
    )
    void migrateObjectFromR2ToMinio(document.key, { trigger: 'read' })
    return result
  }
}

export async function getSignedDocumentPreviewUrl(documentId: string): Promise<string> {
  const document = await findStoredDocumentById(documentId)
  if (!document) throw new Error('Document not found')
  return getSignedDocumentUrl(document)
}

export async function getSignedDocumentDownloadUrl(documentId: string): Promise<string> {
  const document = await findStoredDocumentById(documentId)
  if (!document) throw new Error('Document not found')
  return getSignedDocumentUrl(document, { download: true })
}

export async function getSignedDocumentUrlByKey(
  key: string,
  options: { download?: boolean } = {},
): Promise<string> {
  const document = await findStoredDocumentByKey(key)
  if (!document) throw new Error('Document not found')
  return getSignedDocumentUrl(document, options)
}

/** A thumbnail key is authorized through its live parent document record. */
export async function getSignedDocumentThumbnailUrl(documentId: string): Promise<string> {
  const document = await findStoredDocumentById(documentId)
  if (!document) throw new Error('Document not found')

  return getSignedUrl(
    getS3Client(),
    new GetObjectCommand({
      Bucket: MINIO_BUCKET,
      Key: `thumbnails/${document.id}`,
      ResponseContentType: document.fileType.startsWith('image/')
        ? document.fileType
        : 'image/jpeg',
      ResponseContentDisposition: documentContentDisposition(`${document.id}-thumbnail`, 'inline'),
      ResponseCacheControl: 'private, no-store, max-age=0',
    }),
    { expiresIn: 600 },
  )
}
