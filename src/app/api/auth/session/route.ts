import { NextResponse } from 'next/server';
import {
  validateRequestSession,
  extractSessionToken,
  revokeSession,
  createClearSessionCookie,
} from '@/lib/security/session';

/**
 * GET: Introspect and validate active session
 */
export async function GET(req: Request) {
  const result = validateRequestSession(req);

  if (!result.authenticated || !result.payload) {
    return NextResponse.json(
      { authenticated: false, error: result.error || 'No active authenticated session' },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    sessionId: result.payload.sessionId,
    walletAddress: result.payload.walletAddress,
    scope: result.payload.scope,
    expiresAt: result.payload.expiresAt,
  });
}

/**
 * DELETE: Revoke session (logout) and clear session cookie
 */
export async function DELETE(req: Request) {
  const token = extractSessionToken(req);

  if (token) {
    revokeSession(token);
  }

  const response = NextResponse.json({
    authenticated: false,
    message: 'Session successfully revoked and logged out',
  });

  response.headers.set('Set-Cookie', createClearSessionCookie());
  return response;
}
