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
  amountCook: number;
  status: 'RESERVED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  signature?: string;
  createdAt: number;
  updatedAt: number;
}

// In-memory fallback intent registry
const localIntents = new Map<string, IntentRecord>();

/**
 * Atomically reserves a privileged operation intent to prevent concurrent execution and replay.
 */
export async function reservePrivilegedIntent(params: {
  intentId: string;
  operation: AllowedPlatformOperation;
  recipientAddress: string;
  amountCook: number;
}): Promise<{
  allowed: boolean;
  status?: 'RESERVED' | 'SUBMITTED' | 'CONFIRMED' | 'FAILED';
  existingSignature?: string;
  error?: string;
}> {
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

  // Local fallback
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
 * Updates intent status to SUBMITTED or CONFIRMED
 */
export async function updatePrivilegedIntent(
  intentId: string,
  status: 'SUBMITTED' | 'CONFIRMED' | 'FAILED',
  signature?: string
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
        await distributedStore.set(key, JSON.stringify(record), 86400);
      } catch {}
    }
    return;
  }

  const record = localIntents.get(intentId);
  if (record) {
    record.status = status;
    if (signature) record.signature = signature;
    record.updatedAt = Date.now();
  }
}

export interface DirectPlatformTransferParams {
  recipientPublicKey: PublicKey;
  amountCook: number;
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
    const lamports = BigInt(Math.floor(params.amountCook * LAMPORTS_PER_SOL));
    if (lamports <= 0n) {
      return { success: false, error: 'Transfer amount in lamports must be greater than zero.' };
    }

    const tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: params.recipientPublicKey,
        lamports,
      })
    );

    const { blockhash } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.feePayer = signer.publicKey;

    // Mark intent as SUBMITTED right before network broadcast
    if (params.intentId) {
      await updatePrivilegedIntent(params.intentId, 'SUBMITTED');
    }

    const signature = await sendAndConfirmTransaction(connection, tx, [signer], {
      commitment: 'confirmed',
    });

    // Mark intent as CONFIRMED
    if (params.intentId) {
      await updatePrivilegedIntent(params.intentId, 'CONFIRMED', signature);
    }

    return {
      success: true,
      signature,
      senderAddress: signer.publicKey.toBase58(),
      recipientAddress: params.recipientPublicKey.toBase58(),
      amountCook: params.amountCook,
      treasuryAmount: params.amountCook,
      explorerUrl: `${COOKIE_CHAIN_CONFIG.explorerUrl}/tx/${signature}`,
    };
  } catch (err: any) {
    if (params.intentId) {
      // If error occurred before broadcast, release intent; if timeout, keep SUBMITTED
      if (err.message && err.message.includes('Blockhash not found')) {
        await updatePrivilegedIntent(params.intentId, 'FAILED');
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
