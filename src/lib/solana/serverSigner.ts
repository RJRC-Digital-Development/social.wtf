import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  Connection,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  getCookieConnection,
  calculateFeeSplit,
  PLATFORM_TREASURY_PUBKEY,
  COOKIE_CHAIN_CONFIG,
} from './cookieChain.ts';
import { distributedStore, DistributedStore } from '../security/distributedStore.ts';

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
      // Fall through
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
  status:
    | 'RESERVED'
    | 'SUBMITTED'
    | 'SUBMISSION_UNKNOWN'
    | 'CONFIRMED'
    | 'FAILED'
    | 'EXPIRED_UNRECONCILED';
  signature?: string;
  recentBlockhash?: string;
  lastValidBlockHeight?: number;
  createdAt: number;
  updatedAt: number;
}

/**
 * Derives a deterministic server-side economic intent key.
 * Removes client authority over intent identity.
 */
export function deriveEconomicIntentKey(params: {
  operation: AllowedPlatformOperation;
  signerAddress: string;
  recipientAddress: string;
}): string {
  if (params.operation === 'emergency_migration') {
    const version = (process.env.EMERGENCY_MIGRATION_VERSION || '1').trim();
    return `migration:v${version}:${params.signerAddress}:${params.recipientAddress}`;
  }

  return `${params.operation}:${params.signerAddress}:${params.recipientAddress}`;
}

/**
 * Atomically reserves a privileged operation intent and performs on-chain reconciliation
 * if an existing in-flight/ambiguous intent is detected.
 */
export async function reservePrivilegedIntent(
  params: {
    intentId: string;
    operation: AllowedPlatformOperation;
    recipientAddress: string;
    amountCook?: number;
  },
  deps?: {
    store?: DistributedStore;
    connection?: Connection;
  }
): Promise<{
  allowed: boolean;
  status?: IntentRecord['status'];
  existingSignature?: string;
  error?: string;
  code?: string;
}> {
  const store = deps?.store || distributedStore;
  const connection = deps?.connection || getCookieConnection();

  // Production distributed store requirement: fail closed if unconfigured
  if (!store.isConfigured()) {
    return {
      allowed: false,
      error: 'Distributed persistence store (Upstash/Redis) is mandatory for privileged money movement.',
      code: 'PRIVILEGED_PERSISTENCE_UNAVAILABLE',
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

  // Initial reservation lock: held for 3600 seconds until signed identity is established
  const setOk = await store.setnx(key, JSON.stringify(record), 3600);
  if (!setOk) {
    const existingRaw = await store.get(key);
    if (existingRaw) {
      try {
        const existing: IntentRecord = JSON.parse(existingRaw);

        // 1. If already confirmed, return idempotently
        if (existing.status === 'CONFIRMED' && existing.signature) {
          return {
            allowed: false,
            status: 'CONFIRMED',
            existingSignature: existing.signature,
            error: 'Intent already executed.',
          };
        }

        // 2. If existing record has a signature and is SUBMITTED or SUBMISSION_UNKNOWN, reconcile on-chain
        if (
          existing.signature &&
          (existing.status === 'SUBMITTED' || existing.status === 'SUBMISSION_UNKNOWN')
        ) {
          try {
            const sigStatus = await connection.getSignatureStatus(existing.signature, {
              searchTransactionHistory: true,
            });

            if (
              sigStatus?.value?.confirmationStatus === 'confirmed' ||
              sigStatus?.value?.confirmationStatus === 'finalized'
            ) {
              // Reconciled as CONFIRMED! Durably write permanent status
              await updatePrivilegedIntent(
                params.intentId,
                { status: 'CONFIRMED', signature: existing.signature },
                deps
              );
              return {
                allowed: false,
                status: 'CONFIRMED',
                existingSignature: existing.signature,
                error: 'Intent already executed.',
              };
            }

            // Check if block height is still within validity window
            const currentHeight = await connection.getBlockHeight('confirmed');
            if (existing.lastValidBlockHeight && currentHeight <= existing.lastValidBlockHeight) {
              return {
                allowed: false,
                status: 'SUBMITTED',
                existingSignature: existing.signature,
                error: 'Transaction is currently pending on-chain confirmation. Re-execution prohibited.',
              };
            } else {
              // Blockhash expired without confirmation. Mark EXPIRED_UNRECONCILED
              await updatePrivilegedIntent(
                params.intentId,
                { status: 'EXPIRED_UNRECONCILED' },
                deps
              );
              return {
                allowed: false,
                status: 'EXPIRED_UNRECONCILED',
                existingSignature: existing.signature,
                error: 'Previous migration transaction expired unconfirmed. Manual/versioned recovery required.',
              };
            }
          } catch {
            return {
              allowed: false,
              status: existing.status,
              existingSignature: existing.signature,
              error: 'Transaction status is ambiguous. Re-execution prohibited.',
            };
          }
        }

        if (existing.status === 'EXPIRED_UNRECONCILED') {
          return {
            allowed: false,
            status: 'EXPIRED_UNRECONCILED',
            existingSignature: existing.signature,
            error: 'Previous migration transaction expired unconfirmed. Manual/versioned recovery required.',
          };
        }

        return {
          allowed: false,
          status: existing.status,
          existingSignature: existing.signature,
          error:
            existing.status === 'SUBMISSION_UNKNOWN'
              ? 'Intent submission status is ambiguous and awaiting on-chain reconciliation. Re-execution is prohibited.'
              : 'Intent is already currently in progress or awaiting confirmation.',
        };
      } catch {}
    }
    return { allowed: false, error: 'Intent conflict detected.' };
  }

  return { allowed: true, status: 'RESERVED' };
}

/**
 * Updates intent record in distributed store.
 * Once a signature or confirmed state exists, the record is stored permanently without TTL.
 * Throws on failure to prevent unverified state drift.
 */
export async function updatePrivilegedIntent(
  intentId: string,
  update: Partial<IntentRecord> & { status: IntentRecord['status'] },
  deps?: {
    store?: DistributedStore;
  }
): Promise<boolean> {
  const store = deps?.store || distributedStore;
  const key = `tx_intent:${intentId}`;

  if (!store.isConfigured()) {
    throw new Error('Distributed store is not configured during privileged intent state transition.');
  }

  const raw = await store.get(key);
  let record: IntentRecord;

  if (raw) {
    record = JSON.parse(raw);
    Object.assign(record, update);
    record.updatedAt = Date.now();
  } else {
    record = {
      intentId,
      operation: update.operation || 'emergency_migration',
      recipientAddress: update.recipientAddress || '',
      ...update,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
  }

  let writeOk = false;
  // Permanent non-expiring retention for any signed, submitted, confirmed, or unreconciled intent
  if (
    record.signature ||
    record.status === 'CONFIRMED' ||
    record.status === 'SUBMITTED' ||
    record.status === 'SUBMISSION_UNKNOWN' ||
    record.status === 'EXPIRED_UNRECONCILED'
  ) {
    writeOk = await store.set(key, JSON.stringify(record));
  } else {
    writeOk = await store.set(key, JSON.stringify(record), 3600);
  }

  if (!writeOk) {
    throw new Error(`Failed to durably write intent status ${update.status} for ${intentId} to distributed store.`);
  }

  return true;
}

export interface DirectPlatformTransferParams {
  recipientPublicKey: PublicKey;
  operation: AllowedPlatformOperation;
  memo?: string;
  intentId: string;
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
 * Executes a direct 100% administrative platform transfer (Emergency Migration).
 * 
 * Strict sequence:
 * 1. Derives amount from live on-chain balance.
 * 2. Constructs transaction and obtains latest blockhash + lastValidBlockHeight.
 * 3. Signs locally and derives signature BEFORE network broadcast.
 * 4. Pre-persists SUBMITTED record with signature and blockheight bounds permanently in distributed KV.
 * 5. Calls sendRawTransaction only after verified persistence.
 * 6. Confirms separately on-chain and updates status to CONFIRMED.
 */
export async function executeDirectPlatformTransfer(
  params: DirectPlatformTransferParams,
  deps?: {
    signer?: Keypair;
    connection?: Connection;
    store?: DistributedStore;
  }
): Promise<ExecuteTransactionResult> {
  const signer = deps?.signer || getServerSignerKeypair();
  if (!signer) {
    return {
      success: false,
      error: 'No server signer private key configured in environment (PLATFORM_PRIVATE_KEY).',
      code: 'SERVER_KEY_NOT_CONFIGURED',
    };
  }

  const connection = deps?.connection || getCookieConnection();

  try {
    // 1. Server-side balance determination
    const currentBalanceLamports = await connection.getBalance(signer.publicKey);

    if (params.operation !== 'emergency_migration') {
      return {
        success: false,
        error: `Operation ${params.operation} is disabled.`,
        code: 'PRIVILEGED_OPERATION_DISABLED',
      };
    }

    // Migrate 100% of available balance minus standard tx fee
    const transferLamports = BigInt(currentBalanceLamports) - STANDARD_TX_FEE_LAMPORTS;
    if (transferLamports <= 0n) {
      return {
        success: false,
        error: 'Hot wallet balance is insufficient for emergency migration.',
        code: 'INSUFFICIENT_BALANCE',
      };
    }

    const calculatedCookAmount = Number(transferLamports) / LAMPORTS_PER_SOL;

    // 2. Build Transaction
    const tx = new Transaction();
    tx.add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: params.recipientPublicKey,
        lamports: transferLamports,
      })
    );

    const { blockhash, lastValidBlockHeight } = await connection.getLatestBlockhash('confirmed');
    tx.recentBlockhash = blockhash;
    tx.lastValidBlockHeight = lastValidBlockHeight;
    tx.feePayer = signer.publicKey;

    // 3. Local signing & signature derivation BEFORE network broadcast
    tx.sign(signer);
    const rawSig = tx.signature || (tx.signatures && tx.signatures[0] && tx.signatures[0].signature);
    if (!rawSig) {
      return {
        success: false,
        error: 'Failed to locally sign transaction.',
        code: 'SIGNING_FAILED',
      };
    }
    const signature = bs58.encode(rawSig);

    // 4. Mandatory Pre-Broadcast Persistence:
    // Persist SUBMITTED status with signature, blockhash, lastValidBlockHeight, and amountCook BEFORE broadcast!
    try {
      await updatePrivilegedIntent(
        params.intentId,
        {
          status: 'SUBMITTED',
          signature,
          recentBlockhash: blockhash,
          lastValidBlockHeight,
          amountCook: calculatedCookAmount,
          recipientAddress: params.recipientPublicKey.toBase58(),
          operation: 'emergency_migration',
        },
        deps
      );
    } catch (persistErr: any) {
      return {
        success: false,
        error: `Pre-broadcast intent persistence failed: ${persistErr.message}. Transaction was NOT broadcast.`,
        code: 'PRE_BROADCAST_PERSISTENCE_FAILED',
      };
    }

    // 5. Broadcast raw serialized transaction
    try {
      await connection.sendRawTransaction(tx.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    } catch (broadcastErr: any) {
      // Any broadcast exception (including RPC timeouts, network drops, or RPC-side blockhash errors)
      // must NOT assume the transaction did not reach validators. The signed transaction identity was already
      // persisted, so we classify as SUBMISSION_UNKNOWN to preserve signature and block bounds for mandatory reconciliation.
      await updatePrivilegedIntent(
        params.intentId,
        {
          status: 'SUBMISSION_UNKNOWN',
          signature,
          recentBlockhash: blockhash,
          lastValidBlockHeight,
        },
        deps
      );
      return {
        success: false,
        error: broadcastErr.message || 'Transaction broadcast was ambiguous. Signature preserved for reconciliation.',
        code: 'TRANSACTION_BROADCAST_AMBIGUOUS',
        signature,
      };
    }

    // 6. Confirm transaction separately using stored signature and blockhash bounds
    try {
      const confirmRes = await connection.confirmTransaction(
        {
          signature,
          blockhash,
          lastValidBlockHeight,
        },
        'confirmed'
      );

      if (confirmRes.value && confirmRes.value.err) {
        await updatePrivilegedIntent(params.intentId, { status: 'FAILED' }, deps);
        return {
          success: false,
          error: `Transaction confirmed with error: ${JSON.stringify(confirmRes.value.err)}`,
          code: 'TRANSACTION_ONCHAIN_ERROR',
          signature,
        };
      }
    } catch (confirmErr: any) {
      // Confirmation timed out or network blip; signature was already submitted. Mark SUBMISSION_UNKNOWN
      await updatePrivilegedIntent(params.intentId, { status: 'SUBMISSION_UNKNOWN' }, deps);
      return {
        success: false,
        error: 'Transaction broadcast was submitted but confirmation timed out. Signature preserved for reconciliation.',
        code: 'CONFIRMATION_TIMEOUT',
        signature,
      };
    }

    // 7. Mark intent as CONFIRMED (permanent retention without TTL)
    await updatePrivilegedIntent(
      params.intentId,
      {
        status: 'CONFIRMED',
        signature,
      },
      deps
    );

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
    return {
      success: false,
      error: err.message || 'Transaction execution failed.',
      code: err.code || 'EXECUTION_FAILED',
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

    tx.sign(signer);
    const signature = await connection.sendRawTransaction(tx.serialize(), {
      skipPreflight: false,
      preflightCommitment: 'confirmed',
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
