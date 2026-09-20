import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../../lib/security/session.ts';
import { createClubInvitationAsync, isClubMemberAsync, ClubStoreUnavailableError } from '../../../../../lib/data/clubStore.ts';
import { isAdultClubEnabled } from '../../../../../lib/security/clubAuth.ts';
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

    const inviterWallet = sessionResult.payload.walletAddress;
    const isMember = await isClubMemberAsync(inviterWallet);
    if (!isMember) {
      return NextResponse.json(
        { error: 'Only active club members are authorized to issue invitations', code: 'CLUB_MEMBERSHIP_REQUIRED' },
        { status: 403 }
      );
    }

    const body = await req.json().catch(() => ({}));
    const recipientWallet = sanitizeString(body.recipientWallet || '', 100);

    if (!recipientWallet) {
      return NextResponse.json(
        { error: 'recipientWallet is required', code: 'MISSING_RECIPIENT' },
        { status: 400 }
      );
    }

    if (inviterWallet.toLowerCase() === recipientWallet.toLowerCase()) {
      return NextResponse.json(
        { error: 'Self-invitations are strictly prohibited', code: 'SELF_INVITATION_PROHIBITED' },
        { status: 400 }
      );
    }

    const invitation = await createClubInvitationAsync(inviterWallet, recipientWallet);

    return NextResponse.json({
      success: true,
      invitation: {
        code: invitation.code,
        recipientWallet: invitation.recipientWallet,
        expiresAt: invitation.expiresAt,
        status: invitation.status,
      },
    }, { status: 201 });
  } catch (err: any) {
    if (err instanceof ClubStoreUnavailableError || err?.code === 'CLUB_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Club invitation service temporarily unavailable', code: 'CLUB_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: err?.message || 'Failed to create invitation', code: 'INVITATION_CREATION_FAILED' },
      { status: 400 }
    );
  }
}
