import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  isServerSignerConfigured,
  getServerSignerPublicKey,
  executeOnChainSplitTransaction,
} from '@/lib/solana/serverSigner';
import {
  getCookieConnection,
  COOKIE_CHAIN_CONFIG,
  PLATFORM_TREASURY_PUBKEY,
} from '@/lib/solana/cookieChain';
import { rateLimiter } from '@/lib/security/rateLimiter';
import { sanitizeString } from '@/lib/security/sanitize';
import { validateRequestSessionAsync } from '@/lib/security/session';

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
      : 'Set PLATFORM_PRIVATE_KEY in .env.local (Base58 or JSON format) to enable automated on-chain execution.',
  });
}

export async function POST(req: Request) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim() || '127.0.0.1';
  
  // 1. IP-level Rate Limiting
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

  try {
    const body = await req.json().catch(() => ({}));
    const {
      rawTransaction,
      recipientPublicKey,
      amountCook,
      action = 'transfer',
      memo = '',
    } = body;

    // Case 1: Client broadcast of pre-signed transaction (e.g. from Nightly or Trust Wallet)
    if (rawTransaction && typeof rawTransaction === 'string') {
      if (rawTransaction.length > 8192) {
        return NextResponse.json(
          { error: 'Raw transaction payload exceeds maximum allowed size.' },
          { status: 400 }
        );
      }

      try {
        const connection = getCookieConnection();
        const txBuffer = Buffer.from(rawTransaction, 'base64');
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

    // Case 2: Server-side signing and execution using configured PLATFORM_PRIVATE_KEY
    // Require session authentication to prevent unauthorized server key draining
    const authResult = await validateRequestSessionAsync(req);
    if (!authResult.authenticated) {
      return NextResponse.json(
        {
          error: 'Authentication required for automated server-signed transactions. Please sign in with your wallet.',
          code: 'AUTH_REQUIRED',
        },
        { status: 401 }
      );
    }

    // Per-wallet rate limiting
    const walletRateResult = await rateLimiter.checkAsync(
      `tx_exec_wallet:${authResult.payload.walletAddress}`,
      10,
      60 * 1000
    );
    if (!walletRateResult.allowed) {
      return NextResponse.json(
        {
          error: 'Wallet transaction rate limit reached. Please wait before executing further transactions.',
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
          error:
            'Server signer is not configured. Please set PLATFORM_PRIVATE_KEY in your .env.local file with your Trust Wallet or Solana private key.',
          code: 'SERVER_KEY_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    const execResult = await executeOnChainSplitTransaction({
      recipientPublicKey: sanitizeString(recipientPublicKey, 64),
      amountCook: numericAmount,
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
