import { NextResponse } from 'next/server.js';
import { verifyWalletChallengeAsync } from '../../../../lib/security/walletAuth.ts';
import { globalRateLimiter } from '../../../../lib/security/rateLimiter.ts';
import { createSession, verifySessionToken, createSessionCookie } from '../../../../lib/security/session.ts';
import { getClientIp } from '../../../../lib/security/ipHelper.ts';
import { isPlatformOwner } from '../../../../lib/security/ownerAuth.ts';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);


    // Distributed Rate Limit: 10 verification attempts per minute per IP
    const rateCheck = await globalRateLimiter.checkAsync(`verify:${ip}`, 10, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Too many verification attempts. Please wait before retrying.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    const body = await req.json().catch(() => ({}));
    const { walletAddress, nonce, signatureBase58 } = body;

    if (!walletAddress || !nonce || !signatureBase58) {
      return NextResponse.json(
        { error: 'Missing required authentication fields: walletAddress, nonce, signatureBase58' },
        { status: 400 }
      );
    }

    const result = await verifyWalletChallengeAsync({
      walletAddress,
      nonce,
      signatureBase58,
    });

    if (!result.verified) {
      return NextResponse.json(
        { error: result.error || 'Authentication challenge verification failed' },
        { status: 401 }
      );
    }

    // Determine authorization scope: Valid configured PLATFORM_OWNER_WALLET receives 'admin'; all other wallets receive 'user'
    const sessionScope: 'admin' | 'user' = isPlatformOwner(walletAddress) ? 'admin' : 'user';

    // Generate authenticated, cryptographically signed session token bound to wallet
    const token = createSession(walletAddress, sessionScope);
    const verification = verifySessionToken(token);
    if (!verification.valid) {
      return NextResponse.json(
        { error: 'Failed to construct valid session' },
        { status: 500 }
      );
    }

    const cookieHeader = createSessionCookie(token, verification.payload.expiresAt);

    const response = NextResponse.json({
      verified: true,
      walletAddress,
      scope: sessionScope,
      isAdmin: sessionScope === 'admin',
      sessionToken: token,
      expiresAt: verification.payload.expiresAt,
      authenticatedAt: new Date(verification.payload.issuedAt).toISOString(),
    });

    response.headers.set('Set-Cookie', cookieHeader);
    return response;
  } catch {
    return NextResponse.json(
      { error: 'Internal error processing signature verification' },
      { status: 500 }
    );
  }
}
