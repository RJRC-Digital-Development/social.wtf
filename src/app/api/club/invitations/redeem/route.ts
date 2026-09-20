import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../../lib/security/session.ts';
import { redeemClubInvitationAsync, getClubInvitationAsync, ClubStoreUnavailableError } from '../../../../../lib/data/clubStore.ts';
import { isAdultEligibleAsync, isAdultClubEnabled } from '../../../../../lib/security/clubAuth.ts';
import { sanitizeString } from '../../../../../lib/security/sanitize.ts';

export async function POST(req: Request) {
  try {
    if (!isAdultClubEnabled()) {
      return NextResponse.json(
        { error: 'Club subsystem currently inactive', code: 'CLUB_DISABLED' },
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
    const body = await req.json().catch(() => ({}));
    const code = sanitizeString(body.code || '', 200);

    if (!code) {
      return NextResponse.json(
        { error: 'Invitation code is required', code: 'MISSING_CODE' },
        { status: 400 }
      );
    }

    // Step 1: Pre-inspect invitation
    const invitation = await getClubInvitationAsync(code);
    if (!invitation) {
      return NextResponse.json(
        { error: 'Invitation not found or expired', code: 'INVITATION_NOT_FOUND' },
        { status: 404 }
      );
    }

    if (invitation.recipientWallet.toLowerCase() !== callerWallet.toLowerCase()) {
      return NextResponse.json(
        { error: 'Invitation is bound to a different wallet address', code: 'RECIPIENT_MISMATCH' },
        { status: 403 }
      );
    }

    if (invitation.status === 'redeemed') {
      return NextResponse.json(
        { error: 'Invitation has already been redeemed', code: 'ALREADY_REDEEMED' },
        { status: 409 }
      );
    }

    if (invitation.status === 'revoked') {
      return NextResponse.json(
        { error: 'Invitation has been revoked', code: 'INVITATION_REVOKED' },
        { status: 403 }
      );
    }

    // Step 2: Check adult eligibility BEFORE activation
    const isAdult = await isAdultEligibleAsync(callerWallet);
    if (!isAdult) {
      return NextResponse.json(
        { error: '18+ adult eligibility required before club admission can be activated', code: 'ADULT_ELIGIBILITY_REQUIRED' },
        { status: 403 }
      );
    }

    // Step 3: Redeem and activate
    const result = await redeemClubInvitationAsync(code, callerWallet);
    if (!result.success) {
      return NextResponse.json(
        { error: result.error || 'Failed to redeem invitation', code: result.code || 'REDEEM_FAILED' },
        { status: 400 }
      );
    }

    return NextResponse.json({
      success: true,
      membership: result.membership,
    });
  } catch (err: any) {
    if (err instanceof ClubStoreUnavailableError || err?.code === 'CLUB_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Club service temporarily unavailable', code: 'CLUB_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: err?.message || 'Failed to redeem invitation', code: 'INVITATION_REDEEM_ERROR' },
      { status: 500 }
    );
  }
}
