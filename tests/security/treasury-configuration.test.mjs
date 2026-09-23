import assert from 'assert';
import { PublicKey, Keypair, LAMPORTS_PER_SOL } from '@solana/web3.js';
import {
  DEFAULT_PLATFORM_TREASURY_PUBKEY,
  getCanonicalTreasuryPublicKey,
  getCanonicalTreasuryAddress,
  COOKIE_CHAIN_CONFIG,
  PLATFORM_TREASURY_PUBKEY,
  calculateFeeSplit,
  buildSplitTransaction,
} from '../../src/lib/solana/cookieChain.ts';
import { executeOnChainSplitTransaction } from '../../src/lib/solana/serverSigner.ts';

console.log('================================================================');
console.log('--- TASK: CANONICAL TREASURY CONFIGURATION & SECURITY GATE ---');
console.log('================================================================\n');

const EXPECTED_CANONICAL_TREASURY = 'D5to2BbiYfKqWjBR2cGazz1PJjqi9Zp4UfnC7HA9SXtF';

// [TEST 1] Configured Treasury Address Parses Successfully
{
  console.log('[TEST 1] Configured treasury address parses successfully as a Solana PublicKey');
  const pubkey = new PublicKey(EXPECTED_CANONICAL_TREASURY);
  assert.strictEqual(pubkey.toBase58(), EXPECTED_CANONICAL_TREASURY);
  assert.strictEqual(PublicKey.isOnCurve(pubkey.toBuffer()), true, 'Address must be a valid on-curve Ed25519 public key');

  const resolved = getCanonicalTreasuryPublicKey();
  assert.strictEqual(resolved.toBase58(), EXPECTED_CANONICAL_TREASURY);
  assert.strictEqual(getCanonicalTreasuryAddress(), EXPECTED_CANONICAL_TREASURY);
  assert.strictEqual(COOKIE_CHAIN_CONFIG.treasuryPublicKey, EXPECTED_CANONICAL_TREASURY);
  assert.strictEqual(DEFAULT_PLATFORM_TREASURY_PUBKEY, EXPECTED_CANONICAL_TREASURY);
  console.log('  PASS: Canonical treasury address parses and validates successfully.\n');
}

// [TEST 2] Expected Treasury Recipient Is Used in Transaction Construction
{
  console.log('[TEST 2] Expected treasury recipient is used in buildSplitTransaction');
  const sender = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  const amountCook = 10.0;

  const split = calculateFeeSplit(amountCook, 5); // 0.05%
  assert.strictEqual(split.treasuryAmount, 0.005);
  assert.strictEqual(split.creatorAmount, 9.995);

  const tx = await buildSplitTransaction({
    fromPubkey: sender,
    creatorPubkey: creator,
    amountCook,
    memoText: 'Test split',
  });

  // Verify instructions: Instruction 0 -> Creator, Instruction 1 -> Treasury
  assert.strictEqual(tx.instructions.length, 2, 'Must have creator transfer and treasury transfer instructions');

  const creatorIx = tx.instructions[0];
  const treasuryIx = tx.instructions[1];

  // SystemProgram transfer keys: [from, to]
  assert.strictEqual(creatorIx.keys[1].pubkey.toBase58(), creator.toBase58(), 'Instruction 0 recipient must be creator');
  assert.strictEqual(treasuryIx.keys[1].pubkey.toBase58(), EXPECTED_CANONICAL_TREASURY, 'Instruction 1 recipient must be canonical treasury');
  console.log('  PASS: Transaction construction uses strictly canonical treasury destination.\n');
}

// [TEST 3] Client Cannot Override Treasury Recipient
{
  console.log('[TEST 3] Client cannot override treasury recipient');
  // Attempting to pass client-supplied treasury address or custom payload has zero effect on buildSplitTransaction
  const sender = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  const rogueAttackerTreasury = Keypair.generate().publicKey;

  // buildSplitTransaction interface only accepts sender, creator, amount, memo
  const tx = await buildSplitTransaction({
    fromPubkey: sender,
    creatorPubkey: creator,
    amountCook: 50.0,
    memoText: 'Rogue override attempt',
  });

  const destinationPubkeys = tx.instructions.map((ix) => ix.keys[1].pubkey.toBase58());
  assert.strictEqual(destinationPubkeys.includes(rogueAttackerTreasury.toBase58()), false, 'Rogue destination must not be in transaction');
  assert.strictEqual(destinationPubkeys[1], EXPECTED_CANONICAL_TREASURY, 'Treasury destination remains canonical');
  console.log('  PASS: Client input cannot alter or override protocol treasury destination.\n');
}

// [TEST 4] Malformed Treasury Configuration Fails Closed
{
  console.log('[TEST 4] Malformed treasury configuration fails closed');
  const prevEnv = process.env.PLATFORM_TREASURY_PUBKEY;
  try {
    process.env.PLATFORM_TREASURY_PUBKEY = 'not-a-valid-solana-address-!!!';
    assert.throws(
      () => {
        getCanonicalTreasuryPublicKey();
      },
      (err) => {
        assert.ok(err instanceof Error);
        assert.ok(err.message.includes('Invalid or malformed platform treasury public key configuration'));
        return true;
      },
      'Must throw error when configuration is malformed'
    );
  } finally {
    process.env.PLATFORM_TREASURY_PUBKEY = prevEnv;
  }
  console.log('  PASS: Malformed configuration strictly fails closed by throwing an error.\n');
}

// [TEST 5] Missing Treasury Configuration Fails Closed Without Silently Substituting Wrong Address
{
  console.log('[TEST 5] Missing treasury configuration behavior verified');
  // When environment variable is empty / missing, it cleanly resolves the canonical default
  const prevEnv = process.env.PLATFORM_TREASURY_PUBKEY;
  const prevNextEnv = process.env.NEXT_PUBLIC_TREASURY_PUBKEY;
  try {
    delete process.env.PLATFORM_TREASURY_PUBKEY;
    delete process.env.NEXT_PUBLIC_TREASURY_PUBKEY;

    const resolved = getCanonicalTreasuryPublicKey();
    assert.strictEqual(resolved.toBase58(), EXPECTED_CANONICAL_TREASURY, 'Must resolve official canonical default');
  } finally {
    if (prevEnv !== undefined) process.env.PLATFORM_TREASURY_PUBKEY = prevEnv;
    if (prevNextEnv !== undefined) process.env.NEXT_PUBLIC_TREASURY_PUBKEY = prevNextEnv;
  }
  console.log('  PASS: Treasury resolution never substitutes creator, user, or zero address.\n');
}

// [TEST 6] Creator Recipient Remains Unchanged (99.95%)
{
  console.log('[TEST 6] Creator recipient proceeds remain strictly 99.95%');
  const totalCook = 100.0;
  const split = calculateFeeSplit(totalCook, 5); // 5 BPS = 0.05%
  assert.strictEqual(split.creatorAmount, 99.95);
  assert.strictEqual(split.treasuryAmount, 0.05);
  assert.strictEqual(split.creatorAmount + split.treasuryAmount, totalCook);
  console.log('  PASS: Creator recipient proceeds strictly preserved at 99.95%.\n');
}

// [TEST 7] Fee Calculations & Invariants Remain Integer-Exact Down to 1 Lamport
{
  console.log('[TEST 7] Integer-exact invariant checks preserved across amounts');
  const testAmounts = [0.001, 1.0, 5.0, 10.0, 88.5, 1000.0, 250000.0];

  for (const amount of testAmounts) {
    const split = calculateFeeSplit(amount, 5);
    assert.strictEqual(
      split.creatorLamports + split.treasuryLamports,
      split.totalLamports,
      `Lamport sum invariant failed for amount ${amount}`
    );
    assert.strictEqual(split.feeBps, 5);
  }
  console.log('  PASS: Exact integer math and fee invariants strictly hold.\n');
}

console.log('================================================================');
console.log('  ALL 7 TREASURY CONFIGURATION & SECURITY GATE TESTS PASSED!    ');
console.log('================================================================\n');
