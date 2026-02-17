const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const { Pool } = require('pg');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;

// Base URL for testing (e.g. http://localhost:3001). Used in health response and for reference.
const BASE_URL = process.env.BASE_URL || `http://localhost:${PORT}`;

// Middleware - CORS configuration
const allowedOrigins = process.env.ALLOWED_ORIGIN 
  ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
  : [
      'http://localhost:8080',
      'http://localhost:3000',
      'http://localhost:5173',
      'https://kiora-care.vercel.app',
      'https://kiora-care-backend.vercel.app',
      'https://www.kiora.care',
      'https://kiora.care'
    ];

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) return callback(null, true);
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
  credentials: true
}));
app.use(express.json());

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Initialize PostgreSQL connection pool
let pool;
if (process.env.DATABASE_URL) {
  pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.DATABASE_URL.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : false
  });

  pool.on('error', (err) => {
    console.error('Unexpected error on idle client', err);
  });
}

// Admin credentials (use env in production)
const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Kiora123';

function createAdminToken() {
  return Buffer.from(`${ADMIN_USERNAME}:${ADMIN_PASSWORD}`).toString('base64');
}

function validateAdminToken(authHeader) {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');
    return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

// Admin login
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body || {};
  if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
    return res.status(200).json({ success: true, token: createAdminToken() });
  }
  return res.status(401).json({ success: false, error: 'Invalid username or password' });
});

// Admin: list form submissions (Get in touch + Schedule tests)
app.get('/api/admin/submissions', async (req, res) => {
  if (!validateAdminToken(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  if (!pool) {
    return res.status(200).json({ data: [], message: 'Database not configured' });
  }
  try {
    const formType = req.query.form_type; // 'contact' | 'schedule-test' | omit for all
    let query = 'SELECT id, form_type, user_type, full_name, email_address, phone_number, gender, address, city, state, pincode, message, selected_plan, agree_to_contact, scheduled_date, scheduled_time, map_location, created_at FROM form_submissions';
    const params = [];
    if (formType === 'contact' || formType === 'schedule-test') {
      query += ' WHERE form_type = $1';
      params.push(formType);
    }
    query += ' ORDER BY created_at DESC';
    const result = await pool.query(query, params);
    return res.status(200).json({ data: result.rows });
  } catch (err) {
    console.error('Admin submissions error:', err);
    return res.status(500).json({ error: 'Failed to fetch submissions', message: err.message });
  }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const health = {
    status: 'ok',
    message: 'Backend is running',
    baseUrl: BASE_URL,
    timestamp: new Date().toISOString()
  };

  // Check database connection if available
  if (pool) {
    try {
      await pool.query('SELECT 1');
      health.database = 'connected';
    } catch (err) {
      health.database = 'disconnected';
      health.databaseError = err.message;
    }
  }

  res.status(200).json(health);
});

// Helper function to escape HTML
const escapeHtml = (text) => {
  if (!text) return '';
  return String(text)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
};

// Generate notification email HTML (to business)
const generateNotificationEmail = (formData) => {
  const formType = formData.formType === 'schedule-test' ? 'schedule-test' : 'contact';
  const formTypeLabel = formType === 'schedule-test' ? 'Schedule a test request' : 'Contact form';
  const userTypeLabel = formData.userType === 'doctor' ? 'Doctor' : formData.userType === 'patient' ? 'Patient' : 'Not specified';
  
  const safeFullName = escapeHtml(formData.fullName);
  const safePhone = escapeHtml(formData.phoneNumber);
  const safeEmail = escapeHtml(formData.emailAddress);
  const safeCity = escapeHtml(formData.city) || 'Not provided';
  const safeState = escapeHtml(formData.state) || 'Not provided';
  const safeAddress = escapeHtml(formData.address) || 'Not provided';
  const safePincode = escapeHtml(formData.pincode) || 'Not provided';
  const safeMessage = formData.message ? escapeHtml(formData.message).replace(/\n/g, '<br>') : 'No message provided';
  
  const planInfo = formData.selectedPlan === 'one-time' 
    ? '<div style="background-color:#e8f5e9;padding:15px;border-radius:8px;margin:15px 0;"><strong>Plan:</strong> Essential (One time test) - ₹999</div>'
    : formData.selectedPlan === '90-days'
    ? '<div style="background-color:#e3f2fd;padding:15px;border-radius:8px;margin:15px 0;"><strong>Plan:</strong> Signature (90 Days plan) - ₹3,999</div>'
    : '';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #1190ff; color: white; padding: 20px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background-color: #f9f9f9; padding: 20px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px; }
        .field { margin-bottom: 15px; padding-bottom: 15px; border-bottom: 1px solid #eee; }
        .field:last-child { border-bottom: none; }
        .label { font-weight: bold; color: #555; display: block; margin-bottom: 5px; }
        .value { color: #333; }
        .message-box { background-color: white; padding: 15px; border-left: 4px solid #1190ff; margin-top: 10px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>${formType === 'schedule-test' ? 'Schedule a test request' : 'New Contact Form Submission'}</h1>
        <p>Kiora Website</p>
      </div>
      <div class="content">
        <div class="field">
          <span class="label">Form type:</span>
          <span class="value">${formTypeLabel}</span>
        </div>
        ${planInfo}
        <div class="field">
          <span class="label">User Type:</span>
          <span class="value">${userTypeLabel}</span>
        </div>
        <div class="field">
          <span class="label">Full Name:</span>
          <span class="value">${safeFullName}</span>
        </div>
        <div class="field">
          <span class="label">Mobile Number:</span>
          <span class="value">${safePhone}</span>
        </div>
        <div class="field">
          <span class="label">Email Address:</span>
          <span class="value">${safeEmail}</span>
        </div>
        ${formData.gender ? `<div class="field">
          <span class="label">Gender:</span>
          <span class="value">${escapeHtml(formData.gender).charAt(0).toUpperCase() + escapeHtml(formData.gender).slice(1).replace(/-/g, ' ')}</span>
        </div>` : ''}
        <div class="field">
          <span class="label">Address:</span>
          <span class="value">${safeAddress}</span>
        </div>
        <div class="field">
          <span class="label">City:</span>
          <span class="value">${safeCity}</span>
        </div>
        <div class="field">
          <span class="label">State:</span>
          <span class="value">${safeState}</span>
        </div>
        <div class="field">
          <span class="label">Pincode:</span>
          <span class="value">${safePincode}</span>
        </div>
        <div class="field">
          <span class="label">Message:</span>
          <div class="message-box">${safeMessage}</div>
        </div>
        <div class="field">
          <span class="label">Agreed to Contact:</span>
          <span class="value">${formData.agreeToContact ? 'Yes' : 'No'}</span>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Generate confirmation email HTML (to sender)
const generateConfirmationEmail = (formData) => {
  const formType = formData.formType === 'schedule-test' ? 'schedule-test' : 'contact';
  const safeFullName = escapeHtml(formData.fullName);
  const safeEmail = escapeHtml(formData.emailAddress);
  const safePhone = escapeHtml(formData.phoneNumber);
  const safeCity = escapeHtml(formData.city) || 'Not provided';
  const safeState = escapeHtml(formData.state) || 'Not provided';
  const safePincode = escapeHtml(formData.pincode) || 'Not provided';
  
  const planInfo = formData.selectedPlan === 'one-time'
    ? '<div style="background-color:#e8f5e9;padding:15px;border-radius:8px;margin:15px 0;"><strong>Selected Plan:</strong> Essential (One time test) - ₹999</div>'
    : formData.selectedPlan === '90-days'
    ? '<div style="background-color:#e3f2fd;padding:15px;border-radius:8px;margin:15px 0;"><strong>Selected Plan:</strong> Signature (90 Days plan) - ₹3,999</div>'
    : '';

  const mainMessage = formType === 'schedule-test'
    ? '<p>We\'ve received your test scheduling request and we\'re excited to help you on your health journey!</p><p>Our team will review your details and get back to you shortly to confirm your test date and time.</p>'
    : '<p>Thank you for reaching out to Kiora Care! We\'ve received your message and our team will get back to you shortly.</p>';

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background-color: #1190ff; color: white; padding: 30px; border-radius: 8px 8px 0 0; text-align: center; }
        .content { background-color: #f9f9f9; padding: 30px; border: 1px solid #ddd; border-top: none; border-radius: 0 0 8px 8px; }
        .message { color: #333; font-size: 16px; margin-bottom: 20px; }
        .details { background-color: white; padding: 20px; border-radius: 8px; margin-top: 20px; border-left: 4px solid #1190ff; }
        .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
      </style>
    </head>
    <body>
      <div class="header">
        <h1>Thank You, ${safeFullName}!</h1>
      </div>
      <div class="content">
        <div class="message">
          ${mainMessage}
        </div>
        ${planInfo}
        <div class="details">
          <p style="margin-top: 0;"><strong>Your submission details:</strong></p>
          <p style="margin: 5px 0;">📧 Email: ${safeEmail}</p>
          <p style="margin: 5px 0;">📱 Phone: ${safePhone}</p>
          ${formData.gender ? `<p style="margin: 5px 0;">👤 Gender: ${escapeHtml(formData.gender).charAt(0).toUpperCase() + escapeHtml(formData.gender).slice(1).replace(/-/g, ' ')}</p>` : ''}
          ${safeCity !== 'Not provided' || safeState !== 'Not provided' ? `<p style="margin: 5px 0;">📍 Location: ${[safeCity, safeState].filter(Boolean).join(', ')}${safePincode !== 'Not provided' ? ' - ' + safePincode : ''}</p>` : ''}
        </div>
        <div class="footer">
          <p>Best regards,<br><strong>The Kiora Care Team</strong></p>
          <p style="margin-top: 20px; font-size: 12px;">If you have any urgent questions, please contact us directly.</p>
        </div>
      </div>
    </body>
    </html>
  `;
};

// Create database table if it doesn't exist
const createTableIfNotExists = async () => {
  if (!pool) return;

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

  try {
    await pool.query(createTableQuery);
    // Add state/address columns if table already existed without them (ignore if already exist)
    await pool.query('ALTER TABLE form_submissions ADD COLUMN state VARCHAR(255)').catch((err) => { if (err.code !== '42701') throw err; });
    await pool.query('ALTER TABLE form_submissions ADD COLUMN address VARCHAR(512)').catch((err) => { if (err.code !== '42701') throw err; });
    await pool.query('ALTER TABLE form_submissions ADD COLUMN scheduled_date DATE').catch((err) => { if (err.code !== '42701') throw err; });
    await pool.query('ALTER TABLE form_submissions ADD COLUMN scheduled_time VARCHAR(20)').catch((err) => { if (err.code !== '42701') throw err; });
    await pool.query('ALTER TABLE form_submissions ADD COLUMN map_location TEXT').catch((err) => { if (err.code !== '42701') throw err; });
    console.log('✅ Database table created/verified successfully');
  } catch (error) {
    console.error('❌ Error creating database table:', error.message);
  }
};

// Initialize database table on startup
if (pool) {
  createTableIfNotExists();
}

// Unified endpoint for both contact form and schedule test
app.post('/api/send-contact-email', async (req, res) => {
  try {
    const body = req.body;

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

    // Check if Resend API key is configured
    if (!process.env.RESEND_API_KEY) {
      console.error('RESEND_API_KEY not configured');
      return res.status(500).json({ 
        error: 'Server configuration error: RESEND_API_KEY missing',
        message: 'Please set RESEND_API_KEY environment variable'
      });
    }

    const targetEmail = process.env.TARGET_EMAIL || 'care@kiora.care';
    // Use verified email for FROM address (Resend requires verified domain)
    // Options: 
    // 1. Use onboarding@resend.dev (Resend's default verified domain)
    // 2. Use your Gmail if verified in Resend
    // 3. Verify kiora.care domain in Resend dashboard
    const fromEmail = process.env.FROM_EMAIL || 'onboarding@resend.dev';
    const formType = body.formType === 'schedule-test' ? 'schedule-test' : 'contact';
    
    const emailSubject = formType === 'schedule-test'
      ? 'Schedule a test request - Kiora Website'
      : 'New Contact Form Submission from Kiora Website';

    const confirmationSubject = formType === 'schedule-test'
      ? 'Thank you for scheduling your test with Kiora Care'
      : 'Thank you for contacting Kiora Care';

    // Save to database if available
    let dbRecordId = null;
    if (pool) {
      try {
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
      } catch (dbError) {
        console.error('⚠️ Failed to save to database (continuing with email):', dbError.message);
        // Don't fail the request if database save fails, just log it
      }
    }

    // Email 1: Send notification to business/team
    const notificationResult = await resend.emails.send({
      from: `Kiora Care <${fromEmail}>`,
      to: targetEmail,
      subject: emailSubject,
      html: generateNotificationEmail(body),
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
      from: `Kiora Care <${fromEmail}>`,
      to: body.emailAddress,
      subject: confirmationSubject,
      html: generateConfirmationEmail(body),
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

  } catch (error) {
    console.error('Error processing request:', error);
    return res.status(500).json({ 
      error: 'Failed to send email',
      message: error.message || 'Unknown error'
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`\n✅ Backend server running at ${BASE_URL}`);
  console.log(`📧 Health check: ${BASE_URL}/api/health`);
  console.log(`📨 Email endpoint: ${BASE_URL}/api/send-contact-email`);
  console.log(`🔐 Admin login: ${BASE_URL}/api/admin/login`);
  if (pool) {
    console.log(`🗄️  Database: Connected`);
  } else {
    console.log(`⚠️  Database: Not configured (submissions will not be saved)`);
  }
  console.log('');
});
