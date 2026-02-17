import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Resend } from 'resend';
import { Pool } from 'pg';

function setCorsHeaders(res: VercelResponse, origin: string | undefined) {
  const allowedOrigins = [
    'http://localhost:8080',
    'http://localhost:3000',
    'http://localhost:5173',
    'https://kiora-care.vercel.app',
    'https://kiora-care-backend.vercel.app',
    'https://www.kiora.care',
    'https://kiora.care'
  ];
  
  const envOrigins = process.env.ALLOWED_ORIGIN 
    ? (process.env.ALLOWED_ORIGIN === '*' ? ['*'] : process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim()))
    : [];
  
  const allOrigins = [...allowedOrigins, ...envOrigins];
  const requestOrigin = origin ? origin.trim() : '';
  
  let originToUse: string;
  
  if (allOrigins.includes('*')) {
    // If wildcard is allowed, use the request origin if present, otherwise use '*'
    originToUse = requestOrigin || '*';
  } else if (requestOrigin && allOrigins.includes(requestOrigin)) {
    originToUse = requestOrigin;
  } else if (allOrigins.length > 0) {
    originToUse = allOrigins[0];
  } else {
    originToUse = '*';
  }
  
  // Ensure no invalid characters (newlines, carriage returns)
  originToUse = originToUse.replace(/[\r\n]/g, '');
  
  res.setHeader('Access-Control-Allow-Origin', originToUse);
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  try {
    const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : undefined;
    setCorsHeaders(res, origin);
  } catch (error) {
    // If CORS setup fails, still set basic headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  }

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    
    // Validate required fields
    if (!body.fullName || typeof body.fullName !== 'string' || body.fullName.trim() === '') {
      return res.status(400).json({ error: 'fullName is required' });
    }
    if (!body.phoneNumber || typeof body.phoneNumber !== 'string' || body.phoneNumber.trim() === '') {
      return res.status(400).json({ error: 'phoneNumber is required' });
    }
    if (!body.emailAddress || typeof body.emailAddress !== 'string' || body.emailAddress.trim() === '') {
      return res.status(400).json({ error: 'emailAddress is required' });
    }
    if (!body.agreeToContact) {
      return res.status(400).json({ error: 'agreeToContact must be true' });
    }

    // Send email using Resend
    const resendApiKey = process.env.RESEND_API_KEY;
    if (!resendApiKey) {
      console.error('RESEND_API_KEY is not set');
      return res.status(500).json({ error: 'Server configuration error: RESEND_API_KEY missing' });
    }

    console.log('Initializing Resend with API key (length):', resendApiKey.length);
    const resend = new Resend(resendApiKey);
    const targetEmail = process.env.TARGET_EMAIL || 'care@kiora.care';
    const formType = body.formType === 'schedule-test' ? 'schedule-test' : 'contact';
    
    // Save to database if available
    let dbRecordId = null;
    if (process.env.DATABASE_URL) {
      try {
        const pool = new Pool({
          connectionString: process.env.DATABASE_URL,
          ssl: process.env.DATABASE_URL.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : false
        });
        
        // Create table if it doesn't exist
        const createTableQuery = `
          CREATE TABLE IF NOT EXISTS form_submissions (
            id SERIAL PRIMARY KEY,
            form_type VARCHAR(50) NOT NULL,
            user_type VARCHAR(50),
            full_name VARCHAR(255) NOT NULL,
            email_address VARCHAR(255) NOT NULL,
            phone_number VARCHAR(50) NOT NULL,
            gender VARCHAR(50),
            address VARCHAR(512),
            city VARCHAR(255),
            state VARCHAR(255),
            pincode VARCHAR(20),
            message TEXT,
            selected_plan VARCHAR(50),
            agree_to_contact BOOLEAN DEFAULT false,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
          );

          CREATE INDEX IF NOT EXISTS idx_form_submissions_email ON form_submissions(email_address);
          CREATE INDEX IF NOT EXISTS idx_form_submissions_created_at ON form_submissions(created_at);
          CREATE INDEX IF NOT EXISTS idx_form_submissions_form_type ON form_submissions(form_type);
        `;
        await pool.query(createTableQuery);
        
        // Add state/address columns if table already existed without them
        try {
          await pool.query('ALTER TABLE form_submissions ADD COLUMN state VARCHAR(255)');
        } catch (e: any) {
          if (e.code !== '42701') throw e; // Ignore if column already exists
        }
        try {
          await pool.query('ALTER TABLE form_submissions ADD COLUMN address VARCHAR(512)');
        } catch (e: any) {
          if (e.code !== '42701') throw e; // Ignore if column already exists
        }
        
        const insertQuery = `
          INSERT INTO form_submissions (
            form_type, user_type, full_name, email_address, phone_number, gender,
            address, city, state, pincode, message, selected_plan, agree_to_contact
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
          RETURNING id
        `;
        const result = await pool.query(insertQuery, [
          formType,
          body.userType || null,
          body.fullName,
          body.emailAddress,
          body.phoneNumber,
          body.gender || null,
          body.address || null,
          body.city || null,
          body.state || null,
          body.pincode || null,
          body.message || null,
          body.selectedPlan || null,
          body.agreeToContact || false
        ]);
        dbRecordId = result.rows[0].id;
        console.log('✅ Form submission saved to database with ID:', dbRecordId);
        await pool.end();
      } catch (dbError: any) {
        console.error('⚠️ Failed to save to database (continuing with email):', dbError.message);
        // Don't fail the request if database save fails, just log it
      }
    }
    
    const userTypeLabel = body.userType === 'doctor' ? 'Doctor' : body.userType === 'patient' ? 'Patient' : 'Not specified';
    
    const escapeHtml = (text: string | null | undefined): string => {
      if (!text) return '';
      return String(text)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
    };

    const safeFullName = escapeHtml(body.fullName);
    const safePhone = escapeHtml(body.phoneNumber);
    const safeEmail = escapeHtml(body.emailAddress);
    const safeCity = escapeHtml(body.city) || 'Not provided';
    const safePincode = escapeHtml(body.pincode) || 'Not provided';
    const safeMessage = body.message ? escapeHtml(body.message).replace(/\n/g, '<br>') : 'No message provided';

    const htmlContent = 
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}' +
      '.header{background-color:#1190ff;color:white;padding:20px;border-radius:8px 8px 0 0;text-align:center}' +
      '.content{background-color:#f9f9f9;padding:20px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px}' +
      '.field{margin-bottom:15px;padding-bottom:15px;border-bottom:1px solid #eee}' +
      '.field:last-child{border-bottom:none}' +
      '.label{font-weight:bold;color:#555;display:block;margin-bottom:5px}' +
      '.value{color:#333}' +
      '.message-box{background-color:white;padding:15px;border-left:4px solid #1190ff;margin-top:10px}' +
      '</style></head><body>' +
      '<div class="header"><h1>New Contact Form Submission</h1><p>Kiora Website</p></div>' +
      '<div class="content">' +
      '<div class="field"><span class="label">User Type:</span><span class="value">' + userTypeLabel + '</span></div>' +
      '<div class="field"><span class="label">Full Name:</span><span class="value">' + safeFullName + '</span></div>' +
      '<div class="field"><span class="label">Phone Number:</span><span class="value">' + safePhone + '</span></div>' +
      '<div class="field"><span class="label">Email Address:</span><span class="value">' + safeEmail + '</span></div>' +
      '<div class="field"><span class="label">City:</span><span class="value">' + safeCity + '</span></div>' +
      '<div class="field"><span class="label">Pincode:</span><span class="value">' + safePincode + '</span></div>' +
      '<div class="field"><span class="label">Message:</span><div class="message-box">' + safeMessage + '</div></div>' +
      '<div class="field"><span class="label">Agreed to Contact:</span><span class="value">' + (body.agreeToContact ? 'Yes' : 'No') + '</span></div>' +
      '</div></body></html>';

    try {
      const emailResult = await resend.emails.send({
        from: 'Kiora Care <noreply@kiora.care>',
        to: targetEmail,
        subject: 'New Contact Form Submission from Kiora Website',
        html: htmlContent,
      });

      if (emailResult.error) {
        console.error('Resend API error:', JSON.stringify(emailResult.error, null, 2));
        // Return error details for debugging
        return res.status(500).json({ 
          error: 'Failed to send email',
          details: emailResult.error,
          message: emailResult.error?.message || 'Unknown Resend error'
        });
      }

      console.log('Email sent successfully:', emailResult.data);
      return res.status(200).json({ 
        message: 'Email sent successfully', 
        data: {
          submissionId: dbRecordId,
          email: emailResult.data
        }
      });
    } catch (resendError) {
      console.error('Resend exception:', resendError);
      return res.status(500).json({ 
        error: 'Failed to send email',
        message: resendError instanceof Error ? resendError.message : 'Resend API exception',
        details: resendError
      });
    }

  } catch (error) {
    console.error('Error processing contact form:', error);
    return res.status(500).json({ 
      error: 'Failed to send email',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}
