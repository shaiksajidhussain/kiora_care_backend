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
        try {
          await pool.query('ALTER TABLE form_submissions ADD COLUMN scheduled_date DATE');
        } catch (e: any) {
          if (e.code !== '42701') throw e; // Ignore if column already exists
        }
        try {
          await pool.query('ALTER TABLE form_submissions ADD COLUMN scheduled_time VARCHAR(20)');
        } catch (e: any) {
          if (e.code !== '42701') throw e; // Ignore if column already exists
        }
        try {
          await pool.query('ALTER TABLE form_submissions ADD COLUMN map_location TEXT');
        } catch (e: any) {
          if (e.code !== '42701') throw e; // Ignore if column already exists
        }
        
        const insertQuery = `
          INSERT INTO form_submissions (
            form_type, user_type, full_name, email_address, phone_number, gender,
            address, city, state, pincode, message, selected_plan, agree_to_contact,
            scheduled_date, scheduled_time, map_location
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
          body.agreeToContact || false,
          body.scheduledDate || null,
          body.scheduledTime || null,
          body.mapLocation || null
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
    const safeState = escapeHtml(body.state) || 'Not provided';
    const safePincode = escapeHtml(body.pincode) || 'Not provided';
    const safeAddress = escapeHtml(body.address) || 'Not provided';
    const safeMessage = body.message ? escapeHtml(body.message).replace(/\n/g, '<br>') : 'No message provided';
    const safeGender = body.gender ? escapeHtml(body.gender).charAt(0).toUpperCase() + escapeHtml(body.gender).slice(1).replace(/-/g, ' ') : null;

    const emailSubject = formType === 'schedule-test'
      ? 'Schedule a test request - Kiora Website'
      : 'New Contact Form Submission from Kiora Website';

    const confirmationSubject = formType === 'schedule-test'
      ? 'Thank you for scheduling your test with Kiora Care'
      : 'Thank you for contacting Kiora Care';

    // Generate notification email HTML (to business)
    const notificationHtml = 
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
      '<div class="header"><h1>' + (formType === 'schedule-test' ? 'Schedule a test request' : 'New Contact Form Submission') + '</h1><p>Kiora Website</p></div>' +
      '<div class="content">' +
      '<div class="field"><span class="label">User Type:</span><span class="value">' + userTypeLabel + '</span></div>' +
      '<div class="field"><span class="label">Full Name:</span><span class="value">' + safeFullName + '</span></div>' +
      '<div class="field"><span class="label">Phone Number:</span><span class="value">' + safePhone + '</span></div>' +
      '<div class="field"><span class="label">Email Address:</span><span class="value">' + safeEmail + '</span></div>' +
      (safeGender ? '<div class="field"><span class="label">Gender:</span><span class="value">' + safeGender + '</span></div>' : '') +
      '<div class="field"><span class="label">Address:</span><span class="value">' + safeAddress + '</span></div>' +
      '<div class="field"><span class="label">City:</span><span class="value">' + safeCity + '</span></div>' +
      '<div class="field"><span class="label">State:</span><span class="value">' + safeState + '</span></div>' +
      '<div class="field"><span class="label">Pincode:</span><span class="value">' + safePincode + '</span></div>' +
      (body.selectedPlan ? '<div class="field"><span class="label">Selected Plan:</span><span class="value">' + (body.selectedPlan === 'one-time' ? 'Essential (One time test) - ₹999' : body.selectedPlan === '90-days' ? 'Signature (90 Days plan) - ₹3,999' : escapeHtml(body.selectedPlan)) + '</span></div>' : '') +
      '<div class="field"><span class="label">Message:</span><div class="message-box">' + safeMessage + '</div></div>' +
      '<div class="field"><span class="label">Agreed to Contact:</span><span class="value">' + (body.agreeToContact ? 'Yes' : 'No') + '</span></div>' +
      '</div></body></html>';

    // Generate confirmation email HTML (to sender)
    const planInfo = body.selectedPlan === 'one-time'
      ? '<div style="background-color:#e8f5e9;padding:15px;border-radius:8px;margin:15px 0;"><strong>Selected Plan:</strong> Essential (One time test) - ₹999</div>'
      : body.selectedPlan === '90-days'
      ? '<div style="background-color:#e3f2fd;padding:15px;border-radius:8px;margin:15px 0;"><strong>Selected Plan:</strong> Signature (90 Days plan) - ₹3,999</div>'
      : '';

    const mainMessage = formType === 'schedule-test'
      ? '<p>We\'ve received your test scheduling request and we\'re excited to help you on your health journey!</p><p>Our team will review your details and get back to you shortly to confirm your test date and time.</p>'
      : '<p>Thank you for reaching out to Kiora Care! We\'ve received your message and our team will get back to you shortly.</p>';

    const confirmationHtml = 
      '<!DOCTYPE html><html><head><meta charset="utf-8"><style>' +
      'body{font-family:Arial,sans-serif;line-height:1.6;color:#333;max-width:600px;margin:0 auto;padding:20px}' +
      '.header{background-color:#1190ff;color:white;padding:30px;border-radius:8px 8px 0 0;text-align:center}' +
      '.content{background-color:#f9f9f9;padding:30px;border:1px solid #ddd;border-top:none;border-radius:0 0 8px 8px}' +
      '.message{color:#333;font-size:16px;margin-bottom:20px}' +
      '.details{background-color:white;padding:20px;border-radius:8px;margin-top:20px;border-left:4px solid #1190ff}' +
      '.footer{text-align:center;margin-top:30px;color:#666;font-size:14px}' +
      '</style></head><body>' +
      '<div class="header"><h1>Thank You, ' + safeFullName + '!</h1></div>' +
      '<div class="content">' +
      '<div class="message">' + mainMessage + '</div>' +
      planInfo +
      '<div class="details">' +
      '<p style="margin-top:0"><strong>Your submission details:</strong></p>' +
      '<p style="margin:5px 0">📧 Email: ' + safeEmail + '</p>' +
      '<p style="margin:5px 0">📱 Phone: ' + safePhone + '</p>' +
      (safeGender ? '<p style="margin:5px 0">👤 Gender: ' + safeGender + '</p>' : '') +
      ((safeCity !== 'Not provided' || safeState !== 'Not provided') ? '<p style="margin:5px 0">📍 Location: ' + [safeCity, safeState].filter(v => v && v !== 'Not provided').join(', ') + (safePincode !== 'Not provided' ? ' - ' + safePincode : '') + '</p>' : '') +
      '</div>' +
      '<div class="footer">' +
      '<p>Best regards,<br><strong>The Kiora Care Team</strong></p>' +
      '<p style="margin-top:20px;font-size:12px">If you have any urgent questions, please contact us directly.</p>' +
      '</div>' +
      '</div></body></html>';

    try {
      // Email 1: Send notification to business/team
      const notificationResult = await resend.emails.send({
        from: 'Kiora Care <noreply@kiora.care>',
        to: targetEmail,
        subject: emailSubject,
        html: notificationHtml,
      });

      if (notificationResult.error) {
        console.error('Resend API error (notification):', JSON.stringify(notificationResult.error, null, 2));
        return res.status(500).json({ 
          error: 'Failed to send notification email',
          details: notificationResult.error,
          message: notificationResult.error?.message || 'Unknown Resend error'
        });
      }

      console.log('✅ Notification email sent:', notificationResult.data?.id);

      // Email 2: Send confirmation to sender
      const confirmationResult = await resend.emails.send({
        from: 'Kiora Care <noreply@kiora.care>',
        to: body.emailAddress,
        subject: confirmationSubject,
        html: confirmationHtml,
      });

      if (confirmationResult.error) {
        console.warn('⚠️ Failed to send confirmation email:', confirmationResult.error);
        // Don't fail the request if confirmation fails, just log it
      } else {
        console.log('✅ Confirmation email sent:', confirmationResult.data?.id);
      }

      return res.status(200).json({ 
        message: 'Emails sent successfully',
        data: {
          submissionId: dbRecordId,
          notification: {
            id: notificationResult.data?.id,
            to: targetEmail
          },
          confirmation: confirmationResult.error ? {
            error: 'Failed to send confirmation email',
            details: confirmationResult.error
          } : {
            id: confirmationResult.data?.id,
            to: body.emailAddress
          }
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
