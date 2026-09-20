import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { completeStepUpAsync } from '@/lib/security/rbac';

export async function POST(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body' }, { status: 400 });
    }

    const { challengeNonce, method, password } = body || {};
    if (!challengeNonce) {
      return NextResponse.json({ error: 'MISSING_NONCE', message: 'Challenge nonce is required' }, { status: 400 });
    }

    const { accountId, sessionId } = sessionResult.payload;
    const result = await completeStepUpAsync(
      accountId,
      challengeNonce,
      method || 'PASSWORD',
      password,
      sessionId
    );

    if (!result.success || !result.stepUpToken) {
      return NextResponse.json(
        { error: 'STEP_UP_FAILED', message: result.error || 'Failed to verify step-up challenge.' },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({
      success: true,
      stepUpToken: result.stepUpToken,
      expiresInSeconds: 300,
    });
  } catch (err: any) {
    console.error('[Owner Step-Up Verify Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
