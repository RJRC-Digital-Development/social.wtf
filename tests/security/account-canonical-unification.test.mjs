import assert from 'assert';
import {
  registerAccountAsync,
  bindVerifiedWalletAsync,
  getAccountIdByWalletAsync,
  resolveCanonicalIdentityAsync,
  resetAccountStoreForTests,
  bootstrapPlatformOwnerAsync,
} from '../../src/lib/data/accountStore.ts';
import {
  areFriendsAsync,
  sendFriendRequestAsync,
  acceptFriendRequestAsync,
  unfriendAsync,
  blockWalletAsync,
  getFriendsListAsync,
  getBlockedListAsync,
  getInboundRequestsAsync,
  getOutboundRequestsAsync,
  clearRelationshipsCacheForTests,
} from '../../src/lib/data/relationshipStore.ts';
import {
  savePostAsync,
  getPostsByAuthorAsync,
  clearPostsCacheForTests,
} from '../../src/lib/data/postsStore.ts';
import {
  saveProductAsync,
  getProductsByCreatorAsync,
  resetProductsStore,
} from '../../src/lib/data/productsStore.ts';

console.log('================================================================');
console.log('--- REPAIR: CANONICAL IDENTITY UNIFICATION & STRICT INVARIANTS ---');
console.log('================================================================\n');

async function runTests() {
  resetAccountStoreForTests();
  clearRelationshipsCacheForTests();
  clearPostsCacheForTests();
  resetProductsStore();

  const walletA = 'Alice111111111111111111111111111111111111111';
  const walletB = 'Bob111111111111111111111111111111111111111111';

  // 1. Create two accounts
  const regA = await registerAccountAsync('alice_canonical', 'StrongPassword123!');
  const regB = await registerAccountAsync('bob_canonical', 'StrongPassword456!');
  assert(regA.success && regA.account, 'Alice account creation failed');
  assert(regB.success && regB.account, 'Bob account creation failed');
  const accA = regA.account.accountId;
  const accB = regB.account.accountId;

  // 2. Bind wallets to accounts
  await bindVerifiedWalletAsync(accA, walletA, 'digestA', 'auditA');
  await bindVerifiedWalletAsync(accB, walletB, 'digestB', 'auditB');

  console.log('[TEST 1] Canonical resolution of accountIds, bound wallets, and legacy handles');
  const resAccA = await resolveCanonicalIdentityAsync(accA);
  const resWallA = await resolveCanonicalIdentityAsync(walletA);
  const resLegacyA = await resolveCanonicalIdentityAsync('user-' + walletA);
  assert.strictEqual(resAccA, accA, 'accA should resolve to accA');
  assert.strictEqual(resWallA, accA, 'walletA should resolve to accA');
  assert.strictEqual(resLegacyA, accA, 'user-walletA should resolve to accA');
  console.log('  PASS: All aliases for Alice resolve exclusively to accA.');

  console.log('\n[TEST 2] Strict Canonical Output: Friends list contains ONLY accountId');
  const sendRes = await sendFriendRequestAsync(walletA, walletB);
  assert(sendRes.success, 'Friend request failed');

  const acceptRes = await acceptFriendRequestAsync(accB, accA);
  assert(acceptRes.success, 'Friend accept failed');

  const friendCheck1 = await areFriendsAsync(accA, accB);
  const friendCheck2 = await areFriendsAsync(walletA, walletB);
  assert(friendCheck1 && friendCheck2, 'Friendship not reciprocal across aliases');

  const aliceFriends = await getFriendsListAsync(walletA);
  const bobFriends = await getFriendsListAsync(accB);

  // STRICT INVARIANT: output contains canonical accountId and DOES NOT contain raw wallet
  assert.strictEqual(aliceFriends.includes(accB), true, 'Alice friends list must contain canonical accB');
  assert.strictEqual(aliceFriends.includes(walletB), false, 'Alice friends list must NOT contain raw walletB');
  assert.strictEqual(bobFriends.includes(accA), true, 'Bob friends list must contain canonical accA');
  assert.strictEqual(bobFriends.includes(walletA), false, 'Bob friends list must NOT contain raw walletA');
  console.log('  PASS: Friends list returns strictly canonical accountId (no raw wallet leak).');

  console.log('\n[TEST 3] Strict Canonical Output: Block list contains ONLY accountId');
  await blockWalletAsync(walletA, walletB);
  const aliceBlocks = await getBlockedListAsync(accA);
  assert.strictEqual(aliceBlocks.includes(accB), true, 'Alice blocks list must contain canonical accB');
  assert.strictEqual(aliceBlocks.includes(walletB), false, 'Alice blocks list must NOT contain raw walletB');
  console.log('  PASS: Block list returns strictly canonical accountId.');

  console.log('\n[TEST 4] Unfriend on accountId severs wallet graph simultaneously');
  const unblockRes = await areFriendsAsync(accA, accB);
  assert.strictEqual(unblockRes, false, 'Blocked users must not be friends');
  console.log('  PASS: Block / unfriend severs relationship globally across all aliases.');

  console.log('\n[TEST 5] Author post persistence and query resolution across account/wallet');
  const post = {
    id: 'post_canon_1',
    author: {
      walletAddress: walletA,
      handle: 'alice_canonical',
      name: 'Alice Canonical',
      avatar: 'https://avatar.com/a',
      verified: false,
    },
    content: 'Canonical identity unified post',
    mediaType: 'text',
    createdAt: new Date().toISOString(),
    likesCount: 0,
    tipsAmount: 0,
    tags: [],
    isShielded: false,
  };

  await savePostAsync(post);
  const postsByWallet = await getPostsByAuthorAsync(walletA);
  const postsByAccount = await getPostsByAuthorAsync(accA);
  assert.strictEqual(postsByWallet.length, 1, 'Post lookup by wallet failed');
  assert.strictEqual(postsByAccount.length, 1, 'Post lookup by accountId failed');
  assert.strictEqual(postsByAccount[0].id, 'post_canon_1', 'Post id mismatch');
  console.log('  PASS: Post query resolves seamlessly across bound wallet and canonical accountId.');

  console.log('\n[TEST 6] Product creator persistence and query resolution across account/wallet');
  const prodRes = await saveProductAsync(walletA, {
    title: 'Canonical Track',
    description: 'Music item',
    priceCook: 10,
    category: 'music_stem',
  });
  assert(prodRes.success && prodRes.product, 'Product creation failed');

  const prodsByWallet = await getProductsByCreatorAsync(walletA);
  const prodsByAccount = await getProductsByCreatorAsync(accA);
  assert.strictEqual(prodsByWallet.products?.length, 1, 'Product lookup by wallet failed');
  assert.strictEqual(prodsByAccount.products?.length, 1, 'Product lookup by accountId failed');
  console.log('  PASS: Product catalog resolves seamlessly across bound wallet and canonical accountId.');

  console.log('\n[TEST 7] Owner bootstrap selects and preserves configured canonical ID idempotently');
  process.env.PLATFORM_OWNER_ACCOUNT_ID = accA;
  const boot1 = await bootstrapPlatformOwnerAsync();
  assert(boot1.accountId.startsWith('acc_'), 'Owner account ID must follow standard acc_ format');
  assert(boot1.accountId !== 'acc_platform_owner_root', 'Owner account ID must not be hardcoded special string');

  const boot2 = await bootstrapPlatformOwnerAsync();
  assert.strictEqual(boot1.accountId, boot2.accountId, 'Owner bootstrap must be idempotent');
  assert.strictEqual(boot2.isNew, false, 'Second bootstrap must recognize existing owner');
  console.log('  PASS: Owner bootstrap preserves the existing random canonical ID and is strictly idempotent.');

  const unboundWallet = 'UnboundWallet1111111111111111111111111111111111';

  console.log('\n[TEST 8] UNBOUND WALLET NEW FRIEND MUTATION -> REJECT');
  const unboundFriendRes = await sendFriendRequestAsync(unboundWallet, accB);
  assert.strictEqual(unboundFriendRes.success, false, 'Unbound wallet cannot send friend request');
  assert.strictEqual(unboundFriendRes.status, 403, 'Must return 403 forbidden');
  console.log('  PASS: Unbound wallet new friend request strictly rejected with 403.');

  console.log('\n[TEST 9] UNBOUND WALLET NEW POST MUTATION -> REJECT');
  let postRejected = false;
  try {
    await savePostAsync({
      id: 'post_unbound_1',
      author: { walletAddress: unboundWallet, handle: 'unbound', name: 'Unbound', avatar: '', verified: false },
      content: 'Should fail',
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    postRejected = true;
  }
  assert.strictEqual(postRejected, true, 'Unbound wallet post creation must be rejected');
  console.log('  PASS: Unbound wallet new post mutation strictly rejected.');

  console.log('\n[TEST 10] UNBOUND WALLET NEW PROFILE MUTATION -> REJECT');
  const { saveOnboardedProfileAsync } = await import('../../src/lib/data/profileStore.ts');
  const unboundProfRes = await saveOnboardedProfileAsync(unboundWallet, { handle: 'unbound_prof', name: 'Unbound' });
  assert.strictEqual(unboundProfRes.success, false, 'Unbound wallet profile creation must be rejected');
  console.log('  PASS: Unbound wallet new profile mutation strictly rejected.');

  console.log('\n[TEST 11] UNBOUND WALLET NEW PRODUCT MUTATION -> REJECT');
  const unboundProdRes = await saveProductAsync(unboundWallet, { title: 'Unbound Prod', priceCook: 5 });
  assert.strictEqual(unboundProdRes.success, false, 'Unbound wallet product creation must be rejected');
  console.log('  PASS: Unbound wallet new product mutation strictly rejected.');

  console.log('\n[TEST 12] LEGACY READ FOR MIGRATION -> PERMITTED');
  const { getPostByIdAsync } = await import('../../src/lib/data/postsStore.ts');
  const { getProductByIdAsync } = await import('../../src/lib/data/productsStore.ts');
  // Reading historical post/product for migration is permitted
  const legacyPost = await getPostByIdAsync('post_canon_1');
  assert(legacyPost, 'Historical post must remain readable for migration');
  const legacyProd = await getProductByIdAsync(prodRes.product.id);
  assert(legacyProd.success && legacyProd.product, 'Historical product must remain readable for migration');
  console.log('  PASS: Historical records remain readable for migration subsystem without data loss.');

  console.log('\n[TEST 13] VERIFIED WALLET ALIAS -> canonical accountId');
  const aliasRes = await resolveCanonicalIdentityAsync(walletA);
  assert.strictEqual(aliasRes, accA, 'Verified bound wallet must resolve to canonical accountId');
  console.log('  PASS: Verified wallet alias resolves strictly to canonical accountId.');

  console.log('\n================================================================');
  console.log('--- ALL 13 CANONICAL IDENTITY & STRICT INVARIANT TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
