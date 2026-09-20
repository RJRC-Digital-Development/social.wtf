import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { accountHasCapabilityAsync, validateStepUpTokenAsync } from '@/lib/security/rbac';
import { updateRuntimeFeatureStateAsync, getEffectiveFeatureStateAsync } from '@/lib/data/featureStore';
import { recordAuditLogAsync, createPrivilegedOperationAsync, updateOperationStateAsync } from '@/lib/data/auditStore';

export async function POST(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const { accountId: actorAccountId } = sessionResult.payload;
    const canToggle = await accountHasCapabilityAsync(actorAccountId, 'feature:toggle');
    if (!canToggle) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Account lacks feature:toggle capability.' },
        { status: 403 }
      );
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body' }, { status: 400 });
    }

    const { updates, stepUpToken, reason } = body || {};
    if (!updates || typeof updates !== 'object') {
      return NextResponse.json({ error: 'INVALID_UPDATES', message: 'Updates object required' }, { status: 400 });
    }

    // High risk action: requires Step-Up Token
    const stepUpValid = await validateStepUpTokenAsync(actorAccountId, stepUpToken);
    if (!stepUpValid) {
      return NextResponse.json(
        { error: 'STEP_UP_REQUIRED', message: 'Feature toggle is high-risk and requires step-up authentication.' },
        { status: 403 }
      );
    }

    const op = await createPrivilegedOperationAsync(
      actorAccountId,
      'SYSTEM_CONFIG',
      'features',
      'UPDATE_FEATURE_FLAGS',
      undefined,
      { requestedUpdates: updates, reason }
    );

    const updateResult = await updateRuntimeFeatureStateAsync(updates);
    if (!updateResult.success) {
      await updateOperationStateAsync(op.opId, 'FAILED', undefined, updateResult.error);
      return NextResponse.json(
        { error: 'FEATURE_UPDATE_FAILED', message: updateResult.error || 'Failed to update feature state.' },
        { status: 400 }
      );
    }

    await updateOperationStateAsync(op.opId, 'APPLIED');

    const audit = await recordAuditLogAsync({
      actorAccountId,
      capabilityUsed: 'feature:toggle',
      action: 'FEATURE_FLAGS_UPDATED',
      targetType: 'SYSTEM_CONFIG',
      targetId: 'features',
      ipHash: 'server_internal',
      userAgentHash: 'server_internal',
      stepUpMethodUsed: 'PASSWORD',
      outcome: 'SUCCESS',
      reason: reason || 'Owner dashboard feature toggle',
      metadata: {
        adultClubEffective: updateResult.effectiveState?.adultClub ?? false,
        mediaEffective: updateResult.effectiveState?.mediaCreation ?? false,
        registrationEffective: updateResult.effectiveState?.registration ?? true,
      },
    });

    await updateOperationStateAsync(op.opId, 'AUDITED', audit.auditId);

    const effective = await getEffectiveFeatureStateAsync();

    return NextResponse.json({
      success: true,
      effectiveState: effective,
      auditId: audit.auditId,
    });
  } catch (err: any) {
    console.error('[Kill Switch Toggle Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
