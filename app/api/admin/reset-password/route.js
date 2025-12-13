import { createClient } from '@supabase/supabase-js';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { NextResponse } from 'next/server';
import bcrypt from 'bcrypt';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mailgun = new Mailgun(formData);
const rawMailgunEndpoint = process.env.MAILGUN_ENDPOINT || 'https://api.mailgun.net';
const mailgunEndpoint = /^https?:\/\//i.test(rawMailgunEndpoint) ? rawMailgunEndpoint : `https://${rawMailgunEndpoint}`;
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY,
  url: mailgunEndpoint
});

export async function POST(request) {
  try {
    // Validate env
    const missingEnv = [];
    if (!process.env.NEXT_PUBLIC_SUPABASE_URL) missingEnv.push('NEXT_PUBLIC_SUPABASE_URL');
    if (!process.env.SUPABASE_SERVICE_ROLE_KEY) missingEnv.push('SUPABASE_SERVICE_ROLE_KEY');
    if (!process.env.MAILGUN_API_KEY) missingEnv.push('MAILGUN_API_KEY');
    if (!process.env.MAILGUN_DOMAIN) missingEnv.push('MAILGUN_DOMAIN');
      const senderEmail = process.env.MAILGUN_SENDER_EMAIL || process.env.MAIL_FROM_ADDRESS;
      if (!senderEmail) missingEnv.push('MAILGUN_SENDER_EMAIL or MAIL_FROM_ADDRESS');
    if (missingEnv.length > 0) {
      const msg = `Missing required environment variables: ${missingEnv.join(', ')}`;
      console.error(msg);
      return NextResponse.json({ error: msg }, { status: 500 });
    }

    const body = await request.json();
    const { employee_id, email } = body;

    if (!employee_id && !email) {
      return NextResponse.json({ error: 'employee_id or email is required' }, { status: 400 });
    }

    // Resolve user id
    let userId = employee_id;
    if (!userId && email) {
      const { data: emp, error: empErr } = await supabaseAdmin
        .from('employees')
        .select('id')
        .eq('email', email)
        .maybeSingle();

      if (empErr) {
        console.error('Failed to lookup employee by email:', empErr);
        return NextResponse.json({ error: empErr.message }, { status: 500 });
      }

      if (!emp || !emp.id) {
        return NextResponse.json({ error: 'No employee found for that email' }, { status: 404 });
      }

      userId = emp.id;
    }

    // Generate temp password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4) + '!';

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
            return NextResponse.json({ error: 'Temporary password conflicts with recent password history' }, { status: 400 })
          }
        }
      }
    } catch (e) {
      console.error('Password history check failed:', e)
    }

    // Update Supabase auth user password (admin)
    try {
      // Using admin.updateUserById (supabase-js v2)
      const { data: updatedUser, error: updateErr } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword
      });

      if (updateErr) {
        console.error('Failed to update user password:', updateErr);
        return NextResponse.json({ error: updateErr.message }, { status: 500 });
      }
    } catch (e) {
      console.error('Unexpected error updating password:', e);
      return NextResponse.json({ error: e.message || e }, { status: 500 });
    }

    // Mark employee as temporary password
    try {
      await supabaseAdmin
        .from('employees')
        .update({ is_temporary_password: true })
        .eq('id', userId);
    } catch (e) {
      console.error('Failed to mark employee temp password:', e);
    }

    // Record password history for this temp password
    try {
      const hash = await bcrypt.hash(tempPassword, 12)
      await supabaseAdmin.from('password_history').insert({ employee_id: userId, password_hash: hash })
      // Trim to last 5
      const { data: rows } = await supabaseAdmin
        .from('password_history')
        .select('id')
        .eq('employee_id', userId)
        .order('created_at', { ascending: false })
        .limit(5)
      const keepIds = (rows || []).map(r => r.id).filter(Boolean)
      if (keepIds.length > 0) {
        await supabaseAdmin
          .from('password_history')
          .delete()
          .eq('employee_id', userId)
          .not('id', 'in', `(${keepIds.join(',')})`)
      }
    } catch (e) {
      console.error('Failed to write password history:', e)
    }

    // Fetch email to notify
    let notifyEmail = email;
    if (!notifyEmail) {
      const { data: empRow } = await supabaseAdmin
        .from('employees')
        .select('email, full_name')
        .eq('id', userId)
        .maybeSingle();
      if (empRow && empRow.email) notifyEmail = empRow.email;
    }

    if (!notifyEmail) {
      return NextResponse.json({ error: 'Could not determine email for employee' }, { status: 500 });
    }

    // Send email
    try {
      const senderDomain = (process.env.MAILGUN_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!senderDomain) throw new Error('Missing or invalid MAILGUN_DOMAIN');
      await mg.messages.create(senderDomain, {
        from: `${senderEmail}`,
        to: notifyEmail,
        subject: 'IMS - Password Reset by Admin',
        text: `Hello,\n\nYour password has been reset by an administrator.\n\nUsername: ${notifyEmail}\nTemporary Password: ${tempPassword}\n\nPlease log in and change your password immediately.\n\nLogin here: https://ims.piyamtravel.com`
      });
    } catch (mailError) {
      console.error('Mailgun send error:', mailError);
      return NextResponse.json({ error: `Failed to send email: ${mailError.message || mailError}` }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: 'Password reset and emailed' }, { status: 200 });
  } catch (error) {
    console.error('Reset API Error:', error);
    return NextResponse.json({ error: error.message || error }, { status: 500 });
  }
}
