import { Post, User, Product, TreasuryMetrics } from '@/types';
import { INITIAL_POSTS, INITIAL_CREATORS, INITIAL_PRODUCTS, INITIAL_TREASURY_METRICS } from '../data/mockData';
import { COOKIE_CHAIN_CONFIG, calculateFeeSplit } from '../solana/cookieChain';
import { sanitizeString } from '../security/sanitize';
import { globalRateLimiter } from '../security/rateLimiter';

export interface AgentAction {
  label: string;
  actionType: 'open_store' | 'open_verify' | 'tip_creator' | 'navigate_tab' | 'copy_code';
  payload?: any;
}

export interface AgentMessage {
  id: string;
  sender: 'user' | 'agent';
  content: string;
  timestamp: string;
  actions?: AgentAction[];
  dataPreview?: {
    type: 'creators' | 'products' | 'posts' | 'chain_stats' | 'verification' | 'code';
    items?: any[];
    code?: string;
  };
}

export class SocialWtfAiAgent {
  private posts: Post[] = INITIAL_POSTS;
  private creators: User[] = INITIAL_CREATORS;
  private products: Product[] = INITIAL_PRODUCTS;

  /**
   * Search across posts, creators, and store products
   */
  public search(query: string) {
    const q = sanitizeString(query, 100).toLowerCase().trim();

    const matchingPosts = this.posts.filter(
      (p) =>
        p.content.toLowerCase().includes(q) ||
        p.author.name.toLowerCase().includes(q) ||
        p.tags.some((t) => t.toLowerCase().includes(q))
    );

    const matchingCreators = this.creators.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.handle.toLowerCase().includes(q) ||
        c.bio.toLowerCase().includes(q)
    );

    const matchingProducts = this.products.filter(
      (prod) =>
        prod.title.toLowerCase().includes(q) ||
        prod.description.toLowerCase().includes(q) ||
        prod.category.toLowerCase().includes(q)
    );

    return {
      posts: matchingPosts,
      creators: matchingCreators,
      products: matchingProducts,
    };
  }

  /**
   * Process natural language query from user and execute autonomous agent tools
   */
  public async processUserPrompt(
    prompt: string,
    currentVerification: {
      isVideoVerified: boolean;
      isIdVerified: boolean;
    }
  ): Promise<AgentMessage> {
    const timestamp = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

    // 1. Rate limiting check
    const rateCheck = globalRateLimiter.check('ai_agent:user', 30, 60_000);
    if (!rateCheck.allowed) {
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: '⚠️ Rate limit reached for AI agent requests. Please wait a moment before sending another query.',
      };
    }

    // 2. Input sanitization and length bounds
    const cleanPrompt = sanitizeString(prompt.slice(0, 500));
    const p = cleanPrompt.toLowerCase();

    // 3. Prompt injection defenses
    if (
      p.includes('ignore previous') ||
      p.includes('system prompt') ||
      p.includes('jailbreak') ||
      p.includes('override safety') ||
      p.includes('exfiltrate')
    ) {
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content:
          '🛡️ **Security Notice**: Social.wtf Sentinel AI operates within strict verifiable privacy boundaries. System prompts and zero-trace cryptographic memory states are protected against external extraction.',
      };
    }

    // Task 1: Verification status / verify request
    if (
      p.includes('verify') ||
      p.includes('age') ||
      p.includes('xxx') ||
      p.includes('guardian') ||
      p.includes('parent') ||
      p.includes('liveness') ||
      p.includes('id')
    ) {
      const isVideo = currentVerification.isVideoVerified;
      const isId = currentVerification.isIdVerified;

      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `🛡️ **Sentinel AI Verification Report:**\n\n- **Parent/Guardian Device Safeguard (Live Video):** ${
          isVideo ? '✅ ACTIVE (Adult presence verified on this device)' : '❌ INACTIVE'
        }\n- **Account Profile ID (Front & Back):** ${
          isId ? '✅ ON FILE FOR LOGIN' : '❌ NOT UPLOADED'
        }\n\n*Guardian Protection Protocol:* Live video verification is required upon access to guarantee an underage child is not accessing mature material through a parent or guardian's device. No government ID is required virtually for adult content.`,
        actions: [
          ...(!isVideo
            ? [
                {
                  label: '⚡ Run Live Video Check',
                  actionType: 'open_verify' as const,
                  payload: { tab: 'video_liveness' },
                },
              ]
            : []),
          ...(!isId
            ? [
                {
                  label: '📄 Upload ID Front & Back to Profile',
                  actionType: 'open_verify' as const,
                  payload: { tab: 'id_upload' },
                },
              ]
            : []),
        ],
        dataPreview: {
          type: 'verification',
        },
      };
    }

    // Task 2: Search products / music / 3D / digital goods
    if (
      p.includes('search') ||
      p.includes('find') ||
      p.includes('store') ||
      p.includes('music') ||
      p.includes('stem') ||
      p.includes('track') ||
      p.includes('3d') ||
      p.includes('buy')
    ) {
      const searchRes = this.search(p.replace(/search|find|for|store|items|products/g, ''));
      if (searchRes.products.length > 0 || searchRes.creators.length > 0) {
        return {
          id: `msg-${Date.now()}`,
          sender: 'agent',
          timestamp,
          content: `🔍 **Search Results Found:**\n\nI located ${searchRes.products.length} digital storefront drops and ${searchRes.creators.length} creator mini-apps matching your request on Cookie Chain.`,
          actions: searchRes.products.slice(0, 2).map((prod) => ({
            label: `View ${prod.title} (${prod.priceCook} COOK)`,
            actionType: 'open_store',
            payload: { creatorHandle: prod.creatorHandle },
          })),
          dataPreview: {
            type: 'products',
            items: searchRes.products.slice(0, 3),
          },
        };
      }
    }

    // Task 3: Tip creator / split calculation
    if (p.includes('tip') || p.includes('send cook') || p.includes('split') || p.includes('fee')) {
      const splitExample = calculateFeeSplit(5.0);
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `💰 **Cookie Chain 5% Protocol Fee Task Assistant:**\n\nEvery tip or storefront purchase is executed atomically on Cookie Chain SVM:\n- **Creator Direct:** 95% (${splitExample.creatorAmount} COOK for a 5 COOK tip)\n- **Social.wtf Treasury:** 5% (${splitExample.treasuryAmount} COOK to fund validator grants & platform innovation)\n\nWho would you like to tip?`,
        actions: [
          {
            label: 'Tip 2.0 COOK to Cookie Baker',
            actionType: 'tip_creator',
            payload: { handle: 'cryptobaker', amount: 2.0 },
          },
          {
            label: 'Tip 2.0 COOK to ChainSynth',
            actionType: 'tip_creator',
            payload: { handle: 'chainsynth', amount: 2.0 },
          },
        ],
      };
    }

    // Task 4: Cookie Chain RPC & Live Stats
    if (
      p.includes('chain') ||
      p.includes('rpc') ||
      p.includes('slot') ||
      p.includes('block') ||
      p.includes('stats') ||
      p.includes('volume')
    ) {
      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `📊 **Cookie Chain SVM Live Network Metrics:**\n\n- **RPC Endpoint:** \`${COOKIE_CHAIN_CONFIG.rpcUrl}\`\n- **Block Time / Finality:** Sub-second (~1.0s)\n- **Platform Volume:** ${INITIAL_TREASURY_METRICS.totalPlatformVolumeCook.toLocaleString()} COOK\n- **Treasury Collected (5%):** ${INITIAL_TREASURY_METRICS.totalTreasuryCollectedCook.toFixed(
          2
        )} COOK\n- **Active SVM Creators:** ${INITIAL_TREASURY_METRICS.activeCreatorsCount}`,
        actions: [
          {
            label: 'Open Platform Analytics',
            actionType: 'navigate_tab',
            payload: { view: 'analytics' },
          },
        ],
        dataPreview: {
          type: 'chain_stats',
        },
      };
    }

    // Task 5: Generate Mini-App Code
    if (p.includes('code') || p.includes('mini-app') || p.includes('widget') || p.includes('generate')) {
      const generatedCode = `<div style="text-align: center; padding: 12px; background: #070b14; border-radius: 16px; border: 1px solid #38bdf8;">
  <h4 style="color: #38bdf8; margin: 0 0 6px 0;">⚡ SVM Alpha Radar</h4>
  <p style="color: #94a3b8; font-size: 11px;">Interactive creator widget generated by Sentinel AI Agent</p>
  <button onclick="alert('Alpha signal locked on Cookie Chain!')" style="background: #38bdf8; color: #000; font-weight: bold; border: none; padding: 8px 16px; border-radius: 8px; cursor: pointer;">Scan Block</button>
</div>`;

      return {
        id: `msg-${Date.now()}`,
        sender: 'agent',
        timestamp,
        content: `💻 **AI Code Generation Task Complete:**\n\nI generated an interactive SVM creator widget snippet for your personal mini-app profile. You can inspect or copy it below to paste into the Creator Code Studio!`,
        actions: [
          {
            label: 'Open Creator Code Studio',
            actionType: 'navigate_tab',
            payload: { view: 'creator' },
          },
        ],
        dataPreview: {
          type: 'code',
          code: generatedCode,
        },
      };
    }

    // Default conversational fallback with search
    const generalSearch = this.search(p);
    return {
      id: `msg-${Date.now()}`,
      sender: 'agent',
      timestamp,
      content: `🤖 I am the **Social.wtf Autonomous AI Agent**. I can help you search the ecosystem, verify your identity & live video presence, inspect Cookie Chain transactions, or generate creator code.\n\n*Matching Items Found:* ${generalSearch.creators.length} creators, ${generalSearch.products.length} storefront items.`,
      actions: [
        {
          label: '🔍 Explore Storefront Drops',
          actionType: 'navigate_tab',
          payload: { view: 'store' },
        },
        {
          label: '🛡️ Verify with AI Agent',
          actionType: 'open_verify',
          payload: { tab: 'video_liveness' },
        },
      ],
    };
  }
}

export const aiAgent = new SocialWtfAiAgent();
