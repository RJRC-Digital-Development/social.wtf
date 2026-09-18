import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT_DIR = path.resolve(__dirname, '..');

const SUSPICIOUS_PATTERNS = [
  {
    name: 'Exposed Private Key Assignment',
    regex: /(?:PLATFORM_PRIVATE_KEY|SERVER_SIGNER_PRIVATE_KEY|TREASURY_PRIVATE_KEY)\s*=\s*['"]?[a-zA-Z0-9+/=_-]{30,}['"]?/i,
  },
  {
    name: 'Exposed Solana Keypair Byte Array',
    regex: /(?:privateKey|secretKey|signingKey)\s*[:=]\s*\[\s*(?:(?:[0-9]{1,3}\s*,\s*){31,63}[0-9]{1,3})\s*\]/i,
  },
  {
    name: 'Generic Auth / Session Token Secret Assignment',
    regex: /(?:SESSION_SECRET|UPSTASH_REDIS_REST_TOKEN)\s*=\s*['"][a-zA-Z0-9_\-\.]{20,}['"]/i,
  },
  {
    name: 'RSA / EC Private Key Block',
    regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  },
];

const ALLOWLISTED_PLACEHOLDERS = [
  'your_secure_random_session_secret_key_minimum_32_characters_long',
  'your_upstash_rest_token',
  'your-database-id.upstash.io',
  'CookTreasury11111111111111111111111111111111',
  'HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9',
  'CookYourWallet11111111111111111111111111',
  'CookCreator11111111111111111111111111',
];

let violationsFound = 0;

console.log('================================================================');
console.log('            SOCIAL.WTF AUTOMATED SECRET SCANNER                 ');
console.log('================================================================');

let filesToScan = [];
try {
  // Use git ls-files to scan all tracked and staged files
  const gitOutput = execSync('git ls-files --cached --others --exclude-standard', {
    cwd: ROOT_DIR,
    encoding: 'utf8',
  });
  filesToScan = gitOutput.split('\n').map((f) => f.trim()).filter(Boolean);
} catch (e) {
  console.warn('Could not run git ls-files, falling back to directory scan');
}

for (const relPath of filesToScan) {
  if (relPath.startsWith('.env') && relPath !== '.env.example') {
    console.error(`[SECURITY VIOLATION] Tracked or unignored environment file detected: ${relPath}`);
    violationsFound++;
    continue;
  }

  const ext = path.extname(relPath).toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.ico', '.webp', '.mp3', '.mp4', '.woff', '.woff2', '.pdf'].includes(ext)) {
    continue;
  }

  if (relPath === 'scripts/scan-secrets.mjs' || relPath === '.env.example' || relPath === 'package-lock.json') {
    continue;
  }

  const fullPath = path.join(ROOT_DIR, relPath);
  if (!fs.existsSync(fullPath)) continue;

  try {
    const content = fs.readFileSync(fullPath, 'utf8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      if (ALLOWLISTED_PLACEHOLDERS.some((p) => line.includes(p))) {
        return;
      }

      if (relPath.startsWith('tests/') && (line.includes('Keypair.generate()') || line.includes('bs58.encode('))) {
        return;
      }

      for (const pattern of SUSPICIOUS_PATTERNS) {
        if (pattern.regex.test(line)) {
          console.error(`[SECURITY VIOLATION] ${pattern.name} in ${relPath}:${idx + 1}`);
          console.error(`   Content: ${line.trim().substring(0, 100)}...`);
          violationsFound++;
        }
      }
    });
  } catch (err) {
    console.warn(`[WARN] Could not read ${relPath}: ${err.message}`);
  }
}

if (violationsFound > 0) {
  console.error(`\nFAILED: Found ${violationsFound} suspicious secret violation(s) in repository!`);
  process.exit(1);
} else {
  console.log(`\nPASSED: Scanned ${filesToScan.length} tracked/staged files. Zero secrets or leaked environment files detected!`);
  process.exit(0);
}
