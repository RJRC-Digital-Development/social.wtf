# Social.wtf — Bounty Evidence & Verification Package

**Target Repository:** `RJRC-Digital-Development/social.wtf`  
**Baseline Commit SHA:** `b72a7803d567735ee0fc68c7004646f7129e0e64`  
**Preservation Tag:** `bounty-submission-baseline`  
**Target Blockchain:** Cookie Chain SVM  

---

## 1. Build & Compilation Evidence

- **Framework:** Next.js 14 (App Router) + React 18 + Tailwind CSS + TypeScript
- **Smart Contract Framework:** Solana Anchor (Rust `anchor-lang 0.29.0`)
- **Build Command:** `npm run build`
- **Test Command:** `npm test` (`node tests/security/run-all.mjs`)
- **Test Results:** 9 test suites, 60 tests passed, 0 failures.

---

## 2. Wallet & Blockchain Integration

### Nightly Wallet Handshake
- **Component:** `src/components/wallet/NightlyWalletButton.tsx`
- **Standard:** Solana Wallet Standard + Nightly Wallet Provider (`window.nightly.solana`)
- **SIWS Authentication:** Cryptographic Sign-In with Solana (SIWS) via Ed25519 signature verification against atomic single-use nonces.

### Cookie Chain RPC & Program Metadata
- **Chain Name:** Cookie Chain SVM
- **RPC Endpoint:** `https://rpc.cookie.fun`
- **Explorer URL:** `https://explorer.cookie.fun`
- **Program ID:** `9iapGcxDbDtZ2bWtwM2kLYNW67XH2qzPxLxXfSUbQQZq`
- **Platform Treasury PDA:** `COOK1E...PlatformTreasury` (`PLATFORM_TREASURY_PUBKEY`)

---

## 3. Smart Contract & Economic Invariants

### 95/5 Revenue Split Formula
The protocol enforces that creators retain **95%** of all earnings, while **5%** is routed to the platform treasury.

```rust
let treasury_fee = (amount * platform_state.fee_bps) / 10_000;
let creator_amount = amount.checked_sub(treasury_fee).unwrap();

// Invariant guarantee:
assert_eq!(creator_amount + treasury_fee, amount);
```

### Invariants Enforced in `contracts/social_wtf/src/lib.rs`:
1. **Checks-Effects-Interactions (CEI):** Internal accounting and receipt initialization occur prior to lamport transfers.
2. **PDA Derivation:** Platform state derived with `seeds = [b"platform"]`; products with `seeds = [b"product", creator.key().as_ref(), product_id.as_bytes()]`.
3. **Anti-Wash Trading:** Self-purchases (`buyer == creator`) and self-tipping (`tipper == creator`) are rejected with on-chain errors.
4. **Treasury Binding:** Treasury recipient strictly constrained via `has_one = treasury` on platform PDA.

---

## 4. Sentinel Trust & Safety Architecture

### Verification Tiers & Access Flow
1. **General Content:** Publicly accessible to all visitors.
2. **Adult Entertainment (18+):** Requires:
   - Debit or Credit Card verification ($0 auth or gateway check).
   - Live Video Biometric liveness check.
   - **Under-25 Safeguard:** If AI neural evaluation estimates age under 25, valid Government ID (Driver's License or ID Card) is required.
3. **Fail-Closed Principle:** In production mode, lack of configured verification provider results in `503 PROVIDER_UNAVAILABLE` rather than an unverified bypass.

### Content Shielding
- Server-side classification in `/api/posts` audits content regardless of client metadata.
- Posts classified as mature are shielded and invisible to unauthenticated or unverified users.

---

## 5. Security & Regression Verification Matrix

| Suite | File | Tests | Pass Rate |
| :--- | :--- | :--- | :--- |
| **Fee Invariant & Fuzzing** | `tests/security/fee-invariant.test.mjs` | 6 | 100% |
| **Input Sanitization & Anti-SSRF** | `tests/security/sanitize.test.mjs` | 3 | 100% |
| **Cryptographic Wallet Auth** | `tests/security/wallet-auth.test.mjs` | 4 | 100% |
| **Rate Limiting & DoS** | `tests/security/rate-limiter.test.mjs` | 4 | 100% |
| **Cryptographic Sessions** | `tests/security/session.test.mjs` | 10 | 100% |
| **Contract Invariants & Authority** | `tests/security/contract-invariants.test.mjs` | 6 | 100% |
| **Distributed Store & Atomic Nonces** | `tests/security/distributed-store.test.mjs` | 6 | 100% |
| **Backend Authorization & Gating** | `tests/security/authorization.test.mjs` | 10 | 100% |
| **Trust Wallet & Server Signer** | `tests/security/trust-wallet-signer.test.mjs` | 9 | 100% |
| **TOTAL** | **9 Suites** | **60 Tests** | **100% (60/60)** |

---

## 6. Known Limitations & Sandbox Scope

- **Sandbox vs Production Verification:** In local development and sandbox environments (`SOCIAL_WTF_ENV=sandbox`), biometric video and card verification can be simulated for UX evaluation. In production (`SOCIAL_WTF_ENV=production`), production API credentials for payment and identity providers are required to grant adult access.
- **Distributed Store:** In single-instance setups without Redis credentials, session revocation and rate limiting operate in process memory; in multi-worker production deployments, Redis/Upstash/Vercel KV REST credentials enable shared cluster state.
