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
    ? process.env.ALLOWED_ORIGIN.split(',').map(o => o.trim())
    : [];
  
  const allOrigins = [...allowedOrigins, ...envOrigins];
  const requestOrigin = origin ? origin.trim() : '';
  
  if (process.env.ALLOWED_ORIGIN === '*') {
    res.setHeader('Access-Control-Allow-Origin', '*');
  } else if (requestOrigin && allOrigins.includes(requestOrigin)) {
    res.setHeader('Access-Control-Allow-Origin', requestOrigin);
  } else if (allOrigins.length > 0) {
    res.setHeader('Access-Control-Allow-Origin', allOrigins[0]);
  } else {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
  
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}

export default function handler(
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

  return res.status(200).json({ status: 'ok' });
}

