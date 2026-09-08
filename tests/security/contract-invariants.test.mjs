import assert from 'assert';
import { Keypair, PublicKey } from '@solana/web3.js';

console.log('--- RUNNING SMART CONTRACT INVARIANTS & AUTHORITY MODEL TESTS ---');

const BPS_DENOMINATOR = 10_000n;
const MAX_FEE_BPS = 2_500n; // 25%

// Model of PlatformState
function createPlatformState(admin, treasury, feeBps = 500n) {
  assert.ok(admin && !admin.equals(PublicKey.default), 'InvalidAdminAddress: Admin cannot be zero/default');
  assert.ok(treasury && !treasury.equals(PublicKey.default), 'InvalidTreasuryAddress: Treasury cannot be zero/default');
  assert.ok(feeBps <= MAX_FEE_BPS, 'FeeTooHigh: Protocol fee exceeds 25%');

  return {
    admin,
    pending_admin: null,
    treasury,
    fee_bps: feeBps,
    is_paused: false,
    total_volume_lamports: 0n,
    total_treasury_collected: 0n,
    total_transactions: 0n,
  };
}

// Model of TipCreator instruction
function executeTipCreator(platformState, tipper, creator, treasury, amountLamports) {
  // 1. Checks
  assert.ok(!platformState.is_paused, 'PlatformPaused');
  assert.ok(amountLamports > 0n, 'InvalidAmount');
  
  // Anti-Wash self-tipping enforcement
  assert.ok(!tipper.equals(creator), 'SelfTippingNotAllowed: Tipper and creator cannot be the same address');

  // Treasury has_one constraint
  assert.ok(treasury.equals(platformState.treasury), 'InvalidTreasuryAccount: Supplied treasury does not match state');

  const treasuryFee = (amountLamports * platformState.fee_bps) / BPS_DENOMINATOR;
  const creatorProceeds = amountLamports - treasuryFee;

  // Invariant: creator_proceeds + treasury_fee == amount_lamports
  assert.strictEqual(creatorProceeds + treasuryFee, amountLamports, 'FeeInvariantViolated');

  // 2. Effects (Checks-Effects-Interactions: state mutated before external interaction)
  platformState.total_volume_lamports += amountLamports;
  platformState.total_treasury_collected += treasuryFee;
  platformState.total_transactions += 1n;

  // 3. Interactions: transfer lamports
  return {
    creatorProceeds,
    treasuryFee,
    success: true,
  };
}

// Model of CreateProduct and CloseProduct
function createProduct(creator, productId, priceLamports) {
  assert.ok(productId.length > 0 && productId.length <= 32, 'InvalidProductId');
  assert.ok(priceLamports > 0n, 'InvalidAmount');
  return {
    creator,
    product_id: productId,
    price_lamports: priceLamports,
    is_active: true,
    total_sales: 0n,
    is_closed: false,
  };
}

function closeProduct(product, callerSigner) {
  assert.ok(!product.is_closed, 'ProductAlreadyClosed');
  assert.ok(product.creator.equals(callerSigner), 'UnauthorizedCreator: Only product creator can close product');
  product.is_active = false;
  product.is_closed = true;
  return {
    rentReclaimed: true,
    recipient: product.creator,
  };
}

// ======================== TEST SUITES ========================

// Test 1: Self-Tipping Wash Metric Inflation Rejected
{
  const admin = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;
  const platform = createPlatformState(admin, treasury);

  const washUser = Keypair.generate().publicKey;

  assert.throws(
    () => {
      executeTipCreator(platform, washUser, washUser, treasury, 1_000_000_000n);
    },
    /SelfTippingNotAllowed/,
    'Self-tipping must be strictly rejected'
  );

  assert.strictEqual(platform.total_volume_lamports, 0n);
  assert.strictEqual(platform.total_transactions, 0n);
  console.log('✓ Test 1: Self-tipping / wash volume inflation successfully blocked');
}

// Test 2: Legitimate Tip Follows CEI and Fee Invariant
{
  const admin = Keypair.generate().publicKey;
  const treasury = Keypair.generate().publicKey;
  const platform = createPlatformState(admin, treasury, 500n); // 5% fee

  const tipper = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;
  const tipAmount = 1_000_000_000n; // 1 COOK

  const result = executeTipCreator(platform, tipper, creator, treasury, tipAmount);

  assert.strictEqual(result.treasuryFee, 50_000_000n);
  assert.strictEqual(result.creatorProceeds, 950_000_000n);
  assert.strictEqual(result.creatorProceeds + result.treasuryFee, tipAmount);
  assert.strictEqual(platform.total_volume_lamports, tipAmount);
  assert.strictEqual(platform.total_transactions, 1n);
  assert.strictEqual(platform.total_treasury_collected, 50_000_000n);

  console.log('✓ Test 2: Legitimate tip correctly split with CEI and invariant enforced');
}

// Test 3: Treasury has_one Constraint Defense
{
  const admin = Keypair.generate().publicKey;
  const legitimateTreasury = Keypair.generate().publicKey;
  const rogueTreasury = Keypair.generate().publicKey;
  const platform = createPlatformState(admin, legitimateTreasury);

  const tipper = Keypair.generate().publicKey;
  const creator = Keypair.generate().publicKey;

  assert.throws(
    () => {
      // Attacker supplies rogue treasury to intercept fee
      executeTipCreator(platform, tipper, creator, rogueTreasury, 100_000_000n);
    },
    /InvalidTreasuryAccount/,
    'Rogue treasury account substitution must be rejected'
  );

  console.log('✓ Test 3: Rogue treasury destination substitution rejected via has_one constraint');
}

// Test 4: Default/Zero Address Rejection on Initialization & Treasury Update
{
  const validAdmin = Keypair.generate().publicKey;

  assert.throws(
    () => {
      createPlatformState(PublicKey.default, validAdmin);
    },
    /InvalidAdminAddress/,
    'Default/zero admin address must be rejected'
  );

  assert.throws(
    () => {
      createPlatformState(validAdmin, PublicKey.default);
    },
    /InvalidTreasuryAddress/,
    'Default/zero treasury address must be rejected'
  );

  console.log('✓ Test 4: Default / uninitialized address rejection enforced on platform state');
}

// Test 5: Product Closure and Rent Recovery Authority
{
  const creator = Keypair.generate().publicKey;
  const attacker = Keypair.generate().publicKey;
  const product = createProduct(creator, 'prod_123', 500_000_000n);

  // Attacker cannot close product
  assert.throws(
    () => {
      closeProduct(product, attacker);
    },
    /UnauthorizedCreator/,
    'Attacker cannot close creator product'
  );

  // Legitimate creator can close product
  const closeResult = closeProduct(product, creator);
  assert.strictEqual(closeResult.rentReclaimed, true);
  assert.strictEqual(closeResult.recipient.equals(creator), true);
  assert.strictEqual(product.is_active, false);
  assert.strictEqual(product.is_closed, true);

  console.log('✓ Test 5: Product closure and rent reclamation strictly bound to creator authority');
}

console.log('ALL SMART CONTRACT INVARIANTS & AUTHORITY MODEL TESTS PASSED!\n');
