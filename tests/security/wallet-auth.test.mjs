import assert from 'assert';
import { Keypair } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import crypto from 'crypto';

console.log('--- RUNNING CRYPTOGRAPHIC WALLET AUTH ADVERSARIAL TESTS ---');

const activeChallenges = new Map();

function generateAuthChallenge(walletAddress, domain = 'social.wtf') {
  const nonce = crypto.randomBytes(24).toString('hex');
  const now = Date.now();
  const expiresAt = now + 5 * 60 * 1000;
  const statement = 'Sign this message to authenticate your wallet identity and session on Social.wtf.';

  const challenge = {
    nonce,
    walletAddress,
    domain,
    statement,
    issuedAt: now,
    expiresAt,
  };

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
  if (!challenge) {
    return { verified: false, error: 'Challenge nonce not found or already consumed' };
  }

  // Anti-Replay: Consume nonce immediately
  activeChallenges.delete(nonce);

  if (Date.now() > challenge.expiresAt) {
    return { verified: false, error: 'Challenge has expired' };
  }

  if (challenge.walletAddress !== walletAddress) {
    return { verified: false, error: 'Wallet address does not match challenge target' };
  }

  try {
    const message = formatChallengeMessage(challenge);
    const messageBytes = new TextEncoder().encode(message);
    const publicKeyBytes = bs58.decode(walletAddress);
    const signatureBytes = bs58.decode(signatureBase58);

    if (signatureBytes.length !== 64) {
      return { verified: false, error: 'Invalid signature byte length' };
    }

    const isValid = ed25519.verify(signatureBytes, messageBytes, publicKeyBytes);
    return { verified: isValid };
  } catch (err) {
    return { verified: false, error: err.message };
  }
}

// Test 1: Authentic Signature Verification
{
  const keypair = Keypair.generate();
  const walletAddress = keypair.publicKey.toBase58();
  const challenge = generateAuthChallenge(walletAddress);
  const message = formatChallengeMessage(challenge);
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = ed25519.sign(messageBytes, keypair.secretKey.slice(0, 32));
  const signatureBase58 = bs58.encode(signatureBytes);

  const result = verifyWalletChallenge({
    walletAddress,
    nonce: challenge.nonce,
    signatureBase58,
  });

  assert.strictEqual(result.verified, true);
  console.log('✓ Test 1: Authentic Ed25519 wallet challenge verified successfully');

  // Test 2: Anti-Replay Attack Protection
  const replayResult = verifyWalletChallenge({
    walletAddress,
    nonce: challenge.nonce,
    signatureBase58,
  });

  assert.strictEqual(replayResult.verified, false);
  assert.strictEqual(replayResult.error, 'Challenge nonce not found or already consumed');
  console.log('✓ Test 2: Replay attack with previously consumed nonce successfully rejected');
}

// Test 3: Signature Forgery / Corruption
{
  const keypair = Keypair.generate();
  const walletAddress = keypair.publicKey.toBase58();
  const challenge = generateAuthChallenge(walletAddress);
  const message = formatChallengeMessage(challenge);
  const messageBytes = new TextEncoder().encode(message);
  const signatureBytes = ed25519.sign(messageBytes, keypair.secretKey.slice(0, 32));

  // Corrupt a byte in signature
  signatureBytes[0] ^= 0xff;
  const corruptedSignature = bs58.encode(signatureBytes);

  const result = verifyWalletChallenge({
    walletAddress,
    nonce: challenge.nonce,
    signatureBase58: corruptedSignature,
  });

  assert.strictEqual(result.verified, false);
  console.log('✓ Test 3: Forged / corrupted signature byte rejected');
}

// Test 4: Impersonation / Address Mismatch
{
  const legitKeypair = Keypair.generate();
  const attackerKeypair = Keypair.generate();
  const legitAddress = legitKeypair.publicKey.toBase58();
  const attackerAddress = attackerKeypair.publicKey.toBase58();

  const challenge = generateAuthChallenge(legitAddress);
  const message = formatChallengeMessage(challenge);
  const messageBytes = new TextEncoder().encode(message);
  // Attacker signs challenge meant for legit user
  const attackerSig = bs58.encode(ed25519.sign(messageBytes, attackerKeypair.secretKey.slice(0, 32)));

  const result = verifyWalletChallenge({
    walletAddress: attackerAddress,
    nonce: challenge.nonce,
    signatureBase58: attackerSig,
  });

  assert.strictEqual(result.verified, false);
  assert.strictEqual(result.error, 'Wallet address does not match challenge target');
  console.log('✓ Test 4: Attacker address substitution rejected');
}

console.log('ALL CRYPTOGRAPHIC WALLET AUTH TESTS PASSED!\n');
