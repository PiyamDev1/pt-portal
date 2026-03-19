import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  type S3Client,
} from '@aws-sdk/client-s3'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { getS3Client } from '@/lib/s3Client'

type ArtifactType = 'screenshot' | 'console_log'

type UploadArtifactInput = {
  ticketId: string
  artifactType: ArtifactType
  body: Buffer
  contentType: string
}

type StoredArtifact = {
  provider: 'r2' | 'minio'
  bucket: string
  key: string
  size: number
}

function isMinioConfigured() {
  return Boolean(
    process.env.MINIO_ENDPOINT &&
    process.env.MINIO_ACCESS_KEY &&
    process.env.MINIO_SECRET_KEY &&
    (process.env.ISSUE_REPORTS_MINIO_BUCKET_NAME || process.env.MINIO_BUCKET_NAME),
  )
}

function getStorageTarget(): { provider: 'r2' | 'minio'; bucket: string; client: S3Client } {
  if (isR2Configured()) {
    return {
      provider: 'r2',
      bucket:
        process.env.ISSUE_REPORTS_R2_BUCKET_NAME || process.env.R2_BUCKET_NAME || 'portal-fallback',
      client: getR2Client(),
    }
  }

  if (isMinioConfigured()) {
    return {
      provider: 'minio',
      bucket:
        process.env.ISSUE_REPORTS_MINIO_BUCKET_NAME ||
        process.env.MINIO_BUCKET_NAME ||
        'portal-documents',
      client: getS3Client(),
    }
  }

  throw new Error('No object storage target configured for issue report artifacts')
}

function getArtifactExtension(contentType: string) {
  if (contentType.includes('json')) return 'json'
  if (contentType.includes('png')) return 'png'
  if (contentType.includes('webp')) return 'webp'
  if (contentType.includes('jpeg') || contentType.includes('jpg')) return 'jpg'
  return 'bin'
}

export async function uploadIssueArtifact(input: UploadArtifactInput): Promise<StoredArtifact> {
  const { provider, bucket, client } = getStorageTarget()
  const ext = getArtifactExtension(input.contentType)
  const key = `issue-reports/${input.ticketId}/${input.artifactType}-${Date.now()}.${ext}`

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.body.length,
    }),
  )

  return {
    provider,
    bucket,
    key,
    size: input.body.length,
  }
}

export async function deleteIssueArtifact(storageBucket: string, storageKey: string) {
  const provider =
    storageBucket ===
      (process.env.ISSUE_REPORTS_R2_BUCKET_NAME ||
        process.env.R2_BUCKET_NAME ||
        'portal-fallback') && isR2Configured()
      ? 'r2'
      : 'minio'
  const client = provider === 'r2' ? getR2Client() : getS3Client()

  await client.send(
    new DeleteObjectCommand({
      Bucket: storageBucket,
      Key: storageKey,
    }),
  )
}

export async function readIssueArtifact(storageBucket: string, storageKey: string) {
  const provider =
    storageBucket ===
      (process.env.ISSUE_REPORTS_R2_BUCKET_NAME ||
        process.env.R2_BUCKET_NAME ||
        'portal-fallback') && isR2Configured()
      ? 'r2'
      : 'minio'
  const client = provider === 'r2' ? getR2Client() : getS3Client()

  const response = await client.send(
    new GetObjectCommand({
      Bucket: storageBucket,
      Key: storageKey,
    }),
  )

  if (!response.Body) {
    throw new Error('Artifact body missing')
  }

  const bytes = await response.Body.transformToByteArray()
  return {
    body: Buffer.from(bytes),
    contentType: response.ContentType || 'application/octet-stream',
  }
}
