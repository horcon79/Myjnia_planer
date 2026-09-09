import { createHmac, timingSafeEqual } from 'node:crypto';

export const SESSION_MAX_AGE = 60 * 60 * 24 * 30;
export const INTERNAL_SETTING_PREFIX = 'INTERNAL_';
export const SESSION_SECRET_KEY = `${INTERNAL_SETTING_PREFIX}SESSION_SECRET`;

export function signSessionToken(departmentId: string, secret: string, now = Date.now()): string {
  if (!secret || !departmentId) throw new Error('Missing session credentials');
  const payload = Buffer.from(JSON.stringify({
    departmentId,
    expiresAt: Math.floor(now / 1000) + SESSION_MAX_AGE,
  })).toString('base64url');
  const body = `v1.${payload}`;
  return `${body}.${createHmac('sha256', secret).update(body).digest('base64url')}`;
}

export function verifySessionToken(token: string, secret: string, now = Date.now()): string | null {
  if (!secret || token.length > 4096) return null;
  const parts = token.split('.');
  if (parts.length !== 3) return null;
  const [version, payload, signature] = parts;
  if (version !== 'v1' || !/^[A-Za-z0-9_-]+$/.test(payload) || !/^[A-Za-z0-9_-]{43}$/.test(signature)) return null;
  const expected = createHmac('sha256', secret).update(`${version}.${payload}`).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || actual.toString('base64url') !== signature || !timingSafeEqual(actual, expected)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'));
    if (!data || typeof data.departmentId !== 'string' || !data.departmentId ||
        !Number.isSafeInteger(data.expiresAt) || data.expiresAt <= Math.floor(now / 1000)) return null;
    return data.departmentId;
  } catch {
    return null;
  }
}
