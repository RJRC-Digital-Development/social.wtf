import { distributedStore } from '../security/distributedStore.ts';
import { isProductionEnvironment } from '../security/envConfig.ts';
import { PublicKey } from '@solana/web3.js';
import { resolveCanonicalIdentityAsync, isCanonicalOrBoundAsync } from './accountStore.ts';

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
  if (!address || typeof address !== 'string' || address.length < 3 || address.length > 128) {
    return false;
  }
  // Allow canonical account IDs (e.g. acc_..., user-...)
  if (/^[a-zA-Z0-9_-]+$/.test(address)) {
    return true;
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
  const canonicalSource = await resolveCanonicalIdentityAsync(sourceWallet);
  const canonicalTarget = await resolveCanonicalIdentityAsync(targetWallet);
  const blocks = await distributedStore.smembers(`${BLOCKS_PREFIX}${canonicalSource}`);
  return Array.isArray(blocks) && blocks.includes(canonicalTarget);
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
 * Strictly verifies reciprocal friendship between two identities.
 * Invariant: Both A in friends:B AND B in friends:A must hold, and neither party may be blocked.
 */
export async function areFriendsAsync(walletA: string, walletB: string): Promise<boolean> {
  checkStoreAvailability();
  if (!isValidWalletAddress(walletA) || !isValidWalletAddress(walletB)) return false;
  const canonicalA = await resolveCanonicalIdentityAsync(walletA);
  const canonicalB = await resolveCanonicalIdentityAsync(walletB);
  if (canonicalA === canonicalB) return false;

  // Block status strictly overrides any friendship
  const blocked = await isAnyBlockedAsync(canonicalA, canonicalB);
  if (blocked) return false;

  const [aFriends, bFriends] = await Promise.all([
    distributedStore.smembers(`${FRIENDS_PREFIX}${canonicalA}`),
    distributedStore.smembers(`${FRIENDS_PREFIX}${canonicalB}`),
  ]);

  const aHasB = Array.isArray(aFriends) && aFriends.includes(canonicalB);
  const bHasA = Array.isArray(bFriends) && bFriends.includes(canonicalA);

  // Reciprocal invariant required: both sets must agree
  return aHasB && bHasA;
}

/**
 * Retrieves caller's verified reciprocal friends list with orphan/unilateral pruning
 */
export async function getFriendsListAsync(wallet: string): Promise<string[]> {
  checkStoreAvailability();
  if (!isValidWalletAddress(wallet)) return [];
  const canonical = await resolveCanonicalIdentityAsync(wallet);

  const rawFriends = await distributedStore.smembers(`${FRIENDS_PREFIX}${canonical}`);
  if (distributedStore.isConfigured() && !Array.isArray(rawFriends)) {
    throw new RelationshipStoreUnavailableError('Failed to read friends index');
  }
  if (!Array.isArray(rawFriends) || rawFriends.length === 0) return [];

  const verifiedFriends: string[] = [];
  const orphansToPrune: string[] = [];

  for (const friend of rawFriends) {
    if (!isValidWalletAddress(friend)) {
      orphansToPrune.push(friend);
      continue;
    }
    const isFriend = await areFriendsAsync(canonical, friend);
    if (isFriend) {
      const canonicalFriend = await resolveCanonicalIdentityAsync(friend);
      if (!verifiedFriends.includes(canonicalFriend)) {
        verifiedFriends.push(canonicalFriend);
      }
    } else {
      orphansToPrune.push(friend);
    }
  }

  // Background pruning of unilateral/corrupted entries
  if (orphansToPrune.length > 0) {
    Promise.all(
      orphansToPrune.map((orphan) =>
        distributedStore.srem(`${FRIENDS_PREFIX}${canonical}`, orphan).catch(() => {})
      )
    ).catch(() => {});
  }

  return verifiedFriends;
}

/**
 * Retrieves inbound pending friend request senders for an identity
 */
export async function getInboundRequestsAsync(wallet: string): Promise<string[]> {
  checkStoreAvailability();
  if (!isValidWalletAddress(wallet)) return [];
  const canonical = await resolveCanonicalIdentityAsync(wallet);

  const rawInbound = await distributedStore.smembers(`${INBOUND_PREFIX}${canonical}`);
  if (!Array.isArray(rawInbound)) return [];

  // Filter out blocked senders
  const validInbound: string[] = [];
  for (const sender of rawInbound) {
    if (isValidWalletAddress(sender) && !(await isAnyBlockedAsync(canonical, sender))) {
      const canonicalSender = await resolveCanonicalIdentityAsync(sender);
      if (!validInbound.includes(canonicalSender)) {
        validInbound.push(canonicalSender);
      }
    }
  }
  return validInbound;
}

/**
 * Retrieves outbound pending friend request recipients for an identity
 */
export async function getOutboundRequestsAsync(wallet: string): Promise<string[]> {
  checkStoreAvailability();
  if (!isValidWalletAddress(wallet)) return [];
  const canonical = await resolveCanonicalIdentityAsync(wallet);

  const rawOutbound = await distributedStore.smembers(`${OUTBOUND_PREFIX}${canonical}`);
  if (!Array.isArray(rawOutbound)) return [];

  const validOutbound: string[] = [];
  for (const recipient of rawOutbound) {
    if (isValidWalletAddress(recipient) && !(await isAnyBlockedAsync(canonical, recipient))) {
      const canonicalRecipient = await resolveCanonicalIdentityAsync(recipient);
      if (!validOutbound.includes(canonicalRecipient)) {
        validOutbound.push(canonicalRecipient);
      }
    }
  }
  return validOutbound;
}

/**
 * Retrieves list of identities blocked by this identity
 */
export async function getBlockedListAsync(wallet: string): Promise<string[]> {
  checkStoreAvailability();
  if (!isValidWalletAddress(wallet)) return [];
  const canonical = await resolveCanonicalIdentityAsync(wallet);

  const rawBlocks = await distributedStore.smembers(`${BLOCKS_PREFIX}${canonical}`);
  if (!Array.isArray(rawBlocks)) return [];

  const validBlocks: string[] = [];
  for (const blocked of rawBlocks) {
    if (isValidWalletAddress(blocked)) {
      const canonicalBlocked = await resolveCanonicalIdentityAsync(blocked);
      if (!validBlocks.includes(canonicalBlocked)) {
        validBlocks.push(canonicalBlocked);
      }
    }
  }
  return validBlocks;
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

  const canonicalFrom = await resolveCanonicalIdentityAsync(fromWallet);
  const canonicalTo = await resolveCanonicalIdentityAsync(toWallet);

  // Unbound wallet cannot create new social state
  const isFromBound = await isCanonicalOrBoundAsync(fromWallet);
  if (!isFromBound) {
    return {
      success: false,
      error: 'Unbound legacy wallet cannot create new friend requests. Account registration or migration required.',
      status: 403,
    };
  }

  if (canonicalFrom === canonicalTo) {
    return { success: false, error: 'Cannot send a friend request to yourself.', status: 400 };
  }

  // Block checks
  if (await isAnyBlockedAsync(canonicalFrom, canonicalTo)) {
    return { success: false, error: 'Unable to send friend request.', status: 403 };
  }

  // Check if already friends
  if (await areFriendsAsync(canonicalFrom, canonicalTo)) {
    return { success: false, error: 'You are already friends with this user.', status: 409 };
  }

  // Check if outbound request already exists (idempotent)
  const existingOutbound = await distributedStore.smembers(`${OUTBOUND_PREFIX}${canonicalFrom}`);
  if (Array.isArray(existingOutbound) && existingOutbound.includes(canonicalTo)) {
    return { success: true };
  }

  // If the target already sent an inbound request to us, auto-accept into mutual friendship!
  const existingInbound = await distributedStore.smembers(`${INBOUND_PREFIX}${canonicalFrom}`);
  if (Array.isArray(existingInbound) && existingInbound.includes(canonicalTo)) {
    return acceptFriendRequestAsync(canonicalFrom, canonicalTo);
  }

  // Multi-key write with compensation on partial failure
  const outboundAdded = await distributedStore.sadd(`${OUTBOUND_PREFIX}${canonicalFrom}`, canonicalTo);
  if (!outboundAdded) {
    return { success: false, error: 'Failed to record outbound friend request.', status: 500 };
  }

  const inboundAdded = await distributedStore.sadd(`${INBOUND_PREFIX}${canonicalTo}`, canonicalFrom);
  if (!inboundAdded) {
    // Compensate step 1
    await distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalFrom}`, canonicalTo).catch(() => {});
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

  const canonicalRecipient = await resolveCanonicalIdentityAsync(recipientWallet);
  const canonicalSender = await resolveCanonicalIdentityAsync(senderWallet);

  // Unbound wallet cannot accept friend requests
  const isRecipientBound = await isCanonicalOrBoundAsync(recipientWallet);
  if (!isRecipientBound) {
    return {
      success: false,
      error: 'Unbound legacy wallet cannot accept friend requests. Account registration or migration required.',
      status: 403,
    };
  }

  if (canonicalRecipient === canonicalSender) {
    return { success: false, error: 'Cannot accept request from yourself.', status: 400 };
  }

  // Verify precondition: inbound request must exist
  const inboundList = await distributedStore.smembers(`${INBOUND_PREFIX}${canonicalRecipient}`);
  const hasInbound = Array.isArray(inboundList) && inboundList.includes(canonicalSender);

  if (!hasInbound) {
    return { success: false, error: 'No pending friend request found from this user.', status: 404 };
  }

  if (await isAnyBlockedAsync(canonicalRecipient, canonicalSender)) {
    return { success: false, error: 'Cannot accept friend request.', status: 403 };
  }

  // Multi-key reciprocal friendship establishment
  // Step 1: Add sender to recipient's friends set
  const step1 = await distributedStore.sadd(`${FRIENDS_PREFIX}${canonicalRecipient}`, canonicalSender);
  if (!step1) {
    return { success: false, error: 'Failed to establish friendship.', status: 500 };
  }

  // Step 2: Add recipient to sender's friends set
  const step2 = await distributedStore.sadd(`${FRIENDS_PREFIX}${canonicalSender}`, canonicalRecipient);
  if (!step2) {
    // Compensate step 1
    await distributedStore.srem(`${FRIENDS_PREFIX}${canonicalRecipient}`, canonicalSender).catch(() => {});
    return { success: false, error: 'Failed to establish mutual friendship.', status: 500 };
  }

  // Step 3 & 4: Clean up pending request sets
  await Promise.all([
    distributedStore.srem(`${INBOUND_PREFIX}${canonicalRecipient}`, canonicalSender).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalSender}`, canonicalRecipient).catch(() => {}),
    // Also clean any reciprocal pending requests if existed
    distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalRecipient}`, canonicalSender).catch(() => {}),
    distributedStore.srem(`${INBOUND_PREFIX}${canonicalSender}`, canonicalRecipient).catch(() => {}),
  ]);

  // Reciprocal verification check
  const verified = await areFriendsAsync(canonicalRecipient, canonicalSender);
  if (!verified) {
    // Rollback
    await Promise.all([
      distributedStore.srem(`${FRIENDS_PREFIX}${canonicalRecipient}`, canonicalSender).catch(() => {}),
      distributedStore.srem(`${FRIENDS_PREFIX}${canonicalSender}`, canonicalRecipient).catch(() => {}),
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

  const canonicalRecipient = await resolveCanonicalIdentityAsync(recipientWallet);
  const canonicalSender = await resolveCanonicalIdentityAsync(senderWallet);

  await Promise.all([
    distributedStore.srem(`${INBOUND_PREFIX}${canonicalRecipient}`, canonicalSender).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalSender}`, canonicalRecipient).catch(() => {}),
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

  const canonicalSender = await resolveCanonicalIdentityAsync(senderWallet);
  const canonicalRecipient = await resolveCanonicalIdentityAsync(recipientWallet);

  await Promise.all([
    distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalSender}`, canonicalRecipient).catch(() => {}),
    distributedStore.srem(`${INBOUND_PREFIX}${canonicalRecipient}`, canonicalSender).catch(() => {}),
  ]);

  return { success: true };
}

/**
 * Unfriends another identity, atomically severing the reciprocal relationship
 */
export async function unfriendAsync(
  initiatorWallet: string,
  targetWallet: string
): Promise<{ success: boolean }> {
  checkStoreAvailability();
  if (!isValidWalletAddress(initiatorWallet) || !isValidWalletAddress(targetWallet)) {
    return { success: false };
  }

  const canonicalInitiator = await resolveCanonicalIdentityAsync(initiatorWallet);
  const canonicalTarget = await resolveCanonicalIdentityAsync(targetWallet);

  await Promise.all([
    distributedStore.srem(`${FRIENDS_PREFIX}${canonicalInitiator}`, canonicalTarget).catch(() => {}),
    distributedStore.srem(`${FRIENDS_PREFIX}${canonicalTarget}`, canonicalInitiator).catch(() => {}),
    // Ensure any residual requests are cleaned up
    distributedStore.srem(`${INBOUND_PREFIX}${canonicalInitiator}`, canonicalTarget).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalInitiator}`, canonicalTarget).catch(() => {}),
    distributedStore.srem(`${INBOUND_PREFIX}${canonicalTarget}`, canonicalInitiator).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalTarget}`, canonicalInitiator).catch(() => {}),
  ]);

  return { success: true };
}

/**
 * Blocks an identity: establishes block, severs friendship in both directions, removes all pending requests
 */
export async function blockWalletAsync(
  blockerWallet: string,
  blockedWallet: string
): Promise<{ success: boolean }> {
  checkStoreAvailability();
  if (!isValidWalletAddress(blockerWallet) || !isValidWalletAddress(blockedWallet)) {
    return { success: false };
  }

  const canonicalBlocker = await resolveCanonicalIdentityAsync(blockerWallet);
  const canonicalBlocked = await resolveCanonicalIdentityAsync(blockedWallet);

  const isBlockerBound = await isCanonicalOrBoundAsync(blockerWallet);
  if (!isBlockerBound) {
    return { success: false };
  }

  if (canonicalBlocker === canonicalBlocked) {
    return { success: false };
  }

  // 1. Add block
  await distributedStore.sadd(`${BLOCKS_PREFIX}${canonicalBlocker}`, canonicalBlocked);

  // 2. Sever reciprocal friendships
  await Promise.all([
    distributedStore.srem(`${FRIENDS_PREFIX}${canonicalBlocker}`, canonicalBlocked).catch(() => {}),
    distributedStore.srem(`${FRIENDS_PREFIX}${canonicalBlocked}`, canonicalBlocker).catch(() => {}),
  ]);

  // 3. Remove all pending requests in both directions
  await Promise.all([
    distributedStore.srem(`${INBOUND_PREFIX}${canonicalBlocker}`, canonicalBlocked).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalBlocker}`, canonicalBlocked).catch(() => {}),
    distributedStore.srem(`${INBOUND_PREFIX}${canonicalBlocked}`, canonicalBlocker).catch(() => {}),
    distributedStore.srem(`${OUTBOUND_PREFIX}${canonicalBlocked}`, canonicalBlocker).catch(() => {}),
  ]);

  return { success: true };
}

/**
 * Unblocks an identity
 */
export async function unblockWalletAsync(
  blockerWallet: string,
  blockedWallet: string
): Promise<{ success: boolean }> {
  checkStoreAvailability();
  if (!isValidWalletAddress(blockerWallet) || !isValidWalletAddress(blockedWallet)) {
    return { success: false };
  }

  const canonicalBlocker = await resolveCanonicalIdentityAsync(blockerWallet);
  const canonicalBlocked = await resolveCanonicalIdentityAsync(blockedWallet);

  await distributedStore.srem(`${BLOCKS_PREFIX}${canonicalBlocker}`, canonicalBlocked);
  return { success: true };
}

/**
 * Derives relationship status between caller and target identity
 */
export async function getRelationshipStatusAsync(
  callerWallet: string,
  targetWallet: string
): Promise<RelationshipStatus> {
  checkStoreAvailability();
  if (!isValidWalletAddress(callerWallet) || !isValidWalletAddress(targetWallet)) {
    return 'none';
  }

  const canonicalCaller = await resolveCanonicalIdentityAsync(callerWallet);
  const canonicalTarget = await resolveCanonicalIdentityAsync(targetWallet);

  if (canonicalCaller === canonicalTarget) {
    return 'self';
  }

  if (await isAnyBlockedAsync(canonicalCaller, canonicalTarget)) {
    return 'blocked';
  }

  if (await areFriendsAsync(canonicalCaller, canonicalTarget)) {
    return 'friends';
  }

  const [inbound, outbound] = await Promise.all([
    distributedStore.smembers(`${INBOUND_PREFIX}${canonicalCaller}`),
    distributedStore.smembers(`${OUTBOUND_PREFIX}${canonicalCaller}`),
  ]);

  if (Array.isArray(inbound) && inbound.includes(canonicalTarget)) {
    return 'pending_inbound';
  }

  if (Array.isArray(outbound) && outbound.includes(canonicalTarget)) {
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
