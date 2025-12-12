import { createClient } from '@supabase/supabase-js';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import { NextResponse } from 'next/server';

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const mailgun = new Mailgun(formData);
const mg = mailgun.client({
  username: 'api',
  key: process.env.MAILGUN_API_KEY,
  url: process.env.MAILGUN_ENDPOINT
});

export async function POST(request) {
  try {
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
