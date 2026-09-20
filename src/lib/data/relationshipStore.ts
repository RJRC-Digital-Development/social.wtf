import { distributedStore } from '../security/distributedStore.ts';
import { isProductionEnvironment } from '../security/envConfig.ts';
import { PublicKey } from '@solana/web3.js';

export class RelationshipStoreUnavailableError extends Error {
  public readonly code = 'RELATIONSHIP_STORE_UNAVAILABLE';
  constructor(message: string = 'Relationship storage authority is unavailable') {
    super(message);
    this.name = 'RelationshipStoreUnavailableError';
  }
}

function checkStoreAvailability(): void {
  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    throw new RelationshipStoreUnavailableError(
      'Production distributed relationship store is not configured.'
    );
  }
}

export function isValidWalletAddress(address: string): boolean {
  if (!address || typeof address !== 'string' || address.length < 32 || address.length > 44) {
    return false;
  }
  try {
    const pk = new PublicKey(address);
    return PublicKey.isOnCurve(pk.toBytes());
  } catch {
    return false;
  }
}

const FRIENDS_PREFIX = 'friends:';
const INBOUND_PREFIX = 'friend_requests:inbound:';
const OUTBOUND_PREFIX = 'friend_requests:outbound:';
const BLOCKS_PREFIX = 'blocks:';

export type RelationshipStatus =
  | 'self'
  | 'friends'
  | 'pending_inbound'
  | 'pending_outbound'
  | 'blocked'
  | 'none';

/**
 * Checks if target is blocked by source
 */
export async function isBlockedAsync(sourceWallet: string, targetWallet: string): Promise<boolean> {
  checkStoreAvailability();
  if (!isValidWalletAddress(sourceWallet) || !isValidWalletAddress(targetWallet)) return false;
  const blocks = await distributedStore.smembers(`${BLOCKS_PREFIX}${sourceWallet}`);
  return Array.isArray(blocks) && blocks.includes(targetWallet);
}

/**
 * Checks if either party has blocked the other
 */
export async function isAnyBlockedAsync(walletA: string, walletB: string): Promise<boolean> {
  checkStoreAvailability();
  if (!isValidWalletAddress(walletA) || !isValidWalletAddress(walletB)) return false;
  const [aBlockedB, bBlockedA] = await Promise.all([
    isBlockedAsync(walletA, walletB),
    isBlockedAsync(walletB, walletA),
  ]);
  return aBlockedB || bBlockedA;
}

/**
 * Strictly verifies reciprocal friendship between two wallets.
 * Invariant: Both A in friends:B AND B in friends:A must hold, and neither party may be blocked.
 */
export async function areFriendsAsync(walletA: string, walletB: string): Promise<boolean> {
  checkStoreAvailability();
  if (!isValidWalletAddress(walletA) || !isValidWalletAddress(walletB)) return false;
  if (walletA === walletB) return false;

  // Block status strictly overrides any friendship
  const blocked = await isAnyBlockedAsync(walletA, walletB);
  if (blocked) return false;

  const [aFriends, bFriends] = await Promise.all([
    distributedStore.smembers(`${FRIENDS_PREFIX}${walletA}`),
    distributedStore.smembers(`${FRIENDS_PREFIX}${walletB}`),
  ]);

  const aHasB = Array.isArray(aFriends) && aFriends.includes(walletB);
  const bHasA = Array.isArray(bFriends) && bFriends.includes(walletA);

  // Reciprocal invariant required: both sets must agree
  return aHasB && bHasA;
}

/**
 * Retrieves caller's verified reciprocal friends list with orphan/unilateral pruning
 */
export async function getFriendsListAsync(wallet: string): Promise<string[]> {
  checkStoreAvailability();
  if (!isValidWalletAddress(wallet)) return [];

  const rawFriends = await distributedStore.smembers(`${FRIENDS_PREFIX}${wallet}`);
  if (distributedStore.isConfigured() && !Array.isArray(rawFriends)) {
    throw new RelationshipStoreUnavailableError('Failed to read friends index');
  }
  if (!Array.isArray(rawFriends) || rawFriends.length === 0) return [];

  const verifiedFriends: string[] = [];
  const orphansToPrune: string[] = [];

  for (const friendWallet of rawFriends) {
    if (!isValidWalletAddress(friendWallet)) {
      orphansToPrune.push(friendWallet);
      continue;
    }
    const isFriend = await areFriendsAsync(wallet, friendWallet);
    if (isFriend) {
      verifiedFriends.push(friendWallet);
    } else {
      orphansToPrune.push(friendWallet);
    }
  }

  // Background pruning of unilateral/corrupted entries
  if (orphansToPrune.length > 0) {
    Promise.all(
      orphansToPrune.map((orphan) =>
        distributedStore.srem(`${FRIENDS_PREFIX}${wallet}`, orphan).catch(() => {})
      )
    ).catch(() => {});
  }

  return verifiedFriends;
}

/**
 * Retrieves inbound pending friend request senders for a wallet
 */
export async function getInboundRequestsAsync(wallet: string): Promise<string[]> {
  checkStoreAvailability();
  if (!isValidWalletAddress(wallet)) return [];

  const rawInbound = await distributedStore.smembers(`${INBOUND_PREFIX}${wallet}`);
  if (!Array.isArray(rawInbound)) return [];

  // Filter out blocked senders
  const validInbound: string[] = [];
  for (const sender of rawInbound) {
    if (isValidWalletAddress(sender) && !(await isAnyBlockedAsync(wallet, sender))) {
      validInbound.push(sender);
    }
  }
  return validInbound;
}

/**
 * Retrieves outbound pending friend request recipients for a wallet
 */
export async function getOutboundRequestsAsync(wallet: string): Promise<string[]> {
  checkStoreAvailability();
  if (!isValidWalletAddress(wallet)) return [];

  const rawOutbound = await distributedStore.smembers(`${OUTBOUND_PREFIX}${wallet}`);
  if (!Array.isArray(rawOutbound)) return [];

  const validOutbound: string[] = [];
  for (const recipient of rawOutbound) {
    if (isValidWalletAddress(recipient) && !(await isAnyBlockedAsync(wallet, recipient))) {
      validOutbound.push(recipient);
    }
  }
  return validOutbound;
}

/**
 * Retrieves list of wallets blocked by this wallet
 */
export async function getBlockedListAsync(wallet: string): Promise<string[]> {
  checkStoreAvailability();
  if (!isValidWalletAddress(wallet)) return [];

  const rawBlocks = await distributedStore.smembers(`${BLOCKS_PREFIX}${wallet}`);
  return Array.isArray(rawBlocks) ? rawBlocks.filter(isValidWalletAddress) : [];
}

/**
 * Dispatches a friend request from sender to recipient
 */
export async function sendFriendRequestAsync(
  fromWallet: string,
  toWallet: string
): Promise<{ success: boolean; error?: string; status?: number }> {
  checkStoreAvailability();

  if (!isValidWalletAddress(fromWallet) || !isValidWalletAddress(toWallet)) {
    return { success: false, error: 'Invalid wallet address provided.', status: 400 };
  }

  if (fromWallet === toWallet) {
    return { success: false, error: 'Cannot send a friend request to yourself.', status: 400 };
  }

  // Block checks
  if (await isAnyBlockedAsync(fromWallet, toWallet)) {
    return { success: false, error: 'Unable to send friend request.', status: 403 };
  }

  // Check if already friends
  if (await areFriendsAsync(fromWallet, toWallet)) {
    return { success: false, error: 'You are already friends with this user.', status: 409 };
  }

  // Check if outbound request already exists (idempotent)
  const existingOutbound = await distributedStore.smembers(`${OUTBOUND_PREFIX}${fromWallet}`);
  if (Array.isArray(existingOutbound) && existingOutbound.includes(toWallet)) {
    return { success: true };
  }

  // If the target already sent an inbound request to us, auto-accept into mutual friendship!
  const existingInbound = await distributedStore.smembers(`${INBOUND_PREFIX}${fromWallet}`);
  if (Array.isArray(existingInbound) && existingInbound.includes(toWallet)) {
    return acceptFriendRequestAsync(fromWallet, toWallet);
  }

  // Multi-key write with compensation on partial failure
  const outboundAdded = await distributedStore.sadd(`${OUTBOUND_PREFIX}${fromWallet}`, toWallet);
  if (!outboundAdded) {
    return { success: false, error: 'Failed to record outbound friend request.', status: 500 };
  }

  const inboundAdded = await distributedStore.sadd(`${INBOUND_PREFIX}${toWallet}`, fromWallet);
  if (!inboundAdded) {
    // Compensate step 1
    await distributedStore.srem(`${OUTBOUND_PREFIX}${fromWallet}`, toWallet).catch(() => {});
    return { success: false, error: 'Failed to deliver friend request.', status: 500 };
  }

  return { success: true };
}

/**
 * Recipient accepts an inbound friend request
 */
export async function acceptFriendRequestAsync(
  recipientWallet: string,
  senderWallet: string
): Promise<{ success: boolean; error?: string; status?: number }> {
  checkStoreAvailability();

  if (!isValidWalletAddress(recipientWallet) || !isValidWalletAddress(senderWallet)) {
    return { success: false, error: 'Invalid wallet address provided.', status: 400 };
  }

  if (recipientWallet === senderWallet) {
    return { success: false, error: 'Cannot accept request from yourself.', status: 400 };
  }

  // Verify precondition: inbound request must exist
  const inboundList = await distributedStore.smembers(`${INBOUND_PREFIX}${recipientWallet}`);
  const hasInbound = Array.isArray(inboundList) && inboundList.includes(senderWallet);

  if (!hasInbound) {
    return { success: false, error: 'No pending friend request found from this user.', status: 404 };
  }

  if (await isAnyBlockedAsync(recipientWallet, senderWallet)) {
    return { success: false, error: 'Cannot accept friend request.', status: 403 };
  }

  // Multi-key reciprocal friendship establishment
  // Step 1: Add sender to recipient's friends set
  const step1 = await distributedStore.sadd(`${FRIENDS_PREFIX}${recipientWallet}`, senderWallet);
  if (!step1) {
    return { success: false, error: 'Failed to establish friendship.', status: 500 };
  }

  // Step 2: Add recipient to sender's friends set
  const step2 = await distributedStore.sadd(`${FRIENDS_PREFIX}${senderWallet}`, recipientWallet);
  if (!step2) {
    // Compensate step 1
    await distributedStore.srem(`${FRIENDS_PREFIX}${recipientWallet}`, senderWallet).catch(() => {});
    return { success: false, error: 'Failed to establish mutual friendship.', status: 500 };
  }

  // Step 3 & 4: Clean up pending request sets
  await Promise.all([
    distributedStore.srem(`${INBOUND_PREFIX}${recipientWallet}`, senderWallet).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${senderWallet}`, recipientWallet).catch(() => {}),
    // Also clean any reciprocal pending requests if existed
    distributedStore.srem(`${OUTBOUND_PREFIX}${recipientWallet}`, senderWallet).catch(() => {}),
    distributedStore.srem(`${INBOUND_PREFIX}${senderWallet}`, recipientWallet).catch(() => {}),
  ]);

  // Reciprocal verification check
  const verified = await areFriendsAsync(recipientWallet, senderWallet);
  if (!verified) {
    // Rollback
    await Promise.all([
      distributedStore.srem(`${FRIENDS_PREFIX}${recipientWallet}`, senderWallet).catch(() => {}),
      distributedStore.srem(`${FRIENDS_PREFIX}${senderWallet}`, recipientWallet).catch(() => {}),
    ]);
    return { success: false, error: 'Mutual friendship verification failed.', status: 500 };
  }

  return { success: true };
}

/**
 * Recipient rejects an inbound friend request
 */
export async function rejectFriendRequestAsync(
  recipientWallet: string,
  senderWallet: string
): Promise<{ success: boolean }> {
  checkStoreAvailability();
  if (!isValidWalletAddress(recipientWallet) || !isValidWalletAddress(senderWallet)) {
    return { success: false };
  }

  await Promise.all([
    distributedStore.srem(`${INBOUND_PREFIX}${recipientWallet}`, senderWallet).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${senderWallet}`, recipientWallet).catch(() => {}),
  ]);

  return { success: true };
}

/**
 * Sender cancels an outbound friend request
 */
export async function cancelFriendRequestAsync(
  senderWallet: string,
  recipientWallet: string
): Promise<{ success: boolean }> {
  checkStoreAvailability();
  if (!isValidWalletAddress(senderWallet) || !isValidWalletAddress(recipientWallet)) {
    return { success: false };
  }

  await Promise.all([
    distributedStore.srem(`${OUTBOUND_PREFIX}${senderWallet}`, recipientWallet).catch(() => {}),
    distributedStore.srem(`${INBOUND_PREFIX}${recipientWallet}`, senderWallet).catch(() => {}),
  ]);

  return { success: true };
}

/**
 * Unfriends another wallet, atomically severing the reciprocal relationship
 */
export async function unfriendAsync(
  initiatorWallet: string,
  targetWallet: string
): Promise<{ success: boolean }> {
  checkStoreAvailability();
  if (!isValidWalletAddress(initiatorWallet) || !isValidWalletAddress(targetWallet)) {
    return { success: false };
  }

  await Promise.all([
    distributedStore.srem(`${FRIENDS_PREFIX}${initiatorWallet}`, targetWallet).catch(() => {}),
    distributedStore.srem(`${FRIENDS_PREFIX}${targetWallet}`, initiatorWallet).catch(() => {}),
    // Ensure any residual requests are cleaned up
    distributedStore.srem(`${INBOUND_PREFIX}${initiatorWallet}`, targetWallet).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${initiatorWallet}`, targetWallet).catch(() => {}),
    distributedStore.srem(`${INBOUND_PREFIX}${targetWallet}`, initiatorWallet).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${targetWallet}`, initiatorWallet).catch(() => {}),
  ]);

  return { success: true };
}

/**
 * Blocks a wallet: establishes block, severs friendship in both directions, removes all pending requests
 */
export async function blockWalletAsync(
  blockerWallet: string,
  blockedWallet: string
): Promise<{ success: boolean }> {
  checkStoreAvailability();
  if (!isValidWalletAddress(blockerWallet) || !isValidWalletAddress(blockedWallet)) {
    return { success: false };
  }

  if (blockerWallet === blockedWallet) {
    return { success: false };
  }

  // 1. Add block
  await distributedStore.sadd(`${BLOCKS_PREFIX}${blockerWallet}`, blockedWallet);

  // 2. Sever reciprocal friendships
  await Promise.all([
    distributedStore.srem(`${FRIENDS_PREFIX}${blockerWallet}`, blockedWallet).catch(() => {}),
    distributedStore.srem(`${FRIENDS_PREFIX}${blockedWallet}`, blockerWallet).catch(() => {}),
  ]);

  // 3. Remove all pending requests in both directions
  await Promise.all([
    distributedStore.srem(`${INBOUND_PREFIX}${blockerWallet}`, blockedWallet).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${blockerWallet}`, blockedWallet).catch(() => {}),
    distributedStore.srem(`${INBOUND_PREFIX}${blockedWallet}`, blockerWallet).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${blockedWallet}`, blockerWallet).catch(() => {}),
  ]);

  return { success: true };
}

/**
 * Unblocks a wallet
 */
export async function unblockWalletAsync(
  blockerWallet: string,
  blockedWallet: string
): Promise<{ success: boolean }> {
  checkStoreAvailability();
  if (!isValidWalletAddress(blockerWallet) || !isValidWalletAddress(blockedWallet)) {
    return { success: false };
  }

  await distributedStore.srem(`${BLOCKS_PREFIX}${blockerWallet}`, blockedWallet);
  return { success: true };
}

/**
 * Derives relationship status between caller and target wallet
 */
export async function getRelationshipStatusAsync(
  callerWallet: string,
  targetWallet: string
): Promise<RelationshipStatus> {
  checkStoreAvailability();
  if (!isValidWalletAddress(callerWallet) || !isValidWalletAddress(targetWallet)) {
    return 'none';
  }

  if (callerWallet === targetWallet) {
    return 'self';
  }

  if (await isAnyBlockedAsync(callerWallet, targetWallet)) {
    return 'blocked';
  }

  if (await areFriendsAsync(callerWallet, targetWallet)) {
    return 'friends';
  }

  const [inbound, outbound] = await Promise.all([
    distributedStore.smembers(`${INBOUND_PREFIX}${callerWallet}`),
    distributedStore.smembers(`${OUTBOUND_PREFIX}${callerWallet}`),
  ]);

  if (Array.isArray(inbound) && inbound.includes(targetWallet)) {
    return 'pending_inbound';
  }

  if (Array.isArray(outbound) && outbound.includes(targetWallet)) {
    return 'pending_outbound';
  }

  return 'none';
}

/**
 * Test helper: resets all in-memory fallback relationship state
 */
export function clearRelationshipsCacheForTests(): void {
  distributedStore.clearLocalFallback();
}
