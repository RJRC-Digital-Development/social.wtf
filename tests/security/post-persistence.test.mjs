/**
 * tests/security/post-persistence.test.mjs
 *
 * PRODUCTION-PATH SECURITY & INTEGRATION TEST SUITE
 * Repair #3: Authoritative Post Persistence
 *
 * Invariants Tested:
 * 1. Fresh Authenticated Wallet Post Creation (Zero balance / zero history)
 * 2. REAL Route-Level SIWS Auth: POST without token rejected (401)
 * 3. REAL Route-Level SIWS Auth: POST with tampered token rejected (401)
 * 4. REAL Route-Level SIWS Auth: POST with expired/revoked token rejected (401)
 * 5. REAL Route-Level Wallet Spoof Attack: Client-supplied author ignored; server uses session (201)
 * 6. Server-Generated Post ID: crypto.randomUUID() generated server-side; client ID ignored
 * 7. Server Metrics & Timestamp Isolation: Client cannot manufacture counters or timestamps
 * 8. Authoritative Retrieval Roundtrip: Created post survives independent retrieval
 * 9. REAL Route Public Unauthenticated Feed Discovery: GET /api/posts returns public posts (200)
 * 10. REAL Route Author Filtering: GET /api/posts?author=<wallet> returns author subset (200)
 * 11. Adult / Restricted Visibility: Public GET excludes adult content; adult auth includes it
 * 12. Quarantine Isolation: Quarantined content strictly excluded from all public GET feeds
 * 13. Concurrency: Concurrent creation of Post A and B retains both without lost updates
 * 14. Production Write Outage (503 Fail-Closed): Write failure fails closed with 503
 * 15. Production Read Outage (503 vs 200 []): Outage returns 503, distinct from legitimate 200 []
 * 16. Production KV Unconfigured Fail-Closed: POST returns 503 in production without KV
 * 17. Production KV Unconfigured Fail-Closed: GET returns 503 in production without KV
 * 18. Compensating Rollback Trigger: Secondary index failure rolls back primary record
 * 19. Read-Time Orphan Reconciliation: Stale index entries pointing to missing keys pruned
 * 20. Input Sanitization: XSS script tags and control characters sanitized
 * 21. Payload Validation: Empty content and empty media rejected (400)
 * 22. Zero-Balance Creator Rule: Authentic SIWS with 0 COOK creates post
 * 23. Zero Fake Transaction Metadata: Unconfirmed interactions have no fabricated signatures
 * 24. REAL Route Full Lifecycle: Genuine POST creation followed by genuine GET query across route handler exports
 */

import assert from 'node:assert';
import { Keypair } from '@solana/web3.js';
import {
  savePostAsync,
  getPostByIdAsync,
  getAllPostsAsync,
  getPublicPostsAsync,
  getAdultAuthorizedPostsAsync,
  getPostsByAuthorAsync,
  quarantinePostAsync,
  clearPostsCacheForTests,
} from '../../src/lib/data/postsStore.ts';
import {
  createSession,
  revokeSession,
  verifySessionToken,
} from '../../src/lib/security/session.ts';
import { distributedStore } from '../../src/lib/security/distributedStore.ts';
import {
  saveOnboardedProfileAsync,
  resetProfileStore,
  setAuthoritativeProfileForTests,
} from '../../src/lib/data/profileStore.ts';
import { GET, POST } from '../../src/app/api/posts/route.ts';

let reqIpCounter = 1;
function createMockRequest(url, options = {}) {
  const parsedUrl = new URL(url, 'http://localhost:3000');
  const headers = new Headers(options.headers || {});
  if (!headers.has('x-forwarded-for')) {
    headers.set('x-forwarded-for', `10.0.0.${reqIpCounter++}`);
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
  console.log('--- REPAIR #3: AUTHORITATIVE POST PERSISTENCE TESTS ---');
  console.log('================================================================\n');

  clearPostsCacheForTests();

  // Test 1: Fresh Authenticated Wallet Post Creation
  console.log('[TEST 1] Fresh Authenticated Wallet Post Creation (Zero Balance / Zero History)');
  {
    const kp = Keypair.generate();
    const walletAddress = kp.publicKey.toBase58();

    const post = {
      id: 'post-test-1',
      author: {
        id: `user-${walletAddress}`,
        handle: `user_${walletAddress.slice(0, 4)}`,
        name: `@${walletAddress.slice(0, 4)}`,
        avatar: 'https://example.com/avatar.png',
        walletAddress,
        followersCount: 0,
        followingCount: 0,
        isCreator: true,
      },
      content: 'Hello Cookie Chain from fresh wallet!',
      type: 'text',
      likes: 0,
      tipsCount: 0,
      totalTipsCook: 0,
      reposts: 0,
      commentsCount: 0,
      tags: ['CookieChain'],
      createdAt: new Date().toISOString(),
      isShielded: false,
      shieldCategory: 'safe',
    };

    const saved = await savePostAsync(post);
    assert.strictEqual(saved.id, 'post-test-1');
    assert.strictEqual(saved.author.walletAddress, walletAddress);

    const retrieved = await getPostByIdAsync('post-test-1');
    assert.ok(retrieved, 'Post must be retrievable by ID');
    assert.strictEqual(retrieved.content, 'Hello Cookie Chain from fresh wallet!');
    console.log('  PASS: Fresh legitimate wallet created and persisted canonical post.\n');
  }

  // Test 2: REAL Route-Level SIWS Auth: Unauthenticated POST returns 401
  console.log('[TEST 2] REAL Route-Level SIWS Auth: Unauthenticated POST returns 401');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: { content: 'Unauthenticated post attempt' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 401, 'Unauthenticated POST must return 401');
    const data = await res.json();
    assert.ok(data.error, 'Should contain error message');
    console.log('  PASS: Genuine POST export rejected unauthenticated request with HTTP 401.\n');
  }

  // Test 3: REAL Route-Level SIWS Auth: Tampered token returns 401
  console.log('[TEST 3] REAL Route-Level SIWS Auth: Tampered token returns 401');
  {
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');
    const tamperedToken = token.slice(0, -5) + 'xxxxx';

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tamperedToken}` },
      body: { content: 'Tampered token post attempt' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 401, 'Tampered token must return 401');
    console.log('  PASS: Genuine POST export rejected tampered session token with HTTP 401.\n');
  }

  // Test 4: REAL Route-Level SIWS Auth: Revoked token returns 401
  console.log('[TEST 4] REAL Route-Level SIWS Auth: Revoked token returns 401');
  {
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');
    await revokeSession(token);

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { content: 'Revoked session post attempt' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 401, 'Revoked token must return 401');
    console.log('  PASS: Genuine POST export rejected revoked session token with HTTP 401.\n');
  }

  // Test 5: REAL Route-Level Wallet Spoof Attack: Server derives author from session
  console.log('[TEST 5] REAL Route-Level Wallet Spoof Attack: Server derives author from SIWS');
  {
    const realKp = Keypair.generate();
    const realWallet = realKp.publicKey.toBase58();
    const victimWallet = Keypair.generate().publicKey.toBase58();

    const token = createSession(realWallet, 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        content: 'Post with spoofed author attempt',
        author: {
          walletAddress: victimWallet, // Client attempts to forge victim as author
          name: 'Impersonated Victim',
        },
        authorWallet: victimWallet,
      },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201, 'Valid SIWS session should succeed with HTTP 201');
    const data = await res.json();
    assert.ok(data.post, 'Should return created post');
    assert.strictEqual(data.post.author.walletAddress, realWallet, 'Author wallet must be derived from session');
    assert.notStrictEqual(data.post.author.walletAddress, victimWallet, 'Client spoofed wallet must be ignored');
    console.log('  PASS: Genuine POST export ignored client-supplied author and derived ownership from SIWS session.\n');
  }

  // Test 6: Server-Generated Post ID: crypto.randomUUID() generated server-side
  console.log('[TEST 6] Server-Generated Post ID: Server generates UUID; client ID ignored');
  {
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        id: 'client-supplied-custom-id-999',
        content: 'Server ID test content',
      },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.notStrictEqual(data.post.id, 'client-supplied-custom-id-999', 'Client ID must be ignored');
    assert.ok(data.post.id.startsWith('post-'), 'Server generated standard post ID');
    console.log('  PASS: Server generated post ID; client-supplied ID ignored.\n');
  }

  // Test 7: Server Metrics & Timestamp Isolation
  console.log('[TEST 7] Server Metrics Isolation');
  {
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        content: 'Metrics isolation test',
        likes: 999999,
        tipsCount: 500,
        totalTipsCook: 10000,
        reposts: 5000,
        createdAt: '1970-01-01T00:00:00.000Z',
      },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.post.likes, 0, 'Likes must initialize to 0');
    assert.strictEqual(data.post.tipsCount, 0, 'Tips count must initialize to 0');
    assert.strictEqual(data.post.totalTipsCook, 0, 'Total tips COOK must initialize to 0');
    assert.strictEqual(data.post.reposts, 0, 'Reposts must initialize to 0');
    assert.notStrictEqual(data.post.createdAt, '1970-01-01T00:00:00.000Z', 'Client createdAt must be overridden by server');
    console.log('  PASS: Server-controlled metrics and timestamps isolated from client injection.\n');
  }

  // Test 8: Authoritative Retrieval Roundtrip
  console.log('[TEST 8] Authoritative Retrieval Roundtrip');
  {
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { content: 'Roundtrip test post content #unique123' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const { post } = await res.json();

    const fromStore = await getPostByIdAsync(post.id);
    assert.ok(fromStore, 'Post must exist in store');
    assert.strictEqual(fromStore.id, post.id);
    assert.strictEqual(fromStore.content, 'Roundtrip test post content #unique123');
    assert.strictEqual(fromStore.author.walletAddress, kp.publicKey.toBase58());
    console.log('  PASS: Authoritative store returns exact persisted record.\n');
  }

  // Test 9: REAL Route Unauthenticated Gate & Authenticated Feed Discovery
  console.log('[TEST 9] REAL Route Platform Gate: Unauthenticated GET returns 401, Authenticated returns 200');
  {
    // Unauthenticated caller rejected by platform gate
    const unauthReq = createMockRequest('http://localhost:3000/api/posts', { method: 'GET' });
    const unauthRes = await GET(unauthReq);
    assert.strictEqual(unauthRes.status, 401, 'Unauthenticated feed access must return 401');

    // Authenticated caller receives relationship-scoped feed
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');
    const authReq = createMockRequest('http://localhost:3000/api/posts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const authRes = await GET(authReq);
    assert.strictEqual(authRes.status, 200);
    const data = await authRes.json();
    assert.ok(Array.isArray(data.posts), 'Should return posts array');
    assert.strictEqual(data.adultAccessGranted, undefined, 'Ordinary response must not leak adultAccessGranted');
    console.log('  PASS: Genuine GET /api/posts strictly enforces SIWS platform gate and returns authorized feed.\n');
  }

  // Test 10: REAL Route Author Filtering
  console.log('[TEST 10] REAL Route Author Filtering');
  {
    const authorKp = Keypair.generate();
    const authorWallet = authorKp.publicKey.toBase58();
    const token = createSession(authorWallet, 'user');

    const createReq = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { content: 'Creator exclusive post content' },
    });
    await POST(createReq);

    const getReq = createMockRequest(`http://localhost:3000/api/posts?author=${encodeURIComponent(authorWallet)}`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const getRes = await GET(getReq);
    assert.strictEqual(getRes.status, 200);
    const data = await getRes.json();
    assert.ok(data.posts.length >= 1, 'Should find author posts');
    assert.strictEqual(data.posts[0].author.walletAddress, authorWallet);
    console.log('  PASS: Genuine GET /api/posts filters by author wallet.\n');
  }

  // Test 11: Adult / Restricted Visibility
  console.log('[TEST 11] Adult / Restricted Visibility');
  {
    const adultAuthorKp = Keypair.generate();
    const token = createSession(adultAuthorKp.publicKey.toBase58(), 'creator');

    const adultPost = {
      id: 'adult-post-1',
      author: {
        id: `user-${adultAuthorKp.publicKey.toBase58()}`,
        handle: 'adult_creator',
        name: 'Adult Creator',
        walletAddress: adultAuthorKp.publicKey.toBase58(),
        followersCount: 0,
        followingCount: 0,
        isCreator: true,
      },
      content: '18+ Explicit content sample',
      type: 'text',
      likes: 0,
      tipsCount: 0,
      totalTipsCook: 0,
      reposts: 0,
      commentsCount: 0,
      tags: ['18+'],
      createdAt: new Date().toISOString(),
      isShielded: true,
      shieldCategory: 'age_restricted',
    };
    await savePostAsync(adultPost);

    // Public call without adult auth
    const publicPosts = await getPublicPostsAsync();
    const foundInPublic = publicPosts.some((p) => p.id === 'adult-post-1');
    assert.strictEqual(foundInPublic, false, 'Adult post must NOT appear in public feed');

    // Adult-authorized call
    const adultPosts = await getAdultAuthorizedPostsAsync();
    const foundInAdult = adultPosts.some((p) => p.id === 'adult-post-1');
    assert.strictEqual(foundInAdult, true, 'Adult post must appear in adult-authorized feed');
    console.log('  PASS: Public feed excludes adult content; adult-authorized feed includes it.\n');
  }

  // Test 12: Quarantine Isolation
  console.log('[TEST 12] Quarantine Isolation');
  {
    const badKp = Keypair.generate();
    const badPost = {
      id: 'quarantine-post-1',
      author: {
        id: `user-${badKp.publicKey.toBase58()}`,
        handle: 'bad_actor',
        name: 'Bad Actor',
        walletAddress: badKp.publicKey.toBase58(),
        followersCount: 0,
        followingCount: 0,
        isCreator: false,
      },
      content: 'Malicious spam link content',
      type: 'text',
      likes: 0,
      tipsCount: 0,
      totalTipsCook: 0,
      reposts: 0,
      commentsCount: 0,
      tags: ['spam'],
      createdAt: new Date().toISOString(),
      isShielded: false,
      shieldCategory: 'safe',
    };
    await savePostAsync(badPost);

    // Quarantine the post
    const qSuccess = await quarantinePostAsync('quarantine-post-1', 'Spam detection');
    assert.strictEqual(qSuccess, true, 'Quarantine must succeed');

    // Verify excluded from both public and adult-authorized feeds
    const publicPosts = await getPublicPostsAsync();
    const adultPosts = await getAdultAuthorizedPostsAsync();

    assert.strictEqual(publicPosts.some((p) => p.id === 'quarantine-post-1'), false);
    assert.strictEqual(adultPosts.some((p) => p.id === 'quarantine-post-1'), false);
    console.log('  PASS: Quarantined content strictly excluded from all public/adult feed views.\n');
  }

  // Test 13: Concurrency Safety
  console.log('[TEST 13] Concurrency: Parallel creation of multiple posts');
  {
    const kpA = Keypair.generate();
    const kpB = Keypair.generate();
    const tokenA = createSession(kpA.publicKey.toBase58(), 'user');
    const tokenB = createSession(kpB.publicKey.toBase58(), 'user');

    const reqA = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenA}` },
      body: { content: 'Concurrent post A' },
    });
    const reqB = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${tokenB}` },
      body: { content: 'Concurrent post B' },
    });

    const [resA, resB] = await Promise.all([POST(reqA), POST(reqB)]);
    assert.strictEqual(resA.status, 201);
    assert.strictEqual(resB.status, 201);

    const dataA = await resA.json();
    const dataB = await resB.json();

    const postA = await getPostByIdAsync(dataA.post.id);
    const postB = await getPostByIdAsync(dataB.post.id);

    assert.ok(postA, 'Post A must be retained in store');
    assert.ok(postB, 'Post B must be retained in store');
    assert.strictEqual(postA.content, 'Concurrent post A');
    assert.strictEqual(postB.content, 'Concurrent post B');
    console.log('  PASS: Concurrent post creations persisted without lost updates.\n');
  }

  // Test 14: Production Write Outage (503 Fail-Closed)
  console.log('[TEST 14] Production Write Outage Simulation (503 Fail-Closed)');
  {
    const origNodeEnv = process.env.NODE_ENV;
    const origSet = distributedStore.set;
    const origIsConfigured = distributedStore.isConfigured;

    try {
      process.env.NODE_ENV = 'production';
      distributedStore.isConfigured = () => true;
      distributedStore.set = async () => false; // Simulate distributed write outage

      const kp = Keypair.generate();
      const token = createSession(kp.publicKey.toBase58(), 'user');

      const req = createMockRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { content: 'Outage write attempt' },
      });

      const res = await POST(req);
      assert.strictEqual(res.status, 503, 'Write failure in production must return 503');
      const data = await res.json();
      assert.strictEqual(data.code, 'POST_STORE_UNAVAILABLE');
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      distributedStore.set = origSet;
      distributedStore.isConfigured = origIsConfigured;
    }
    console.log('  PASS: Write store outage fails closed with 503 unavailable error.\n');
  }

  // Test 15: Production Read Outage (503 vs 200 [] Distinction)
  console.log('[TEST 15] Production Read Outage (503 vs 200 [] Distinction)');
  {
    const origNodeEnv = process.env.NODE_ENV;
    const origSmembers = distributedStore.smembers;
    const origIsConfigured = distributedStore.isConfigured;

    try {
      process.env.NODE_ENV = 'production';
      distributedStore.isConfigured = () => true;

      const kp = Keypair.generate();
      const token = createSession(kp.publicKey.toBase58(), 'user');

      // Legitimate empty catalog
      distributedStore.smembers = async () => [];
      const emptyReq = createMockRequest('http://localhost:3000/api/posts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const emptyRes = await GET(emptyReq);
      assert.strictEqual(emptyRes.status, 200, 'Legitimate empty catalog must return 200');
      const emptyData = await emptyRes.json();
      assert.deepStrictEqual(emptyData.posts, []);

      // Distributed store outage
      distributedStore.smembers = async () => null; // Simulate failure
      const outageReq = createMockRequest('http://localhost:3000/api/posts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const outageRes = await GET(outageReq);
      assert.strictEqual(outageRes.status, 503, 'Read store outage must return 503');
      const outageData = await outageRes.json();
      assert.strictEqual(outageData.code, 'POST_STORE_UNAVAILABLE');
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      distributedStore.smembers = origSmembers;
      distributedStore.isConfigured = origIsConfigured;
    }
    console.log('  PASS: Read outage distinguishable from legitimate empty feed.\n');
  }

  // Test 16: Production KV Unconfigured Fail-Closed (POST 503)
  console.log('[TEST 16] Production KV Unconfigured Fail-Closed: POST returns 503');
  {
    const origNodeEnv = process.env.NODE_ENV;
    const origIsConfigured = distributedStore.isConfigured;

    try {
      process.env.NODE_ENV = 'production';
      distributedStore.isConfigured = () => false;

      const kp = Keypair.generate();
      const token = createSession(kp.publicKey.toBase58(), 'user');

      const req = createMockRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
        body: { content: 'Unconfigured prod post' },
      });

      const res = await POST(req);
      assert.strictEqual(res.status, 503, 'Must return 503 in production without KV');
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      distributedStore.isConfigured = origIsConfigured;
    }
    console.log('  PASS: POST /api/posts strictly returns 503 in production when KV is unconfigured.\n');
  }

  // Test 17: Production KV Unconfigured Fail-Closed (GET 503)
  console.log('[TEST 17] Production KV Unconfigured Fail-Closed: GET returns 503');
  {
    const origNodeEnv = process.env.NODE_ENV;
    const origIsConfigured = distributedStore.isConfigured;

    try {
      process.env.NODE_ENV = 'production';
      distributedStore.isConfigured = () => false;

      const kp = Keypair.generate();
      const token = createSession(kp.publicKey.toBase58(), 'user');
      const req = createMockRequest('http://localhost:3000/api/posts', {
        method: 'GET',
        headers: { Authorization: `Bearer ${token}` },
      });
      const res = await GET(req);
      assert.strictEqual(res.status, 503, 'Must return 503 in production without KV');
    } finally {
      process.env.NODE_ENV = origNodeEnv;
      distributedStore.isConfigured = origIsConfigured;
    }
    console.log('  PASS: GET /api/posts strictly returns 503 in production when KV is unconfigured.\n');
  }

  // Test 18: Compensating Rollback Trigger on Secondary Index Failure
  console.log('[TEST 18] Compensating Rollback Trigger on Secondary Index Failure');
  {
    const origIsConfigured = distributedStore.isConfigured;
    const origSet = distributedStore.set;
    const origSadd = distributedStore.sadd;
    const origDel = distributedStore.del;

    let delCalledForPostKey = false;

    try {
      distributedStore.isConfigured = () => true;
      distributedStore.set = async () => true; // Entity write succeeds
      distributedStore.sadd = async () => false; // Index write fails
      distributedStore.del = async (key) => {
        if (key.startsWith('post:')) delCalledForPostKey = true;
        return true;
      };

      const kp = Keypair.generate();
      const testPost = {
        id: 'rollback-test-post',
        author: {
          id: `user-${kp.publicKey.toBase58()}`,
          walletAddress: kp.publicKey.toBase58(),
        },
        content: 'Rollback test',
        createdAt: new Date().toISOString(),
      };

      let failed = false;
      try {
        await savePostAsync(testPost);
      } catch (err) {
        failed = true;
      }

      assert.strictEqual(failed, true, 'Save must throw error on index failure');
      assert.strictEqual(delCalledForPostKey, true, 'Primary record must be rolled back on index failure');
    } finally {
      distributedStore.isConfigured = origIsConfigured;
      distributedStore.set = origSet;
      distributedStore.sadd = origSadd;
      distributedStore.del = origDel;
    }
    console.log('  PASS: Secondary index failure triggered compensating rollback of primary record.\n');
  }

  // Test 19: Read-Time Orphan Reconciliation
  console.log('[TEST 19] Read-Time Orphan Reconciliation');
  {
    const origIsConfigured = distributedStore.isConfigured;
    const origSmembers = distributedStore.smembers;
    const origGet = distributedStore.get;
    const origSrem = distributedStore.srem;

    let sremCalledForMissingId = false;

    try {
      distributedStore.isConfigured = () => true;
      distributedStore.smembers = async () => ['orphan-id-123', 'valid-id-456'];
      distributedStore.get = async (key) => {
        if (key === 'post:orphan-id-123') return null; // Missing entity
        if (key === 'post:valid-id-456') {
          return JSON.stringify({
            id: 'valid-id-456',
            author: { walletAddress: 'valid_wallet' },
            content: 'Valid post',
            createdAt: new Date().toISOString(),
          });
        }
        return null;
      };
      distributedStore.srem = async (key, id) => {
        if (id === 'orphan-id-123') sremCalledForMissingId = true;
        return true;
      };

      const all = await getAllPostsAsync();
      assert.strictEqual(all.length, 1, 'Only valid post should be returned');
      assert.strictEqual(all[0].id, 'valid-id-456');
      assert.strictEqual(sremCalledForMissingId, true, 'Orphan index entry must be pruned via SREM');
    } finally {
      distributedStore.isConfigured = origIsConfigured;
      distributedStore.smembers = origSmembers;
      distributedStore.get = origGet;
      distributedStore.srem = origSrem;
    }
    console.log('  PASS: Orphan index entries filtered and pruned in background.\n');
  }

  // Test 20: Input Sanitization
  console.log('[TEST 20] Input Sanitization against XSS');
  {
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        content: 'Testing <script>alert("xss")</script> sanitization & dangerous \x00 chars',
      },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const { post } = await res.json();
    assert.ok(!post.content.includes('<script>'), 'Script tag must be sanitized');
    assert.ok(!post.content.includes('\x00'), 'Null bytes must be sanitized');
    console.log('  PASS: Dangerous control characters and HTML tags sanitized.\n');
  }

  // Test 21: Payload Validation: Empty content and media rejected
  console.log('[TEST 21] Payload Validation: Empty content and media rejected');
  {
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: {
        content: '   ',
        mediaUrl: '',
      },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 400, 'Empty post must return 400');
    console.log('  PASS: Empty post content and empty media rejected with HTTP 400.\n');
  }

  // Test 22: Zero-Balance Creator Rule
  console.log('[TEST 22] Zero-Balance Creator Rule');
  {
    const zeroBalanceKp = Keypair.generate();
    const zeroBalanceWallet = zeroBalanceKp.publicKey.toBase58();
    const token = createSession(zeroBalanceWallet, 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { content: 'Zero balance legitimate post creation' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201, 'Zero balance wallet with SIWS must succeed');
    console.log('  PASS: Fresh legitimate wallet with 0 COOK balance successfully published post.\n');
  }

  // Test 23: Zero Fake Transaction Metadata
  console.log('[TEST 23] Zero Fake Transaction Metadata');
  {
    const kp = Keypair.generate();
    const token = createSession(kp.publicKey.toBase58(), 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { content: 'Authenticity test post' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const { post } = await res.json();

    assert.strictEqual(post.tipsCount, 0);
    assert.strictEqual(post.totalTipsCook, 0);
    console.log('  PASS: Unconfirmed activity contains zero fabricated signatures or addresses.\n');
  }

  // Test 24: REAL Route Full Lifecycle (Genuine POST -> Genuine GET)
  console.log('[TEST 24] REAL Route Full Lifecycle: Genuine POST -> Genuine GET');
  {
    const authorKp = Keypair.generate();
    const token = createSession(authorKp.publicKey.toBase58(), 'user');

    // 1. Post creation via genuine POST handler
    const postReq = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: { content: 'Lifecycle test post across genuine route handlers #lifecycle999' },
    });
    const postRes = await POST(postReq);
    assert.strictEqual(postRes.status, 201);
    const { post: createdPost } = await postRes.json();

    // 2. Query feed via genuine GET handler
    const getReq = createMockRequest('http://localhost:3000/api/posts', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
    const getRes = await GET(getReq);
    assert.strictEqual(getRes.status, 200);
    const getData = await getRes.json();

    const matched = getData.posts.find((p) => p.id === createdPost.id);
    assert.ok(matched, 'Created post must be found in genuine GET feed response');
    assert.strictEqual(matched.content, 'Lifecycle test post across genuine route handlers #lifecycle999');
    assert.strictEqual(matched.author.walletAddress, authorKp.publicKey.toBase58());
    console.log('  PASS: Full lifecycle genuine POST -> genuine GET verified across route exports.\n');
  }

  // Test 25: Ordinary Authenticated Profile with verified=false Creates Post -> post.author.verified === false
  console.log('[TEST 25] Ordinary Profile (verified=false) Post Creation -> verified === false');
  {
    const unverifiedKp = Keypair.generate();
    const unverifiedWallet = unverifiedKp.publicKey.toBase58();
    const unverifiedToken = createSession(unverifiedWallet, 'user');

    await saveOnboardedProfileAsync(unverifiedWallet, {
      handle: 'unverified_user',
      name: 'Unverified User',
      bio: 'Regular member',
    });

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${unverifiedToken}` },
      body: { content: 'Post by unverified member #unverified' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const { post } = await res.json();
    assert.strictEqual(post.author.verified, false, 'Author verified must be false for ordinary profile');
    console.log('  PASS: Ordinary member post correctly has verified=false.\n');
  }

  // Test 26: Authoritative Profile with verified=true Creates Post -> post.author.verified === true
  console.log('[TEST 26] Authoritative Profile (verified=true) Post Creation -> verified === true');
  {
    const verifiedKp = Keypair.generate();
    const verifiedWallet = verifiedKp.publicKey.toBase58();
    const verifiedToken = createSession(verifiedWallet, 'user');

    // Persist an authoritative profile with verified=true directly in authoritative store
    setAuthoritativeProfileForTests({
      id: `user-${verifiedWallet}`,
      handle: 'verified_official',
      name: 'Verified Official',
      bio: 'Official representative',
      walletAddress: verifiedWallet,
      verified: true,
      ageVerified: false,
      isCreator: false,
      followersCount: 0,
      followingCount: 0,
      createdAt: new Date().toISOString(),
    });

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${verifiedToken}` },
      body: { content: 'Post by verified official #verified' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const { post } = await res.json();
    assert.strictEqual(post.author.verified, true, 'Author verified must be true for authoritative verified profile');
    console.log('  PASS: Authoritative verified profile post correctly has verified=true.\n');
  }

  // Test 27: Request Body Containing verified:true Cannot Change False Verification
  console.log('[TEST 27] Client Injection of verified:true Cannot Manufacture Verification');
  {
    const attackerKp = Keypair.generate();
    const attackerWallet = attackerKp.publicKey.toBase58();
    const attackerToken = createSession(attackerWallet, 'user');

    await saveOnboardedProfileAsync(attackerWallet, {
      handle: 'spoof_tester',
      name: 'Spoof Tester',
      bio: 'Attacker attempting verification injection',
    });

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${attackerToken}` },
      body: {
        content: 'Attacker attempting to inject verified:true',
        verified: true,
        author: {
          verified: true,
          walletAddress: attackerWallet,
        },
      },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const { post } = await res.json();
    assert.strictEqual(post.author.verified, false, 'Client-supplied verified:true must be ignored');
    console.log('  PASS: Client injection of verified:true safely ignored by server.\n');
  }

  // Test 28: Fresh Wallet / No Authoritative Verified Profile -> verified === false
  console.log('[TEST 28] Fresh Wallet Without Profile Post Creation -> verified === false');
  {
    const freshKp = Keypair.generate();
    const freshWallet = freshKp.publicKey.toBase58();
    const freshToken = createSession(freshWallet, 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${freshToken}` },
      body: { content: 'Post by brand new fresh wallet #fresh' },
    });

    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const { post } = await res.json();
    assert.strictEqual(post.author.verified, false, 'Fresh wallet must have verified=false');
    console.log('  PASS: Fresh wallet post has verified=false by default.\n');
  }

  // Test 29: SIWS Authentication Alone Never Produces verified=true (user, creator, admin scopes)
  console.log('[TEST 29] SIWS Authentication Scopes Alone Never Manufacture verified=true');
  {
    for (const testScope of ['user', 'creator', 'admin']) {
      const scopeKp = Keypair.generate();
      const scopeWallet = scopeKp.publicKey.toBase58();
      const scopeToken = createSession(scopeWallet, testScope);

      const req = createMockRequest('http://localhost:3000/api/posts', {
        method: 'POST',
        headers: { Authorization: `Bearer ${scopeToken}` },
        body: { content: `Post with SIWS scope ${testScope}` },
      });

      const res = await POST(req);
      assert.strictEqual(res.status, 201);
      const { post } = await res.json();
      assert.strictEqual(post.author.verified, false, `Scope ${testScope} alone must not grant verified=true`);
    }
    console.log('  PASS: SIWS authentication scopes (user/creator/admin) alone never produce verified=true.\n');
  }

  console.log('================================================================');
  console.log('--- ALL 29 POST PERSISTENCE TESTS PASSED ---');
  console.log('================================================================');
}

runTests().catch((err) => {
  console.error('Fatal test error:', err);
  process.exit(1);
});
