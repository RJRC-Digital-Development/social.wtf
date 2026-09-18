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
 * Strips dangerous control characters and clamps string length for HTML-rendered context.
 */
export function sanitizeString(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') return '';
  // Remove ASCII control characters (0-31 except tab/newline, and 127)
  const stripped = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return sanitizeHtml(stripped.trim().slice(0, maxLength));
}

/**
 * Sanitizes plain text (without HTML escaping) for non-HTML contexts (e.g. JSON, database, logs)
 */
export function sanitizePlainText(input: string, maxLength: number = 1000): string {
  if (typeof input !== 'string') return '';
  const stripped = input.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '');
  return stripped.trim().slice(0, maxLength);
}

/**
 * Sanitizes user handles / slugs
 */
export function sanitizeHandle(handle: string): string {
  if (typeof handle !== 'string') return '';
  return handle.trim().replace(/^@+/, '').toLowerCase().replace(/[^a-z0-9_-]/g, '').slice(0, 30);
}

/**
 * Sanitizes transaction memo fields for on-chain storage
 */
export function sanitizeMemo(memo: string): string {
  if (typeof memo !== 'string') return '';
  return memo.replace(/[\x00-\x1F\x7F]/g, '').trim().slice(0, 120);
}

/**
 * Strict Anti-SSRF & Anti-XSS URL Validator
 * Rejects javascript:, data:, file:, localhost, cloud metadata, credential-bearing URLs, and private IP blocks (IPv4 and IPv6).
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
    lower.startsWith('blob:') ||
    lower.startsWith('about:')
  ) {
    return false;
  }

  try {
    const parsed = new URL(trimmed);

    // Only HTTP and HTTPS are permitted
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    // Reject URLs with embedded credentials (e.g. http://user:pass@host)
    if (parsed.username || parsed.password) {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase().replace(/^\[|\]$/g, '');

    // 2. Reject localhost & loopback
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '0:0:0:0:0:0:0:1' ||
      hostname === '0:0:0:0:0:0:0:0'
    ) {
      return false;
    }

    // 3. Reject AWS/GCP/Azure link-local cloud metadata (169.254.0.0/16)
    if (hostname.startsWith('169.254.')) {
      return false;
    }

    // 4. Reject private IPv4 subnets (RFC 1918) and loopback/broadcast
    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const b1 = parseInt(ipv4Match[1], 10);
      const b2 = parseInt(ipv4Match[2], 10);
      const b3 = parseInt(ipv4Match[3], 10);
      const b4 = parseInt(ipv4Match[4], 10);

      if (b1 > 255 || b2 > 255 || b3 > 255 || b4 > 255) return false;

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
      // 100.64.0.0/10 carrier-grade NAT
      if (b1 === 100 && b2 >= 64 && b2 <= 127) return false;
      // 192.0.2.0/24 documentation
      if (b1 === 192 && b2 === 0 && b3 === 2) return false;
      // 198.51.100.0/24 documentation
      if (b1 === 198 && b2 === 51 && b3 === 100) return false;
      // 203.0.113.0/24 documentation
      if (b1 === 203 && b2 === 0 && b3 === 113) return false;
      // 224.0.0.0/4 multicast
      if (b1 >= 224) return false;
    }

    // 5. Reject private IPv6 subnets (Unique Local fc00::/7, Link-Local fe80::/10, Multicast ff00::/8)
    if (
      hostname.startsWith('fc') ||
      hostname.startsWith('fd') ||
      hostname.startsWith('fe8') ||
      hostname.startsWith('fe9') ||
      hostname.startsWith('fea') ||
      hostname.startsWith('feb') ||
      hostname.startsWith('ff') ||
      hostname.startsWith('::ffff:') // IPv4-mapped IPv6
    ) {
      return false;
    }

    // 6. Decimal or Hex IP representations (e.g. 2130706433 or 0x7f000001)
    if (/^\d+$/.test(hostname) || /^0x[0-9a-fA-F]+$/i.test(hostname)) {
      return false;
    }

    return true;
  } catch {
    return false;
  }
}
