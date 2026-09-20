import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { issueStepUpChallengeAsync } from '@/lib/security/rbac';

export async function POST(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const { accountId, sessionId } = sessionResult.payload;
    const challenge = await issueStepUpChallengeAsync(accountId, sessionId);

    return NextResponse.json({
      success: true,
      challengeNonce: challenge.challengeNonce,
      expiresAt: challenge.expiresAt,
    });
  } catch (err: any) {
    console.error('[Owner Step-Up Challenge Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
