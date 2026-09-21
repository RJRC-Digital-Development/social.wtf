import { NextResponse } from 'next/server';
import { verifyAccountRecoveryEmailAsync } from '@/lib/data/accountStore';
import { verifyRecoveryEmailTokenAsync } from '@/lib/security/passwordReset';
import { rateLimiter } from '@/lib/security/rateLimiter';
import { getClientIp } from '@/lib/security/ipHelper';

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = await rateLimiter.checkAsync(`verify_email:${clientIp}`, 10, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many verification attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { token } = body || {};
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'MISSING_TOKEN', message: 'Verification token is required.' },
        { status: 400 }
      );
    }

    const tokenResult = await verifyRecoveryEmailTokenAsync(token);
    if (!tokenResult.success || !tokenResult.accountId || !tokenResult.email) {
      return NextResponse.json(
        { error: 'INVALID_OR_EXPIRED_TOKEN', message: 'The verification token is invalid or has expired.' },
        { status: 400 }
      );
    }

    const verifyResult = await verifyAccountRecoveryEmailAsync(tokenResult.accountId, tokenResult.email);
    if (!verifyResult.success) {
      return NextResponse.json(
        { error: 'VERIFICATION_FAILED', message: verifyResult.error || 'Failed to verify recovery email.' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Recovery email verified successfully.' },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[Verify Recovery Email Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
