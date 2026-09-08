/**
 * Security & Input Sanitization Layer
 * Defends against XSS, SSRF, injection attacks, and buffer exhaustion.
 */

// Characters requiring HTML entity escaping
const HTML_ESCAPES: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
};

const HTML_ESCAPE_REGEX = /[&<>"'`\/]/g;

/**
 * Escapes HTML control characters to prevent Cross-Site Scripting (XSS).
 */
export function sanitizeHtml(input: string): string {
  if (typeof input !== 'string') return '';
  return input.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPES[char] || char);
}

/**
 * Strips dangerous control characters and clamps string length.
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') return '';
  // Remove ASCII control characters (0-31 except tab/newline, and 127)
  const stripped = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitizeHtml(stripped.trim().slice(0, maxLength));
}

/**
 * Strict Anti-SSRF & Anti-XSS URL Validator
 * Rejects javascript:, data:, file:, localhost, cloud metadata, and private IP blocks.
 */
export function isValidSafeUrl(urlString: string): boolean {
  if (!urlString || typeof urlString !== 'string') return false;

  const trimmed = urlString.trim();
  const lower = trimmed.toLowerCase();

  // 1. Immediately reject dangerous schemes
  if (
    lower.startsWith('javascript:') ||
    lower.startsWith('data:') ||
    lower.startsWith('file:') ||
    lower.startsWith('vbscript:') ||
    lower.startsWith('blob:')
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);

    // Only HTTP and HTTPS are permitted
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();

    // 2. Reject localhost & loopback
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return false;
    }

    // 3. Reject AWS/GCP/Azure link-local cloud metadata (169.254.169.254)
    if (hostname.startsWith('169.254.')) {
      return false;
    }

    // 4. Reject private IPv4 subnets (RFC 1918)
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const b1 = parseInt(ipv4Match[1], 10);
      const b2 = parseInt(ipv4Match[2], 10);

      // 10.0.0.0/8
      if (b1 === 10) return false;
      // 172.16.0.0/12 (172.16.0.0 - 172.31.255.255)
      if (b1 === 172 && b2 >= 16 && b2 <= 31) return false;
      // 192.168.0.0/16
      if (b1 === 192 && b2 === 168) return false;
      // 127.0.0.0/8 loopback
      if (b1 === 127) return false;
      // 0.0.0.0/8
      if (b1 === 0) return false;
    }

    return true;
  } catch {
    // Malformed URL
    return false;
  }
}
