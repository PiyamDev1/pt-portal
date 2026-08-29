/**
 * GET/POST /api/admin/add-employee
 * Healthcheck and employee onboarding endpoint with auth and notification email.
 *
 * @module app/api/admin/add-employee
 */

import formData from 'form-data'
import Mailgun from 'mailgun.js'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { apiOk, apiError } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { getServiceSupabaseClient } from '@/lib/api/serviceSupabase'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'
import { generateTemporaryPassword } from '@/lib/security/secureRandom.server'
import { logServerEvent, reportOperationalError } from '@/lib/observability/server'

// Force dynamic rendering so the API is always evaluated and not statically optimized.
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const corsHeaders = (origin) => ({
  'Access-Control-Allow-Origin': origin,
  Vary: 'Origin',
})

const nameSchema = (label) =>
  z
    .string({ error: `${label} is required.` })
    .trim()
    .min(1, `${label} is required.`)
    .max(100, `${label} is too long.`)
    .refine(
      (value) => !/[\u0000-\u001f\u007f]/.test(value),
      `${label} contains invalid characters.`,
    )

const addEmployeeSchema = z
  .object({
    email: z
      .string({ error: 'Email and Role ID are required.' })
      .trim()
      .min(1, 'Email and Role ID are required.')
      .max(320, 'Email address is too long.')
      .email('A valid email address is required.')
      .transform((email) => email.toLowerCase()),
    role_id: z.string({ error: 'Email and Role ID are required.' }).trim().uuid('Invalid Role ID.'),
    department_ids: z
      .array(z.string().trim().uuid('Invalid department ID.'), {
        error: 'At least one department is required.',
      })
      .min(1, 'At least one department is required.')
      .max(50, 'Too many departments selected.')
      .refine(
        (departmentIds) => new Set(departmentIds).size === departmentIds.length,
        'Duplicate departments are not allowed.',
      ),
    firstName: nameSchema('First name'),
    lastName: nameSchema('Last name'),
    location_id: z
      .union([z.literal(''), z.string().trim().uuid('Invalid location ID.')])
      .nullish()
      .transform((locationId) => locationId || null),
  })
  .strict()

function withCors(response, origin) {
  response.headers.set('Access-Control-Allow-Origin', origin)
  response.headers.set('Vary', 'Origin')
  return response
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;')
}

/**
 * Remove a partially provisioned identity. If deletion is initially blocked by
 * a database dependency, ban the identity before removing dependent rows and
 * retrying. This avoids leaving a login-capable orphan behind.
 */
async function rollbackProvisionedEmployee(admin, userId) {
  try {
    const firstDelete = await admin.auth.admin.deleteUser(userId)
    if (!firstDelete?.error) return { contained: true, complete: true }
  } catch {
    // Continue to the containment path below.
  }

  let banSucceeded = false
  try {
    const banResult = await admin.auth.admin.updateUserById(userId, {
      ban_duration: '876000h',
      user_metadata: { onboarding_failed: true },
    })
    banSucceeded = !banResult?.error
  } catch {
    banSucceeded = false
  }

  let databaseCleanupSucceeded = true
  for (const [table, column] of [
    ['employee_departments', 'employee_id'],
    ['password_history', 'employee_id'],
    ['employees', 'id'],
  ]) {
    try {
      const { error } = await admin.from(table).delete().eq(column, userId)
      if (error) databaseCleanupSucceeded = false
    } catch {
      databaseCleanupSucceeded = false
    }
  }

  let retryDeleteSucceeded = false
  try {
    const retryDelete = await admin.auth.admin.deleteUser(userId)
    retryDeleteSucceeded = !retryDelete?.error
  } catch {
    retryDeleteSucceeded = false
  }

  return {
    contained: retryDeleteSucceeded || banSucceeded,
    complete: retryDeleteSucceeded && databaseCleanupSucceeded,
  }
}

async function reportProvisioningFailure({ request, access, userId, stage, rollback }) {
  const context = {
    actorUserId: access.user.id,
    createdUserId: userId,
    stage,
    rollbackContained: rollback.contained,
    rollbackComplete: rollback.complete,
  }

  if (!rollback.contained || !rollback.complete) {
    await reportOperationalError({
      event: 'admin.employee_onboarding_rollback_incomplete',
      request,
      error: new Error('Employee onboarding rollback was incomplete'),
      alert: true,
      context,
    })
    return
  }

  logServerEvent({
    event: 'admin.employee_onboarding_rolled_back',
    level: 'warn',
    request,
    context,
  })
}

// Health/diagnostic GET to confirm route is reachable in production.
export async function GET(request) {
  const origin = request.headers.get('origin') || '*'
  return apiOk(
    { route: 'add-employee', method: 'GET', note: 'route is reachable' },
    {
      status: 200,
      headers: corsHeaders(origin),
    },
  )
}

// Explicitly handle CORS/preflight to avoid 405 from OPTIONS requests and echo diagnostics.
export async function OPTIONS(request) {
  const origin = request.headers.get('origin') || '*'
  return apiOk(
    { route: 'add-employee', method: 'OPTIONS' },
    {
      status: 200,
      headers: {
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        ...corsHeaders(origin),
      },
    },
  )
}

export async function POST(request) {
  const origin = request.headers.get('origin') || '*'
  const fail = (message, status = 400) =>
    apiError(message, status, {}, { headers: corsHeaders(origin) })
  let authenticatedAccess = null
  let admin = null
  let provisionedUserId = null
  let provisioningComplete = false

  try {
    const access = await requireAdminSession()
    if (!access.authorized) return withCors(access.response, origin)
    authenticatedAccess = access

    const limit = await enforceRateLimit(request, {
      scope: 'admin.add-employee',
      limit: 20,
      windowSeconds: 60 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
      message: 'Too many employee creation attempts. Please wait before trying again.',
    })
    if (!limit.allowed) return withCors(limit.response, origin)

    const { data: body, error: bodyError } = await parseBodyWithSchema(request, addEmployeeSchema, {
      maxBytes: 16 * 1024,
    })
    if (bodyError || !body) return fail(bodyError || 'Invalid request payload', 400)

    const missingEnv = []
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingEnv.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY')
    if (!process.env.MAILGUN_API_KEY) missingEnv.push('MAILGUN_API_KEY')
    if (!process.env.MAILGUN_DOMAIN) missingEnv.push('MAILGUN_DOMAIN')
    const senderEmail = process.env.MAILGUN_SENDER_EMAIL || process.env.MAIL_FROM_ADDRESS
    if (!senderEmail) missingEnv.push('MAILGUN_SENDER_EMAIL or MAIL_FROM_ADDRESS')
    if (missingEnv.length > 0) {
      return fail(`Missing required environment variables: ${missingEnv.join(', ')}`, 500)
    }

    admin = getServiceSupabaseClient()
    const { email, firstName, lastName, role_id, department_ids, location_id } = body

    const roleQuery = admin.from('roles').select('id, name').eq('id', role_id).maybeSingle()
    const departmentsQuery = admin.from('departments').select('id, name').in('id', department_ids)
    const locationQuery = location_id
      ? admin.from('locations').select('id, name, branch_code').eq('id', location_id).maybeSingle()
      : Promise.resolve({ data: null, error: null })

    const [roleResult, departmentResult, locationResult] = await Promise.all([
      roleQuery,
      departmentsQuery,
      locationQuery,
    ])

    if (roleResult.error || departmentResult.error || locationResult.error) {
      return fail('Unable to validate employee assignments.', 503)
    }
    if (!roleResult.data) return fail('Invalid Role ID.', 400)

    const existingDepartmentIds = new Set(
      (departmentResult.data || []).map((department) => department.id),
    )
    if (department_ids.some((departmentId) => !existingDepartmentIds.has(departmentId))) {
      return fail('One or more departments are invalid.', 400)
    }
    if (location_id && !locationResult.data) return fail('Invalid location ID.', 400)

    const privilegedRoles = new Set(['master admin', 'super admin'])
    const assignsHrDepartment = (departmentResult.data || []).some((department) =>
      ['hr', 'humanresource', 'humanresources'].includes(
        String(department.name || '')
          .trim()
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, ''),
      ),
    )
    if (assignsHrDepartment && !privilegedRoles.has(access.employee.role.trim().toLowerCase())) {
      return fail('Only a Master Admin can assign the HR department.', 403)
    }
    if (
      privilegedRoles.has(
        String(roleResult.data.name || '')
          .trim()
          .toLowerCase(),
      ) &&
      !privilegedRoles.has(access.employee.role.trim().toLowerCase())
    ) {
      return fail('Only a Master Admin can assign this role.', 403)
    }

    const mailgun = new Mailgun(formData)
    const rawMailgunEndpoint = process.env.MAILGUN_ENDPOINT || 'https://api.mailgun.net'
    const mailgunEndpoint = /^https?:\/\//i.test(rawMailgunEndpoint)
      ? rawMailgunEndpoint
      : `https://${rawMailgunEndpoint}`
    const mg = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY,
      url: mailgunEndpoint,
    })

    const tempPassword = generateTemporaryPassword()
    const { data: authUser, error: authError } = await admin.auth.admin.createUser({
      email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName },
    })

    if (authError || !authUser?.user?.id) {
      return fail(authError?.message || 'Failed to create user.', 400)
    }

    const createdUserId = authUser.user.id
    provisionedUserId = createdUserId
    const failAfterProvisioning = async (message, status, stage) => {
      const rollback = await rollbackProvisionedEmployee(admin, createdUserId)
      await reportProvisioningFailure({
        request,
        access,
        userId: createdUserId,
        stage,
        rollback,
      })
      return fail(message, status)
    }

    const { error: profileError } = await admin.from('employees').insert({
      id: createdUserId,
      email,
      full_name: `${firstName} ${lastName}`,
      role_id,
      location_id,
      is_temporary_password: true,
      two_factor_enabled: false,
    })
    if (profileError) {
      return failAfterProvisioning('Failed to create employee profile.', 500, 'profile')
    }

    const passwordHash = await bcrypt.hash(tempPassword, 12)
    const { error: historyError } = await admin.from('password_history').insert({
      employee_id: createdUserId,
      password_hash: passwordHash,
    })
    if (historyError) {
      return failAfterProvisioning('Failed to initialize employee security state.', 500, 'history')
    }

    const { error: departmentError } = await admin.from('employee_departments').insert(
      department_ids.map((departmentId) => ({
        employee_id: createdUserId,
        department_id: departmentId,
      })),
    )
    if (departmentError) {
      return failAfterProvisioning('Failed to assign employee departments.', 500, 'departments')
    }

    const locationData = locationResult.data
    const safeFirstName = escapeHtml(firstName)
    const safeEmail = escapeHtml(email)
    let locationHtml = ''
    let locationText = ''
    if (locationData) {
      const safeLocationName = escapeHtml(locationData.name || '')
      const safeBranchCode = escapeHtml(locationData.branch_code || '')
      locationHtml = `<tr><td style="padding: 8px 0; color: #475569; font-size: 14px;"><strong>Branch/Location:</strong> ${safeLocationName} (${safeBranchCode})</td></tr>`
      locationText = `\nBranch/Location: ${locationData.name || ''} (${locationData.branch_code || ''})`
    }

    const senderDomain = process.env.MAILGUN_DOMAIN.replace(/^https?:\/\//, '').replace(/\/$/, '')
    if (!senderDomain) {
      return failAfterProvisioning('Failed to send onboarding email.', 502, 'email_config')
    }

    const htmlTemplate = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
            <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 30px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
              <h1 style="margin: 0; font-size: 24px;">Welcome to Piyam Travels IMS</h1>
            </div>

            <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
              <p style="margin-top: 0;">Hello <strong>${safeFirstName}</strong>,</p>
              <p>Your account has been created in the Piyam Travels Portal. Use the credentials below to log in:</p>

              <div style="background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #1e40af;">
                <table style="width: 100%;">
                  <tr><td style="padding: 8px 0; color: #475569; font-size: 14px;"><strong>Email:</strong> ${safeEmail}</td></tr>
                  <tr><td style="padding: 8px 0; color: #475569; font-size: 14px;"><strong>Temporary Password:</strong> ${escapeHtml(tempPassword)}</td></tr>
                  ${locationHtml}
                </table>
              </div>
            </div>

            <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
              <p style="margin: 0; color: #92400e; font-size: 14px;">
                <strong>Important:</strong> Please log in immediately and change your temporary password.
              </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="https://ims.piyamtravel.com" style="background: #1e40af; color: white; padding: 12px 30px; text-decoration: none; border-radius: 6px; display: inline-block; font-weight: bold;">Log In Now</a>
            </div>

            <div style="color: #64748b; font-size: 12px; text-align: center; margin-top: 30px; padding-top: 20px; border-top: 1px solid #e2e8f0;">
              <p>If you did not request this account, please contact your administrator.</p>
              <p>© 2026 Piyam Travels. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `

    try {
      await mg.messages.create(senderDomain, {
        from: `${senderEmail}`,
        to: email,
        subject: 'Welcome to IMS - Your Login Details',
        text: `Hello ${firstName},\n\nYour account has been created.\n\nEmail: ${email}\nTemporary Password: ${tempPassword}${locationText}\n\nPlease log in immediately to change your password.\n\nLogin here: https://ims.piyamtravel.com`,
        html: htmlTemplate,
      })
    } catch {
      return failAfterProvisioning('Failed to send onboarding email.', 502, 'email')
    }

    provisioningComplete = true
    try {
      logServerEvent({
        event: 'admin.employee_onboarding_succeeded',
        request,
        context: {
          actorUserId: access.user.id,
          createdUserId,
          departmentCount: department_ids.length,
        },
      })
    } catch {
      // Telemetry is non-critical after provisioning and email delivery both succeed.
    }

    return apiOk(
      { createdUserId, message: 'User created' },
      { status: 200, headers: corsHeaders(origin) },
    )
  } catch {
    let rollback = null
    if (admin && provisionedUserId && !provisioningComplete) {
      rollback = await rollbackProvisionedEmployee(admin, provisionedUserId)
    }
    await reportOperationalError({
      event: 'admin.employee_onboarding_failed',
      request,
      error: new Error('Unhandled employee onboarding failure'),
      alert: true,
      context: {
        actorUserId: authenticatedAccess?.user?.id,
        createdUserId: provisionedUserId,
        rollbackContained: rollback?.contained,
        rollbackComplete: rollback?.complete,
      },
    })
    return fail('Failed to create employee.', 500)
  }
}
