import { NextRequest } from 'next/server'
import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { apiError, apiOk } from '@/lib/api/http'
import { getSupabaseClient } from '@/lib/supabaseClient'

type EmployeeRoleRow = {
  roles?: { name?: string | null } | Array<{ name?: string | null }> | null
}

type ProfileRoleRow = {
  role?: string | null
}

function normalizeRole(value: unknown) {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[_-]+/g, ' ')
}

function isOrgAdminRole(roleNames: string[]) {
  return roleNames.some((role) => ['admin', 'master admin', 'maintenance admin'].includes(role))
}

async function resolveRequester(request: NextRequest) {
  const cookieStore = await cookies()
  const authClient = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll() {},
      },
    },
  )

  const {
    data: { user },
    error,
  } = await authClient.auth.getUser()

  if (error || !user) return { error: apiError('Unauthorized', 401) }

  const supabase = getSupabaseClient()
  const [{ data: employee }, { data: profile }] = await Promise.all([
    supabase.from('employees').select('roles(name)').eq('id', user.id).maybeSingle<EmployeeRoleRow>(),
    supabase.from('profiles').select('role').eq('id', user.id).maybeSingle<ProfileRoleRow>(),
  ])

  const employeeRole = Array.isArray(employee?.roles) ? employee?.roles[0]?.name : employee?.roles?.name
  const roleNames = [employeeRole, profile?.role].map(normalizeRole).filter(Boolean)

  return {
    user,
    isOrgAdmin: isOrgAdminRole(roleNames),
    supabase,
  }
}

export async function GET(request: NextRequest) {
  const requester = await resolveRequester(request)
  if ('error' in requester) return requester.error

  const { searchParams } = new URL(request.url)
  const requestedEmployeeId = String(searchParams.get('employeeId') || '').trim()
  const documentType = String(searchParams.get('documentType') || '').trim().toLowerCase()

  const targetEmployeeId = requester.isOrgAdmin
    ? requestedEmployeeId || requester.user.id
    : requester.user.id

  if (!targetEmployeeId) {
    return apiError('employeeId is required', 400)
  }

  let query = requester.supabase
    .from('employee_documents')
    .select(
      'id, employee_id, document_type, file_name, file_size, file_type, uploaded_at, uploaded_by, minio_bucket, minio_key, minio_etag',
    )
    .eq('employee_id', targetEmployeeId)
    .eq('deleted', false)
    .order('uploaded_at', { ascending: false })
    .limit(200)

  if (documentType) {
    query = query.eq('document_type', documentType)
  }

  const { data, error } = await query

  if (error) {
    const message = String(error.message || '').toLowerCase()
    if (error.code === '42P01' || message.includes('does not exist') || message.includes('relation')) {
      return apiOk({ supported: false, documents: [], message: 'employee_documents table is not available yet' })
    }

    return apiError(error.message || 'Failed to load documents', 500)
  }

  const documents = (data || []).map((row) => ({
    id: row.id,
    employeeId: row.employee_id,
    documentType: row.document_type,
    fileName: row.file_name,
    fileSize: row.file_size,
    fileType: row.file_type,
    uploadedAt: row.uploaded_at,
    uploadedBy: row.uploaded_by,
    minio: {
      bucket: row.minio_bucket,
      key: row.minio_key,
      etag: row.minio_etag,
    },
  }))

  return apiOk({ supported: true, documents })
}

export async function POST(request: NextRequest) {
  const requester = await resolveRequester(request)
  if ('error' in requester) return requester.error

  if (!requester.isOrgAdmin) {
    return apiError('Forbidden', 403)
  }

  const body = await request.json().catch(() => null)
  const documentId = String(body?.documentId || '').trim()
  const employeeId = String(body?.employeeId || '').trim()
  const documentType = String(body?.documentType || 'other').trim().toLowerCase()
  const fileName = String(body?.fileName || '').trim()
  const fileType = String(body?.fileType || 'application/octet-stream').trim()
  const minioKey = String(body?.minioKey || '').trim()
  const minioEtag = String(body?.minioEtag || '').trim()
  const storageBucket =
    String(body?.storageBucket || '').trim() || process.env.MINIO_BUCKET_NAME || 'portal-documents'
  const fileSize = Number(body?.fileSize || 0)

  if (!documentId || !employeeId || !fileName || !minioKey) {
    return apiError('Missing required fields', 400)
  }

  const allowedTypes = ['contract', 'payslip', 'other']
  const normalizedType = allowedTypes.includes(documentType) ? documentType : 'other'

  const { error } = await requester.supabase.from('employee_documents').insert({
    id: documentId,
    employee_id: employeeId,
    document_type: normalizedType,
    file_name: fileName,
    file_size: Number.isFinite(fileSize) ? fileSize : 0,
    file_type: fileType,
    uploaded_by: requester.user.id,
    minio_bucket: storageBucket,
    minio_key: minioKey,
    minio_etag: minioEtag,
    deleted: false,
  })

  if (error) {
    return apiError(error.message || 'Failed to save employee document', 500)
  }

  return apiOk({ documentId })
}
