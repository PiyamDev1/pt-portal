/**
 * Authenticated notice board image proxy.
 *
 * The route verifies the IMS session, then redirects the browser to a short-lived signed
 * object URL. This keeps notice-board assets private while still working inside <img>.
 */

import { GetObjectCommand } from '@aws-sdk/client-s3'
import { getSignedUrl } from '@aws-sdk/s3-request-presigner'
import { NextRequest, NextResponse } from 'next/server'
import { apiError } from '@/lib/api/http'
import { getRouteSupabaseClient } from '@/lib/api/serverSupabase'
import { getS3Client } from '@/lib/s3Client'
import { getR2Client } from '@/lib/r2Client'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const supabase = await getRouteSupabaseClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return apiError('Unauthorized', 401)

  const provider = request.nextUrl.searchParams.get('provider') || 'minio'
  const bucket = request.nextUrl.searchParams.get('bucket')
  const key = request.nextUrl.searchParams.get('key')

  if (!bucket || !key) return apiError('bucket and key required', 400)
  if (!key.startsWith('notice-board/')) return apiError('Invalid notice image key', 400)

  const client = provider === 'r2' ? getR2Client() : getS3Client()
  const signedUrl = await getSignedUrl(
    client,
    new GetObjectCommand({
      Bucket: bucket,
      Key: key,
    }),
    { expiresIn: 300 },
  )

  return NextResponse.redirect(signedUrl)
}
