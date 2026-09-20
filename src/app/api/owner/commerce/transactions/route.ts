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
    const canReadCommerce = await accountHasCapabilityAsync(accountId, 'commerce:read');
    if (!canReadCommerce) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Account lacks commerce:read capability.' },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      transactions: [],
      reconciliationStatus: 'RECONCILED',
      treasuryVolumeCook: 0,
      activeStorefronts: 0,
    });
  } catch (err: any) {
    console.error('[Owner Commerce Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
