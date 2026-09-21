import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { setAccountRecoveryEmailAsync, validateEmail, normalizeEmail } from '@/lib/data/accountStore';
import { createRecoveryEmailVerificationTokenAsync } from '@/lib/security/passwordReset';
import { getMailTransport } from '@/lib/security/mailTransport';
import { rateLimiter } from '@/lib/security/rateLimiter';
import { getClientIp } from '@/lib/security/ipHelper';

export async function POST(req: Request) {
  try {
    const session = await validateRequestSessionAsync(req);
    if (!session.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required.' }, { status: 401 });
    }

    const clientIp = getClientIp(req);
    // Blocker 6: Rate limit by BOTH Client IP and Authenticated Account ID
    const ipRateCheck = await rateLimiter.checkAsync(`email_req_ip:${clientIp}`, 5, 15 * 60 * 1000);
    if (!ipRateCheck.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many verification requests from this IP. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(ipRateCheck.resetMs / 1000).toString() } }
      );
    }

    const accRateCheck = await rateLimiter.checkAsync(`email_req_acc:${session.payload.accountId}`, 5, 15 * 60 * 1000);
    if (!accRateCheck.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many verification requests for this account. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(accRateCheck.resetMs / 1000).toString() } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { email } = body || {};
    const validation = validateEmail(email);
    if (!validation.valid) {
      return NextResponse.json(
        { error: 'INVALID_EMAIL', message: validation.reason || 'Invalid email address.' },
        { status: 400 }
      );
    }

    const cleanEmail = normalizeEmail(email);
    const setResult = await setAccountRecoveryEmailAsync(session.payload.accountId, cleanEmail);
    if (!setResult.success) {
      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: setResult.error || 'Failed to update recovery email.' },
        { status: 400 }
      );
    }

    const rawToken = await createRecoveryEmailVerificationTokenAsync(session.payload.accountId, cleanEmail);
    const mailResult = await getMailTransport().sendRecoveryVerification(cleanEmail, session.payload.username, rawToken);

    // Blocker 3: Verify mail delivery result; fail closed and delete authority if delivery fails
    if (!mailResult.success) {
      const { deleteRecoveryEmailVerificationTokenAsync } = await import('@/lib/security/passwordReset');
      await deleteRecoveryEmailVerificationTokenAsync(rawToken);
      return NextResponse.json(
        { error: 'MAIL_DELIVERY_FAILED', message: 'Failed to send verification email. Please check configuration or try again later.' },
        { status: 503 }
      );
    }

    return NextResponse.json(
      { success: true, message: 'Verification link sent to recovery email.' },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[Request Recovery Email Verification Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
