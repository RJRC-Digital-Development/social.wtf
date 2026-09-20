import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../lib/security/session.ts';
import {
  sendFriendRequestAsync,
  cancelFriendRequestAsync,
  RelationshipStoreUnavailableError,
} from '../../../../lib/data/relationshipStore.ts';
import { globalRateLimiter } from '../../../../lib/security/rateLimiter.ts';
import { getClientIp } from '../../../../lib/security/ipHelper.ts';

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await globalRateLimiter.checkAsync(`friend:request:${ip}`, 20, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Friend request rate limit exceeded. Please wait a moment.' },
        { status: 429 }
      );
    }

    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: sessionResult.reason || 'Authentication required.', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const walletAddress = sessionResult.payload.walletAddress || sessionResult.payload.accountId;
    const body = await req.json().catch(() => ({}));
    const targetWallet = body.targetWallet || body.walletAddress || body.recipientWallet;

    if (!targetWallet) {
      return NextResponse.json({ error: 'Missing target wallet address.' }, { status: 400 });
    }

    const result = await sendFriendRequestAsync(walletAddress, targetWallet);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to dispatch friend request.' },
        { status: result.status || 400 }
      );
    }

    return NextResponse.json({ success: true, message: 'Friend request dispatched successfully.' }, { status: 201 });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    console.error('[API/Friends Request POST] Unexpected error:', err);
    return NextResponse.json({ error: 'Failed to process friend request', code: 'FRIEND_REQUEST_ERROR' }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
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
    const targetWallet = body.targetWallet || body.recipientWallet;

    if (!targetWallet) {
      return NextResponse.json({ error: 'Missing target wallet address.' }, { status: 400 });
    }

    await cancelFriendRequestAsync(walletAddress, targetWallet);
    return NextResponse.json({ success: true, message: 'Outbound friend request cancelled.' });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to cancel friend request', code: 'CANCEL_REQUEST_ERROR' }, { status: 500 });
  }
}
