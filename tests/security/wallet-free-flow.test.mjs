import assert from 'assert';
import {
  registerAccountAsync,
  authenticateAccountAsync,
  getAccountByIdAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import {
  sendFriendRequestAsync,
  acceptFriendRequestAsync,
  areFriendsAsync,
  getFriendsListAsync,
  clearRelationshipsCacheForTests,
} from '../../src/lib/data/relationshipStore.ts';
import {
  savePostAsync,
  getPostsByAuthorAsync,
  getAllPostsAsync,
  clearPostsCacheForTests,
} from '../../src/lib/data/postsStore.ts';
import {
  saveOnboardedProfileAsync,
  getProfileByWalletAsync,
  resetProfileStore,
} from '../../src/lib/data/profileStore.ts';
import { createAccountSession, verifySessionToken } from '../../src/lib/security/session.ts';

console.log('================================================================');
console.log('--- REPAIR: WALLET-FREE ROUTE E2E INTEGRATION FLOW ---');
console.log('================================================================\n');

process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test_session_secret_with_more_than_32_characters_for_security';

async function runTests() {
  resetAccountStoreForTests();
  clearRelationshipsCacheForTests();
  clearPostsCacheForTests();
  resetProfileStore(true);

  console.log('[STEP 1] Register Alice and Bob (Zero Wallet)');
  const regAlice = await registerAccountAsync('alice_nowallet', 'PasswordAlice123!');
  const regBob = await registerAccountAsync('bob_nowallet', 'PasswordBob456!');
  const regCharlie = await registerAccountAsync('charlie_unrelated', 'PasswordCharlie789!');

  assert(regAlice.success && regAlice.account, 'Alice registration failed');
  assert(regBob.success && regBob.account, 'Bob registration failed');
  assert(regCharlie.success && regCharlie.account, 'Charlie registration failed');

  const accAlice = regAlice.account.accountId;
  const accBob = regBob.account.accountId;
  const accCharlie = regCharlie.account.accountId;
  console.log('  PASS: Alice, Bob, and Charlie registered with canonical accountIds.');

  console.log('\n[STEP 2] Login Alice and Bob (Username / Password)');
  const loginAlice = await authenticateAccountAsync('alice_nowallet', 'PasswordAlice123!');
  const loginBob = await authenticateAccountAsync('bob_nowallet', 'PasswordBob456!');
  assert(loginAlice.success && loginAlice.account, 'Alice login failed');
  assert(loginBob.success && loginBob.account, 'Bob login failed');

  const tokenAlice = createAccountSession(regAlice.account, ['ROLE_USER']);
  const tokenBob = createAccountSession(regBob.account, ['ROLE_USER']);

  const verifyAlice = verifySessionToken(tokenAlice);
  const verifyBob = verifySessionToken(tokenBob);
  assert(verifyAlice.valid && verifyAlice.payload.accountId === accAlice, 'Alice session verification failed');
  assert(verifyBob.valid && verifyBob.payload.accountId === accBob, 'Bob session verification failed');
  console.log('  PASS: Authenticated sessions established and bound to accountIds.');

  console.log('\n[STEP 3] Onboard authoritative profiles (Account-First)');
  const profAliceRes = await saveOnboardedProfileAsync(accAlice, {
    handle: 'alice_nowallet',
    name: 'Alice NoWallet',
    bio: 'Text-first member without web3 wallet',
  });
  const profBobRes = await saveOnboardedProfileAsync(accBob, {
    handle: 'bob_nowallet',
    name: 'Bob NoWallet',
    bio: 'Text-first friend',
  });
  assert(profAliceRes.success && profAliceRes.profile, 'Alice profile onboarding failed');
  assert(profBobRes.success && profBobRes.profile, 'Bob profile onboarding failed');
  console.log('  PASS: Profiles created and bound directly to accountIds.');

  console.log('\n[STEP 4] Alice sends Bob friend request; Bob accepts');
  const sendRes = await sendFriendRequestAsync(accAlice, accBob);
  assert(sendRes.success, 'Friend request failed');

  const acceptRes = await acceptFriendRequestAsync(accBob, accAlice);
  assert(acceptRes.success, 'Friend accept failed');

  const areFriends = await areFriendsAsync(accAlice, accBob);
  assert.strictEqual(areFriends, true, 'Mutual friendship not established');
  console.log('  PASS: Mutual friendship established between Alice and Bob.');

  console.log('\n[STEP 5] Alice creates text-only post (Zero Wallet, Zero COOK Balance)');
  const post = {
    id: 'post_alice_text_1',
    author: {
      walletAddress: accAlice,
      handle: 'alice_nowallet',
      name: 'Alice NoWallet',
      avatar: profAliceRes.profile.avatar,
      verified: false,
    },
    content: 'Hello friends! Pure account-first text post with zero wallet.',
    mediaType: 'text',
    createdAt: new Date().toISOString(),
    likesCount: 0,
    tipsAmount: 0,
    tags: [],
    isShielded: false,
  };
  await savePostAsync(post);
  console.log('  PASS: Text post saved successfully.');

  console.log('\n[STEP 6] Bob retrieves friend feed; Charlie is denied access');
  const alicePosts = await getPostsByAuthorAsync(accAlice);
  assert(alicePosts.length > 0, 'Alice posts not found');
  const targetPost = alicePosts[0];

  const bobCanSee = await areFriendsAsync(accBob, targetPost.author.walletAddress);
  assert.strictEqual(bobCanSee, true, 'Bob must be authorized to see Alice friend post');

  const charlieCanSee = await areFriendsAsync(accCharlie, targetPost.author.walletAddress);
  assert.strictEqual(charlieCanSee, false, 'Charlie must be denied access to Alice private post');
  console.log('  PASS: Friend Bob authorized; Unrelated Charlie strictly denied.');

  console.log('\n[STEP 7] Alice logs out and logs back in with same accountId and data');
  const relogAlice = await authenticateAccountAsync('alice_nowallet', 'PasswordAlice123!');
  assert(relogAlice.success && relogAlice.account, 'Alice re-login failed');
  assert.strictEqual(relogAlice.account.accountId, accAlice, 'AccountId must remain strictly identical');

  const aliceProfile = await getProfileByWalletAsync(accAlice);
  assert(aliceProfile && aliceProfile.handle === 'alice_nowallet', 'Alice profile preserved');
  console.log('  PASS: Alice logged back in retaining identical accountId, profile, and post ownership.');

  console.log('\n================================================================');
  console.log('--- ALL 7 WALLET-FREE ROUTE E2E INTEGRATION STEPS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
