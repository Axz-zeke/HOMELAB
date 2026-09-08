import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE_NAME, verifySessionToken } from '@/lib/auth/token';

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;

  // Extract session token from cookie
  const token =
    req.cookies.get(SESSION_COOKIE_NAME)?.value ||
    req.cookies.get('session_token')?.value;

  const session = token ? await verifySessionToken(token) : null;
  const isAuthenticated = !!session;

  // 1. Root route "/" handling
  if (pathname === '/') {
    if (isAuthenticated) {
      return NextResponse.redirect(new URL('/dashboard', req.url));
    } else {
      return NextResponse.redirect(new URL('/login', req.url));
    }
  }

  // 2. Login route: if already authenticated, redirect to /dashboard or callback
  if (pathname === '/login') {
    if (isAuthenticated) {
      const callbackUrl = req.nextUrl.searchParams.get('callbackUrl');
      if (callbackUrl && callbackUrl.startsWith('/') && !callbackUrl.startsWith('//')) {
        return NextResponse.redirect(new URL(callbackUrl, req.url));
      }
      return NextResponse.redirect(new URL('/dashboard', req.url));
    }
    return NextResponse.next();
  }

  // 3. Protect Dashboard routes
  if (pathname.startsWith('/dashboard')) {
    if (!isAuthenticated) {
      const callback = encodeURIComponent(pathname + search);
      const loginUrl = new URL(`/login?callbackUrl=${callback}`, req.url);
      return NextResponse.redirect(loginUrl);
    }
  }

  // 4. Protect API files and backup routes
  if (pathname.startsWith('/api/files') || pathname.startsWith('/api/backup')) {
    if (!isAuthenticated) {
      return NextResponse.json(
        {
          error: 'Unauthorized: Valid session cookie required',
          code: 'UNAUTHORIZED',
        },
        { status: 401 }
      );
    }
  }

  return NextResponse.next();
}

// Next.js 16 supports both proxy and middleware export names for backwards compatibility
export const middleware = proxy;

export const config = {
  matcher: [
    '/',
    '/login',
    '/dashboard/:path*',
    '/api/files/:path*',
    '/api/backup/:path*',
  ],
};
