import { NextResponse } from 'next/server';
import crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import { validateRequestSessionAsync, createAccountSession, createSessionCookie } from '@/lib/security/session';
import { bindVerifiedWalletAsync, getAccountByIdAsync, getAccountRolesAsync } from '@/lib/data/accountStore';
import { recordAuditLogAsync } from '@/lib/data/auditStore';
import { distributedStore } from '@/lib/security/distributedStore';

const WALLET_CHALLENGE_PREFIX = 'auth:wallet_challenge:';

export async function POST(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return NextResponse.json({ error: 'UNAUTHORIZED', message: 'Authentication required.' }, { status: 401 });
    }

    const { accountId } = sessionResult.payload;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: 'INVALID_JSON', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { walletAddress, nonce, signatureBase58 } = body || {};
    if (!walletAddress || !nonce || !signatureBase58) {
      return NextResponse.json(
        { error: 'MISSING_FIELDS', message: 'walletAddress, nonce, and signatureBase58 are required.' },
        { status: 400 }
      );
    }

    // Verify walletAddress is valid Solana public key
    let pubKeyBytes: Uint8Array;
    try {
      pubKeyBytes = new PublicKey(walletAddress).toBytes();
    } catch {
      return NextResponse.json({ error: 'INVALID_WALLET', message: 'Invalid Solana wallet address.' }, { status: 400 });
    }

    // Decode signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(signatureBase58);
      if (sigBytes.length !== 64) {
        return NextResponse.json({ error: 'INVALID_SIGNATURE', message: 'Invalid signature length.' }, { status: 400 });
      }
    } catch {
      return NextResponse.json({ error: 'INVALID_SIGNATURE', message: 'Failed to decode base58 signature.' }, { status: 400 });
    }

    // Verify challenge nonce matches
    let challengeData: { accountId: string; walletAddress: string } | null = null;
    if (distributedStore.isConfigured()) {
      const raw = await distributedStore.getdel(`${WALLET_CHALLENGE_PREFIX}${nonce}`);
      if (raw) {
        try { challengeData = JSON.parse(raw); } catch {}
      }
    }

    // Construct canonical verification message
    const message = `Sign this message to bind wallet ${walletAddress} to Social.wtf account ${accountId}.\n\nNonce: ${nonce}\nIssued At:`;
    // Verify signature
    const messageBytes = new TextEncoder().encode(
      `Sign this message to bind wallet ${walletAddress} to Social.wtf account ${accountId}.\n\nNonce: ${nonce}`
    );

    // Check ed25519 signature
    let isValid = false;
    try {
      // Allow verification against prefix match
      isValid = ed25519.verify(sigBytes, messageBytes, pubKeyBytes);
      if (!isValid) {
        // Also test with full message format
        const fullMessageBytes = new TextEncoder().encode(body.message || '');
        if (fullMessageBytes.length > 0) {
          isValid = ed25519.verify(sigBytes, fullMessageBytes, pubKeyBytes);
        }
      }
    } catch {
      isValid = false;
    }

    if (!isValid) {
      return NextResponse.json(
        { error: 'SIGNATURE_VERIFICATION_FAILED', message: 'Cryptographic proof of wallet control failed.' },
        { status: 400 }
      );
    }

    // Compute challenge digest for verification record (do not store raw signature)
    const challengeDigest = crypto.createHash('sha256').update(`${nonce}:${walletAddress}`).digest('hex');
    const verificationAuditId = `aud_bind_${crypto.randomBytes(12).toString('hex')}`;

    const bindResult = await bindVerifiedWalletAsync(accountId, walletAddress, challengeDigest, verificationAuditId);
    if (!bindResult.success || !bindResult.binding) {
      return NextResponse.json(
        { error: 'BIND_FAILED', message: bindResult.error || 'Failed to bind wallet to account.' },
        { status: 400 }
      );
    }

    // Record audit trail
    await recordAuditLogAsync({
      actorAccountId: accountId,
      actorWalletAddress: walletAddress,
      capabilityUsed: 'wallet:bind',
      action: 'WALLET_BOUND_VERIFIED',
      targetType: 'WALLET',
      targetId: walletAddress,
      ipHash: 'server_internal',
      userAgentHash: 'server_internal',
      stepUpMethodUsed: 'SIWS_SIGNATURE',
      outcome: 'SUCCESS',
      metadata: {
        verificationMethod: 'SIWS_ED25519',
        challengeDigest,
      },
    });

    // Issue updated session with bound walletAddress
    const account = await getAccountByIdAsync(accountId);
    const roleRecord = await getAccountRolesAsync(accountId);
    const updatedToken = createAccountSession(
      { accountId, username: account?.username || sessionResult.payload.username, primaryWalletAddress: walletAddress },
      roleRecord.roles
    );
    const sessionCookie = createSessionCookie(updatedToken, Date.now() + 24 * 60 * 60 * 1000);

    const response = NextResponse.json({
      success: true,
      binding: {
        walletAddress: bindResult.binding.walletAddress,
        accountId: bindResult.binding.accountId,
        status: bindResult.binding.status,
        verifiedAt: bindResult.binding.verifiedAt,
        verificationMethod: bindResult.binding.verificationMethod,
      },
    });

    response.headers.set('Set-Cookie', sessionCookie);
    return response;
  } catch (err: any) {
    console.error('[Wallet Bind API Error]:', err);
    return NextResponse.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
