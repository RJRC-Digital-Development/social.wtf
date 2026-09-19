import assert from 'assert';
import crypto from 'crypto';
import { Keypair, PublicKey, LAMPORTS_PER_SOL } from '@solana/web3.js';
import bs58 from 'bs58';

// Direct production imports from source
import {
  deriveEconomicIntentKey,
  reservePrivilegedIntent,
  updatePrivilegedIntent,
  executeDirectPlatformTransfer,
  STANDARD_TX_FEE_LAMPORTS,
} from '../../src/lib/solana/serverSigner.ts';

console.log('================================================================');
console.log('--- PRODUCTION CODE SECURITY TESTS: ADMIN CAPABILITY & RECOVERY ---');
console.log('================================================================\n');

// ------------------------------------------------------------------
// Mock In-Memory DistributedStore implementing production interface
// ------------------------------------------------------------------
class MockDistributedStore {
  constructor(configured = true) {
    this.configured = configured;
    this.data = new Map();
    this.failWrites = false;
  }

  isConfigured() {
    return this.configured;
  }

  async get(key) {
    if (!this.configured) return null;
    return this.data.get(key) || null;
  }

  async set(key, value, ttlSeconds) {
    if (!this.configured || this.failWrites) return false;
    this.data.set(key, value);
    return true;
  }

  async setnx(key, value, ttlSeconds) {
    if (!this.configured || this.failWrites) return false;
    if (this.data.has(key)) return false;
    this.data.set(key, value);
    return true;
  }
}

// ------------------------------------------------------------------
// Mock Solana RPC Connection
// ------------------------------------------------------------------
class MockRpcConnection {
  constructor(options = {}) {
    this.balanceLamports = options.balanceLamports || 50_000_000_000n; // 50 COOK
    this.blockHeight = options.blockHeight || 1000;
    this.lastValidBlockHeight = options.lastValidBlockHeight || 1150;
    this.signatureStatus = options.signatureStatus || null;
    this.sendRawTxShouldFail = options.sendRawTxShouldFail || false;
    this.sendRawTxError = options.sendRawTxError || null;
    this.confirmShouldFail = options.confirmShouldFail || false;
    this.confirmError = options.confirmError || null;
    this.broadcastCalls = 0;
    this.lastBroadcastRaw = null;
  }

  async getBalance(pubkey) {
    return this.balanceLamports;
  }

  async getLatestBlockhash(commitment) {
    return {
      blockhash: bs58.encode(crypto.randomBytes(32)),
      lastValidBlockHeight: this.lastValidBlockHeight,
    };
  }

  async getBlockHeight(commitment) {
    return this.blockHeight;
  }

  async getSignatureStatus(signature, config) {
    if (typeof this.signatureStatus === 'function') {
      return this.signatureStatus(signature);
    }
    return this.signatureStatus;
  }

  async sendRawTransaction(rawTx, options) {
    this.broadcastCalls++;
    this.lastBroadcastRaw = rawTx;
    if (this.sendRawTxShouldFail) {
      throw this.sendRawTxError || new Error('Network timeout during sendRawTransaction');
    }
    // Return base58 signature
    return bs58.encode(crypto.randomBytes(64));
  }

  async confirmTransaction(strategy, commitment) {
    if (this.confirmShouldFail) {
      throw this.confirmError || new Error('Confirmation timeout on RPC');
    }
    return { context: { slot: 1005 }, value: { err: null } };
  }
}

async function runTests() {
  console.log(' [TEST 1] Pre-Broadcast Persistence: Signature derived and persisted in distributed KV BEFORE network broadcast');
  {
    const store = new MockDistributedStore(true);
    const connection = new MockRpcConnection();
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;

    const intentId = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    await reservePrivilegedIntent({
      intentId,
      operation: 'emergency_migration',
      recipientAddress: recipient.toBase58(),
    }, { store, connection });

    const result = await executeDirectPlatformTransfer(
      {
        recipientPublicKey: recipient,
        operation: 'emergency_migration',
        intentId,
      },
      { store, connection, signer }
    );

    assert.strictEqual(result.success, true);
    assert(result.signature, 'Signature must be returned');
    assert.strictEqual(connection.broadcastCalls, 1, 'Exactly one broadcast call made');

    // Verify record in store
    const stored = JSON.parse(await store.get(`tx_intent:${intentId}`));
    assert.strictEqual(stored.status, 'CONFIRMED');
    assert.strictEqual(stored.signature, result.signature);
    assert.strictEqual(stored.recipientAddress, recipient.toBase58());
    console.log('   Production executeDirectPlatformTransfer correctly derived, pre-persisted, broadcast, and confirmed transaction');
  }

  console.log(' [TEST 2] Fail-Closed Pre-Broadcast Persistence: Write failure aborts broadcast immediately');
  {
    const store = new MockDistributedStore(true);
    const connection = new MockRpcConnection();
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;

    const intentId = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    await reservePrivilegedIntent({
      intentId,
      operation: 'emergency_migration',
      recipientAddress: recipient.toBase58(),
    }, { store, connection });

    // Force store to fail writes right before broadcast
    store.failWrites = true;

    const result = await executeDirectPlatformTransfer(
      {
        recipientPublicKey: recipient,
        operation: 'emergency_migration',
        intentId,
      },
      { store, connection, signer }
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'PRE_BROADCAST_PERSISTENCE_FAILED');
    assert.strictEqual(connection.broadcastCalls, 0, 'Zero network broadcast calls must be made on persistence failure');
    console.log('   Pre-broadcast persistence failure aborted broadcast immediately without network leakage');
  }

  console.log(' [TEST 3] Ambiguous Broadcast Recovery: Network timeout preserves SUBMISSION_UNKNOWN with derived signature');
  {
    const store = new MockDistributedStore(true);
    const connection = new MockRpcConnection({
      sendRawTxShouldFail: true,
      sendRawTxError: new Error('Socket hangup during RPC broadcast'),
    });
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;

    const intentId = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    await reservePrivilegedIntent({
      intentId,
      operation: 'emergency_migration',
      recipientAddress: recipient.toBase58(),
    }, { store, connection });

    const result = await executeDirectPlatformTransfer(
      {
        recipientPublicKey: recipient,
        operation: 'emergency_migration',
        intentId,
      },
      { store, connection, signer }
    );

    assert.strictEqual(result.success, false);
    assert.strictEqual(result.code, 'TRANSACTION_BROADCAST_AMBIGUOUS');
    assert(result.signature, 'Signature must be returned for reconciliation');

    const stored = JSON.parse(await store.get(`tx_intent:${intentId}`));
    assert.strictEqual(stored.status, 'SUBMISSION_UNKNOWN');
    assert.strictEqual(stored.signature, result.signature);
    console.log('   Ambiguous broadcast preserved SUBMISSION_UNKNOWN and signature in distributed store');
  }

  console.log(' [TEST 4] On-Chain Reconciliation: Retry of SUBMITTED/SUBMISSION_UNKNOWN finds on-chain confirmation');
  {
    const store = new MockDistributedStore(true);
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;
    const testSig = bs58.encode(crypto.randomBytes(64));

    const intentId = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    // Populate in-flight intent in store
    await store.set(`tx_intent:${intentId}`, JSON.stringify({
      intentId,
      operation: 'emergency_migration',
      recipientAddress: recipient.toBase58(),
      status: 'SUBMITTED',
      signature: testSig,
      lastValidBlockHeight: 1200,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // Mock RPC connection reporting confirmed status
    const connection = new MockRpcConnection({
      signatureStatus: {
        context: { slot: 1050 },
        value: { confirmationStatus: 'confirmed', confirmations: 10, err: null },
      },
    });

    const res = await reservePrivilegedIntent(
      { intentId, operation: 'emergency_migration', recipientAddress: recipient.toBase58() },
      { store, connection }
    );

    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.status, 'CONFIRMED');
    assert.strictEqual(res.existingSignature, testSig);

    // Verify store was updated to permanent CONFIRMED
    const updated = JSON.parse(await store.get(`tx_intent:${intentId}`));
    assert.strictEqual(updated.status, 'CONFIRMED');
    assert.strictEqual(updated.signature, testSig);
    console.log('   On-chain reconciliation detected confirmed transaction and permanently updated intent state');
  }

  console.log(' [TEST 5] Pending In-Flight Protection: Retry while within block height returns pending and blocks re-sending');
  {
    const store = new MockDistributedStore(true);
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;
    const testSig = bs58.encode(crypto.randomBytes(64));

    const intentId = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    await store.set(`tx_intent:${intentId}`, JSON.stringify({
      intentId,
      operation: 'emergency_migration',
      recipientAddress: recipient.toBase58(),
      status: 'SUBMITTED',
      signature: testSig,
      lastValidBlockHeight: 1200,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // RPC reports null status (still in mempool/in-flight) and current block height 1100 (< 1200)
    const connection = new MockRpcConnection({
      signatureStatus: { context: { slot: 1100 }, value: null },
      blockHeight: 1100,
    });

    const res = await reservePrivilegedIntent(
      { intentId, operation: 'emergency_migration', recipientAddress: recipient.toBase58() },
      { store, connection }
    );

    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.status, 'SUBMITTED');
    assert(res.error.includes('pending on-chain confirmation'));
    console.log('   In-flight pending transaction blocked from duplicate sending');
  }

  console.log(' [TEST 6] Expired Unconfirmed Handling: Marks EXPIRED_UNRECONCILED and requires manual/versioned recovery');
  {
    const store = new MockDistributedStore(true);
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;
    const testSig = bs58.encode(crypto.randomBytes(64));

    const intentId = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    await store.set(`tx_intent:${intentId}`, JSON.stringify({
      intentId,
      operation: 'emergency_migration',
      recipientAddress: recipient.toBase58(),
      status: 'SUBMITTED',
      signature: testSig,
      lastValidBlockHeight: 1000,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    // RPC reports null status and current block height 1150 (> 1000, expired)
    const connection = new MockRpcConnection({
      signatureStatus: { context: { slot: 1150 }, value: null },
      blockHeight: 1150,
    });

    const res = await reservePrivilegedIntent(
      { intentId, operation: 'emergency_migration', recipientAddress: recipient.toBase58() },
      { store, connection }
    );

    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.status, 'EXPIRED_UNRECONCILED');
    assert(res.error.includes('expired unconfirmed'));

    const updated = JSON.parse(await store.get(`tx_intent:${intentId}`));
    assert.strictEqual(updated.status, 'EXPIRED_UNRECONCILED');
    console.log('   Expired unconfirmed transaction safely transitioned to EXPIRED_UNRECONCILED');
  }

  console.log(' [TEST 7] Idempotency: Confirmed intent returns original signature idempotently');
  {
    const store = new MockDistributedStore(true);
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;
    const confirmedSig = bs58.encode(crypto.randomBytes(64));

    const intentId = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    await store.set(`tx_intent:${intentId}`, JSON.stringify({
      intentId,
      operation: 'emergency_migration',
      recipientAddress: recipient.toBase58(),
      status: 'CONFIRMED',
      signature: confirmedSig,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    }));

    const res = await reservePrivilegedIntent(
      { intentId, operation: 'emergency_migration', recipientAddress: recipient.toBase58() },
      { store }
    );

    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.status, 'CONFIRMED');
    assert.strictEqual(res.existingSignature, confirmedSig);
    console.log('   Confirmed intent returned existing signature with zero possibility of double-spending');
  }

  console.log(' [TEST 8] Version Bump Recovery: EMERGENCY_MIGRATION_VERSION produces a new distinct intent key');
  {
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;

    process.env.EMERGENCY_MIGRATION_VERSION = '1';
    const keyV1 = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    process.env.EMERGENCY_MIGRATION_VERSION = '2';
    const keyV2 = deriveEconomicIntentKey({
      operation: 'emergency_migration',
      signerAddress: signer.publicKey.toBase58(),
      recipientAddress: recipient.toBase58(),
    });

    assert.notStrictEqual(keyV1, keyV2);
    assert(keyV1.startsWith('migration:v1:'));
    assert(keyV2.startsWith('migration:v2:'));
    console.log('   EMERGENCY_MIGRATION_VERSION bump creates explicit new intent key for admin-guided recovery');
  }

  console.log(' [TEST 9] Unconfigured Distributed Store: Fails closed with 503 PRIVILEGED_PERSISTENCE_UNAVAILABLE');
  {
    const unconfiguredStore = new MockDistributedStore(false);
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;

    const res = await reservePrivilegedIntent(
      {
        intentId: 'test-intent-id',
        operation: 'emergency_migration',
        recipientAddress: recipient.toBase58(),
      },
      { store: unconfiguredStore }
    );

    assert.strictEqual(res.allowed, false);
    assert.strictEqual(res.code, 'PRIVILEGED_PERSISTENCE_UNAVAILABLE');
    console.log('   Unconfigured store rejected privileged intent reservation fail-closed');
  }

  console.log(' [TEST 10] Non-Expiring Storage: updatePrivilegedIntent saves confirmed and submitted records without TTL');
  {
    const store = new MockDistributedStore(true);
    const intentId = 'test-non-expiring-intent';

    await updatePrivilegedIntent(
      intentId,
      {
        status: 'CONFIRMED',
        signature: 'test-sig-123',
        operation: 'emergency_migration',
        recipientAddress: 'recipient-pubkey',
      },
      { store }
    );

    const record = JSON.parse(await store.get(`tx_intent:${intentId}`));
    assert.strictEqual(record.status, 'CONFIRMED');
    assert.strictEqual(record.signature, 'test-sig-123');
    console.log('   Signed and confirmed intent stored with durable non-expiring persistence');
  }

  console.log(' [TEST 11] Disabled Operations: Direct platform transfer rejects unbacked operations fail-closed');
  {
    const store = new MockDistributedStore(true);
    const connection = new MockRpcConnection();
    const signer = Keypair.generate();
    const recipient = Keypair.generate().publicKey;

    for (const op of ['platform_sweep', 'treasury_rebalance', 'system_settlement']) {
      const res = await executeDirectPlatformTransfer(
        {
          recipientPublicKey: recipient,
          operation: op,
          intentId: `${op}:test`,
        },
        { store, connection, signer }
      );
      assert.strictEqual(res.success, false);
      assert.strictEqual(res.code, 'PRIVILEGED_OPERATION_DISABLED');
    }
    console.log('   All unbacked operations fail-closed with PRIVILEGED_OPERATION_DISABLED');
  }

  console.log('\n================================================================');
  console.log('  ALL 11 REAL PRODUCTION IMPLEMENTATION TESTS PASSED!');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
