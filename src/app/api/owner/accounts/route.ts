import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { accountHasCapabilityAsync } from '@/lib/security/rbac';
import { listAllAccountsAsync, getAccountRolesAsync, getWalletBindingAsync } from '@/lib/data/accountStore';

export async function GET(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    const { accountId } = sessionResult.payload;
    const canReadAccounts = await accountHasCapabilityAsync(accountId, 'accounts:read');
    if (!canReadAccounts) {
      return NextResponse.json(
        { error: 'FORBIDDEN', message: 'Account lacks accounts:read capability.' },
        { status: 403 }
      );
    }

    const accounts = await listAllAccountsAsync(100);
    const enrichedAccounts = await Promise.all(
      accounts.map(async (acc) => {
        const roles = await getAccountRolesAsync(acc.accountId);
        let binding = null;
        if (acc.primaryWalletAddress) {
          binding = await getWalletBindingAsync(acc.primaryWalletAddress);
        }
        return {
          accountId: acc.accountId,
          username: acc.username,
          status: acc.status,
          createdAt: acc.createdAt,
          updatedAt: acc.updatedAt,
          primaryWalletAddress: acc.primaryWalletAddress || null,
          walletBound: Boolean(binding && binding.status === 'VERIFIED'),
          roles: roles.roles,
        };
      })
    );

    return NextResponse.json({
      success: true,
      accounts: enrichedAccounts,
      count: enrichedAccounts.length,
    });
  } catch (err: any) {
    console.error('[Owner Accounts Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
