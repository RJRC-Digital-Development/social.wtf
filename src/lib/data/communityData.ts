import { WikiArticle, DiscussionTopic } from '@/types';

export const INITIAL_WIKI_ARTICLES: WikiArticle[] = [
  {
    id: 'wiki-1',
    slug: 'creator-page-quickstart',
    title: 'Creator Page Quickstart: Building Your Sovereign Profile Mini-App',
    category: 'creator_sdk',
    summary: 'How to build, customize, and monetize your personal creator storefront and interactive code mini-app on Cookie Chain SVM.',
    lastUpdated: 'Updated today',
    author: 'The Cookie Baker 🍪',
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
- The "XXX Unshielded" filter tab is strictly rendered **only** when an active user has completed live video verification.

### 2. Parental & Guardian Device Safeguard
Why is live video verification required *upon access*?
> **The Problem:** If age verification relied merely on a saved browser cookie or uploaded static ID on file, an underage child picking up their parent or guardian's unlocked smartphone or laptop could freely browse mature content.
> **The Solution:** Live video liveness verification checks the *immediate human holding the screen right now*. This guarantees that an underage child is not accessing adult content through a parent's device.

### 3. Separation of Concerns (Zero ID Required Virtually for XXX)
- **Government ID (Front & Back):** Uploaded into the user's **account profile** strictly for identity trust and login authentication.
- **XXX Access:** Can **only** be accessed via live video verification. No government ID is required virtually to view adult content, ensuring 100% viewer privacy and anonymity.
- Raw video frames and OCR buffers exist solely in client RAM and are purged instantly with a SHA-256 wipe receipt.`,
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
    author: 'ChainSynth 🎛️',
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
    id: 'disc-1',
    title: '💡 Wishlist: On-Chain Tip Jar Leaderboard & Dynamic Tiered NFT Badges',
    category: 'wishlist',
    author: {
      name: 'The Cookie Baker 🍪',
      handle: 'cryptobaker',
      avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
      verified: true,
    },
    content: `It would be incredible if creator storefronts could display a live top 10 tippers leaderboard! 

Whenever a fan tips above 20 $COOK, the protocol could automatically mint an on-chain Cookie Chain SVM Supporter Badge that renders directly on their avatar in comments.

The 5% platform fee split would still apply to all tier upgrades! What does everyone think?`,
    createdAt: '2 hours ago',
    upvotes: 48,
    tags: ['Wishlist', 'Leaderboard', 'Tipping', 'Badges'],
    repliesCount: 3,
    isPinned: true,
    replies: [
      {
        id: 'rep-1',
        author: {
          name: 'ChainSynth',
          handle: 'chainsynth',
          avatar: 'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=150&auto=format&fit=crop&q=80',
          badge: 'Verified Creator',
        },
        content: '100% support this. Fans love gamified flex badges, and because Cookie Chain transaction fees are fractions of a cent, minting badges on-the-fly is practically free!',
        createdAt: '1 hour ago',
        likes: 14,
      },
      {
        id: 'rep-2',
        author: {
          name: 'CookieDegen',
          handle: 'cookiedegen',
          avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80',
        },
        content: 'Would love to see this connected to the Sentinel AI agent so we can ask the agent "Who is my top supporter this week?"',
        createdAt: '35 mins ago',
        likes: 9,
      },
    ],
  },
  {
    id: 'disc-2',
    title: '🚀 Platform Update: Social.wtf v1.2 with Sentinel AI Zero-Trace Shielding',
    category: 'update',
    author: {
      name: 'Social.wtf Core Team',
      handle: 'social_wtf',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      verified: true,
    },
    content: `We have officially deployed **Social.wtf v1.2** with massive privacy & safety enhancements:

1. **Zero-Trace Content Gating:** No blurred placeholders, no teaser banners in public feeds.
2. **Parent & Guardian Device Safeguards:** Live video verification is required upon access for adult/XXX content to ensure children on a parent's device cannot view restricted feeds.
3. **No ID Virtually Required for XXX:** Government ID is only uploaded for account profiles/login; viewers enjoy 100% private biometric liveness verification for adult material.
4. **Autonomous Sentinel AI Agent:** Real-time multimodal evaluation and conversational task fulfillment.`,
    createdAt: '4 hours ago',
    upvotes: 92,
    tags: ['Changelog', 'Security', 'ZeroTrace', 'SentinelAI'],
    repliesCount: 5,
    isPinned: true,
    replies: [
      {
        id: 'rep-3',
        author: {
          name: 'Aria Vixen ✨',
          handle: 'sol_vixen',
          avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&auto=format&fit=crop&q=80',
          badge: 'Verified Creator',
        },
        content: 'This is the exact privacy standard the adult creator industry has been dreaming of. Zero PII leaks, zero government ID required to view, and bulletproof parental device protection!',
        createdAt: '3 hours ago',
        likes: 31,
      },
    ],
  },
  {
    id: 'disc-3',
    title: '📰 Ecosystem News: Cookie Chain Mainnet Sub-Second Latency Benchmarks',
    category: 'news',
    author: {
      name: 'CookieScan Explorer',
      handle: 'cookiescan',
      avatar: 'https://images.unsplash.com/photo-1550745165-9bc0b252726f?w=150&auto=format&fit=crop&q=80',
      verified: true,
    },
    content: `Recent benchmark results on \`https://rpc.cookiescan.io\` indicate consistent sub-400ms block confirmation times across global validator clusters!

With sub-cent transaction costs and instant finality, Social.wtf transactions feel indistinguishable from Web2 micro-blogging while retaining full Web3 custody and automated treasury splitting.`,
    createdAt: '1 day ago',
    upvotes: 64,
    tags: ['News', 'CookieChain', 'Latency', 'Benchmarks'],
    repliesCount: 2,
    replies: [],
  },
  {
    id: 'disc-4',
    title: '💡 Idea: 3D WebGL Virtual Showrooms for Creator Storefronts',
    category: 'wishlist',
    author: {
      name: 'CyberArtist_99',
      handle: 'cyberartist',
      avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&auto=format&fit=crop&q=80',
      verified: false,
    },
    content: `Since the Creator Code Studio already supports interactive HTML/JS canvas sandboxes, what if we created an open-source Three.js 3D room template where creators can display their 3D models on virtual pedestals? 

Visitors could walk around in 3D, inspect digital goods, and click an item to buy in $COOK!`,
    createdAt: '2 days ago',
    upvotes: 37,
    tags: ['WebGL', 'ThreeJS', '3DStore', 'VR'],
    repliesCount: 4,
    replies: [],
  },
  {
    id: 'disc-5',
    title: '🛠️ Dev Help: How to handle 5% Fee Splitting in Custom Code Studio Mini-Apps',
    category: 'dev_support',
    author: {
      name: 'SolanaDev_Alex',
      handle: 'solalex',
      avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&auto=format&fit=crop&q=80',
      verified: false,
    },
    content: `Hey builders! If you are coding a custom mini-game in the Creator Code Studio, how do you trigger the 5% platform fee split when a player purchases an in-game item or power-up?

Check the Wiki article on Automated Treasury Splits—you can emit a \`window.parent.postMessage({ type: 'EXECUTE_TIP_OR_BUY', amount: 5.0 })\` which triggers the host Nightly wallet transaction!`,
    createdAt: '3 days ago',
    upvotes: 29,
    tags: ['DevSupport', 'Tutorial', 'CodeStudio', 'FeeSplit'],
    repliesCount: 1,
    replies: [],
  },
];
