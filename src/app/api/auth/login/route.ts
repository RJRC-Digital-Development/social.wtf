import { NextResponse } from 'next/server';
import { authenticateAccountAsync, reconcilePlatformOwnerLoginAsync } from '@/lib/data/accountStore';
import { createAccountSession, createSessionCookie } from '@/lib/security/session';
import { resolveEffectiveAuthorizationAsync } from '@/lib/security/rbac';

export async function POST(req: Request) {
  try {
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

    const auth = await authenticateAccountAsync(username, password);
    if (!auth.success || !auth.account) {
      return NextResponse.json(
        { error: 'INVALID_CREDENTIALS', message: auth.error || 'Invalid username or password.' },
        { status: 401 }
      );
    }

    // If client supplied a connected wallet and account doesn't have one, or if they match, strap them together
    if (walletAddress && typeof walletAddress === 'string' && walletAddress.length >= 32 && walletAddress.length <= 44) {
      if (!auth.account.primaryWalletAddress) {
        auth.account.primaryWalletAddress = walletAddress;
      }
    }

    try {
      await reconcilePlatformOwnerLoginAsync(auth.account.accountId);
    } catch {
      return NextResponse.json(
        { error: 'OWNER_PROVISIONING_UNAVAILABLE', message: 'Owner authorization could not be verified.' },
        { status: 503 }
      );
    }

    const roles = (await resolveEffectiveAuthorizationAsync(auth.account.accountId)).roles;
    const sessionToken = createAccountSession(auth.account, roles);
    const sessionCookie = createSessionCookie(sessionToken, Date.now() + 24 * 60 * 60 * 1000);

    const response = NextResponse.json(
      {
        success: true,
        sessionToken,
        account: {
          accountId: auth.account.accountId,
          username: auth.account.username,
          createdAt: auth.account.createdAt,
          status: auth.account.status,
          primaryWalletAddress: auth.account.primaryWalletAddress,
        },
        roles,
      },
      { status: 200 }
    );

    response.headers.set('Set-Cookie', sessionCookie);
    return response;
  } catch (err: any) {
    console.error('[Login API Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
