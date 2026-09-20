import crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { validateRequestSessionAsync } from '../../../../../lib/security/session.ts';
import { distributedStore } from '../../../../../lib/security/distributedStore.ts';

const WALLET_CHALLENGE_PREFIX = 'auth:wallet_challenge:';

export async function POST(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return Response.json({ error: 'UNAUTHORIZED', message: 'Authentication required' }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await req.json();
    } catch {}

    const { walletAddress } = body || {};
    if (!walletAddress || typeof walletAddress !== 'string') {
      return Response.json({ error: 'INVALID_WALLET', message: 'Valid wallet address required' }, { status: 400 });
    }

    try {
      new PublicKey(walletAddress);
    } catch {
      return Response.json({ error: 'INVALID_WALLET', message: 'Invalid Solana wallet address' }, { status: 400 });
    }

    const nonce = `siws_bind_${crypto.randomBytes(16).toString('hex')}`;
    const issuedAt = new Date().toISOString();
    const expiresAt = Date.now() + 180_000; // 3 minutes
    const accountId = sessionResult.payload.accountId;
    const message = `Sign this message to bind wallet ${walletAddress} to Social.wtf account ${accountId}.\n\nNonce: ${nonce}\nIssued At: ${issuedAt}`;

    const challengeRecord = {
      accountId,
      walletAddress,
      nonce,
      message,
      issuedAt,
      expiresAt,
    };

    await distributedStore.set(
      `${WALLET_CHALLENGE_PREFIX}${nonce}`,
      JSON.stringify(challengeRecord),
      180
    );

    return Response.json({
      success: true,
      nonce,
      message,
      issuedAt,
      expiresAt,
    });
  } catch (err: any) {
    console.error('[Wallet Challenge API Error]:', err);
    return Response.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
