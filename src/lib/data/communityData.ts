import { WikiArticle, DiscussionTopic } from '@/types';

export const INITIAL_WIKI_ARTICLES: WikiArticle[] = [
  {
    id: 'wiki-1',
    slug: 'creator-page-quickstart',
    title: 'Creator Page Quickstart: Building Your Sovereign Profile Mini-App',
    category: 'creator_sdk',
    summary: 'How to build, customize, and monetize your personal creator storefront and interactive code mini-app on Cookie Chain SVM.',
    lastUpdated: 'Updated today',
    author: 'Social.wtf Core Protocol',
    readTime: '4 min read',
    tags: ['CreatorSDK', 'Storefront', 'MiniApps', 'CookieChain'],
    content: `## Overview
Every creator profile on **Social.wtf** is an independent, programmable mini-app powered by Cookie Chain (SVM). Creators have 100% sovereignty over their digital goods, audio tracks, and interactive on-chain mini-games.

### 1. The Clean Creator Page Component
To create your own page, you only need the concise **Creator Page SDK** which connects to your Cookie Chain SVM wallet address:

\`\`\`typescript
import { CreatorPage, Storefront, CustomWidget } from '@social-wtf/creator-sdk';

export default function MyCreatorPage() {
  return (
    <CreatorPage
      handle="your_handle"
      name="Your Creator Brand"
      svmWallet="CookYourWalletAddress111111111111111111111"
      treasuryCutPct={5} // Automated 5% protocol fee
    >
      <Storefront products={myProducts} />
      <CustomWidget type="audio_spotlight" trackUrl="https://.../song.mp3" />
      <CustomWidget type="tip_goal" targetCook={100} />
    </CreatorPage>
  );
}
\`\`\`

### 2. Proprietary Engine Protection
The platform's proprietary multimodal AI vision screening, ephemeral biometric RAM zeroing, and Sentinel AI neural weights operate safely on the platform tier. Creators do not need to manage complicated backend neural scanners or zero-knowledge proof circuits—they simply consume the clean, security-conscious public SDK to design their storefronts!

### 3. Monetization & Proceeds
- **95%** of all post tips and digital goods sales route directly to your connected Nightly SVM wallet.
- **5%** routes automatically to the platform treasury to fund validator grants, sub-second block finality, and open-source tooling.`,
  },
  {
    id: 'wiki-2',
    slug: 'automated-treasury-split-protocol',
    title: 'Automated 5% Treasury Split Protocol Specification',
    category: 'tokenomics',
    summary: 'The technical mechanism behind the atomic 95% creator / 5% treasury split executed on Cookie Chain SVM.',
    lastUpdated: 'Updated today',
    author: 'Social.wtf Core Protocol',
    readTime: '5 min read',
    tags: ['Tokenomics', 'SVM', 'SmartContracts', 'Treasury'],
    content: `## Mathematical Architecture
Traditional creator platforms take 30% to 50% cuts and delay payouts by 30 days. Social.wtf eliminates middlemen by utilizing Cookie Chain's 1-second SVM finality to split proceeds **in the exact same block**:

\`\`\`math
\\text{Total Amount} = \\text{Creator Amount} (95\\%) + \\text{Treasury Amount} (5\\%)
\`\`\`

### SVM Atomic Instruction Structure
Each transaction packages dual SystemProgram transfer instructions:
1. **Instruction 0:** \`transfer(from, creatorWallet, 0.95 * amount)\`
2. **Instruction 1:** \`transfer(from, treasuryWallet, 0.05 * amount)\`
3. **Instruction 2:** \`MemoProgram.memo("social.wtf:tip:{postId}")\`

If either transfer fails, the entire transaction atomically reverts. Funds never touch a centralized escrow account.`,
  },
  {
    id: 'wiki-3',
    slug: 'sentinel-ai-zero-trace-safeguards',
    title: 'Sentinel AI Zero-Trace Shielding & Guardian Device Safeguards',
    category: 'privacy_ai',
    summary: 'Why live video verification is required upon access for adult content, and how ID is kept for account profiles.',
    lastUpdated: 'Updated today',
    author: 'Privacy Sentinel Team',
    readTime: '6 min read',
    tags: ['ZeroTrace', 'Biometrics', 'ParentalGuard', 'Privacy'],
    content: `## The Core Privacy Architecture

### 1. The Zero-Trace Rule
Unlike platforms that tease users with blurred cards or "unlock sensitive content" buttons, Social.wtf enforces **Zero-Trace Shielding**:
- Unverified feeds show **not a single hint** that restricted content exists.
- No blurred placeholders, no locked buttons.
- The "Adult Entertainment (18+)" filter tab is strictly rendered **only** when an active user has completed 18+ age verification.

### 2. Parental & Guardian Device Safeguard
Why is live video verification required *upon access*?
> **The Problem:** If age verification relied merely on a saved browser cookie or uploaded static ID on file, an underage child picking up their parent or guardian's unlocked smartphone or laptop could freely browse mature content.
> **The Solution:** Live video liveness verification checks the *immediate human holding the screen right now*. This guarantees that an underage child is not accessing adult entertainment through a parent's device.

### 3. Adult Entertainment Access & Verification Policy
- **18+ Requirement:** 18 years old and over is strictly required to access Adult Entertainment.
- **Payment Card + Video Check:** Users must provide a valid debit or credit card ($0 authorization age verification check) accompanied by live AI video verification to confirm adulthood.
- **Under-25 Safeguard:** Anyone determined by the AI agent to be under 25 years old is required to produce a valid Driver's License or Government ID card front & back to continue.
- **Zero Shortcuts & 100% AI Privacy:** There is no shortcut: our verification is conducted strictly by autonomous AI agents and will not be reviewed by humans for viewer privacy reasons unless flagged for compliance review.
- Raw video frames and card buffers exist solely in ephemeral client RAM and are purged instantly with a cryptographic wipe receipt.`,
  },
  {
    id: 'wiki-4',
    slug: 'cookie-chain-svm-tooling',
    title: 'Cookie Chain SVM Developer Tooling & Integrations',
    category: 'developers',
    summary: 'Comprehensive guide to RPC nodes, Nightly Wallet, Cookieswap.fun DEX, Hyperlane Bridge, and cookie-mcp.',
    lastUpdated: 'Yesterday',
    author: 'Cookie Chain DevRel',
    readTime: '4 min read',
    tags: ['RPC', 'Nightly', 'Hyperlane', 'Cookieswap', 'DAS'],
    content: `## Developer Quick Reference

### 1. Network RPC & Explorer
- **RPC URL:** \`https://rpc.cookiescan.io\`
- **WebSocket:** \`wss://wss.cookiescan.io\`
- **Block Explorer:** \`https://cookiescan.io\`
- **Genesis Hash:** \`9wDaBRDgArEUpvhHxGguNkwozsZh4UpGZB9o2EoEcBB2\`

### 2. Hyperlane Cross-Chain Bridge
To bridge assets from Ethereum, Solana, or Base into native $COOK:
- Access \`https://hyperlane.cookiescan.io\`
- Connect wallet and bridge USDC or SOL into native $COOK on Cookie Chain with sub-cent gas fees.

### 3. Metaplex DAS API
Query creator digital collectibles, audio NFTs, and VIP passes using the Digital Asset Standard API at \`https://api.cookiescan.io\`.`,
  },
  {
    id: 'wiki-5',
    slug: 'creator-code-studio-guide',
    title: 'Creator Code Studio: Sandboxed HTML/CSS/JS Mini-Apps',
    category: 'creator_sdk',
    summary: 'How to code, test, and publish interactive browser mini-games and Web3 widgets on your personal profile.',
    lastUpdated: '2 days ago',
    author: 'Social.wtf Core Protocol',
    readTime: '5 min read',
    tags: ['CodeStudio', 'SandboxedIframe', 'MiniGames', 'JavaScript'],
    content: `## Sandboxed Execution Environment
Creators can write interactive JavaScript widgets, mini-games, and Web3 tools that run directly on their profile page.

### Security Model
- Code is rendered in a **sandboxed iframe** (\`sandbox="allow-scripts allow-forms"\`).
- \`allow-same-origin\` is disabled, preventing scripts from accessing cookies, wallet session storage, or parent DOM context.
- Scripts can interact with users visually, maintain internal state, and communicate out through postMessage events for tipping or purchasing.`,
  },
];

export const INITIAL_DISCUSSIONS: DiscussionTopic[] = [
  {
    id: 'disc-sponsorship',
    title: 'Platform & Creator Sponsorship Program: Direct Grants, Bounties, and Patron Tiers',
    category: 'sponsorship',
    author: {
      name: 'Social.wtf Protocol',
      handle: 'social_wtf',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      verified: true,
    },
    content: `Welcome to the official Social.wtf Creator Sponsorship & Grants Hub!

Creators can configure a verified Sponsor Link (GitHub Sponsors, Patreon, or custom patron URL) directly on their profile to receive ongoing grants and community sponsorship.

### Key Sponsorship Features:
1. **Direct Profile Sponsor Banner:** Highlight your open-source tools, artworks, or creative roadmap with an embedded Sponsor Link.
2. **On-Chain Grants & Bounties:** Apply for community ecosystem grants funded by the 5% platform treasury reserve.
3. **Transparent 95/5 Split:** On-chain tips and patronage contributions route 95% straight to creator wallets in sub-second blocks.

Share your sponsorship links, ask technical questions, or propose grant initiatives in this thread!`,
    createdAt: 'Pinned Topic',
    upvotes: 0,
    tags: ['Sponsorship', 'Grants', 'Patron', 'Funding', 'CookieChain'],
    repliesCount: 0,
    isPinned: true,
    replies: [],
  },
  {
    id: 'disc-welcome',
    title: 'Welcome to Social.wtf Community Discussions on Cookie Chain SVM',
    category: 'update',
    author: {
      name: 'Social.wtf Protocol',
      handle: 'social_wtf',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      verified: true,
    },
    content: `Welcome to the Social.wtf community forum!

This board is open for discussion of Cookie Chain SVM smart contracts, creator storefronts, feature requests, and developer mini-apps.

Start a new topic using the composer above or reply to any ongoing discussion.`,
    createdAt: 'Pinned Topic',
    upvotes: 0,
    tags: ['Community', 'CookieChain', 'Developers', 'Web3Social'],
    repliesCount: 0,
    isPinned: true,
    replies: [],
  },
];
