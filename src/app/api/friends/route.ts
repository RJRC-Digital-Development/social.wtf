import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../lib/security/session.ts';
import {
  getFriendsListAsync,
  getInboundRequestsAsync,
  getOutboundRequestsAsync,
  getBlockedListAsync,
  getRelationshipStatusAsync,
  unfriendAsync,
  RelationshipStoreUnavailableError,
} from '../../../lib/data/relationshipStore.ts';
import { getProfileByWalletAsync } from '../../../lib/data/profileStore.ts';

export async function GET(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: sessionResult.reason || 'Authentication required.', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const { walletAddress } = sessionResult.payload;
    const url = new URL(req.url);
    const target = url.searchParams.get('target') || url.searchParams.get('wallet');

    if (target) {
      const status = await getRelationshipStatusAsync(walletAddress, target);
      return NextResponse.json({
        walletAddress,
        target,
        relationship: status,
      });
    }

    const [friends, inbound, outbound, blocked] = await Promise.all([
      getFriendsListAsync(walletAddress),
      getInboundRequestsAsync(walletAddress),
      getOutboundRequestsAsync(walletAddress),
      getBlockedListAsync(walletAddress),
    ]);

    // Populate minimal profile data for friends where available
    const friendProfiles = await Promise.all(
      friends.map(async (fWallet) => {
        const p = await getProfileByWalletAsync(fWallet).catch(() => null);
        return {
          walletAddress: fWallet,
          handle: p?.handle || `user_${fWallet.slice(0, 4).toLowerCase()}${fWallet.slice(-4).toLowerCase()}`,
          name: p?.name || `@${fWallet.slice(0, 4)}...${fWallet.slice(-4)}`,
          avatar: p?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${fWallet}`,
          bio: p?.bio || '',
          verified: p?.verified ?? true,
          isCreator: p?.isCreator ?? false,
        };
      })
    );

    return NextResponse.json({
      friends: friendProfiles,
      friendWallets: friends,
      inboundRequests: inbound,
      outboundRequests: outbound,
      blockedWallets: blocked,
      counts: {
        friends: friends.length,
        inbound: inbound.length,
        outbound: outbound.length,
        blocked: blocked.length,
      },
    });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    console.error('[API/Friends GET] Unexpected error:', err);
    return NextResponse.json({ error: 'Failed to retrieve relationships', code: 'FRIENDS_ERROR' }, { status: 500 });
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

    const { walletAddress } = sessionResult.payload;
    const body = await req.json().catch(() => ({}));
    const targetWallet = body.targetWallet || body.walletAddress;

    if (!targetWallet) {
      return NextResponse.json({ error: 'Missing targetWallet parameter.' }, { status: 400 });
    }

    await unfriendAsync(walletAddress, targetWallet);
    return NextResponse.json({ success: true, message: 'Unfriended successfully.' });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json({ error: 'Failed to remove friend relationship', code: 'UNFRIEND_ERROR' }, { status: 500 });
  }
}
