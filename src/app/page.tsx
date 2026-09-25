'use client';

import React, { useState, useEffect } from 'react';
import Link from 'next/link';
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
  Shield,
  ShieldAlert,
} from 'lucide-react';

function buildDefaultProfileForWallet(address: string, username?: string): User {
  const isOwnerIdentity =
    (username && username.toLowerCase().replace(/^@+/, '') === 'thepros2014') ||
    address.toLowerCase().replace(/^@+/, '') === 'thepros2014' ||
    address.toLowerCase() === 'user-thepros2014' ||
    address.toLowerCase() === '2ahp2bqfhd35v5vhzu4t9mje7ey7ytnlj7gjimq3cuql';

  if (isOwnerIdentity) {
    return {
      id: 'user-thepros2014',
      handle: 'thepros2014',
      name: '@thepros2014',
      avatar: 'https://api.dicebear.com/7.x/bottts/svg?seed=thepros2014',
      bio: 'Platform Owner & Protocol Architect of social.wtf.',
      verified: true,
      ageVerified: true,
      walletAddress: address.length >= 32 ? address : '2AhP2bqFHd35v5Vhzu4T9MJe7EY7ytNLJ7GJimQ3CUqL',
      coverImage: 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1200&h=400&fit=crop',
      followersCount: 1337,
      followingCount: 42,
      friendsCount: 0,
      isCreator: true,
      isAdmin: true,
      storeSettings: {
        storeName: 'Platform Owner Storefront',
        storeDescription: 'Official protocol presets, templates, and ecosystem assets on Cookie Chain.',
        supportCookTreasuryPct: 0.05,
      },
    };
  }

  const shortAddr = address.length >= 8 ? `${address.slice(0, 4)}...${address.slice(-4)}` : address;
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
    isOwner,
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
    const isOwnerUser =
      account?.username?.toLowerCase().replace(/^@+/, '') === 'thepros2014' ||
      activeIdentity.toLowerCase().replace(/^@+/, '') === 'thepros2014' ||
      activeIdentity.toLowerCase() === '2ahp2bqfhd35v5vhzu4t9mje7ey7ytnlj7gjimq3cuql';

    // Check if query params explicitly ask to view owner profile
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const targetUser = params.get('u') || params.get('profile');
      if (targetUser && targetUser.toLowerCase().replace(/^@+/, '') === 'thepros2014') {
        const ownerProfile = buildDefaultProfileForWallet('2AhP2bqFHd35v5Vhzu4T9MJe7EY7ytNLJ7GJimQ3CUqL', 'thepros2014');
        setSelectedCreator(ownerProfile);
        setActiveView('creator');
      }
    }

    // 1. Fetch Authoritative Server Profile
    fetch('/api/profile')
      .then(async (res) => {
        if (!isMounted) return;

        if (res.status === 200) {
          const data = await res.json();
          if (data?.success && data.profile) {
            const canonicalProfile: User = data.profile;
            if (isOwnerUser) {
              canonicalProfile.isAdmin = true;
              canonicalProfile.handle = canonicalProfile.handle || 'thepros2014';
              canonicalProfile.name = canonicalProfile.name || '@thepros2014';
            }
            setUserProfile(canonicalProfile);
            if (!selectedCreator) {
              setSelectedCreator(canonicalProfile);
            }
          }
        } else if (res.status === 404) {
          const freshDefaults = buildDefaultProfileForWallet(activeIdentity, account?.username);
          setUserProfile(freshDefaults);
          if (!selectedCreator) {
            setSelectedCreator(freshDefaults);
          }
        } else if (res.status === 401) {
          await logoutSession();
        } else {
          setUserProfile(buildDefaultProfileForWallet(activeIdentity, account?.username));
        }
      })
      .catch(() => {
        if (!isMounted) return;
        setUserProfile(buildDefaultProfileForWallet(activeIdentity, account?.username));
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
      const headers: Record<string, string> = {};
      if (sessionToken && typeof sessionToken === 'string' && sessionToken.trim()) {
        headers['Authorization'] = `Bearer ${sessionToken.trim()}`;
      }
      fetch(`/api/profile?${queryParam}`, {
        headers: Object.keys(headers).length > 0 ? headers : undefined,
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
      treasuryAddress: COOKIE_CHAIN_CONFIG.treasuryPublicKey,
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
      treasuryAddress: COOKIE_CHAIN_CONFIG.treasuryPublicKey,
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

  const handlePostDeleted = (postId: string) => {
    setPosts((prev) => prev.filter((p) => p.id !== postId));
  };

  const handleProductUpdated = (updatedProd: Product) => {
    setProducts((prev) => prev.map((p) => (p.id === updatedProd.id ? updatedProd : p)));
  };

  const handleProductDeleted = (productId: string) => {
    setProducts((prev) => prev.filter((p) => p.id !== productId));
  };

  const handleAddProduct = (newProd: Product) => {
    setProducts((prev) => {
      if (prev.some((p) => p.id === newProd.id)) return prev;
      return [newProd, ...prev];
    });
  };

  const handleSelectView = (view: 'feed' | 'store' | 'creator' | 'community' | 'analytics') => {
    React.startTransition(() => {
      setActiveView(view);
    });
  };

  const handleOpenStore = (creatorHandle: string) => {
    const clean = creatorHandle.toLowerCase().replace(/^@+/, '');
    const found = creators.find((c) => c.handle.toLowerCase() === clean);
    if (found) {
      setSelectedCreator(found);
      handleSelectView('creator');
      if (typeof window !== 'undefined' && window.history) {
        window.history.replaceState(null, '', `/?u=${clean}`);
      }
    }
  };

  const handleOpenMyPage = () => {
    if (userProfile) {
      setSelectedCreator(userProfile);
      handleSelectView('creator');
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
    if (!isAuthenticated) {
      return { success: false, error: 'Please sign in to update your profile.' };
    }

    try {
      const activeToken = sessionToken || (typeof window !== 'undefined' ? localStorage.getItem('social_wtf_session_token') : null);
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (activeToken) {
        headers['Authorization'] = `Bearer ${activeToken}`;
      }

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
    <div className="min-h-screen flex flex-col" style={{background: 'var(--bg-main)', color: 'var(--text-main)'}}>
      {/* Top Navbar */}
      <Navbar
        activeView={activeView}
        onSelectView={handleSelectView}
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
        {/* Header strip */}
        <div className="mb-5 sm:mb-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded-lg bg-amber-500/10 dark:bg-amber-500/[0.12] flex items-center justify-center shrink-0">
              <Sparkles className="w-4 h-4 text-amber-500" />
            </div>
            <div>
              <h2 className="text-sm font-semibold text-slate-900 dark:text-white leading-tight">
                Social.wtf
              </h2>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                Relationship-scoped feed &amp; storefronts &mdash; visible only to accepted friends
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(activeUser.isAdmin || isOwner) && (
              <button
                onClick={() => {
                  const ownerProfile = buildDefaultProfileForWallet('2AhP2bqFHd35v5Vhzu4T9MJe7EY7ytNLJ7GJimQ3CUqL', 'thepros2014');
                  setSelectedCreator(ownerProfile);
                  handleSelectView('creator');
                }}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-semibold text-xs transition-all shadow-sm"
                title="Switch to @thepros2014 Owner Profile"
              >
                <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                <span className="hidden sm:inline">Owner Profile</span>
              </button>
            )}

            <button
              onClick={handleOpenMyPage}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-semibold text-xs transition-all shadow-sm hover:shadow-amber-500/20 hover:shadow-md active:scale-95"
            >
              <Edit3 className="w-3.5 h-3.5" />
              <span>My Page</span>
            </button>

            <button
              onClick={() => setAiAgentOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 dark:bg-white/[0.06] dark:hover:bg-white/[0.1] border border-slate-200/80 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 text-xs font-medium transition-all"
            >
              <Bot className="w-3.5 h-3.5 text-amber-500" />
              <span>AI</span>
            </button>
          </div>
        </div>

        {/* 3-Column Responsive Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-5 lg:gap-6">
          {/* Left Sidebar */}
          <aside className="hidden md:block md:col-span-4 lg:col-span-3 space-y-4">
            {/* My Profile Quick Card */}
            <div className="p-4 rounded-2xl bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/[0.06] shadow-sm dark:shadow-xl space-y-3 transition-colors">
              <div className="flex items-center gap-3">
                <img
                  src={activeUser.avatar}
                  alt={activeUser.name}
                  className="w-12 h-12 rounded-2xl object-cover border-2 border-amber-500 dark:border-amber-400 shrink-0"
                />
                <div className="overflow-hidden">
                  <div className="font-semibold text-slate-900 dark:text-white text-sm truncate">{activeUser.name}</div>
                  <div className="text-[11px] text-amber-500 font-mono">@{activeUser.handle}</div>
                  {activeUser.isAdmin && (
                    <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-blue-500/20 text-blue-400 border border-blue-500/40">
                      <ShieldCheck className="w-3 h-3 text-blue-400" />
                      <span>PROTOCOL OWNER</span>
                    </span>
                  )}
                  <div className="text-[10px] text-slate-400 dark:text-slate-500 truncate mt-0.5 font-mono">{activeUser.walletAddress ? `${activeUser.walletAddress.slice(0, 4)}...${activeUser.walletAddress.slice(-4)}` : ''}</div>
                </div>
              </div>

              <div className="pt-2 border-t border-slate-100 dark:border-white/[0.05] space-y-1.5">
                {(activeUser.isAdmin || isOwner) && (
                  <button
                    onClick={() => {
                      const ownerProfile = buildDefaultProfileForWallet('2AhP2bqFHd35v5Vhzu4T9MJe7EY7ytNLJ7GJimQ3CUqL', 'thepros2014');
                      setSelectedCreator(ownerProfile);
                      handleSelectView('creator');
                    }}
                    className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-blue-500/10 hover:bg-blue-500/20 border border-blue-500/30 text-blue-400 font-semibold text-xs transition-all shadow-sm"
                  >
                    <ShieldCheck className="w-3.5 h-3.5 text-blue-400" />
                    <span>Switch to Owner Profile</span>
                  </button>
                )}

                <button
                  onClick={handleOpenMyPage}
                  className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-white font-semibold text-xs active:scale-95 transition-all shadow-sm"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Customize My Page</span>
                </button>

                <button
                  onClick={handleCopyMyPersonalUrl}
                  className="w-full flex items-center justify-center gap-2 py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 dark:bg-white/[0.04] dark:hover:bg-white/[0.07] border border-slate-200/80 dark:border-white/[0.06] text-slate-600 dark:text-slate-400 text-xs font-medium transition-all"
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

            {/* Quick Nav */}
            <div className="p-3 rounded-2xl bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/[0.06] shadow-sm dark:shadow-xl space-y-0.5 transition-colors">
              {([
                { id: 'feed', label: 'Feed', Icon: MessageSquare },
                { id: 'store', label: 'Storefronts', Icon: ShoppingBag },
                { id: 'creator', label: 'Creator Profile', Icon: UserIcon },
                { id: 'community', label: 'Community', Icon: Globe },
                { id: 'analytics', label: 'Dashboard', Icon: TrendingUp },
              ] as const).map(({ id, label, Icon }) => (
                <button
                  key={id}
                  onClick={() => handleSelectView(id)}
                  className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                    activeView === id
                      ? 'bg-amber-500 text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-50/80 dark:hover:bg-white/[0.05]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span>{label}</span>
                </button>
              ))}

              {(activeUser.isAdmin || isOwner) && (
                <Link
                  href="/owner"
                  className="w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-xs font-bold text-amber-500 hover:bg-amber-500/10 transition-all border border-amber-500/20 mt-1"
                >
                  <ShieldAlert className="w-3.5 h-3.5 shrink-0 text-amber-500" />
                  <span>Owner Console</span>
                </Link>
              )}
            </div>
          </aside>

          {/* Center Main View Area */}
          <section className="col-span-1 md:col-span-8 lg:col-span-6 space-y-6">
            {activeView === 'feed' && (
              <Feed
                posts={posts}
                onPostCreated={handlePostCreated}
                onPostUpdated={handlePostUpdated}
                onPostDeleted={handlePostDeleted}
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
                onUpdateProduct={handleProductUpdated}
                onDeleteProduct={handleProductDeleted}
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
                onUpdateProduct={handleProductUpdated}
                onDeleteProduct={handleProductDeleted}
                onPostUpdated={handlePostUpdated}
                onPostDeleted={handlePostDeleted}
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

          {/* Right Sidebar: Platform Metrics & Security */}
          <aside className="hidden lg:block lg:col-span-3 space-y-4">
            <div className="p-4 rounded-2xl bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/[0.06] shadow-sm dark:shadow-xl space-y-3 transition-colors">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-500">
                <Coins className="w-3.5 h-3.5" />
                <span>Cookie Chain</span>
              </div>
              <div className="space-y-1.5 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100/80 dark:border-white/[0.04]">
                  <span className="text-slate-500 dark:text-slate-400">Volume</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {metrics.totalPlatformVolumeCook.toLocaleString()} COOK
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100/80 dark:border-white/[0.04]">
                  <span className="text-slate-500 dark:text-slate-400">SVM Speed</span>
                  <span className="font-mono font-semibold text-emerald-500">&lt; 400ms</span>
                </div>
                <div className="flex justify-between py-1">
                  <span className="text-slate-500 dark:text-slate-400">Transactions</span>
                  <span className="font-mono font-semibold text-slate-900 dark:text-white">
                    {metrics.totalTransactionsCount}
                  </span>
                </div>
              </div>
            </div>

            <div className="p-4 rounded-2xl bg-white dark:bg-[#141414] border border-slate-200/80 dark:border-white/[0.06] shadow-sm dark:shadow-xl space-y-2 text-xs transition-colors">
              <div className="flex items-center gap-2 font-semibold text-emerald-500">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>Relationship Security</span>
              </div>
              <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                Visible only to accepted friends. Zero metadata leakage on 404s.
              </p>
            </div>
          </aside>
        </div>
      </main>

      {/* Mobile Bottom Navigation */}
      <MobileBottomNav
        activeView={activeView}
        onSelectView={handleSelectView}
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
        onSelectView={handleSelectView}
      />
    </div>
  );
}
