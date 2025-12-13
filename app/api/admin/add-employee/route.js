import { createClient } from '@supabase/supabase-js';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import bcrypt from 'bcrypt';
import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    // Validate critical environment configuration early
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

    // Initialize clients inside the function
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

    const body = await request.json();
    // NOW ACCEPTING 'department_ids' ARRAY INSTEAD OF SINGLE ID
    const { email, firstName, lastName, role_id, department_ids, location_id } = body;

    if (!email || !role_id) {
      return NextResponse.json({ error: 'Email and Role ID are required.' }, { status: 400 });
    }

    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4) + '!';

    // 1. Create Auth User
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName }
    });

    if (authError) return NextResponse.json({ error: authError.message }, { status: 400 });

    // 2. Create Employee Profile
    // Note: We DO NOT save department_id here anymore
    const { error: profileError } = await supabaseAdmin
      .from('employees')
      .insert({
        id: authUser.user.id,
        email: email,
        full_name: `${firstName} ${lastName}`,
        role_id: role_id,
        location_id: location_id || null,
        is_temporary_password: true,
        two_factor_enabled: false
      });

    if (profileError) {
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // Record initial password in history
    try {
      const hash = await bcrypt.hash(tempPassword, 12)
      await supabaseAdmin.from('password_history').insert({ employee_id: authUser.user.id, password_hash: hash })
    } catch (e) {
      console.error('Failed to write initial password history:', e)
    }

    // 3. LINK DEPARTMENTS (The New Logic)
    if (department_ids && department_ids.length > 0) {
      const deptInserts = department_ids.map(deptId => ({
        employee_id: authUser.user.id,
        department_id: deptId
      }));

      const { error: deptError } = await supabaseAdmin
        .from('employee_departments')
        .insert(deptInserts);

      if (deptError) {
        console.error('Failed to link departments:', deptError);
        // We don't fail the whole request, but we log it.
      }
    }

    // 4. Send Email (wrap to capture Mailgun/client URL issues)
    try {
      const senderDomain = (process.env.MAILGUN_DOMAIN || '').replace(/^https?:\/\//, '').replace(/\/$/, '');
      if (!senderDomain) {
        throw new Error('Missing or invalid MAILGUN_DOMAIN');
      }
      await mg.messages.create(senderDomain, {
        from: `${senderEmail}`,
        to: email,
        subject: 'Welcome to IMS - Your Login Details',
        text: `Hello ${firstName},\n\nYour account has been created.\n\nUsername: ${email}\nTemporary Password: ${tempPassword}\n\nPlease log in immediately to change your password.\n\nLogin here: https://ims.piyamtravel.com`
      });
    } catch (mailError) {
      console.error('Mailgun send error:', mailError);
      return NextResponse.json({ error: `Failed to send onboarding email: ${mailError.message || mailError}` }, { status: 502 });
    }

    return NextResponse.json({ success: true, message: 'User created' }, { status: 200 });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
