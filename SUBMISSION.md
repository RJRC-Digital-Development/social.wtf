# Cookie Chain cApp Submission: Social.wtf 🍪⚡

**Category:** Social Platform • Creator Tools • Marketplace • AI Application • Developer Tooling  
**Target Chain:** Cookie Chain (SVM - Solana Virtual Machine)  
**Live URL:** [https://social-wtf.vercel.app](https://social-wtf.vercel.app) (or your deployment domain)  
**GitHub Repository:** [https://github.com/thepros2014/social.wtf](https://github.com/thepros2014/social.wtf)  
**Telegram Submission Target:** [https://t.me/TheCookieNetChain](https://t.me/TheCookieNetChain)  

---

## 🎯 Executive Summary & Objective

**Social.wtf** is a unified decentralized Web3 social ecosystem and creator storefront hub built natively on **Cookie Chain**. It consolidates micro-blogging, video streaming, music hubs, and digital storefronts into a single interface where **every profile functions as a customizable mini-app**.

Every economic transaction—from digital good purchases to tips and subscriptions—automatically routes a **5% protocol fee** to the platform treasury to fund ongoing innovation. Sensitive or explicit content is continuously screened by real-time multimodal AI and completely shielded from unverified feeds with **zero traces or hints**, unlockable exclusively via ephemeral, zero-data age verification.

---

## 📋 Comprehensive Requirements Checklist

### 1. Wallet Connection & Status
- [x] **Nightly Wallet Support (`window.nightly.solana`):** Native integration with auto-detection and 1-click connection.
- [x] **Display Connected Wallet Address:** Formatted short address badge with address copying and CookieScan link.
- [x] **Live Cookie Chain Balance Tracking:** Queries `$COOK` balance directly from `https://rpc.cookiescan.io`.
- [x] **Instant Demo Wallet Mode:** Pre-funded simulated dev wallet for instant zero-setup evaluation.

### 2. On-Chain Interactions & Execution
- [x] **Automated 5% Treasury Protocol Fee Split:** Built into atomic SVM transaction builders and Rust Anchor contracts (`contracts/social_wtf/src/lib.rs`). Every transaction splits 95% proceeds to creator and 5% directly to the platform treasury.
- [x] **Real-Time Transaction Status UX:** Multi-step modal feedback (`Preparing` -> `Signing in Nightly` -> `Broadcasting to Cookie Chain (sub-second)` -> `Confirmed`).
- [x] **CookieScan Explorer Links:** Instant clickable transaction links to `https://cookiescan.io/tx/{signature}`.
- [x] **Error Handling:** Robust handling for user rejections, wallet drops, and balance errors.

### 3. Application-Specific Features & Dashboards
- [x] **Multi-Format Feed:** Native renderers for Text micro-blogging, Photos, HTML5 Video, and Audio/Music streams with waveform visualizers.
- [x] **Modular Creator Profile Mini-Apps:** Custom storefronts, audio spotlights, crowdfund tip goal progress bars, and verified links.
- [x] **Creator Code Studio (Programmable Profiles):** In-browser live editor allowing creators to author, preview in a sandboxed iframe, and deploy their own custom code mini-apps (games, animations, widgets)!
- [x] **Creator Analytics Dashboard:** Live tracking of gross platform volume, net creator revenue, treasury collections, and on-chain transaction history.
- [x] **Zero-Trace Invisible Content Shielding:** Flagged mature media is completely omitted from public feeds with zero traces or blurry placeholders.
- [x] **Privacy-First Ephemeral Age Verification:** Client-side Ephemeral Government ID OCR with immediate RAM buffer zeroing and live video selfie age check.

---

## 🍪 Cookie Ecosystem Integrations (Encouraged & Optional)

| Tool / Service | Integration in Social.wtf | Link / Status |
| :--- | :--- | :--- |
| **Cookieswap** | Quick swap simulator & direct liquidity/trading integration for `$COOK` and creator tokens | [cookieswap.fun](https://cookieswap.fun/) ✅ Integrated |
| **Cookiebox** | Ecosystem application launcher and cApp directory indexing | [cookiebox.app](https://cookiebox.app/) ✅ Integrated |
| **Cookie DAS API** | Metaplex Digital Asset Standard client (`src/lib/solana/cookieDas.ts`) querying assets via `https://api.cookiescan.io` | [api.cookiescan.io](https://api.cookiescan.io/) ✅ Integrated |
| **CookieScan** | Direct block explorer verification for all transactions and addresses | [cookiescan.io](https://cookiescan.io/) ✅ Integrated |
| **cookie-mcp** | Tool definitions conforming to `cookie-mcp` (`src/lib/ai/cookieMcp.ts`) for AI agents | [github.com/cookiechain/cookie-mcp](https://github.com/cookiechain/cookie-mcp) ✅ Integrated |
| **Hyperlane Bridge** | Step-by-step bridge guide & direct portal linking Solana to Cookie Chain | [hyperlane.cookiescan.io](https://hyperlane.cookiescan.io/) ✅ Integrated |

---

## 🔑 Relevant Addresses & Technical Specs

- **Anchor Program ID:** `CookSocial111111111111111111111111111111111`
- **Platform Treasury Address:** `CookTreasury11111111111111111111111111111111`
- **RPC Endpoint:** `https://rpc.cookiescan.io`
- **WebSocket Endpoint:** `https://wss.cookiescan.io`
- **Genesis Hash:** `9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2`
- **Solana-Core Version:** `4.1.2` (Feature set: `3345198602`)
- **Native Token:** `$COOK` (9 Decimals)

---

## 🐦 Ready-to-Post X (Twitter) Thread

Copy and paste this exact thread on X to satisfy submission requirements:

### Tweet 1 (Hook & Overview)
```text
1/6 🍪 Introducing Social.wtf — the unified decentralized Web3 social ecosystem & programmable creator storefront hub built natively on @TheCookieChain (SVM)! ⚡

Consolidating text, photos, video streaming, and live music into one interface where every profile is a custom mini-app. 🧵👇
```

### Tweet 2 (Ecosystem & Automated 5% Split)
```text
2/6 💸 Automated Protocol Fee Split:
Every transaction on Social.wtf (tips, digital goods, subscriptions) automatically splits proceeds at the SVM contract level:
• 95% straight to the creator
• 5% to the platform treasury

Sub-second finality with transactions confirmed on @TheCookieChain! 🚀
```

### Tweet 3 (Creator Code Studio)
```text
3/6 💻 Creators Can Create Their Own Code!
Every creator profile is a modular micro-ecosystem. With our Creator Code Studio, creators can write, test, and deploy their own sandboxed HTML/CSS/JS mini-apps, on-chain games (like Cookie Clicker), and custom Web3 widgets directly to their profile! 🎮
```

### Tweet 4 (Privacy AI Shielding)
```text
4/6 🛡️ Zero-Trace Invisible Shielding & Ephemeral Age Gate:
Real-time multimodal AI scans uploads. Sensitive media is completely hidden from unverified feeds—zero traces or blur teasers.

Unlocked via Ephemeral Government ID OCR with immediate RAM purging (Zero PII stored) or video selfie checks! 🔒
```

### Tweet 5 (Bridge Guide & Nightly Wallet)
```text
5/6 🌉 How to Bridge to Cookie Chain:
1. Connect your @Nightly_app wallet
2. Visit https://hyperlane.cookiescan.io
3. Bridge SOL / $COOK from Solana to Cookie Chain in <1 minute!
4. Swap tokens on Cookieswap (https://cookieswap.fun)

Trade, tip, and launch digital storefronts with sub-cent fees! 🍪
```

### Tweet 6 (Links & Submission)
```text
6/6 🔗 Explore Social.wtf:
• Live dApp: https://social-wtf.vercel.app
• GitHub (Open Source): https://github.com/thepros2014/social.wtf
• Explorer: https://cookiescan.io

Baking the future of Web3 social on @TheCookieChain! 🍪🔥
```

---

## 📲 Final Submission Step

Share your X thread link and live app URL directly in the **[Cookie Chain Telegram](https://t.me/TheCookieNetChain)** community:

> *"Hey @TheCookieNetChain community! 🍪 Just launched Social.wtf on Cookie Chain SVM — unified multi-format social feed, creator code studio mini-apps, automated 5% treasury split, and privacy-first AI shielding. Check out our X thread and live cApp: [Your-X-Thread-URL]"*
