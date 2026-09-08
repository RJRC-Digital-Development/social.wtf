import { NextResponse } from 'next/server';
import {
  createClearSessionCookie,
  extractSessionToken,
  validateRequestSession,
  revokeSession,
} from '@/lib/security/session';

export async function GET(request: Request) {
  const session = validateRequestSession(request);

  if (!session.authenticated) {
    return NextResponse.json(
      {
        authenticated: false,
        error: session.reason,
      },
      { status: 401 }
    );
  }

  return NextResponse.json({
    authenticated: true,
    sessionId: session.payload.sessionId,
    walletAddress: session.payload.walletAddress,
    scope: session.payload.scope,
    expiresAt: session.payload.expiresAt,
  });
}

export async function DELETE(request: Request) {
  const token = extractSessionToken(request);

  if (token) {
    const session = validateRequestSession(request);

    if (session.authenticated) {
      revokeSession(token);
    }
  }

  const response = NextResponse.json({
    success: true,
    message: 'Session revoked and logged out.',
  });

  response.headers.append(
    'Set-Cookie',
    createClearSessionCookie()
  );

  return response;
}
