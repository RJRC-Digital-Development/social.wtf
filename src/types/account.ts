export interface Account {
  accountId: string; // Cryptographically random string (e.g. acc_...)
  username: string; // Lowercase alphanumeric + underscore (3-30 chars)
  createdAt: number;
  updatedAt: number;
  status: 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';
  primaryWalletAddress?: string;
  recoveryEmail?: string;
  recoveryEmailVerifiedAt?: number;
  securityEpoch?: number;
  passwordChangedAt?: number;
}

export interface AccountCredential {
  accountId: string;
  passwordHash: string; // $argon2id$...
  createdAt: number;
  updatedAt: number;
}

export interface WalletBinding {
  walletAddress: string;
  accountId: string;
  isPrimary: boolean;
  status: 'VERIFIED' | 'REVOKED';
  verificationMethod: 'SIWS_ED25519';
  verifiedAt: number;
  verificationAuditId: string;
  challengeDigest: string;
}

export type AccountRole =
  | 'ROLE_USER'
  | 'ROLE_SUPPORT'
  | 'ROLE_MODERATOR'
  | 'ROLE_ADMIN'
  | 'ROLE_PLATFORM_OWNER';

export interface AccountRoleRecord {
  accountId: string;
  roles: AccountRole[];
  directCapabilities: string[];
  assignedAt: number;
  assignedByAccountId?: string;
}

export interface AuditLogRecord {
  auditId: string;
  actorAccountId: string;
  actorWalletAddress?: string;
  capabilityUsed: string;
  action: string;
  targetType: 'ACCOUNT' | 'POST' | 'SYSTEM_CONFIG' | 'ROLE' | 'COMMERCE' | 'WALLET';
  targetId: string;
  timestamp: number;
  ipHash: string;
  userAgentHash: string;
  stepUpMethodUsed?: 'SIWS_SIGNATURE' | 'PASSKEY_ASSERTION' | 'PASSWORD';
  outcome: 'SUCCESS' | 'REJECTED' | 'FAILED';
  reason?: string;
  metadata?: Record<string, string | number | boolean>;
}

export interface SystemFeatureState {
  adultClubEnabled: boolean;
  mediaCreationEnabled: boolean;
  registrationEnabled: boolean;
}
