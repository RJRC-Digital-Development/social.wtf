/**
 * Authoritative Secret Adult Club Persistence & Invitation Authority
 * 
 * Provides durable, invitation-only club membership and single-use invitation management
 * backed by DistributedStore (Redis / Vercel KV) with local development fallback.
 * 
 * Storage Model:
 *   - Member Key:       club:member:{wallet}         -> JSON string of ClubMember
 *   - Active Set:       club:members:active          -> Redis Set of active member wallets
 *   - Invitation Key:   club:invitation:{code}       -> JSON string of ClubInvitation
 *   - Recipient Set:    club:invites:recipient:{w}   -> Redis Set of invitation codes for recipient
 * 
 * Invariants:
 *   - Zero discoverability for non-members
 *   - Strict separation of authentication, adult eligibility, and club membership
 *   - High-entropy single-use invitations (32 random bytes)
 *   - Expiration and recipient wallet binding
 *   - Fail-closed on production distributed store outage (HTTP 503)
 */

import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { distributedStore } from '../security/distributedStore.ts';

export const CLUB_MEMBER_PREFIX = 'club:member:';
export const CLUB_ACTIVE_MEMBERS_SET = 'club:members:active';
export const CLUB_INVITATION_PREFIX = 'club:invitation:';
export const CLUB_RECIPIENT_INVITES_PREFIX = 'club:invites:recipient:';

export const DEFAULT_INVITATION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

export interface ClubMember {
  wallet: string;
  status: 'active' | 'revoked';
  admittedAt: string;
  admittedBy: string; // Inviter wallet or 'genesis' / 'operator'
  inviteCode?: string;
  revokedAt?: string;
  revokedBy?: string;
  version: number;
}

export interface ClubInvitation {
  code: string; // 64 hex characters (32 crypto random bytes)
  inviterWallet: string;
  recipientWallet: string;
  createdAt: string;
  expiresAt: string;
  status: 'pending' | 'redeemed' | 'revoked';
  redeemedAt?: string;
  redeemedBy?: string;
  revokedAt?: string;
  revokedBy?: string;
  version: number;
}

export class ClubStoreUnavailableError extends Error {
  public readonly code = 'CLUB_STORE_UNAVAILABLE';
  constructor(message: string = 'Authoritative club membership store is temporarily unavailable') {
    super(message);
    this.name = 'ClubStoreUnavailableError';
  }
}

// In-Memory Fallback Cache for Tests / Local Development ONLY
const clubMembersCache = new Map<string, ClubMember>();
const activeMembersSet = new Set<string>();
const clubInvitationsCache = new Map<string, ClubInvitation>();
const recipientInvitationsCache = new Map<string, Set<string>>();
let isLocalInitialized = false;

let localLockPromise: Promise<void> = Promise.resolve();

async function acquireLocalLock<T>(fn: () => Promise<T>): Promise<T> {
  let release: () => void;
  const nextLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  const currentLock = localLockPromise;
  localLockPromise = nextLock;
  await currentLock;
  try {
    return await fn();
  } finally {
    release!();
  }
}

function getStorageFilePath(): string {
  if (process.env.CLUB_STORAGE_FILE) {
    return process.env.CLUB_STORAGE_FILE;
  }
  return path.join(process.cwd(), '.data', 'club.json');
}

function loadFromLocalDisk(): void {
  try {
    const filePath = getStorageFilePath();
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      if (data && data.trim()) {
        const parsed = JSON.parse(data);
        if (parsed && typeof parsed === 'object') {
          clubMembersCache.clear();
          activeMembersSet.clear();
          clubInvitationsCache.clear();
          recipientInvitationsCache.clear();

          if (Array.isArray(parsed.members)) {
            for (const m of parsed.members) {
              if (m && m.wallet) {
                clubMembersCache.set(m.wallet, m);
                if (m.status === 'active') {
                  activeMembersSet.add(m.wallet);
                }
              }
            }
          }

          if (Array.isArray(parsed.invitations)) {
            for (const inv of parsed.invitations) {
              if (inv && inv.code) {
                clubInvitationsCache.set(inv.code, inv);
                let recSet = recipientInvitationsCache.get(inv.recipientWallet);
                if (!recSet) {
                  recSet = new Set<string>();
                  recipientInvitationsCache.set(inv.recipientWallet, recSet);
                }
                recSet.add(inv.code);
              }
            }
          }
        }
      }
    }
  } catch {
    // Test fail-safe
  }
}

function flushToLocalDisk(): void {
  try {
    const filePath = getStorageFilePath();
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    const payload = {
      members: Array.from(clubMembersCache.values()),
      invitations: Array.from(clubInvitationsCache.values()),
    };
    fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  } catch {
    // Fail-safe
  }
}

function ensureLocalInitialized(): void {
  if (!isLocalInitialized) {
    loadFromLocalDisk();
    isLocalInitialized = true;
  }
}

/**
 * Retrieves the club membership record for a wallet
 */
export async function getClubMembershipAsync(wallet: string): Promise<ClubMember | null> {
  if (!wallet || typeof wallet !== 'string') return null;

  const isProduction = process.env.NODE_ENV === 'production';

  if (distributedStore.isConfigured()) {
    const memberKey = `${CLUB_MEMBER_PREFIX}${wallet}`;
    const raw = await distributedStore.get(memberKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ClubMember;
    } catch {
      return null;
    }
  }

  if (isProduction) {
    throw new ClubStoreUnavailableError('Distributed club store is not configured in production environment');
  }

  ensureLocalInitialized();
  return clubMembersCache.get(wallet) || null;
}

/**
 * Checks whether a wallet is an active club member
 */
export async function isClubMemberAsync(wallet: string): Promise<boolean> {
  if (!wallet || typeof wallet !== 'string') return false;

  const isProduction = process.env.NODE_ENV === 'production';

  if (distributedStore.isConfigured()) {
    const isMember = await distributedStore.sismember(CLUB_ACTIVE_MEMBERS_SET, wallet);
    if (typeof isMember === 'boolean') {
      return isMember;
    }
    // Fallback check against member record
    const member = await getClubMembershipAsync(wallet);
    return Boolean(member && member.status === 'active');
  }

  if (isProduction) {
    throw new ClubStoreUnavailableError('Distributed club store is not configured in production environment');
  }

  ensureLocalInitialized();
  const member = clubMembersCache.get(wallet);
  return Boolean(member && member.status === 'active');
}

/**
 * Activates club membership for a wallet
 */
export async function activateClubMembershipAsync(
  wallet: string,
  admittedBy: string,
  inviteCode?: string
): Promise<ClubMember> {
  if (!wallet || typeof wallet !== 'string') {
    throw new Error('Invalid wallet address for club membership');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const now = new Date().toISOString();

  const membership: ClubMember = {
    wallet,
    status: 'active',
    admittedAt: now,
    admittedBy: admittedBy || 'operator_genesis',
    inviteCode,
    version: 1,
  };

  if (distributedStore.isConfigured()) {
    const memberKey = `${CLUB_MEMBER_PREFIX}${wallet}`;

    // Step 1: Write member entity
    const setSuccess = await distributedStore.set(memberKey, JSON.stringify(membership));
    if (!setSuccess) {
      throw new ClubStoreUnavailableError('Failed to persist club membership entity');
    }

    // Step 2: Index in active members set
    const saddSuccess = await distributedStore.sadd(CLUB_ACTIVE_MEMBERS_SET, wallet);
    if (!saddSuccess) {
      // Compensating rollback
      await distributedStore.del(memberKey).catch(() => {});
      throw new ClubStoreUnavailableError('Failed to index active club member');
    }

    return membership;
  }

  if (isProduction) {
    throw new ClubStoreUnavailableError('Distributed club store is not configured in production environment');
  }

  return acquireLocalLock(async () => {
    ensureLocalInitialized();
    clubMembersCache.set(wallet, membership);
    activeMembersSet.add(wallet);
    flushToLocalDisk();
    return membership;
  });
}

/**
 * Revokes club membership for a wallet
 */
export async function revokeClubMembershipAsync(
  wallet: string,
  revokedBy: string
): Promise<boolean> {
  if (!wallet || typeof wallet !== 'string') return false;

  const isProduction = process.env.NODE_ENV === 'production';
  const now = new Date().toISOString();

  const current = await getClubMembershipAsync(wallet);
  if (!current) return false;

  const revoked: ClubMember = {
    ...current,
    status: 'revoked',
    revokedAt: now,
    revokedBy,
    version: (current.version || 1) + 1,
  };

  if (distributedStore.isConfigured()) {
    const memberKey = `${CLUB_MEMBER_PREFIX}${wallet}`;

    // Step 1: Remove from active set
    const sremSuccess = await distributedStore.srem(CLUB_ACTIVE_MEMBERS_SET, wallet);
    if (!sremSuccess) {
      throw new ClubStoreUnavailableError('Failed to remove active club member index');
    }

    // Step 2: Update member record
    const setSuccess = await distributedStore.set(memberKey, JSON.stringify(revoked));
    if (!setSuccess) {
      // Compensating rollback
      await distributedStore.sadd(CLUB_ACTIVE_MEMBERS_SET, wallet).catch(() => {});
      throw new ClubStoreUnavailableError('Failed to persist revoked club member record');
    }

    return true;
  }

  if (isProduction) {
    throw new ClubStoreUnavailableError('Distributed club store is not configured in production environment');
  }

  return acquireLocalLock(async () => {
    ensureLocalInitialized();
    clubMembersCache.set(wallet, revoked);
    activeMembersSet.delete(wallet);
    flushToLocalDisk();
    return true;
  });
}

/**
 * Creates a high-entropy, single-use invitation for a specific recipient wallet
 */
export async function createClubInvitationAsync(
  inviterWallet: string,
  recipientWallet: string,
  ttlSeconds: number = DEFAULT_INVITATION_TTL_SECONDS
): Promise<ClubInvitation> {
  if (!inviterWallet || typeof inviterWallet !== 'string') {
    throw new Error('Valid inviter wallet is required');
  }
  if (!recipientWallet || typeof recipientWallet !== 'string') {
    throw new Error('Valid recipient wallet is required');
  }
  if (inviterWallet.toLowerCase() === recipientWallet.toLowerCase()) {
    throw new Error('Self-invitations are strictly prohibited');
  }

  // Inviter must already be an active club member
  const isInviterActive = await isClubMemberAsync(inviterWallet);
  if (!isInviterActive) {
    throw new Error('Only active club members are authorized to issue invitations');
  }

  const isProduction = process.env.NODE_ENV === 'production';
  const nowMs = Date.now();
  const code = crypto.randomBytes(32).toString('hex'); // 64 hex characters (256 bits entropy)

  const invitation: ClubInvitation = {
    code,
    inviterWallet,
    recipientWallet,
    createdAt: new Date(nowMs).toISOString(),
    expiresAt: new Date(nowMs + ttlSeconds * 1000).toISOString(),
    status: 'pending',
    version: 1,
  };

  if (distributedStore.isConfigured()) {
    const inviteKey = `${CLUB_INVITATION_PREFIX}${code}`;
    const recipientKey = `${CLUB_RECIPIENT_INVITES_PREFIX}${recipientWallet}`;

    // Step 1: Write invitation record
    const setSuccess = await distributedStore.set(inviteKey, JSON.stringify(invitation), ttlSeconds);
    if (!setSuccess) {
      throw new ClubStoreUnavailableError('Failed to persist invitation record');
    }

    // Step 2: Index under recipient
    const saddSuccess = await distributedStore.sadd(recipientKey, code);
    if (!saddSuccess) {
      await distributedStore.del(inviteKey).catch(() => {});
      throw new ClubStoreUnavailableError('Failed to index recipient invitation');
    }

    return invitation;
  }

  if (isProduction) {
    throw new ClubStoreUnavailableError('Distributed club store is not configured in production environment');
  }

  return acquireLocalLock(async () => {
    ensureLocalInitialized();
    clubInvitationsCache.set(code, invitation);

    let recSet = recipientInvitationsCache.get(recipientWallet);
    if (!recSet) {
      recSet = new Set<string>();
      recipientInvitationsCache.set(recipientWallet, recSet);
    }
    recSet.add(code);

    flushToLocalDisk();
    return invitation;
  });
}

/**
 * Retrieves an invitation by code
 */
export async function getClubInvitationAsync(code: string): Promise<ClubInvitation | null> {
  if (!code || typeof code !== 'string') return null;

  const isProduction = process.env.NODE_ENV === 'production';

  if (distributedStore.isConfigured()) {
    const inviteKey = `${CLUB_INVITATION_PREFIX}${code}`;
    const raw = await distributedStore.get(inviteKey);
    if (!raw) return null;
    try {
      return JSON.parse(raw) as ClubInvitation;
    } catch {
      return null;
    }
  }

  if (isProduction) {
    throw new ClubStoreUnavailableError('Distributed club store is not configured in production environment');
  }

  ensureLocalInitialized();
  return clubInvitationsCache.get(code) || null;
}

/**
 * Redeems an invitation and activates club membership atomically / with compensating rollback
 */
export async function redeemClubInvitationAsync(
  code: string,
  recipientWallet: string
): Promise<{ success: boolean; membership?: ClubMember; error?: string; code?: string }> {
  if (!code || typeof code !== 'string') {
    return { success: false, error: 'Invalid invitation code', code: 'INVALID_INVITATION' };
  }
  if (!recipientWallet || typeof recipientWallet !== 'string') {
    return { success: false, error: 'Recipient wallet required', code: 'INVALID_RECIPIENT' };
  }

  const invitation = await getClubInvitationAsync(code);
  if (!invitation) {
    return { success: false, error: 'Invitation not found or expired', code: 'INVITATION_NOT_FOUND' };
  }

  // Recipient binding check
  if (invitation.recipientWallet.toLowerCase() !== recipientWallet.toLowerCase()) {
    return {
      success: false,
      error: 'Invitation is bound to a different wallet address',
      code: 'RECIPIENT_MISMATCH',
    };
  }

  // Status check
  if (invitation.status === 'redeemed') {
    return { success: false, error: 'Invitation has already been redeemed', code: 'ALREADY_REDEEMED' };
  }
  if (invitation.status === 'revoked') {
    return { success: false, error: 'Invitation has been revoked', code: 'INVITATION_REVOKED' };
  }

  // Expiration check
  const nowMs = Date.now();
  const expiresAtMs = new Date(invitation.expiresAt).getTime();
  if (nowMs > expiresAtMs) {
    return { success: false, error: 'Invitation has expired', code: 'INVITATION_EXPIRED' };
  }

  // Mark redeemed
  const nowIso = new Date(nowMs).toISOString();
  const updatedInvitation: ClubInvitation = {
    ...invitation,
    status: 'redeemed',
    redeemedAt: nowIso,
    redeemedBy: recipientWallet,
    version: (invitation.version || 1) + 1,
  };

  const isProduction = process.env.NODE_ENV === 'production';

  if (distributedStore.isConfigured()) {
    const claimKey = `club:invitation:claim:${code}`;
    const claimAcquired = await distributedStore.setnx(claimKey, recipientWallet, 60);
    if (!claimAcquired) {
      return {
        success: false,
        error: 'Invitation has already been redeemed or is currently being processed',
        code: 'ALREADY_REDEEMED',
      };
    }

    const inviteKey = `${CLUB_INVITATION_PREFIX}${code}`;

    // Step 1: Update invitation to redeemed
    const setInviteSuccess = await distributedStore.set(inviteKey, JSON.stringify(updatedInvitation));
    if (!setInviteSuccess) {
      await distributedStore.del(claimKey).catch(() => {});
      throw new ClubStoreUnavailableError('Failed to update invitation state');
    }

    // Step 2: Activate membership
    try {
      const membership = await activateClubMembershipAsync(
        recipientWallet,
        invitation.inviterWallet,
        code
      );
      return { success: true, membership };
    } catch (err) {
      // Compensating rollback on invitation and claim
      await distributedStore.set(inviteKey, JSON.stringify(invitation)).catch(() => {});
      await distributedStore.del(claimKey).catch(() => {});
      throw err;
    }
  }

  if (isProduction) {
    throw new ClubStoreUnavailableError('Distributed club store is not configured in production environment');
  }

  return acquireLocalLock(async () => {
    ensureLocalInitialized();
    const current = clubInvitationsCache.get(code);
    if (!current || current.status !== 'pending') {
      return {
        success: false,
        error: 'Invitation has already been redeemed or is no longer pending',
        code: 'ALREADY_REDEEMED',
      };
    }
    clubInvitationsCache.set(code, updatedInvitation);
    const membership: ClubMember = {
      wallet: recipientWallet,
      status: 'active',
      admittedAt: nowIso,
      admittedBy: invitation.inviterWallet,
      inviteCode: code,
      version: 1,
    };
    clubMembersCache.set(recipientWallet, membership);
    activeMembersSet.add(recipientWallet);
    flushToLocalDisk();
    return { success: true, membership };
  });
}

/**
 * Revokes a pending invitation
 */
export async function revokeClubInvitationAsync(
  code: string,
  inviterWallet: string
): Promise<boolean> {
  const invitation = await getClubInvitationAsync(code);
  if (!invitation) return false;
  if (invitation.inviterWallet.toLowerCase() !== inviterWallet.toLowerCase()) {
    return false;
  }
  if (invitation.status !== 'pending') return false;

  const nowIso = new Date().toISOString();
  const revoked: ClubInvitation = {
    ...invitation,
    status: 'revoked',
    revokedAt: nowIso,
    revokedBy: inviterWallet,
    version: (invitation.version || 1) + 1,
  };

  const isProduction = process.env.NODE_ENV === 'production';

  if (distributedStore.isConfigured()) {
    const inviteKey = `${CLUB_INVITATION_PREFIX}${code}`;
    const success = await distributedStore.set(inviteKey, JSON.stringify(revoked));
    if (!success) {
      throw new ClubStoreUnavailableError('Failed to revoke invitation');
    }
    return true;
  }

  if (isProduction) {
    throw new ClubStoreUnavailableError('Distributed club store is not configured in production environment');
  }

  return acquireLocalLock(async () => {
    ensureLocalInitialized();
    clubInvitationsCache.set(code, revoked);
    flushToLocalDisk();
    return true;
  });
}

/**
 * Test harness reset helper
 */
export function clearClubStoreForTests(): void {
  clubMembersCache.clear();
  activeMembersSet.clear();
  clubInvitationsCache.clear();
  recipientInvitationsCache.clear();
  isLocalInitialized = false;
  if (distributedStore.isConfigured()) {
    distributedStore.clearLocalFallback?.();
  }
}
