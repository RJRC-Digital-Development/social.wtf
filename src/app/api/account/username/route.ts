import { NextResponse } from 'next/server';
import { validateRequestSessionAsync, createAccountSession, createSessionCookie } from '@/lib/security/session';
import { updateAccountUsernameAsync, getAccountRolesAsync } from '@/lib/data/accountStore';
import { globalRateLimiter } from '@/lib/security/rateLimiter';
import { getClientIp } from '@/lib/security/ipHelper';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await globalRateLimiter.checkAsync(`account_username_update:${ip}`, 10, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'TOO_MANY_REQUESTS', message: 'Rate limit exceeded. Please wait before updating your username.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: 'UNAUTHORIZED', message: sessionResult.reason || 'Authentication required.' },
        { status: 401 }
      );
    }

    // Security Invariant: target account is derived strictly from the authenticated session
    const { accountId } = sessionResult.payload;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json(
        { error: 'INVALID_JSON', message: 'Invalid JSON body.' },
        { status: 400 }
      );
    }

    const { newUsername, password } = body || {};

    if (!newUsername || typeof newUsername !== 'string') {
      return NextResponse.json(
        { error: 'MISSING_USERNAME', message: 'New username is required.' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string') {
      return NextResponse.json(
        { error: 'PASSWORD_REQUIRED', message: 'Current password is required to change username.' },
        { status: 400 }
      );
    }

    const result = await updateAccountUsernameAsync(accountId, newUsername, password);

    if (!result.success || !result.account) {
      return NextResponse.json(
        { error: 'USERNAME_UPDATE_FAILED', message: result.error || 'Failed to update username.' },
        { status: result.status || 400 }
      );
    }

    // Reissue fresh session with updated username
    const rolesRecord = await getAccountRolesAsync(accountId);
    const updatedRoles = rolesRecord.roles || ['ROLE_USER'];
    const freshSessionToken = createAccountSession(result.account, updatedRoles);
    const freshCookie = createSessionCookie(freshSessionToken, Date.now() + 24 * 60 * 60 * 1000);

    const response = NextResponse.json({
      success: true,
      account: {
        accountId: result.account.accountId,
        username: result.account.username,
        status: result.account.status,
        createdAt: result.account.createdAt,
        updatedAt: result.account.updatedAt,
        primaryWalletAddress: result.account.primaryWalletAddress || null,
      },
    });

    response.headers.set('Set-Cookie', freshCookie);
    return response;
  } catch (err: any) {
    console.error('[API Account Username POST Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'Internal server error processing username change.' },
      { status: 500 }
    );
  }
}
