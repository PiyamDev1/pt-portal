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
    // 1. Grab the endpoint from the environment
    const rawEndpoint = process.env.MINIO_ENDPOINT || ''

    // 2. Force the AWS SDK to use HTTPS if it's missing (Crucial for Cloudflare Tunnels)
    const formattedEndpoint = rawEndpoint.startsWith('http') 
      ? rawEndpoint 
      : `https://${rawEndpoint}`

    s3Client = new S3Client({
      region: 'eu-west-1', 
      endpoint: formattedEndpoint, 
      credentials: {
        accessKeyId: process.env.MINIO_ACCESS_KEY!,
        secretAccessKey: process.env.MINIO_SECRET_KEY!,
      },
      forcePathStyle: true, 
      // CHECKSUMS COMPLETELY REMOVED
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
