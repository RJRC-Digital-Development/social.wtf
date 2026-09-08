export type MediaType = 'text' | 'photo' | 'video' | 'audio';

export type ShieldClassification = 'safe' | 'nsfw' | 'violence' | 'age_restricted';

export interface User {
  id: string;
  handle: string;
  name: string;
  avatar: string;
  bio: string;
  verified: boolean;
  ageVerified: boolean;
  walletAddress: string;
  coverImage?: string;
  followersCount: number;
  followingCount: number;
  isCreator: boolean;
  storeSettings?: CreatorStoreSettings;
  widgets?: CreatorWidget[];
}

export interface CreatorStoreSettings {
  storeName: string;
  storeDescription: string;
  customBannerUrl?: string;
  supportCookTreasuryPct: number; // default 5%
  featuredProductId?: string;
}

export interface CreatorWidget {
  id: string;
  type: 'audio_spotlight' | 'tip_jar_goal' | 'product_showcase' | 'custom_links';
  title: string;
  enabled: boolean;
  data: Record<string, any>;
}

export interface MediaMetadata {
  title?: string;
  artist?: string;
  duration?: string | number;
  thumbnailUrl?: string;
  dimensions?: { width: number; height: number };
  audioWaveform?: number[];
  videoThumbnail?: string;
}

export interface Comment {
  id: string;
  author: {
    handle: string;
    name: string;
    avatar: string;
  };
  content: string;
  createdAt: string;
  likes: number;
}

export interface Post {
  id: string;
  author: User;
  type: MediaType;
  content: string;
  mediaUrl?: string;
  mediaMetadata?: MediaMetadata;
  createdAt: string;
  likes: number;
  tipsCount: number;
  totalTipsCook: number;
  reposts: number;
  commentsCount: number;
  comments?: Comment[];
  tags: string[];
  isShielded: boolean;
  shieldCategory?: ShieldClassification;
  shieldConfidence?: number;
  shieldReason?: string;
}

export interface Product {
  id: string;
  creatorId: string;
  creatorHandle: string;
  creatorName: string;
  creatorWallet: string;
  title: string;
  description: string;
  priceCook: number;
  category: 'music_stem' | 'digital_art' | 'vip_pass' | 'preset' | 'e_goods';
  previewUrl: string;
  downloadUrl?: string;
  salesCount: number;
  fileSize?: string;
  fileFormat?: string;
  featured?: boolean;
}

export interface TransactionRecord {
  id: string;
  signature: string;
  fromAddress: string;
  toAddress: string;
  treasuryAddress: string;
  totalAmountCook: number;
  creatorAmountCook: number;
  treasuryAmountCook: number;
  actionType: 'tip' | 'store_purchase' | 'subscription';
  itemTitle?: string;
  timestamp: string;
  status: 'pending' | 'confirmed' | 'failed';
  errorMessage?: string;
}

export interface EphemeralVerificationState {
  isVerified: boolean;
  verifiedAt?: string;
  expiresAt?: string;
  method?: 'ephemeral_id_ocr' | 'facial_age_estimation';
  estimatedAge?: number;
  purgedHash?: string;
}

export interface TreasuryMetrics {
  totalPlatformVolumeCook: number;
  totalTreasuryCollectedCook: number;
  activeCreatorsCount: number;
  totalTransactionsCount: number;
}
