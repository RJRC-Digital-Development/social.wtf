# Social.wtf 🍪⚡

**A Unified Decentralized Web3 Social Ecosystem & Creator Storefront Hub on Cookie Chain (SVM)**

Social.wtf is a decentralized Web3 social platform built natively for the **[Cookie Chain](https://www.cookiechain.wtf)**. It consolidates micro-blogging, video streaming, music hubs, and creator storefronts into a unified interface where every profile functions as a customizable mini-app.

Every economic transaction—from store purchases to tips and subscriptions—automatically routes a **5% protocol fee** to the platform treasury to fund ongoing platform innovation and validator grants. Sensitive or explicit content is continuously screened by real-time multimodal AI and completely shielded from unverified feeds with **zero traces or hints**, unlockable exclusively via ephemeral, zero-data age verification.

---

## 🏛️ Core Pillars & Architecture

### 1. Multi-Format Social Stream & Creator Storefronts
- **4 Native Formats**: Text micro-blogging, high-res photography galleries, HTML5 video streaming, and real-time audio playback with waveform visualizers.
- **Modular Creator Profile Mini-Apps**: Personal ecosystems featuring customizable widgets (audio spotlight, crowdfund tip goals, digital product showcases, and verified links).
- **Creator Storefronts**: Direct sale of digital goods (music stems, 3D assets, VIP access passes, Lightroom presets) priced in native `$COOK`.

### 2. Automated 5% Protocol Fee Split on Cookie Chain SVM
- Built directly into atomic Solana Virtual Machine transactions and Rust Anchor contracts.
- Every transaction splits proceeds seamlessly:
  - **95%** routed directly to the creator's wallet.
  - **5%** automatically cut to the Social.wtf Platform Treasury (`CookTreasury11111111111111111111111111111111`).
  - Immutable on-chain memo logging with sub-second block finality.

### 3. Real-Time Multimodal AI Vision Screening & Zero-Trace Invisible Shielding
- Backend multimodal AI analyzer (`/api/shield/scan`) classifies media in real-time.
- **Zero-Trace Shielding**: Unlike traditional platforms that display blurred teasers or locked boxes, Social.wtf completely removes restricted content from public/unverified feeds. There is **zero hint** of its existence to underage or unverified users.

### 4. Privacy-First Ephemeral Age & Identity Verification
- **Ephemeral Government ID OCR**: Scans documents directly in client-side RAM, confirms $Age \ge 18$, logs a cryptographic SHA-256 memory purge receipt, and **immediately zeroes the memory buffer**. No PII is EVER stored or sent to a database.
- **Facial Age Estimation Video Check**: Live WebRTC video selfie with liveness detection (blink/head tilt) and client-side age estimation. Video frames are discarded instantly.

### 5. Nightly Wallet Integration
- First-class support for [Nightly Wallet](https://nightly.app) (`window.nightly.solana`).
- Displays active user address, Cookie Chain network badge, and live `$COOK` balance via RPC polling.
- Includes pre-funded instant demo wallet mode for seamless evaluation.

---

## ⛓️ Cookie Chain Network Specifications

| Parameter | Value |
| :--- | :--- |
| **Network Name** | Cookie Chain |
| **Virtual Machine** | SVM (Solana Virtual Machine, Solana-core 4.1.2) |
| **HTTP RPC Endpoint** | `https://rpc.cookiescan.io` |
| **WebSocket Endpoint** | `https://wss.cookiescan.io` |
| **Genesis Hash** | `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2` |
| **Native Currency** | `$COOK` (9 Decimals) |
| **Block Time** | ~1 second |
| **Block Explorer** | [https://cookiescan.io](https://cookiescan.io) |
| **Bridge** | [https://hyperlane.cookiescan.io](https://hyperlane.cookiescan.io) |
| **Official Docs** | [https://docs.cookiechain.wtf](https://docs.cookiechain.wtf) |
| **Community Telegram** | [https://t.me/TheCookieNetChain](https://t.me/TheCookieNetChain) |

---

## 🛠️ Project Structure

```
social.wtf/
├── contracts/
│   └── social_wtf/
│       ├── Anchor.toml          # Anchor config targeting https://rpc.cookiescan.io
│       ├── Cargo.toml           # Rust dependencies (anchor-lang 0.30)
│       └── src/lib.rs           # SVM Program: automated 5% fee split & purchase receipts
├── src/
│   ├── app/
│   │   ├── api/shield/scan/     # Multimodal AI media screening API endpoint
│   │   ├── globals.css          # Tailwind cyberpunk theme styling
│   │   ├── layout.tsx           # Next.js root layout with providers
│   │   └── page.tsx             # Main ecosystem view (Feed, Store, Creator, Analytics)
│   ├── components/
│   │   ├── analytics/           # Creator financial dashboard & treasury metrics
│   │   ├── feed/                # Multi-format feed, PostCard, AudioPlayer, VideoPlayer
│   │   ├── layout/              # Navbar with slot ticker & wallet connector
│   │   ├── profile/             # Modular creator profile mini-app & widgets
│   │   ├── store/               # Digital storefront, product catalog & checkout
│   │   ├── transactions/        # On-chain transaction status modal & CookieScan links
│   │   ├── verification/        # Privacy-first ephemeral ID OCR & facial selfie gate
│   │   └── wallet/              # Nightly wallet button & adapter modal
│   ├── lib/
│   │   ├── ai/scanner.ts        # Multimodal AI vision screening service
│   │   ├── data/mockData.ts     # Initial seed posts, creators, products & transactions
│   │   ├── shield/shieldContext.tsx # Invisible content shielding context
│   │   ├── solana/cookieChain.ts # Cookie Chain RPC connection & SVM split transactions
│   │   ├── verification/verifier.ts # Ephemeral zero-data age verification engine
│   │   └── wallet/walletContext.tsx # Nightly & Cookie Chain wallet state
│   └── types/index.ts           # Shared TypeScript interfaces
├── next.config.mjs              # Next.js configuration with Web3 polyfills
├── tailwind.config.js           # Tailwind theme extension
└── package.json                 # Project dependencies & scripts
```

---

## 🚀 Quick Start Guide

### Prerequisites
- Node.js >= 18.0.0
- npm >= 9.0.0
- Nightly Wallet extension installed from [nightly.app](https://nightly.app) (optional: built-in demo wallet mode is available)

### Installation
```bash
# Clone the repository
git clone https://github.com/thepros2014/social.wtf.git
cd social.wtf

# Install dependencies
npm install

# Start local development server
npm run dev
```

Visit `http://localhost:3000` in your browser.

---

## 🧪 Testing the 5 Core Phases

### Phase 1: Multi-Format Feed & Storefronts
1. Filter the feed between **All**, **Music Hub**, and **Video Drops**.
2. Play audio streams directly using the embedded HTML5 audio player.
3. Switch to the **Storefronts** tab to view digital products (audio stems, 3D assets).
4. Click **List New Product** to publish a new digital good in `$COOK`.

### Phase 2: AI Shielding & Zero-Data Age Gate
1. When unverified, restricted 18+ posts are completely hidden—with **zero trace** in the feed.
2. Click **Verify Age (Zero-Data)** in the navbar.
3. Choose either **Ephemeral ID OCR** or **Facial Age Check**.
4. Observe the real-time memory buffer purge and generation of the cryptographic SHA-256 wipe receipt.
5. Notice that Unshielded Mode activates, revealing mature creator sets with verified badges.

### Phase 3 & 4: Nightly Wallet & Automated 5% Treasury Split
1. Click **Connect Wallet** in the header. Select **Nightly Wallet** (or 1-Click Demo Wallet).
2. On any post, click **Tip in COOK** and pick an amount (e.g. 2.0 COOK).
3. Confirm the payment breakdown: **95% directly to creator**, **5% automatically to treasury**.
4. Approve the transaction; watch the multi-step lifecycle execute with sub-second finality.
5. Click **View On-Chain on CookieScan** to inspect the confirmation hash.
6. Open the **Treasury & Analytics** tab to see real-time volume, net creator revenue, and total platform fees collected.

### Phase 5: Submission & Community Demo
- Submit live deployment URL.
- Demo video recorded demonstrating Nightly wallet, 5% fee split, and invisible shielding posted to [Cookie Chain Telegram](https://t.me/TheCookieNetChain).

---

## 📄 License
MIT License. Built with 🍪 for the Cookie Chain ecosystem.
