import {
  Connection,
  PublicKey,
  Transaction,
  SystemProgram,
  LAMPORTS_PER_SOL,
} from '@solana/web3.js';

// Official Cookie Chain Network Parameters
export const COOKIE_CHAIN_CONFIG = {
  chainId: 'cookie-mainnet',
  chainName: 'Cookie Chain',
  rpcUrl: 'https://rpc.cookiescan.io',
  wssUrl: 'https://wss.cookiescan.io',
  genesisHash: '9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2',
  explorerUrl: 'https://cookiescan.io',
  nativeCurrency: {
    name: 'COOK',
    symbol: 'COOK',
    decimals: 9,
  },
  // Social.wtf Dedicated Protocol Treasury Wallet on Cookie Chain
  treasuryPublicKey: 'CookTreasury11111111111111111111111111111111',
  protocolFeePercent: 5, // 5% automated protocol fee
};

// Fallback valid Base58 public key for Cookie Chain Treasury
export const PLATFORM_TREASURY_PUBKEY = new PublicKey(
  'CookTreasury11111111111111111111111111111111'
);

// Fallback demo creator pubkey
export const DEMO_CREATOR_PUBKEY = new PublicKey(
  'CookCr8tor1111111111111111111111111111111111'
);

let globalConnection: Connection | null = null;

export function getCookieConnection(): Connection {
  if (!globalConnection) {
    globalConnection = new Connection(COOKIE_CHAIN_CONFIG.rpcUrl, {
      commitment: 'confirmed',
      wsEndpoint: COOKIE_CHAIN_CONFIG.wssUrl,
    });
  }
  return globalConnection;
}

export const SOCIAL_PROGRAM_ID = new PublicKey(
  '9iapGcxDbDtZ2bWtwM2kLYNW67XH2qzPxLxXfSUbQQZq'
);

export const BPS_DENOMINATOR = 10_000n;
export const MAX_FEE_BPS = 2_500n; // 25.00% max

export interface FeeSplitResult {
  totalAmount: number;
  creatorAmount: number;
  treasuryAmount: number;
  feeBps: number;
  totalLamports: bigint;
  creatorLamports: bigint;
  treasuryLamports: bigint;
}

/**
 * Calculates creator proceeds and platform treasury cut with deterministic integer precision.
 * Enforces the critical invariant: creatorLamports + treasuryLamports === totalLamports.
 */
export function calculateFeeSplit(
  totalCook: number,
  feeBpsNum: number = 500 // Default 500 BPS (5.00%)
): FeeSplitResult {
  if (totalCook <= 0) {
    throw new Error('Transaction amount must be strictly greater than 0');
  }

  const feeBps = BigInt(Math.max(0, Math.min(Number(MAX_FEE_BPS), feeBpsNum)));
  const totalLamports = BigInt(Math.round(totalCook * LAMPORTS_PER_SOL));

  if (totalLamports <= 0n) {
    throw new Error('Transaction amount rounds to 0 lamports');
  }

  // Checked integer division for fee: amount * fee_bps / 10,000
  const treasuryLamports = (totalLamports * feeBps) / BPS_DENOMINATOR;
  const creatorLamports = totalLamports - treasuryLamports;

  // Enforce critical invariant
  if (creatorLamports + treasuryLamports !== totalLamports) {
    throw new Error(
      `Fee invariant violated: creator (${creatorLamports}) + treasury (${treasuryLamports}) != total (${totalLamports})`
    );
  }

  return {
    totalAmount: totalCook,
    creatorAmount: Number(creatorLamports) / LAMPORTS_PER_SOL,
    treasuryAmount: Number(treasuryLamports) / LAMPORTS_PER_SOL,
    feeBps: Number(feeBps),
    totalLamports,
    creatorLamports,
    treasuryLamports,
  };
}

/**
 * Deterministically derives the global PlatformState PDA
 */
export function getPlatformStatePda(
  programId: PublicKey = SOCIAL_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync([Buffer.from('platform')], programId);
}

/**
 * Deterministically derives the Product PDA owned by creator
 */
export function getProductPda(
  creator: PublicKey,
  productId: string,
  programId: PublicKey = SOCIAL_PROGRAM_ID
): [PublicKey, number] {
  return PublicKey.findProgramAddressSync(
    [Buffer.from('product'), creator.toBuffer(), Buffer.from(productId)],
    programId
  );
}

/**
 * Deterministically derives a unique Purchase Receipt PDA using nonce
 */
export function getPurchaseReceiptPda(
  buyer: PublicKey,
  product: PublicKey,
  nonce: bigint,
  programId: PublicKey = SOCIAL_PROGRAM_ID
): [PublicKey, number] {
  const nonceBuffer = Buffer.alloc(8);
  nonceBuffer.writeBigUInt64LE(nonce);
  return PublicKey.findProgramAddressSync(
    [Buffer.from('receipt'), buyer.toBuffer(), product.toBuffer(), nonceBuffer],
    programId
  );
}

/**
 * Construct an atomic dual-transfer SVM transaction splitting funds directly on Cookie Chain
 */
export async function buildSplitTransaction({
  fromPubkey,
  creatorPubkey,
  amountCook,
  memoText,
}: {
  fromPubkey: PublicKey;
  creatorPubkey: PublicKey;
  amountCook: number;
  memoText: string;
}): Promise<Transaction> {
  const connection = getCookieConnection();
  const split = calculateFeeSplit(amountCook);

  const tx = new Transaction();

  // Instruction 1: Creator proceeds
  tx.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey: creatorPubkey,
      lamports: split.creatorLamports,
    })
  );

  // Instruction 2: Automated protocol fee to Social.wtf Treasury (if > 0)
  if (split.treasuryLamports > 0n) {
    tx.add(
      SystemProgram.transfer({
        fromPubkey,
        toPubkey: PLATFORM_TREASURY_PUBKEY,
        lamports: split.treasuryLamports,
      })
    );
  }

  // Get recent blockhash from Cookie Chain
  const { blockhash } = await connection.getLatestBlockhash('confirmed');
  tx.recentBlockhash = blockhash;
  tx.feePayer = fromPubkey;

  return tx;
}

export function formatAddress(address: string, chars = 4): string {
  if (!address) return '';
  if (address.length <= chars * 2 + 2) return address;
  return `${address.slice(0, chars + 2)}...${address.slice(-chars)}`;
}

export function getExplorerTxUrl(signature: string): string {
  return `${COOKIE_CHAIN_CONFIG.explorerUrl}/tx/${signature}`;
}

export function getExplorerAccountUrl(address: string): string {
  return `${COOKIE_CHAIN_CONFIG.explorerUrl}/address/${address}`;
}
