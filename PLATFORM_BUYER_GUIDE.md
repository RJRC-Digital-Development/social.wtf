# SOCIAL.WTF PLATFORM BUYER SPECIFICATION AND CONFIGURATION GUIDE

## Executive Summary

Social.wtf is a decentralized creator social network and commerce platform built on the Cookie Chain SVM ecosystem. The architecture implements a non-custodial 95/5 economic settlement invariant, end-to-end cryptographic wallet authentication, decentralized profile and feed routing, and a Sentinel privacy verification pipeline.

This guide provides complete technical configuration and handover instructions for a platform buyer, partitioned into three operational tiers:
1. User Frontend Configuration
2. User Backend and Serverless API Configuration
3. Administrator Backend and Platform Dashboard Configuration

---

## 1. System Architecture Overview

```
+-----------------------------------------------------------------------------------+
|                                  CLIENT LAYER                                     |
|  Next.js 14 App Router | Tailwind CSS (Day/Night Theme) | Solana/SVM Wallet Adapter |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                             USER BACKEND & API LAYER                              |
|  - Cryptographic Session Auth (ED25519)  - Distributed Nonce/Replay Registry     |
|  - Social Graph & Feed Engine            - 95/5 Economic Invariant Validator      |
|  - Sentinel Privacy Pipeline             - Dynamic Route Resolver (/[handle])     |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                        ADMINISTRATOR & PROTOCOL LAYER                             |
|  - Sentinel Node Coordinator             - Platform Treasury Settlement           |
|  - Protocol Signer (KMS/Vault)           - Anchor SVM Program Upgrade Authority   |
|  - Platform Analytics Engine             - Content Moderation & Abuse Sentinel    |
+-----------------------------------------------------------------------------------+
```

---

## 2. Category 1: User Frontend Configuration

The User Frontend consists of a Next.js 14 React client located under `src/`. It provides user profile customization, media feeds, decentralized store browsing, peer-to-peer commerce, following/follower feeds, and an adaptive goal-setting Day/Night theme.

### 2.1 Frontend Environment Variables

Configure these variables in `.env.local` or your production frontend hosting environment (e.g., Vercel, Cloudflare Pages, AWS Amplify).

| Variable Name | Required | Description | Example / Recommended Value |
|:---|:---:|:---|:---|
| `NEXT_PUBLIC_RPC_ENDPOINT` | Yes | Public Solana / Cookie Chain RPC node URL | `https://api.cookiechain.io` or `https://api.mainnet-beta.solana.com` |
| `NEXT_PUBLIC_CHAIN_ID` | Yes | Cluster network identifier | `cookie-mainnet` or `mainnet-beta` |
| `NEXT_PUBLIC_PROGRAM_ID` | Yes | Base58 Public Key of deployed Anchor program | `Cook1eChainSocialProgram11111111111111111111` |
| `NEXT_PUBLIC_APP_URL` | Yes | Canonical domain URL of the frontend | `https://social.wtf` |
| `NEXT_PUBLIC_IPFS_GATEWAY` | No | Gateway for profile avatar and product media | `https://gateway.pinata.cloud/ipfs/` |

### 2.2 Wallet Connection Setup

The wallet connection interface is governed by `src/components/wallet/WalletProvider.tsx`.
- Supported Wallets: Phantom, Solflare, Backpack, Coinbase Wallet, Torus, Ledger.
- To configure auto-connect behavior and network commitment levels:
  ```typescript
  // src/components/wallet/WalletProvider.tsx
  const network = WalletAdapterNetwork.Mainnet;
  const endpoint = process.env.NEXT_PUBLIC_RPC_ENDPOINT || clusterApiUrl(network);
  ```

### 2.3 Day and Night Theme Customization

The platform features an adaptive Day/Night theme designed for productivity and post-task goal setting.
- **Night Theme Palette**: Deep obsidian slate (`#070b14`, `#0d1527`) paired with calm amber focus accents (`#d97706`) and low-contrast borders.
- **Day Theme Palette**: Linen/paper slate (`#f8fafc`, `#ffffff`) paired with subtle slate borders (`#e2e8f0`) and high-legibility dark slate typography.
- Configuration files:
  - `src/lib/theme/themeContext.tsx`: Theme provider, state persistence in `localStorage`, and system preference listener.
  - `tailwind.config.js`: Theme color tokens (`focus`, `slate`, `night`, `day`).
  - `src/app/globals.css`: CSS variables (`--bg-primary`, `--card-surface`, `--border-subtle`).

### 2.4 Profile and Storefront URL Routing

- Dynamic profile routes are handled under `src/app/[handle]/page.tsx`.
- Vanity handles allow creators to share their profile directly: `https://social.wtf/@creatorname` or `https://social.wtf/creatorname`.
- Social features include:
  - Personalized profile banner and avatar image upload.
  - Creator store catalog with instant purchase capability.
  - Following / Followers modal with real-time status toggles.
  - Follower-filtered feed view.

---

## 3. Category 2: User Backend & Serverless API Configuration

The User Backend manages cryptographic challenge generation, wallet signature validation, session tokens, Sentinel privacy verification, media uploads, and commerce settlement verification.

### 3.1 Backend Environment Variables

Configure these variables in your secure server environment. Never expose these variables with `NEXT_PUBLIC_` prefixes.

| Variable Name | Required | Description | Security Requirement |
|:---|:---:|:---|:---|
| `SESSION_SECRET` | Yes | 256-bit entropy key for signing session JWTs/tokens | Minimum 64 hexadecimal characters. Store in Secret Manager. |
| `REDIS_URL` or `KV_REST_API_URL` | Yes | Redis/Upstash connection string for nonce replay caching | Secure TLS connection with auth token. |
| `REDIS_TOKEN` or `KV_REST_API_TOKEN` | Conditional | Auth token if using Upstash / HTTP Redis | Keep private. |
| `IPFS_API_KEY` / `IPFS_API_SECRET` | Optional | API credentials for decentralized media storage | Pinata or Infura IPFS keys. |
| `DATABASE_URL` | Yes | PostgreSQL / MongoDB connection string | SSL mode required (`sslmode=require`). |

### 3.2 Authentication & Nonce Challenge Lifecycle

Social.wtf uses ED25519 cryptographic challenge-response authentication:
1. **Challenge Request**: The client calls `POST /api/auth/nonce` with their wallet address.
2. **Challenge Issuance**: The server generates a single-use cryptographically random nonce with an expiration TTL (5 minutes) and stores it in the nonce registry.
3. **Signature Verification**: The client signs a standard message payload (`Sign this message to authenticate with Social.wtf: <nonce>`) and submits it to `POST /api/auth/verify`.
4. **Validation & Invalidation**: The server validates the ED25519 signature against the user public key, atomically invalidates the nonce from the registry to prevent replay attacks, and issues an HTTP-only secure session cookie.

### 3.3 95/5 Economic Settlement Invariant

All commerce transactions on Social.wtf enforce an immutable 95/5 revenue split:
- **95% of gross transaction value** transfers directly to the creator wallet.
- **5% of gross transaction value** transfers directly to the platform treasury wallet.
- **Validation Engine**: `src/lib/commerce/feeSplit.ts` and the on-chain Anchor smart contract reject any transaction payload that deviates from this exact split down to the lamport.

### 3.4 Sentinel Privacy and Verification Pipeline

- Located in `src/lib/sentinel/`.
- Validates user content against cryptographic privacy proofs and zero-knowledge verification claims.
- Fail-Closed Policy: Any failed verification or malformed signature returns an explicit 403/401 HTTP response and blocks state progression.

---

## 4. Category 3: Administrator Backend & Platform Dashboard Configuration

The Administrator Backend gives the platform operator sovereign control over platform economics, treasury revenue collection, protocol signing, content moderation, and on-chain program authority.

### 4.1 Administrator Environment Variables

| Variable Name | Required | Description | Security Requirement |
|:---|:---:|:---|:---|
| `PLATFORM_TREASURY_PUBKEY` | Yes | Base58 Public Key of Platform Treasury Wallet | Multi-sig (Squads Protocol) or cold storage public key. |
| `PLATFORM_PRIVATE_KEY` | Conditional | Base58 or JSON array private key for server-signed protocol transactions | Restrict access via AWS KMS, GCP Secret Manager, or HashiCorp Vault. |
| `ADMIN_SECRET_KEY` | Yes | Master secret key for administrative dashboard access | Minimum 64 alphanumeric characters. |
| `COOKIE_CHAIN_PRIVATE_RPC` | Yes | Private high-throughput RPC endpoint for admin ops | Dedicated RPC provider (Helius, QuickNode, Triton). |
| `SENTINEL_OPERATOR_KEY` | Yes | Keypair used by Sentinel automated compliance worker | Distinct dedicated key with bounded operational funds. |

### 4.2 Treasury Management and Multi-Sig Setup

For maximum operational security, the platform buyer must configure `PLATFORM_TREASURY_PUBKEY` to point to a multi-signature vault:
1. Deploy a Multi-Sig instance using **Squads Protocol** on Solana / Cookie Chain.
2. Configure a minimum threshold (e.g., 2-of-3 or 3-of-5 key holders).
3. Set `PLATFORM_TREASURY_PUBKEY=<squads_vault_pda>` in production environment settings.
4. The 5% fee split from every platform transaction will stream automatically into this vault.

### 4.3 Key Rotation Protocol for Platform Signer

If rotating or initializing the `PLATFORM_PRIVATE_KEY`:
1. Generate a new keypair using the Solana CLI:
   ```bash
   solana-keygen new --outfile platform-signer.json --no-bip39-passphrase
   ```
2. Extract the public key:
   ```bash
   solana-keygen pubkey platform-signer.json
   ```
3. Update the production environment variable or Secret Manager record with the new Base58-encoded secret key.
4. Fund the public key with sufficient native network tokens (e.g., COOKIE or SOL) for transaction gas fees.
5. Re-run automated tests to verify signing functionality:
   ```bash
   npm test
   ```

### 4.4 Anchor Smart Contract Upgrade Authority Handover

The on-chain Anchor program handles decentralized tip jars, storefront settlements, and access grants.

To transfer upgrade authority from the seller to the buyer:
1. The current authority executes the transfer command:
   ```bash
   solana program set-upgrade-authority <PROGRAM_ID> --new-upgrade-authority <BUYER_ADMIN_PUBKEY> --keypair <SELLER_KEYPAIR_PATH> --url <RPC_URL>
   ```
2. Verify that the upgrade authority has transferred successfully:
   ```bash
   solana program show <PROGRAM_ID> --url <RPC_URL>
   ```

---

## 5. Deployment & Production Operations Runbook

### 5.1 Dockerized Deployment

The platform includes production Docker configurations for containerized deployment across Kubernetes, AWS ECS, or DigitalOcean App Platform.

```bash
# 1. Build the production container image
docker build -t social-wtf:latest .

# 2. Run the container with environment file
docker run -d \
  --name social-wtf-app \
  -p 3000:3000 \
  --env-file .env.production \
  social-wtf:latest
```

### 5.2 Health Checks & Monitoring

The backend exposes health monitoring endpoints:
- `GET /api/health`: Returns HTTP 200 with component statuses (RPC connectivity, Redis cache latency, Database connectivity).
- `GET /api/sentinel/status`: Returns Sentinel verification pipeline health metrics.

---

## 6. Pre-Launch Security & Verification Checklist

Before opening the platform to live public users:
- [ ] Ensure `.env` and secret files are absent from all git tracking.
- [ ] Run `node scripts/scan-secrets.mjs` to verify zero credential exposure.
- [ ] Run `npm test` to ensure all 9 adversarial security test suites pass (100% pass rate).
- [ ] Verify `PLATFORM_TREASURY_PUBKEY` points to the buyer multi-sig address.
- [ ] Confirm `SESSION_SECRET` has been rotated to a newly generated 64-character high-entropy string.
- [ ] Confirm Anchor program upgrade authority is verified on-chain.
