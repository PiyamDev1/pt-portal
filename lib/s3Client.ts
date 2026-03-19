/**
 * Shared S3/MinIO Client
 * Singleton instance to avoid recreating AWS SDK clients per request
 *
 * @module lib/s3Client
 */

import { S3Client } from '@aws-sdk/client-s3'

let s3Client: S3Client | null = null

/**
 * Get or create the S3 client singleton
 */
export function getS3Client(): S3Client {
  if (!s3Client) {
    s3Client = new S3Client({
      region: 'eu-west-1',
      endpoint: process.env.MINIO_ENDPOINT,
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!,
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }
  return s3Client
}

/**
 * Close the S3 client (for cleanup)
 */
export async function closeS3Client(): Promise<void> {
  if (s3Client) {
    await s3Client.destroy()
    s3Client = null
  }
}
