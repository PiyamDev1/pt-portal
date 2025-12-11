import { createClient } from '@supabase/supabase-js';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { NextResponse } from 'next/server';

// Initialize Supabase Admin
const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Initialize Mailgun
const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY,
  url: process.env.MAILGUN_ENDPOINT
});

export async function POST(request) {
  try {
    const body = await request.json();
    const { email, firstName, lastName, role_id, department_id, location_id } = body;

    // Validate
    if (!email || !role_id) {
      return NextResponse.json({ error: 'Email and Role ID are required.' }, { status: 400 });
    }

    // 1. Generate Temp Password
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4) + '!';

    // 2. Create Auth User
    const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
      email: email,
      password: tempPassword,
      email_confirm: true,
      user_metadata: { first_name: firstName, last_name: lastName }
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    // 3. Create Employee Record
    const { error: profileError } = await supabaseAdmin
      .from('employees')
      .insert({
        id: authUser.user.id,
        email: email,
        full_name: `${firstName} ${lastName}`,
        role_id: role_id,
        department_id: department_id || null,
        location_id: location_id || null,
        is_temporary_password: true,
        two_factor_enabled: false
      });

    if (profileError) {
      // Rollback: Delete auth user if profile fails
      await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    // 4. Send Email
    await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: `${process.env.MAILGUN_SENDER_EMAIL}`,
      to: email,
      subject: 'Welcome to IMS - Your Login Details',
      text: `Hello ${firstName},

Your account has been created.

Username: ${email}
Temporary Password: ${tempPassword}

Please log in immediately to change your password.

Login here: https://ims.piyamtravel.com`
    });

    return NextResponse.json({ success: true, message: 'User created' }, { status: 200 });

  } catch (error) {
    console.error('API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}