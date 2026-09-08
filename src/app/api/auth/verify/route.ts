import { NextResponse } from 'next/server';
import { verifyWalletChallenge } from '@/lib/security/walletAuth';
import { globalRateLimiter } from '@/lib/security/rateLimiter';
import { createSession, verifySessionToken, createSessionCookie } from '@/lib/security/session';

export async function POST(req: Request) {
  try {
    const ip = req.headers.get('x-real-ip')?.trim() || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || '127.0.0.1';

    // Rate limit: 10 verification attempts per minute per IP to defend against brute force
    const rateCheck = globalRateLimiter.check(`verify:${ip}`, 10, 60_000);
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

    const result = verifyWalletChallenge({
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

    // Generate authenticated, cryptographically signed session token bound to wallet
    const token = createSession(walletAddress, 'user');
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
