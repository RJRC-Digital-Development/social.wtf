'use client';

import React, { useState } from 'react';
import {
  Cookie,
  ArrowRightLeft,
  Coins,
  ExternalLink,
  Bot,
  Database,
  Layers,
  Sparkles,
  CheckCircle2,
  Box,
} from 'lucide-react';

interface EcosystemHubModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'bridge' | 'cookieswap' | 'cookiebox' | 'das' | 'mcp';
}

export const EcosystemHubModal: React.FC<EcosystemHubModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'bridge',
}) => {
  const [activeTab, setActiveTab] = useState<'bridge' | 'cookieswap' | 'cookiebox' | 'das' | 'mcp'>(
    defaultTab
  );

  // Quick swap state
  const [swapAmount, setSwapAmount] = useState<number>(1);
  const [targetCook, setTargetCook] = useState<number>(1000);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0d1527] border border-slate-700/80 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Cookie className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <span>Cookie Chain Ecosystem Hub</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30">
                  OFFICIAL TOOLS
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Bridge, Swap, and interact with native Cookie Chain infrastructure
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 py-3 border-b border-slate-800 overflow-x-auto shrink-0 text-xs font-semibold">
          {[
            { id: 'bridge', label: '🌉 Hyperlane Bridge', icon: ArrowRightLeft },
            { id: 'cookieswap', label: '🔄 Cookieswap (DEX)', icon: Coins },
            { id: 'cookiebox', label: '📦 Cookiebox', icon: Box },
            { id: 'das', label: '📊 Cookie DAS API', icon: Database },
            { id: 'mcp', label: '🤖 cookie-mcp (AI Agents)', icon: Bot },
          ].map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                onClick={() => setActiveTab(t.id as any)}
                className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl whitespace-nowrap transition-all ${
                  activeTab === t.id
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/20'
                    : 'bg-slate-900 border border-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                <Icon className="w-3.5 h-3.5" />
                <span>{t.label}</span>
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="py-4 overflow-y-auto flex-1 text-xs space-y-4">
          {/* TAB 1: Hyperlane Bridge */}
          {activeTab === 'bridge' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-gradient-to-r from-blue-950/40 via-slate-900 to-amber-950/30 border border-blue-500/30 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-100 text-sm">
                    How to Bridge Funds to Cookie Chain
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    Sub-Minute Transfer
                  </span>
                </div>
                <p className="text-slate-300 leading-relaxed text-[11px]">
                  Cookie Chain utilizes the <strong>Hyperlane Warp Route</strong> to bridge native <code>$COOK</code> and assets between Solana Mainnet and Cookie Chain SVM. Reserves are secured by a community multi-sig.
                </p>
              </div>

              {/* Step-by-Step Bridge Guide */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-xs">
                    1
                  </div>
                  <h5 className="font-bold text-slate-200">Connect Nightly</h5>
                  <p className="text-[11px] text-slate-400">
                    Open Nightly Wallet or your SVM wallet on Solana Mainnet.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-xs">
                    2
                  </div>
                  <h5 className="font-bold text-slate-200">Transfer via Hyperlane</h5>
                  <p className="text-[11px] text-slate-400">
                    Specify $COOK or SOL and approve the warp transfer on Hyperlane.
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5">
                  <div className="w-6 h-6 rounded-full bg-amber-500/20 text-amber-300 flex items-center justify-center font-bold text-xs">
                    3
                  </div>
                  <h5 className="font-bold text-slate-200">Arrive on Cookie Chain</h5>
                  <p className="text-[11px] text-slate-400">
                    Funds appear in your Nightly balance on Cookie Chain in ~1 minute!
                  </p>
                </div>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
                <div>
                  <div className="font-bold text-slate-200">Launch Official Bridge Portal</div>
                  <div className="text-[11px] text-slate-400 font-mono">
                    hyperlane.cookiescan.io
                  </div>
                </div>

                <a
                  href="https://hyperlane.cookiescan.io"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold hover:brightness-110 transition-all shadow-md"
                >
                  <span>Open Bridge</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>
            </div>
          )}

          {/* TAB 2: Cookieswap DEX */}
          {activeTab === 'cookieswap' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-100 text-sm">Cookieswap Decentralized Exchange</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Official DEX on Cookie Chain for token swaps, liquidity pools, and creator tokens.
                  </p>
                </div>
                <a
                  href="https://cookieswap.fun"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 font-semibold"
                >
                  <span>cookieswap.fun</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              {/* Quick Swap Simulator */}
              <div className="p-4 rounded-2xl bg-slate-950 border border-slate-800 space-y-3 max-w-md mx-auto">
                <div className="text-xs font-bold text-slate-300">Quick Swap Simulator</div>
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-slate-500 block">You Pay</span>
                    <input
                      type="number"
                      value={swapAmount}
                      onChange={(e) => {
                        const v = parseFloat(e.target.value) || 0;
                        setSwapAmount(v);
                        setTargetCook(v * 1000);
                      }}
                      className="bg-transparent font-mono text-sm font-bold text-slate-100 focus:outline-none w-24"
                    />
                  </div>
                  <span className="font-bold text-slate-300 font-mono">SOL</span>
                </div>

                <div className="flex justify-center -my-1">
                  <div className="p-1 rounded-full bg-slate-800 text-slate-400">
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                  </div>
                </div>

                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 flex justify-between items-center">
                  <div>
                    <span className="text-[10px] text-slate-500 block">You Receive (~1s finality)</span>
                    <span className="font-mono text-sm font-bold text-amber-300">
                      {targetCook.toLocaleString()}
                    </span>
                  </div>
                  <span className="font-bold text-amber-400 font-mono">COOK</span>
                </div>

                <a
                  href="https://cookieswap.fun"
                  target="_blank"
                  rel="noreferrer"
                  className="w-full block text-center py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold transition-all"
                >
                  Execute Swap on Cookieswap.fun
                </a>
              </div>
            </div>
          )}

          {/* TAB 3: Cookiebox */}
          {activeTab === 'cookiebox' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-100 text-sm">Cookiebox Ecosystem Hub</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Launchpad, ecosystem indexer, and developer toolbox for Cookie Chain.
                  </p>
                </div>
                <a
                  href="https://cookiebox.app"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-500/10 text-amber-300 border border-amber-500/30 hover:bg-amber-500/20 font-semibold"
                >
                  <span>cookiebox.app</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-[11px] text-slate-300 leading-relaxed space-y-2">
                <p>
                  Cookiebox aggregates verified cApps, validator metrics, and trending tokens across Cookie Chain. Social.wtf storefronts and creator mini-apps can be indexed directly into Cookiebox directories.
                </p>
              </div>
            </div>
          )}

          {/* TAB 4: Cookie DAS API */}
          {activeTab === 'das' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-100 text-sm">
                    Cookiescan Digital Asset Standard (DAS) API
                  </h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Metaplex DAS JSON-RPC API endpoint: <code>https://api.cookiescan.io</code>
                  </p>
                </div>
                <a
                  href="https://api.cookiescan.io"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-500/10 text-blue-300 border border-blue-500/30 hover:bg-blue-500/20 font-semibold"
                >
                  <span>API Docs</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="p-4 rounded-2xl bg-[#060913] border border-slate-800 font-mono text-[11px] text-slate-300 space-y-1">
                <div className="text-amber-400 font-bold">// Example Metaplex DAS Request on Cookie Chain:</div>
                <div>POST https://api.cookiescan.io</div>
                <div>{`{ "jsonrpc": "2.0", "id": "1", "method": "getAssetsByOwner", "params": { "ownerAddress": "..." } }`}</div>
              </div>
            </div>
          )}

          {/* TAB 5: cookie-mcp */}
          {activeTab === 'mcp' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900 border border-slate-800 flex items-center justify-between">
                <div>
                  <h4 className="font-bold text-slate-100 text-sm">cookie-mcp (AI Agent Model Context Protocol)</h4>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Official MCP server allowing autonomous AI agents to interact with Cookie Chain.
                  </p>
                </div>
                <a
                  href="https://github.com/cookiechain/cookie-mcp"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-purple-500/10 text-purple-300 border border-purple-500/30 hover:bg-purple-500/20 font-semibold"
                >
                  <span>GitHub Repo</span>
                  <ExternalLink className="w-3.5 h-3.5" />
                </a>
              </div>

              <div className="p-4 rounded-2xl bg-slate-900/40 border border-slate-800 text-[11px] text-slate-300 leading-relaxed space-y-2">
                <p>
                  Social.wtf provides an integrated tool schema for <code>cookie-mcp</code>, enabling AI agents to autonomously scan media, verify age tokens, tip creators, and inspect creator mini-apps on Cookie Chain programmatically.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-between items-center shrink-0 text-[11px] text-slate-500">
          <span>Official Cookie Chain SVM Tools</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
