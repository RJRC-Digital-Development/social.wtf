import assert from 'node:assert';
import { Keypair } from '@solana/web3.js';
import {
  areFriendsAsync,
  sendFriendRequestAsync,
  acceptFriendRequestAsync,
  rejectFriendRequestAsync,
  unfriendAsync,
  blockWalletAsync,
  unblockWalletAsync,
  getFriendsListAsync,
  getInboundRequestsAsync,
  getOutboundRequestsAsync,
  getBlockedListAsync,
  getRelationshipStatusAsync,
  clearRelationshipsCacheForTests,
  RelationshipStoreUnavailableError,
} from '../../src/lib/data/relationshipStore.ts';
import {
  savePostAsync,
  clearPostsCacheForTests,
} from '../../src/lib/data/postsStore.ts';
import {
  saveProductAsync,
  clearProductsCacheForTests,
} from '../../src/lib/data/productsStore.ts';
import {
  saveOnboardedProfileAsync,
  resetProfileStore,
} from '../../src/lib/data/profileStore.ts';
import { createSession } from '../../src/lib/security/session.ts';
import { distributedStore } from '../../src/lib/security/distributedStore.ts';

// GENUINE ROUTE EXPORTS:
import { GET as postsGET } from '../../src/app/api/posts/route.ts';
import { GET as profileGET } from '../../src/app/api/profile/route.ts';
import { GET as profilesGET } from '../../src/app/api/profiles/route.ts';
import { GET as productsGET } from '../../src/app/api/products/route.ts';
import { GET as friendsGET } from '../../src/app/api/friends/route.ts';
import { POST as friendsRequestPOST } from '../../src/app/api/friends/request/route.ts';
import { POST as friendsAcceptPOST } from '../../src/app/api/friends/accept/route.ts';
import { POST as friendsRejectPOST } from '../../src/app/api/friends/reject/route.ts';
import { POST as friendsRemovePOST } from '../../src/app/api/friends/remove/route.ts';
import { POST as friendsBlockPOST } from '../../src/app/api/friends/block/route.ts';

let reqIpCounter = 1;
function createMockRequest(url, options = {}) {
  const parsedUrl = new URL(url, 'http://localhost:3000');
  const headers = new Headers(options.headers || {});
  if (!headers.has('x-forwarded-for')) {
    headers.set('x-forwarded-for', `10.1.0.${reqIpCounter++}`);
  }

  return {
    url: parsedUrl.toString(),
    method: options.method || 'GET',
    headers,
    json: async () => options.body || {},
  };
}

async function runTests() {
  process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret_at_least_32_chars_long_for_testing';
  console.log('================================================================');
  console.log('--- REPAIR #3R: RELATIONSHIP-SCOPED ACCESS SECURITY TESTS (30 CASES) ---');
  console.log('================================================================\n');

  clearRelationshipsCacheForTests();
  clearPostsCacheForTests();
  clearProductsCacheForTests();
  resetProfileStore(true);

  const aliceKp = Keypair.generate();
  const aliceWallet = aliceKp.publicKey.toBase58();
  const aliceToken = createSession(aliceWallet, 'user');

  const bobKp = Keypair.generate();
  const bobWallet = bobKp.publicKey.toBase58();
  const bobToken = createSession(bobWallet, 'user');

  const charlieKp = Keypair.generate();
  const charlieWallet = charlieKp.publicKey.toBase58();
  const charlieToken = createSession(charlieWallet, 'user');

  // Setup initial profiles
  await saveOnboardedProfileAsync(aliceWallet, { handle: 'alice_vault', name: 'Alice Vault', bio: 'Alice bio' });
  await saveOnboardedProfileAsync(bobWallet, { handle: 'bob_records', name: 'Bob Records', bio: 'Bob bio' });
  await saveOnboardedProfileAsync(charlieWallet, { handle: 'charlie_art', name: 'Charlie Art', bio: 'Charlie bio' });

  // [TEST 1] Unauthenticated relationship access rejected (401)
  console.log('[TEST 1] Unauthenticated relationship access rejected (401)');
  {
    const req = createMockRequest('http://localhost:3000/api/friends');
    const res = await friendsGET(req);
    assert.strictEqual(res.status, 401);
    console.log('  PASS: Unauthenticated GET /api/friends rejected with HTTP 401.\n');
  }

  // [TEST 2] Self friend request rejected (400)
  console.log('[TEST 2] Self friend request rejected (400)');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: { targetWallet: aliceWallet },
    });
    const res = await friendsRequestPOST(req);
    assert.strictEqual(res.status, 400);
    console.log('  PASS: Self friend request rejected with HTTP 400.\n');
  }

  // [TEST 3] A->B request does NOT establish friendship
  console.log('[TEST 3] A->B request does NOT establish friendship');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: { targetWallet: bobWallet },
    });
    const res = await friendsRequestPOST(req);
    assert.strictEqual(res.status, 201);

    const areFriends = await areFriendsAsync(aliceWallet, bobWallet);
    assert.strictEqual(areFriends, false, 'Pending request must not grant friendship');

    const statusA = await getRelationshipStatusAsync(aliceWallet, bobWallet);
    assert.strictEqual(statusA, 'pending_outbound');

    const statusB = await getRelationshipStatusAsync(bobWallet, aliceWallet);
    assert.strictEqual(statusB, 'pending_inbound');
    console.log('  PASS: A->B request creates pending state without establishing friendship.\n');
  }

  // [TEST 4] Only B can accept A->B (unrelated C cannot accept)
  console.log('[TEST 4] Unrelated C cannot accept A->B request');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/accept', {
      method: 'POST',
      headers: { Authorization: `Bearer ${charlieToken}` },
      body: { senderWallet: aliceWallet },
    });
    const res = await friendsAcceptPOST(req);
    assert.strictEqual(res.status, 404, 'C has no inbound request from A');
    console.log('  PASS: Unrelated party C rejected when attempting to accept A->B.\n');
  }

  // [TEST 5] Acceptance establishes reciprocal relationship
  console.log('[TEST 5] Acceptance establishes reciprocal relationship');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/accept', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}` },
      body: { senderWallet: aliceWallet },
    });
    const res = await friendsAcceptPOST(req);
    assert.strictEqual(res.status, 200);

    const areFriends = await areFriendsAsync(aliceWallet, bobWallet);
    assert.strictEqual(areFriends, true, 'Reciprocal friendship must be established');

    const friendsA = await getFriendsListAsync(aliceWallet);
    assert.ok(friendsA.includes(bobWallet), 'Alice friends must include Bob');

    const friendsB = await getFriendsListAsync(bobWallet);
    assert.ok(friendsB.includes(aliceWallet), 'Bob friends must include Alice');
    console.log('  PASS: Reciprocal friendship verified across both wallets.\n');
  }

  // [TEST 6] Duplicate acceptance cannot create corrupt state
  console.log('[TEST 6] Duplicate acceptance handled cleanly');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/accept', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}` },
      body: { senderWallet: aliceWallet },
    });
    const res = await friendsAcceptPOST(req);
    assert.strictEqual(res.status, 404, 'Pending request already consumed');
    console.log('  PASS: Duplicate acceptance fails closed safely.\n');
  }

  // [TEST 7] Forged client sender ignored
  console.log('[TEST 7] Forged client sender ignored (server derives identity from SIWS)');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${charlieToken}` },
      body: { senderWallet: aliceWallet, targetWallet: bobWallet },
    });
    const res = await friendsRequestPOST(req);
    // Charlie is authenticated, so Charlie requests Bob (not Alice requesting Bob)
    assert.strictEqual(res.status, 201);
    const inboundBob = await getInboundRequestsAsync(bobWallet);
    assert.ok(inboundBob.includes(charlieWallet), 'Inbound request is from Charlie, not Alice');
    console.log('  PASS: Server identity derived strictly from SIWS session.\n');
  }

  // [TEST 8] Reject removes pending relationship
  console.log('[TEST 8] Reject removes pending relationship');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/reject', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}` },
      body: { senderWallet: charlieWallet },
    });
    const res = await friendsRejectPOST(req);
    assert.strictEqual(res.status, 200);

    const inboundBob = await getInboundRequestsAsync(bobWallet);
    assert.strictEqual(inboundBob.includes(charlieWallet), false);
    console.log('  PASS: Reject cleared pending request without creating friendship.\n');
  }

  // [TEST 9] Unfriend by either side removes reciprocal relationship
  console.log('[TEST 9] Unfriend removes reciprocal relationship');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/remove', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: { targetWallet: bobWallet },
    });
    const res = await friendsRemovePOST(req);
    assert.strictEqual(res.status, 200);

    const areFriends = await areFriendsAsync(aliceWallet, bobWallet);
    assert.strictEqual(areFriends, false, 'Relationship must be removed');
    console.log('  PASS: Unfriend severed reciprocal relationship in both directions.\n');
  }

  // [TEST 10] Unilateral stale friend edge does NOT grant access
  console.log('[TEST 10] Unilateral stale friend edge fails private');
  {
    // Artificially inject unilateral set entry: A lists B, but B does not list A
    await distributedStore.sadd(`friends:${aliceWallet}`, bobWallet);
    await distributedStore.srem(`friends:${bobWallet}`, aliceWallet);

    const areFriends = await areFriendsAsync(aliceWallet, bobWallet);
    assert.strictEqual(areFriends, false, 'Unilateral edge must fail private');

    const friendsListA = await getFriendsListAsync(aliceWallet);
    assert.strictEqual(friendsListA.includes(bobWallet), false, 'Unilateral edge pruned from friends list');
    console.log('  PASS: Reciprocal invariant prevents unilateral spoofing.\n');
  }

  // Re-establish genuine friendship between Alice and Bob
  await sendFriendRequestAsync(aliceWallet, bobWallet);
  await acceptFriendRequestAsync(bobWallet, aliceWallet);
  assert.strictEqual(await areFriendsAsync(aliceWallet, bobWallet), true);

  // [TEST 11] Block overrides friendship and severs visibility
  console.log('[TEST 11] Block overrides friendship');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/block', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: { targetWallet: bobWallet, action: 'block' },
    });
    const res = await friendsBlockPOST(req);
    assert.strictEqual(res.status, 200);

    const areFriends = await areFriendsAsync(aliceWallet, bobWallet);
    assert.strictEqual(areFriends, false, 'Block must strictly override and sever friendship');
    console.log('  PASS: Block severed friendship and revoked visibility.\n');
  }

  // [TEST 12] Blocked user cannot re-establish friendship through request
  console.log('[TEST 12] Blocked user cannot re-establish friendship');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${bobToken}` },
      body: { targetWallet: aliceWallet },
    });
    const res = await friendsRequestPOST(req);
    assert.strictEqual(res.status, 403, 'Blocked target cannot receive friend request');
    console.log('  PASS: Block prevents request re-establishment.\n');
  }

  // Unblock and re-establish Alice <-> Bob friendship for content tests
  await unblockWalletAsync(aliceWallet, bobWallet);
  await sendFriendRequestAsync(aliceWallet, bobWallet);
  await acceptFriendRequestAsync(bobWallet, aliceWallet);
  assert.strictEqual(await areFriendsAsync(aliceWallet, bobWallet), true);

  // [TEST 13] Profile Privacy: Self profile succeeds (200)
  console.log('[TEST 13] Profile Privacy: Self profile succeeds');
  {
    const req = createMockRequest(`http://localhost:3000/api/profile?wallet=${aliceWallet}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await profileGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.profile.handle, 'alice_vault');
    console.log('  PASS: Self profile query succeeds.\n');
  }

  // [TEST 14] Profile Privacy: Friend profile succeeds (200)
  console.log('[TEST 14] Profile Privacy: Friend profile succeeds');
  {
    const req = createMockRequest(`http://localhost:3000/api/profile?wallet=${bobWallet}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await profileGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.profile.handle, 'bob_records');
    console.log('  PASS: Friend profile query succeeds across relationship boundary.\n');
  }

  // [TEST 15] Profile Privacy: Unrelated profile returns generic 404 (Enumeration Resistant)
  console.log('[TEST 15] Profile Privacy: Unrelated profile returns generic 404');
  {
    const req = createMockRequest(`http://localhost:3000/api/profile?wallet=${charlieWallet}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await profileGET(req);
    assert.strictEqual(res.status, 404, 'Unrelated member must return generic 404');
    const data = await res.json();
    assert.strictEqual(data.error, 'Profile not found');
    console.log('  PASS: Unrelated member profile returns generic 404 without metadata leak.\n');
  }

  // [TEST 16] Profile Directory contains only authorized relationships
  console.log('[TEST 16] Profile Directory /api/profiles contains only self and friends');
  {
    const req = createMockRequest('http://localhost:3000/api/profiles', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await profilesGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const handles = data.profiles.map((p) => p.handle);
    assert.ok(handles.includes('alice_vault'), 'Includes self');
    assert.ok(handles.includes('bob_records'), 'Includes friend Bob');
    assert.strictEqual(handles.includes('charlie_art'), false, 'Excludes unrelated Charlie');
    console.log('  PASS: Profile directory strictly bounded by friend graph.\n');
  }

  // Setup sample posts
  const alicePost = {
    id: 'post-alice-1',
    author: { id: `user-${aliceWallet}`, handle: 'alice_vault', name: 'Alice', avatar: 'https://example.com/a.png', walletAddress: aliceWallet, followersCount: 0, followingCount: 0, isCreator: true, verified: true, ageVerified: false },
    content: 'Alice private thoughts for friends',
    type: 'text',
    likes: 0,
    tipsCount: 0,
    totalTipsCook: 0,
    reposts: 0,
    commentsCount: 0,
    tags: ['Safe'],
    createdAt: new Date(Date.now() - 1000).toISOString(),
    isShielded: false,
    shieldCategory: 'safe',
  };
  const bobPost = {
    id: 'post-bob-1',
    author: { id: `user-${bobWallet}`, handle: 'bob_records', name: 'Bob', avatar: 'https://example.com/b.png', walletAddress: bobWallet, followersCount: 0, followingCount: 0, isCreator: true, verified: true, ageVerified: false },
    content: 'Bob new music track for friends',
    type: 'text',
    likes: 0,
    tipsCount: 0,
    totalTipsCook: 0,
    reposts: 0,
    commentsCount: 0,
    tags: ['Music'],
    createdAt: new Date().toISOString(),
    isShielded: false,
    shieldCategory: 'safe',
  };
  const charliePost = {
    id: 'post-charlie-1',
    author: { id: `user-${charlieWallet}`, handle: 'charlie_art', name: 'Charlie', avatar: 'https://example.com/c.png', walletAddress: charlieWallet, followersCount: 0, followingCount: 0, isCreator: true, verified: true, ageVerified: false },
    content: 'Charlie unrelated secret artwork',
    type: 'text',
    likes: 0,
    tipsCount: 0,
    totalTipsCook: 0,
    reposts: 0,
    commentsCount: 0,
    tags: ['Art'],
    createdAt: new Date().toISOString(),
    isShielded: false,
    shieldCategory: 'safe',
  };
  const bobAdultPost = {
    id: 'post-bob-adult',
    author: { id: `user-${bobWallet}`, handle: 'bob_records', name: 'Bob', avatar: 'https://example.com/b.png', walletAddress: bobWallet, followersCount: 0, followingCount: 0, isCreator: true, verified: true, ageVerified: true },
    content: 'Bob restricted 18+ adult post',
    type: 'text',
    likes: 0,
    tipsCount: 0,
    totalTipsCook: 0,
    reposts: 0,
    commentsCount: 0,
    tags: ['Adult'],
    createdAt: new Date().toISOString(),
    isShielded: true,
    shieldCategory: 'age_restricted',
  };

  await savePostAsync(alicePost);
  await savePostAsync(bobPost);
  await savePostAsync(charliePost);
  await savePostAsync(bobAdultPost);

  // [TEST 17] Normal Feed includes self and friend, strictly excludes unrelated
  console.log('[TEST 17] Feed Authorization: Includes self + friend, excludes unrelated');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await postsGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const postIds = data.posts.map((p) => p.id);
    assert.ok(postIds.includes('post-alice-1'), 'Feed includes self post');
    assert.ok(postIds.includes('post-bob-1'), 'Feed includes friend Bob post');
    assert.strictEqual(postIds.includes('post-charlie-1'), false, 'Feed strictly excludes unrelated Charlie post');
    console.log('  PASS: Feed strictly relationship-scoped on server.\n');
  }

  // [TEST 18] Unrelated author filter returns empty list (Enumeration Resistant)
  console.log('[TEST 18] Feed Author Filter: Unrelated author query returns empty list');
  {
    const req = createMockRequest(`http://localhost:3000/api/posts?author=${charlieWallet}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await postsGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.posts.length, 0);
    console.log('  PASS: Direct author query for unrelated member yields 0 posts.\n');
  }

  // [TEST 19] Direct Post lookup by ID: Unrelated post returns 404
  console.log('[TEST 19] Direct Post Lookup by ID: Unrelated post returns 404');
  {
    const req = createMockRequest('http://localhost:3000/api/posts?id=post-charlie-1', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await postsGET(req);
    assert.strictEqual(res.status, 404, 'Direct post ID knowledge does not bypass relationship boundary');
    console.log('  PASS: Direct post lookup fails closed with HTTP 404.\n');
  }

  // Setup sample products
  await saveProductAsync(aliceWallet, { title: 'Alice Sample Pack', priceCook: 50, category: 'music_stem' });
  await saveProductAsync(bobWallet, { title: 'Bob Guitar Loops', priceCook: 100, category: 'music_stem' });
  await saveProductAsync(charlieWallet, { title: 'Charlie Secret 3D Asset', priceCook: 200, category: 'digital_art' });

  // [TEST 20] Storefront Products: Includes self + friend, excludes unrelated
  console.log('[TEST 20] Storefront Products: Includes self + friend, excludes unrelated');
  {
    const req = createMockRequest('http://localhost:3000/api/products', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await productsGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const titles = data.products.map((p) => p.title);
    assert.ok(titles.includes('Alice Sample Pack'), 'Includes self product');
    assert.ok(titles.includes('Bob Guitar Loops'), 'Includes friend Bob product');
    assert.strictEqual(titles.includes('Charlie Secret 3D Asset'), false, 'Excludes unrelated Charlie product');
    console.log('  PASS: Storefront products relationship-scoped on server.\n');
  }

  // [TEST 21] Unfriend immediately invalidates subsequent feed visibility
  console.log('[TEST 21] Unfriend immediately invalidates subsequent feed visibility');
  {
    await unfriendAsync(aliceWallet, bobWallet);
    assert.strictEqual(await areFriendsAsync(aliceWallet, bobWallet), false);

    const req = createMockRequest('http://localhost:3000/api/posts', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await postsGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const postIds = data.posts.map((p) => p.id);
    assert.ok(postIds.includes('post-alice-1'), 'Still includes self');
    assert.strictEqual(postIds.includes('post-bob-1'), false, 'Former friend Bob post immediately removed');
    console.log('  PASS: Subsequent feed query reflects immediate relationship revocation.\n');
  }

  // Re-friend Alice and Bob
  await sendFriendRequestAsync(aliceWallet, bobWallet);
  await acceptFriendRequestAsync(bobWallet, aliceWallet);

  // [TEST 22] Production Relationship Store Unconfigured Fail-Closed (503)
  console.log('[TEST 22] Production Relationship Store Unconfigured Fail-Closed (503)');
  {
    const origEnv = process.env.NODE_ENV;
    const origIsConfigured = distributedStore.isConfigured;

    try {
      process.env.NODE_ENV = 'production';
      distributedStore.isConfigured = () => false;

      const req = createMockRequest('http://localhost:3000/api/friends', {
        headers: { Authorization: `Bearer ${aliceToken}` },
      });
      const res = await friendsGET(req);
      assert.strictEqual(res.status, 503);
    } finally {
      process.env.NODE_ENV = origEnv;
      distributedStore.isConfigured = origIsConfigured;
    }
    console.log('  PASS: Unconfigured production store returns HTTP 503 fail-closed.\n');
  }

  // [TEST 23] Sensitive post remains excluded from ordinary friend feed
  console.log('[TEST 23] Sensitive post remains excluded from ordinary friend feed');
  {
    // Alice is friend of Bob, but Alice is NOT adult authorized
    const req = createMockRequest('http://localhost:3000/api/posts', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await postsGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const postIds = data.posts.map((p) => p.id);
    assert.strictEqual(postIds.includes('post-bob-adult'), false, 'Adult post excluded from ordinary feed');
    console.log('  PASS: Friendship never bypasses adult protection.\n');
  }

  // [TEST 24] Partial friend request write compensation
  console.log('[TEST 24] Partial friend request write compensation on step 2 failure');
  {
    const testA = Keypair.generate().publicKey.toBase58();
    const testB = Keypair.generate().publicKey.toBase58();

    const origSadd = distributedStore.sadd;
    let callCount = 0;
    try {
      distributedStore.sadd = async (key, member) => {
        callCount++;
        if (callCount === 2) return false; // Fail step 2
        return origSadd.call(distributedStore, key, member);
      };

      const result = await sendFriendRequestAsync(testA, testB);
      assert.strictEqual(result.success, false);
      assert.strictEqual(result.status, 500);

      const outbound = await getOutboundRequestsAsync(testA);
      assert.strictEqual(outbound.includes(testB), false, 'Step 1 must be compensated');
    } finally {
      distributedStore.sadd = origSadd;
    }
    console.log('  PASS: Partial write failure compensated cleanly.\n');
  }

  // [TEST 25] Partial friendship establishment failure fails closed
  console.log('[TEST 25] Partial friendship establishment fails closed');
  {
    const testA = Keypair.generate().publicKey.toBase58();
    const testB = Keypair.generate().publicKey.toBase58();
    await sendFriendRequestAsync(testA, testB);

    const origSadd = distributedStore.sadd;
    let callCount = 0;
    try {
      distributedStore.sadd = async (key, member) => {
        callCount++;
        if (callCount === 2) return false; // Fail step 2
        return origSadd.call(distributedStore, key, member);
      };

      const result = await acceptFriendRequestAsync(testB, testA);
      assert.strictEqual(result.success, false);

      const areFriends = await areFriendsAsync(testA, testB);
      assert.strictEqual(areFriends, false, 'Partial friendship must fail private');
    } finally {
      distributedStore.sadd = origSadd;
    }
    console.log('  PASS: Partial acceptance rollback fails private.\n');
  }

  // [TEST 26] Client-local following state cannot grant server access
  console.log('[TEST 26] Client-local following state cannot grant server access');
  {
    // Forge a request from Charlie claiming to follow Alice via query/headers
    const req = createMockRequest(`http://localhost:3000/api/posts?author=${aliceWallet}`, {
      headers: {
        Authorization: `Bearer ${charlieToken}`,
        'x-client-following': aliceWallet,
      },
    });
    const res = await postsGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.posts.length, 0, 'Server must enforce relationship authority');
    console.log('  PASS: Client headers cannot spoof relationship authority.\n');
  }

  // [TEST 27] Direct author query for blocked user returns empty list
  console.log('[TEST 27] Direct author query for blocked user returns empty list');
  {
    await blockWalletAsync(aliceWallet, bobWallet);
    const req = createMockRequest(`http://localhost:3000/api/posts?author=${bobWallet}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await postsGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.posts.length, 0);
    await unblockWalletAsync(aliceWallet, bobWallet);
    console.log('  PASS: Blocked author returns empty feed.\n');
  }

  // [TEST 28] Direct product query by non-friend creator returns empty list
  console.log('[TEST 28] Direct product query by non-friend creator returns empty list');
  {
    const req = createMockRequest(`http://localhost:3000/api/products?creator=${charlieWallet}`, {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await productsGET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.products.length, 0);
    console.log('  PASS: Non-friend creator products hidden from unauthorized query.\n');
  }

  // [TEST 29] Unauthenticated POST /api/friends/request returns 401
  console.log('[TEST 29] Unauthenticated POST /api/friends/request returns 401');
  {
    const req = createMockRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      body: { targetWallet: bobWallet },
    });
    const res = await friendsRequestPOST(req);
    assert.strictEqual(res.status, 401);
    console.log('  PASS: Unauthenticated friend request dispatch rejected with HTTP 401.\n');
  }

  // [TEST 30] Full lifecycle roundtrip: Request -> Inbound -> Accept -> Reciprocal -> Unfriend
  console.log('[TEST 30] Full Lifecycle Roundtrip');
  {
    const user1Kp = Keypair.generate();
    const user1Wallet = user1Kp.publicKey.toBase58();
    const user1Token = createSession(user1Wallet, 'user');

    const user2Kp = Keypair.generate();
    const user2Wallet = user2Kp.publicKey.toBase58();
    const user2Token = createSession(user2Wallet, 'user');

    // Step 1: Request
    const req1 = createMockRequest('http://localhost:3000/api/friends/request', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { targetWallet: user2Wallet },
    });
    const res1 = await friendsRequestPOST(req1);
    assert.strictEqual(res1.status, 201);

    // Step 2: Inbound query by user2
    const req2 = createMockRequest('http://localhost:3000/api/friends', {
      headers: { Authorization: `Bearer ${user2Token}` },
    });
    const res2 = await friendsGET(req2);
    const data2 = await res2.json();
    assert.ok(data2.inboundRequests.includes(user1Wallet));

    // Step 3: Accept
    const req3 = createMockRequest('http://localhost:3000/api/friends/accept', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user2Token}` },
      body: { senderWallet: user1Wallet },
    });
    const res3 = await friendsAcceptPOST(req3);
    assert.strictEqual(res3.status, 200);

    // Step 4: Reciprocal check
    assert.strictEqual(await areFriendsAsync(user1Wallet, user2Wallet), true);

    // Step 5: Unfriend
    const req4 = createMockRequest('http://localhost:3000/api/friends/remove', {
      method: 'POST',
      headers: { Authorization: `Bearer ${user1Token}` },
      body: { targetWallet: user2Wallet },
    });
    const res4 = await friendsRemovePOST(req4);
    assert.strictEqual(res4.status, 200);
    assert.strictEqual(await areFriendsAsync(user1Wallet, user2Wallet), false);
    console.log('  PASS: Complete relationship lifecycle verified end-to-end.\n');
  }

  console.log('================================================================');
  console.log('--- ALL 30 REPAIR #3R RELATIONSHIP SECURITY TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal relationship test error:', err);
  process.exit(1);
});
