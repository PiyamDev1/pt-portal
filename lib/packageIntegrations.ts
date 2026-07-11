import { S3Client } from '@aws-sdk/client-s3'

let packageBackupClient: S3Client | null = null

export type PackageBackupStorageConfig = {
  endpoint: string
  publicUrl: string
  accessKeyId: string
  secretAccessKey: string
  bucketName: string
}

export type LegacyBookingsFirebaseConfig = {
  projectId: string
  clientEmail: string
  privateKey: string
}

function cleanEnv(value: string | undefined) {
  return value?.trim() || ''
}

function normalizePrivateKey(value: string) {
  return value.replace(/\\n/g, '\n')
}

export function getPackageMinioBucketName() {
  return cleanEnv(process.env.MINIO_PACKAGES_BUCKET_NAME) || 'pt-packages'
}

export function getPackageMailgunSenderEmail() {
  return (
    cleanEnv(process.env.TRAVEL_PACKAGES_MAILGUN_SENDER_EMAIL)
    || cleanEnv(process.env.MAILGUN_SENDER_EMAIL)
    || 'Piyam Travel <bookings.noreply@piyamtravel.com>'
  )
}

export function getPackageBackupStorageConfig(): PackageBackupStorageConfig | null {
  const endpoint = cleanEnv(process.env.R3_ENDPOINT)
  const accessKeyId =
    cleanEnv(process.env.R3_ACCESS_KEY_ID)
    || cleanEnv(process.env.R3_ACCESS_KEY)
  const secretAccessKey =
    cleanEnv(process.env.R3_SECRET_ACCESS_KEY)
    || cleanEnv(process.env.R3_SECRET_KEY)
  const bucketName = cleanEnv(process.env.R3_BUCKET_NAME)

  if (!endpoint || !accessKeyId || !secretAccessKey || !bucketName) return null

  return {
    endpoint,
    publicUrl: cleanEnv(process.env.R3_PUBLIC_URL),
    accessKeyId,
    secretAccessKey,
    bucketName,
  }
}

export function isPackageBackupStorageConfigured() {
  return Boolean(getPackageBackupStorageConfig())
}

export function getPackageBackupStorageClient() {
  const config = getPackageBackupStorageConfig()
  if (!config) {
    throw new Error(
      'Package backup storage is not configured: set R3_ENDPOINT, R3_ACCESS_KEY_ID, R3_SECRET_ACCESS_KEY, and R3_BUCKET_NAME.',
    )
  }

  if (!packageBackupClient) {
    packageBackupClient = new S3Client({
      region: 'auto',
      endpoint: config.endpoint,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
      forcePathStyle: true,
      requestChecksumCalculation: 'WHEN_REQUIRED',
      responseChecksumValidation: 'WHEN_REQUIRED',
    })
  }

  return packageBackupClient
}

export function getLegacyBookingsFirebaseConfig(): LegacyBookingsFirebaseConfig | null {
  const projectId = cleanEnv(process.env.LEGACY_BOOKINGS_FIREBASE_PROJECT_ID)
  const clientEmail = cleanEnv(process.env.LEGACY_BOOKINGS_FIREBASE_CLIENT_EMAIL)
  const privateKey = cleanEnv(process.env.LEGACY_BOOKINGS_FIREBASE_PRIVATE_KEY)

  if (!projectId || !clientEmail || !privateKey) return null

  return {
    projectId,
    clientEmail,
    privateKey: normalizePrivateKey(privateKey),
  }
}

export function isLegacyBookingsFirebaseConfigured() {
  return Boolean(getLegacyBookingsFirebaseConfig())
}
