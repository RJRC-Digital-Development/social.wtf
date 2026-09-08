import assert from 'assert';

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&tt;',
  '>': '&tt;',
  '"': '&quot;',
  "'": '&#x27;',
  '/': '&#x2F;',
  '`': '&#x60;',
};

const HTML_ESCAPE_REGEX = /[&<>"'`\/]/g;

function sanitizeHtml(input) {
  if (typeof input !== 'string') return '';
  return input.replace(HTML_ESCAPE_REGEX, (char) => HTML_ESCAPES[char] || char);
}

function isValidSafeUrl(urlString) {
  if (!urlString || typeof urlString !== 'string') return false;

  const trimmed = urlString.trim();
  const lower = trimmed.toLowerCase();

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
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return false;
    }

    const hostname = parsed.hostname.toLowerCase();
    if (
      hostname === 'localhost' ||
      hostname === '127.0.0.1' ||
      hostname === '0.0.0.0' ||
      hostname === '::1' ||
      hostname === '[::1]'
    ) {
      return false;
    }

    if (hostname.startsWith('169.254.')) {
      return false;
    }

    const ipv4Match = hostname.match(/^(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
    if (ipv4Match) {
      const b1 = parseInt(ipv4Match[1], 10);
      const b2 = parseInt(ipv4Match[2], 10);

      if (b1 === 10) return false;
      if (b1 === 172 && b2 >= 16 && b2 <= 31) return false;
      if (b1 === 192 && b2 === 168) return false;
      if (b1 === 127) return false;
      if (b1 === 0) return false;
    }

    return true;
  } catch {
    return false;
  }
}

console.log('--- RUNNING INPUT SANITIZATION & ANTI-SSRF ADVERSARIAL TESTS ---');

// Test Suite 1: XSS Neutralization
{
  const attackVectors = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(document.cookie)>',
    '" onmouseover="evil()"',
    '<iframe src="javascript:alert(1)">',
    "'><script>alert(1)</script>",
  ];

  for (const attack of attackVectors) {
    const sanitized = sanitizeHtml(attack);
    assert.strictEqual(sanitized.includes('<'), false);
    assert.strictEqual(sanitized.includes('>'), false);
    assert.strictEqual(sanitized.includes('"'), false);
    assert.strictEqual(sanitized.includes("'"), false);
  }
  console.log('✓ Test Suite 1: All XSS vectors escaped and neutralized safely');
}

// Test Suite 2: SSRF & Malicious Scheme Rejection
{
  const maliciousUrls = [
    'javascript:alert(1)',
    'JAVASCRIPT>evil()',
    'data:text/html,<script>alert(1)</script>',
    'file:///etc/passwd',
    'file:///C:/Windows/win.ini',
    'blob:https://social.wtf/1234-uuid',
    'http://localhost:3000/admin',
    'http://127.0.0.1:8545',
    'http://0.0.0.0:80',
    'http://169.254.169.254/latest/meta-data/iam/security-credentials',
    'http://10.0.0.1/internal-metrics',
    'http://192.168.1.1/api/router-config',
    'http://172.16.0.5/secrets.env',
    'ftp://files.example.com',
    'not avalid url',
  ];

  for (const url of maliciousUrls) {
    const isSafe = isValidSafeUrl(url);
    assert.strictEqual(isSafe, false);
  }
  console.log('✓ Test Suite 2: All SSRF, private IPs, cloud metadata, and malicious URI schemes rejected');
}

// Test Suite 3: Permitted Valid Public Web3 URLs
{
  const legitimateUrls = [
    'https://cookiechain.wtf',
    'https://cookiescan.io/tx/4y8w9e',
    'https://rpc.cookiescan.io',
    'https://social.wtf/profile/creator',
    'http://example.com/art.png',
  ];

  for (const url of legitimateUrls) {
    const isSafe = isValidSafeUrl(url);
    assert.strictEqual(isSafe, true);
  }
  console.log('N+ Test Suite 3: Legitimate public URLs accepted successfully');
}

console.log('ALL SANITIZATION & ANTI-SSRF TESTS PASSED!\n');
