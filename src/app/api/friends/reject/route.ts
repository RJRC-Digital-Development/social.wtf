import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../lib/security/session.ts';
import {
  rejectFriendRequestAsync,
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
    const senderWallet = body.senderWallet || body.walletAddress || body.targetWallet;

    if (!senderWallet) {
      return NextResponse.json({ error: 'Missing sender wallet address.' }, { status: 400 });
    }

    await rejectFriendRequestAsync(walletAddress, senderWallet);
    return NextResponse.json({ success: true, message: 'Friend request declined.' });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to decline friend request', code: 'REJECT_FRIEND_ERROR' }, { status: 500 });
  }
}
