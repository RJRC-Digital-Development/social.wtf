import { NextResponse } from 'next/server';
import {
  getProfileByWalletAsync,
  getProfileByHandleAsync,
  saveOnboardedProfileAsync,
} from '@/lib/data/profileStore';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { globalRateLimiter } from '@/lib/security/rateLimiter';
import { getClientIp } from '@/lib/security/ipHelper';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const wallet = searchParams.get('wallet');
    const handle = searchParams.get('handle');

    if (wallet) {
      const profile = await getProfileByWalletAsync(wallet);
      if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, profile });
    }

    if (handle) {
      const profile = await getProfileByHandleAsync(handle);
      if (!profile) {
        return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
      }
      return NextResponse.json({ success: true, profile });
    }

    return NextResponse.json(
      { error: 'Provide either ?wallet=<address> or ?handle=<handle>' },
      { status: 400 }
    );
  } catch {
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

    // Authenticate caller via SIWS session
    const auth = await validateRequestSessionAsync(req);
    if (!auth.authenticated || !auth.payload?.walletAddress) {
      return NextResponse.json(
        { error: 'Authentication required to create or update profile space' },
        { status: 401 }
      );
    }

    const body = await req.json().catch(() => ({}));
    
    // Security Rule: Never trust client-supplied walletAddress / ownerId for profile ownership
    const authenticatedWallet = auth.payload.walletAddress;
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
