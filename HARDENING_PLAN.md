# Social.wtf — Full Destruction / Hardening Plan

## Priority System
- **P0 — Blocker**: Exploitable, funds/security, authentication, authorization, or architectural flaw.
- **P1 — Critical**: Serious abuse or reliability issue.
- **P2 — High**: Important before public production.
- **P3 — Medium**: Hardening, maintainability, UX.
- **P4 — Enhancement**: Optimization / future capability.

---

## 1. 🔴 SMART CONTRACT — COMPLETE REDESIGN REVIEW
- **1.1 Platform Initialization (P0)**:
  - Deterministic PDA for PlatformState (seeds = [bplatform]).
  - Admin must sign; initialization cannot be hijacked or called more than once.
  - Treasury must be explicitly validated.
  - Fee bounded (ee_bps <= 2500 / 25%).
  - Platform identity tied deterministically to program.
- **2. Fee System (P0)**:
  - Dynamic single source of truth: ee = amount * platform_state.fee_bps / 10,000.
  - Invariant: creator_amount + treasury_fee == total_amount enforced with checked arithmetic.
  - Boundary tests: 1 lamport, 19 lamports, 100, 10,000, max u64.
- **3. Product Ownership & On-Chain Storefront (P0)**:
  - On-chain Product PDA: seeds = [bproduct, creator.key().as_ref(), product_id.as_bytes()].
  - Fields: creator, product_id, price_lamports, is_active, metadata_uri, 	otal_sales, ump.
- **4. Never Trust Client-Supplied Price (P0)**:
  - purchase_product reads product.price_lamports directly from on-chain state.
  - Buyer requests purchase; buyer does NOT determine price.
- **5. Creator Authorization (P0)**:
  - Only creator authority can create or update products.
  - Strict Anchor account constraints.
- **6. Treasury Security (P0)**:
  - Controlled treasury address checked against platform_state.treasury.
  - Protected admin rotation instructions with audit events.
- **7. Admin Governance (P1)**:
  - Two-step admin transfer (	ransfer_admin -> ccept_admin).
  - Explicit administrative update functions (update_fee, update_treasury).
- **8. Emergency Pause (P0)**:
  - platform_state.is_paused.
  - Admin-only pause_platform() / unpause_platform().
  - Halts purchases and tips during security incidents.
- **9. Integer Safety (P0)**:
  - Zero unchecked arithmetic: all operations use checked_add, checked_sub, checked_mul, checked_div.
- **10. Account Validation (P0)**:
  - Elimination of unchecked AccountInfo in favor of typed Anchor accounts with explicit signer/mut constraints.
- **11. Purchase Receipt Semantics (P1)**:
  - Nonce/counter-based receipt PDA ([breceipt, buyer.key().as_ref(), product.key().as_ref(), &product.total_sales.to_le_bytes()]).
- **12. String Bounds / Account Rent (P1)**:
  - Strict limits: MAX_PRODUCT_ID_LEN = 32, MAX_METADATA_URI_LEN = 128.
- **13. DoS Defenses (P1)**:
  - Maximum account sizing, rejection of empty/oversized inputs.

---

## 2. 🔴 FRONTEND & API SECURITY
- **14. Zero-Trust Client Model (P0)**:
  - No client-supplied roles, addresses, or prices trusted. Independent server & contract validation.
- **15. Cryptographic Wallet Authentication (P0)**:
  - Nonce challenge flow: /api/auth/nonce and /api/auth/verify.
  - ED25519 signature verification against domain and timestamped nonce.
- **16. API Security (P1)**:
  - In-memory rate limiting, request size bounds, schema validation, and error normalization on all routes.
- **17. AI Endpoint Security (P1)**:
  - Token budget caps, prompt injection defense, model allowlists, and per-IP/per-user throttling.
- **18. API Secret Management (P0)**:
  - Verified 0 secrets committed or exposed to client bundles.
- **19. XSS Defense (P0)**:
  - Strict sanitization of posts, comments, profile fields, and generated widgets.
- **20. SSRF / URL Validation (P1)**:
  - Whitelist protocol validation (https://, http://), reject javascript:, data:, ile:, localhost, and internal IPv4 ranges.

---

## 3. 🔴 CONTENT, PRIVACY & SOCIAL ARCHITECTURE
- **21. Transparent Moderation (P2)**:
  - Moderation logs with timestamp, rule trigger, and appeal mechanisms.
- **22. Algorithm Transparency (P2)**:
  - User controls for feed ordering (Chronological, Trending, Following).
- **23. Data Ownership Separation (P2)**:
  - Clear boundary: On-chain (integrity, ownership, payments) vs. Off-chain (media, large posts, ephemeral data).
- **24. Formal Privacy Data Model (P2)**:
  - Zero-persistence ephemeral RAM scrubbing certified.
- **25. Sybil / Spam Resistance (P1)**:
  - Rate limiting, wallet reputation scoring, proof-of-human video safeguards.
- **26. Economic Attack Resilience (P1)**:
  - Minimum transfer limits, fee split rounding invariants.

---

## 4. 🔴 CREATOR SDK, TESTING & OBSERVABILITY
- **27. Creator SDK Boundary (P1)**:
  - Strongly typed, versioned client interfaces with zero embedded secrets.
- **28. Comprehensive Test Upgrade (P0)**:
  - Unit tests, property tests, and boundary tests for fee splits.
- **29. Permanent Adversarial Test Suite (P0)**:
  - 	ests/security/ covering arithmetic overflow, XSS, SSRF, replay, and rate limiting.
- **30. Dependency Security (P1)**:
  - Lockfile verification and automated vulnerability audits.
- **31. CI/CD Security Workflow (P1)**:
  - GitHub Actions .github/workflows/security.yml for automated lint, type check, tests, and secret scan.
- **32. Observability & Structured Logging (P2)**:
  - Structured, privacy-safe audit logs.
- **33. Security Threat Model Documentation (P2)**:
  - Formal SECURITY.md.
- **34. Bounty Submission Transparency (P2)**:
  - Explicit categorization of Implemented vs. Roadmapped features.
- **35. Core Architectural Principle**:
  - *Never trust the client. Never trust a supplied relationship. Never trust a supplied price. Never trust an authorization claim. Verify every security-critical invariant at the enforcement layer.*
