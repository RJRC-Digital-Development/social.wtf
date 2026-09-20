import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../lib/security/session.ts';
import {
  blockWalletAsync,
  unblockWalletAsync,
  RelationshipStoreUnavailableError,
} from '../../../../lib/data/relationshipStore.ts';

export async function POST(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: sessionResult.reason || 'Authentication required.', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const { walletAddress } = sessionResult.payload;
    const body = await req.json().catch(() => ({}));
    const targetWallet = body.targetWallet || body.walletAddress;
    const action = body.action || 'block';

    if (!targetWallet) {
      return NextResponse.json({ error: 'Missing targetWallet address.' }, { status: 400 });
    }

    if (action === 'unblock') {
      await unblockWalletAsync(walletAddress, targetWallet);
      return NextResponse.json({ success: true, message: 'User unblocked.' });
    } else {
      await blockWalletAsync(walletAddress, targetWallet);
      return NextResponse.json({ success: true, message: 'User blocked and relationships severed.' });
    }
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to update block state', code: 'BLOCK_ERROR' }, { status: 500 });
  }
}
