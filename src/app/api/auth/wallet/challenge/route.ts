import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { distributedStore } from '@/lib/security/distributedStore';

const WALLET_CHALLENGE_PREFIX = 'auth:wallet_challenge:';
const memoryChallenges = new Map<string, { accountId: string; nonce: string; expiresAt: number }>();

export async function POST(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const { walletAddress } = body;
    if (!walletAddress || typeof walletAddress !== 'string' || walletAddress.length < 32) {
      return NextResponse.json({ error: 'INVALID_WALLET', message: 'Valid wallet address required' }, { status: 400 });
    }

    const nonce = `siws_bind_${crypto.randomBytes(16).toString('hex')}`;
    const message = `Sign this message to bind wallet ${walletAddress} to Social.wtf account ${sessionResult.payload.accountId}.\n\nNonce: ${nonce}\nIssued At: ${new Date().toISOString()}`;
    const expiresAt = Date.now() + 180_000; // 3 minutes

    if (distributedStore.isConfigured()) {
      await distributedStore.set(`${WALLET_CHALLENGE_PREFIX}${nonce}`, JSON.stringify({ accountId: sessionResult.payload.accountId, walletAddress }), 180);
    }

    memoryChallenges.set(nonce, { accountId: sessionResult.payload.accountId, nonce, expiresAt });

    return NextResponse.json({
      success: true,
      nonce,
      message,
      expiresAt,
    });
  } catch (err: any) {
    console.error('[Wallet Challenge API Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
