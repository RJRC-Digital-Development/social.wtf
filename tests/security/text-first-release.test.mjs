/**
 * tests/security/text-first-release.test.mjs
 *
 * SOCIAL.WTF TEXT-FIRST PRODUCTION RELEASE TEST SUITE
 *
 * 16 Required Launch-Gate Invariants Tested:
 * 1. text-only friend post succeeds
 * 2. zero-balance authenticated member can post text
 * 3. client mediaUrl rejected (MEDIA_TEMPORARILY_DISABLED)
 * 4. image URL rejected (MEDIA_TEMPORARILY_DISABLED)
 * 5. video URL rejected (MEDIA_TEMPORARILY_DISABLED)
 * 6. audio URL rejected (MEDIA_TEMPORARILY_DISABLED)
 * 7. arbitrary external media URL rejected (MEDIA_TEMPORARILY_DISABLED)
 * 8. client cannot bypass by setting media type without URL
 * 9. ordinary feed does not render production sample media
 * 10. unrelated member cannot see text post
 * 11. accepted friend can see text post
 * 12. unfriend removes text-post visibility
 * 13. block removes text-post visibility
 * 14. unauthenticated posting rejected (401)
 * 15. Adult Club remains disabled (isAdultClubEnabled() === false)
 * 16. sensitive post remains rejected while club disabled
 */

import assert from 'node:assert';
import { Keypair } from '@solana/web3.js';
import {
  savePostAsync,
  getPostByIdAsync,
  getAllPostsAsync,
  clearPostsCacheForTests,
} from '../../src/lib/data/postsStore.ts';
import {
  saveOnboardedProfileAsync,
  resetProfileStore,
} from '../../src/lib/data/profileStore.ts';
import {
  sendFriendRequestAsync,
  acceptFriendRequestAsync,
  unfriendAsync,
  blockWalletAsync,
  unblockWalletAsync,
  clearRelationshipsCacheForTests,
} from '../../src/lib/data/relationshipStore.ts';
import {
  createSession,
} from '../../src/lib/security/session.ts';
import {
  isAdultClubEnabled,
} from '../../src/lib/security/clubAuth.ts';
import { GET, POST } from '../../src/app/api/posts/route.ts';

let reqIpCounter = 1;
function createMockRequest(url, options = {}) {
  const parsedUrl = new URL(url, 'http://localhost:3000');
  const headers = new Headers(options.headers || {});
  if (!headers.has('x-forwarded-for')) {
    headers.set('x-forwarded-for', `10.2.0.${reqIpCounter++}`);
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
  console.log('--- SOCIAL.WTF: TEXT-FIRST PRODUCTION RELEASE TESTS (16 CASES) ---');
  console.log('================================================================\n');

  clearRelationshipsCacheForTests();
  clearPostsCacheForTests();
  resetProfileStore(true);

  // Setup test identities
  const aliceKp = Keypair.generate();
  const aliceWallet = aliceKp.publicKey.toBase58();
  const aliceToken = createSession(aliceWallet, 'user');

  const bobKp = Keypair.generate();
  const bobWallet = bobKp.publicKey.toBase58();
  const bobToken = createSession(bobWallet, 'user');

  const charlieKp = Keypair.generate();
  const charlieWallet = charlieKp.publicKey.toBase58();
  const charlieToken = createSession(charlieWallet, 'user');

  await saveOnboardedProfileAsync(aliceWallet, { handle: 'alice_vault', name: 'Alice Vault', bio: 'Alice bio' });
  await saveOnboardedProfileAsync(bobWallet, { handle: 'bob_records', name: 'Bob Records', bio: 'Bob bio' });
  await saveOnboardedProfileAsync(charlieWallet, { handle: 'charlie_art', name: 'Charlie Art', bio: 'Charlie bio' });

  // [TEST 1] Text-only friend post succeeds
  console.log('[TEST 1] Text-only friend post succeeds');
  let alicePostId = '';
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: { content: 'Alice text-only friend broadcast #first' },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.post.content, 'Alice text-only friend broadcast #first');
    assert.strictEqual(data.post.type, 'text');
    assert.strictEqual(data.post.mediaUrl, undefined);
    alicePostId = data.post.id;
    console.log('  PASS: Text-only post created successfully with type text and no mediaUrl.\n');
  }

  // [TEST 2] Zero-balance authenticated member can post text
  console.log('[TEST 2] Zero-balance authenticated member can post text');
  {
    const zeroBalanceKp = Keypair.generate();
    const zeroWallet = zeroBalanceKp.publicKey.toBase58();
    const zeroToken = createSession(zeroWallet, 'user');

    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${zeroToken}` },
      body: { content: 'Zero-balance wallet text post on Cookie Chain SVM' },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 201, 'Zero balance member must be able to post text');
    console.log('  PASS: Zero-balance authenticated wallet created text post.\n');
  }

  // [TEST 3] Client mediaUrl rejected (MEDIA_TEMPORARILY_DISABLED)
  console.log('[TEST 3] Client mediaUrl rejected with MEDIA_TEMPORARILY_DISABLED');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: {
        content: 'Post attempting to attach mediaUrl',
        mediaUrl: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe',
      },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'MEDIA_TEMPORARILY_DISABLED');
    console.log('  PASS: Request with mediaUrl strictly rejected with HTTP 400 MEDIA_TEMPORARILY_DISABLED.\n');
  }

  // [TEST 4] Image URL rejected (MEDIA_TEMPORARILY_DISABLED)
  console.log('[TEST 4] Image URL rejected with MEDIA_TEMPORARILY_DISABLED');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: {
        content: 'Post attempting to attach imageUrl',
        imageUrl: 'https://cdn.example.com/photos/image.jpg',
      },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'MEDIA_TEMPORARILY_DISABLED');
    console.log('  PASS: Request with imageUrl strictly rejected with HTTP 400 MEDIA_TEMPORARILY_DISABLED.\n');
  }

  // [TEST 5] Video URL rejected (MEDIA_TEMPORARILY_DISABLED)
  console.log('[TEST 5] Video URL rejected with MEDIA_TEMPORARILY_DISABLED');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: {
        content: 'Post attempting to attach videoUrl',
        videoUrl: 'https://cdn.example.com/videos/video.mp4',
      },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'MEDIA_TEMPORARILY_DISABLED');
    console.log('  PASS: Request with videoUrl strictly rejected with HTTP 400 MEDIA_TEMPORARILY_DISABLED.\n');
  }

  // [TEST 6] Audio URL rejected (MEDIA_TEMPORARILY_DISABLED)
  console.log('[TEST 6] Audio URL rejected with MEDIA_TEMPORARILY_DISABLED');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: {
        content: 'Post attempting to attach audioUrl',
        audioUrl: 'https://cdn.example.com/audio/song.mp3',
      },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'MEDIA_TEMPORARILY_DISABLED');
    console.log('  PASS: Request with audioUrl strictly rejected with HTTP 400 MEDIA_TEMPORARILY_DISABLED.\n');
  }

  // [TEST 7] Arbitrary external media URL rejected
  console.log('[TEST 7] Arbitrary external attachment URL rejected');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: {
        content: 'Post attempting to attach attachmentUrl',
        attachmentUrl: 'https://third-party-s3.amazonaws.com/leak/doc.pdf',
      },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 400);
    const data = await res.json();
    assert.strictEqual(data.code, 'MEDIA_TEMPORARILY_DISABLED');
    console.log('  PASS: Request with attachmentUrl strictly rejected with HTTP 400 MEDIA_TEMPORARILY_DISABLED.\n');
  }

  // [TEST 8] Client cannot bypass by setting media type without URL
  console.log('[TEST 8] Client cannot bypass by setting media type without URL');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: {
        content: 'Post claiming type photo without URL',
        type: 'photo',
      },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 201);
    const data = await res.json();
    assert.strictEqual(data.post.type, 'text', 'Server must enforce text type');
    assert.strictEqual(data.post.mediaUrl, undefined, 'mediaUrl must remain undefined');
    console.log('  PASS: Server coerced media type to text and prevented mediaUrl attachment.\n');
  }

  // [TEST 9] Ordinary feed does not render production sample media
  console.log('[TEST 9] Ordinary feed does not render production sample media');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      headers: { Authorization: `Bearer ${aliceToken}` },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    for (const post of data.posts) {
      assert.strictEqual(post.mediaUrl, undefined, 'Ordinary post must not contain mediaUrl in text release');
      assert.strictEqual(post.type, 'text', 'Ordinary post must have type text');
    }
    console.log('  PASS: Feed contains zero unauthenticated or sample media URLs.\n');
  }

  // [TEST 10] Unrelated member cannot see text post
  console.log('[TEST 10] Unrelated member cannot see text post');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      headers: { Authorization: `Bearer ${charlieToken}` },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const foundAlicePost = data.posts.some((p) => p.id === alicePostId);
    assert.strictEqual(foundAlicePost, false, 'Unrelated Charlie must not see Alice post');
    console.log('  PASS: Relationship boundary excludes unrelated member from seeing text post.\n');
  }

  // [TEST 11] Accepted friend can see text post
  console.log('[TEST 11] Accepted friend can see text post');
  {
    await sendFriendRequestAsync(aliceWallet, bobWallet);
    await acceptFriendRequestAsync(bobWallet, aliceWallet);

    const req = createMockRequest('http://localhost:3000/api/posts', {
      headers: { Authorization: `Bearer ${bobToken}` },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const foundAlicePost = data.posts.some((p) => p.id === alicePostId);
    assert.strictEqual(foundAlicePost, true, 'Friend Bob must see Alice post');
    console.log('  PASS: Friend Bob successfully sees Alice text post.\n');
  }

  // [TEST 12] Unfriend removes text-post visibility
  console.log('[TEST 12] Unfriend removes text-post visibility');
  {
    await unfriendAsync(aliceWallet, bobWallet);

    const req = createMockRequest('http://localhost:3000/api/posts', {
      headers: { Authorization: `Bearer ${bobToken}` },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const foundAlicePost = data.posts.some((p) => p.id === alicePostId);
    assert.strictEqual(foundAlicePost, false, 'Former friend Bob must no longer see Alice post');
    console.log('  PASS: Unfriend immediately severed text post visibility.\n');
  }

  // [TEST 13] Block removes text-post visibility
  console.log('[TEST 13] Block removes text-post visibility');
  {
    await sendFriendRequestAsync(aliceWallet, bobWallet);
    await acceptFriendRequestAsync(bobWallet, aliceWallet);

    await blockWalletAsync(aliceWallet, bobWallet);

    const req = createMockRequest('http://localhost:3000/api/posts', {
      headers: { Authorization: `Bearer ${bobToken}` },
    });
    const res = await GET(req);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    const foundAlicePost = data.posts.some((p) => p.id === alicePostId);
    assert.strictEqual(foundAlicePost, false, 'Blocked Bob must not see Alice post');

    await unblockWalletAsync(aliceWallet, bobWallet);
    console.log('  PASS: Block strictly severed text post visibility.\n');
  }

  // [TEST 14] Unauthenticated posting rejected (401)
  console.log('[TEST 14] Unauthenticated posting rejected (401)');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      body: { content: 'Unauthenticated text post attempt' },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 401);
    console.log('  PASS: Unauthenticated post creation rejected with HTTP 401.\n');
  }

  // [TEST 15] Adult Club remains disabled (isAdultClubEnabled() === false)
  console.log('[TEST 15] Adult Club remains disabled');
  {
    assert.strictEqual(isAdultClubEnabled(), false, 'isAdultClubEnabled() must return false');
    console.log('  PASS: Adult Club kill switch verified disabled.\n');
  }

  // [TEST 16] Sensitive post remains rejected while club disabled
  console.log('[TEST 16] Sensitive post remains rejected while club disabled');
  {
    const req = createMockRequest('http://localhost:3000/api/posts', {
      method: 'POST',
      headers: { Authorization: `Bearer ${aliceToken}` },
      body: { content: 'Post containing mature sensitive content 18+ explicit pornography' },
    });
    const res = await POST(req);
    assert.strictEqual(res.status, 403, 'Sensitive post must be rejected while adult club is disabled');
    const data = await res.json();
    assert.strictEqual(data.code, 'ADULT_CLUB_DISABLED');
    console.log('  PASS: Sensitive post rejected with HTTP 403 ADULT_CLUB_DISABLED.\n');
  }

  console.log('================================================================');
  console.log('--- ALL 16 TEXT-FIRST PRODUCTION RELEASE TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Fatal text-first release test error:', err);
  process.exit(1);
});
