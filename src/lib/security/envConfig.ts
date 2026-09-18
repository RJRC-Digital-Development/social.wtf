/**
 * Security Environment Configuration & Mode Enforcer
 *
 * Defines explicit trust boundaries:
 * - 'production': Strict mode. Simulated verifications, dummy tokens, or sandbox proofs
 *   are strictly rejected. Unconfigured security providers fail-closed.
 * - 'sandbox': Development/demo mode. Deterministic simulation permitted for UX demonstration,
 *   but all generated proofs are tagged with 'sandbox' provenance and CANNOT be accepted by
 *   production authorization middleware.
 * - 'test': Automated test mode. Deterministic mocks and edge-case validations permitted.
 */

export type SocialWtfEnvironment = 'production' | 'sandbox' | 'test';
export type AppEnvironment = SocialWtfEnvironment;

export function getSecurityEnvironment(): SocialWtfEnvironment {
  const env = (process.env.SOCIAL_WTF_ENV || process.env.NODE_ENV || 'production').toLowerCase().trim();
  if (env === 'test') return 'test';
  if (env === 'sandbox' || env === 'development' || env === 'dev') return 'sandbox';
  return 'production';
}

export const getAppEnvironment = getSecurityEnvironment;

export function isProduction(): boolean {
  return getSecurityEnvironment() === 'production';
}

export const isProductionEnvironment = isProduction;

export function isSandbox(): boolean {
  return getSecurityEnvironment() === 'sandbox';
}

export function isTest(): boolean {
  return getSecurityEnvironment() === 'test';
}


/**
 * Validates critical production configuration on startup / request.
 * Throws or returns actionable validation status without exposing secrets.
 */
export function validateProductionSecurityConfig(): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const env = getSecurityEnvironment();

  if (env === 'production') {
    const sessionSecret = process.env.SESSION_SECRET || '';
    if (!sessionSecret || sessionSecret.length < 32) {
      errors.push('SESSION_SECRET is missing or shorter than 32 characters in production.');
    }
    if (sessionSecret.includes('your_secure_random_session_secret')) {
      errors.push('SESSION_SECRET contains default insecure template placeholder.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
