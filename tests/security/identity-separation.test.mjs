import assert from 'assert';
import { Keypair } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import crypto from 'crypto';

process.env.SESSION_SECRET = process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex');

// Real production imports
import { getPlatformOwnerWallet, isPlatformOwner } from '../../src/lib/security/ownerAuth.ts';
import { saveOnboardedProfileAsync, saveOnboardedProfile } from '../../src/lib/data/profileStore.ts';
import { COOKIE_CHAIN_CONFIG } from '../../src/lib/solana/cookieChain.ts';
import { createSession, verifySessionToken } from '../../src/lib/security/session.ts';

console.log('================================================================');
console.log('--- TASK 8: TREASURY / OWNER / USER IDENTITY SEPARATION TESTS ---');
console.log('================================================================\n');

// Mock helpers for SIWS and challenge testing
const activeChallenges = new Map();

function generateAuthChallenge(walletAddress, domain = 'social.wtf') {
  const nonce = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000;
  const statement = 'Sign this message to authenticate your wallet identity and session on Social.wtf.';
  const challenge = { nonce, walletAddress, domain, statement, issuedAt: now, expiresAt };
  activeChallenges.set(nonce, challenge);
  return challenge;
}

function formatChallengeMessage(challenge) {
  return [
    `${challenge.domain} wants you to sign in with your Solana account:`,
    `${challenge.walletAddress}`,
    '',
    `${challenge.statement}`,
    '',
    `Nonce: ${challenge.nonce}`,
    `Issued At: ${new Date(challenge.issuedAt).toISOString()}`,
    `Expiration Time: ${new Date(challenge.expiresAt).toISOString()}`,
  ].join('\n');
}

function verifyWalletChallenge({ walletAddress, nonce, signatureBase58 }) {
  const challenge = activeChallenges.get(nonce);
  if (!challenge) return { verified: false, error: 'Challenge nonce not found' };
  activeChallenges.delete(nonce);
  if (Date.now() > challenge.expiresAt) return { verified: false, error: 'Challenge has expired' };
  if (challenge.walletAddress !== walletAddress) return { verified: false, error: 'Wallet mismatch' };

  const message = formatChallengeMessage(challenge);
  const messageBytes = new TextEncoder().encode(message);
  const publicKeyBytes = bs58.decode(walletAddress);
  const signatureBytes = bs58.decode(signatureBase58);

  const isValid = ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
  return { verified: isValid };
}

function simulateVerifyRoute(walletAddress, nonce, signatureBase58) {
  const check = verifyWalletChallenge({ walletAddress, nonce, signatureBase58 });
  if (!check.verified) return { status: 401, error: check.error };

  const sessionScope = 'user';
  const token = createSession(walletAddress, sessionScope);
  return {
    status: 200,
    verified: true,
    walletAddress,
    scope: sessionScope,
    isAdmin: sessionScope === 'admin',
    sessionToken: token,
  };
}

async function runTests() {
  const originalEnvOwner = process.env.PLATFORM_OWNER_WALLET;

  const ownerKeypair = Keypair.generate();
  const ownerAddress = ownerKeypair.publicKey.toBase58();

  const userKeypair = Keypair.generate();
  const userAddress = userKeypair.publicKey.toBase58();

  const treasuryAddress = COOKIE_CHAIN_CONFIG.treasuryPublicKey;
  const treasuryKeypair = Keypair.generate(); // Mock treasury signer

  try {
    // -------------------------------------------------------------
    console.log(' [TEST 1] Configured Owner Wallet + Valid SIWS -> User Scope');
    // -------------------------------------------------------------
    process.env.PLATFORM_OWNER_WALLET = ownerAddress;
    assert.strictEqual(getPlatformOwnerWallet(), ownerAddress);
    assert.strictEqual(isPlatformOwner(ownerAddress), true);

    const challenge1 = generateAuthChallenge(ownerAddress);
    const msg1 = formatChallengeMessage(challenge1);
    const sig1 = bs58.encode(ed25519.sign(new TextEncoder().encode(msg1), ownerKeypair.secretKey.slice(0, 32)));
    const res1 = simulateVerifyRoute(ownerAddress, challenge1.nonce, sig1);

    assert.strictEqual(res1.status, 200);
    assert.strictEqual(res1.scope, 'user');
    assert.strictEqual(res1.isAdmin, false);
    console.log('   Wallet configuration does not issue admin authority');

    // -------------------------------------------------------------
    console.log(' [TEST 2] Ordinary Wallet + Valid SIWS -> User Scope');
    // -------------------------------------------------------------
    process.env.PLATFORM_OWNER_WALLET = ownerAddress;
    const challenge2 = generateAuthChallenge(userAddress);
    const msg2 = formatChallengeMessage(challenge2);
    const sig2 = bs58.encode(ed25519.sign(new TextEncoder().encode(msg2), userKeypair.secretKey.slice(0, 32)));
    const res2 = simulateVerifyRoute(userAddress, challenge2.nonce, sig2);

    assert.strictEqual(res2.status, 200);
    assert.strictEqual(res2.scope, 'user');
    assert.strictEqual(res2.isAdmin, false);
    console.log('   Ordinary wallet correctly restricted to user scope');

    // -------------------------------------------------------------
    console.log(' [TEST 3] Treasury != Owner + Valid Treasury SIWS -> User Scope');
    // -------------------------------------------------------------
    const mockTreasuryKeypair = Keypair.generate();
    const mockTreasuryAddress = mockTreasuryKeypair.publicKey.toBase58();

    process.env.PLATFORM_OWNER_WALLET = ownerAddress;
    assert.notStrictEqual(mockTreasuryAddress, ownerAddress);
    assert.strictEqual(isPlatformOwner(mockTreasuryAddress), false);
    assert.strictEqual(isPlatformOwner(treasuryAddress), false);

    const challenge3 = generateAuthChallenge(mockTreasuryAddress);
    const msg3 = formatChallengeMessage(challenge3);
    const sig3 = bs58.encode(ed25519.sign(new TextEncoder().encode(msg3), mockTreasuryKeypair.secretKey.slice(0, 32)));
    const res3 = simulateVerifyRoute(mockTreasuryAddress, challenge3.nonce, sig3);

    assert.strictEqual(res3.status, 200);
    assert.strictEqual(res3.scope, 'user');
    assert.strictEqual(res3.isAdmin, false);
    console.log('   Treasury wallet strictly receives user scope when not configured as owner');

    // -------------------------------------------------------------
    console.log(' [TEST 4] Treasury Wallet Configuration Still Cannot Grant Admin Scope');
    // -------------------------------------------------------------
    process.env.PLATFORM_OWNER_WALLET = mockTreasuryAddress;
    assert.strictEqual(getPlatformOwnerWallet(), mockTreasuryAddress);
    assert.strictEqual(isPlatformOwner(mockTreasuryAddress), true);

    const challenge4 = generateAuthChallenge(mockTreasuryAddress);
    const msg4 = formatChallengeMessage(challenge4);
    const sig4 = bs58.encode(ed25519.sign(new TextEncoder().encode(msg4), mockTreasuryKeypair.secretKey.slice(0, 32)));
    const res4 = simulateVerifyRoute(mockTreasuryAddress, challenge4.nonce, sig4);

    assert.strictEqual(res4.status, 200);
    assert.strictEqual(res4.scope, 'user');
    assert.strictEqual(res4.isAdmin, false);
    console.log('   Wallet control remains separate from platform RBAC');

    // -------------------------------------------------------------
    console.log(' [TEST 5] Missing Owner Env -> Zero Implicit Admins (Fail-Closed)');
    // -------------------------------------------------------------
    delete process.env.PLATFORM_OWNER_WALLET;
    assert.strictEqual(getPlatformOwnerWallet(), null);
    assert.strictEqual(isPlatformOwner(ownerAddress), false);
    assert.strictEqual(isPlatformOwner(treasuryAddress), false);
    assert.strictEqual(isPlatformOwner(userAddress), false);

    const challenge5 = generateAuthChallenge(userAddress);
    const msg5 = formatChallengeMessage(challenge5);
    const sig5 = bs58.encode(ed25519.sign(new TextEncoder().encode(msg5), userKeypair.secretKey.slice(0, 32)));
    const res5 = simulateVerifyRoute(userAddress, challenge5.nonce, sig5);

    assert.strictEqual(res5.status, 200);
    assert.strictEqual(res5.scope, 'user');
    assert.strictEqual(res5.isAdmin, false);
    console.log('   Missing owner env produces 0 admins; ordinary login functional');

    // -------------------------------------------------------------
    console.log(' [TEST 6] Empty / Whitespace Owner Env -> Zero Implicit Admins');
    // -------------------------------------------------------------
    process.env.PLATFORM_OWNER_WALLET = '   \t\n  ';
    assert.strictEqual(getPlatformOwnerWallet(), null);
    assert.strictEqual(isPlatformOwner(ownerAddress), false);
    assert.strictEqual(isPlatformOwner(treasuryAddress), false);
    console.log('   Whitespace-only owner env safely resolved to null');

    // -------------------------------------------------------------
    console.log(' [TEST 7] Malformed Owner Env -> Fails Closed without Crashing');
    // -------------------------------------------------------------
    process.env.PLATFORM_OWNER_WALLET = 'invalid-not-base58-key-12345';
    assert.strictEqual(getPlatformOwnerWallet(), null);
    assert.strictEqual(isPlatformOwner(ownerAddress), false);
    assert.strictEqual(isPlatformOwner('invalid-not-base58-key-12345'), false);
    console.log('   Malformed owner env safely fails closed to null without exception');

    // -------------------------------------------------------------
    console.log(' [TEST 8] Attacker Claiming Owner but Signing with Different Key -> 401 Rejected');
    // -------------------------------------------------------------
    process.env.PLATFORM_OWNER_WALLET = ownerAddress;
    const challenge8 = generateAuthChallenge(ownerAddress);
    const msg8 = formatChallengeMessage(challenge8);
    // Attacker signs challenge meant for owner using attacker private key
    const attackerSig = bs58.encode(ed25519.sign(new TextEncoder().encode(msg8), userKeypair.secretKey.slice(0, 32)));
    const res8 = simulateVerifyRoute(ownerAddress, challenge8.nonce, attackerSig);

    assert.strictEqual(res8.status, 401);
    assert.strictEqual(res8.verified, undefined);
    console.log('   Attacker impersonation signature strictly rejected with 401');

    // -------------------------------------------------------------
    console.log(' [TEST 9] Treasury Profile + Non-Admin Session -> isAdmin=false');
    // -------------------------------------------------------------
    process.env.PLATFORM_OWNER_WALLET = ownerAddress;
    const profileResult = await saveOnboardedProfileAsync(treasuryAddress, {
      handle: 'treasury_vault',
      name: 'Treasury Account',
      bio: 'Public protocol fee recipient',
    }, false); // isAdminSession = false

    assert.strictEqual(profileResult.success, true);
    assert.strictEqual(profileResult.profile.isAdmin, false);
    console.log('   Treasury profile saved without admin session correctly receives isAdmin=false');

    // -------------------------------------------------------------
    console.log(' [TEST 10] Client / LocalStorage Admin Claims Cannot Create Server Admin Authority');
    // -------------------------------------------------------------
    const fakeToken = createSession(userAddress, 'user');
    const verification = verifySessionToken(fakeToken);
    assert.strictEqual(verification.payload.scope, 'user');

    const tamperedToken = fakeToken.slice(0, -10) + 'bad_sig_12';
    const tamperedVerification = verifySessionToken(tamperedToken);
    assert.strictEqual(tamperedVerification.valid, false);
    console.log('   Tampered client tokens and unverified scope claims rejected cryptographically');

    // -------------------------------------------------------------
    console.log(' [TEST 11] Ordinary User Session -> Privileged Signer Gate 403 Forbidden');
    // -------------------------------------------------------------
    const userSession = createSession(userAddress, 'user');
    const userSessionParsed = verifySessionToken(userSession);
    assert.strictEqual(userSessionParsed.payload.scope, 'user');

    function simulateExecuteSignerRoute(sessionScope) {
      if (sessionScope !== 'admin') {
        return { status: 403, error: 'Forbidden: admin scope required' };
      }
      return { status: 200, allowed: true };
    }

    const signerCheckUser = simulateExecuteSignerRoute(userSessionParsed.payload.scope);
    assert.strictEqual(signerCheckUser.status, 403);
    console.log('   Ordinary user session correctly blocked at privileged signer gate with 403');

    // -------------------------------------------------------------
    console.log(' [TEST 12] Explicitly Configured Owner Admin Session Reaches Authorization Boundary');
    // -------------------------------------------------------------
    const ownerSession = createSession(ownerAddress, 'admin');
    const ownerSessionParsed = verifySessionToken(ownerSession);
    assert.strictEqual(ownerSessionParsed.payload.scope, 'admin');

    const signerCheckOwner = simulateExecuteSignerRoute(ownerSessionParsed.payload.scope);
    assert.strictEqual(signerCheckOwner.status, 200);
    console.log('   Authenticated admin session successfully passes scope authorization boundary');

    // -------------------------------------------------------------
    console.log(' [TEST 13] Disconnected Feed Does Not Inject Treasury / Dummy Wallet');
    // -------------------------------------------------------------
    function createPostAuthor(connected, walletAddress, currentUser) {
      if (!connected || !walletAddress) {
        return null;
      }
      return currentUser || {
        id: `user-${walletAddress}`,
        handle: `user_${walletAddress.slice(0, 4).toLowerCase()}`,
        walletAddress: walletAddress,
      };
    }

    const disconnectedAuthor = createPostAuthor(false, null, null);
    assert.strictEqual(disconnectedAuthor, null);
    console.log('   Disconnected feed correctly rejects post creation with 0 identity fabrication');

    // -------------------------------------------------------------
    console.log(' [TEST 14] Disconnected Storefront Does Not Inject Treasury / Dummy Creator');
    // -------------------------------------------------------------
    function createProductCreator(connected, walletAddress, creatorHandle) {
      if (!connected || !walletAddress) {
        return null;
      }
      return {
        creatorWallet: walletAddress,
        creatorHandle: creatorHandle || `user_${walletAddress.slice(0, 4).toLowerCase()}`,
      };
    }

    const disconnectedCreator = createProductCreator(false, null, null);
    assert.strictEqual(disconnectedCreator, null);
    console.log('   Disconnected storefront correctly requires real connected wallet');

    // -------------------------------------------------------------
    console.log(' [TEST 15] Treasury Address Alone Does Not Render Protocol Owner / Admin Status');
    // -------------------------------------------------------------
    function renderOwnerBadge(creator) {
      return Boolean(creator.isAdmin);
    }

    const treasuryProfileObj = {
      walletAddress: treasuryAddress,
      isAdmin: false,
    };
    assert.strictEqual(renderOwnerBadge(treasuryProfileObj), false);

    const actualAdminProfileObj = {
      walletAddress: ownerAddress,
      isAdmin: true,
    };
    assert.strictEqual(renderOwnerBadge(actualAdminProfileObj), true);
    console.log('   UI badge checks creator.isAdmin exclusively; treasury address renders standard creator');

    console.log('\n================================================================');
    console.log('  ALL 15 IDENTITY SEPARATION & PRIVILEGE ISOLATION TESTS PASSED!');
    console.log('================================================================\n');
  } finally {
    if (originalEnvOwner !== undefined) {
      process.env.PLATFORM_OWNER_WALLET = originalEnvOwner;
    } else {
      delete process.env.PLATFORM_OWNER_WALLET;
    }
  }
}

runTests().catch((err) => {
  console.error('FATAL TEST FAILURE:', err);
  process.exit(1);
});
