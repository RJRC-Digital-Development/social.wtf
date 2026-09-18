# Social.wtf Security Policy & Threat Model

##  Core Architectural Principle
> **"Never trust the client. Never trust a supplied relationship. Never trust a supplied price. Never trust an authorization claim. Verify every security-critical invariant at the enforcement layer."**

---

## 1. Threat Model & Trust Boundaries

### A. The Client is Completely Untrusted
- We assume all browser environments (React state, `localStorage`, client memory, DevTools) are fully compromised or attacker-controlled.
- Prices, user roles, wallet identities, and permissions are never established by client declaration.
- Every economic transaction and permission claim is verified either:
  1. On-chain via the Solana Virtual Machine (SVM) program constraints; or
  2. Server-side via cryptographic signature verification against domain-bound nonces.

### B. On-Chain vs. Off-Chain Separation of Concerns
| Layer | Responsibilities | Security Enforcement |
| :--- | :--- | :--- |
| **On-Chain (SVM Anchor Program)** | • Product ownership & pricing<br>• Automated 5% fee split routing<br>• Creator proceeds delivery<br>• Unique purchase receipt PDA creation<br>• Emergency pause & governance | • Strict Anchor account constraints<br>• Deterministic PDAs (`platform`, `product`, `receipt`)<br>• Checked integer arithmetic (`checked_add`, `checked_mul`, `checked_div`)<br>• Invariant: `creator + treasury == total` |
| **Server / API Layer (`Next.js`)** | • Cryptographic wallet challenge issuance & verification<br>• Multimodal AI vision screening (`/api/shield/scan`)<br>• Sliding-window rate limiting<br>• Anti-SSRF URL filtering | • Ed25519 signature checks (SIWS standard)<br>• Replay attack prevention via single-use nonces<br>• Cloud metadata (`169.254.169.254`) and private IP rejection<br>• Payload size limits (5MB) |
| **Client / Creator SDK Layer** | • Storefront presentation<br>• Nightly wallet connector<br>• Ephemeral RAM zeroing for biometric verifications | • Input sanitization (XSS defense)<br>• Sandbox mocks for devnet testing<br>• Zero persistent storage of sensitive biometrics |

---

## 2. Critical Invariants

### 1. The Fee Split Invariant
For every on-chain economic transfer:
$$\text{creator\_amount} + \text{treasury\_fee} \equiv \text{total\_payment}$$
- **Single Source of Truth**: The fee rate is dynamically retrieved from `PlatformState.fee_bps`. No constants are duplicated across instruction handlers.
- **Bounded Fees**: Maximum fee is hard-capped at 25.00% (`MAX_FEE_BPS = 2_500`).
- **Mathematical Safety**: Checked integer arithmetic prevents overflow and underflow across all amounts from 1 lamport to maximum safe $u64$.

### 2. Product Pricing & Ownership Invariant
- **Never Trust Client Price**: `purchase_product` reads `product.price_lamports` strictly from the on-chain `Product` account PDA derived from `[b"product", creator, product_id]`.
- **Creator Authorization**: Only the authorized creator signer can create or modify products.
- **Anti-Wash Trading Protection**: The contract strictly disallows self-tipping (`tipper != creator`) and self-purchases (`buyer != creator`) to prevent artificial metric inflation and fake transaction volume.

### 3. Governance & Emergency Pause
- **Two-Step Admin Transfer**: Ownership transfers require initiation by current admin (`transfer_admin`), followed by explicit acceptance signature from the pending admin (`accept_admin`).
- **Emergency Circuit Breaker**: The platform can be paused by governance (`pause_platform`) to freeze all tips and purchases during security incidents while administrative recovery functions operate.
- **Typed Account Validation**: All creator and treasury destinations use typed `SystemAccount<'info>` with `has_one` constraints to eliminate account substitution attacks.

### 4. Cryptographic Session & Distributed State Architecture
- **Fail-Closed Secret Enforcement**: `SESSION_SECRET` must be set with at least 32 characters in all environments; missing or short secrets trigger immediate fail-closed shutdown.
- **Versioned HMAC Tokens**: Stateless tamper-evident tokens using `v1.<payloadBase64Url>.<signatureBase64Url>` format signed with HMAC-SHA256 and constant-time `crypto.timingSafeEqual` comparison.
- **Distributed State Coordination**:
  - **Single-Instance / Local Dev**: High-performance in-memory Maps with sliding-window pruning, capacity bounds (`MAX_ACTIVE_CHALLENGES = 10,000`), and automatic expiration cleanup.
  - **Multi-Instance / Serverless (Vercel)**: Zero-dependency REST adapter supporting Upstash Redis / Vercel KV for atomic single-use nonce consumption (`GETDEL`), cross-instance session revocation blocklists, and global rate limiting.

---

## 3. Adversarial Security Verification Suite

Permanent security regression tests are located under [`tests/security/`](file:///c:/Users/SnapCopy/OneDrive/Documents/CoinSwag/social.wtf/tests/security):
- `fee-invariant.test.mjs`: Fuzzes 1,000 randomized amounts and boundary edge cases (1 lamport, 19 lamports, 100, 10,000, 1M COOK) confirming 100% preservation of the fee invariant.
- `sanitize.test.mjs`: Tests XSS payloads and SSRF vectors (cloud metadata, loopback, private IPv4 blocks).
- `wallet-auth.test.mjs`: Tests Ed25519 signature verification, nonce expiry, address mismatch rejection, and anti-replay nonce consumption.
- `rate-limiter.test.mjs`: Tests sliding-window quota enforcement and key isolation under simulated DoS traffic.
- `session.test.mjs`: Tests v1 token generation, tampering detection, fail-closed secrets, expiration, and authenticated revocation.
- `contract-invariants.test.mjs`: Tests anti-wash self-tipping rejection, self-purchase wash trading rejection, CEI ordering, and destination constraints.
- `distributed-store.test.mjs`: Tests atomic `GETDEL` nonce consumption, distributed TTL pruning, rate limiting increments, and REST protocol conformity.

Execute all suites locally with:
```bash
npm test
```

---

## 4. Reporting a Vulnerability

If you discover a security vulnerability, please do NOT create a public issue.

- **Private Vulnerability Reporting**: Enabled on this repository. Visit [Security Advisories](https://github.com/RJRC-Digital-Development/social.wtf/security/advisories/new) to submit a confidential report.
- Our security response team will review submissions within 24 hours.
