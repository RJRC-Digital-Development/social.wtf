import { NextResponse } from 'next/server';
import { registerAccountAsync } from '@/lib/data/accountStore';
import { createAccountSession, createSessionCookie } from '@/lib/security/session';
import { getEffectiveFeatureStateAsync } from '@/lib/data/featureStore';

export async function POST(req: Request) {
  try {
    const features = await getEffectiveFeatureStateAsync();
    if (!features.registration) {
      return NextResponse.json(
        { error: 'REGISTRATION_DISABLED', message: 'User registration is temporarily disabled.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { username, password } = body || {};
    if (!username || !password) {
      return NextResponse.json(
        { error: 'MISSING_FIELDS', message: 'Username and password are required.' },
        { status: 400 }
      );
    }

    const reg = await registerAccountAsync(username, password);
    if (!reg.success || !reg.account) {
      return NextResponse.json(
        { error: 'REGISTRATION_FAILED', message: reg.error || 'Failed to create account.' },
        { status: 400 }
      );
    }

    // Create account-first session
    const sessionToken = createAccountSession(reg.account, ['ROLE_USER']);
    const sessionCookie = createSessionCookie(sessionToken, Date.now() + 24 * 60 * 60 * 1000);

    const response = NextResponse.json(
      {
        success: true,
        account: {
          accountId: reg.account.accountId,
          username: reg.account.username,
          createdAt: reg.account.createdAt,
          status: reg.account.status,
        },
        roles: ['ROLE_USER'],
      },
      { status: 201 }
    );

    response.headers.set('Set-Cookie', sessionCookie);
    return response;
  } catch (err: any) {
    console.error('[Register API Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
