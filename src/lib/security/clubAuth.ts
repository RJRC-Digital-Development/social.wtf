/**
 * Secret Adult Club Authorization & Policy Guard
 * 
 * Enforces mandatory independence between:
 *   - SIWS authentication
 *   - Adult eligibility (card/video/ID age checks)
 *   - Club membership (invitation-only durable membership)
 *   - Friendship (reciprocal #3R friend graph)
 *   - Creator/Admin scopes (NEVER grants implicit club bypass)
 * 
 * Invariants:
 *   - Sensitive content authorization requires ALL 5:
 *       SIWS authenticated
 *       AND adultEligible(viewer)
 *       AND isClubMember(viewer)
 *       AND (viewer === author OR areFriends(viewer, author))
 *       AND !isBlocked(viewer, author)
 *   - Sentinel Server Classification is authoritative
 *   - Uncertain / sensitive classifications FAIL PRIVATE (never enter normal feed)
 */

import { isClubMemberAsync } from '../data/clubStore.ts';
import { getProfileByWalletAsync } from '../data/profileStore.ts';
import { areFriendsAsync, isAnyBlockedAsync } from '../data/relationshipStore.ts';
import { getAuthorizationClaimsAsync } from './authorization.ts';

export type ContentClassification = 'safe' | 'sensitive' | 'uncertain' | 'rejected';

export interface ClassificationResult {
  classification: ContentClassification;
  confidence: number;
  tags: string[];
  reason: string;
}

/**
 * Server-authoritative Adult Club feature gate / kill-switch.
 * Default is FALSE for production launch safety.
 */
export function isAdultClubEnabled(): boolean {
  return process.env.ADULT_CLUB_ENABLED === 'true';
}

/**
 * Checks adult eligibility independently from club membership.
 * Verifies profile.ageVerified or active cryptographic claims.
 */
export async function isAdultEligibleAsync(wallet: string): Promise<boolean> {
  if (!wallet || typeof wallet !== 'string') return false;

  try {
    const claims = await getAuthorizationClaimsAsync(wallet);
    if (claims && claims.isAdultAuthorized) {
      return true;
    }

    const profile = await getProfileByWalletAsync(wallet);
    if (profile && profile.ageVerified) {
      return true;
    }
  } catch {
    // Fail closed on lookup errors
  }

  return false;
}

/**
 * Server-authoritative Sentinel content classification.
 * Identifies sensitive, uncertain, rejected, or safe content.
 */
export function classifyContent(text: string, mediaUrl?: string): ClassificationResult {
  const combined = `${text || ''} ${mediaUrl || ''}`.toLowerCase();

  // 1. Prohibited / Illicit patterns (Rejected completely)
  if (
    combined.includes('csam') ||
    combined.includes('child abuse') ||
    combined.includes('terror') ||
    combined.includes('illicit_threat')
  ) {
    return {
      classification: 'rejected',
      confidence: 1.0,
      tags: ['prohibited_content', 'policy_violation'],
      reason: 'Prohibited material detected by Sentinel safety filter.',
    };
  }

  // 2. Sensitive / Mature patterns
  if (
    combined.includes('nsfw') ||
    combined.includes('adult') ||
    combined.includes('18+') ||
    combined.includes('nude') ||
    combined.includes('explicit') ||
    combined.includes('restricted') ||
    combined.includes('mature') ||
    combined.includes('club_secret') ||
    combined.includes('shielded')
  ) {
    return {
      classification: 'sensitive',
      confidence: 0.98,
      tags: ['mature_creator_content', 'restricted_18', 'secret_club_only'],
      reason: 'Sentinel classified content as mature/sensitive.',
    };
  }

  // 3. Uncertain / Ambiguous patterns (Fail private)
  if (
    combined.includes('unverified_media') ||
    combined.includes('ambiguous_flag') ||
    combined.includes('uncertain_vision')
  ) {
    return {
      classification: 'uncertain',
      confidence: 0.65,
      tags: ['uncertain_classification', 'quarantine_pending'],
      reason: 'Sentinel flagged content as uncertain. Quarantined pending verification.',
    };
  }

  // 4. Clean / Safe
  return {
    classification: 'safe',
    confidence: 0.99,
    tags: ['clean', 'public_feed_eligible'],
    reason: 'Passed Sentinel standard safety filters.',
  };
}

/**
 * Authorizes viewing sensitive/club content.
 * Enforces all 5 mandatory conditions.
 */
export async function authorizeClubReadAsync(
  viewerWallet: string,
  authorWallet: string
): Promise<{ authorized: boolean; reason?: string; status: number }> {
  if (!isAdultClubEnabled()) {
    return { authorized: false, reason: 'Adult club is currently disabled', status: 404 };
  }

  if (!viewerWallet || !authorWallet) {
    return { authorized: false, reason: 'Authentication required', status: 401 };
  }

  // Condition 1: Block check
  const blocked = await isAnyBlockedAsync(viewerWallet, authorWallet);
  if (blocked) {
    return { authorized: false, reason: 'Access restricted', status: 404 };
  }

  // Condition 2: Relationship authorization (Self or Accepted Friend)
  const isSelf = viewerWallet === authorWallet;
  if (!isSelf) {
    const isFriend = await areFriendsAsync(viewerWallet, authorWallet);
    if (!isFriend) {
      return { authorized: false, reason: 'Relationship authorization required', status: 404 };
    }
  }

  // Condition 3: Adult Eligibility
  const isAdult = await isAdultEligibleAsync(viewerWallet);
  if (!isAdult) {
    return { authorized: false, reason: '18+ adult eligibility required', status: 403 };
  }

  // Condition 4: Active Club Membership
  const isMember = await isClubMemberAsync(viewerWallet);
  if (!isMember) {
    return { authorized: false, reason: 'Active club membership required', status: 403 };
  }

  return { authorized: true, status: 200 };
}

/**
 * Authorizes publishing sensitive/club content.
 * Enforces adult eligibility + active club membership.
 */
export async function authorizeClubWriteAsync(
  authorWallet: string
): Promise<{ authorized: boolean; reason?: string; status: number }> {
  if (!isAdultClubEnabled()) {
    return { authorized: false, reason: 'Adult club is currently disabled', status: 403 };
  }

  if (!authorWallet) {
    return { authorized: false, reason: 'Authentication required', status: 401 };
  }

  const isAdult = await isAdultEligibleAsync(authorWallet);
  if (!isAdult) {
    return { authorized: false, reason: '18+ adult eligibility required to publish sensitive content', status: 403 };
  }

  const isMember = await isClubMemberAsync(authorWallet);
  if (!isMember) {
    return { authorized: false, reason: 'Active club membership required to publish sensitive content', status: 403 };
  }

  return { authorized: true, status: 200 };
}
