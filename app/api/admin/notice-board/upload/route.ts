/**
 * Notice board image upload endpoint.
 *
 * Reuses the portal's existing MinIO-first, R2-fallback storage pattern. The returned
 * image URL points at an authenticated IMS proxy route rather than a public bucket URL.
 */

import { NextRequest } from 'next/server'
import { PutObjectCommand } from '@aws-sdk/client-s3'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client, isR2Configured } from '@/lib/r2Client'
import { apiError, apiOk } from '@/lib/api/http'
import { toErrorMessage } from '@/lib/api/error'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'

const MINIO_BUCKET = process.env.MINIO_BUCKET_NAME || 'portal-documents'
const R2_BUCKET = process.env.R2_BUCKET_NAME || 'portal-fallback'
const MAX_IMAGE_BYTES = 5 * 1024 * 1024

async function requireAdmin() {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return { error: apiError('Unauthorized', 401), user: null }

  const { data: employee, error } = await supabase
    .from('employees')
    .select('roles(name)')
    .eq('id', user.id)
    .single()

  if (error) return { error: apiError(error.message, 500), user: null }

  const role = Array.isArray(employee?.roles) ? employee.roles[0] : employee?.roles
  if (!['Admin', 'Master Admin', 'Maintenance Admin'].includes(role?.name || '')) {
    return { error: apiError('Forbidden', 403), user: null }
  }

  return { error: null, user }
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin()
  if (auth.error) return auth.error

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null

    if (!file) return apiError('Image file required', 400)
    if (!file.type.startsWith('image/')) return apiError('Only image uploads are allowed', 400)
    if (file.size > MAX_IMAGE_BYTES) return apiError('Image must be 5MB or smaller', 400)

    const extension =
      file.name
        .split('.')
        .pop()
        ?.replace(/[^a-zA-Z0-9]/g, '')
        .toLowerCase() || 'png'
    const key = `notice-board/${Date.now()}-${crypto.randomUUID()}.${extension}`
    const buffer = Buffer.from(await file.arrayBuffer())
    let provider: 'minio' | 'r2' = 'minio'
    let bucket = MINIO_BUCKET

    try {
      await getS3Client().send(
        new PutObjectCommand({
          Bucket: MINIO_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: file.type,
        }),
      )
    } catch (minioError) {
      if (!isR2Configured()) throw minioError
      await getR2Client().send(
        new PutObjectCommand({
          Bucket: R2_BUCKET,
          Key: key,
          Body: buffer,
          ContentType: file.type,
        }),
      )
      provider = 'r2'
      bucket = R2_BUCKET
    }

    const imageUrl = `/api/dashboard/notice-board/image?provider=${provider}&bucket=${encodeURIComponent(bucket)}&key=${encodeURIComponent(key)}`

    return apiOk({
      imageUrl,
      image_storage_provider: provider,
      image_storage_bucket: bucket,
      image_storage_key: key,
      fileName: file.name,
      fileType: file.type,
    })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Failed to upload notice image'), 500)
  }
}
