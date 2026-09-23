import crypto from 'crypto';

/**
 * Extract and hash client identification from an incoming request for audit logging.
 * Hashes are one-way (SHA-256 truncated) so raw IPs and user-agents are never stored.
 *
 * Uses headers set by edge middleware, falling back to standard headers.
 */
export function extractAuditContext(req: Request): {
  ipHash: string;
  userAgentHash: string;
} {
  const headers = new Headers(req.headers);

  // IP: prefer middleware-injected header, then standard forwarding headers
  const rawIp =
    headers.get('x-client-ip-for-audit') ||
    headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    headers.get('x-real-ip') ||
    'unknown';

  // User-Agent
  const rawUa =
    headers.get('x-client-ua-for-audit') ||
    headers.get('user-agent') ||
    'unknown';

  return {
    ipHash: hashForAudit(rawIp),
    userAgentHash: hashForAudit(rawUa),
  };
}

function hashForAudit(value: string): string {
  if (!value || value === 'unknown') return 'unknown';
  return crypto.createHash('sha256').update(value).digest('hex').slice(0, 16);
}
