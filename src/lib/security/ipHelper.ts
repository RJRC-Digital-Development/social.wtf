/**
 * Centralized Client IP Extraction Helper
 *
 * Extracts client IP safely based on trusted reverse-proxy headers (e.g. Vercel, Cloudflare)
 * or falls back to loopback in development/test environments.
 */

export function extractClientIp(req: Request): string {
  // Trust standard hosting proxy headers only in expected formats
  const xRealIp = req.headers.get('x-real-ip');
  if (xRealIp && isValidIpAddress(xRealIp.trim())) {
    return xRealIp.trim();
  }

  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(',')[0].trim();
    if (isValidIpAddress(firstIp)) {
      return firstIp;
    }
  }

  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp && isValidIpAddress(cfConnectingIp.trim())) {
    return cfConnectingIp.trim();
  }

  return '127.0.0.1';
}

export const getClientIp = extractClientIp;


function isValidIpAddress(ip: string): boolean {
  if (!ip || ip.length > 45) return false;
  // IPv4 format check
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  if (ipv4Regex.test(ip)) return true;

  // IPv6 format check
  const ipv6Regex = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:){1,7}:$/;
  return ipv6Regex.test(ip);
}
