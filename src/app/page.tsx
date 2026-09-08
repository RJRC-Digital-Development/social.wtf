'use client';

import React, { useState } from 'react';
import { Navbar } from '@/components/layout/Navbar';
import { Feed } from '@/components/feed/Feed';
import { Storefront } from '@/components/store/Storefront';
import { CreatorProfile } from '@/components/profile/CreatorProfile';
import { CreatorDashboard } from '@/components/analytics/CreatorDashboard';
import { AgeVerificationModal } from '@/components/verification/AgeVerificationModal';
import {
  INITIAL_POSTS,
  INITIAL_PRODUCTS,
  INITIAL_CREATORS,
  INITIAL_TRANSACTIONS,
  INITIAL_TREASURY_METRICS,
} from '@/lib/data/mockData';
import { Post, Product, User, TransactionRecord, TreasuryMetrics } from '@/types';
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
} from 'lucide-react';

export default function Home() {
  const [activeView, setActiveView] = useState<'feed' | 'store' | 'creator' | 'analytics'>(
    'feed'
  );
  const [posts, setPosts] = useState<Post[]>(INITIAL_POSTS);
  const [products, setProducts] = useState<Product[]>(INITIAL_PRODUCTS);
  const [creators] = useState<User[]>(INITIAL_CREATORS);
  const [selectedCreator, setSelectedCreator] = useState<User>(INITIAL_CREATORS[0]);
  const [transactions, setTransactions] = useState<TransactionRecord[]>(INITIAL_TRANSACTIONS);
  const [metrics, setMetrics] = useState<TreasuryMetrics>(INITIAL_TREASURY_METRICS);

  const [verifyModalOpen, setVerifyModalOpen] = useState(false);
  const { isAgeVerified, unshieldedMode } = useShield();
  const { walletAddress } = useWallet();

  const handlePostCreated = (newPost: Post) => {
    setPosts([newPost, ...posts]);
  };

  const handlePostUpdated = (updatedPost: Post) => {
    setPosts(posts.map((p) => (p.id === updatedPost.id ? updatedPost : p)));

    // Record mock transaction
    const newTx: TransactionRecord = {
      id: `tx-${Date.now()}`,
      signature: `5${Math.random().toString(36).substring(2, 15)}${Math.random().toString(36).substring(2, 15)}`,
      fromAddress: walletAddress || 'CookYourWallet11111111111111111111111111',
      toAddress: updatedPost.author.walletAddress,
      treasuryAddress: 'CookTreasury11111111111111111111111111111111',
      totalAmountCook: 2.0,
      creatorAmountCook: 1.9,
      treasuryAmountCook: 0.1,
      actionType: 'tip',
      itemTitle: `Tip on ${updatedPost.author.name}'s Post`,
      timestamp: 'Just now',
      status: 'confirmed',
    };

    setTransactions([newTx, ...transactions]);
    setMetrics((prev) => ({
      ...prev,
      totalPlatformVolumeCook: prev.totalPlatformVolumeCook + 2.0,
      totalTreasuryCollectedCook: prev.totalTreasuryCollectedCook + 0.1,
      totalTransactionsCount: prev.totalTransactionsCount + 1,
    }));
  };

  const handleAddProduct = (newProd: Product) => {
    setProducts([newProd, ...products]);
  };

  const handleOpenStore = (creatorHandle: string) => {
    const found = creators.find((c) => c.handle === creatorHandle);
    if (found) {
      setSelectedCreator(found);
      setActiveView('creator');
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#070b14]">
      {/* Top Navbar */}
      <Navbar
        activeView={activeView}
        onSelectView={setActiveView}
        onOpenVerifyModal={() => setVerifyModalOpen(true)}
      />

      {/* Main Container */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {/* Top Highlight Banner */}
        <div className="mb-6 p-4 md:p-5 rounded-3xl bg-gradient-to-r from-amber-500/10 via-[#0d1527] to-blue-500/10 border border-slate-700/80 shadow-2xl flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3.5">
            <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shrink-0">
              <Sparkles className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-sm md:text-base font-bold text-slate-100 flex items-center gap-2">
                <span>Social.wtf on Cookie Chain SVM</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Sub-Second Finality
                </span>
              </h2>
              <p className="text-xs text-slate-300 mt-0.5">
                Every transaction automatically routes a 5% protocol fee to the platform treasury. Flagged mature media is completely shielded with zero trace.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {!isAgeVerified ? (
              <button
                onClick={() => setVerifyModalOpen(true)}
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-emerald-500/40 text-emerald-300 text-xs font-semibold transition-all shadow-sm"
              >
                <Lock className="w-3.5 h-3.5" />
                <span>Verify Age (Ephemeral OCR)</span>
              </button>
            ) : (
              <span className="px-3 py-1.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-semibold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4" />
                <span>Age-Verified (Zero-Data)</span>
              </span>
            )}
          </div>
        </div>

        {/* 3-Column Layout: Left Nav / Center Content / Right Feed Alpha */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          {/* Left Sidebar: Navigation & Quick Shortcuts */}
          <aside className="lg:col-span-3 space-y-5">
            {/* Quick Navigation Box */}
            <div className="p-4 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-1 text-xs font-medium">
              <button
                onClick={() => setActiveView('feed')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'feed'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <MessageSquare className="w-4 h-4" />
                <span>Social Feed Stream</span>
              </button>

              <button
                onClick={() => setActiveView('store')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'store'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <ShoppingBag className="w-4 h-4" />
                <span>Creator Storefronts</span>
              </button>

              <button
                onClick={() => {
                  setSelectedCreator(creators[0]);
                  setActiveView('creator');
                }}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'creator'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <Globe className="w-4 h-4" />
                <span>Creator Mini-App Demo</span>
              </button>

              <button
                onClick={() => setActiveView('analytics')}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-2xl transition-all ${
                  activeView === 'analytics'
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                    : 'text-slate-300 hover:bg-slate-800/60'
                }`}
              >
                <TrendingUp className="w-4 h-4" />
                <span>Platform Analytics & 5% Split</span>
              </button>
            </div>

            {/* Featured Creators */}
            <div className="p-4 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-3">
              <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wider px-1">
                Featured Creators
              </h3>

              <div className="space-y-2">
                {creators.map((c) => (
                  <div
                    key={c.id}
                    onClick={() => {
                      setSelectedCreator(c);
                      setActiveView('creator');
                    }}
                    className={`flex items-center justify-between p-2 rounded-2xl cursor-pointer transition-all ${
                      selectedCreator.id === c.id && activeView === 'creator'
                        ? 'bg-amber-500/15 border border-amber-500/40 text-amber-300'
                        : 'hover:bg-slate-800/60 text-slate-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <img
                        src={c.avatar}
                        alt={c.name}
                        className="w-8 h-8 rounded-xl object-cover border border-slate-700"
                      />
                      <div>
                        <div className="font-bold text-xs line-clamp-1">{c.name}</div>
                        <div className="text-[10px] text-slate-500 font-mono">@{c.handle}</div>
                      </div>
                    </div>
                    <span className="text-[10px] text-amber-400 font-mono">
                      {c.widgets?.length ? 'Mini-App' : 'Store'}
                    </span>
                  </div>
                ))}
              </div>
            </div>

            {/* Privacy Shielding Info Widget */}
            <div className="p-4 rounded-3xl bg-slate-900/60 border border-slate-800 text-xs space-y-2">
              <div className="flex items-center gap-2 text-emerald-400 font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Privacy & AI Shielding</span>
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                {isAgeVerified && unshieldedMode
                  ? 'Your session is age-verified. Unshielded mode allows mature creator sets to render without restriction.'
                  : 'Restricted media is invisibly shielded with zero trace or blur placeholders. Complete privacy verification to unlock.'}
              </p>
            </div>
          </aside>

          {/* Center Main Stage (View Router) */}
          <section className="lg:col-span-6 space-y-6">
            {activeView === 'feed' && (
              <Feed
                posts={posts}
                onOpenStore={handleOpenStore}
                onPostCreated={handlePostCreated}
                onPostUpdated={handlePostUpdated}
                onOpenVerifyModal={() => setVerifyModalOpen(true)}
              />
            )}

            {activeView === 'store' && (
              <Storefront
                products={products}
                onAddProduct={handleAddProduct}
              />
            )}

            {activeView === 'creator' && (
              <CreatorProfile
                creator={selectedCreator}
                posts={posts}
                products={products}
                onAddProduct={handleAddProduct}
                onPostUpdated={handlePostUpdated}
              />
            )}

            {activeView === 'analytics' && (
              <CreatorDashboard
                transactions={transactions}
                metrics={metrics}
              />
            )}
          </section>

          {/* Right Sidebar: Protocol Metrics & Ecosystem */}
          <aside className="lg:col-span-3 space-y-5">
            {/* Quick Financial Snapshot */}
            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <span className="text-xs font-bold text-slate-200">Cookie Chain Stats</span>
                <span className="text-[10px] font-mono text-emerald-400">Live RPC</span>
              </div>

              <div className="space-y-2.5 text-xs">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Platform Volume:</span>
                  <span className="font-bold font-mono text-amber-300">
                    {metrics.totalPlatformVolumeCook.toLocaleString()} COOK
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Platform Treasury (5%):</span>
                  <span className="font-bold font-mono text-blue-400">
                    {metrics.totalTreasuryCollectedCook.toFixed(2)} COOK
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Active Creators:</span>
                  <span className="font-bold font-mono text-slate-200">
                    {metrics.activeCreatorsCount}
                  </span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">Total Transactions:</span>
                  <span className="font-bold font-mono text-slate-200">
                    {metrics.totalTransactionsCount}
                  </span>
                </div>
              </div>
            </div>

            {/* Official Ecosystem Links */}
            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-2.5 text-xs">
              <div className="text-xs font-bold text-slate-200 pb-1 border-b border-slate-800">
                Cookie Chain Ecosystem
              </div>

              <a
                href="https://nightly.app"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              >
                <span>Nightly Wallet</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>

              <a
                href="https://docs.cookiechain.wtf"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              >
                <span>Cookie Chain Docs</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>

              <a
                href="https://cookiescan.io"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              >
                <span>CookieScan Explorer</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>

              <a
                href="https://t.me/TheCookieNetChain"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              >
                <span>Cookie Chain Telegram</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>
            </div>
          </aside>
        </div>
      </main>

      {/* Ephemeral Age Verification Modal */}
      <AgeVerificationModal
        isOpen={verifyModalOpen}
        onClose={() => setVerifyModalOpen(false)}
      />

      {/* Footer */}
      <footer className="w-full border-t border-slate-800/80 bg-[#070b14] py-8 text-center text-xs text-slate-500 mt-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <span className="font-extrabold text-slate-300">Social.wtf</span>
            <span>•</span>
            <span>Built on Cookie Chain SVM</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <a
              href="https://cookiescan.io"
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-400 transition-colors"
            >
              Explorer
            </a>
            <a
              href="https://docs.cookiechain.wtf"
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-400 transition-colors"
            >
              Docs
            </a>
            <a
              href="https://t.me/TheCookieNetChain"
              target="_blank"
              rel="noreferrer"
              className="hover:text-amber-400 transition-colors"
            >
              Telegram Community
            </a>
          </div>
        </div>
      </footer>
    </div>
  );
}
