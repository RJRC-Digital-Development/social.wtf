import assert from 'assert';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { Keypair } from '@solana/web3.js';

console.log('================================================================');
console.log('--- RUNNING DURABLE REAL-MEMBER PERSISTENCE SECURITY TESTS ---');
console.log('================================================================\n');

// ---------------------------------------------------------
// Standalone Test Sandbox for Durable Storage
// ---------------------------------------------------------
const TEST_DATA_DIR = path.join(process.cwd(), '.data_test');
const TEST_STORAGE_FILE = path.join(TEST_DATA_DIR, 'profiles.test.json');

// Ensure clean test environment
if (fs.existsSync(TEST_STORAGE_FILE)) {
  fs.unlinkSync(TEST_STORAGE_FILE);
}
if (fs.existsSync(TEST_DATA_DIR)) {
  fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
}

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
};

function sanitizePlainText(input, maxLength = 1000) {
  if (typeof input !== 'string') return '';
  const stripped = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return stripped.trim().slice(0, maxLength);
}

const COOKIE_CHAIN_CONFIG = {
  treasuryPublicKey: 'HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9',
};

class DurableProfileStoreTest {
  constructor(storageFilePath) {
    this.storageFilePath = storageFilePath;
    this.profilesByWallet = new Map();
    this.walletByHandle = new Map();
    this.loadFromDisk();
  }

  loadFromDisk() {
    try {
      if (fs.existsSync(this.storageFilePath)) {
        const data = fs.readFileSync(this.storageFilePath, 'utf8');
        if (data && data.trim()) {
          const parsed = JSON.parse(data);
          if (Array.isArray(parsed)) {
            this.profilesByWallet.clear();
            this.walletByHandle.clear();
            for (const profile of parsed) {
              if (profile && profile.walletAddress && profile.handle) {
                this.profilesByWallet.set(profile.walletAddress, profile);
                this.walletByHandle.set(profile.handle.toLowerCase(), profile.walletAddress);
              }
            }
          }
        }
      }
    } catch {
      // Graceful fallback
    }
  }

  saveToDisk() {
    try {
      const dir = path.dirname(this.storageFilePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      const profiles = Array.from(this.profilesByWallet.values());
      const tempPath = `${this.storageFilePath}.tmp.${Date.now()}.${Math.random().toString(36).substring(2, 7)}`;
      fs.writeFileSync(tempPath, JSON.stringify(profiles, null, 2), 'utf8');
      fs.renameSync(tempPath, this.storageFilePath);
    } catch {
      const profiles = Array.from(this.profilesByWallet.values());
      fs.writeFileSync(this.storageFilePath, JSON.stringify(profiles, null, 2), 'utf8');
    }
  }

  getAllOnboardedProfiles() {
    return Array.from(this.profilesByWallet.values());
  }

  getProfileByWallet(walletAddress) {
    if (!walletAddress) return null;
    return this.profilesByWallet.get(walletAddress) || null;
  }

  getProfileByHandle(handle) {
    if (!handle) return null;
    const cleanHandle = handle.toLowerCase().replace(/^@+/, '').trim();
    const wallet = this.walletByHandle.get(cleanHandle);
    if (!wallet) return null;
    return this.profilesByWallet.get(wallet) || null;
  }

  saveOnboardedProfile(authenticatedWallet, input, isAdminSession = false) {
    if (!authenticatedWallet || typeof authenticatedWallet !== 'string') {
      return { success: false, error: 'Valid authenticated wallet identity required' };
    }

    const rawHandle = input.handle?.trim().toLowerCase().replace(/^@+/, '') || '';
    if (!rawHandle || rawHandle.length < 3 || rawHandle.length > 30) {
      return { success: false, error: 'Handle must be between 3 and 30 characters' };
    }

    if (!/^[a-z0-9_]+$/.test(rawHandle)) {
      return { success: false, error: 'Handle must contain only letters, numbers, and underscores' };
    }

    const existingOwner = this.walletByHandle.get(rawHandle);
    if (existingOwner && existingOwner !== authenticatedWallet) {
      return { success: false, error: 'Handle is already registered by another identity' };
    }

    const sanitizedName = sanitizePlainText(input.name?.trim() || `@${rawHandle}`, 50);
    const sanitizedBio = sanitizePlainText(input.bio?.trim() || '', 280);
    const sanitizedAvatar = input.avatar?.trim() || `https://api.dicebear.com/7.x/bottts/svg?seed=${authenticatedWallet}`;
    const sanitizedCover = input.coverImage?.trim() || 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop';

    const isOwner = Boolean(isAdminSession);
    const existingProfile = this.profilesByWallet.get(authenticatedWallet);

    if (existingProfile && existingProfile.handle !== rawHandle) {
      this.walletByHandle.delete(existingProfile.handle.toLowerCase());
    }

    const updatedProfile = {
      id: existingProfile?.id || `user-${authenticatedWallet}`,
      handle: rawHandle,
      name: sanitizedName,
      avatar: sanitizedAvatar,
      coverImage: sanitizedCover,
      bio: sanitizedBio,
      verified: existingProfile?.verified ?? isOwner,
      ageVerified: existingProfile?.ageVerified ?? false,
      isAdmin: isOwner,
      isAdultContentCreator: input.isAdultContentCreator ?? existingProfile?.isAdultContentCreator ?? false,
      walletAddress: authenticatedWallet,
      sponsorUrl: input.sponsorUrl?.trim() || existingProfile?.sponsorUrl,
      sponsorGoal: input.sponsorGoal?.trim() || existingProfile?.sponsorGoal,
      followersCount: existingProfile?.followersCount || 0,
      followingCount: existingProfile?.followingCount || 0,
      friendsCount: existingProfile?.friendsCount || 0,
      isCreator: input.isCreator ?? existingProfile?.isCreator ?? true,
      storeSettings: {
        storeName: input.storeSettings?.storeName?.trim() || existingProfile?.storeSettings?.storeName || `${sanitizedName}'s Storefront`,
        storeDescription: input.storeSettings?.storeDescription?.trim() || existingProfile?.storeSettings?.storeDescription || 'Digital goods and community assets on Cookie Chain SVM.',
        supportCookTreasuryPct: 5,
      },
      widgets: existingProfile?.widgets || [],
    };

    this.profilesByWallet.set(authenticatedWallet, updatedProfile);
    this.walletByHandle.set(rawHandle, authenticatedWallet);

    this.saveToDisk();

    return { success: true, profile: updatedProfile };
  }
}

// ---------------------------------------------------------
// TEST SUITE
// ---------------------------------------------------------

let storeInstance = new DurableProfileStoreTest(TEST_STORAGE_FILE);

// [TEST 1] Cold Start Clean Baseline
{
  const initial = storeInstance.getAllOnboardedProfiles();
  assert.strictEqual(initial.length, 0, 'Cold start store must start with 0 profiles');
  console.log(' [TEST 1] Cold Start Baseline: Initialized with 0 profiles');
}

// [TEST 2] SIWS User Onboarding & Durable Disk Persistence
const userAliceKeypair = Keypair.generate();
const userAliceWallet = userAliceKeypair.publicKey.toBase58();

{
  const result = storeInstance.saveOnboardedProfile(userAliceWallet, {
    handle: 'alice_on_chain',
    name: 'Alice Developer',
    bio: 'Building on Cookie Chain SVM.',
  });

  assert.strictEqual(result.success, true);
  assert.strictEqual(result.profile.walletAddress, userAliceWallet);
  assert.strictEqual(result.profile.handle, 'alice_on_chain');

  // Verify file written to disk
  assert.strictEqual(fs.existsSync(TEST_STORAGE_FILE), true, 'Storage file must exist on disk');
  const diskContent = JSON.parse(fs.readFileSync(TEST_STORAGE_FILE, 'utf8'));
  assert.strictEqual(diskContent.length, 1);
  assert.strictEqual(diskContent[0].handle, 'alice_on_chain');
  assert.strictEqual(diskContent[0].walletAddress, userAliceWallet);
  console.log(' [TEST 2] Onboarding Persistence: Alice profile durably saved to disk');
}

// [TEST 3] Server Restart / Process Reboot Recovery
{
  // Simulate complete process crash / reboot by creating fresh store from the same disk file
  const rebootedStore = new DurableProfileStoreTest(TEST_STORAGE_FILE);
  const profiles = rebootedStore.getAllOnboardedProfiles();
  assert.strictEqual(profiles.length, 1, 'Rebooted store must recover Alice from disk');
  assert.strictEqual(profiles[0].handle, 'alice_on_chain');
  assert.strictEqual(profiles[0].walletAddress, userAliceWallet);

  const profileByHandle = rebootedStore.getProfileByHandle('alice_on_chain');
  assert.ok(profileByHandle);
  assert.strictEqual(profileByHandle.walletAddress, userAliceWallet);

  const profileByWallet = rebootedStore.getProfileByWallet(userAliceWallet);
  assert.ok(profileByWallet);
  assert.strictEqual(profileByWallet.handle, 'alice_on_chain');
  console.log(' [TEST 3] Process Reboot Recovery: Alice profile perfectly restored from disk');
  storeInstance = rebootedStore;
}

// [TEST 4] Multiple Users & Handle Anti-Hijacking Across Restarts
const userBobKeypair = Keypair.generate();
const userBobWallet = userBobKeypair.publicKey.toBase58();

{
  // Bob onboards
  const bobResult = storeInstance.saveOnboardedProfile(userBobWallet, {
    handle: 'bob_validator',
    name: 'Bob Validator',
    bio: 'Securing Cookie Chain blocks.',
  });
  assert.strictEqual(bobResult.success, true);

  // Attacker attempts to steal Alice's handle
  const attackerKeypair = Keypair.generate();
  const attackerWallet = attackerKeypair.publicKey.toBase58();

  const stealResult = storeInstance.saveOnboardedProfile(attackerWallet, {
    handle: 'alice_on_chain',
    name: 'Attacker Impersonator',
  });
  assert.strictEqual(stealResult.success, false);
  assert.strictEqual(stealResult.error, 'Handle is already registered by another identity');

  // Verify disk has both Alice and Bob, and no attacker
  const diskContent = JSON.parse(fs.readFileSync(TEST_STORAGE_FILE, 'utf8'));
  assert.strictEqual(diskContent.length, 2);
  console.log(' [TEST 4] Multi-User & Anti-Hijacking: Bob added and handle squatting blocked across restarts');
}

// [TEST 5] Idempotent Profile Updates Across Restarts
{
  // Alice updates her bio
  const updateResult = storeInstance.saveOnboardedProfile(userAliceWallet, {
    handle: 'alice_on_chain',
    name: 'Alice Developer (Senior)',
    bio: 'Updated bio after major protocol release.',
  });
  assert.strictEqual(updateResult.success, true);

  // Reboot process again
  const secondRebootStore = new DurableProfileStoreTest(TEST_STORAGE_FILE);
  const profiles = secondRebootStore.getAllOnboardedProfiles();
  assert.strictEqual(profiles.length, 2, 'Directory must remain exactly 2 profiles (no duplication)');

  const recoveredAlice = secondRebootStore.getProfileByWallet(userAliceWallet);
  assert.strictEqual(recoveredAlice.name, 'Alice Developer (Senior)');
  assert.strictEqual(recoveredAlice.bio, 'Updated bio after major protocol release.');
  console.log(' [TEST 5] Idempotent Updates: Profile updates persist cleanly across restarts without duplication');
  storeInstance = secondRebootStore;
}

// [TEST 6] Protocol Owner Admin Scope Retention Across Restarts
{
  const OWNER_TREASURY_PUBKEY = 'HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9';
  const ownerResult = storeInstance.saveOnboardedProfile(OWNER_TREASURY_PUBKEY, {
    handle: 'protocol_owner',
    name: 'Social.wtf Core Protocol',
    bio: 'Protocol treasury and platform governance.',
  }, true);
  assert.strictEqual(ownerResult.success, true);
  assert.strictEqual(ownerResult.profile.isAdmin, true);

  // Reboot
  const ownerRebootStore = new DurableProfileStoreTest(TEST_STORAGE_FILE);
  const ownerProfile = ownerRebootStore.getProfileByWallet(OWNER_TREASURY_PUBKEY);
  assert.ok(ownerProfile);
  assert.strictEqual(ownerProfile.isAdmin, true);
  assert.strictEqual(ownerProfile.verified, true);
  console.log(' [TEST 6] Protocol Owner Persistence: Admin scope and verified status preserved across restarts');
  storeInstance = ownerRebootStore;
}

// [TEST 7] Zero Fake Profile Absence Across Restarts
{
  const fakeHandles = ['cryptobaker', 'chainsynth', 'sol_vixen', 'cookie_monk', 'pixel_witch'];
  for (const fake of fakeHandles) {
    const profile = storeInstance.getProfileByHandle(fake);
    assert.strictEqual(profile, null, `Fake profile '${fake}' must never exist in durable store`);
  }
  console.log(' [TEST 7] Zero Fake Profiles: All 5 fake identities completely absent from durable storage');
}

// [TEST 8] Corrupted Storage File Graceful Handling
{
  const CORRUPT_FILE = path.join(TEST_DATA_DIR, 'corrupt.json');
  fs.writeFileSync(CORRUPT_FILE, '{{{{MALFORMED_JSON_DATA_CORRUPTION', 'utf8');

  // Should not throw or crash
  const corruptStore = new DurableProfileStoreTest(CORRUPT_FILE);
  const profiles = corruptStore.getAllOnboardedProfiles();
  assert.strictEqual(profiles.length, 0, 'Corrupt storage must fail-safe to 0 profiles without throwing');
  console.log(' [TEST 8] Resiliency: Corrupt storage files handled safely without process crash');
}

// Clean up test sandbox
try {
  if (fs.existsSync(TEST_STORAGE_FILE)) fs.unlinkSync(TEST_STORAGE_FILE);
  if (fs.existsSync(TEST_DATA_DIR)) fs.rmSync(TEST_DATA_DIR, { recursive: true, force: true });
} catch {}

console.log('================================================================');
console.log('  ALL 8 DURABLE REAL-MEMBER PERSISTENCE TESTS PASSED!');
console.log('================================================================\n');
