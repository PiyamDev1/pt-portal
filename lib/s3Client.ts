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
    const rawEndpoint = process.env.MINIO_ENDPOINT || ''
    const formattedEndpoint = rawEndpoint.startsWith('http')
      ? rawEndpoint
      : `https://${rawEndpoint}`

    s3Client = new S3Client({
      region: process.env.MINIO_REGION || 'eu-west-1',
      endpoint: formattedEndpoint,
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
