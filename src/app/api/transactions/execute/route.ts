import { NextResponse } from 'next/server';
import { PublicKey } from '@solana/web3.js';
import {
  isServerSignerConfigured,
  getServerSignerPublicKey,
  executeDirectPlatformTransfer,
  reservePrivilegedIntent,
  deriveEconomicIntentKey,
} from '@/lib/solana/serverSigner';
import {
  getCookieConnection,
  COOKIE_CHAIN_CONFIG,
  PLATFORM_TREASURY_PUBKEY,
} from '@/lib/solana/cookieChain';
import { distributedStore } from '@/lib/security/distributedStore';
import { rateLimiter } from '@/lib/security/rateLimiter';
import { sanitizeString } from '@/lib/security/sanitize';
import { validateRequestSessionAsync } from '@/lib/security/session';
import { getClientIp } from '@/lib/security/ipHelper';

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
      action = 'emergency_migration',
      memo = '',
      intentId,
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

    // 1. Explicit Fail-Closed Disable for Unsafe Operations without Authoritative Ledger State
    if (
      action === 'platform_sweep' ||
      action === 'treasury_rebalance' ||
      action === 'system_settlement'
    ) {
      return NextResponse.json(
        {
          error: `Privileged operation '${action}' is disabled: authoritative server-side financial intent and amount ledger state is not implemented.`,
          code: 'PRIVILEGED_OPERATION_DISABLED',
        },
        { status: 501 }
      );
    }

    // 2. Strict Operation Allowlist
    if (action !== 'emergency_migration') {
      return NextResponse.json(
        {
          error: `Unsupported or disallowed platform operation '${action}'.`,
          code: 'INVALID_OPERATION',
        },
        { status: 400 }
      );
    }

    // 3. Reject Client Authority Over Privileged Destination
    if (recipientPublicKey !== undefined && recipientPublicKey !== null && recipientPublicKey !== '') {
      return NextResponse.json(
        {
          error: `Client-specified 'recipientPublicKey' is prohibited for operation '${action}'. Destination is strictly server-derived.`,
          code: 'RECIPIENT_OVERRIDE_PROHIBITED',
        },
        { status: 400 }
      );
    }

    // 4. Reject Client Authority Over Privileged Amount
    if (amountCook !== undefined && amountCook !== null && amountCook !== '') {
      return NextResponse.json(
        {
          error: 'Client-specified amount is prohibited for emergency migration. Amount is strictly server-derived from hot wallet on-chain balance.',
          code: 'AMOUNT_OVERRIDE_PROHIBITED',
        },
        { status: 400 }
      );
    }

    // 5. Reject Client Authority Over Intent Identifier
    if (intentId !== undefined && intentId !== null && intentId !== '') {
      return NextResponse.json(
        {
          error: 'Client-specified intentId is prohibited. Financial intent identity is strictly derived by the server.',
          code: 'CLIENT_INTENT_PROHIBITED',
        },
        { status: 400 }
      );
    }

    // 6. Validate Server-Configured Migration Destination
    const migrationTarget = process.env.EMERGENCY_MIGRATION_PUBKEY?.trim();
    if (!migrationTarget) {
      return NextResponse.json(
        {
          error: 'Emergency migration is disabled: EMERGENCY_MIGRATION_PUBKEY is not configured in server environment.',
          code: 'MIGRATION_DESTINATION_NOT_CONFIGURED',
        },
        { status: 503 }
      );
    }

    let serverDerivedDestination: PublicKey;
    try {
      serverDerivedDestination = new PublicKey(migrationTarget);
    } catch {
      return NextResponse.json(
        {
          error: 'Emergency migration failed: configured EMERGENCY_MIGRATION_PUBKEY is not a valid SVM public key.',
          code: 'INVALID_MIGRATION_DESTINATION_CONFIG',
        },
        { status: 503 }
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

    // 7. Mandatory Production Distributed Persistence Requirement
    if (!distributedStore.isConfigured()) {
      return NextResponse.json(
        {
          error: 'Distributed persistence store (Upstash/Redis) is mandatory for privileged money movement.',
          code: 'PRIVILEGED_PERSISTENCE_UNAVAILABLE',
        },
        { status: 503 }
      );
    }

    const signerPublicKey = getServerSignerPublicKey()!;

    // 8. Derive Deterministic Server-Side Economic Intent Identity
    const economicIntentKey = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signerPublicKey,
      recipientAddress: serverDerivedDestination.toBase58(),
    });

    // 9. Per-wallet Admin Execution Rate Limiting
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

    // 10. Atomic Intent Reservation with Durable Persistence
    const intentReservation = await reservePrivilegedIntent({
      intentId: economicIntentKey,
      operation: 'emergency_migration',
      recipientAddress: serverDerivedDestination.toBase58(),
    });

    if (!intentReservation.allowed) {
      if (intentReservation.status === 'CONFIRMED' && intentReservation.existingSignature) {
        return NextResponse.json({
          success: true,
          idempotent: true,
          method: 'server_signer',
          action: 'emergency_migration',
          intentId: economicIntentKey,
          signature: intentReservation.existingSignature,
          explorerUrl: `${COOKIE_CHAIN_CONFIG.explorerUrl}/tx/${intentReservation.existingSignature}`,
        });
      }

      return NextResponse.json(
        {
          error: intentReservation.error || 'Operation intent conflict or duplicate submission.',
          code: 'INTENT_CONFLICT',
        },
        { status: 409 }
      );
    }

    // 11. Execute Direct Platform Transfer with Server Balance Derivation
    const execResult = await executeDirectPlatformTransfer({
      recipientPublicKey: serverDerivedDestination,
      operation: 'emergency_migration',
      memo: sanitizeString(memo, 120),
      intentId: economicIntentKey,
    });

    if (!execResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: execResult.error,
          code: execResult.code,
        },
        { status: execResult.code === 'INSUFFICIENT_BALANCE' ? 400 : 500 }
      );
    }

    return NextResponse.json({
      method: 'server_signer',
      action: 'emergency_migration',
      intentId: economicIntentKey,
      ...execResult,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || 'Internal server error while executing transaction.' },
      { status: 500 }
    );
  }
}
