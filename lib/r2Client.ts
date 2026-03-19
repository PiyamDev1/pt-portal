/**
 * Cloudflare R2 Client Singleton
 * Provides S3-compatible object storage client for documents and backups
 * Reuses connection across all requests for better performance
 * 
 * @module lib/r2Client
 */

import { S3Client } from '@aws-sdk/client-s3'

let r2Client: S3Client | null = null

/**
 * Check if R2 is configured with all required environment variables
 * @returns True if R2_ENDPOINT, R2_ACCESS_KEY, R2_SECRET_KEY, and R2_BUCKET_NAME are set
 */
export function isR2Configured(): boolean {
  return Boolean(
    process.env.R2_ENDPOINT &&
    process.env.R2_ACCESS_KEY &&
    process.env.R2_SECRET_KEY &&
    process.env.R2_BUCKET_NAME,
  )
}

/**
 * Get or create the R2 client singleton
 * Throws error if R2 is not configured
 * @returns S3Client configured for Cloudflare R2
 * @throws Error if R2 configuration is missing
 */
export function getR2Client(): S3Client {
  if (!isR2Configured()) {
    throw new Error('R2 is not configured')
  }

  if (!r2Client) {
    r2Client = new S3Client({
      region: 'auto',
      endpoint: process.env.R2_ENDPOINT,
      credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY!,
        secretAccessKey: process.env.R2_SECRET_KEY!,
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  return r2Client
}
