import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  getCookieConnection,
  calculateFeeSplit,
  PLATFORM_TREASURY_PUBKEY,
  COOKIE_CHAIN_CONFIG,
} from './cookieChain';
import { distributedStore } from '../security/distributedStore';

/**
 * Minimum hot wallet operational reserve retained during routine sweeps (0.05 COOK / 50M lamports)
 */
export const MIN_HOT_WALLET_RESERVE_LAMPORTS = 50_000_000n;
export const STANDARD_TX_FEE_LAMPORTS = 5_000n;

/**
 * Parses raw private key strings from environment variables supporting:
 * 1. Base58 encoded string (standard export from Trust Wallet, Phantom, Solflare)
 * 2. JSON byte array string: "[1, 2, ... 64]"
 * 3. Hex string (64-byte or 32-byte)
 */
export function parsePrivateKey(rawKey: string): Keypair | null {
  if (!rawKey || typeof rawKey !== 'string') return null;
  const trimmed = rawKey.trim();
  if (!trimmed) return null;

  // 1. JSON Array format: [12, 34, ...]
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsed = JSON.parse(trimmed);
      if (Array.isArray(parsed) && (parsed.length === 64 || parsed.length === 32)) {
        const u8 = new Uint8Array(parsed);
        if (parsed.length === 64) {
          return Keypair.fromSecretKey(u8);
        } else {
          return Keypair.fromSeed(u8);
        }
      }
    } catch {
      // Fall through to other formats
    }
  }

  // 2. Base58 format (Trust Wallet standard Solana private key export)
  try {
    const decoded = bs58.decode(trimmed);
    if (decoded.length === 64) {
      return Keypair.fromSecretKey(decoded);
    } else if (decoded.length === 32) {
      return Keypair.fromSeed(decoded);
    }
  } catch {
    // Fall through
  }

  // 3. Hex format
  if (/^[0-9a-fA-F]+$/.test(trimmed)) {
    try {
      const buffer = Buffer.from(trimmed, 'hex');
      if (buffer.length === 64) {
        return Keypair.fromSecretKey(new Uint8Array(buffer));
      } else if (buffer.length === 32) {
        return Keypair.fromSeed(new Uint8Array(buffer));
      }
    } catch {
      // Fall through
    }
  }

  return null;
}

/**
 * Returns the server signer Keypair configured in environment variables.
 */
export function getServerSignerKeypair(): Keypair | null {
  const envKey =
    process.env.PLATFORM_PRIVATE_KEY ||
    process.env.SERVER_SIGNER_PRIVATE_KEY ||
    process.env.COOKIE_CHAIN_PRIVATE_KEY ||
    process.env.TREASURY_PRIVATE_KEY;

  if (!envKey) return null;
  return parsePrivateKey(envKey);
}

/**
 * Checks whether a valid server signer private key is configured in the environment.
 */
export function isServerSignerConfigured(): boolean {
  return getServerSignerKeypair() !== null;
}

/**
 * Returns the public address of the configured server signer, or null if unconfigured.
 */
export function getServerSignerPublicKey(): string | null {
  const kp = getServerSignerKeypair();
  return kp ? kp.publicKey.toBase58() : null;
}

export const ALLOWED_PLATFORM_OPERATIONS = [
  'platform_sweep',
  'system_settlement',
  'treasury_rebalance',
  'emergency_migration',
] as const;

export type AllowedPlatformOperation = (typeof ALLOWED_PLATFORM_OPERATIONS)[number];

export interface IntentRecord {
  intentId: string;
  operation: AllowedPlatformOperation;
  recipientAddress: string;
  amountCook?: number;
  status: 'RESERVED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  signature?: string;
  createdAt: number;
  updatedAt: number;
}

// In-memory fallback intent registry (for isolated test suites)
const localIntents = new Map<string, IntentRecord>();
let localSweepSeq = 1;

/**
 * Derives a deterministic server-side economic intent key.
 * Removes client authority over intent identity.
 */
export async function deriveEconomicIntentKey(params: {
  operation: AllowedPlatformOperation;
  signerAddress: string;
  recipientAddress: string;
}): Promise<string> {
  if (params.operation === 'emergency_migration') {
    const version = (process.env.EMERGENCY_MIGRATION_VERSION || '1').trim();
    return `migration:v${version}:${params.signerAddress}:${params.recipientAddress}`;
  }

  if (params.operation === 'platform_sweep' || params.operation === 'treasury_rebalance') {
    let currentSeq = 1;
    const seqKey = `tx_intent:sweep_seq:${params.signerAddress}`;
    if (distributedStore.isConfigured()) {
      const rawSeq = await distributedStore.get(seqKey);
      if (rawSeq) {
        currentSeq = parseInt(rawSeq, 10) || 1;
      }
    } else {
      currentSeq = localSweepSeq;
    }
    return `${params.operation}:seq_${currentSeq}:${params.signerAddress}:${params.recipientAddress}`;
  }

  return `${params.operation}:${params.signerAddress}:${params.recipientAddress}`;
}

/**
 * Atomically reserves a privileged operation intent to prevent concurrent execution and replay.
 * Enforces production distributed persistence when available.
 */
export async function reservePrivilegedIntent(params: {
  intentId: string;
  operation: AllowedPlatformOperation;
  recipientAddress: string;
  amountCook?: number;
}): Promise<{
  allowed: boolean;
  status?: 'RESERVED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  existingSignature?: string;
  error?: string;
  code?: string;
}> {
  // Production distributed store requirement
  if (!distributedStore.isConfigured() && process.env.NODE_ENV !== 'test') {
    return {
      allowed: false,
      error: 'Distributed persistence store (Upstash/Redis) is required for privileged operations.',
      code: 'PERSISTENCE_NOT_CONFIGURED',
    };
  }

  const key = `tx_intent:${params.intentId}`;
  const record: IntentRecord = {
    intentId: params.intentId,
    operation: params.operation,
    recipientAddress: params.recipientAddress,
    amountCook: params.amountCook,
    status: 'RESERVED',
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };

  if (distributedStore.isConfigured()) {
    // Unconfirmed reservations hold lock for 3600 seconds
    const setOk = await distributedStore.setnx(key, JSON.stringify(record), 3600);
    if (!setOk) {
      const existingRaw = await distributedStore.get(key);
      if (existingRaw) {
        try {
          const existing: IntentRecord = JSON.parse(existingRaw);
          return {
            allowed: false,
            status: existing.status,
            existingSignature: existing.signature,
            error:
              existing.status === 'CONFIRMED'
                ? 'Intent already executed.'
                : 'Intent is already currently in progress or awaiting confirmation.',
          };
        } catch {}
      }
      return { allowed: false, error: 'Intent conflict detected.' };
    }
    return { allowed: true, status: 'RESERVED' };
  }

  // Local test fallback
  const existing = localIntents.get(params.intentId);
  if (existing) {
    return {
      allowed: false,
      status: existing.status,
      existingSignature: existing.signature,
      error:
        existing.status === 'CONFIRMED'
          ? 'Intent already executed.'
          : 'Intent is already currently in progress or awaiting confirmation.',
    };
  }

  localIntents.set(params.intentId, record);
  return { allowed: true, status: 'RESERVED' };
}

/**
 * Updates intent status to SUBMITTED, CONFIRMED (permanent retention, NO TTL), or FAILED.
 * Advances monotonic sweep sequence upon successful confirmation.
 */
export async function updatePrivilegedIntent(
  intentId: string,
  status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED',
  signature?: string,
  signerAddress?: string
): Promise<void> {
  const key = `tx_intent:${intentId}`;
  if (distributedStore.isConfigured()) {
    const raw = await distributedStore.get(key);
    if (raw) {
      try {
        const record: IntentRecord = JSON.parse(raw);
        record.status = status;
        if (signature) record.signature = signature;
        record.updatedAt = Date.now();
        
        if (status === 'CONFIRMED') {
          // Permanent storage: NO TTL on confirmed economic intents
          await distributedStore.set(key, JSON.stringify(record));

          // Increment monotonic sequence for sweeps
          if (signerAddress && (record.operation === 'platform_sweep' || record.operation === 'treasury_rebalance')) {
            const seqKey = `tx_intent:sweep_seq:${signerAddress}`;
            const currentRaw = await distributedStore.get(seqKey);
            const nextSeq = (parseInt(currentRaw || '1', 10) || 1) + 1;
            await distributedStore.set(seqKey, nextSeq.toString());
          }
        } else {
          // Active in-flight submission TTL
          await distributedStore.set(key, JSON.stringify(record), 86400);
        }
      } catch (err) {
        console.error('[serverSigner] Failed to update intent in distributedStore:', err);
        throw err;
      }
    }
    return;
  }

  const record = localIntents.get(intentId);
  if (record) {
    record.status = status;
    if (signature) record.signature = signature;
    record.updatedAt = Date.now();

    if (status === 'CONFIRMED' && (record.operation === 'platform_sweep' || record.operation === 'treasury_rebalance')) {
      localSweepSeq++;
    }
  }
}

export interface DirectPlatformTransferParams {
  recipientPublicKey: PublicKey;
  operation: AllowedPlatformOperation;
  memo?: string;
  intentId?: string;
}

export interface ExecuteTransactionResult {
  success: boolean;
  signature?: string;
  senderAddress?: string;
  recipientAddress?: string;
  amountCook?: number;
  creatorAmount?: number;
  treasuryAmount?: number;
  explorerUrl?: string;
  error?: string;
  code?: string;
  idempotent?: boolean;
}

/**
 * Executes a direct 100% administrative platform transfer (e.g. Treasury Rebalance, Sweep, Migration)
 * without applying a creator commerce 95/5 split.
 * Server derives transfer amount from live on-chain balance.
 */
export async function executeDirectPlatformTransfer(
  params: DirectPlatformTransferParams
): Promise<ExecuteTransactionResult> {
  const signer = getServerSignerKeypair();
  if (!signer) {
    return {
      success: false,
      error: 'No server signer private key configured in environment (PLATFORM_PRIVATE_KEY).',
      code: 'SERVER_KEY_NOT_CONFIGURED',
    };
  }

  const connection = getCookieConnection();

  try {
    // 1. Server-side balance determination
    const currentBalanceLamports = await connection.getBalance(signer.publicKey);
    let transferLamports = 0n;

    if (params.operation === 'emergency_migration') {
      // Migrate 100% of available balance minus standard tx fee
      transferLamports = BigInt(currentBalanceLamports) - STANDARD_TX_FEE_LAMPORTS;
      if (transferLamports <= 0n) {
        return {
          success: false,
          error: 'Hot wallet balance is insufficient for emergency migration.',
          code: 'INSUFFICIENT_BALANCE',
        };
      }
    } else if (params.operation === 'platform_sweep' || params.operation === 'treasury_rebalance') {
      // Sweep excess funds above operational reserve (0.05 COOK) minus tx fee
      transferLamports =
        BigInt(currentBalanceLamports) - MIN_HOT_WALLET_RESERVE_LAMPORTS - STANDARD_TX_FEE_LAMPORTS;
      if (transferLamports <= 0n) {
        return {
          success: false,
          error: `Insufficient hot wallet balance for sweep. Minimum operational reserve of ${Number(MIN_HOT_WALLET_RESERVE_LAMPORTS) / LAMPORTS_PER_SOL} COOK required.`,
          code: 'INSUFFICIENT_SWEEP_BALANCE',
        };
      }
    } else {
      return {
        success: false,
        error: `Unsupported operation ${params.operation}`,
        code: 'UNSUPPORTED_OPERATION',
      };
    }

    const calculatedCookAmount = Number(transferLamports) / LAMPORTS_PER_SOL;

    const tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: params.recipientPublicKey,
        lamports: transferLamports,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = signer.publicKey;

    // Mark intent as SUBMITTED right before network broadcast
    if (params.intentId) {
      await updatePrivilegedIntent(params.intentId, 'SUBMITTED', undefined, signer.publicKey.toBase58());
    }

    const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: 'confirmed',
    });

    // Mark intent as CONFIRMED (permanent retention)
    if (params.intentId) {
      await updatePrivilegedIntent(params.intentId, 'CONFIRMED', signature, signer.publicKey.toBase58());
    }

    return {
      success: true,
      signature,
      senderAddress: signer.publicKey.toBase58(),
      recipientAddress: params.recipientPublicKey.toBase58(),
      amountCook: calculatedCookAmount,
      treasuryAmount: calculatedCookAmount,
      explorerUrl: `${COOKIE_CHAIN_CONFIG.explorerUrl}/tx/${signature}`,
    };
  } catch (err: any) {
    if (params.intentId) {
      if (err.message && err.message.includes('Blockhash not found')) {
        await updatePrivilegedIntent(params.intentId, 'FAILED', undefined, signer.publicKey.toBase58());
      }
    }
    return {
      success: false,
      error: err.message || 'Transaction broadcast failed on Cookie Chain RPC.',
    };
  }
}

/**
 * Legacy Commerce Split Constructor (95% creator / 5% treasury)
 * Kept strictly for commerce and user payment splitting.
 */
export async function executeOnChainSplitTransaction(params: {
  recipientPublicKey: string;
  amountCook: number;
  operation?: AllowedPlatformOperation;
  memo?: string;
  treasuryFeeBps?: number;
}): Promise<ExecuteTransactionResult> {
  const signer = getServerSignerKeypair();
  if (!signer) {
    return {
      success: false,
      error: 'No server signer private key configured in environment (PLATFORM_PRIVATE_KEY).',
    };
  }

  try {
    const connection = getCookieConnection();
    let recipientPubkey: PublicKey;
    try {
      recipientPubkey = new PublicKey(params.recipientPublicKey);
    } catch {
      return { success: false, error: 'Invalid recipient public key address.' };
    }

    const split = calculateFeeSplit(params.amountCook, params.treasuryFeeBps || 500);
    const tx = new Transaction();

    tx.add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: recipientPubkey,
        lamports: split.creatorLamports,
      })
    );

    if (split.treasuryLamports > 0n) {
      tx.add(
        SystemProgram.transfer({
          fromPubkey: signer.publicKey,
          toPubkey: PLATFORM_TREASURY_PUBKEY,
          lamports: split.treasuryLamports,
        })
      );
    }

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = signer.publicKey;

    const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: 'confirmed',
    });

    return {
      success: true,
      signature,
      senderAddress: signer.publicKey.toBase58(),
      recipientAddress: recipientPubkey.toBase58(),
      amountCook: params.amountCook,
      creatorAmount: split.creatorAmount,
      treasuryAmount: split.treasuryAmount,
      explorerUrl: `${COOKIE_CHAIN_CONFIG.explorerUrl}/tx/${signature}`,
    };
  } catch (err: any) {
    return {
      success: false,
      error: err.message || 'Transaction broadcast failed on Cookie Chain RPC.',
    };
  }
}
