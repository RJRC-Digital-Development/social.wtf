import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { accountHasCapabilityAsync, validateStepUpTokenAsync } from '@/lib/security/rbac';
import { updateAccountStatusAsync, getAccountByIdAsync, getAccountRolesAsync } from '@/lib/data/accountStore';
import { recordAuditLogAsync, createPrivilegedOperationAsync, updateOperationStateAsync } from '@/lib/data/auditStore';

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: targetAccountId } = await params;
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const { accountId: actorAccountId } = sessionResult.payload;
    const canSuspend = await accountHasCapabilityAsync(actorAccountId, 'accounts:suspend');
    if (!canSuspend) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Account lacks accounts:suspend capability.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body' }, { status: 400 });
    }

    const { status, stepUpToken, reason } = body || {};
    if (!status || (status !== 'ACTIVE' && status !== 'SUSPENDED' && status !== 'DEACTIVATED')) {
      return NextResponse.json(
        { error: 'INVALID_STATUS', message: 'Status must be ACTIVE, SUSPENDED, or DEACTIVATED.' },
        { status: 400 }
      );
    }

    // Check if target is an Admin or Owner - high risk action requires step up
    const targetRoles = await getAccountRolesAsync(targetAccountId);
    const isTargetPrivileged = targetRoles.roles.includes('ROLE_ADMIN') || targetRoles.roles.includes('ROLE_PLATFORM_OWNER');

    if (isTargetPrivileged) {
      const stepUpValid = await validateStepUpTokenAsync(actorAccountId, stepUpToken);
      if (!stepUpValid) {
        return NextResponse.json(
          { error: 'STEP_UP_REQUIRED', message: 'High-risk action on privileged account requires step-up authentication.' },
          { status: 403 }
        );
      }
    }

    // Operation state machine
    const op = await createPrivilegedOperationAsync(
      actorAccountId,
      'ACCOUNT',
      targetAccountId,
      `SET_STATUS_${status}`,
      undefined,
      { previousStatus: (await getAccountByIdAsync(targetAccountId))?.status, reason }
    );

    const updated = await updateAccountStatusAsync(targetAccountId, status);
    if (!updated) {
      await updateOperationStateAsync(op.opId, 'FAILED', undefined, 'Account status update failed');
      return NextResponse.json(
        { error: 'NOT_FOUND', message: 'Target account not found or update failed.' },
        { status: 404 }
      );
    }

    await updateOperationStateAsync(op.opId, 'APPLIED');

    const audit = await recordAuditLogAsync({
      actorAccountId,
      capabilityUsed: 'accounts:suspend',
      action: `ACCOUNT_STATUS_${status}`,
      targetType: 'ACCOUNT',
      targetId: targetAccountId,
      ipHash: 'server_internal',
      userAgentHash: 'server_internal',
      stepUpMethodUsed: isTargetPrivileged ? 'PASSWORD' : undefined,
      outcome: 'SUCCESS',
      reason: reason || 'Administrative action',
      metadata: { newStatus: status },
    });

    await updateOperationStateAsync(op.opId, 'AUDITED', audit.auditId);

    return NextResponse.json({
      success: true,
      accountId: targetAccountId,
      status,
      auditId: audit.auditId,
    });
  } catch (err: any) {
    console.error('[Account Status Update Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
