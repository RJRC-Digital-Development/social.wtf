import { NextResponse } from 'next/server';
import { extractSessionToken, revokeSessionAsync, createClearSessionCookie } from '@/lib/security/session';

export async function POST(req: Request) {
  try {
    const token = extractSessionToken(req);
    if (token) {
      await revokeSessionAsync(token);
    }

    const response = NextResponse.json({ success: true, message: 'Logged out successfully.' });
    response.headers.set('Set-Cookie', createClearSessionCookie());
    return response;
  } catch (err: any) {
    console.error('[Logout API Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
