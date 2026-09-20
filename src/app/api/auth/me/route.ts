import { NextResponse } from 'next/server';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { getAccountByIdAsync, getAccountRolesAsync, getWalletBindingAsync } from '@/lib/data/accountStore';

export async function GET(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ authenticated: false, reason: sessionResult.reason }, { status: 401 });
    }

    const { accountId, username, walletAddress } = sessionResult.payload;
    const account = await getAccountByIdAsync(accountId);
    const roleRecord = await getAccountRolesAsync(accountId);

    let walletBinding = null;
    if (account?.primaryWalletAddress || walletAddress) {
      const activeWallet = account?.primaryWalletAddress || walletAddress;
      if (activeWallet) {
        walletBinding = await getWalletBindingAsync(activeWallet);
      }
    }

    return NextResponse.json({
      authenticated: true,
      account: {
        accountId,
        username: account?.username || username,
        status: account?.status || 'ACTIVE',
        createdAt: account?.createdAt,
        primaryWalletAddress: account?.primaryWalletAddress || walletAddress,
      },
      roles: roleRecord.roles,
      capabilities: roleRecord.directCapabilities,
      walletBinding: walletBinding
        ? {
            walletAddress: walletBinding.walletAddress,
            status: walletBinding.status,
            verifiedAt: walletBinding.verifiedAt,
            verificationMethod: walletBinding.verificationMethod,
          }
        : null,
    });
  } catch (err: any) {
    console.error('[Me API Error]:', err);
    return NextResponse.json(
      { error: 'INTERNAL_ERROR', message: 'An internal server error occurred.' },
      { status: 500 }
    );
  }
}
