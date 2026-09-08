import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { User } from '@/lib/types';
import { getUserById } from '@/lib/users/db';
import {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
  verifySessionToken,
} from './token';

export {
  SESSION_COOKIE_NAME,
  SESSION_COOKIE_OPTIONS,
  createSessionToken,
  verifySessionToken,
};

/**
 * Retrieves the currently authenticated user from the active session cookie.
 * Strictly returns null if no session cookie exists or token is invalid.
 * Never defaults to mock superadmin.
 */
export async function getSessionUser(): Promise<User | null> {
  try {
    const cookieStore = await cookies();
    const token =
      cookieStore.get(SESSION_COOKIE_NAME)?.value ||
      cookieStore.get('session_token')?.value;

    if (!token) {
      return null;
    }

    const verified = await verifySessionToken(token);
    if (!verified || !verified.userId) {
      return null;
    }

    const user = await getUserById(verified.userId);
    if (!user) {
      return null;
    }

    return user;
  } catch (err) {
    console.error('[getSessionUser] Error verifying session:', err);
    return null;
  }
}

/**
 * Standard alias for getSessionUser().
 * Returns null if unauthenticated.
 */
export async function getCurrentUser(): Promise<User | null> {
  return getSessionUser();
}

/**
 * Asserts that an authenticated user session exists, or redirects to /login.
 */
export async function requireUser(): Promise<User> {
  const user = await getSessionUser();
  if (!user) {
    redirect('/login');
  }
  return user;
}

/**
 * Sets the session cookie on the server response.
 */
export async function setSessionCookie(userId: string): Promise<string> {
  const token = await createSessionToken(userId);
  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, SESSION_COOKIE_OPTIONS);
  return token;
}

/**
 * Clears active session cookies upon logout.
 */
export async function clearSessionCookie(): Promise<void> {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
  cookieStore.delete('session_token');
  cookieStore.delete('homelab_active_user_id');
}
