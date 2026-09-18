import {
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
  sendAndConfirmTransaction,
} from '@solana/web3.js';
import bs58 from 'bs58';
import {
  getCookieConnection,
  calculateFeeSplit,
  PLATFORM_TREASURY_PUBKEY,
  COOKIE_CHAIN_CONFIG,
} from './cookieChain';

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
 * Checks PLATFORM_PRIVATE_KEY, SERVER_SIGNER_PRIVATE_KEY, COOKIE_CHAIN_PRIVATE_KEY, and TREASURY_PRIVATE_KEY.
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

export interface ExecuteTransactionParams {
  recipientPublicKey: string;
  amountCook: number;
  memo?: string;
  treasuryFeeBps?: number;
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
}

/**
 * Executes and signs an atomic split transaction directly on Cookie Chain using the server signer.
 */
export async function executeOnChainSplitTransaction(
  params: ExecuteTransactionParams
): Promise<ExecuteTransactionResult> {
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
      return {
        success: false,
        error: 'Invalid recipient public key address.',
      };
    }

    const split = calculateFeeSplit(params.amountCook, params.treasuryFeeBps || 500);
    const tx = new Transaction();

    // 1. Creator proceeds
    tx.add(
      SystemProgram.transfer({
        fromPubkey: signer.publicKey,
        toPubkey: recipientPubkey,
        lamports: split.creatorLamports,
      })
    );

    // 2. Protocol treasury fee
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

    // Sign and broadcast to Cookie Chain
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
    console.error('Error broadcasting on-chain transaction:', err);
    return {
      success: false,
      error: err.message || 'Transaction broadcast failed on Cookie Chain RPC.',
    };
  }
}
