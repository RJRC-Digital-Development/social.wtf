import assert from 'assert';
import crypto from 'crypto';
import { Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

console.log('================================================================');
console.log('--- RUNNING TASK 7A: ADMIN CAPABILITY AUTHORIZATION TESTS ---');
console.log('================================================================\n');

const TREASURY_PUBKEY = new PublicKey('HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9');
const MAX_COOK_PER_TRANSACTION = 10_000;
const ALLOWED_OPERATIONS = ['platform_sweep', 'system_settlement', 'treasury_rebalance', 'emergency_migration'];

// ------------------------------------------------------------------
// Standalone Intent Registry & Capability Simulator
// ------------------------------------------------------------------
class IntentManager {
  constructor() {
    this.intents = new Map();
  }

  async reserveIntent(params) {
    if (this.intents.has(params.intentId)) {
      const existing = this.intents.get(params.intentId);
      return {
        allowed: false,
        status: existing.status,
        existingSignature: existing.signature,
        error: existing.status === 'CONFIRMED' ? 'Intent already executed.' : 'Intent in progress.',
      };
    }
    const record = { ...params, status: 'RESERVED', createdAt: Date.now() };
    this.intents.set(params.intentId, record);
    return { allowed: true, status: 'RESERVED' };
  }

  async confirmIntent(intentId, signature) {
    const rec = this.intents.get(intentId);
    if (rec) {
      rec.status = 'CONFIRMED';
      rec.signature = signature;
    }
  }
}

// ------------------------------------------------------------------
// Capability-Hardened Execution Route Simulator
// ------------------------------------------------------------------
class CapabilityExecutionEngine {
  constructor(env = {}, intentManager = new IntentManager()) {
    this.env = env;
    this.intentManager = intentManager;
    this.serverKeypair = Keypair.generate();
  }

  async executeRequest({ authScope, body }) {
    // 1. Scope Guard
    if (authScope !== 'admin') {
      return { status: 403, error: 'Ordinary user sessions cannot authorize platform hot wallet transfers.', code: 'FORBIDDEN_SCOPE' };
    }

    const { action = 'platform_sweep', recipientPublicKey, amountCook, intentId } = body;

    // 2. Fail Closed for Disabled Operations
    if (action === 'system_settlement') {
      return { status: 501, error: 'System settlement is disabled: requires server-side authoritative settlement ledger record.', code: 'SETTLEMENT_DISABLED' };
    }

    if (!ALLOWED_OPERATIONS.includes(action)) {
      return { status: 400, error: `Disallowed platform operation '${action}'.`, code: 'INVALID_OPERATION' };
    }

    // 3. Reject Client-Supplied Recipient Override
    if (recipientPublicKey !== undefined && recipientPublicKey !== null && recipientPublicKey !== '') {
      return {
        status: 400,
        error: `Client-specified 'recipientPublicKey' is prohibited for operation '${action}'. Destination is strictly server-derived.`,
        code: 'RECIPIENT_OVERRIDE_PROHIBITED',
      };
    }

    // 4. Derive Destination Server-Side
    let destination;
    if (action === 'treasury_rebalance' || action === 'platform_sweep') {
      destination = TREASURY_PUBKEY;
    } else if (action === 'emergency_migration') {
      const migrationTarget = this.env.EMERGENCY_MIGRATION_PUBKEY?.trim();
      if (!migrationTarget) {
        return {
          status: 503,
          error: 'Emergency migration is disabled: EMERGENCY_MIGRATION_PUBKEY is not configured in server environment.',
          code: 'MIGRATION_DESTINATION_NOT_CONFIGURED',
        };
      }
      try {
        destination = new PublicKey(migrationTarget);
      } catch {
        return {
          status: 503,
          error: 'Emergency migration failed: configured EMERGENCY_MIGRATION_PUBKEY is not a valid SVM public key.',
          code: 'INVALID_MIGRATION_DESTINATION_CONFIG',
        };
      }
    }

    // 5. Validate Amount
    const numericAmount = Number(amountCook);
    if (isNaN(numericAmount) || !isFinite(numericAmount) || numericAmount <= 0) {
      return { status: 400, error: 'Amount must be a valid positive number greater than 0.' };
    }
    if (numericAmount > MAX_COOK_PER_TRANSACTION) {
      return { status: 400, error: `Transaction amount exceeds safety limit of ${MAX_COOK_PER_TRANSACTION} COOK.` };
    }

    // 6. Reserve Intent (Replay Protection)
    const effectiveIntentId = intentId || `intent:${action}:${Date.now()}:${Math.random().toString(36).substring(2, 7)}`;
    const reservation = await this.intentManager.reserveIntent({
      intentId: effectiveIntentId,
      operation: action,
      recipientAddress: destination.toBase58(),
      amountCook: numericAmount,
    });

    if (!reservation.allowed) {
      if (reservation.status === 'CONFIRMED' && reservation.existingSignature) {
        return {
          status: 200,
          success: true,
          idempotent: true,
          action,
          signature: reservation.existingSignature,
        };
      }
      return { status: 409, error: reservation.error, code: 'INTENT_CONFLICT' };
    }

    // 7. Construct Direct 100% Administrative Transfer
    const tx = new Transaction();
    const lamports = BigInt(Math.floor(numericAmount * LAMPORTS_PER_SOL));
    tx.add(
      SystemProgram.transfer({
        fromPubkey: this.serverKeypair.publicKey,
        toPubkey: destination,
        lamports,
      })
    );
    tx.feePayer = this.serverKeypair.publicKey;
    tx.recentBlockhash = '9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2';
    tx.sign(this.serverKeypair);

    const mockSignature = bs58.encode(crypto.randomBytes(64));
    await this.intentManager.confirmIntent(effectiveIntentId, mockSignature);

    return {
      status: 200,
      success: true,
      action,
      intentId: effectiveIntentId,
      senderAddress: this.serverKeypair.publicKey.toBase58(),
      recipientAddress: destination.toBase58(),
      amountCook: numericAmount,
      treasuryAmount: numericAmount, // 100% direct transfer
      creatorAmount: 0, // No creator commerce split
      signature: mockSignature,
      transactionInstructionsCount: tx.instructions.length,
    };
  }
}

// ------------------------------------------------------------------
// TEST BATTERY
// ------------------------------------------------------------------

async function runTask7ATests() {
  const defaultEngine = new CapabilityExecutionEngine();

  // [TEST 1] Attacker-Supplied Recipient Override Rejection
  {
    const attackerWallet = Keypair.generate().publicKey.toBase58();

    // Rebalance with attacker recipient
    const res1 = await defaultEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'treasury_rebalance', recipientPublicKey: attackerWallet, amountCook: 100 },
    });
    assert.strictEqual(res1.status, 400);
    assert.strictEqual(res1.code, 'RECIPIENT_OVERRIDE_PROHIBITED');

    // Sweep with attacker recipient
    const res2 = await defaultEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'platform_sweep', recipientPublicKey: attackerWallet, amountCook: 500 },
    });
    assert.strictEqual(res2.status, 400);
    assert.strictEqual(res2.code, 'RECIPIENT_OVERRIDE_PROHIBITED');

    // Migration with attacker recipient
    const res3 = await defaultEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'emergency_migration', recipientPublicKey: attackerWallet, amountCook: 1000 },
    });
    assert.strictEqual(res3.status, 400);
    assert.strictEqual(res3.code, 'RECIPIENT_OVERRIDE_PROHIBITED');

    console.log(' [TEST 1] Attacker Recipient Overrides: Prohibited and rejected with 400 across all operations');
  }

  // [TEST 2] Treasury Rebalance Server-Derived 100% Transfer
  {
    const res = await defaultEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'treasury_rebalance', amountCook: 250 },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.recipientAddress, TREASURY_PUBKEY.toBase58(), 'Destination must strictly be protocol treasury');
    assert.strictEqual(res.treasuryAmount, 250, '100% of funds routed to treasury');
    assert.strictEqual(res.creatorAmount, 0, 'Zero artificial creator cut on treasury rebalance');
    assert.strictEqual(res.transactionInstructionsCount, 1, 'Clean single direct transfer instruction');
    console.log(' [TEST 2] Treasury Rebalance: Server-derived destination and 100% direct transfer verified');
  }

  // [TEST 3] Emergency Migration Fail-Closed when Unconfigured
  {
    const unconfiguredEngine = new CapabilityExecutionEngine({});
    const res = await unconfiguredEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'emergency_migration', amountCook: 1000 },
    });

    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.code, 'MIGRATION_DESTINATION_NOT_CONFIGURED');
    console.log(' [TEST 3] Emergency Migration: Fails closed (503) when EMERGENCY_MIGRATION_PUBKEY is unset');
  }

  // [TEST 4] Emergency Migration to Configured Cold Vault
  {
    const coldVaultKeypair = Keypair.generate();
    const coldVaultPubkey = coldVaultKeypair.publicKey.toBase58();

    const migrationEngine = new CapabilityExecutionEngine({
      EMERGENCY_MIGRATION_PUBKEY: coldVaultPubkey,
    });

    const res = await migrationEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'emergency_migration', amountCook: 5000 },
    });

    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.success, true);
    assert.strictEqual(res.recipientAddress, coldVaultPubkey, 'Destination must be configured cold vault');
    console.log(' [TEST 4] Emergency Migration: Securely executes to configured vault destination');
  }

  // [TEST 5] System Settlement Disabled Fail-Closed
  {
    const res = await defaultEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'system_settlement', amountCook: 100 },
    });

    assert.strictEqual(res.status, 501);
    assert.strictEqual(res.code, 'SETTLEMENT_DISABLED');
    console.log(' [TEST 5] System Settlement: Disabled fail-closed without authoritative ledger state');
  }

  // [TEST 6] Replay & Idempotency Protection
  {
    const intentManager = new IntentManager();
    const intentEngine = new CapabilityExecutionEngine({}, intentManager);
    const testIntentId = 'intent-sweep-2026-09-19-001';

    // First execution
    const res1 = await intentEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'platform_sweep', amountCook: 100, intentId: testIntentId },
    });
    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.success, true);
    const initialSig = res1.signature;

    // Second execution with identical intentId (Replay attempt)
    const res2 = await intentEngine.executeRequest({
      authScope: 'admin',
      body: { action: 'platform_sweep', amountCook: 100, intentId: testIntentId },
    });
    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.idempotent, true);
    assert.strictEqual(res2.signature, initialSig, 'Must return existing signature without executing second transfer');
    console.log(' [TEST 6] Replay Protection: Duplicate intent returns idempotent receipt with zero double-spend');
  }

  // [TEST 7] Amount Bounds Enforcement
  {
    const invalidAmounts = [-10, 0, NaN, Infinity, 10001, 'invalid_number'];
    for (const amt of invalidAmounts) {
      const res = await defaultEngine.executeRequest({
        authScope: 'admin',
        body: { action: 'platform_sweep', amountCook: amt },
      });
      assert.strictEqual(res.status, 400, `Amount ${amt} must be rejected with 400`);
    }
    console.log(' [TEST 7] Amount Bounds: Negative, zero, NaN, Infinity, and above-cap amounts rejected');
  }

  // [TEST 8] Ordinary User and Tampered Scope Denial
  {
    const resUser = await defaultEngine.executeRequest({
      authScope: 'user',
      body: { action: 'platform_sweep', amountCook: 100 },
    });
    assert.strictEqual(resUser.status, 403);
    assert.strictEqual(resUser.code, 'FORBIDDEN_SCOPE');
    console.log(' [TEST 8] Scope Isolation: Ordinary user session rejected with 403 FORBIDDEN_SCOPE');
  }

  console.log('\n================================================================');
  console.log('  ALL 8 ADMIN CAPABILITY AUTHORIZATION TESTS PASSED!');
  console.log('================================================================\n');
}

runTask7ATests().catch((err) => {
  console.error('Task 7A Tests Failed:', err);
  process.exit(1);
});
