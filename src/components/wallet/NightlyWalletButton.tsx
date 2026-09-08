'use client';

import React, { useState } from 'react';
import { useWallet } from '@/lib/wallet/walletContext';
import { formatAddress, COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import { Wallet, ChevronDown, ExternalLink, LogOut, CheckCircle, RefreshCw, Zap } from 'lucide-react';

export const NightlyWalletButton: React.FC = () => {
  const {
    connected,
    connecting,
    walletAddress,
    cookBalance,
    walletType,
    isNightlyInstalled,
    connect,
    disconnect,
    refreshBalance,
  } = useWallet();

  const [isOpen, setIsOpen] = useState(false);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const handleRefresh = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setIsRefreshing(true);
    await refreshBalance();
    setTimeout(() => setIsRefreshing(false), 500);
  };

  if (!connected) {
    return (
      <>
        <button
          onClick={() => setShowSelectModal(true)}
          disabled={connecting}
          className="relative inline-flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold transition-all duration-200 bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 text-slate-950 hover:brightness-110 shadow-lg shadow-amber-500/20 active:scale-95"
        >
          <Wallet className="w-4 h-4" />
          <span>{connecting ? 'Connecting...' : 'Connect Wallet'}</span>
          <span className="flex h-2 w-2 relative">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
          </span>
        </button>

        {showSelectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-md bg-[#0d1527] border border-slate-700/80 rounded-2xl p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-100">Connect to Cookie Chain</h3>
                    <p className="text-xs text-slate-400">Select your preferred SVM wallet</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSelectModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 space-y-3">
                {/* Nightly Wallet Option */}
                <button
                  onClick={() => {
                    connect('nightly');
                    setShowSelectModal(false);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800 hover:border-amber-500/50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-blue-600/20 border border-blue-500/30 flex items-center justify-center font-bold text-blue-400">
                      N
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 group-hover:text-amber-400">
                          Nightly Wallet
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                          RECOMMENDED
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">Official Cookie Chain SVM Wallet</p>
                    </div>
                  </div>
                  {isNightlyInstalled ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="text-xs text-slate-500">Auto-Detect</span>
                  )}
                </button>

                {/* Solana / Standard Adapter */}
                <button
                  onClick={() => {
                    connect('solana');
                    setShowSelectModal(false);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800 hover:border-amber-500/50 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center font-bold text-purple-400">
                      S
                    </div>
                    <div>
                      <span className="font-semibold text-slate-200 group-hover:text-amber-400">
                        Solana / Phantom
                      </span>
                      <p className="text-xs text-slate-400">Connect custom SVM RPC</p>
                    </div>
                  </div>
                  <span className="text-xs text-slate-500">SVM Standard</span>
                </button>

                {/* Instant Dev / Demo Wallet */}
                <button
                  onClick={() => {
                    connect('demo');
                    setShowSelectModal(false);
                  }}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-500 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-amber-300">
                      <Zap className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-200">
                          Instant Demo Wallet
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          PRE-FUNDED
                        </span>
                      </div>
                      <p className="text-xs text-slate-300">Explore immediately with 88.50 $COOK</p>
                    </div>
                  </div>
                  <span className="text-xs text-amber-400 font-medium">1-Click Test</span>
                </button>
              </div>

              <div className="mt-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                <span className="text-amber-400 font-semibold">Cookie Chain Network:</span> RPC: <code className="text-slate-300">rpc.cookiescan.io</code> | 1-sec block times | Native token: <span className="text-amber-300 font-semibold">$COOK</span>.
              </div>
            </div>
          </div>
        )}
      </>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-700/80 bg-[#0d1527] hover:bg-slate-800/80 transition-all text-sm shadow-md"
      >
        <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-amber-300 font-mono font-medium text-xs">
          <span>{cookBalance.toFixed(2)}</span>
          <span className="font-bold text-[10px] text-amber-400">COOK</span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="font-mono text-slate-200 text-xs font-medium">
            {formatAddress(walletAddress || '', 4)}
          </span>
        </div>

        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 rounded-2xl bg-[#0d1527] border border-slate-700/80 p-3 shadow-2xl z-50 animate-fade-in text-xs">
          <div className="pb-2.5 mb-2 border-b border-slate-800">
            <div className="text-[11px] text-slate-400">Connected Wallet ({walletType})</div>
            <div className="font-mono text-slate-200 break-all font-medium mt-0.5 text-[11px]">
              {walletAddress}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
              <span className="text-slate-400">Cookie Chain Balance:</span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-amber-300 font-mono text-sm">
                  {cookBalance.toFixed(2)} COOK
                </span>
                <button
                  onClick={handleRefresh}
                  title="Refresh balance from RPC"
                  className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800"
                >
                  <RefreshCw className={`w-3 h-3 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <a
              href={`${COOKIE_CHAIN_CONFIG.explorerUrl}/address/${walletAddress}`}
              target="_blank"
              rel="noreferrer"
              className="flex items-center justify-between p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800/60 transition-colors"
            >
              <span>View on CookieScan</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
            </a>

            <button
              onClick={() => {
                disconnect();
                setIsOpen(false);
              }}
              className="w-full flex items-center justify-between p-2 rounded-lg text-red-400 hover:text-red-300 hover:bg-red-500/10 transition-colors"
            >
              <span>Disconnect</span>
              <LogOut className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
