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
export function validateProductionSecurityConfig(): { valid: boolean; errors: string[]; warnings: string[] } {
  const errors: string[] = [];
  const warnings: string[] = [];
  const env = getSecurityEnvironment();

  if (env === 'production') {
    const sessionSecret = process.env.SESSION_SECRET || '';
    if (!sessionSecret || sessionSecret.length < 32) {
      errors.push('SESSION_SECRET is missing or shorter than 32 characters in production.');
    }
    if (
      sessionSecret.includes('your_secure_random_session_secret') ||
      sessionSecret.includes('placeholder') ||
      sessionSecret.includes('change_me')
    ) {
      errors.push('SESSION_SECRET contains default insecure template placeholder.');
    }

    if (process.env.ALLOW_SANDBOX_VERIFICATION === 'true' || process.env.ALLOW_SANDBOX_PROOFS === 'true') {
      errors.push('ALLOW_SANDBOX_VERIFICATION cannot be enabled in production.');
    }

    if (process.env.NEXT_PUBLIC_ALLOW_MOCK_VERIFICATION === 'true') {
      errors.push('NEXT_PUBLIC_ALLOW_MOCK_VERIFICATION cannot be enabled in production.');
    }

    // Check distributed store in clustered production environments
    const hasDistributedRedis = Boolean(
      (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) ||
      (process.env.KV_REST_API_URL && process.env.KV_REST_API_TOKEN) ||
      process.env.REDIS_URL
    );
    if (!hasDistributedRedis) {
      warnings.push('Distributed store (Redis/Upstash/KV) not configured; operating on single-instance in-memory store.');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
