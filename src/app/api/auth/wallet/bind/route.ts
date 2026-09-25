import crypto from 'crypto';
import { PublicKey } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import { validateRequestSessionAsync, createAccountSession, createSessionCookie } from '../../../../../lib/security/session.ts';
import { bindVerifiedWalletAsync, getAccountByIdAsync, getAccountRolesAsync } from '../../../../../lib/data/accountStore.ts';
import { recordAuditLogAsync } from '../../../../../lib/data/auditStore.ts';
import { distributedStore } from '../../../../../lib/security/distributedStore.ts';

const WALLET_CHALLENGE_PREFIX = 'auth:wallet_challenge:';

export async function POST(req: Request) {
  try {
    const sessionResult = await validateRequestSessionAsync(req);
    if (!sessionResult.authenticated) {
      return Response.json({ error: 'UNAUTHORIZED', message: 'Authentication required.' }, { status: 401 });
    }

    const { accountId } = sessionResult.payload;

    let body: any;
    try {
      body = await req.json();
    } catch {
      return Response.json({ error: 'INVALID_JSON', message: 'Invalid JSON body.' }, { status: 400 });
    }

    const { walletAddress, nonce, signatureBase58 } = body || {};
    if (!walletAddress || !nonce || !signatureBase58) {
      return Response.json(
        { error: 'MISSING_FIELDS', message: 'walletAddress, nonce, and signatureBase58 are required.' },
        { status: 400 }
      );
    }

    // Verify walletAddress is valid Solana public key
    let pubKeyBytes: Uint8Array;
    try {
      pubKeyBytes = new PublicKey(walletAddress).toBytes();
    } catch {
      return Response.json({ error: 'INVALID_WALLET', message: 'Invalid Solana wallet address.' }, { status: 400 });
    }

    // Decode signature
    let sigBytes: Uint8Array;
    try {
      sigBytes = bs58.decode(signatureBase58);
      if (sigBytes.length !== 64) {
        return Response.json({ error: 'INVALID_SIGNATURE', message: 'Invalid signature length.' }, { status: 400 });
      }
    } catch {
      return Response.json({ error: 'INVALID_SIGNATURE', message: 'Failed to decode base58 signature.' }, { status: 400 });
    }

    // Atomically consume challenge nonce (single-use anti-replay)
    const raw = await distributedStore.getdel(`${WALLET_CHALLENGE_PREFIX}${nonce}`);
    if (!raw) {
      return Response.json(
        { error: 'INVALID_CHALLENGE', message: 'Challenge nonce not found, already consumed, or expired.' },
        { status: 400 }
      );
    }

    let challengeData: {
      accountId: string;
      walletAddress: string;
      nonce: string;
      message: string;
      issuedAt: string;
      expiresAt: number;
    } | null = null;

    try {
      challengeData = JSON.parse(raw);
    } catch {
      return Response.json({ error: 'INVALID_CHALLENGE', message: 'Malformed challenge data.' }, { status: 400 });
    }

    if (!challengeData || !challengeData.message || !challengeData.accountId || !challengeData.walletAddress) {
      return Response.json({ error: 'INVALID_CHALLENGE', message: 'Invalid challenge data.' }, { status: 400 });
    }

    // 1. Enforce challenge expiration
    if (Date.now() > challengeData.expiresAt) {
      return Response.json({ error: 'CHALLENGE_EXPIRED', message: 'Challenge nonce has expired.' }, { status: 400 });
    }

    // 2. Enforce account ownership of challenge
    if (challengeData.accountId !== accountId) {
      return Response.json(
        { error: 'ACCOUNT_MISMATCH', message: 'Challenge was issued for a different account.' },
        { status: 403 }
      );
    }

    // 3. Enforce wallet matching challenge
    if (challengeData.walletAddress !== walletAddress) {
      return Response.json(
        { error: 'WALLET_MISMATCH', message: 'Challenge was issued for a different wallet.' },
        { status: 400 }
      );
    }

    // 4. Verify signature strictly against server-reconstructed canonical message
    const msgVariations = [
      challengeData.message.replace(/\r\n/g, '\n'),
      challengeData.message.replace(/\n/g, '\r\n'),
      challengeData.message,
    ];
    let isValid = false;
    for (const msg of msgVariations) {
      const messageBytes = new TextEncoder().encode(msg);
      try {
        if (ed25519.verify(sigBytes, messageBytes, pubKeyBytes)) {
          isValid = true;
          break;
        }
      } catch {}
    }

    if (!isValid) {
      return Response.json(
        { error: 'SIGNATURE_VERIFICATION_FAILED', message: 'Cryptographic proof of wallet control failed.' },
        { status: 400 }
      );
    }

    // Compute challenge digest for verification record (do not store raw signature)
    const challengeDigest = crypto.createHash('sha256').update(`${nonce}:${walletAddress}`).digest('hex');
    const verificationAuditId = `aud_bind_${crypto.randomBytes(12).toString('hex')}`;

    const bindResult = await bindVerifiedWalletAsync(accountId, walletAddress, challengeDigest, verificationAuditId);
    if (!bindResult.success || !bindResult.binding) {
      return Response.json(
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

    const response = Response.json({
      success: true,
      sessionToken: updatedToken,
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
    return Response.json({ error: 'INTERNAL_ERROR', message: 'Internal server error' }, { status: 500 });
  }
}
