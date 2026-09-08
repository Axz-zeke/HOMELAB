/**
 * Pure Web Crypto session token generator & validator.
 * Compatible with Next.js Edge Middleware and Node.js runtimes.
 */

export const SESSION_COOKIE_NAME = 'auth_session';

export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: false, // Must be false for LAN testing over plain HTTP (e.g., http://192.168.x.x:3000)
  path: '/',
  maxAge: 60 * 60 * 24 * 7, // 7 days in seconds
};

const SECRET_KEY =
  process.env.AUTH_SECRET ||
  process.env.SESSION_SECRET ||
  'homelab-nas-secret-token-key-2026';

const encoder = new TextEncoder();

function arrayBufferToBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlToUint8Array(base64url: string): Uint8Array {
  let base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) {
    base64 += '=';
  }
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Creates a cryptographically signed HMAC-SHA256 session token.
 * Format: {userId}.{timestamp}.{signature}
 */
export async function createSessionToken(userId: string): Promise<string> {
  const timestamp = Date.now().toString();
  const data = `${userId}.${timestamp}`;
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(SECRET_KEY),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const sigBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  const signature = arrayBufferToBase64Url(sigBuffer);
  return `${userId}.${timestamp}.${signature}`;
}

/**
 * Verifies the cryptographic HMAC-SHA256 signature and expiration of a session token.
 * Returns { userId } if valid, or null if invalid or expired.
 */
export async function verifySessionToken(
  token: string | undefined | null
): Promise<{ userId: string } | null> {
  if (!token || typeof token !== 'string') return null;

  const parts = token.split('.');
  if (parts.length !== 3) return null;

  const [userId, timestamp, signature] = parts;
  if (!userId || !timestamp || !signature) return null;

  // Check expiration: 7 days
  const time = parseInt(timestamp, 10);
  if (isNaN(time) || Date.now() - time > 7 * 24 * 60 * 60 * 1000) {
    return null;
  }

  try {
    const data = `${userId}.${timestamp}`;
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode(SECRET_KEY),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );
    const sigBytes = base64UrlToUint8Array(signature);
    const valid = await crypto.subtle.verify(
      'HMAC',
      key,
      sigBytes as unknown as BufferSource,
      encoder.encode(data) as unknown as BufferSource
    );
    if (!valid) return null;

    return { userId };
  } catch {
    return null;
  }
}
