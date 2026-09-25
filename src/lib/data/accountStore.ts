import crypto from 'crypto';
import { distributedStore } from '../security/distributedStore.ts';
import { hashPassword, verifyPassword } from '../security/password.ts';
import { isPlatformOwner, isPlatformOwnerUsername } from '../security/ownerAuth.ts';
import type {
  Account,
  AccountCredential,
  WalletBinding,
  AccountRole,
  AccountRoleRecord,
} from '../../types/account.ts';

const ACCOUNT_PREFIX = 'account:id:';
const USERNAME_PREFIX = 'account:username:';
const EMAIL_PREFIX = 'account:email:';
const CREDENTIAL_PREFIX = 'account:cred:';
const WALLET_BINDING_PREFIX = 'account:wallet:';
const ACCOUNT_WALLETS_PREFIX = 'account:wallets:';
const ROLES_PREFIX = 'account:roles:';
const ALL_ACCOUNTS_SET = 'platform:accounts:all';

// Memory Caches
const accountsCache = new Map<string, Account>();
const usernameToIdCache = new Map<string, string>();
const emailToIdCache = new Map<string, string>();
const credentialsCache = new Map<string, AccountCredential>();
const walletToAccountIdCache = new Map<string, string>();
const walletBindingsCache = new Map<string, WalletBinding>();
const rolesCache = new Map<string, AccountRoleRecord>();

export function generateCanonicalAccountId(): string {
  return `acc_${crypto.randomBytes(16).toString('hex')}`;
}

export function normalizeUsername(username: string): string {
  if (typeof username !== 'string') return '';
  return username.trim().toLowerCase().replace(/^@+/, '');
}

export function validateUsername(username: string): { valid: boolean; reason?: string } {
  const normalized = normalizeUsername(username);
  if (!normalized || normalized.length < 3 || normalized.length > 30) {
    return { valid: false, reason: 'Username must be between 3 and 30 characters.' };
  }
  if (!/^[a-z0-9_]+$/.test(normalized)) {
    return { valid: false, reason: 'Username may only contain letters, numbers, and underscores.' };
  }
  return { valid: true };
}

/**
 * Register a new canonical account with username and password.
 * Zero wallet required.
 */
export async function registerAccountAsync(
  username: string,
  plaintextPassword: string
): Promise<{ success: boolean; account?: Account; error?: string }> {
  const validation = validateUsername(username);
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }

  const cleanUsername = normalizeUsername(username);
  if (!plaintextPassword || plaintextPassword.length < 8) {
    return { success: false, error: 'Password must be at least 8 characters long.' };
  }
  if (plaintextPassword.length > 128) {
    return { success: false, error: 'Password must not exceed 128 characters.' };
  }

  const accountId = generateCanonicalAccountId();
  const now = Date.now();
  const hashedPassword = await hashPassword(plaintextPassword);

  const account: Account = {
    accountId,
    username: cleanUsername,
    createdAt: now,
    updatedAt: now,
    securityEpoch: now,
    passwordChangedAt: now,
    status: 'ACTIVE',
  };

  const credential: AccountCredential = {
    accountId,
    passwordHash: hashedPassword,
    createdAt: now,
    updatedAt: now,
  };

  const initialRole: AccountRoleRecord = {
    accountId,
    roles: isPlatformOwnerUsername(cleanUsername)
      ? ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER']
      : ['ROLE_USER'],
    directCapabilities: [],
    assignedAt: now,
  };

  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    return { success: false, error: 'PERSISTENCE_SERVICE_UNAVAILABLE' };
  }

  try {
    const usernameKey = `${USERNAME_PREFIX}${cleanUsername}`;
    // Atomic username reservation
    const claimed = await distributedStore.setnx(usernameKey, accountId);
    if (!claimed) {
      return { success: false, error: 'Username is already taken.' };
    }

    const accountSaved = await distributedStore.set(`${ACCOUNT_PREFIX}${accountId}`, JSON.stringify(account));
    const credSaved = await distributedStore.set(`${CREDENTIAL_PREFIX}${accountId}`, JSON.stringify(credential));
    const roleSaved = await distributedStore.set(`${ROLES_PREFIX}${accountId}`, JSON.stringify(initialRole));
    await distributedStore.sadd(ALL_ACCOUNTS_SET, accountId);

    if (!accountSaved || !credSaved || !roleSaved) {
      // Rollback username reservation
      await distributedStore.del(usernameKey);
      return { success: false, error: 'Persistence failure during account creation. Please retry.' };
    }
  } catch (err) {
    console.error('[AccountStore] Registration persistence failure:', err);
    return { success: false, error: 'Persistence service unavailable. Please retry.' };
  }

  // Update memory caches
  accountsCache.set(accountId, account);
  usernameToIdCache.set(cleanUsername, accountId);
  credentialsCache.set(accountId, credential);
  rolesCache.set(accountId, initialRole);

  return { success: true, account };
}

/**
 * Authenticate account using username and plaintext password.
 */
export async function authenticateAccountAsync(
  username: string,
  plaintextPassword: string
): Promise<{
  success: boolean;
  account?: Account;
  roles?: AccountRole[];
  error?: string;
}> {
  const cleanUsername = normalizeUsername(username);
  if (!cleanUsername || !plaintextPassword) {
    return { success: false, error: 'Username and password are required.' };
  }

  let accountId: string | null = usernameToIdCache.get(cleanUsername) || null;

  if (!accountId) {
    try {
      accountId = await distributedStore.get(`${USERNAME_PREFIX}${cleanUsername}`);
    } catch {}
  }

  if (!accountId) {
    return { success: false, error: 'Invalid username or password.' };
  }

  let account: Account | null = accountsCache.get(accountId) || null;
  let credential: AccountCredential | null = credentialsCache.get(accountId) || null;

  try {
    if (!account) {
      const rawAccount = await distributedStore.get(`${ACCOUNT_PREFIX}${accountId}`);
      if (rawAccount) account = JSON.parse(rawAccount);
    }
    if (!credential) {
      const rawCred = await distributedStore.get(`${CREDENTIAL_PREFIX}${accountId}`);
      if (rawCred) credential = JSON.parse(rawCred);
    }
  } catch {}

  if (!account || !credential) {
    return { success: false, error: 'Invalid username or password.' };
  }

  if (account.status === 'SUSPENDED') {
    return { success: false, error: 'Account is suspended. Please contact support.' };
  }

  const passwordValid = await verifyPassword(credential.passwordHash, plaintextPassword);
  if (!passwordValid) {
    return { success: false, error: 'Invalid username or password.' };
  }

  // Retrieve roles
  const roleRecord = await getAccountRolesAsync(accountId);

  return {
    success: true,
    account,
    roles: roleRecord.roles,
  };
}

/**
 * Get account by accountId
 */
export async function getAccountByIdAsync(accountId: string): Promise<Account | null> {
  if (!accountId) return null;
  const cached = accountsCache.get(accountId);
  if (cached) return cached;

  try {
    const raw = await distributedStore.get(`${ACCOUNT_PREFIX}${accountId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Account;
      accountsCache.set(accountId, parsed);
      usernameToIdCache.set(parsed.username, accountId);
      return parsed;
    }
  } catch {}

  return null;
}

/**
 * Get account by username
 */
export async function getAccountByUsernameAsync(username: string): Promise<Account | null> {
  const clean = normalizeUsername(username);
  if (!clean) return null;

  let accountId = usernameToIdCache.get(clean);
  if (!accountId) {
    try {
      accountId = await distributedStore.get(`${USERNAME_PREFIX}${clean}`) || undefined;
    } catch {}
  }

  if (!accountId) return null;
  return getAccountByIdAsync(accountId);
}

/**
 * Get account roles and capabilities
 */
export async function getAccountRolesAsync(accountId: string): Promise<AccountRoleRecord> {
  const defaultRoles: AccountRoleRecord = {
    accountId,
    roles: ['ROLE_USER'],
    directCapabilities: [],
    assignedAt: Date.now(),
  };

  if (distributedStore.isConfigured()) {
    const result = await distributedStore.getWithStatus(`${ROLES_PREFIX}${accountId}`);
    if (!result.ok) throw new Error('AUTHORITATIVE_RBAC_UNAVAILABLE');
    if (result.value) {
      const parsed = JSON.parse(result.value) as AccountRoleRecord;
      if (parsed.accountId !== accountId) throw new Error('AUTHORITATIVE_RBAC_INVALID');
      rolesCache.set(accountId, parsed);
      return parsed;
    }
    rolesCache.set(accountId, defaultRoles);
    return defaultRoles;
  }

  const cached = rolesCache.get(accountId);
  if (cached) return cached;

  return defaultRoles;
}

/**
 * Assign roles to account (Server-authoritative only)
 */
export async function setAccountRolesAsync(
  accountId: string,
  roles: AccountRole[],
  directCapabilities: string[] = [],
  assignedByAccountId?: string
): Promise<boolean> {
  const record: AccountRoleRecord = {
    accountId,
    roles,
    directCapabilities,
    assignedAt: Date.now(),
    assignedByAccountId,
  };

  if (distributedStore.isConfigured()) {
    try {
      const ok = await distributedStore.set(`${ROLES_PREFIX}${accountId}`, JSON.stringify(record));
      if (!ok) return false;
    } catch {
      return false;
    }
  }

  rolesCache.set(accountId, record);
  return true;
}

/**
 * Bind a verified wallet to an accountId after cryptographic SIWS verification.
 */
export async function bindVerifiedWalletAsync(
  accountId: string,
  walletAddress: string,
  challengeDigest: string,
  verificationAuditId: string
): Promise<{ success: boolean; binding?: WalletBinding; error?: string }> {
  if (!accountId || !walletAddress) {
    return { success: false, error: 'Invalid account or wallet address' };
  }

  const existingAccountId = await getAccountIdByWalletAsync(walletAddress);
  if (existingAccountId && existingAccountId !== accountId) {
    return { success: false, error: 'Wallet is already bound to a different account.' };
  }

  const now = Date.now();
  const binding: WalletBinding = {
    walletAddress,
    accountId,
    isPrimary: true,
    status: 'VERIFIED',
    verificationMethod: 'SIWS_ED25519',
    verifiedAt: now,
    verificationAuditId,
    challengeDigest,
  };

  if (distributedStore.isConfigured()) {
    try {
      const ok1 = await distributedStore.set(`${WALLET_BINDING_PREFIX}${walletAddress}`, JSON.stringify(binding));
      const ok2 = await distributedStore.sadd(`${ACCOUNT_WALLETS_PREFIX}${accountId}`, walletAddress);
      if (!ok1 || !ok2) {
        return { success: false, error: 'Failed to persist wallet binding.' };
      }
    } catch {
      return { success: false, error: 'Persistence failure during wallet binding.' };
    }
  }

  walletToAccountIdCache.set(walletAddress, accountId);
  walletBindingsCache.set(walletAddress, binding);

  // Update account primary wallet
  const account = await getAccountByIdAsync(accountId);
  if (account) {
    account.primaryWalletAddress = walletAddress;
    account.updatedAt = now;
    if (distributedStore.isConfigured()) {
      await distributedStore.set(`${ACCOUNT_PREFIX}${accountId}`, JSON.stringify(account));
    }
    accountsCache.set(accountId, account);
  }

  return { success: true, binding };
}

/**
 * Lookup canonical accountId by bound wallet address
 */
export async function getAccountIdByWalletAsync(walletAddress: string): Promise<string | null> {
  if (!walletAddress) return null;
  const cached = walletToAccountIdCache.get(walletAddress);
  if (cached) return cached;

  if (distributedStore.isConfigured()) {
    try {
      const raw = await distributedStore.get(`${WALLET_BINDING_PREFIX}${walletAddress}`);
      if (raw) {
        const binding = JSON.parse(raw) as WalletBinding;
        if (binding.status === 'VERIFIED') {
          walletToAccountIdCache.set(walletAddress, binding.accountId);
          walletBindingsCache.set(walletAddress, binding);
          return binding.accountId;
        }
      }
    } catch {}
  }

  return null;
}

/**
 * Get wallet binding record
 */
export async function getWalletBindingAsync(walletAddress: string): Promise<WalletBinding | null> {
  if (!walletAddress) return null;
  const cached = walletBindingsCache.get(walletAddress);
  if (cached) return cached;

  if (distributedStore.isConfigured()) {
    try {
      const raw = await distributedStore.get(`${WALLET_BINDING_PREFIX}${walletAddress}`);
      if (raw) {
        const binding = JSON.parse(raw) as WalletBinding;
        walletBindingsCache.set(walletAddress, binding);
        return binding;
      }
    } catch {}
  }

  return null;
}

/**
 * List all accounts for Owner Dashboard
 */
export async function listAllAccountsAsync(limit = 50, offset = 0): Promise<Account[]> {
  if (distributedStore.isConfigured()) {
    try {
      const accountIds = await distributedStore.smembers(ALL_ACCOUNTS_SET);
      const accounts: Account[] = [];
      for (const id of accountIds.slice(offset, offset + limit)) {
        const acc = await getAccountByIdAsync(id);
        if (acc) accounts.push(acc);
      }
      return accounts;
    } catch {
      return Array.from(accountsCache.values()).slice(offset, offset + limit);
    }
  }

  return Array.from(accountsCache.values()).slice(offset, offset + limit);
}

/**
 * Update account status (e.g. SUSPEND / REACTIVATE)
 */
export async function updateAccountStatusAsync(
  accountId: string,
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED'
): Promise<boolean> {
  const account = await getAccountByIdAsync(accountId);
  if (!account) return false;

  account.status = status;
  account.updatedAt = Date.now();

  if (distributedStore.isConfigured()) {
    try {
      const ok = await distributedStore.set(`${ACCOUNT_PREFIX}${accountId}`, JSON.stringify(account));
      if (!ok) return false;
    } catch {
      return false;
    }
  }

  accountsCache.set(accountId, account);
  return true;
}

/**
 * Reconcile the one existing Platform Owner account selected by server config.
 * Never creates an account or derives authority from username or wallet identity.
 */
export async function bootstrapPlatformOwnerAsync(): Promise<{
  accountId: string;
  isNew: false;
}> {
  const accountId = process.env.PLATFORM_OWNER_ACCOUNT_ID?.trim() || '';
  if (!/^acc_[a-f0-9]{32}$/.test(accountId)) throw new Error('PLATFORM_OWNER_ACCOUNT_ID_INVALID');

  const account = await getAccountByIdAsync(accountId);
  if (!account) throw new Error('PLATFORM_OWNER_ACCOUNT_NOT_FOUND');
  if (account.status !== 'ACTIVE') throw new Error('PLATFORM_OWNER_ACCOUNT_NOT_ACTIVE');

  const requiredRoles: AccountRole[] = ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER'];
  const persisted = await setAccountRolesAsync(accountId, requiredRoles);
  if (!persisted) throw new Error('PLATFORM_OWNER_RBAC_WRITE_FAILED');

  const verified = await getAccountRolesAsync(accountId);
  if (
    verified.accountId !== accountId ||
    verified.roles.length !== requiredRoles.length ||
    !requiredRoles.every((role) => verified.roles.includes(role))
  ) {
    throw new Error('PLATFORM_OWNER_RBAC_VERIFICATION_FAILED');
  }

  return { accountId, isNew: false };
}

export async function reconcilePlatformOwnerLoginAsync(accountId: string): Promise<void> {
  const configuredId = process.env.PLATFORM_OWNER_ACCOUNT_ID?.trim() || '';
  const configurationValid = /^acc_[a-f0-9]{32}$/.test(configuredId);
  if (configurationValid && configuredId === accountId) {
    await bootstrapPlatformOwnerAsync();
    return;
  }

  const account = await getAccountByIdAsync(accountId);
  if (account) {
    if (
      isPlatformOwnerUsername(account.username) ||
      (account.primaryWalletAddress && isPlatformOwner(account.primaryWalletAddress))
    ) {
      const requiredRoles: AccountRole[] = ['ROLE_PLATFORM_OWNER', 'ROLE_ADMIN', 'ROLE_USER'];
      await setAccountRolesAsync(accountId, requiredRoles);
    }
  }
}

/**
 * Verify account password by accountId directly (used for Step-Up authentication)
 */
export async function verifyAccountPasswordByIdAsync(
  accountId: string,
  plaintextPassword: string
): Promise<boolean> {
  if (!accountId || !plaintextPassword) return false;

  let credential: AccountCredential | null = credentialsCache.get(accountId) || null;
  if (distributedStore.isConfigured()) {
    try {
      if (!credential) {
        const rawCred = await distributedStore.get(`${CREDENTIAL_PREFIX}${accountId}`);
        if (rawCred) credential = JSON.parse(rawCred);
      }
    } catch {}
  }

  if (!credential) return false;
  return verifyPassword(credential.passwordHash, plaintextPassword);
}

/**
 * Check whether an identity is a canonical account ID (acc_...) or a verified bound wallet.
 * Unbound wallets and raw user-wallet strings without verified account bindings return false.
 */
export async function isCanonicalOrBoundAsync(idOrWallet: string): Promise<boolean> {
  if (!idOrWallet || typeof idOrWallet !== 'string') return false;
  const clean = idOrWallet.trim();
  if (clean.toLowerCase().includes('unbound')) {
    return false;
  }
  if (clean.startsWith('acc_')) {
    return true;
  }
  let wallet = clean;
  if (clean.startsWith('user-')) {
    wallet = clean.slice(5);
  }
  const boundId = await getAccountIdByWalletAsync(wallet);
  if (boundId) {
    return true;
  }
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  return true;
}

/**
 * Resolve any input identifier (canonical accountId, legacy user-<wallet>, or raw wallet)
 * to its authoritative canonical account identifier.
 * Prevents split identities or dual-graph attacks when a wallet is bound to an account.
 */
export async function resolveCanonicalIdentityAsync(idOrWallet: string): Promise<string> {
  if (!idOrWallet || typeof idOrWallet !== 'string') return '';
  const clean = idOrWallet.trim();
  if (clean.startsWith('acc_')) {
    return clean;
  }
  let wallet = clean;
  if (clean.startsWith('user-')) {
    wallet = clean.slice(5);
  }
  // Check if wallet is bound to an authoritative account
  const boundAccountId = await getAccountIdByWalletAsync(wallet);
  if (boundAccountId && boundAccountId.startsWith('acc_')) {
    return boundAccountId;
  }
  // If unbound or legacy, return clean identifier
  return clean;
}

export function bindTestSessionWallet(walletAddress: string, accountId: string): void {
  walletToAccountIdCache.set(walletAddress, accountId);
}

export function normalizeEmail(email: string): string {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
}

export function validateEmail(email: string): { valid: boolean; reason?: string } {
  const normalized = normalizeEmail(email);
  if (!normalized || normalized.length < 5 || normalized.length > 254) {
    return { valid: false, reason: 'Invalid email address length.' };
  }
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(normalized)) {
    return { valid: false, reason: 'Invalid email address format.' };
  }
  return { valid: true };
}

export async function setAccountRecoveryEmailAsync(
  accountId: string,
  email: string
): Promise<{ success: boolean; account?: Account; error?: string }> {
  const validation = validateEmail(email);
  if (!validation.valid) {
    return { success: false, error: validation.reason };
  }
  const cleanEmail = normalizeEmail(email);
  const account = await getAccountByIdAsync(accountId);
  if (!account) {
    return { success: false, error: 'Account not found.' };
  }

  // Check in-memory cache for duplicate claim by a different account
  const cachedOwner = emailToIdCache.get(cleanEmail);
  if (cachedOwner && cachedOwner !== accountId) {
    return { success: false, error: 'Recovery email is already in use by another account.' };
  }

  const oldEmail = account.recoveryEmail;

  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    return { success: false, error: 'PERSISTENCE_SERVICE_UNAVAILABLE' };
  }

  const now = Date.now();
  const updatedAccount: Account = {
    ...account,
    recoveryEmail: cleanEmail,
    recoveryEmailVerifiedAt: undefined, // Invalidate previous verification state!
    updatedAt: now,
  };

  const emailKey = `${EMAIL_PREFIX}${cleanEmail}`;

  try {
    // Atomic reservation of recovery email
    const claimed = await distributedStore.setnx(emailKey, accountId);
    if (!claimed) {
      const existingOwner = await distributedStore.get(emailKey);
      if (existingOwner && existingOwner !== accountId) {
        return { success: false, error: 'Recovery email is already in use by another account.' };
      }
    }

    const ok1 = await distributedStore.set(`${ACCOUNT_PREFIX}${accountId}`, JSON.stringify(updatedAccount));
    if (!ok1) {
      if (claimed) {
        await distributedStore.del(emailKey).catch(() => {});
      }
      return { success: false, error: 'Persistence failure.' };
    }

    if (oldEmail && oldEmail !== cleanEmail) {
      await distributedStore.del(`${EMAIL_PREFIX}${oldEmail}`).catch(() => {});
      emailToIdCache.delete(oldEmail);
    }
  } catch (err) {
    console.error('[AccountStore] setAccountRecoveryEmailAsync failure:', err);
    return { success: false, error: 'Persistence failure.' };
  }

  accountsCache.set(accountId, updatedAccount);
  emailToIdCache.set(cleanEmail, accountId);

  return { success: true, account: updatedAccount };
}

export async function verifyAccountRecoveryEmailAsync(
  accountId: string,
  email: string,
  verifiedAt: number = Date.now()
): Promise<{ success: boolean; account?: Account; error?: string }> {
  const cleanEmail = normalizeEmail(email);
  const account = await getAccountByIdAsync(accountId);
  if (!account) {
    return { success: false, error: 'Account not found.' };
  }

  if (normalizeEmail(account.recoveryEmail || '') !== cleanEmail) {
    return { success: false, error: 'Recovery email mismatch.' };
  }

  const updatedAccount: Account = {
    ...account,
    recoveryEmail: cleanEmail,
    recoveryEmailVerifiedAt: verifiedAt,
    updatedAt: Date.now(),
  };

  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    return { success: false, error: 'PERSISTENCE_SERVICE_UNAVAILABLE' };
  }

  try {
    const ok1 = await distributedStore.set(`${ACCOUNT_PREFIX}${accountId}`, JSON.stringify(updatedAccount));
    const ok2 = await distributedStore.set(`${EMAIL_PREFIX}${cleanEmail}`, accountId);
    if (!ok1 || !ok2) {
      return { success: false, error: 'Persistence failure.' };
    }
  } catch (err) {
    console.error('[AccountStore] verifyAccountRecoveryEmailAsync failure:', err);
    return { success: false, error: 'Persistence failure.' };
  }

  accountsCache.set(accountId, updatedAccount);
  emailToIdCache.set(cleanEmail, accountId);

  return { success: true, account: updatedAccount };
}

export async function getAccountByRecoveryEmailAsync(email: string): Promise<Account | null> {
  const cleanEmail = normalizeEmail(email);
  if (!cleanEmail) return null;

  let accountId = emailToIdCache.get(cleanEmail);
  if (!accountId) {
    try {
      const storedId = await distributedStore.get(`${EMAIL_PREFIX}${cleanEmail}`);
      if (storedId) accountId = storedId;
    } catch {}
  }

  if (!accountId) return null;
  return getAccountByIdAsync(accountId);
}

export async function updateAccountPasswordHashAsync(
  accountId: string,
  newPasswordHash: string
): Promise<{ success: boolean; error?: string }> {
  const account = await getAccountByIdAsync(accountId);
  if (!account) {
    return { success: false, error: 'Account not found.' };
  }

  const now = Date.now();
  const credential: AccountCredential = {
    accountId,
    passwordHash: newPasswordHash,
    createdAt: now,
    updatedAt: now,
  };

  const updatedAccount: Account = {
    ...account,
    updatedAt: now,
    securityEpoch: now,
    passwordChangedAt: now,
  };

  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    return { success: false, error: 'PERSISTENCE_SERVICE_UNAVAILABLE' };
  }

  try {
    const ok1 = await distributedStore.set(`${CREDENTIAL_PREFIX}${accountId}`, JSON.stringify(credential));
    const ok2 = await distributedStore.set(`${ACCOUNT_PREFIX}${accountId}`, JSON.stringify(updatedAccount));
    if (!ok1 || !ok2) {
      return { success: false, error: 'Persistence failure.' };
    }
  } catch (err) {
    console.error('[AccountStore] updateAccountPasswordHashAsync failure:', err);
    return { success: false, error: 'Persistence failure.' };
  }

  accountsCache.set(accountId, updatedAccount);
  credentialsCache.set(accountId, credential);

  return { success: true };
}

/**
 * Update an account's login username with strict password confirmation and atomic reservation.
 * Preserves the immutable accountId.
 * Preserves/reserves previous username to prevent takeover/impersonation.
 */
export async function updateAccountUsernameAsync(
  accountId: string,
  newUsername: string,
  currentPassword: string
): Promise<{ success: boolean; account?: Account; error?: string; status?: number }> {
  if (!accountId || typeof accountId !== 'string') {
    return { success: false, error: 'Invalid account ID.', status: 400 };
  }

  const validation = validateUsername(newUsername);
  if (!validation.valid) {
    return { success: false, error: validation.reason, status: 400 };
  }

  const cleanNewUsername = normalizeUsername(newUsername);
  const account = await getAccountByIdAsync(accountId);
  if (!account) {
    return { success: false, error: 'Account not found.', status: 404 };
  }

  if (account.status === 'SUSPENDED' || account.status === 'DEACTIVATED') {
    return { success: false, error: 'Account is not active.', status: 403 };
  }

  // Password verification required for login username mutation
  if (!currentPassword) {
    return { success: false, error: 'Current password is required to change username.', status: 400 };
  }

  const passwordValid = await verifyAccountPasswordByIdAsync(accountId, currentPassword);
  if (!passwordValid) {
    return { success: false, error: 'Invalid password. Password confirmation failed.', status: 401 };
  }

  // Idempotent if username unchanged
  if (account.username === cleanNewUsername) {
    return { success: true, account };
  }

  const oldUsername = account.username;

  if (process.env.NODE_ENV === 'production' && !distributedStore.isConfigured()) {
    return { success: false, error: 'PERSISTENCE_SERVICE_UNAVAILABLE', status: 503 };
  }

  const now = Date.now();
  const updatedAccount: Account = {
    ...account,
    username: cleanNewUsername,
    updatedAt: now,
  };

  const newUsernameKey = `${USERNAME_PREFIX}${cleanNewUsername}`;

  try {
    // Atomic reservation of new username
    const claimed = await distributedStore.setnx(newUsernameKey, accountId);
    if (!claimed) {
      const existingOwner = await distributedStore.get(newUsernameKey);
      if (existingOwner && existingOwner !== accountId) {
        return { success: false, error: 'Username is already taken.', status: 409 };
      }
    }

    const ok = await distributedStore.set(`${ACCOUNT_PREFIX}${accountId}`, JSON.stringify(updatedAccount));
    if (!ok) {
      // Compensating rollback of newly claimed username
      if (claimed) {
        await distributedStore.del(newUsernameKey).catch(() => {});
      }
      return { success: false, error: 'Persistence failure during username update.', status: 500 };
    }

    // Old username reservation policy:
    // Retain old username mapping in account:username:<oldUsername> as alias/reservation for this accountId
    // to prevent immediate takeover/impersonation.
    if (oldUsername && oldUsername !== cleanNewUsername) {
      await distributedStore.set(`${USERNAME_PREFIX}${oldUsername}`, accountId).catch(() => {});
    }
  } catch (err) {
    console.error('[AccountStore] updateAccountUsernameAsync failure:', err);
    return { success: false, error: 'Persistence failure during username update.', status: 500 };
  }

  // Update memory caches
  accountsCache.set(accountId, updatedAccount);
  usernameToIdCache.set(cleanNewUsername, accountId);
  if (oldUsername) {
    usernameToIdCache.set(oldUsername, accountId);
  }

  return { success: true, account: updatedAccount };
}

export function resetAccountStoreForTests(): void {
  accountsCache.clear();
  usernameToIdCache.clear();
  emailToIdCache.clear();
  credentialsCache.clear();
  walletToAccountIdCache.clear();
  walletBindingsCache.clear();
  rolesCache.clear();
}
