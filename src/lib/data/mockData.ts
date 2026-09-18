import { User, Post, Product, TransactionRecord, TreasuryMetrics } from '@/types';

export const INITIAL_CREATORS: User[] = [
  {
    id: 'creator-1',
    handle: 'creator',
    name: 'Cookie Creator',
    avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
    coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
    bio: 'Decentralized social creator on Cookie Chain SVM. Building on-chain culture, digital goods, and community mini-apps.',
    verified: true,
    ageVerified: true,
    walletAddress: 'HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9',
    followersCount: 1,
    followingCount: 1,
    isCreator: true,
    storeSettings: {
      storeName: 'Creator Storefront',
      storeDescription: 'Digital goods, master stems, VIP passes, and presets settled on Cookie Chain.',
      supportCookTreasuryPct: 5,
    },
    widgets: [
      {
        id: 'w-1',
        type: 'custom_links',
        title: 'Official Channels',
        enabled: true,
        data: {
          telegram: 'https://t.me/TheCookieNetChain',
          docs: 'https://docs.cookiechain.wtf',
          explorer: 'https://cookiescan.io',
        },
      },
    ],
  },
];

export const INITIAL_POSTS: Post[] = [
  {
    id: 'post-1',
    author: INITIAL_CREATORS[0],
    type: 'text',
    content: `Welcome to Social.wtf on Cookie Chain SVM! \n\nEvery profile functions as a modular mini-app with sub-second finality and an automated 5% protocol fee split to the treasury (HMny...KQwT9). \n\nPublish your first personal post above, tip in COOK, or list digital products in your Storefront to see live on-chain settlement in action!`,
    createdAt: 'Just now',
    likes: 1,
    tipsCount: 0,
    totalTipsCook: 0,
    reposts: 0,
    commentsCount: 0,
    tags: ['CookieChain', 'Web3Social', 'SVM', 'COOK'],
    isShielded: false,
  },
];

export const INITIAL_PRODUCTS: Product[] = [];

export const INITIAL_TRANSACTIONS: TransactionRecord[] = [];

export const INITIAL_TREASURY_METRICS: TreasuryMetrics = {
  totalPlatformVolumeCook: 0,
  totalTreasuryCollectedCook: 0,
  activeCreatorsCount: 1,
  totalTransactionsCount: 0,
};

