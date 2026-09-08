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

export interface FeeSplitResult {
  totalAmount: number;
  creatorAmount: number;
  treasuryAmount: number;
  feePercent: number;
  creatorLamports: bigint;
  treasuryLamports: bigint;
}

/**
 * Calculates 95% creator / 5% platform treasury proceeds without rounding loss
 */
export function calculateFeeSplit(
  totalCook: number,
  feePct: number = COOKIE_CHAIN_CONFIG.protocolFeePercent
): FeeSplitResult {
  const totalLamports = BigInt(Math.round(totalCook * LAMPORTS_PER_SOL));
  const treasuryLamports = (totalLamports * BigInt(feePct)) / BigInt(100);
  const creatorLamports = totalLamports - treasuryLamports;

  return {
    totalAmount: totalCook,
    creatorAmount: Number(creatorLamports) / LAMPORTS_PER_SOL,
    treasuryAmount: Number(treasuryLamports) / LAMPORTS_PER_SOL,
    feePercent: feePct,
    creatorLamports,
    treasuryLamports,
  };
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

  // Instruction 1: 95% to Creator
  tx.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey: creatorPubkey,
      lamports: split.creatorLamports,
    })
  );

  // Instruction 2: 5% automated protocol fee to Social.wtf Treasury
  tx.add(
    SystemProgram.transfer({
      fromPubkey,
      toPubkey: PLATFORM_TREASURY_PUBKEY,
      lamports: split.treasuryLamports,
    })
  );

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
