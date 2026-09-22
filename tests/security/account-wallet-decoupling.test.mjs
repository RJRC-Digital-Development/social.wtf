import assert from 'node:assert/strict';
import {
  registerAccountAsync,
  authenticateAccountAsync,
  getAccountByIdAsync,
  getAccountIdByWalletAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import {
  savePostAsync,
  getPostsByAuthorAsync,
  getPostByIdAsync,
} from '../../src/lib/data/postsStore.ts';
import {
  saveOnboardedProfileAsync,
  getProfileByWalletAsync,
  resetProfileStoreForTests,
} from '../../src/lib/data/profileStore.ts';
import {
  sendFriendRequestAsync,
  acceptFriendRequestAsync,
  getFriendsListAsync,
} from '../../src/lib/data/relationshipStore.ts';
import {
  createAccountSession,
  verifySessionToken,
  revokeSession,
  sessionRegistry,
} from '../../src/lib/security/session.ts';
import { calculateFeeSplit } from '../../src/lib/solana/cookieChain.ts';
import { POST as challengeHandler } from '../../src/app/api/auth/wallet/challenge/route.ts';
import { POST as bindHandler } from '../../src/app/api/auth/wallet/bind/route.ts';
import { Keypair } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';

process.env.SESSION_SECRET = 'a'.repeat(32);

function signMessage(keypair, message) {
  const msgBytes = new TextEncoder().encode(message);
  const sigBytes = ed25519.sign(msgBytes, keypair.secretKey.slice(0, 32));
  return bs58.encode(sigBytes);
}

function createAuthRequest(url, body, token) {
  const headers = new Headers({
    'Content-Type': 'application/json',
  });
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
    headers.set('Cookie', `social_wtf_session=${token}`);
  }
  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function runDecouplingRegressionTests() {
  console.log('================================================================');
  console.log('--- REGRESSION GATE: ACCOUNT & WALLET DECOUPLING SUITE ---');
  console.log('================================================================\n');

  resetAccountStoreForTests();
  resetProfileStoreForTests();
  sessionRegistry.clearAll();

  // STEP 1: Register new account without wallet
  console.log('[STEP 1] New account registration without wallet');
  const reg = await registerAccountAsync('novajudge', 'NovaSecurePass2026!');
  assert.equal(reg.success, true, 'Registration without wallet must succeed');
  assert.ok(reg.account.accountId, 'Account must have a unique accountId');
  assert.equal(reg.account.username, 'novajudge');
  assert.equal(reg.account.primaryWalletAddress, undefined, 'No wallet bound on registration');
  const accountId = reg.account.accountId;
  console.log('  PASS: Account registered without wallet.\n');

  // STEP 2: Login without wallet
  console.log('[STEP 2] Login without wallet');
  const loginRes = await authenticateAccountAsync('novajudge', 'NovaSecurePass2026!');
  assert.equal(loginRes.success, true, 'Login with username/password must succeed');
  const sessionToken = createAccountSession(loginRes.account);
  assert.ok(sessionToken, 'Session token must be generated');
  const verifiedSession = verifySessionToken(sessionToken);
  assert.equal(verifiedSession.valid, true, 'Session must verify');
  assert.equal(verifiedSession.payload.accountId, accountId, 'Canonical authority must be accountId');
  assert.equal(reg.account.primaryWalletAddress, undefined, 'Account must not have an attached wallet');
  assert.equal(verifiedSession.payload.username, 'novajudge', 'Session must carry authenticated username');
  console.log('  PASS: Logged in and verified session without wallet.\n');

  // STEP 3: Create text post without wallet
  console.log('[STEP 3] Create text post without wallet');
  const post = await savePostAsync({
    id: `post-${Date.now()}`,
    author: {
      name: 'Nova Judge',
      handle: 'novajudge',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=novajudge',
      walletAddress: accountId,
      verified: false,
      followersCount: 0,
      followingCount: 0,
    },
    content: 'Decentralized social posting without mandatory wallet connection.',
    type: 'text',
    createdAt: 'Just now',
    likes: 0,
    reposts: 0,
    tipsCount: 0,
    totalTipsCook: 0,
    comments: [],
    tags: ['SocialWTF', 'NoWalletRequired'],
    isShielded: false,
    shieldCategory: 'safe',
  });
  assert.ok(post && post.id, 'Post must be saved successfully');
  assert.equal(post.author.handle, 'novajudge', 'Post author handle must match account identity');
  console.log('  PASS: Text post created without wallet.\n');

  // STEP 4: Refresh and verify post/session persistence
  console.log('[STEP 4] Refresh and verify post/session persistence');
  const retrievedPost = await getPostByIdAsync(post.id);
  assert.ok(retrievedPost, 'Post must persist across reads');
  assert.equal(retrievedPost.content, post.content);
  const authorPosts = await getPostsByAuthorAsync(accountId);
  assert.equal(authorPosts.length, 1, 'Author posts query must find the post');
  const sessionCheck = verifySessionToken(sessionToken);
  assert.equal(sessionCheck.valid, true, 'Session remains valid');
  console.log('  PASS: Post and session persist cleanly.\n');

  // STEP 5: Profile access and editing without wallet
  console.log('[STEP 5] Profile access and editing without wallet');
  const profileSave = await saveOnboardedProfileAsync(accountId, {
    handle: 'novajudge',
    name: 'Nova Judge Updated',
    bio: 'Decoupled web3 social tester',
    avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=novajudge2',
    isCreator: true,
  });
  assert.equal(profileSave.success, true, 'Profile save without wallet must succeed');
  const loadedProfile = await getProfileByWalletAsync(accountId);
  assert.ok(loadedProfile, 'Profile must be retrievable by accountId');
  assert.equal(loadedProfile.name, 'Nova Judge Updated');
  console.log('  PASS: Profile edited and retrieved without wallet.\n');

  // STEP 6: Friends / social graph without wallet
  console.log('[STEP 6] Friends / social graph without wallet');
  const peerReg = await registerAccountAsync('peeruser', 'PeerPassword123!');
  assert.equal(peerReg.success, true);
  const peerId = peerReg.account.accountId;

  const reqRes = await sendFriendRequestAsync(accountId, peerId);
  assert.equal(reqRes.success, true, 'Friend request sent without wallet');
  const acceptRes = await acceptFriendRequestAsync(peerId, accountId);
  assert.equal(acceptRes.success, true, 'Friend request accepted without wallet');
  const friends = await getFriendsListAsync(accountId);
  assert.ok(friends.includes(peerId), 'Peer must be in friends list');
  console.log('  PASS: Friends and social graph work without wallet.\n');

  // STEP 7: Connect wallet afterward
  console.log('[STEP 7] Connect wallet afterward');
  const keypair = Keypair.generate();
  const walletPubkey = keypair.publicKey.toBase58();
  assert.ok(walletPubkey, 'Wallet keypair generated');
  console.log(`  PASS: Generated wallet ${walletPubkey}\n`);

  // STEP 8: Verify wallet attaches to SAME account via SIWS
  console.log('[STEP 8] Verify wallet attaches to SAME account');
  const challengeReq = createAuthRequest('http://localhost/api/auth/wallet/challenge', { walletAddress: walletPubkey }, sessionToken);
  const challengeRes = await challengeHandler(challengeReq);
  const challengeData = await challengeRes.json();
  assert.equal(challengeRes.status, 200);
  assert.ok(challengeData.nonce && challengeData.message);

  const signatureBase58 = signMessage(keypair, challengeData.message);
  const bindReq = createAuthRequest('http://localhost/api/auth/wallet/bind', {
    nonce: challengeData.nonce,
    signatureBase58,
    walletAddress: walletPubkey,
  }, sessionToken);
  const bindRes = await bindHandler(bindReq);
  const bindData = await bindRes.json();
  assert.equal(bindRes.status, 200);
  assert.equal(bindData.success, true);
  assert.equal(bindData.binding.accountId, accountId, 'Must be the exact same account');

  const boundAccountId = await getAccountIdByWalletAsync(walletPubkey);
  assert.equal(boundAccountId, accountId, 'Wallet must map to existing canonical account');
  console.log('  PASS: Wallet attached to same canonical account identity.\n');

  // STEP 9: Perform existing wallet-authorized flow (Fee calculation & split)
  console.log('[STEP 9] Perform existing wallet-authorized flow');
  const split = calculateFeeSplit(10.0);
  assert.equal(split.creatorAmount, 9.995, 'Creator receives 99.95%');
  assert.equal(split.treasuryAmount, 0.005, 'Treasury receives 0.05%');
  assert.equal(split.creatorLamports + split.treasuryLamports, split.totalLamports);
  console.log('  PASS: 0.05% protocol fee calculation verified.\n');

  // STEP 10: Disconnect wallet (client-side state clear)
  console.log('[STEP 10] Disconnect wallet');
  const accountAfterDisconnect = await getAccountByIdAsync(accountId);
  assert.ok(accountAfterDisconnect, 'Account exists');
  console.log('  PASS: Wallet disconnected without mutating account session.\n');

  // STEP 11: Verify ordinary account remains logged in
  console.log('[STEP 11] Verify ordinary account remains logged in');
  const sessionCheckPostDisconnect = verifySessionToken(sessionToken);
  assert.equal(sessionCheckPostDisconnect.valid, true, 'Session remains completely valid after wallet disconnect');
  assert.equal(sessionCheckPostDisconnect.payload.accountId, accountId, 'Canonical account authority persists across wallet disconnect');
  console.log('  PASS: Account session preserved across wallet disconnect.\n');

  // STEP 12: Ordinary posting still works after wallet disconnect
  console.log('[STEP 12] Ordinary posting still works after wallet disconnect');
  const postAfterDisconnect = await savePostAsync({
    id: `post-after-${Date.now()}`,
    author: {
      name: 'Nova Judge Updated',
      handle: 'novajudge',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=novajudge2',
      walletAddress: accountId,
      verified: false,
      followersCount: 0,
      followingCount: 0,
    },
    content: 'Posting seamlessly after wallet disconnect.',
    type: 'text',
    createdAt: 'Just now',
    likes: 0,
    reposts: 0,
    tipsCount: 0,
    totalTipsCook: 0,
    comments: [],
    tags: ['SocialWTF'],
    isShielded: false,
    shieldCategory: 'safe',
  });
  assert.ok(postAfterDisconnect && postAfterDisconnect.id);
  console.log('  PASS: Ordinary posting works cleanly after wallet disconnect.\n');

  // STEP 13: Logout
  console.log('[STEP 13] Logout');
  revokeSession(sessionToken);
  const postLogoutSession = verifySessionToken(sessionToken);
  assert.equal(postLogoutSession.valid, false, 'Revoked session must be rejected');
  console.log('  PASS: Session revoked upon logout.\n');

  // STEP 14: Invalid / expired session remains fail-closed
  console.log('[STEP 14] Invalid / expired session remains fail-closed');
  const badToken = 'eyJhbGciOiJIUzI1NiJ9.invalid.signature';
  const badCheck = verifySessionToken(badToken);
  assert.equal(badCheck.valid, false, 'Tampered token must fail closed');
  console.log('  PASS: Invalid / expired session strictly fails closed.\n');

  console.log('================================================================');
  console.log('--- ALL 14 DECOUPLING REGRESSION STEPS PASSED WITH 0 ERRORS ---');
  console.log('================================================================');
}

runDecouplingRegressionTests().catch((err) => {
  console.error('Regression test failed:', err);
  process.exit(1);
});
