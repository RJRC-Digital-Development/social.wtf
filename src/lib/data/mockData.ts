import { User, Post, Product, TransactionRecord, TreasuryMetrics } from '@/types';

export const INITIAL_CREATORS: User[] = [];

export const INITIAL_POSTS: Post[] = [
  {
    id: 'post-system-welcome',
    author: {
      id: 'system',
      name: 'Social.wtf System',
      handle: 'system',
      avatar: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=150&auto=format&fit=crop&q=80',
      coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&auto=format&fit=crop&q=80',
      bio: 'Official Social.wtf System Announcements on Cookie Chain SVM.',
      verified: true,
      ageVerified: true,
      isAdmin: false,
      walletAddress: '',
      followersCount: 0,
      followingCount: 0,
      isCreator: false,
    },
    type: 'text',
    content: `Welcome to Social.wtf on Cookie Chain SVM! \n\nEvery profile functions as a modular mini-app with sub-second finality and an automated 5% protocol fee split to the platform treasury. \n\nPublish your first personal post above, tip in COOK, or list digital products in your Storefront to see live on-chain settlement in action!`,
    createdAt: 'Pinned Guide',
    likes: 0,
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
  activeCreatorsCount: 0,
  totalTransactionsCount: 0,
};

