'use client';

import React, { useState, useEffect } from 'react';
import { NightlyWalletButton } from '../wallet/NightlyWalletButton';
import { useShield } from '@/lib/shield/shieldContext';
import { useWallet } from '@/lib/wallet/walletContext';
import { useTheme } from '@/lib/theme/themeContext';
import { COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import { User } from '@/types';
import {
  Cookie,
  ShieldCheck,
  ShieldAlert,
  Eye,
  EyeOff,
  Activity,
  Layers,
  Sparkles,
  ShoppingBag,
  TrendingUp,
  Bot,
  User as UserIcon,
  Sliders,
  Sun,
  Moon,
  MessageSquare,
  BookOpen,
} from 'lucide-react';

interface NavbarProps {
  activeView: 'feed' | 'store' | 'creator' | 'community' | 'analytics';
  onSelectView: (view: 'feed' | 'store' | 'creator' | 'community' | 'analytics') => void;
  onOpenVerifyModal: (tab?: 'card_auth' | 'video_liveness' | 'id_upload') => void;
  onOpenEcosystemModal?: (tab?: 'bridge' | 'cookieswap' | 'cookiebox' | 'das' | 'mcp') => void;
  onOpenAiAgent?: () => void;
  userProfile?: User;
  onOpenMyPage?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onSelectView,
  onOpenVerifyModal,
  onOpenEcosystemModal,
  onOpenAiAgent,
  userProfile,
  onOpenMyPage,
}) => {
  const { isAdultContentUnlocked, unshieldedMode, toggleUnshieldedMode } = useShield();
  const { connected, walletAddress } = useWallet();
  const { theme, isNight, isDay, toggleTheme } = useTheme();

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-200/80 bg-white/95 dark:border-slate-800/90 dark:bg-[#070b14]/90 backdrop-blur-xl transition-colors duration-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-6 shrink-0">
          <div
            onClick={() => onSelectView('feed')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 dark:from-amber-400 dark:via-amber-500 dark:to-yellow-600 flex items-center justify-center shadow-md shadow-amber-500/15 group-hover:scale-105 transition-transform">
              <Cookie className="w-5 h-5 text-slate-950 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center">
                <span className="font-extrabold text-base tracking-tight text-slate-900 dark:text-white font-sans">
                  Social<span className="text-amber-600 dark:text-amber-400">.wtf</span>
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Center Main Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-100/90 dark:bg-slate-900/70 p-1 rounded-2xl border border-slate-200 dark:border-slate-800/80 shrink-0">
          <button
            onClick={() => onSelectView('feed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeView === 'feed'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Social Feed
          </button>

          <button
            onClick={() => onSelectView('store')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeView === 'store'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Storefronts
          </button>

          <button
            onClick={() => onSelectView('creator')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeView === 'creator'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Creator Mini-Apps
          </button>

          <button
            onClick={() => onSelectView('community')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeView === 'community'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Wiki &amp; Discussions
          </button>

          <button
            onClick={() => onSelectView('analytics')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold whitespace-nowrap shrink-0 transition-all ${
              activeView === 'analytics'
                ? 'bg-amber-500 text-slate-950 shadow-sm font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            Treasury &amp; Analytics
          </button>
        </nav>

        {/* Right Header Action Items */}
        <div className="flex items-center gap-2 shrink-0">
          {/* Day / Night Theme Switcher */}
          <button
            onClick={toggleTheme}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-medium transition-all shadow-sm shrink-0 whitespace-nowrap"
            title={isNight ? 'Switch to Day Mode (Dawn Clarity)' : 'Switch to Night Mode (Midnight Focus)'}
            aria-label="Toggle Night and Day Theme"
          >
            {isNight ? (
              <>
                <Sun className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span className="hidden xl:inline text-[11px] font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">Day</span>
              </>
            ) : (
              <>
                <Moon className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200 shrink-0" />
                <span className="hidden xl:inline text-[11px] font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">Night</span>
              </>
            )}
          </button>

          {/* My Personal Page Shortcut */}
          {onOpenMyPage && (
            <button
              onClick={onOpenMyPage}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold transition-all shadow-sm shrink-0 whitespace-nowrap"
              title="Open and customize your personal creator page"
            >
              {userProfile?.avatar ? (
                <img
                  src={userProfile.avatar}
                  alt={userProfile.name}
                  className="w-4 h-4 rounded-full object-cover border border-amber-500 shrink-0"
                />
              ) : (
                <UserIcon className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
              )}
              <span className="whitespace-nowrap text-slate-900 dark:text-slate-100">My Page</span>
            </button>
          )}

          {/* Sentinel AI Agent Conversation Launcher */}
          {onOpenAiAgent && (
            <button
              onClick={onOpenAiAgent}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold transition-all shadow-sm group shrink-0 whitespace-nowrap"
            >
              <Bot className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 group-hover:scale-110 transition-transform shrink-0" />
              <span className="whitespace-nowrap text-slate-900 dark:text-slate-100">AI Agent</span>
            </button>
          )}

          {/* Bridge & Swap Ecosystem Quick Launcher */}
          {onOpenEcosystemModal && (
            <button
              onClick={() => onOpenEcosystemModal('bridge')}
              className="hidden lg:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 border border-slate-300 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-xs font-bold transition-all shadow-sm shrink-0 whitespace-nowrap"
            >
              <span className="whitespace-nowrap text-slate-900 dark:text-slate-100">Bridge &amp; Swap</span>
            </button>
          )}

          {/* Nightly Wallet Connection Button */}
          <NightlyWalletButton />
        </div>
      </div>
    </header>
  );
};

export interface MobileBottomNavProps {
  activeView: 'feed' | 'store' | 'creator' | 'community' | 'analytics';
  onSelectView: (view: 'feed' | 'store' | 'creator' | 'community' | 'analytics') => void;
  onOpenAiAgent?: () => void;
  userProfile?: User;
  onOpenMyPage?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onSelectView,
  onOpenAiAgent,
  userProfile,
  onOpenMyPage,
}) => {
  return (
    <nav
      aria-label="Mobile Bottom Navigation"
      className="fixed bottom-0 left-0 right-0 z-40 md:hidden bg-white/95 dark:bg-[#070b14]/95 border-t border-slate-200 dark:border-slate-800/90 backdrop-blur-xl px-2 py-1.5 flex items-center justify-around shadow-2xl transition-colors duration-200"
    >
      {/* Feed */}
      <button
        onClick={() => onSelectView('feed')}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
          activeView === 'feed'
            ? 'text-amber-600 dark:text-amber-400 font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <MessageSquare className="w-5 h-5" />
          {activeView === 'feed' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          )}
        </div>
        <span className="text-[10px] mt-0.5">Feed</span>
      </button>

      {/* Store */}
      <button
        onClick={() => onSelectView('store')}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
          activeView === 'store'
            ? 'text-amber-600 dark:text-amber-400 font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <ShoppingBag className="w-5 h-5" />
          {activeView === 'store' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          )}
        </div>
        <span className="text-[10px] mt-0.5">Store</span>
      </button>

      {/* My Page (Creator Profile) */}
      <button
        onClick={() => {
          if (onOpenMyPage) onOpenMyPage();
          else onSelectView('creator');
        }}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
          activeView === 'creator'
            ? 'text-amber-600 dark:text-amber-400 font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <div className="relative">
          {userProfile?.avatar ? (
            <img
              src={userProfile.avatar}
              alt="Profile"
              className={`w-5 h-5 rounded-full object-cover border ${
                activeView === 'creator'
                  ? 'border-amber-500'
                  : 'border-slate-300 dark:border-slate-700'
              }`}
            />
          ) : (
            <UserIcon className="w-5 h-5" />
          )}
          {activeView === 'creator' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          )}
        </div>
        <span className="text-[10px] mt-0.5">My Page</span>
      </button>

      {/* Discussions */}
      <button
        onClick={() => onSelectView('community')}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
          activeView === 'community'
            ? 'text-amber-600 dark:text-amber-400 font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <BookOpen className="w-5 h-5" />
          {activeView === 'community' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          )}
        </div>
        <span className="text-[10px] mt-0.5">Discuss</span>
      </button>

      {/* Analytics */}
      <button
        onClick={() => onSelectView('analytics')}
        className={`flex flex-col items-center justify-center py-1 px-2.5 rounded-xl transition-all ${
          activeView === 'analytics'
            ? 'text-amber-600 dark:text-amber-400 font-bold'
            : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
        }`}
      >
        <div className="relative">
          <TrendingUp className="w-5 h-5" />
          {activeView === 'analytics' && (
            <span className="absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-amber-500"></span>
          )}
        </div>
        <span className="text-[10px] mt-0.5">Treasury</span>
      </button>

      {/* AI Agent Floating Quick Action */}
      {onOpenAiAgent && (
        <button
          onClick={onOpenAiAgent}
          className="flex flex-col items-center justify-center py-1 px-2.5 rounded-xl text-amber-700 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-300 transition-all"
        >
          <Bot className="w-5 h-5 text-amber-600 dark:text-amber-400" />
          <span className="text-[10px] mt-0.5">AI</span>
        </button>
      )}
    </nav>
  );
};

