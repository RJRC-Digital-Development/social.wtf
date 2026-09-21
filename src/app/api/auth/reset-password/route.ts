import { NextResponse } from 'next/server';
import { updateAccountPasswordHashAsync, getAccountByIdAsync } from '@/lib/data/accountStore';
import { consumePasswordResetTokenAsync } from '@/lib/security/passwordReset';
import { hashPassword } from '@/lib/security/password';
import { revokeAllAccountSessionsAsync } from '@/lib/security/session';
import { recordAuditLogAsync } from '@/lib/data/auditStore';
import crypto from 'crypto';
import { rateLimiter } from '@/lib/security/rateLimiter';
import { getClientIp } from '@/lib/security/ipHelper';

export async function POST(req: Request) {
  try {
    const clientIp = getClientIp(req);
    const rateCheck = await rateLimiter.checkAsync(`reset_pwd:${clientIp}`, 5, 15 * 60 * 1000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'RATE_LIMIT_EXCEEDED', message: 'Too many reset attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { token, newPassword } = body || {};
    if (!token || typeof token !== 'string') {
      return NextResponse.json(
        { error: 'MISSING_TOKEN', message: 'Reset token is required.' },
        { status: 400 }
      );
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8) {
      return NextResponse.json(
        { error: 'INVALID_PASSWORD', message: 'New password must be at least 8 characters long.' },
        { status: 400 }
      );
    }

    if (newPassword.length > 128) {
      return NextResponse.json(
        { error: 'INVALID_PASSWORD', message: 'New password must not exceed 128 characters.' },
        { status: 400 }
      );
    }

    const tokenResult = await consumePasswordResetTokenAsync(token);
    if (!tokenResult.success || !tokenResult.accountId) {
      return NextResponse.json(
        { error: 'INVALID_OR_EXPIRED_TOKEN', message: 'The password reset token is invalid or has expired.' },
        { status: 400 }
      );
    }

    const account = await getAccountByIdAsync(tokenResult.accountId);
    if (!account) {
      return NextResponse.json(
        { error: 'ACCOUNT_NOT_FOUND', message: 'Account associated with token no longer exists.' },
        { status: 400 }
      );
    }

    const newPasswordHash = await hashPassword(newPassword);
    const updateResult = await updateAccountPasswordHashAsync(account.accountId, newPasswordHash);
    const ipHash = crypto.createHash('sha256').update(clientIp).digest('hex');
    const userAgentHash = crypto.createHash('sha256').update(req.headers.get('user-agent') || 'unknown').digest('hex');

    if (!updateResult.success) {
      await recordAuditLogAsync({
        actorAccountId: account.accountId,
        capabilityUsed: 'PASSWORD_RESET',
        action: 'PASSWORD_RESET_PASSWORD_UPDATE_FAILED',
        targetType: 'ACCOUNT',
        targetId: account.accountId,
        ipHash,
        userAgentHash,
        outcome: 'FAILED',
        metadata: { username: account.username, error: updateResult.error || 'unknown' },
      }).catch(() => {});

      return NextResponse.json(
        { error: 'UPDATE_FAILED', message: updateResult.error || 'Failed to update password.' },
        { status: 500 }
      );
    }

    // Revoke ALL existing active sessions for this account (fail closed if revocation fails)
    try {
      await revokeAllAccountSessionsAsync(account.accountId);
    } catch (revError: any) {
      console.error('[Reset Password] Session revocation failure:', revError);
      await recordAuditLogAsync({
        actorAccountId: account.accountId,
        capabilityUsed: 'PASSWORD_RESET',
        action: 'PASSWORD_RESET_SESSION_REVOCATION_FAILED',
        targetType: 'ACCOUNT',
        targetId: account.accountId,
        ipHash,
        userAgentHash,
        outcome: 'FAILED',
        metadata: { username: account.username, error: revError?.message || 'unknown' },
      }).catch(() => {});

      return NextResponse.json(
        { error: 'SESSION_REVOCATION_FAILED', message: 'Password updated but failed to revoke previous active sessions. For security, please contact support or retry sign-in.' },
        { status: 500 }
      );
    }

    // Record immutable audit event for success
    await recordAuditLogAsync({
      actorAccountId: account.accountId,
      capabilityUsed: 'PASSWORD_RESET',
      action: 'PASSWORD_RESET_SUCCESS',
      targetType: 'ACCOUNT',
      targetId: account.accountId,
      ipHash,
      userAgentHash,
      outcome: 'SUCCESS',
      metadata: { username: account.username },
    }).catch(() => {});

    return NextResponse.json(
      { success: true, message: 'Password has been successfully updated.' },
      { status: 200 }
    );
  } catch (err: any) {
    console.error('[Reset Password Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
