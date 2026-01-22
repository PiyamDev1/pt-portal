import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import formData from 'form-data';
import Mailgun from 'mailgun.js';
import bcrypt from 'bcryptjs';
import { NextResponse } from 'next/server';

// Force dynamic rendering so the API is always evaluated and not statically optimized
export const dynamic = 'force-dynamic'
export const runtime = 'nodejs'

// Health/diagnostic GET to confirm route is reachable in production
export async function GET(request) {
  const origin = request.headers.get('origin') || '*'
  return NextResponse.json({ ok: true, route: 'add-employee', method: 'GET', note: 'route is reachable' }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin'
    }
  })
}

// Explicitly handle CORS/preflight to avoid 405 from OPTIONS requests and echo diagnostics
export async function OPTIONS(request) {
  const origin = request.headers.get('origin') || '*'
  return NextResponse.json({ ok: true }, {
    status: 200,
    headers: {
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Origin': origin,
      Vary: 'Origin'
    }
  })
}

export async function POST(request) {
  try {
    const origin = request.headers.get('origin') || 'unknown'
    console.log('[add-employee] request received from', origin)
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
      return NextResponse.json({ error: msg }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
    }

    // Initialize clients inside the function
    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY
    );

    // Check if caller is authenticated and has admin role
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      {
        cookies: {
          getAll() { return cookieStore.getAll() },
          setAll() {}
        }
      }
    );

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      console.log('[add-employee] unauthorized: user not authenticated');
      return NextResponse.json({ error: 'Unauthorized: not authenticated' }, { status: 401, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
    }

    // Verify user has admin role
    const { data: employee, error: empError } = await supabaseAdmin
      .from('employees')
      .select('id, role_id')
      .eq('id', user.id)
      .maybeSingle();

    if (empError || !employee) {
      console.log('[add-employee] unauthorized: employee not found');
      return NextResponse.json({ error: 'Unauthorized: employee profile not found' }, { status: 403, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
    }

    // Get the role name for the employee
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('roles')
      .select('name')
      .eq('id', employee.role_id)
      .maybeSingle();

    if (roleError || !roleData) {
      console.log('[add-employee] unauthorized: role not found');
      return NextResponse.json({ error: 'Unauthorized: role not found' }, { status: 403, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
    }

    // Only Master Admin and Admin can add employees
    const isAdmin = ['Admin', 'Master Admin'].includes(roleData.name);
    if (!isAdmin) {
      console.log(`[add-employee] unauthorized: user role "${roleData.name}" is not admin`);
      return NextResponse.json({ error: 'Unauthorized: only admins can add employees' }, { status: 403, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
    }

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

    if (authError) return NextResponse.json({ error: authError.message }, { status: 400, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });

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
      return NextResponse.json({ error: profileError.message }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
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
      
      // Fetch location/branch details if location_id is provided
      let locationHTML = '';
      let locationText = '';
      if (location_id) {
        const { data: locationData } = await supabaseAdmin
          .from('locations')
          .select('name, branch_code')
          .eq('id', location_id)
          .maybeSingle();
        
        if (locationData) {
          locationHTML = `<tr><td style="padding: 8px 0; color: #475569; font-size: 14px;"><strong>Branch/Location:</strong> ${locationData.name} (${locationData.branch_code})</td></tr>`;
          locationText = `\nBranch/Location: ${locationData.name} (${locationData.branch_code})`;
        }
      }
      
      // HTML email template
      const htmlTemplate = `
        <html>
          <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
            <div style="max-width: 600px; margin: 0 auto; padding: 20px;">
              <div style="background: linear-gradient(135deg, #1e3a8a 0%, #1e40af 100%); color: white; padding: 30px; border-radius: 8px; text-align: center; margin-bottom: 20px;">
                <h1 style="margin: 0; font-size: 24px;">Welcome to Piyam Travels IMS</h1>
              </div>
              
              <div style="background: #f1f5f9; padding: 20px; border-radius: 8px; margin-bottom: 20px;">
                <p style="margin-top: 0;">Hello <strong>${firstName}</strong>,</p>
                <p>Your account has been created in the Piyam Travels Portal. Use the credentials below to log in:</p>
                
                <div style="background: white; padding: 15px; border-radius: 6px; margin: 15px 0; border-left: 4px solid #1e40af;">
                  <table style="width: 100%;">
                    <tr><td style="padding: 8px 0; color: #475569; font-size: 14px;"><strong>Email:</strong> ${email}</td></tr>
                    <tr><td style="padding: 8px 0; color: #475569; font-size: 14px;"><strong>Temporary Password:</strong> ${tempPassword}</td></tr>
                    ${locationHTML}
                  </table>
                </div>
              </div>
              
              <div style="background: #fef3c7; border: 1px solid #f59e0b; padding: 15px; border-radius: 6px; margin-bottom: 20px;">
                <p style="margin: 0; color: #92400e; font-size: 14px;">
                  <strong>⚠️ Important:</strong> Please log in immediately and change your temporary password.
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
      `;
      
      await mg.messages.create(senderDomain, {
        from: `${senderEmail}`,
        to: email,
        subject: 'Welcome to IMS - Your Login Details',
        text: `Hello ${firstName},\n\nYour account has been created.\n\nEmail: ${email}\nTemporary Password: ${tempPassword}${locationText}\n\nPlease log in immediately to change your password.\n\nLogin here: https://ims.piyamtravel.com`,
        html: htmlTemplate
      });
    } catch (mailError) {
      console.error('Mailgun send error:', mailError);
      return NextResponse.json({ error: `Failed to send onboarding email: ${mailError.message || mailError}` }, { status: 502, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
    }

    return NextResponse.json({ success: true, message: 'User created' }, { status: 200, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });

  } catch (error) {
    console.error('API Error:', error);
    const origin = request.headers.get('origin') || '*'
    return NextResponse.json({ error: error.message, note: 'add-employee handler catch' }, { status: 500, headers: { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } });
  }
}
