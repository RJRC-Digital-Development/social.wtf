import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../lib/security/session.ts';
import {
  acceptFriendRequestAsync,
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

    const walletAddress = sessionResult.payload.walletAddress || sessionResult.payload.accountId;
    const body = await req.json().catch(() => ({}));
    const senderWallet = body.senderWallet || body.walletAddress || body.targetWallet;

    if (!senderWallet) {
      return NextResponse.json({ error: 'Missing sender wallet address.' }, { status: 400 });
    }

    const result = await acceptFriendRequestAsync(walletAddress, senderWallet);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to accept friend request.' },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({ success: true, message: 'Friend request accepted. Mutual friendship established.' });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    console.error('[API/Friends Accept POST] Unexpected error:', err);
    return NextResponse.json({ error: 'Failed to accept friend request', code: 'ACCEPT_FRIEND_ERROR' }, { status: 500 });
  }
}
