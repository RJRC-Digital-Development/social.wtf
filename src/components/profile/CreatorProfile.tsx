'use client';

import React, { useState } from 'react';
import { User, Product, Post } from '@/types';
import { Storefront } from '../store/Storefront';
import { PostCard } from '../feed/PostCard';
import { AudioPlayer } from '../feed/AudioPlayer';
import {
  CheckCircle,
  ShoppingBag,
  Grid,
  Sliders,
  Radio,
  Target,
  ExternalLink,
  Coins,
  Sparkles,
} from 'lucide-react';

interface CreatorProfileProps {
  creator: User;
  posts: Post[];
  products: Product[];
  onAddProduct: (prod: Product) => void;
  onPostUpdated: (post: Post) => void;
}

export const CreatorProfile: React.FC<CreatorProfileProps> = ({
  creator,
  posts,
  products,
  onAddProduct,
  onPostUpdated,
}) => {
  const [activeTab, setActiveTab] = useState<'store' | 'feed' | 'widgets'>('store');
  const [crowdfundRaised, setCrowdfundRaised] = useState(76.5);

  const creatorPosts = posts.filter((p) => p.author.handle === creator.handle);
  const creatorProducts = products.filter((p) => p.creatorHandle === creator.handle);

  return (
    <div className="space-y-6">
      {/* Profile Header Mini-App Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-[#0d1527] border border-slate-700/80 shadow-2xl">
        {/* Cover Banner */}
        <div className="h-44 md:h-56 w-full relative bg-slate-900 overflow-hidden">
          {creator.coverImage ? (
            <img
              src={creator.coverImage}
              alt="Cover"
              className="w-full h-full object-cover brightness-90"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-blue-900 via-amber-900 to-indigo-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d1527] via-transparent to-black/30" />
        </div>

        {/* Creator Info Overlay */}
        <div className="relative px-6 pb-6 pt-0 flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-16">
          <div className="flex items-end gap-4">
            <img
              src={creator.avatar}
              alt={creator.name}
              className="w-24 h-24 md:w-28 md:h-28 rounded-3xl object-cover border-4 border-[#0d1527] shadow-xl bg-slate-900"
            />
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-slate-100">
                  {creator.name}
                </h1>
                {creator.verified && (
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                  CREATOR MINI-APP
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">@{creator.handle}</p>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <span className="font-bold text-slate-200 block text-sm font-mono">
                {creator.followersCount.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Followers</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <span className="font-bold text-amber-400 block text-sm font-mono">
                {creatorProducts.length}
              </span>
              <span className="text-[10px] text-slate-400">Store Drops</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <span className="font-bold text-emerald-400 block text-sm font-mono">
                95%
              </span>
              <span className="text-[10px] text-slate-400">Proceeds Cut</span>
            </div>
          </div>
        </div>

        {/* Bio & Micro-Ecosystem Description */}
        <div className="px-6 pb-6 pt-2 border-t border-slate-800/80">
          <p className="text-slate-300 text-xs md:text-sm leading-relaxed max-w-3xl">
            {creator.bio}
          </p>
          <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-slate-400">
            <span className="text-amber-400">SVM Address:</span>
            <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
              {creator.walletAddress}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex px-6 border-t border-slate-800/80 bg-slate-900/40">
          <button
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'store'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Storefront ({creatorProducts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('widgets')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'widgets'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Mini-App Widgets ({creator.widgets?.length || 0})</span>
          </button>

          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'feed'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Creator Feed ({creatorPosts.length})</span>
          </button>
        </div>
      </div>

      {/* Tab 1: Creator Storefront */}
      {activeTab === 'store' && (
        <Storefront
          products={products}
          creatorHandle={creator.handle}
          onAddProduct={onAddProduct}
        />
      )}

      {/* Tab 2: Customizable Mini-App Widgets */}
      {activeTab === 'widgets' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Widget 1: Audio Spotlight */}
          <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <Radio className="w-4 h-4 text-amber-400" />
                <span>Audio Spotlight Widget</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-medium">
                Live On Profile
              </span>
            </div>
            <AudioPlayer
              audioUrl="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
              title="Midnight In Gorbagana (SVM Mix)"
              artist={creator.name}
            />
          </div>

          {/* Widget 2: Tipping Jar Crowdfund Goal */}
          <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                <Target className="w-4 h-4 text-amber-400" />
                <span>Crowdfund Tip Goal Widget</span>
              </div>
              <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 font-medium font-mono">
                {crowdfundRaised} / 100 COOK
              </span>
            </div>

            <div>
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-slate-300 font-medium">Funding Community Album EP</span>
                <span className="text-amber-400 font-bold font-mono">
                  {Math.round((crowdfundRaised / 100) * 100)}%
                </span>
              </div>
              <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5">
                <div
                  className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                  style={{ width: `${Math.min(100, (crowdfundRaised / 100) * 100)}%` }}
                />
              </div>
            </div>

            <p className="text-[11px] text-slate-400 leading-relaxed">
              Every tip automatically triggers a 5% split to the Social.wtf treasury to fund upcoming platform features and validator grants.
            </p>

            <button
              onClick={() => setCrowdfundRaised((prev) => Math.min(100, prev + 5))}
              className="w-full py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold text-xs transition-all flex items-center justify-center gap-2"
            >
              <Coins className="w-3.5 h-3.5" />
              <span>Contribute 5 $COOK to Goal</span>
            </button>
          </div>

          {/* Widget 3: Official Links */}
          <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300 pb-2 border-b border-slate-800">
              <ExternalLink className="w-4 h-4 text-amber-400" />
              <span>Verified Creator Links</span>
            </div>
            <div className="space-y-2 text-xs">
              <a
                href="https://docs.cookiechain.wtf"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              >
                <span>Cookie Chain Documentation</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>
              <a
                href="https://cookiescan.io"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              >
                <span>CookieScan Explorer</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>
              <a
                href="https://t.me/TheCookieNetChain"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
              >
                <span>Cookie Chain Official Telegram</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Creator Posts */}
      {activeTab === 'feed' && (
        <div className="space-y-4">
          {creatorPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onPostUpdated={onPostUpdated}
            />
          ))}
        </div>
      )}
    </div>
  );
};
