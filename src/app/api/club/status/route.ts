import { NextResponse } from 'next/server.js';
import { validateRequestSessionAsync } from '../../../../lib/security/session.ts';
import { isClubMemberAsync } from '../../../../lib/data/clubStore.ts';
import { isAdultEligibleAsync, isAdultClubEnabled } from '../../../../lib/security/clubAuth.ts';

export async function GET(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json(
        { error: 'Authentication required', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const callerWallet = sessionResult.payload.walletAddress;
    const isAdult = await isAdultEligibleAsync(callerWallet);
    const clubEnabled = isAdultClubEnabled();
    const isMember = clubEnabled ? await isClubMemberAsync(callerWallet) : false;

    return NextResponse.json({
      isClubEnabled: clubEnabled,
      isClubMember: isMember,
      isAdultEligible: isAdult,
    });
  } catch (err) {
    return NextResponse.json(
      { error: 'Failed to retrieve club status', code: 'CLUB_STATUS_ERROR' },
      { status: 500 }
    );
  }
}
