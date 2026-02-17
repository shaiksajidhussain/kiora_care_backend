import type { VercelRequest, VercelResponse } from '@vercel/node';
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
    originToUse = requestOrigin || '*';
  } else if (requestOrigin && allOrigins.includes(requestOrigin)) {
    originToUse = requestOrigin;
  } else if (allOrigins.length > 0) {
    originToUse = allOrigins[0];
  } else {
    originToUse = '*';
  }
  
  originToUse = originToUse.replace(/[\r\n]/g, '');
  
  res.setHeader('Access-Control-Allow-Origin', originToUse);
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function validateAdminToken(authHeader: string | undefined): boolean {
  if (!authHeader || !authHeader.startsWith('Bearer ')) return false;
  const token = authHeader.slice(7);
  try {
    const decoded = Buffer.from(token, 'base64').toString('utf8');
    const [username, password] = decoded.split(':');
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Kiora123';
    return username === ADMIN_USERNAME && password === ADMIN_PASSWORD;
  } catch {
    return false;
  }
}

export default async function handler(
  req: VercelRequest,
  res: VercelResponse
) {
  const origin = typeof req.headers?.origin === 'string' ? req.headers.origin : undefined;
  setCorsHeaders(res, origin);
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  if (!validateAdminToken(req.headers.authorization)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  if (!process.env.DATABASE_URL) {
    return res.status(200).json({ data: [], message: 'Database not configured' });
  }
  
  try {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.DATABASE_URL.includes('rds.amazonaws.com') ? { rejectUnauthorized: false } : false
    });
    
    const formType = typeof req.query?.form_type === 'string' ? req.query.form_type : undefined;
    let query = 'SELECT id, form_type, user_type, full_name, email_address, phone_number, gender, address, city, state, pincode, message, selected_plan, agree_to_contact, scheduled_date, scheduled_time, map_location, created_at FROM form_submissions';
    const params: string[] = [];
    
    if (formType === 'contact' || formType === 'schedule-test') {
      query += ' WHERE form_type = $1';
      params.push(formType);
    }
    
    query += ' ORDER BY created_at DESC';
    
    const result = await pool.query(query, params);
    await pool.end();
    
    return res.status(200).json({ data: result.rows });
  } catch (err: any) {
    console.error('Admin submissions error:', err);
    return res.status(500).json({ error: 'Failed to fetch submissions', message: err.message });
  }
}
