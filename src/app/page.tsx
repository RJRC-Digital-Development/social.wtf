'use client';

import React, { useState, useEffect } from 'react';
import { Navbar, MobileBottomNav } from '@/components/layout/Navbar';
import { Feed } from '@/components/feed/Feed';
import { Storefront } from '@/components/store/Storefront';
import { CreatorProfile } from '@/components/profile/CreatorProfile';
import { CreatorDashboard } from '@/components/analytics/CreatorDashboard';
import { AgeVerificationModal } from '@/components/verification/AgeVerificationModal';
import { EcosystemHubModal } from '@/components/ecosystem/EcosystemHubModal';
import { AiAgentModal } from '@/components/ai/AiAgentModal';
import { CommunityHub } from '@/components/community/CommunityHub';
import {
  INITIAL_POSTS,
  INITIAL_PRODUCTS,
  INITIAL_CREATORS,
  INITIAL_TRANSACTIONS,
  INITIAL_TREASURY_METRICS,
} from '@/lib/data/mockData';
import { Post, Product, User, TransactionRecord, TreasuryMetrics } from '@/types';
import { calculateFeeSplit, COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import { useShield } from '@/lib/shield/shieldContext';
import { useWallet } from '@/lib/wallet/walletContext';
import {
  Sparkles,
  ShieldCheck,
  ShoppingBag,
  Coins,
  TrendingUp,
  ExternalLink,
  MessageSquare,
  Globe,
  HelpCircle,
  Lock,
  Bot,
  UserCheck,
  Camera,
  BookOpen,
  User as UserIcon,
  Edit3,
  Link as LinkIcon,
  Copy,
  Check,
} from 'lucide-react';

const DEFAULT_USER_PROFILE: User = {
  id: 'guest-profile',
  handle: 'you',
  name: 'Cookie Creator',
  avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=400&h=400&fit=crop',
  bio: 'Socializing, creating, and trading natively on Cookie Chain SVM. Connect wallet to activate your personal profile space.',
  verified: false,
  ageVerified: false,
  walletAddress: '',
  coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop',
  followersCount: 0,
  followingCount: 0,
  isCreator: true,
  isAdmin: false,
};

function buildDefaultProfileForWallet(address: string): User {
  const isOwner = address === COOKIE_CHAIN_CONFIG.treasuryPublicKey;
  if (isOwner) {
    return {
      ...INITIAL_CREATORS[0],
      walletAddress: address,
      isAdmin: true,
    };
  }
  const shortAddr = `${address.slice(0, 4)}...${address.slice(-4)}`;
  const cleanHandle = `user_${address.slice(0, 4).toLowerCase()}${address.slice(-4).toLowerCase()}`;
  return {
    id: `user-${address}`,
    handle: cleanHandle,
    name: `@${shortAddr}`,
    avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${address}`,
    bio: `Cookie Chain creator and community member (${shortAddr}).`,
    verified: false,
    ageVerified: false,
    walletAddress: address,
    coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop',
    followersCount: 0,
    followingCount: 0,
    isCreator: true,
    isAdmin: false,
    storeSettings: {
      storeName: `${shortAddr}'s Storefront`,
      storeDescription: 'Digital products, presets, and community assets on Cookie Chain SVM.',
      supportCookTreasuryPct: 5,
    },
  };
}

export default function Home() {
  const [activeView, setActiveView] = useState<'feed' | 'store' | 'creator' | 'community' | 'analytics'>(
    'feed'
  );
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [creators, setCreators] = useState<User[]>(INITIAL_CREATORS);
  const [userProfile, setUserProfile] = useState<User>(DEFAULT_USER_PROFILE);
  const [selectedCreator, setSelectedCreator] = useState<User>(INITIAL_CREATORS[0]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>(INITIAL_TRANSACTIONS);
  const [followingHandles, setFollowingHandles] = useState<string[]>(['owner']);
  const [metrics, setMetrics] = useState<TreasuryMetrics>(INITIAL_TREASURY_METRICS);
  const [copiedPersonalUrl, setCopiedPersonalUrl] = useState(false);

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyTab, setVerifyTab] = useState<'card_auth' | 'video_liveness' | 'id_upload'>('card_auth');
  const [aiAgentOpen, setAiAgentOpen] = useState(false);
  const [ecosystemModalOpen, setEcosystemModalOpen] = useState(false);
  const [ecosystemTab, setEcosystemTab] = useState<'bridge' | 'cookieswap' | 'cookiebox' | 'das' | 'mcp'>('bridge');
  const { isAgeVerified, isVideoVerified, isIdVerified, isCardVerified, isAdultContentUnlocked, canAccessAdultContent, unshieldedMode } = useShield();
  const { connected, walletAddress } = useWallet();

  // Load saved profile & handle deep linking from URL
  useEffect(() => {
    let activeUser = DEFAULT_USER_PROFILE;
    try {
      const saved = localStorage.getItem('social_wtf_user_profile');
      if (saved) {
        activeUser = JSON.parse(saved);
        setUserProfile(activeUser);
      }
      const savedFollowing = localStorage.getItem('social_wtf_following_handles');
      if (savedFollowing) {
        setFollowingHandles(JSON.parse(savedFollowing));
      }
    } catch (e) {
      console.error('Failed to parse saved user profile', e);
    }

    // Handle deep-linking URL parameters (?u=..., ?user=..., ?creator=..., ?wallet=...)
    if (typeof window !== 'undefined') {
      const searchParams = new URLSearchParams(window.location.search);
      const targetParam =
        searchParams.get('u') ||
        searchParams.get('user') ||
        searchParams.get('creator') ||
        searchParams.get('profile') ||
        searchParams.get('wallet');

      if (targetParam) {
        const cleanParam = targetParam.trim().replace(/^@+/, '').toLowerCase();
        
        // Match in existing creators or userProfile
        let found = INITIAL_CREATORS.find(
          (c) => c.handle.toLowerCase() === cleanParam || c.walletAddress.toLowerCase() === cleanParam
        );

        if (!found && activeUser.handle.toLowerCase() === cleanParam) {
          found = activeUser;
        }

        // If not found in default list, hydrate dynamically from the shared URL
        if (!found) {
          found = {
            id: `creator-${cleanParam}`,
            handle: cleanParam,
            name: `@${cleanParam}`,
            avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${cleanParam}`,
            bio: `Cookie Chain Creator and Community Member (@${cleanParam}).`,
            verified: false,
            ageVerified: false,
            walletAddress: '',
            coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop',
            followersCount: 0,
            followingCount: 0,
            isCreator: true,
          };
          setCreators((prev) => [found!, ...prev.filter((c) => c.handle !== cleanParam)]);
        }

        setSelectedCreator(found);
        setActiveView('creator');
      }
    }
  }, []);

  // Sync wallet address with dedicated user profile space when connected
  useEffect(() => {
    if (connected && walletAddress) {
      const isOwner = walletAddress === COOKIE_CHAIN_CONFIG.treasuryPublicKey;
      let profileToSet: User;
      try {
        const saved = localStorage.getItem(`social_wtf_profile_${walletAddress}`);
        if (saved) {
          profileToSet = JSON.parse(saved);
          profileToSet.walletAddress = walletAddress;
          profileToSet.isAdmin = isOwner;
        } else {
          profileToSet = buildDefaultProfileForWallet(walletAddress);
          localStorage.setItem(`social_wtf_profile_${walletAddress}`, JSON.stringify(profileToSet));
        }
      } catch (e) {
        profileToSet = buildDefaultProfileForWallet(walletAddress);
      }
      setUserProfile(profileToSet);
    }
  }, [connected, walletAddress]);

  const handlePostCreated = (newPost: Post) => {
    setPosts([newPost, ...posts]);
  };

  const handlePostUpdated = (updatedPost: Post, meta?: { tipAmount?: number; signature?: string }) => {
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));

    const tipAmount = meta?.tipAmount ?? 2.0;
    const split = calculateFeeSplit(tipAmount, 500); // 5% protocol fee
    const newTx: TransactionRecord = {
      id: `tx-${Date.now()}`,
      signature: meta?.signature || `5${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      fromAddress: walletAddress || 'CookYourWallet11111111111111111111111111',
      toAddress: updatedPost.author.walletAddress,
      treasuryAddress: 'HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9',
      totalAmountCook: tipAmount,
      creatorAmountCook: split.creatorAmount,
      treasuryAmountCook: split.treasuryAmount,
      actionType: 'tip',
      itemTitle: `Tip on ${updatedPost.author.name}'s Post`,
      timestamp: 'Just now',
      status: 'confirmed',
    };

    setTransactions((prev) => [newTx, ...prev]);
    setMetrics((prev) => ({
      ...prev,
      totalPlatformVolumeCook: prev.totalPlatformVolumeCook + tipAmount,
      totalTreasuryCollectedCook: prev.totalTreasuryCollectedCook + split.treasuryAmount,
      totalTransactionsCount: prev.totalTransactionsCount + 1,
    }));
  };

  const handleProductPurchased = (product: Product, txSig: string) => {
    const split = calculateFeeSplit(product.priceCook, 500);
    const newTx: TransactionRecord = {
      id: `tx-prod-${Date.now()}`,
      signature: txSig,
      fromAddress: walletAddress || 'CookYourWallet11111111111111111111111111',
      toAddress: product.creatorWallet || 'CookCreator11111111111111111111111111',
      treasuryAddress: 'HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9',
      totalAmountCook: product.priceCook,
      creatorAmountCook: split.creatorAmount,
      treasuryAmountCook: split.treasuryAmount,
      actionType: 'store_purchase',
      itemTitle: product.title,
      timestamp: 'Just now',
      status: 'confirmed',
    };

    setTransactions((prev) => [newTx, ...prev]);
    setMetrics((prev) => ({
      ...prev,
      totalPlatformVolumeCook: prev.totalPlatformVolumeCook + product.priceCook,
      totalTreasuryCollectedCook: prev.totalTreasuryCollectedCook + split.treasuryAmount,
      totalTransactionsCount: prev.totalTransactionsCount + 1,
    }));
  };

  const handleTransactionRecorded = (newTx: TransactionRecord) => {
    setTransactions((prev) => [newTx, ...prev]);
    setMetrics((prev) => ({
      ...prev,
      totalPlatformVolumeCook: prev.totalPlatformVolumeCook + newTx.totalAmountCook,
      totalTreasuryCollectedCook: prev.totalTreasuryCollectedCook + newTx.treasuryAmountCook,
      totalTransactionsCount: prev.totalTransactionsCount + 1,
    }));
  };

  const handleAddProduct = (newProd: Product) => {
    setProducts([newProd, ...products]);
  };

  const handleOpenStore = (creatorHandle: string) => {
    const clean = creatorHandle.toLowerCase().replace(/^@+/, '');
    const found = creators.find((c) => c.handle.toLowerCase() === clean);
    if (found) {
      setSelectedCreator(found);
      setActiveView('creator');
      if (typeof window !== 'undefined' && window.history) {
        window.history.replaceState(null, '', `/?u=${clean}`);
      }
    }
  };

  const handleOpenMyPage = () => {
    setSelectedCreator(userProfile);
    setActiveView('creator');
    if (typeof window !== 'undefined' && window.history) {
      window.history.replaceState(null, '', `/?u=${userProfile.handle}`);
    }
  };

  const handleToggleFollow = (targetHandle: string) => {
    const clean = targetHandle.toLowerCase().replace(/^@+/, '');
    setFollowingHandles((prev) => {
      const next = prev.includes(clean) ? prev.filter((h) => h !== clean) : [...prev, clean];
      try {
        localStorage.setItem('social_wtf_following_handles', JSON.stringify(next));
      } catch (e) {}
      return next;
    });
  };

  const handleUpdateCreator = (updated: User) => {
    setSelectedCreator(updated);
    setCreators((prev) => {
      const idx = prev.findIndex((c) => c.handle === updated.handle || c.id === updated.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = updated;
        return next;
      }
      return [updated, ...prev];
    });

    // If this updated user corresponds to the user's profile, save it
    if (
      updated.handle === userProfile.handle ||
      updated.id === userProfile.id ||
      (updated.walletAddress && updated.walletAddress === userProfile.walletAddress)
    ) {
      setUserProfile(updated);
      try {
        localStorage.setItem('social_wtf_user_profile', JSON.stringify(updated));
        if (updated.walletAddress) {
          localStorage.setItem(`social_wtf_profile_${updated.walletAddress}`, JSON.stringify(updated));
        }
      } catch (e) {}
    }
  };

  const myPersonalLink = typeof window !== 'undefined'
    ? `${window.location.origin}/?u=${userProfile.handle}`
    : `https://socialwtf.vercel.app/?u=${userProfile.handle}`;

  const handleCopyMyPersonalUrl = async () => {
    try {
      await navigator.clipboard.writeText(myPersonalLink);
      setCopiedPersonalUrl(true);
      setTimeout(() => setCopiedPersonalUrl(false), 2500);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 dark:bg-[#070b14] text-slate-900 dark:text-slate-100 transition-colors duration-200">
      {/* Top Navbar */}
      <Navbar
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenVerifyModal={(tab) => {
          setVerifyTab(tab || 'video_liveness');
          setVerifyModalOpen(true);
        }}
        onOpenEcosystemModal={(tab) => {
          setEcosystemTab(tab || 'bridge');
          setEcosystemModalOpen(true);
        }}
        onOpenAiAgent={() => setAiAgentOpen(true)}
        userProfile={userProfile}
        onOpenMyPage={handleOpenMyPage}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-3 sm:px-6 lg:px-8 py-4 sm:py-6 pb-24 md:pb-8">
        {/* Top Highlight Banner */}
        <div className="mb-5 sm:mb-6 p-3.5 sm:p-4 md:p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-white to-blue-500/10 dark:from-amber-500/10 dark:via-[#0d1527] dark:to-blue-500/10 border border-slate-200 dark:border-slate-700/80 shadow-sm dark:shadow-2xl flex flex-col md:flex-row items-start md:items-center justify-between gap-3 sm:gap-4 transition-colors">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-600 dark:text-amber-400 shrink-0">
              <Sparkles className="w-5 h-5 sm:w-6 sm:h-6" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2 flex-wrap">
                <span>Social.wtf — Decentralized Social &amp; Creator Storefronts</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Connect your Nightly wallet to publish posts, customize your storefront, and share your personal profile URL.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap shrink-0 w-full md:w-auto justify-start md:justify-end">
            <button
              onClick={handleOpenMyPage}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md shadow-amber-500/20"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>Customize My Page</span>
            </button>

            <button
              onClick={() => setAiAgentOpen(true)}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-amber-50 dark:bg-gradient-to-r dark:from-amber-500/20 dark:to-yellow-500/20 hover:bg-amber-100 dark:hover:from-amber-500/30 dark:hover:to-yellow-500/30 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 text-xs font-semibold transition-all shadow-sm"
            >
              <Bot className="w-4 h-4 text-amber-600 dark:text-amber-400" />
              <span>AI Assistant</span>
            </button>

            {!isAdultContentUnlocked ? (
              <button
                onClick={() => {
                  setVerifyTab('card_auth');
                  setVerifyModalOpen(true);
                }}
                className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 border border-emerald-300 dark:border-emerald-500/40 text-emerald-800 dark:text-emerald-300 text-xs font-semibold transition-all shadow-sm"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>Verify 18+</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-purple-500/10 border border-purple-500/30 text-purple-700 dark:text-purple-300 text-xs font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-purple-600 dark:text-purple-400" />
                <span>18+ Verified</span>
              </span>
            )}
          </div>
        </div>

        {/* 3-Column Responsive Layout: Left Nav (Desktop/Tablet) / Center Content (All) / Right Stats (Desktop) */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6">
          {/* Left Sidebar: Navigation & Quick Shortcuts (Tablet & Desktop) */}
          <aside className="hidden md:block md:col-span-4 lg:col-span-3 space-y-5">
            {/* My Personal Profile Quick Card */}
            <div className="p-4 rounded-3xl bg-white dark:bg-[#0d1527] border border-amber-500/30 shadow-sm dark:shadow-xl space-y-3 transition-colors">
              <div className="flex items-center gap-3">
                <img
                  src={userProfile.avatar}
                  alt={userProfile.name}
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-500 dark:border-amber-400 shrink-0"
                />
                <div className="overflow-hidden">
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{userProfile.name}</div>
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">@{userProfile.handle}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">{userProfile.walletAddress.slice(0, 4)}...{userProfile.walletAddress.slice(-4)}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2">
                <button
                  onClick={handleOpenMyPage}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Customize My Personal Page</span>
                </button>

                <button
                  onClick={handleCopyMyPersonalUrl}
                  className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-xs font-semibold transition-all"
                >
                  {copiedPersonalUrl ? (
                    <>
                      <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
                      <span className="text-emerald-700 dark:text-emerald-300">Copied Personal Link!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                      <span>Copy Personal URL</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Quick Navigation Box */}
            <div className="p-4 rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/70 shadow-sm dark:shadow-xl space-y-1 text-xs font-medium transition-colors">
              <button
                onClick={() => setActiveView('feed')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'feed'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Social Feed</span>
              </button>

              <button
                onClick={() => setActiveView('store')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'store'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Storefronts</span>
              </button>

              <button
                onClick={handleOpenMyPage}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'creator'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>Creator Profiles</span>
              </button>

              <button
                onClick={() => setActiveView('community')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'community'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <BookOpen className="w-4 h-4" />
                <span>Community &amp; Wiki</span>
              </button>

              <button
                onClick={() => setActiveView('analytics')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'analytics'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Platform Activity</span>
              </button>

              <button
                onClick={() => setAiAgentOpen(true)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-2xl bg-amber-50/80 dark:bg-gradient-to-r dark:from-amber-500/15 dark:to-yellow-500/15 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 hover:brightness-105 dark:hover:brightness-125 transition-all font-semibold"
              >
                <div className="flex items-center gap-2.5">
                  <Bot className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                  <span>AI Creator Assistant</span>
                </div>
              </button>
            </div>

            {/* Featured Creators & Social Gathering */}
            <div className="p-4 rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/70 shadow-sm dark:shadow-xl space-y-3 transition-colors">
              <div className="flex items-center justify-between px-1">
                <h3 className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider">
                  Community Creators
                </h3>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-bold">
                  {creators.length} {creators.length === 1 ? 'Creator' : 'Creators'}
                </span>
              </div>

              <div className="space-y-2">
                {creators.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCreator(c);
                      setActiveView('creator');
                      if (typeof window !== 'undefined' && window.history) {
                        window.history.replaceState(null, '', `/?u=${c.handle}`);
                      }
                    }}
                    className={`flex items-center justify-between p-2 rounded-2xl cursor-pointer transition-all ${
                      selectedCreator.id === c.id && activeView === 'creator'
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-800 dark:text-amber-300'
                        : 'hover:bg-slate-100 dark:hover:bg-slate-800/60 text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="w-8 h-8 rounded-xl object-cover border border-slate-200 dark:border-slate-700"
                      />
                      <div>
                        <div className="font-bold text-xs line-clamp-1">{c.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">@{c.handle}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono">
                      {c.widgets?.length ? 'Profile' : 'Store'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </aside>

          {/* Center Main Stage (View Router - Mobile/Tablet/Desktop Adaptive) */}
          <section className="col-span-1 md:col-span-8 lg:col-span-6 space-y-5 sm:space-y-6">
            {/* Mobile Creator Stories & Quick Switcher (Phones) */}
            <div className="block md:hidden p-3 rounded-2xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-800 shadow-sm transition-colors">
              <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-slate-800 text-xs">
                <span className="font-bold text-slate-800 dark:text-slate-200">Creators &amp; Gathering</span>
                <span className="text-[10px] text-amber-600 dark:text-amber-400 font-mono font-semibold">
                  {creators.length} Online
                </span>
              </div>
              <div className="flex items-center gap-3 overflow-x-auto pb-1">
                {creators.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCreator(c);
                      setActiveView('creator');
                      if (typeof window !== 'undefined' && window.history) {
                        window.history.replaceState(null, '', `/?u=${c.handle}`);
                      }
                    }}
                    className={`flex flex-col items-center gap-1 shrink-0 cursor-pointer p-1 rounded-xl transition-all ${
                      selectedCreator.id === c.id && activeView === 'creator'
                        ? 'opacity-100 scale-105'
                        : 'opacity-80 hover:opacity-100'
                    }`}
                  >
                    <div className={`relative p-0.5 rounded-2xl ${
                      selectedCreator.id === c.id && activeView === 'creator'
                        ? 'bg-gradient-to-tr from-amber-500 to-yellow-400'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}>
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="w-11 h-11 rounded-2xl object-cover"
                      />
                    </div>
                    <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[60px]">
                      {c.name.split(' ')[0]}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {activeView === 'feed' && (
              <Feed
                posts={posts}
                currentUser={userProfile}
                followingHandles={followingHandles}
                onToggleFollow={handleToggleFollow}
                onOpenStore={handleOpenStore}
                onPostCreated={handlePostCreated}
                onPostUpdated={handlePostUpdated}
                onOpenVerifyModal={() => {
                  setVerifyTab('card_auth');
                  setVerifyModalOpen(true);
                }}
              />
            )}

            {activeView === 'store' && (
              <Storefront
                products={products}
                onAddProduct={handleAddProduct}
                onPurchaseCompleted={handleProductPurchased}
              />
            )}

            {activeView === 'creator' && (
              <CreatorProfile
                creator={selectedCreator}
                posts={posts}
                products={products}
                onAddProduct={handleAddProduct}
                onPostUpdated={handlePostUpdated}
                onOpenVerifyModal={(tab) => {
                  setVerifyTab(tab || 'card_auth');
                  setVerifyModalOpen(true);
                }}
                onTransactionRecorded={handleTransactionRecorded}
                onUpdateCreator={handleUpdateCreator}
                onSelectCreator={handleOpenStore}
              />
            )}

            {activeView === 'community' && (
              <CommunityHub
                onOpenStore={handleOpenStore}
                onOpenVerifyModal={(tab) => {
                  setVerifyTab(tab || 'card_auth');
                  setVerifyModalOpen(true);
                }}
              />
            )}

            {activeView === 'analytics' && (
              <CreatorDashboard
                transactions={transactions}
                metrics={metrics}
              />
            )}
          </section>

          {/* Right Sidebar: Protocol Metrics & Ecosystem (Wide Desktop) */}
          <aside className="hidden lg:block lg:col-span-3 space-y-5">
            {/* Quick Financial Snapshot */}
            <div className="p-5 rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/70 shadow-sm dark:shadow-xl space-y-3 transition-colors">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
                <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Platform Activity</span>
                <span className="text-[10px] font-mono text-emerald-600 dark:text-emerald-400 font-semibold">Live</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Total Volume:</span>
                  <span className="font-bold font-mono text-amber-600 dark:text-amber-300">
                    {metrics.totalPlatformVolumeCook.toLocaleString()} COOK
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Treasury Support (5%):</span>
                  <span className="font-bold font-mono text-blue-600 dark:text-blue-400">
                    {metrics.totalTreasuryCollectedCook.toFixed(2)} COOK
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Active Creators:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {metrics.activeCreatorsCount}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-500 dark:text-slate-400">Transactions:</span>
                  <span className="font-bold font-mono text-slate-800 dark:text-slate-200">
                    {metrics.totalTransactionsCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Official Ecosystem Links */}
            <div className="p-5 rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/70 shadow-sm dark:shadow-xl space-y-2.5 text-xs transition-colors">
              <div className="flex items-center justify-between pb-1 border-b border-slate-100 dark:border-slate-800">
                <span className="font-bold text-slate-800 dark:text-slate-200">Cookie Chain Ecosystem</span>
                <span className="text-[10px] font-mono text-amber-600 dark:text-amber-400 font-semibold">Web3</span>
              </div>

              <button
                onClick={() => {
                  setEcosystemTab('bridge');
                  setEcosystemModalOpen(true);
                }}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left group"
              >
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-300">Warp Bridge</div>
                  <div className="text-[10px] text-slate-500">Bridge assets to Cookie Chain</div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
              </button>

              <button
                onClick={() => {
                  setEcosystemTab('cookieswap');
                  setEcosystemModalOpen(true);
                }}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left group"
              >
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-300">CookieSwap DEX</div>
                  <div className="text-[10px] text-slate-500">Token swapping &amp; liquidity</div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
              </button>

              <button
                onClick={() => {
                  setEcosystemTab('cookiebox');
                  setEcosystemModalOpen(true);
                }}
                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left group"
              >
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-300">Cookiebox Launchpad</div>
                  <div className="text-[10px] text-slate-500">Creator token launches</div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
              </button>

              <a
                href="https://cookiescan.io"
                target="_blank"
                rel="noopener noreferrer"
                className="w-full flex items-center justify-between p-2 rounded-xl bg-slate-50 hover:bg-slate-100 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-300 transition-colors text-left group"
              >
                <div>
                  <div className="font-semibold text-slate-800 dark:text-slate-200 group-hover:text-amber-600 dark:group-hover:text-amber-300">CookieScan Explorer</div>
                  <div className="text-[10px] text-slate-500">Official blockchain explorer</div>
                </div>
                <ExternalLink className="w-3.5 h-3.5 text-slate-400 group-hover:text-amber-600 dark:group-hover:text-amber-400" />
              </a>
            </div>
          </aside>
        </div>
      </main>

      {/* Verification Modal */}
      <AgeVerificationModal
        isOpen={verifyModalOpen}
        initialTab={verifyTab}
        onClose={() => setVerifyModalOpen(false)}
      />

      {/* Ecosystem Hub Modal */}
      <EcosystemHubModal
        isOpen={ecosystemModalOpen}
        defaultTab={ecosystemTab}
        onClose={() => setEcosystemModalOpen(false)}
      />

      {/* Autonomous AI Agent Modal */}
      <AiAgentModal
        isOpen={aiAgentOpen}
        onClose={() => setAiAgentOpen(false)}
        onOpenVerifyModal={(tab) => {
          setVerifyTab(tab || 'card_auth');
          setVerifyModalOpen(true);
        }}
        onOpenStore={handleOpenStore}
        onSelectView={setActiveView}
      />

      {/* Dedicated Mobile Bottom Navigation (Phones) */}
      <MobileBottomNav
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenAiAgent={() => setAiAgentOpen(true)}
        userProfile={userProfile}
      />
    </div>
  );
}
