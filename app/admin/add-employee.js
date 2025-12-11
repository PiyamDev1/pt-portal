import formData from 'form-data';
import Mailgun from 'mailgun.js';
import bcrypt from 'bcrypt';
// IMPORT YOUR DATABASE CONNECTION HERE
// Example: import db from '@/lib/db'; or import { query } from '@/lib/db';

export default async function handler(req, res) {
  // 1. Only allow POST requests
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { email, firstName, lastName, role } = req.body;

  if (!email || !firstName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  try {
    // 2. Generate a Random Temporary Password (12 chars)
    // This creates a string like: "aB3$fG9!zX2@"
    const tempPassword = Math.random().toString(36).slice(-8) + Math.random().toString(36).slice(-4) + '!';
    
    // 3. Hash the password for security
    const hashedPassword = await bcrypt.hash(tempPassword, 10);

    // 4. DATABASE INSERT (Save to 'employees' table)
    // You need to adjust this line to match your specific DB setup (Prisma, Supabase, or SQL)
    
    // --- EXAMPLE IF USING PRISMA ---
    /*
    await db.employees.create({
      data: {
        email,
        first_name: firstName,
        last_name: lastName,
        role: role,
        password: hashedPassword,
        is_temporary_password: true, // <--- The flag we just added
      },
    });
    */

    // --- EXAMPLE IF USING RAW SQL ---
    /*
    await db.query(
      `INSERT INTO employees (email, first_name, last_name, role, password, is_temporary_password) 
       VALUES ($1, $2, $3, $4, $5, TRUE)`,
      [email, firstName, lastName, role, hashedPassword]
    );
    */

    // 5. Setup Mailgun
    const mailgun = new Mailgun(formData);
    const mg = mailgun.client({
      username: 'api',
      key: process.env.MAILGUN_API_KEY,
      url: process.env.MAILGUN_ENDPOINT // 'api.eu.mailgun.net'
    });

    // 6. Send the Email
    await mg.messages.create(process.env.MAILGUN_DOMAIN, {
      from: `${process.env.MAIL_FROM_NAME} <${process.env.MAIL_FROM_ADDRESS}>`,
      to: email,
      subject: 'Welcome to IMS - Your Login Details',
      text: `Hello ${firstName},

An account has been created for you.

Username: ${email}
Temporary Password: ${tempPassword}

Please log in immediately to change your password.

Login here: https://ims.piyamtravel.com`
    });

    return res.status(200).json({ success: true, message: 'Employee added and email sent.' });

  } catch (error) {
    console.error('Error adding employee:', error);
    return res.status(500).json({ error: error.message });
  }
}