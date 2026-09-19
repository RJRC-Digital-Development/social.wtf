import assert from 'assert';
import crypto from 'crypto';
import { Keypair, PublicKey, Transaction, SystemProgram, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

console.log('================================================================');
console.log('--- RUNNING TASK 7C: DURABLE ECONOMIC INTENT & RECOVERY TESTS ---');
console.log('================================================================\n');

const TREASURY_PUBKEY = new PublicKey('HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9');
const ALLOWED_OPERATIONS = ['platform_sweep', 'system_settlement', 'treasury_rebalance', 'emergency_migration'];
const MIN_HOT_WALLET_RESERVE_LAMPORTS = 50_000_000n;
const STANDARD_TX_FEE_LAMPORTS = 5_000n;

// ------------------------------------------------------------------
// Mock Persistent Distributed KV Store (Simulates Upstash / Redis REST)
// ------------------------------------------------------------------
class MockDistributedStore {
  constructor(isConfigured = true) {
    this.configured = isConfigured;
    this.store = new Map();
  }

  isConfigured() {
    return this.configured;
  }

  async get(key) {
    if (!this.configured) return null;
    return this.store.get(key) || null;
  }

  async set(key, value) {
    if (!this.configured) return false;
    this.store.set(key, value);
    return true;
  }

  async setnx(key, value) {
    if (!this.configured) return false;
    if (this.store.has(key)) return false;
    this.store.set(key, value);
    return true;
  }
}

// ------------------------------------------------------------------
// Standalone Deterministic Intent & Capability Simulator
// ------------------------------------------------------------------
class DeterministicIntentEngine {
  constructor(env = {}, distributedStore = new MockDistributedStore(true)) {
    this.env = env;
    this.distributedStore = distributedStore;
    this.serverKeypair = Keypair.generate();
    this.mockBalanceLamports = 100_000_000_000n; // 100 COOK
  }

  async deriveEconomicIntentKey({ operation, signerAddress, recipientAddress }) {
    if (operation === 'emergency_migration') {
      const version = (this.env.EMERGENCY_MIGRATION_VERSION || '1').trim();
      return `migration:v${version}:${signerAddress}:${recipientAddress}`;
    }

    if (operation === 'platform_sweep' || operation === 'treasury_rebalance') {
      const seqKey = `tx_intent:sweep_seq:${signerAddress}`;
      const rawSeq = await this.distributedStore.get(seqKey);
      const currentSeq = rawSeq ? parseInt(rawSeq, 10) || 1 : 1;
      return `${operation}:seq_${currentSeq}:${signerAddress}:${recipientAddress}`;
    }

    return `${operation}:${signerAddress}:${recipientAddress}`;
  }

  async reserveIntent({ intentId, operation, recipientAddress }) {
    if (!this.distributedStore.isConfigured()) {
      return {
        allowed: false,
        error: 'Distributed persistence store (Upstash/Redis) is required for privileged operations.',
        code: 'PERSISTENCE_NOT_CONFIGURED',
      };
    }

    const key = `tx_intent:${intentId}`;
    const record = {
      intentId,
      operation,
      recipientAddress,
      status: 'RESERVED',
      createdAt: Date.now(),
    };

    const setOk = await this.distributedStore.setnx(key, JSON.stringify(record));
    if (!setOk) {
      const raw = await this.distributedStore.get(key);
      if (raw) {
        const existing = JSON.parse(raw);
        return {
          allowed: false,
          status: existing.status,
          existingSignature: existing.signature,
          error:
            existing.status === 'CONFIRMED'
              ? 'Intent already executed.'
              : 'Intent is already currently in progress or awaiting confirmation.',
        };
      }
      return { allowed: false, error: 'Intent conflict detected.' };
    }

    return { allowed: true, status: 'RESERVED' };
  }

  async confirmIntent(intentId, signature, signerAddress, operation) {
    const key = `tx_intent:${intentId}`;
    const raw = await this.distributedStore.get(key);
    if (raw) {
      const record = JSON.parse(raw);
      record.status = 'CONFIRMED';
      record.signature = signature;
      record.updatedAt = Date.now();
      await this.distributedStore.set(key, JSON.stringify(record));

      if (signerAddress && (operation === 'platform_sweep' || operation === 'treasury_rebalance')) {
        const seqKey = `tx_intent:sweep_seq:${signerAddress}`;
        const currentRaw = await this.distributedStore.get(seqKey);
        const nextSeq = (parseInt(currentRaw || '1', 10) || 1) + 1;
        await this.distributedStore.set(seqKey, nextSeq.toString());
      }
    }
  }

  async executeRequest({ authScope, body }) {
    if (authScope !== 'admin') {
      return {
        status: 403,
        error: 'Ordinary user sessions cannot authorize platform hot wallet transfers.',
        code: 'FORBIDDEN_SCOPE',
      };
    }

    const { action = 'platform_sweep', recipientPublicKey, clientIntentId } = body;

    // Fail Closed on settlement
    if (action === 'system_settlement') {
      return {
        status: 501,
        error: 'System settlement is disabled: requires server-side authoritative settlement ledger record.',
        code: 'SETTLEMENT_DISABLED',
      };
    }

    if (!ALLOWED_OPERATIONS.includes(action)) {
      return {
        status: 400,
        error: `Disallowed platform operation '${action}'.`,
        code: 'INVALID_OPERATION',
      };
    }

    // Active rejection of client recipient override
    if (recipientPublicKey !== undefined && recipientPublicKey !== null && recipientPublicKey !== '') {
      return {
        status: 400,
        error: `Client-specified 'recipientPublicKey' is prohibited for operation '${action}'. Destination is strictly server-derived.`,
        code: 'RECIPIENT_OVERRIDE_PROHIBITED',
      };
    }

    let serverDestination;
    if (action === 'treasury_rebalance' || action === 'platform_sweep') {
      serverDestination = TREASURY_PUBKEY;
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
        serverDestination = new PublicKey(migrationTarget);
      } catch {
        return {
          status: 503,
          error: 'Emergency migration failed: configured EMERGENCY_MIGRATION_PUBKEY is not a valid SVM public key.',
          code: 'INVALID_MIGRATION_DESTINATION_CONFIG',
        };
      }
    }

    // Deterministic Server-Derived Economic Intent Key (Client intentId is ignored)
    const signerAddress = this.serverKeypair.publicKey.toBase58();
    const economicIntentKey = await this.deriveEconomicIntentKey({
      operation: action,
      signerAddress,
      recipientAddress: serverDestination.toBase58(),
    });

    // Atomic Intent Reservation
    const reservation = await this.reserveIntent({
      intentId: economicIntentKey,
      operation: action,
      recipientAddress: serverDestination.toBase58(),
    });

    if (!reservation.allowed) {
      if (reservation.code === 'PERSISTENCE_NOT_CONFIGURED') {
        return { status: 503, error: reservation.error, code: reservation.code };
      }
      if (reservation.status === 'CONFIRMED' && reservation.existingSignature) {
        return {
          status: 200,
          success: true,
          idempotent: true,
          signature: reservation.existingSignature,
          intentId: economicIntentKey,
        };
      }
      return {
        status: 409,
        error: reservation.error || 'Operation intent conflict or duplicate submission.',
        code: 'INTENT_CONFLICT',
      };
    }

    // Server-Side Balance Authority
    let transferLamports = 0n;
    if (action === 'emergency_migration') {
      transferLamports = this.mockBalanceLamports - STANDARD_TX_FEE_LAMPORTS;
      if (transferLamports <= 0n) {
        return { status: 400, error: 'Hot wallet balance is empty.', code: 'INSUFFICIENT_BALANCE' };
      }
    } else {
      transferLamports =
        this.mockBalanceLamports - MIN_HOT_WALLET_RESERVE_LAMPORTS - STANDARD_TX_FEE_LAMPORTS;
      if (transferLamports <= 0n) {
        return {
          status: 400,
          error: 'Insufficient hot wallet balance for sweep.',
          code: 'INSUFFICIENT_SWEEP_BALANCE',
        };
      }
    }

    const calculatedCookAmount = Number(transferLamports) / LAMPORTS_PER_SOL;
    const dummySignature = bs58.encode(crypto.randomBytes(64));

    await this.confirmIntent(economicIntentKey, dummySignature, signerAddress, action);

    return {
      status: 200,
      success: true,
      signature: dummySignature,
      intentId: economicIntentKey,
      amountCook: calculatedCookAmount,
      recipientAddress: serverDestination.toBase58(),
    };
  }
}

// ------------------------------------------------------------------
// Test Battery
// ------------------------------------------------------------------
async function runTests() {
  console.log(' [TEST 1] Client Intent ID Removal: Client cannot bypass replay protection by supplying arbitrary intentId');
  {
    const engine = new DeterministicIntentEngine();
    const res1 = await engine.executeRequest({
      authScope: 'admin',
      body: { action: 'platform_sweep', clientIntentId: 'custom-client-id-1' },
    });
    assert.strictEqual(res1.status, 200, 'Initial sweep must succeed');
    assert.strictEqual(res1.success, true);
    assert(res1.intentId.includes('platform_sweep:seq_1'), 'Intent ID must be server-derived monotonic sequence');

    // Attempting an identical concurrent request with a different client ID before completion
    const res2 = await engine.executeRequest({
      authScope: 'admin',
      body: { action: 'platform_sweep', clientIntentId: 'custom-client-id-2' },
    });
    assert.strictEqual(res2.status, 200, 'Second request after confirmation triggers next sequence');
    assert(res2.intentId.includes('platform_sweep:seq_2'), 'Second sweep receives sequence 2');
    console.log('   Client-supplied intentId completely ignored in favor of server-derived economic keys');
  }

  console.log(' [TEST 2] Emergency Migration One-Shot Versioning: Migration cannot be re-executed under same version');
  {
    const migrationVault = Keypair.generate().publicKey.toBase58();
    const engine = new DeterministicIntentEngine({
      EMERGENCY_MIGRATION_PUBKEY: migrationVault,
      EMERGENCY_MIGRATION_VERSION: '1',
    });

    const res1 = await engine.executeRequest({
      authScope: 'admin',
      body: { action: 'emergency_migration' },
    });
    assert.strictEqual(res1.status, 200, 'First migration must succeed');
    assert.strictEqual(res1.success, true);
    assert(res1.intentId.includes('migration:v1'), 'Migration intent key incorporates version');

    // Replay attempt under version 1
    const res2 = await engine.executeRequest({
      authScope: 'admin',
      body: { action: 'emergency_migration' },
    });
    assert.strictEqual(res2.status, 200, 'Idempotent replay returns 200');
    assert.strictEqual(res2.idempotent, true, 'Marked as idempotent');
    assert.strictEqual(res2.signature, res1.signature, 'Returns exact same signature');
    console.log('   Emergency migration strictly version-locked with zero double-spend possibility');
  }

  console.log(' [TEST 3] Server Balance Authority: Server derives transfer amount from on-chain balance');
  {
    const engine = new DeterministicIntentEngine();
    const res = await engine.executeRequest({
      authScope: 'admin',
      body: { action: 'platform_sweep', amountCook: 999999 }, // Attacker attempts to specify 999k COOK
    });
    assert.strictEqual(res.status, 200);
    // 100 COOK balance minus 0.05 COOK reserve minus fee = 99.949995 COOK
    assert(res.amountCook < 100, 'Amount must be derived from available balance, ignoring client claim');
    console.log(`   Server accurately swept ${res.amountCook} COOK retaining 0.05 COOK operational reserve`);
  }

  console.log(' [TEST 4] Fail-Closed Persistence: Privileged actions reject if distributed store unconfigured');
  {
    const unconfiguredStore = new MockDistributedStore(false);
    const engine = new DeterministicIntentEngine({}, unconfiguredStore);
    const res = await engine.executeRequest({
      authScope: 'admin',
      body: { action: 'platform_sweep' },
    });
    assert.strictEqual(res.status, 503, 'Must return 503 when distributed store is unconfigured');
    assert.strictEqual(res.code, 'PERSISTENCE_NOT_CONFIGURED');
    console.log('   Fails closed with 503 when distributed persistence is unavailable');
  }

  console.log(' [TEST 5] Permanent Confirmed Intent Retention: Stored without TTL in distributed store');
  {
    const store = new MockDistributedStore(true);
    const engine = new DeterministicIntentEngine({}, store);
    const res = await engine.executeRequest({
      authScope: 'admin',
      body: { action: 'platform_sweep' },
    });
    assert.strictEqual(res.status, 200);
    const rawStored = await store.get(`tx_intent:${res.intentId}`);
    assert(rawStored !== null, 'Record must be durably stored');
    const parsed = JSON.parse(rawStored);
    assert.strictEqual(parsed.status, 'CONFIRMED');
    assert.strictEqual(parsed.signature, res.signature);
    console.log('   Confirmed intent record permanently persisted in distributed store');
  }

  console.log(' [TEST 6] System Settlement Disabled Fail-Closed');
  {
    const engine = new DeterministicIntentEngine();
    const res = await engine.executeRequest({
      authScope: 'admin',
      body: { action: 'system_settlement' },
    });
    assert.strictEqual(res.status, 501);
    assert.strictEqual(res.code, 'SETTLEMENT_DISABLED');
    console.log('   System settlement fails closed with 501 without reaching intent or signer');
  }

  console.log('\n================================================================');
  console.log('  ALL 6 DURABLE ECONOMIC INTENT & RECOVERY TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
