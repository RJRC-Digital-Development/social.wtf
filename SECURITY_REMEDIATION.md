# Social.wtf — Security Remediation Ledger

**Target Repository:** `RJRC-Digital-Development/social.wtf`  
**Security Standard:** Bounty-Grade Defense-in-Depth  
**Baseline Commit:** `b72a7803d567735ee0fc68c7004646f7129e0e64`  

---

## 1. Security Findings & Remediation Summary Table

| ID | Severity | Finding | Evidence | Exploitability | Fix | Test | Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **SEC-01** | **P0** | Potential exposed private key in tracked environment files | Legacy `.env.txt` in repository tree | High (if key funded on mainnet) | Purged secret material from repository; configured `.gitignore` and automated `scripts/scan-secrets.mjs` scanner | Secret scanner scans all 96 tracked files | **RESOLVED** |
| **SEC-02** | **P0** | Server signer endpoint lacked strict capability authorization | `/api/transactions/execute` accepting server signer calls from ordinary authenticated users | High (unauthorized drain of platform hot wallet) | Enforced `scope === 'admin'` guard on server-signed operations; bounded amounts to 10,000 COOK; restricted operations to allowed list | `tests/security/trust-wallet-signer.test.mjs` (9/9 passed) | **RESOLVED** |
| **SEC-03** | **P0** | Adulthood card verification format validation without payment gateway | `/api/auth/card` returning verified on Luhn check alone | Medium (minor bypass of 18+ gate) | Enforced production fail-closed requirement: production requires configured card gateway (`STRIPE_SECRET_KEY` etc.) or returns 503; sandbox explicitly labeled | `tests/security/authorization.test.mjs` (Test 4 & 8) | **RESOLVED** |
| **SEC-04** | **P0** | Client-controlled simulated age in video biometric endpoint | `/api/auth/video` accepting `body.simulatedAge` in production | Medium | Stripped client-controlled age override in production mode; requires authoritative neural enclave in production | `tests/security/authorization.test.mjs` (Test 5, 6, 7) | **RESOLVED** |
| **SEC-05** | **P0** | Government ID upload payload presence converted to verified | `/api/auth/id` returning verified on image presence | Medium | Added production fail-closed provider check; dual document (front + back) verification records issued | `tests/security/authorization.test.mjs` (Test 6) | **RESOLVED** |
| **SEC-06** | **P0** | Content moderation shield state owned by client payload | `/api/posts` allowing author to set `isShielded: false` on adult content | High (unshielded NSFW content in public feed) | Server-side keyword and classifier analysis enforces `isShielded` regardless of client claim; author must possess adult claims to post adult content | `tests/security/authorization.test.mjs` (Test 10) | **RESOLVED** |
| **SEC-07** | **P1** | Distributed store silent fallback to in-memory on cluster failure | Nonces and revocations falling back to local memory | Medium (cross-worker replay on distributed deployments) | Implemented `DistributedStore` with atomic `getdel` single-use nonce consumption and fail-safe cluster coordination | `tests/security/distributed-store.test.mjs` (6/6 passed) | **RESOLVED** |
| **SEC-08** | **P1** | Session token tamper resistance and expiration | Session cookie/bearer header handling | Medium | Cryptographic HMAC-SHA256 tokens with timing-safe comparison, wallet binding, and server-side revocation registry | `tests/security/session.test.mjs` (10/10 passed) | **RESOLVED** |
| **SEC-09** | **P1** | Smart contract invariant enforcement & fee split integrity | `contracts/social_wtf/src/lib.rs` | High (funds misallocation) | Checks-Effects-Interactions pattern in Anchor program; PDA validation; self-purchase and self-tipping prevention; arithmetic overflow safety | `tests/security/contract-invariants.test.mjs` (6/6 passed) | **RESOLVED** |
| **SEC-10** | **P1** | SSRF and XSS injection in media URLs and user inputs | `/api/shield/scan` and social posts | Medium | Sanitization library with HTML entity encoding, URL validation against private IP ranges, cloud metadata endpoints, and invalid schemes | `tests/security/sanitize.test.mjs` (3/3 passed) | **RESOLVED** |
| **SEC-11** | **P1** | Rate limiter denial-of-service resistance | Sensitive auth, transaction, and scan endpoints | Medium | IP and per-wallet sliding window rate limiting across memory and distributed Redis store | `tests/security/rate-limiter.test.mjs` (4/4 passed) | **RESOLVED** |
| **SEC-12** | **P2** | Production security configuration validation on startup | Environment variable misconfiguration | Low | Created centralized configuration validator (`scripts/validate-config.mjs` and `src/lib/security/envConfig.ts`) enforcing minimum key lengths and fail-closed rules | Executed in CI and test scripts | **RESOLVED** |

---

## 2. Owner Actions Required

1. **Hot Wallet Rotation**: If `PLATFORM_PRIVATE_KEY` was previously deployed to an accessible environment, rotate the key on the production hosting dashboard and fund the new address.
2. **Production Provider Keys**: Supply valid API credentials for `STRIPE_SECRET_KEY`, `STRIPE_IDENTITY_KEY`, and `SENTINEL_ENCLAVE_API_KEY` on production environments to unlock production adult verification.
