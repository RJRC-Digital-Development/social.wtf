import { NextResponse } from 'next/server';
import { getAccountByUsernameAsync, getAccountByRecoveryEmailAsync, normalizeUsername, normalizeEmail } from '@/lib/data/accountStore';
import { createPasswordResetTokenAsync } from '@/lib/security/passwordReset';
import { getMailTransport } from '@/lib/security/mailTransport';
import { rateLimiter } from '@/lib/security/rateLimiter';
import { getClientIp } from '@/lib/security/ipHelper';

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = await rateLimiter.checkAsync(`forgot_pwd:${clientIp}`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many password reset requests. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { identifier } = body || {};
    if (!identifier || typeof identifier !== 'string') {
      return NextResponse.json(
        { error: 'MISSING_IDENTIFIER', message: 'Username or recovery email is required.' },
        { status: 400 }
      );
    }

    const trimmed = identifier.trim();
    let account = null;

    if (trimmed.includes('@')) {
      account = await getAccountByRecoveryEmailAsync(normalizeEmail(trimmed));
    } else {
      account = await getAccountByUsernameAsync(normalizeUsername(trimmed));
    }

    // Generic response message to prevent account enumeration
    const genericResponse = {
      success: true,
      message: 'If an account with a verified recovery email exists for the provided identifier, instructions have been sent.',
    };

    if (account && account.recoveryEmail && account.recoveryEmailVerifiedAt) {
      const rawToken = await createPasswordResetTokenAsync(account.accountId);
      const mailResult = await getMailTransport().sendPasswordReset(account.recoveryEmail, account.username, rawToken);
      // Blocker 3: If delivery fails, invalidate the newly generated authority to prevent orphaned tokens
      if (!mailResult.success) {
        const { deletePasswordResetTokenAsync } = await import('@/lib/security/passwordReset');
        await deletePasswordResetTokenAsync(rawToken);
      }
    }

    return NextResponse.json(genericResponse, { status: 200 });
  } catch (err: any) {
    console.error('[Forgot Password Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
