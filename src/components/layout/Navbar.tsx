'use client';

import React, { useState, useEffect } from 'react';
import { NightlyWalletButton } from '../wallet/NightlyWalletButton';
import { useShield } from '@/lib/shield/shieldContext';
import { COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
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
} from 'lucide-react';

interface NavbarProps {
  activeView: 'feed' | 'store' | 'creator' | 'analytics';
  onSelectView: (view: 'feed' | 'store' | 'creator' | 'analytics') => void;
  onOpenVerifyModal: (tab?: 'video_liveness' | 'id_upload') => void;
  onOpenEcosystemModal?: (tab?: 'bridge' | 'cookieswap' | 'cookiebox' | 'das' | 'mcp') => void;
  onOpenAiAgent?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onSelectView,
  onOpenVerifyModal,
  onOpenEcosystemModal,
  onOpenAiAgent,
}) => {
  const { isAgeVerified, isVideoVerified, isIdVerified, canAccessXxx, unshieldedMode, toggleUnshieldedMode } = useShield();
  const [currentSlot, setCurrentSlot] = useState<number | null>(null);

  // Poll Cookie Chain slot for live status
  useEffect(() => {
    let mounted = true;
    const fetchSlot = async () => {
      try {
        const res = await fetch(COOKIE_CHAIN_CONFIG.rpcUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getSlot' }),
        });
        const data = await res.json();
        if (mounted && data?.result) {
          setCurrentSlot(data.result);
        }
      } catch (e) {
        // quiet fallback
      }
    };

    fetchSlot();
    const interval = setInterval(fetchSlot, 6000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full border-b border-slate-800/90 bg-[#070b14]/90 backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 flex items-center justify-between gap-4">
        {/* Logo & Brand */}
        <div className="flex items-center gap-6">
          <div
            onClick={() => onSelectView('feed')}
            className="flex items-center gap-2.5 cursor-pointer group"
          >
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-400 via-amber-500 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20 group-hover:scale-105 transition-transform">
              <Cookie className="w-5 h-5 text-slate-950 fill-slate-950" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-extrabold text-base tracking-tight text-white font-sans">
                  Social<span className="text-amber-400">.wtf</span>
                </span>
                <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25">
                  COOKIE CHAIN
                </span>
              </div>
            </div>
          </div>

          {/* Cookie Chain Live Status Indicator */}
          <div className="hidden lg:flex items-center gap-2 px-2.5 py-1 rounded-full bg-slate-900/80 border border-slate-800 text-[11px] font-mono text-slate-400">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping"></span>
            <span className="text-slate-300">Cookie Chain SVM</span>
            {currentSlot && (
              <>
                <span className="text-slate-600">•</span>
                <span className="text-amber-400">Slot #{currentSlot.toLocaleString()}</span>
              </>
            )}
          </div>
        </div>

        {/* Center Main Nav Tabs */}
        <nav className="hidden md:flex items-center gap-1 bg-slate-900/70 p-1 rounded-2xl border border-slate-800/80">
          <button
            onClick={() => onSelectView('feed')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'feed'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Social Feed
          </button>

          <button
            onClick={() => onSelectView('store')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'store'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Storefronts
          </button>

          <button
            onClick={() => onSelectView('creator')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'creator'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Creator Mini-App
          </button>

          <button
            onClick={() => onSelectView('analytics')}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              activeView === 'analytics'
                ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Treasury & Analytics
          </button>
        </nav>

        {/* Right Header Action Items */}
        <div className="flex items-center gap-2.5">
          {/* Sentinel AI Agent Conversation Launcher */}
          {onOpenAiAgent && (
            <button
              onClick={onOpenAiAgent}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/15 to-yellow-500/15 border border-amber-500/35 text-amber-300 hover:brightness-125 text-xs font-semibold transition-all shadow-sm group"
            >
              <Bot className="w-3.5 h-3.5 text-amber-400 group-hover:scale-110 transition-transform" />
              <span>AI Agent</span>
            </button>
          )}

          {/* Privacy Verification Status & Toggle */}
          {isVideoVerified ? (
            <button
              onClick={toggleUnshieldedMode}
              title={unshieldedMode ? 'XXX unshielded stream active' : 'Click to unshield restricted feeds'}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border transition-all ${
                unshieldedMode
                  ? 'bg-red-500/15 border-red-500/40 text-red-300'
                  : 'bg-slate-900 border-slate-700 text-slate-300'
              }`}
            >
              {unshieldedMode ? <Eye className="w-3.5 h-3.5" /> : <EyeOff className="w-3.5 h-3.5" />}
              <span className="hidden sm:inline">
                {unshieldedMode ? 'XXX Unshielded' : 'Shielded'}
              </span>
            </button>
          ) : (
            <button
              onClick={() => onOpenVerifyModal('video_liveness')}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-emerald-500/40 text-emerald-400 text-xs font-semibold transition-all shadow-sm"
            >
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
              <span className="hidden sm:inline">AI Sentinel Verify</span>
            </button>
          )}

          {/* Bridge & Swap Ecosystem Quick Launcher */}
          {onOpenEcosystemModal && (
            <button
              onClick={() => onOpenEcosystemModal('bridge')}
              className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/10 to-blue-500/10 border border-amber-500/30 text-amber-300 hover:brightness-125 text-xs font-semibold transition-all shadow-sm"
            >
              <span>🌉 Bridge & Swap</span>
            </button>
          )}

          {/* Nightly Wallet Connection Button */}
          <NightlyWalletButton />
        </div>
      </div>
    </header>
  );
};
