import { NextResponse } from 'next/server.js';
import { getProfileByWalletAsync } from '../../../lib/data/profileStore.ts';
import {
  getFriendsListAsync,
  RelationshipStoreUnavailableError,
} from '../../../lib/data/relationshipStore.ts';
import { validateRequestSessionAsync } from '../../../lib/security/session.ts';

export async function GET(req: Request) {
  try {
    // Authenticate caller via SIWS session
    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated || !auth.payload?.walletAddress) {
      return NextResponse.json(
        { error: 'Authentication required to view member profiles', code: 'AUTH_REQUIRED' },
        { status: 401 }
      );
    }

    const callerWallet = auth.payload.walletAddress;
    const friends = await getFriendsListAsync(callerWallet);
    const permittedWallets = [callerWallet, ...friends];

    const profilePromises = permittedWallets.map((w) => getProfileByWalletAsync(w).catch(() => null));
    const profiles = await Promise.all(profilePromises);
    const authorizedProfiles = profiles.filter(Boolean);

    return NextResponse.json({
      success: true,
      count: authorizedProfiles.length,
      profiles: authorizedProfiles,
    });
  } catch (err: any) {
    if (err instanceof RelationshipStoreUnavailableError || err?.code === 'RELATIONSHIP_STORE_UNAVAILABLE') {
      return NextResponse.json(
        { error: 'Relationship service temporarily unavailable', code: 'RELATIONSHIP_STORE_UNAVAILABLE' },
        { status: 503 }
      );
    }
    return NextResponse.json(
      { error: 'Internal server error fetching member directory' },
      { status: 500 }
    );
  }
}
