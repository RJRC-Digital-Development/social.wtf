import assert from 'assert';
import crypto from 'crypto';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

console.log('================================================================');
console.log('--- RUNNING PRODUCTION ADMIN CAPABILITY & REPAIR TESTS ---');
console.log('================================================================\n');

const STANDARD_TX_FEE_LAMPORTS = 5_000n;

// ------------------------------------------------------------------
// Mock Persistent Distributed Store (Upstash/Redis REST Mirror)
// ------------------------------------------------------------------
class MockDistributedStore {
  constructor(configured = true) {
    this.configured = configured;
    this.data = new Map();
  }

  isConfigured() {
    return this.configured;
  }

  async get(key) {
    if (!this.configured) return null;
    return this.data.get(key) || null;
  }

  async set(key, value, ttlSeconds) {
    if (!this.configured) return false;
    this.data.set(key, value);
    return true;
  }

  async setnx(key, value) {
    if (!this.configured) return false;
    if (this.data.has(key)) return false;
    this.data.set(key, value);
    return true;
  }
}

// ------------------------------------------------------------------
// Production Route & Server Signer Logic Mirror
// ------------------------------------------------------------------
class ProductionTransactionHandler {
  constructor(env = {}, store = new MockDistributedStore(true)) {
    this.env = env;
    this.store = store;
    this.signer = Keypair.generate();
    this.mockBalanceLamports = 50_000_000_000n; // 50 COOK
  }

  deriveEconomicIntentKey({ operation, signerAddress, recipientAddress }) {
    if (operation === 'emergency_migration') {
      const version = (this.env.EMERGENCY_MIGRATION_VERSION || '1').trim();
      return `migration:v${version}:${signerAddress}:${recipientAddress}`;
    }
    return `${operation}:${signerAddress}:${recipientAddress}`;
  }

  async reserveIntent({ intentId, operation, recipientAddress }) {
    if (!this.store.isConfigured()) {
      return {
        allowed: false,
        error: 'Distributed persistence store (Upstash/Redis) is mandatory for privileged money movement.',
        code: 'PRIVILEGED_PERSISTENCE_UNAVAILABLE',
      };
    }

    const key = `tx_intent:${intentId}`;
    const record = {
      intentId,
      operation,
      recipientAddress,
      status: 'RESERVED',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    const setOk = await this.store.setnx(key, JSON.stringify(record));
    if (!setOk) {
      const existingRaw = await this.store.get(key);
      if (existingRaw) {
        const existing = JSON.parse(existingRaw);
        return {
          allowed: false,
          status: existing.status,
          existingSignature: existing.signature,
          error:
            existing.status === 'CONFIRMED'
              ? 'Intent already executed.'
              : existing.status === 'SUBMISSION_UNKNOWN'
              ? 'Intent submission status is ambiguous and awaiting on-chain reconciliation. Re-execution is prohibited.'
              : 'Intent is already currently in progress or awaiting confirmation.',
        };
      }
      return { allowed: false, error: 'Intent conflict detected.' };
    }

    return { allowed: true, status: 'RESERVED' };
  }

  async updateIntent(intentId, status, signature) {
    const key = `tx_intent:${intentId}`;
    if (!this.store.isConfigured()) {
      throw new Error('Distributed store is not configured during privileged intent state transition.');
    }
    const raw = await this.store.get(key);
    if (!raw) {
      throw new Error(`Intent record ${intentId} not found in distributed store.`);
    }
    const record = JSON.parse(raw);
    record.status = status;
    if (signature) record.signature = signature;
    record.updatedAt = Date.now();

    // Permanent write without TTL for CONFIRMED
    const writeOk = await this.store.set(key, JSON.stringify(record));
    if (!writeOk) {
      throw new Error(`Failed to durably write intent status ${status} to distributed store.`);
    }
  }

  async handlePost({ authScope, body }) {
    // 1. Scope Boundary
    if (authScope !== 'admin') {
      return {
        status: 403,
        error: 'Ordinary user sessions cannot authorize platform hot wallet transfers. Client wallet signature required.',
        code: 'FORBIDDEN_SCOPE',
      };
    }

    const { action = 'emergency_migration', recipientPublicKey, amountCook, intentId } = body;

    // 2. Disabled Unsafe Operations
    if (
      action === 'platform_sweep' ||
      action === 'treasury_rebalance' ||
      action === 'system_settlement'
    ) {
      return {
        status: 501,
        error: `Privileged operation '${action}' is disabled: authoritative server-side financial intent and amount ledger state is not implemented.`,
        code: 'PRIVILEGED_OPERATION_DISABLED',
      };
    }

    // 3. Disallowed Operations
    if (action !== 'emergency_migration') {
      return {
        status: 400,
        error: `Unsupported or disallowed platform operation '${action}'.`,
        code: 'INVALID_OPERATION',
      };
    }

    // 4. Prohibit Client Recipient Override
    if (recipientPublicKey !== undefined && recipientPublicKey !== null && recipientPublicKey !== '') {
      return {
        status: 400,
        error: `Client-specified 'recipientPublicKey' is prohibited for operation '${action}'. Destination is strictly server-derived.`,
        code: 'RECIPIENT_OVERRIDE_PROHIBITED',
      };
    }

    // 5. Prohibit Client Amount Override
    if (amountCook !== undefined && amountCook !== null && amountCook !== '') {
      return {
        status: 400,
        error: 'Client-specified amount is prohibited for emergency migration. Amount is strictly server-derived from hot wallet on-chain balance.',
        code: 'AMOUNT_OVERRIDE_PROHIBITED',
      };
    }

    // 6. Prohibit Client Intent ID
    if (intentId !== undefined && intentId !== null && intentId !== '') {
      return {
        status: 400,
        error: 'Client-specified intentId is prohibited. Financial intent identity is strictly derived by the server.',
        code: 'CLIENT_INTENT_PROHIBITED',
      };
    }

    // 7. Validate Server Destination
    const migrationTarget = this.env.EMERGENCY_MIGRATION_PUBKEY?.trim();
    if (!migrationTarget) {
      return {
        status: 503,
        error: 'Emergency migration is disabled: EMERGENCY_MIGRATION_PUBKEY is not configured in server environment.',
        code: 'MIGRATION_DESTINATION_NOT_CONFIGURED',
      };
    }

    let serverDestination;
    try {
      serverDestination = new PublicKey(migrationTarget);
    } catch {
      return {
        status: 503,
        error: 'Emergency migration failed: configured EMERGENCY_MIGRATION_PUBKEY is not a valid SVM public key.',
        code: 'INVALID_MIGRATION_DESTINATION_CONFIG',
      };
    }

    // 8. Mandatory Distributed Persistence
    if (!this.store.isConfigured()) {
      return {
        status: 503,
        error: 'Distributed persistence store (Upstash/Redis) is mandatory for privileged money movement.',
        code: 'PRIVILEGED_PERSISTENCE_UNAVAILABLE',
      };
    }

    const signerPublicKey = this.signer.publicKey.toBase58();

    // 9. Deterministic Server Economic Intent
    const economicIntentKey = this.deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signerPublicKey,
      recipientAddress: serverDestination.toBase58(),
    });

    // 10. Atomic Intent Reservation
    const reservation = await this.reserveIntent({
      intentId: economicIntentKey,
      operation: 'emergency_migration',
      recipientAddress: serverDestination.toBase58(),
    });

    if (!reservation.allowed) {
      if (reservation.status === 'CONFIRMED' && reservation.existingSignature) {
        return {
          status: 200,
          success: true,
          idempotent: true,
          method: 'server_signer',
          action: 'emergency_migration',
          intentId: economicIntentKey,
          signature: reservation.existingSignature,
        };
      }
      return {
        status: 409,
        error: reservation.error || 'Operation intent conflict or duplicate submission.',
        code: 'INTENT_CONFLICT',
      };
    }

    // 11. Server-Side Balance Derivation
    const transferLamports = this.mockBalanceLamports - STANDARD_TX_FEE_LAMPORTS;
    if (transferLamports <= 0n) {
      return {
        status: 400,
        error: 'Hot wallet balance is insufficient for emergency migration.',
        code: 'INSUFFICIENT_BALANCE',
      };
    }

    const calculatedCookAmount = Number(transferLamports) / LAMPORTS_PER_SOL;

    // Pre-broadcast persistence
    await this.updateIntent(economicIntentKey, 'SUBMITTED');

    // Simulate broadcast confirmation
    const dummySignature = bs58.encode(crypto.randomBytes(64));
    await this.updateIntent(economicIntentKey, 'CONFIRMED', dummySignature);

    return {
      status: 200,
      success: true,
      method: 'server_signer',
      action: 'emergency_migration',
      intentId: economicIntentKey,
      signature: dummySignature,
      amountCook: calculatedCookAmount,
      recipientAddress: serverDestination.toBase58(),
    };
  }
}

async function runTests() {
  console.log(' [TEST 1] Scope Boundary: Ordinary user sessions blocked from platform signer with 403');
  {
    const handler = new ProductionTransactionHandler();
    const res = await handler.handlePost({ authScope: 'user', body: { action: 'emergency_migration' } });
    assert.strictEqual(res.status, 403);
    assert.strictEqual(res.code, 'FORBIDDEN_SCOPE');
    console.log('   Ordinary user session rejected with 403 FORBIDDEN_SCOPE');
  }

  console.log(' [TEST 2] Disabled Operations: platform_sweep disabled fail-closed with 501');
  {
    const handler = new ProductionTransactionHandler();
    const res = await handler.handlePost({ authScope: 'admin', body: { action: 'platform_sweep' } });
    assert.strictEqual(res.status, 501);
    assert.strictEqual(res.code, 'PRIVILEGED_OPERATION_DISABLED');
    assert(res.error.includes('authoritative server-side financial intent'));
    console.log('   platform_sweep correctly rejected with 501 PRIVILEGED_OPERATION_DISABLED');
  }

  console.log(' [TEST 3] Disabled Operations: treasury_rebalance disabled fail-closed with 501');
  {
    const handler = new ProductionTransactionHandler();
    const res = await handler.handlePost({ authScope: 'admin', body: { action: 'treasury_rebalance' } });
    assert.strictEqual(res.status, 501);
    assert.strictEqual(res.code, 'PRIVILEGED_OPERATION_DISABLED');
    console.log('   treasury_rebalance correctly rejected with 501 PRIVILEGED_OPERATION_DISABLED');
  }

  console.log(' [TEST 4] Disabled Operations: system_settlement disabled fail-closed with 501');
  {
    const handler = new ProductionTransactionHandler();
    const res = await handler.handlePost({ authScope: 'admin', body: { action: 'system_settlement' } });
    assert.strictEqual(res.status, 501);
    assert.strictEqual(res.code, 'PRIVILEGED_OPERATION_DISABLED');
    console.log('   system_settlement correctly rejected with 501 PRIVILEGED_OPERATION_DISABLED');
  }

  console.log(' [TEST 5] Destination Authority: Client recipient override prohibited with 400');
  {
    const handler = new ProductionTransactionHandler();
    const res = await handler.handlePost({
      authScope: 'admin',
      body: {
        action: 'emergency_migration',
        recipientPublicKey: Keypair.generate().publicKey.toBase58(),
      },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.code, 'RECIPIENT_OVERRIDE_PROHIBITED');
    console.log('   Client recipient override rejected with 400 RECIPIENT_OVERRIDE_PROHIBITED');
  }

  console.log(' [TEST 6] Amount Authority: Client amount override prohibited with 400');
  {
    const handler = new ProductionTransactionHandler();
    const res = await handler.handlePost({
      authScope: 'admin',
      body: {
        action: 'emergency_migration',
        amountCook: 500,
      },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.code, 'AMOUNT_OVERRIDE_PROHIBITED');
    console.log('   Client amount override rejected with 400 AMOUNT_OVERRIDE_PROHIBITED');
  }

  console.log(' [TEST 7] Intent Identity Authority: Client intentId prohibited with 400');
  {
    const handler = new ProductionTransactionHandler();
    const res = await handler.handlePost({
      authScope: 'admin',
      body: {
        action: 'emergency_migration',
        intentId: 'attacker-intent-override-id',
      },
    });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.code, 'CLIENT_INTENT_PROHIBITED');
    console.log('   Client intentId rejected with 400 CLIENT_INTENT_PROHIBITED');
  }

  console.log(' [TEST 8] Destination Configuration: Missing EMERGENCY_MIGRATION_PUBKEY fails closed with 503');
  {
    const handler = new ProductionTransactionHandler({});
    const res = await handler.handlePost({ authScope: 'admin', body: { action: 'emergency_migration' } });
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.code, 'MIGRATION_DESTINATION_NOT_CONFIGURED');
    console.log('   Unset migration destination returns 503 MIGRATION_DESTINATION_NOT_CONFIGURED');
  }

  console.log(' [TEST 9] Persistence Requirement: Missing distributed store fails closed with 503');
  {
    const vault = Keypair.generate().publicKey.toBase58();
    const unconfiguredStore = new MockDistributedStore(false);
    const handler = new ProductionTransactionHandler({ EMERGENCY_MIGRATION_PUBKEY: vault }, unconfiguredStore);
    const res = await handler.handlePost({ authScope: 'admin', body: { action: 'emergency_migration' } });
    assert.strictEqual(res.status, 503);
    assert.strictEqual(res.code, 'PRIVILEGED_PERSISTENCE_UNAVAILABLE');
    console.log('   Missing distributed persistence returns 503 PRIVILEGED_PERSISTENCE_UNAVAILABLE');
  }

  console.log(' [TEST 10] Emergency Migration: Successful execution with server-derived balance and permanent intent');
  {
    const vault = Keypair.generate().publicKey.toBase58();
    const store = new MockDistributedStore(true);
    const handler = new ProductionTransactionHandler({ EMERGENCY_MIGRATION_PUBKEY: vault }, store);
    const res = await handler.handlePost({ authScope: 'admin', body: { action: 'emergency_migration' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.success, true);
    assert(res.signature, 'Signature must be returned');
    assert.strictEqual(res.amountCook, (50_000_000_000 - 5000) / 1e9);

    // Replay attempt under same version
    const resReplay = await handler.handlePost({ authScope: 'admin', body: { action: 'emergency_migration' } });
    assert.strictEqual(resReplay.status, 200);
    assert.strictEqual(resReplay.idempotent, true);
    assert.strictEqual(resReplay.signature, res.signature);
    console.log('   Emergency migration executed and replay returned idempotent receipt with zero double-spend');
  }

  console.log(' [TEST 11] Ambiguous Submission Reconciliation: SUBMISSION_UNKNOWN prevents retry');
  {
    const vault = Keypair.generate().publicKey.toBase58();
    const store = new MockDistributedStore(true);
    const handler = new ProductionTransactionHandler({ EMERGENCY_MIGRATION_PUBKEY: vault }, store);
    
    // Reserve intent
    const key = handler.deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: handler.signer.publicKey.toBase58(),
      recipientAddress: vault,
    });
    await handler.reserveIntent({ intentId: key, operation: 'emergency_migration', recipientAddress: vault });
    await handler.updateIntent(key, 'SUBMISSION_UNKNOWN');

    // Attempting another request while SUBMISSION_UNKNOWN
    const res = await handler.handlePost({ authScope: 'admin', body: { action: 'emergency_migration' } });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.code, 'INTENT_CONFLICT');
    assert(res.error.includes('ambiguous'));
    console.log('   SUBMISSION_UNKNOWN intent blocked from re-execution until reconciled');
  }

  console.log('\n================================================================');
  console.log('  ALL 11 PRODUCTION ADMIN CAPABILITY & REPAIR TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
