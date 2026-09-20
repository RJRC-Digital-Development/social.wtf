import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../lib/security/session.ts';
import { isClubMemberAsync } from '../../../../lib/data/clubStore.ts';
import { isAdultEligibleAsync, isAdultClubEnabled } from '../../../../lib/security/clubAuth.ts';
import { getFriendsListAsync, areFriendsAsync, isAnyBlockedAsync } from '../../../../lib/data/relationshipStore.ts';
import { getPostsByAuthorAsync, getAdultAuthorizedPostsAsync } from '../../../../lib/data/postsStore.ts';
import type { Post } from '../../../../types/index.ts';

export async function GET(req: Request) {
  try {
    if (!isAdultClubEnabled()) {
      return NextResponse.json(
        { error: 'Not found', code: 'NOT_FOUND' },
        { status: 404 }
      );
    }

    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const callerWallet = sessionResult.payload.walletAddress;

    // Check adult eligibility
    const isAdult = await isAdultEligibleAsync(callerWallet);
    if (!isAdult) {
      return NextResponse.json(
        { error: '18+ adult eligibility required', code: 'ADULT_ELIGIBILITY_REQUIRED' },
        { status: 403 }
      );
    }

    // Check active club membership
    const isMember = await isClubMemberAsync(callerWallet);
    if (!isMember) {
      return NextResponse.json(
        { error: 'Active club membership required', code: 'CLUB_MEMBERSHIP_REQUIRED' },
        { status: 403 }
      );
    }

    // Retrieve relationship-authorized sensitive posts (self + accepted friends)
    const friends = await getFriendsListAsync(callerWallet);
    const authorizedWallets = [callerWallet, ...friends];

    const postPromises = authorizedWallets.map(async (w) => {
      // Must not be blocked
      const blocked = await isAnyBlockedAsync(callerWallet, w);
      if (blocked) return [];
      const posts = await getPostsByAuthorAsync(w);
      // Return only sensitive posts (excluding quarantined/rejected)
      return posts.filter((p) => (p.isShielded || p.shieldCategory === 'age_restricted') && p.shieldCategory !== 'quarantined' && p.shieldCategory !== 'rejected');
    });

    const postArrays = await Promise.all(postPromises);
    const posts = postArrays.flat();
    posts.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    return NextResponse.json({
      success: true,
      posts,
      total: posts.length,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: 'Failed to retrieve club posts', code: 'CLUB_POSTS_FETCH_ERROR' },
      { status: 500 }
    );
  }
}
