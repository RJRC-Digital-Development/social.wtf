import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  isServerSignerConfigured,
  getServerSignerPublicKey,
  executeOnChainSplitTransaction,
  ALLOWED_PLATFORM_OPERATIONS,
  AllowedPlatformOperation,
} from '@/lib/solana/serverSigner';
import {
  getCookieConnection,
  COOKIE_CHAIN_CONFIG,
  PLATFORM_TREASURY_PUBKEY,
} from '@/lib/solana/cookieChain';
import { rateLimiter } from '@/lib/security/rateLimiter';
import { sanitizeString } from '@/lib/security/sanitize';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { getClientIp } from '@/lib/security/ipHelper';

const MAX_COOK_PER_TRANSACTION = 10_000;

export async function GET(req: Request) {
  const isConfigured = isServerSignerConfigured();
  const signerAddress = getServerSignerPublicKey();

  return NextResponse.json({
    isConfigured,
    signerAddress,
    chainName: COOKIE_CHAIN_CONFIG.chainName,
    rpcUrl: COOKIE_CHAIN_CONFIG.rpcUrl,
    treasuryAddress: PLATFORM_TREASURY_PUBKEY.toBase58(),
    instructions: isConfigured
      ? 'Server signer is ready to sign and complete transactions on Cookie Chain.'
      : 'Set PLATFORM_PRIVATE_KEY in environment to enable automated on-chain execution.',
  });
}

export async function POST(req: Request) {
  const ip = getClientIp(req);

  // 1. IP-level Rate Limiting: 30 requests per minute per IP
  const ipRateResult = await rateLimiter.checkAsync(`tx_exec_ip:${ip}`, 30, 60 * 1000);
  if (!ipRateResult.allowed) {
    return NextResponse.json(
      {
        error: 'Too many transaction requests from this IP. Please wait a moment.',
        retryAfterMs: ipRateResult.resetMs,
      },
      { status: 429 }
    );
  }

  // 2. Global Authentication Guard: Both raw relay and server signer REQUIRE a valid SIWS wallet session
  const authResult = await validateRequestSessionAsync(req);
  if (!authResult.authenticated) {
    return NextResponse.json(
      {
        error: 'Authentication required to relay or execute transactions. Please sign in with your wallet.',
        code: 'AUTH_REQUIRED',
      },
      { status: 401 }
    );
  }

  const { walletAddress, scope } = authResult.payload;

  try {
    const body = await req.json().catch(() => ({}));
    const {
      rawTransaction,
      recipientPublicKey,
      amountCook,
      action = 'platform_sweep',
      memo = '',
    } = body;

    // Case 1: Authenticated User relay of client-signed raw transaction (e.g. from Nightly or Trust Wallet)
    if (rawTransaction !== undefined) {
      if (typeof rawTransaction !== 'string') {
        return NextResponse.json(
          { error: 'Invalid raw transaction payload type. Expected base64 string.' },
          { status: 400 }
        );
      }

      if (rawTransaction.length === 0) {
        return NextResponse.json(
          { error: 'Raw transaction payload cannot be empty.' },
          { status: 400 }
        );
      }

      if (rawTransaction.length > 8192) {
        return NextResponse.json(
          { error: 'Raw transaction payload exceeds maximum allowed size (8KB).' },
          { status: 400 }
        );
      }

      // Validate base64 characters
      if (!/^[A-Za-z0-9+/=_-]+$/.test(rawTransaction)) {
        return NextResponse.json(
          { error: 'Raw transaction payload contains invalid base64 characters.' },
          { status: 400 }
        );
      }

      // Per-wallet relay rate limiting: 20 raw transactions per minute per wallet
      const relayRateResult = await rateLimiter.checkAsync(
        `tx_relay_wallet:${walletAddress}`,
        20,
        60 * 1000
      );
      if (!relayRateResult.allowed) {
        return NextResponse.json(
          {
            error: 'Wallet transaction relay rate limit reached. Please wait a moment.',
            retryAfterMs: relayRateResult.resetMs,
          },
          { status: 429 }
        );
      }

      try {
        const connection = getCookieConnection();
        const normalizedBase64 = rawTransaction.replace(/-/g, '+').replace(/_/g, '/');
        const txBuffer = Buffer.from(normalizedBase64, 'base64');

        if (txBuffer.length === 0) {
          return NextResponse.json(
            { error: 'Decoded transaction buffer is empty.' },
            { status: 400 }
          );
        }

        const signature = await connection.sendRawTransaction(txBuffer, {
          skipPreflight: false,
          preflightCommitment: 'confirmed',
        });

        return NextResponse.json({
          success: true,
          method: 'wallet_broadcast',
          signature,
          explorerUrl: `${COOKIE_CHAIN_CONFIG.explorerUrl}/tx/${signature}`,
        });
      } catch (broadcastErr: any) {
        return NextResponse.json(
          {
            success: false,
            error: broadcastErr.message || 'Failed to broadcast raw transaction to Cookie Chain.',
          },
          { status: 400 }
        );
      }
    }

    // Case 2: Privileged Server-side signing using platform hot wallet
    // Strict boundary: Only verified administrative sessions (scope === 'admin') may authorize server signer expenditure
    if (scope !== 'admin') {
      return NextResponse.json(
        {
          error: 'Ordinary user sessions cannot authorize platform hot wallet transfers. Client wallet signature required.',
          code: 'FORBIDDEN_SCOPE',
        },
        { status: 403 }
      );
    }

    if (!ALLOWED_PLATFORM_OPERATIONS.includes(action as AllowedPlatformOperation)) {
      return NextResponse.json(
        {
          error: `Disallowed platform operation '${action}'. Allowed operations: ${ALLOWED_PLATFORM_OPERATIONS.join(', ')}`,
          code: 'INVALID_OPERATION',
        },
        { status: 400 }
      );
    }

    // Per-wallet admin execution rate limiting
    const walletRateResult = await rateLimiter.checkAsync(
      `tx_exec_wallet:${walletAddress}`,
      10,
      60 * 1000
    );
    if (!walletRateResult.allowed) {
      return NextResponse.json(
        {
          error: 'Admin transaction rate limit reached. Please wait before executing further transactions.',
          retryAfterMs: walletRateResult.resetMs,
        },
        { status: 429 }
      );
    }

    if (!recipientPublicKey || typeof recipientPublicKey !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid recipient public key address.' },
        { status: 400 }
      );
    }

    // Validate valid Base58 Solana/SVM public key
    try {
      new PublicKey(recipientPublicKey);
    } catch {
      return NextResponse.json(
        { error: 'Recipient address is not a valid Cookie Chain / SVM public key.' },
        { status: 400 }
      );
    }

    const numericAmount = Number(amountCook);
    if (isNaN(numericAmount) || !isFinite(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a valid positive number greater than 0.' },
        { status: 400 }
      );
    }

    if (numericAmount > MAX_COOK_PER_TRANSACTION) {
      return NextResponse.json(
        {
          error: `Transaction amount exceeds safety limit of ${MAX_COOK_PER_TRANSACTION.toLocaleString()} COOK.`,
        },
        { status: 400 }
      );
    }

    if (!isServerSignerConfigured()) {
      return NextResponse.json(
        {
          success: false,
          error: 'Server signer is not configured in environment.',
          code: 'SERVER_KEY_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    const execResult = await executeOnChainSplitTransaction({
      recipientPublicKey: sanitizeString(recipientPublicKey, 64),
      amountCook: numericAmount,
      operation: action as AllowedPlatformOperation,
      memo: sanitizeString(memo, 120),
    });

    if (!execResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: execResult.error,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      method: 'server_signer',
      action,
      ...execResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error while executing transaction.' },
      { status: 500 }
    );
  }
}

