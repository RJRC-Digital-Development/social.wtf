/**
 * Cookie Chain Digital Asset Standard (DAS) API Client
 * Connects to https://api.cookiescan.io for querying on-chain assets, SPL tokens, and NFTs.
 */

export const COOKIE_DAS_ENDPOINT = 'https://api.cookiescan.io';

export interface DASAsset {
  id: string;
  interface: string;
  content: {
    metadata?: {
      name?: string;
      symbol?: string;
      description?: string;
    };
    files?: Array<{ uri: string; mime: string }>;
    links?: Record<string, string>;
  };
  token_info?: {
    symbol?: string;
    balance?: number;
    decimals?: number;
    price_info?: {
      price_per_token?: number;
    };
  };
}

/**
 * Fetch digital assets owned by a wallet address via Cookie DAS JSON-RPC
 */
export async function getAssetsByOwner(ownerAddress: string): Promise<DASAsset[]> {
  try {
    const response = await fetch(COOKIE_DAS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'social-wtf-das',
        method: 'getAssetsByOwner',
        params: {
          ownerAddress,
          page: 1,
          limit: 20,
        },
      }),
    });

    const data = await response.json();
    if (data.result?.items) {
      return data.result.items;
    }
  } catch (err) {
    console.warn('Cookie DAS API query fallback:', err);
  }
  return [];
}

/**
 * Query a specific asset or token metadata by asset ID
 */
export async function getAssetById(assetId: string): Promise<DASAsset | null> {
  try {
    const response = await fetch(COOKIE_DAS_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 'social-wtf-asset',
        method: 'getAsset',
        params: { id: assetId },
      }),
    });

    const data = await response.json();
    return data.result || null;
  } catch (err) {
    console.warn('Cookie DAS getAsset error:', err);
    return null;
  }
}
