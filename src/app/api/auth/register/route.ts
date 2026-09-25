import { NextResponse } from 'next/server.js';
import { registerAccountAsync } from '../../../../lib/data/accountStore.ts';
import { createAccountSession, createSessionCookie } from '../../../../lib/security/session.ts';
import { FeatureStateUnavailableError, getEffectiveFeatureStateAsync } from '../../../../lib/data/featureStore.ts';

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

    const { username, password, walletAddress } = body || {};
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

    if (walletAddress && typeof walletAddress === 'string' && walletAddress.length >= 32 && walletAddress.length <= 44) {
      reg.account.primaryWalletAddress = walletAddress;
    }

    // Create account-first session
    const sessionToken = createAccountSession(reg.account, ['ROLE_USER']);
    const sessionCookie = createSessionCookie(sessionToken, Date.now() + 24 * 60 * 60 * 1000);

    const response = NextResponse.json(
      {
        success: true,
        sessionToken,
        account: {
          accountId: reg.account.accountId,
          username: reg.account.username,
          createdAt: reg.account.createdAt,
          status: reg.account.status,
          primaryWalletAddress: reg.account.primaryWalletAddress,
        },
        roles: ['ROLE_USER'],
      },
      { status: 201 }
    );

    response.headers.set('Set-Cookie', sessionCookie);
    return response;
  } catch (err: any) {
    if (err instanceof FeatureStateUnavailableError) {
      return NextResponse.json(
        { error: 'FEATURE_STATE_UNAVAILABLE', message: 'Registration is temporarily unavailable.' },
        { status: 503 }
      );
    }
    console.error('[Register API Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
