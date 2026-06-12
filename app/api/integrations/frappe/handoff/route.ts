/**
 * GET /api/integrations/frappe/handoff
 *
 * Starts the IMS-controlled browser handoff into Frappe HRMS.
 */

import { createServerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { buildFrappeHandoffUrl } from '@/lib/integrations/frappe/handoff'
import { ensureFrappeLoginUserForEmployee } from '@/lib/integrations/frappe/provisioning'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

async function getSessionUser() {
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

  if (error || !user) return null
  return user
}

function localRedirect(request: Request, path: string) {
  return NextResponse.redirect(new URL(path, request.url))
}

function localJson(path: string, status = 200) {
  return NextResponse.json({ redirect: path }, { status })
}

function transferRedirect(request: Request, reason: string) {
  const url = new URL('/dashboard/frappe-transfer', request.url)
  url.searchParams.set('handoff', reason)
  return NextResponse.redirect(url)
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const wantsJson = requestUrl.searchParams.get('format') === 'json'
  const user = await getSessionUser()
  if (!user) {
    if (wantsJson) return localJson('/login', 401)
    return localRedirect(request, '/login')
  }

  const requestedTarget = requestUrl.searchParams.get('target')

  try {
    const candidate = await ensureFrappeLoginUserForEmployee(user.id)

    if (!candidate.frappe_employee_id || !candidate.frappe_user_id) {
      if (wantsJson) return localJson('/dashboard/frappe-transfer?handoff=not-linked', 409)
      return transferRedirect(request, 'not-linked')
    }

    const handoffUrl = buildFrappeHandoffUrl({
      employeeId: candidate.employee_id,
      email: candidate.email,
      fullName: candidate.full_name,
      frappeEmployeeId: candidate.frappe_employee_id,
      frappeUserId: candidate.frappe_user_id,
      target: requestedTarget,
    })

    if (wantsJson) return NextResponse.json({ url: handoffUrl })
    return NextResponse.redirect(handoffUrl)
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Unable to open Frappe HRMS'
    const url = new URL('/dashboard/frappe-transfer', request.url)
    url.searchParams.set('handoff', 'failed')
    url.searchParams.set('message', message.slice(0, 180))
    if (wantsJson) {
      return NextResponse.json(
        { error: message.slice(0, 180), redirect: `${url.pathname}${url.search}` },
        { status: 500 },
      )
    }
    return NextResponse.redirect(url)
  }
}
