import { NextResponse } from 'next/server';
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
  const rateResult = await rateLimiter.checkAsync(`tx_exec:${ip}`, 30, 60 * 1000);

  if (!rateResult.allowed) {
    return NextResponse.json(
      {
        error: 'Too many transaction requests. Please wait a moment.',
        retryAfterMs: rateResult.resetMs,
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

    // Case 1: Client broadcast of pre-signed transaction (e.g. from Trust Wallet)
    if (rawTransaction && typeof rawTransaction === 'string') {
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
    if (!recipientPublicKey || typeof recipientPublicKey !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid recipient public key address.' },
        { status: 400 }
      );
    }

    const numericAmount = Number(amountCook);
    if (isNaN(numericAmount) || numericAmount <= 0) {
      return NextResponse.json(
        { error: 'Amount must be a positive number greater than 0.' },
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
