import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { createAuditRequestHeaders } from '@/lib/security/auditHeaders';

/**
 * Edge middleware for Social.wtf
 *
 * Security layers:
 * 1. Owner routes require a valid session cookie at the edge BEFORE
 *    the request reaches the API handler or page component.
 *    This prevents unauthenticated enumeration of owner endpoints.
 * 2. Rate limiting header injection for downstream consumption.
 * 3. Security headers on all responses.
 */

const OWNER_PATH_PREFIX = '/owner';
const OWNER_API_PREFIX = '/api/owner';
const SESSION_COOKIE_NAME = 'session';

// Paths that should never be blocked by middleware
const PUBLIC_PATHS = new Set([
  '/api/auth/login',
  '/api/auth/register',
  '/api/auth/forgot-password',
  '/api/auth/reset-password',
  '/api/auth/nonce',
]);

function addSecurityHeaders(response: NextResponse): NextResponse {
  // Prevent clickjacking
  response.headers.set('X-Frame-Options', 'DENY');
  // Prevent MIME-type sniffing
  response.headers.set('X-Content-Type-Options', 'nosniff');
  // Referrer policy
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  // Permissions policy: restrict sensitive APIs
  response.headers.set(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=(), payment=(self)'
  );
  return response;
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Skip public auth paths
  if (PUBLIC_PATHS.has(pathname)) {
    return addSecurityHeaders(NextResponse.next());
  }

  // Owner page and owner API routes: require session cookie at edge
  const isOwnerRoute = pathname.startsWith(OWNER_PATH_PREFIX) || pathname.startsWith(OWNER_API_PREFIX);

  if (isOwnerRoute) {
    const sessionCookie = request.cookies.get(SESSION_COOKIE_NAME);

    // No session cookie at all: hard reject
    if (!sessionCookie || !sessionCookie.value || sessionCookie.value.length < 10) {
      if (pathname.startsWith(OWNER_API_PREFIX)) {
        // API routes: return 401 JSON
        return new NextResponse(
          JSON.stringify({ error: 'UNAUTHORIZED', message: 'Authentication required.' }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'X-Frame-Options': 'DENY',
              'X-Content-Type-Options': 'nosniff',
            },
          }
        );
      }
      // Page routes: redirect to home
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/';
      loginUrl.searchParams.set('auth', 'required');
      return NextResponse.redirect(loginUrl);
    }

    // Session cookie exists but we cannot fully validate JWT at edge without
    // the secret. The downstream handler will do full cryptographic validation.
    // However, we can do structural checks to reject obviously invalid tokens.
    const token = sessionCookie.value;
    const parts = token.split('.');
    if (parts.length !== 3 || parts.some((p) => p.length === 0)) {
      if (pathname.startsWith(OWNER_API_PREFIX)) {
        return new NextResponse(
          JSON.stringify({ error: 'UNAUTHORIZED', message: 'Invalid session.' }),
          {
            status: 401,
            headers: {
              'Content-Type': 'application/json',
              'X-Frame-Options': 'DENY',
              'X-Content-Type-Options': 'nosniff',
            },
          }
        );
      }
      const loginUrl = request.nextUrl.clone();
      loginUrl.pathname = '/';
      loginUrl.searchParams.set('auth', 'required');
      return NextResponse.redirect(loginUrl);
    }
  }

  // Forward trusted audit context to route handlers for server-side hashing.
  // Always replace client-supplied internal headers rather than forwarding them.
  const requestHeaders = createAuditRequestHeaders(request.headers);

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  return addSecurityHeaders(response);
}

export const config = {
  matcher: [
    // Owner dashboard page
    '/owner/:path*',
    // Owner API routes
    '/api/owner/:path*',
    // All other API routes (for security headers)
    '/api/:path*',
    // Main page
    '/',
  ],
};
