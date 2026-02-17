import type { VercelRequest, VercelResponse } from '@vercel/node';

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
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

function createAdminToken(username: string, password: string): string {
  return Buffer.from(`${username}:${password}`).toString('base64');
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
  
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  
  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body;
    const { username, password } = body || {};
    
    const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
    const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Kiora123';
    
    if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
      return res.status(200).json({ success: true, token: createAdminToken(username, password) });
    }
    
    return res.status(401).json({ success: false, error: 'Invalid username or password' });
  } catch (error) {
    return res.status(500).json({ success: false, error: 'Internal server error' });
  }
}
