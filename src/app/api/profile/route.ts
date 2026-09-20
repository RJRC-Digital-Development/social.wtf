import { NextResponse } from 'next/server.js';
import {
  getProfileByWalletAsync,
  getProfileByHandleAsync,
  saveOnboardedProfileAsync,
} from '../../../lib/data/profileStore.ts';
import {
  areFriendsAsync,
  isAnyBlockedAsync,
  RelationshipStoreUnavailableError,
} from '../../../lib/data/relationshipStore.ts';
import { validateRequestSessionAsync } from '../../../lib/security/session.ts';
import { globalRateLimiter } from '../../../lib/security/rateLimiter.ts';
import { getClientIp } from '../../../lib/security/ipHelper.ts';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const targetWallet = searchParams.get('wallet');
    const targetHandle = searchParams.get('handle');

    // Authenticate caller via SIWS session
    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Authentication required to view profile records', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const callerWallet = auth.payload.walletAddress || auth.payload.accountId;

    let targetProfile = null;
    if (targetWallet) {
      targetProfile = await getProfileByWalletAsync(targetWallet);
    } else if (targetHandle) {
      targetProfile = await getProfileByHandleAsync(targetHandle);
    } else {
      // Default to caller's own profile
      targetProfile = await getProfileByWalletAsync(callerWallet);
    }

    if (!targetProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const resolvedWallet = targetProfile.walletAddress;

    // Relationship privacy boundary:
    // Only self or accepted friends can view full profile details.
    const isSelf = callerWallet === resolvedWallet;
    const isFriend = !isSelf && (await areFriendsAsync(callerWallet, resolvedWallet));

    if (!isSelf && !isFriend) {
      // Generic 404 to avoid existence oracle leaks
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    if (!isSelf && (await isAnyBlockedAsync(callerWallet, resolvedWallet))) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, profile: targetProfile });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error retrieving profile' },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const ip = getClientIp(req);
    const rateCheck = await globalRateLimiter.checkAsync(`profile_onboard:${ip}`, 20, 60_000);
    if (!rateCheck.allowed) {
      return NextResponse.json(
        { error: 'Rate limit exceeded. Please wait before updating profile.' },
        { status: 429, headers: { 'Retry-After': Math.ceil(rateCheck.resetMs / 1000).toString() } }
      );
    }

    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated) {
      return NextResponse.json(
        { error: 'Authentication required to create or update profile space' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    
    // Security Rule: Never trust client-supplied walletAddress / ownerId for profile ownership
    const authenticatedWallet = auth.payload.walletAddress || auth.payload.accountId;
    const isAdmin = auth.payload.scope === 'admin';

    const result = await saveOnboardedProfileAsync(authenticatedWallet, body, isAdmin);

    if (!result.success) {
      const isServiceUnavailable = result.error?.toLowerCase().includes('unavailable');
      return NextResponse.json(
        { error: result.error || 'Failed to save profile' },
        { status: isServiceUnavailable ? 503 : 400 }
      );
    }

    return NextResponse.json({
      success: true,
      profile: result.profile,
    });
  } catch {
    return NextResponse.json(
      { error: 'Internal server error processing profile onboarding' },
      { status: 500 }
    );
  }
}
