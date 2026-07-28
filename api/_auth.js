import { config } from './config.js';

const ALLOWED_EMAIL_DOMAINS = ['@sprout.ph', '@sproutsolutions.io'];

// Applies an origin-allowlisted CORS header instead of '*'; call before any other handler logic.
export function applyCors(req, res) {
  const origin = req.headers.origin;
  if (origin && config.allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
}

// Verifies the caller's Supabase session JWT and enforces the org email allowlist server-side.
// Returns the Supabase auth user on success, or null if unauthenticated/unauthorized.
export async function verifyAuthUser(req) {
  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) return null;

  try {
    const res = await fetch(`${config.supabaseUrl}/auth/v1/user`, {
      headers: { Authorization: `Bearer ${token}`, apikey: config.supabaseAnonKey },
    });
    if (!res.ok) return null;
    const user = await res.json();
    const email = user?.email || '';
    if (!ALLOWED_EMAIL_DOMAINS.some(domain => email.endsWith(domain))) return null;
    return user;
  } catch {
    return null;
  }
}
