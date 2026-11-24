import crypto from 'node:crypto';

const TOKEN_SECRET = process.env.ADMIN_TOKEN_SECRET || 'mardonius-riel-presensi-secret-2026';

export function signAuthToken({ id = '', username = 'admin', displayName = 'Admin', role = 'admin' }) {
  const payload = Buffer.from(
    JSON.stringify({
      id,
      sub: username,
      displayName,
      role: role === 'viewer' ? 'viewer' : 'admin',
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    })
  ).toString('base64url');
  const sig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  return `${payload}.${sig}`;
}

export function verifyAuthToken(token) {
  if (!token || typeof token !== 'string' || !token.includes('.')) return null;
  const [payload, sig] = token.split('.');
  const expectedSig = crypto.createHmac('sha256', TOKEN_SECRET).update(payload).digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const parsed = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!parsed.exp || Date.now() > parsed.exp) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function extractBearer(req) {
  const h = req.headers.authorization || '';
  if (h.startsWith('Bearer ')) return h.slice(7).trim();
  return '';
}

/**
 * Blocks mutation attempts when an authenticated session carries the read-only (`viewer`) role.
 */
export function rejectReadOnlyViewer(req, res, next) {
  const token = extractBearer(req);
  if (!token) return next();
  const decoded = verifyAuthToken(token);
  if (decoded && decoded.role === 'viewer') {
    return res.status(403).json({
      error: 'Mode Read-Only: akun Anda hanya diperbolehkan melihat data & mengunduh laporan.',
    });
  }
  return next();
}
