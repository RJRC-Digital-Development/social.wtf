import assert from 'node:assert/strict';
import { Keypair } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import { POST as challengeHandler } from '../../src/app/api/auth/wallet/challenge/route.ts';
import { POST as bindHandler } from '../../src/app/api/auth/wallet/bind/route.ts';
import {
  registerAccountAsync,
  getAccountIdByWalletAsync,
  getAccountByIdAsync,
  listAllAccountsAsync,
  resetAccountStoreForTests,
} from '../../src/lib/data/accountStore.ts';
import { resetAuditStoreForTests } from '../../src/lib/data/auditStore.ts';
import { createAccountSession } from '../../src/lib/security/session.ts';
import { distributedStore } from '../../src/lib/security/distributedStore.ts';

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
    headers.set('Cookie', `session=${token}`);
  }
  return new Request(url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
}

async function runTests() {
  console.log('================================================================');
  console.log('--- REPAIR: WALLET BINDING ROUTE ADVERSARIAL SUITE (10 CASES) ---');
  console.log('================================================================\n');

  resetAccountStoreForTests();
  resetAuditStoreForTests();
  distributedStore.clearLocalFallback();

  // Create test accounts
  const resA = await registerAccountAsync('alice_wallet_test', 'PasswordAlice123!');
  const userA = resA.account;
  const tokenA = createAccountSession({ accountId: userA.accountId, username: userA.username }, ['ROLE_USER']);

  const resB = await registerAccountAsync('bob_wallet_test', 'PasswordBob123!');
  const userB = resB.account;
  const tokenB = createAccountSession({ accountId: userB.accountId, username: userB.username }, ['ROLE_USER']);

  const walletA = Keypair.generate();
  const walletAAddress = walletA.publicKey.toBase58();

  const walletB = Keypair.generate();
  const walletBAddress = walletB.publicKey.toBase58();

  // [TEST 1] valid server challenge + matching account + matching wallet + correct signature -> PASS
  console.log('[TEST 1] Valid server challenge + matching account + matching wallet + correct signature -> PASS');
  const chalReq1 = createAuthRequest('http://localhost:3000/api/auth/wallet/challenge', { walletAddress: walletAAddress }, tokenA);
  const chalRes1 = await challengeHandler(chalReq1);
  const chalData1 = await chalRes1.json();
  assert.equal(chalRes1.status, 200, 'Challenge generation must succeed');
  assert.ok(chalData1.nonce, 'Challenge must return nonce');
  assert.ok(chalData1.message, 'Challenge must return message');

  const sig1 = signMessage(walletA, chalData1.message);
  const bindReq1 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletAAddress,
    nonce: chalData1.nonce,
    signatureBase58: sig1,
  }, tokenA);
  const bindRes1 = await bindHandler(bindReq1);
  const bindData1 = await bindRes1.json();
  assert.equal(bindRes1.status, 200, 'Bind request must succeed with HTTP 200');
  assert.equal(bindData1.success, true, 'Bind response must indicate success');
  assert.equal(bindData1.binding.status, 'VERIFIED');
  assert.equal(bindData1.binding.accountId, userA.accountId);
  assert.equal(bindData1.binding.walletAddress, walletAAddress);
  console.log('  PASS: Valid challenge, matching account, matching wallet, and correct signature successfully bound.\n');

  // [TEST 2] nonexistent nonce -> REJECT
  console.log('[TEST 2] Nonexistent nonce -> REJECT');
  const fakeNonce = 'siws_bind_00000000000000000000000000000000';
  const sig2 = signMessage(walletB, 'Any message');
  const bindReq2 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletBAddress,
    nonce: fakeNonce,
    signatureBase58: sig2,
  }, tokenB);
  const bindRes2 = await bindHandler(bindReq2);
  assert.equal(bindRes2.status, 400, 'Nonexistent nonce must be rejected with HTTP 400');
  const bindData2 = await bindRes2.json();
  assert.equal(bindData2.error, 'INVALID_CHALLENGE');
  console.log('  PASS: Nonexistent nonce safely rejected.\n');

  // [TEST 3] consumed nonce replay -> REJECT
  console.log('[TEST 3] Consumed nonce replay -> REJECT');
  const bindReq3 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletAAddress,
    nonce: chalData1.nonce,
    signatureBase58: sig1,
  }, tokenA);
  const bindRes3 = await bindHandler(bindReq3);
  assert.equal(bindRes3.status, 400, 'Replayed consumed nonce must be rejected with HTTP 400');
  const bindData3 = await bindRes3.json();
  assert.equal(bindData3.error, 'INVALID_CHALLENGE');
  console.log('  PASS: Replayed consumed nonce strictly rejected via atomic consumption.\n');

  // [TEST 4] expired nonce -> REJECT
  console.log('[TEST 4] Expired nonce -> REJECT');
  const expiredNonce = 'siws_bind_expired_test_nonce_99999';
  const expiredIssuedAt = new Date(Date.now() - 300_000).toISOString();
  const expiredMsg = `Sign this message to bind wallet ${walletBAddress} to Social.wtf account ${userB.accountId}.\n\nNonce: ${expiredNonce}\nIssued At: ${expiredIssuedAt}`;
  const expiredRecord = {
    accountId: userB.accountId,
    walletAddress: walletBAddress,
    nonce: expiredNonce,
    message: expiredMsg,
    issuedAt: expiredIssuedAt,
    expiresAt: Date.now() - 1000, // Expired 1 second ago
  };
  await distributedStore.set(`auth:wallet_challenge:${expiredNonce}`, JSON.stringify(expiredRecord), 60);

  const sig4 = signMessage(walletB, expiredMsg);
  const bindReq4 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletBAddress,
    nonce: expiredNonce,
    signatureBase58: sig4,
  }, tokenB);
  const bindRes4 = await bindHandler(bindReq4);
  assert.equal(bindRes4.status, 400, 'Expired challenge nonce must be rejected with HTTP 400');
  const bindData4 = await bindRes4.json();
  assert.equal(bindData4.error, 'CHALLENGE_EXPIRED');
  console.log('  PASS: Expired nonce safely rejected.\n');

  // [TEST 5] challenge issued for account A presented by authenticated account B -> REJECT
  console.log('[TEST 5] Challenge issued for Account A presented by authenticated Account B -> REJECT');
  const chalReq5 = createAuthRequest('http://localhost:3000/api/auth/wallet/challenge', { walletAddress: walletBAddress }, tokenA);
  const chalRes5 = await challengeHandler(chalReq5);
  const chalData5 = await chalRes5.json();
  assert.equal(chalRes5.status, 200);

  const sig5 = signMessage(walletB, chalData5.message);
  // Account B presents challenge issued for Account A
  const bindReq5 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletBAddress,
    nonce: chalData5.nonce,
    signatureBase58: sig5,
  }, tokenB);
  const bindRes5 = await bindHandler(bindReq5);
  assert.equal(bindRes5.status, 403, 'Account mismatch must be rejected with HTTP 403');
  const bindData5 = await bindRes5.json();
  assert.equal(bindData5.error, 'ACCOUNT_MISMATCH');
  console.log('  PASS: Cross-account challenge presentation safely rejected with HTTP 403.\n');

  // [TEST 6] challenge issued for wallet A submitted as wallet B -> REJECT
  console.log('[TEST 6] Challenge issued for Wallet A submitted as Wallet B -> REJECT');
  const chalReq6 = createAuthRequest('http://localhost:3000/api/auth/wallet/challenge', { walletAddress: walletBAddress }, tokenB);
  const chalRes6 = await challengeHandler(chalReq6);
  const chalData6 = await chalRes6.json();
  assert.equal(chalRes6.status, 200);

  const walletC = Keypair.generate();
  const walletCAddress = walletC.publicKey.toBase58();
  const sig6 = signMessage(walletC, chalData6.message);

  const bindReq6 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletCAddress,
    nonce: chalData6.nonce,
    signatureBase58: sig6,
  }, tokenB);
  const bindRes6 = await bindHandler(bindReq6);
  assert.equal(bindRes6.status, 400, 'Wallet mismatch must be rejected with HTTP 400');
  const bindData6 = await bindRes6.json();
  assert.equal(bindData6.error, 'WALLET_MISMATCH');
  console.log('  PASS: Wallet address mismatch against server challenge safely rejected.\n');

  // [TEST 7] correct wallet signs attacker-controlled alternate body.message -> REJECT
  console.log('[TEST 7] Correct wallet signs attacker-controlled alternate body.message -> REJECT');
  const chalReq7 = createAuthRequest('http://localhost:3000/api/auth/wallet/challenge', { walletAddress: walletBAddress }, tokenB);
  const chalRes7 = await challengeHandler(chalReq7);
  const chalData7 = await chalRes7.json();
  assert.equal(chalRes7.status, 200);

  const alternateMessage = 'Attacker alternate text message claiming wallet ownership';
  const sig7 = signMessage(walletB, alternateMessage);

  const bindReq7 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletBAddress,
    nonce: chalData7.nonce,
    signatureBase58: sig7,
    message: alternateMessage,
  }, tokenB);
  const bindRes7 = await bindHandler(bindReq7);
  assert.equal(bindRes7.status, 400, 'Attacker alternate body.message must be rejected');
  const bindData7 = await bindRes7.json();
  assert.equal(bindData7.error, 'SIGNATURE_VERIFICATION_FAILED');
  console.log('  PASS: Signature over client body.message strictly rejected; server verifies only authoritative challenge message.\n');

  // [TEST 8] modified canonical challenge message -> REJECT
  console.log('[TEST 8] Modified canonical challenge message -> REJECT');
  const chalReq8 = createAuthRequest('http://localhost:3000/api/auth/wallet/challenge', { walletAddress: walletBAddress }, tokenB);
  const chalRes8 = await challengeHandler(chalReq8);
  const chalData8 = await chalRes8.json();
  assert.equal(chalRes8.status, 200);

  const modifiedMessage = chalData8.message + ' EXTRA_FORGED_DATA';
  const sig8 = signMessage(walletB, modifiedMessage);

  const bindReq8 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletBAddress,
    nonce: chalData8.nonce,
    signatureBase58: sig8,
  }, tokenB);
  const bindRes8 = await bindHandler(bindReq8);
  assert.equal(bindRes8.status, 400, 'Signature over modified canonical message must fail verification');
  const bindData8 = await bindRes8.json();
  assert.equal(bindData8.error, 'SIGNATURE_VERIFICATION_FAILED');
  console.log('  PASS: Modified challenge message strictly rejected.\n');

  // [TEST 9] signature from wallet B for wallet A challenge -> REJECT
  console.log('[TEST 9] Signature from Wallet B for Wallet A challenge -> REJECT');
  const chalReq9 = createAuthRequest('http://localhost:3000/api/auth/wallet/challenge', { walletAddress: walletAAddress }, tokenA);
  const chalRes9 = await challengeHandler(chalReq9);
  const chalData9 = await chalRes9.json();
  assert.equal(chalRes9.status, 200);

  // Sign with wrong wallet (walletB instead of walletA)
  const wrongSig9 = signMessage(walletB, chalData9.message);
  const bindReq9 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletAAddress,
    nonce: chalData9.nonce,
    signatureBase58: wrongSig9,
  }, tokenA);
  const bindRes9 = await bindHandler(bindReq9);
  assert.equal(bindRes9.status, 400, 'Wrong wallet signature must fail verification');
  const bindData9 = await bindRes9.json();
  assert.equal(bindData9.error, 'SIGNATURE_VERIFICATION_FAILED');
  console.log('  PASS: Signature from different wallet strictly rejected.\n');

  // [TEST 10] successful bind still maps wallet to the SAME existing accountId and creates no second account
  console.log('[TEST 10] Successful bind maps wallet to SAME existing accountId and creates no second account');
  const initialAccounts = await listAllAccountsAsync();
  const initialAccountCount = initialAccounts.length;

  const chalReq10 = createAuthRequest('http://localhost:3000/api/auth/wallet/challenge', { walletAddress: walletBAddress }, tokenB);
  const chalRes10 = await challengeHandler(chalReq10);
  const chalData10 = await chalRes10.json();
  assert.equal(chalRes10.status, 200);

  const sig10 = signMessage(walletB, chalData10.message);
  const bindReq10 = createAuthRequest('http://localhost:3000/api/auth/wallet/bind', {
    walletAddress: walletBAddress,
    nonce: chalData10.nonce,
    signatureBase58: sig10,
  }, tokenB);
  const bindRes10 = await bindHandler(bindReq10);
  assert.equal(bindRes10.status, 200, 'Bind must succeed');

  const afterAccounts = await listAllAccountsAsync();
  assert.equal(afterAccounts.length, initialAccountCount, 'Account count must remain identical (zero new accounts created)');

  const mappedAccountId = await getAccountIdByWalletAsync(walletBAddress);
  assert.equal(mappedAccountId, userB.accountId, 'Bound wallet must resolve directly to userB accountId');

  const fetchedAccountB = await getAccountByIdAsync(userB.accountId);
  assert.equal(fetchedAccountB.primaryWalletAddress, walletBAddress, 'User B primary wallet must reflect bound wallet');
  console.log('  PASS: Wallet binding preserves singular canonical accountId and creates zero parallel identities.\n');

  console.log('================================================================');
  console.log('--- ALL 10 WALLET BINDING ADVERSARIAL TESTS PASSED ---');
  console.log('================================================================\n');
}

runTests().catch((err) => {
  console.error('Test failure:', err);
  process.exit(1);
});
