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
import { LoginGate } from '@/components/auth/LoginGate';
import { INITIAL_TREASURY_METRICS } from '@/lib/data/mockData';
import { Post, Product, User, TransactionRecord, TreasuryMetrics } from '@/types';
import { calculateFeeSplit } from '@/lib/solana/cookieChain';
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
  Shield,
} from 'lucide-react';

function buildDefaultProfileForWallet(address: string): User {
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
      supportCookTreasuryPct: 0.05,
    },
  };
}

export default function Home() {
  const [activeView, setActiveView] = useState<'feed' | 'store' | 'creator' | 'community' | 'analytics'>(
    'feed'
  );
  const [posts, setPosts] = useState<Post[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [creators, setCreators] = useState<User[]>([]);
  const [userProfile, setUserProfile] = useState<User | null>(null);
  const [selectedCreator, setSelectedCreator] = useState<User | null>(null);
  const [transactions, setTransactions] = useState<TransactionRecord[]>([]);
  const [followingHandles, setFollowingHandles] = useState<string[]>([]);
  const [metrics, setMetrics] = useState<TreasuryMetrics>(INITIAL_TREASURY_METRICS);
  const [copiedPersonalUrl, setCopiedPersonalUrl] = useState(false);

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const [verifyTab, setVerifyTab] = useState<'card_auth' | 'video_liveness' | 'id_upload'>('card_auth');
  const [aiAgentOpen, setAiAgentOpen] = useState(false);
  const [ecosystemModalOpen, setEcosystemModalOpen] = useState(false);
  const [ecosystemTab, setEcosystemTab] = useState<'bridge' | 'cookieswap' | 'cookiebox' | 'das' | 'mcp'>('bridge');
  const { isAgeVerified, isVideoVerified, isIdVerified, isCardVerified, isAdultContentUnlocked, canAccessAdultContent, unshieldedMode } = useShield();
  const {
    connected,
    walletAddress,
    account,
    sessionToken,
    isAuthenticated,
    authStatus,
    refreshAccountAuth,
    logoutSession,
  } = useWallet();

  // Clear protected client state if unauthenticated
  useEffect(() => {
    if (!isAuthenticated || authStatus !== 'authenticated') {
      setPosts([]);
      setProducts([]);
      setCreators([]);
      setUserProfile(null);
      setSelectedCreator(null);
      setTransactions([]);
      setFollowingHandles([]);
    }
  }, [isAuthenticated, authStatus]);

  // Sync profile & content when authenticated
  useEffect(() => {
    if (!isAuthenticated || authStatus !== 'authenticated') {
      return;
    }

    let isMounted = true;
    const activeIdentity = account?.primaryWalletAddress || walletAddress || account?.accountId || 'user';

    // 1. Fetch Authoritative Server Profile
    fetch('/api/profile')
      .then(async (res) => {
        if (!isMounted) return;

        if (res.status === 200) {
          const data = await res.json();
          if (data?.success && data.profile) {
            const canonicalProfile: User = data.profile;
            setUserProfile(canonicalProfile);
            if (!selectedCreator) {
              setSelectedCreator(canonicalProfile);
            }
          }
        } else if (res.status === 404) {
          const freshDefaults = buildDefaultProfileForWallet(activeIdentity);
          setUserProfile(freshDefaults);
          if (!selectedCreator) {
            setSelectedCreator(freshDefaults);
          }
        } else if (res.status === 401) {
          await logoutSession();
        } else {
          setUserProfile(buildDefaultProfileForWallet(activeIdentity));
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setUserProfile(buildDefaultProfileForWallet(activeIdentity));
      });

    // 2. Fetch Directory of Self + Accepted Friends
    fetch('/api/profiles')
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 200) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.profiles)) {
            setCreators(data.profiles);
          }
        } else if (res.status === 401) {
          await logoutSession();
        }
      })
      .catch(() => {});

    // 3. Fetch Relationship-Authorized Products
    fetch('/api/products')
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 200) {
          const data = await res.json();
          if (data?.success && Array.isArray(data.products)) {
            setProducts(data.products);
          }
        } else if (res.status === 401) {
          await logoutSession();
        }
      })
      .catch(() => {});

    // 4. Fetch Relationship-Authorized Posts
    fetch('/api/posts')
      .then(async (res) => {
        if (!isMounted) return;
        if (res.status === 200) {
          const data = await res.json();
          if (Array.isArray(data.posts)) {
            setPosts(data.posts);
          }
        } else if (res.status === 401) {
          await logoutSession();
        }
      })
      .catch(() => {});

    return () => {
      isMounted = false;
    };
  }, [isAuthenticated, authStatus, account, walletAddress, isAdultContentUnlocked, unshieldedMode, logoutSession]);

  // Deep linking URL query parameters (?u=..., ?wallet=...) for authenticated members
  useEffect(() => {
    if (!isAuthenticated || authStatus !== 'authenticated' || !sessionToken || typeof window === 'undefined') {
      return;
    }

    const searchParams = new URLSearchParams(window.location.search);
    const targetParam =
      searchParams.get('u') ||
      searchParams.get('user') ||
      searchParams.get('creator') ||
      searchParams.get('profile') ||
      searchParams.get('wallet');

    if (targetParam) {
      const cleanParam = targetParam.trim().replace(/^@+/, '').toLowerCase();
      const found = creators.find(
        (c) => c.handle.toLowerCase() === cleanParam || c.walletAddress.toLowerCase() === cleanParam
      );

      if (found) {
        setSelectedCreator(found);
        setActiveView('creator');
        return;
      }

      const queryParam = cleanParam.length > 30 ? `wallet=${cleanParam}` : `handle=${cleanParam}`;
      fetch(`/api/profile?${queryParam}`, {
        headers: { Authorization: `Bearer ${sessionToken}` },
      })
        .then((res) => (res.ok ? res.json() : null))
        .then((data) => {
          if (data?.success && data.profile) {
            setSelectedCreator(data.profile);
            setCreators((prev) => [data.profile, ...prev.filter((c) => c.handle !== data.profile.handle)]);
            setActiveView('creator');
          }
        })
        .catch(() => {});
    }
  }, [isAuthenticated, authStatus, sessionToken, creators]);

  const handlePostCreated = (newPost: Post) => {
    setPosts((prev) => [newPost, ...prev.filter((p) => p.id !== newPost.id)]);
  };

  const handlePostUpdated = (updatedPost: Post, meta?: { tipAmount?: number; signature?: string }) => {
    setPosts((prev) => prev.map((p) => (p.id === updatedPost.id ? updatedPost : p)));

    if (!meta?.signature || !walletAddress) {
      return;
    }

    const tipAmount = meta?.tipAmount ?? 2.0;
    const split = calculateFeeSplit(tipAmount, 500);
    const newTx: TransactionRecord = {
      id: `tx-${Date.now()}`,
      signature: meta.signature,
      fromAddress: walletAddress,
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
    if (!product || !product.creatorWallet || !walletAddress || !txSig || typeof txSig !== 'string' || !txSig.trim()) {
      return;
    }

    const split = calculateFeeSplit(product.priceCook, 500);
    const newTx: TransactionRecord = {
      id: `tx-prod-${Date.now()}`,
      signature: txSig.trim(),
      fromAddress: walletAddress,
      toAddress: product.creatorWallet,
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
    setProducts((prev) => {
      if (prev.some((p) => p.id === newProd.id)) return prev;
      return [newProd, ...prev];
    });
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
    if (userProfile) {
      setSelectedCreator(userProfile);
      setActiveView('creator');
      if (typeof window !== 'undefined' && window.history) {
        window.history.replaceState(null, '', `/?u=${userProfile.handle}`);
      }
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

  const handleUpdateCreator = async (updated: User): Promise<{ success: boolean; error?: string }> => {
    if (!connected || !walletAddress || !sessionToken) {
      return { success: false, error: 'Please sign in to update your profile.' };
    }

    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${sessionToken}`,
      };

      const payload = {
        handle: updated.handle,
        name: updated.name,
        bio: updated.bio,
        avatar: updated.avatar,
        coverImage: updated.coverImage,
        isCreator: updated.isCreator,
        isAdultContentCreator: updated.isAdultContentCreator,
        sponsorUrl: updated.sponsorUrl,
        sponsorGoal: updated.sponsorGoal,
        storeSettings: updated.storeSettings,
      };

      const res = await fetch('/api/profile', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        return { success: false, error: data.error || 'Failed to update profile' };
      }

      const saved: User = data.profile;
      setUserProfile(saved);
      if (selectedCreator?.walletAddress === saved.walletAddress) {
        setSelectedCreator(saved);
      }
      setCreators((prev) => prev.map((c) => (c.walletAddress === saved.walletAddress ? saved : c)));
      return { success: true };
    } catch (err: any) {
      return { success: false, error: err.message || 'Failed to update profile' };
    }
  };

  const handleCopyMyPersonalUrl = async () => {
    if (!userProfile) return;
    const url = typeof window !== 'undefined'
      ? `${window.location.origin}/?u=${userProfile.handle}`
      : `https://socialwtf.vercel.app/?u=${userProfile.handle}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedPersonalUrl(true);
      setTimeout(() => setCopiedPersonalUrl(false), 2500);
    } catch (e) {}
  };

  // Admission Gate: UNAUTHENTICATED session state (Platform Login & Registration Gate)
  if (!isAuthenticated || authStatus !== 'authenticated') {
    return <LoginGate onAuthenticated={refreshAccountAuth} />;
  }

  // Phase 3: AUTHENTICATED session state (Social.wtf Protected Application Shell)
  const activeIdentity = account?.primaryWalletAddress || walletAddress || account?.accountId || 'user';
  const activeUser = userProfile || buildDefaultProfileForWallet(activeIdentity);
  const activeSelected = selectedCreator || activeUser;

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
        userProfile={activeUser}
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
                <span>Social.wtf — Relationship-Scoped Social Network &amp; Storefronts</span>
              </h2>
              <p className="text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                Authenticated with Cookie Chain SVM. Your profile and storefront are visible strictly to verified friends.
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

          </div>
        </div>

        {/* 3-Column Responsive Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6">
          {/* Left Sidebar */}
          <aside className="hidden md:block md:col-span-4 lg:col-span-3 space-y-5">
            {/* My Personal Profile Quick Card */}
            <div className="p-4 rounded-3xl bg-white dark:bg-[#0d1527] border border-amber-500/30 shadow-sm dark:shadow-xl space-y-3 transition-colors">
              <div className="flex items-center gap-3">
                <img
                  src={activeUser.avatar}
                  alt={activeUser.name}
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-500 dark:border-amber-400 shrink-0"
                />
                <div className="overflow-hidden">
                  <div className="font-bold text-slate-900 dark:text-slate-100 text-xs truncate">{activeUser.name}</div>
                  <div className="text-[11px] text-amber-600 dark:text-amber-400 font-mono">@{activeUser.handle}</div>
                  <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5 font-mono">{activeUser.walletAddress ? `${activeUser.walletAddress.slice(0, 4)}...${activeUser.walletAddress.slice(-4)}` : ''}</div>
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
                <span>Friend Feed</span>
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
                onClick={() => setActiveView('creator')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'creator'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <UserIcon className="w-4 h-4" />
                <span>Creator Profile</span>
              </button>

              <button
                onClick={() => setActiveView('community')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'community'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800/60'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>Community Hub</span>
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
                <span>Creator Dashboard</span>
              </button>
            </div>
          </aside>

          {/* Center Main View Area */}
          <section className="col-span-1 md:col-span-8 lg:col-span-6 space-y-6">
            {activeView === 'feed' && (
              <Feed
                posts={posts}
                onPostCreated={handlePostCreated}
                onPostUpdated={handlePostUpdated}
                onOpenStore={handleOpenStore}
                onOpenVerifyModal={(tab) => {
                  setVerifyTab(tab || 'video_liveness');
                  setVerifyModalOpen(true);
                }}
              />
            )}

            {activeView === 'store' && (
              <Storefront
                products={products}
                onAddProduct={handleAddProduct}
                onPurchaseCompleted={handleProductPurchased}
                onOpenVerifyModal={(tab) => {
                  setVerifyTab(tab || 'card_auth');
                  setVerifyModalOpen(true);
                }}
              />
            )}

            {activeView === 'creator' && (
              <CreatorProfile
                creator={activeSelected}
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
                onSelectCreator={(handle) => {
                  const clean = handle.toLowerCase().replace(/^@+/, '');
                  const found = creators.find((c) => c.handle.toLowerCase() === clean);
                  if (found) {
                    setSelectedCreator(found);
                  }
                }}
              />
            )}

            {activeView === 'community' && (
              <CommunityHub
                onOpenVerifyModal={(tab) => {
                  setVerifyTab(tab || 'card_auth');
                  setVerifyModalOpen(true);
                }}
                onOpenAiAgent={() => setAiAgentOpen(true)}
              />
            )}

            {activeView === 'analytics' && (
              <CreatorDashboard
                transactions={transactions}
                metrics={metrics}
              />
            )}
          </section>

          {/* Right Sidebar: Treasury Metrics & Platform Security */}
          <aside className="hidden lg:block lg:col-span-3 space-y-5">
            <div className="p-4 rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/70 shadow-sm dark:shadow-xl space-y-3 transition-colors">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
                <Coins className="w-4 h-4" />
                <span>Cookie Chain Treasury</span>
              </div>
              <div className="space-y-2 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Volume</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {metrics.totalPlatformVolumeCook.toLocaleString()} COOK
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">Treasury (0.05%)</span>
                  <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                    {metrics.totalTreasuryCollectedCook.toLocaleString()} COOK
                  </span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500">Transactions</span>
                  <span className="font-mono font-bold text-slate-900 dark:text-white">
                    {metrics.totalTransactionsCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/70 shadow-sm dark:shadow-xl space-y-2 text-xs transition-colors">
              <div className="flex items-center gap-2 font-bold text-emerald-600 dark:text-emerald-400">
                <ShieldCheck className="w-4 h-4" />
                <span>Relationship Security</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Posts and storefront items are strictly visible to accepted friends. Unrelated accounts receive generic 404 responses with zero metadata leakage.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenMyPage={handleOpenMyPage}
      />

      {/* Modals */}
      <AgeVerificationModal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
        initialTab={verifyTab}
      />

      <EcosystemHubModal
        isOpen={ecosystemModalOpen}
        onClose={() => setEcosystemModalOpen(false)}
        initialTab={ecosystemTab}
      />

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
    </div>
  );
}
