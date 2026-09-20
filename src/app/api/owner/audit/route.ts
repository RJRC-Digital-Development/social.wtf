import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { accountHasCapabilityAsync } from '@/lib/security/rbac';
import { getAuditLogsAsync } from '@/lib/data/auditStore';

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

    const url = new URL(req.url);
    const limit = Math.min(100, Math.max(1, parseInt(url.searchParams.get('limit') || '50', 10)));
    const offset = Math.max(0, parseInt(url.searchParams.get('offset') || '0', 10));

    const logs = await getAuditLogsAsync(limit, offset);

    return NextResponse.json({
      success: true,
      logs,
      count: logs.length,
    });
  } catch (err: any) {
    console.error('[Owner Audit Log Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
