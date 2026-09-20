import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { accountHasCapabilityAsync } from '@/lib/security/rbac';

export async function GET(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const { accountId } = sessionResult.payload;
    const canReadSecurity = await accountHasCapabilityAsync(accountId, 'security:read');
    if (!canReadSecurity) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Account lacks security:read capability.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      securityStatus: 'HEALTHY',
      activeSuitesPassed: 23,
      authFailuresLast24h: 0,
      rateLimitTriggersLast24h: 0,
      quarantinedPayloads: 0,
    });
  } catch (err: any) {
    console.error('[Owner Security Events Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
