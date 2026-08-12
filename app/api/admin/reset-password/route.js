/**
 * POST /api/admin/reset-password
 * Admin-only password reset flow with temporary credential email delivery.
 *
 * @module app/api/admin/reset-password
 */

import { createClient } from '@supabase/supabase-js'
import formData from 'form-data'
import Mailgun from 'mailgun.js'
import bcrypt from 'bcryptjs'
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { toErrorMessage } from '@/lib/api/error'
import { apiError, apiOk } from '@/lib/api/http'
import { parseBodyWithSchema } from '@/lib/api/request'
import { requireAdminSession } from '@/lib/adminSessionAuth'
import { verifyFreshSecondFactor } from '@/lib/auth/freshSecondFactor'
import { enforceRateLimit, getClientIp } from '@/lib/security/rateLimit'

export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

const resetPasswordSchema = z
  .object({
    employee_id: z.string().trim().uuid('Invalid employee ID').optional(),
    email: z.string().trim().email('Valid employee email required').max(320).optional(),
    verificationCode: z.string().trim().max(100).optional(),
    verificationMethod: z.enum(['totp', 'backup', 'auto']).optional(),
  })
  .strict()
  .refine((body) => Boolean(body.employee_id || body.email), {
    message: 'employee_id or email is required',
  })

export async function POST(request) {
  try {
    const access = await requireAdminSession()
    if (!access.authorized) return access.response

    const limit = await enforceRateLimit(request, {
      scope: 'admin.reset-password',
      limit: 5,
      windowSeconds: 15 * 60,
      identities: [`user:${access.user.id}`, `ip:${getClientIp(request)}`],
    })
    if (!limit.allowed) return limit.response

    const { data: body, error: bodyError } = await parseBodyWithSchema(
      request,
      resetPasswordSchema,
      { maxBytes: 8 * 1024 },
    )
    if (bodyError || !body) return apiError(bodyError || 'Invalid request payload', 400)

    // Validate env
    const missingEnv = []
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingEnv.push('NEXT_PUBLIC_SUPABASE_URL')
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY')
    if (!process.env.MAILGUN_API_KEY) missingEnv.push('MAILGUN_API_KEY')
    if (!process.env.MAILGUN_DOMAIN) missingEnv.push('MAILGUN_DOMAIN')
    const senderEmail = process.env.MAILGUN_SENDER_EMAIL || process.env.MAIL_FROM_ADDRESS
    if (!senderEmail) missingEnv.push('MAILGUN_SENDER_EMAIL or MAIL_FROM_ADDRESS')
    if (missingEnv.length > 0) {
      const msg = `Missing required environment variables: ${missingEnv.join(', ')}`
      return apiError(msg, 500)
    }

    // Initialize clients inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    )

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

    const { employee_id, email, verificationCode, verificationMethod } = body

    const verification = await verifyFreshSecondFactor({
      userId: access.user.id,
      code: verificationCode,
      method: verificationMethod,
    })
    if (!verification.verified) {
      return apiError(verification.error, 403)
    }

    // Resolve user id
    let userId = employee_id
    if (!userId && email) {
      const { data: emp, error: empErr } = await supabaseAdmin
        .from('employees')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (empErr) {
        return apiError(empErr.message, 500)
      }

      if (!emp || !emp.id) {
        return apiError('No employee found for that email', 404)
      }

      userId = emp.id
    }

    // Generate temp password
    const tempPassword = `${randomBytes(12).toString('base64url')}Aa1!`

    // Check password history to prevent reuse
    try {
      const { data: prev } = await supabaseAdmin
        .from('password_history')
        .select('password_hash')
        .eq('employee_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)

      if (prev && prev.length > 0) {
        for (const row of prev) {
          const match = await bcrypt.compare(tempPassword, row.password_hash)
          if (match) {
            return apiError('Temporary password conflicts with recent password history', 400)
          }
        }
      }
    } catch {
      // Best effort guard: continue password reset when history check fails.
    }

    // Update Supabase auth user password (admin)
    try {
      // Using admin.updateUserById (supabase-js v2)
      const { data: updatedUser, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(
        userId,
        {
          password: tempPassword,
        },
      )

      if (updateErr) {
        return apiError(updateErr.message, 500)
      }
    } catch (e) {
      return apiError(toErrorMessage(e, 'Failed to update user password'), 500)
    }

    // Mark employee as temporary password
    try {
      await supabaseAdmin.from('employees').update({ is_temporary_password: true }).eq('id', userId)
    } catch {
      // Best effort update: password reset has already succeeded in auth provider.
    }

    // Record password history for this temp password
    try {
      const hash = await bcrypt.hash(tempPassword, 12)
      await supabaseAdmin
        .from('password_history')
        .insert({ employee_id: userId, password_hash: hash })
      // Trim to last 5
      const { data: rows } = await supabaseAdmin
        .from('password_history')
        .select('id')
        .eq('employee_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      const keepIds = (rows || []).map((r) => r.id).filter(Boolean)
      if (keepIds.length > 0) {
        await supabaseAdmin
          .from('password_history')
          .delete()
          .eq('employee_id', userId)
          .not('id', 'in', `(${keepIds.join(',')})`)
      }
    } catch {
      // Best effort history write: do not fail reset if history logging fails.
    }

    // Fetch email to notify
    let notifyEmail = email
    if (!notifyEmail) {
      const { data: empRow } = await supabaseAdmin
        .from('employees')
        .select('email, full_name')
        .eq('id', userId)
        .maybeSingle()
      if (empRow && empRow.email) notifyEmail = empRow.email
    }

    if (!notifyEmail) {
      return apiError('Could not determine email for employee', 500)
    }

    // Send email
    try {
      const senderDomain = (process.env.MAILGUN_DOMAIN || '')
        .replace(/^https?:\/\//, '')
        .replace(/\/$/, '')
      if (!senderDomain) throw new Error('Missing or invalid MAILGUN_DOMAIN')
      await mg.messages.create(senderDomain, {
        from: `${senderEmail}`,
        to: notifyEmail,
        subject: 'IMS - Password Reset by Admin',
        text: `Hello,\n\nYour password has been reset by an administrator.\n\nUsername: ${notifyEmail}\nTemporary Password: ${tempPassword}\n\nPlease log in and change your password immediately.\n\nLogin here: https://ims.piyamtravel.com`,
      })
    } catch (mailError) {
      return apiError(
        `Failed to send email: ${toErrorMessage(mailError, 'Unknown mail error')}`,
        502,
      )
    }

    return apiOk({ resetUserId: userId, message: 'Password reset and emailed' })
  } catch (error) {
    return apiError(toErrorMessage(error, 'Password reset failed'), 500)
  }
}
