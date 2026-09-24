'use client';

import React, { useState } from 'react';
import { useWallet } from '@/lib/wallet/walletContext';
import { formatAddress, COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import {
  Wallet,
  ChevronDown,
  ExternalLink,
  LogOut,
  CheckCircle,
  RefreshCw,
  Zap,
  Shield,
  ShieldCheck,
  X,
} from 'lucide-react';

export const NightlyWalletButton: React.FC = () => {
  const {
    connected,
    connecting,
    walletAddress,
    cookBalance,
    walletType,
    isNightlyInstalled,
    isTrustWalletInstalled,
    isServerSignerConfigured,
    serverSignerAddress,
    isAuthenticated,
    authenticating,
    authenticateWallet,
    connect,
    disconnect,
    refreshBalance,
  } = useWallet();

  const [isOpen, setIsOpen] = useState(false);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);

  const handleConnect = async (type: 'trust' | 'nightly' | 'solana' | 'demo') => {
    setConnectError(null);
    try {
      await connect(type);
      setShowSelectModal(false);
    } catch (err: any) {
      console.warn('Wallet connection attempt:', err);
      const msg = err?.message || 'Connection failed';
      setConnectError(
        msg.includes('Broadcast channel')
          ? 'Browser extension connection unavailable. Please unlock or reload your wallet extension.'
          : msg
      );
    }
  };

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
          <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center overflow-y-auto p-4 bg-black/70 backdrop-blur-sm animate-fade-in">
            <div className="relative w-full max-w-md max-h-[calc(100dvh-2rem)] overflow-y-auto overscroll-contain bg-[#0d1527] border border-slate-700/80 rounded-2xl p-4 sm:p-6 shadow-2xl">
              <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                    <Wallet className="w-5 h-5" />
                  </div>
                  <div>
                    <h3 className="font-bold text-slate-100">Connect to Cookie Chain</h3>
                    <p className="text-xs text-slate-400">Select your preferred SVM Web3 wallet</p>
                  </div>
                </div>
                <button
                  onClick={() => setShowSelectModal(false)}
                  className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                  aria-label="Close modal"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="mt-4 space-y-3">
                <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                  Supported Web3 Wallets
                </div>

                {/* Trust Wallet Option */}
                <button
                  onClick={() => handleConnect('trust')}
                  className="w-full flex items-center justify-between p-3.5 rounded-xl border border-blue-500/40 bg-blue-950/20 hover:bg-blue-900/30 hover:border-blue-400 transition-all text-left group"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-[#0500FF]/20 border border-[#0500FF]/40 flex items-center justify-center font-bold text-blue-400">
                      <Shield className="w-5 h-5 text-blue-400" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200 group-hover:text-blue-300">
                          Trust Wallet
                        </span>
                        <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                          WEB3 & MOBILE
                        </span>
                      </div>
                      <p className="text-xs text-slate-400">Official Extension & Mobile dApp Browser</p>
                    </div>
                  </div>
                  {isTrustWalletInstalled ? (
                    <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                      <CheckCircle className="w-3.5 h-3.5" /> Ready
                    </span>
                  ) : (
                    <span className="text-xs text-slate-400 flex items-center gap-1 group-hover:text-blue-300">
                      Auto-Detect / Install
                    </span>
                  )}
                </button>

                {/* Nightly Wallet Option */}
                <button
                  onClick={() => handleConnect('nightly')}
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
                  onClick={() => handleConnect('solana')}
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

                {/* Secondary / Evaluation Mode */}
                <div className="pt-3 border-t border-slate-800">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2">
                    Sandbox Evaluation Mode
                  </div>
                  <button
                    onClick={() => handleConnect('demo')}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800 hover:border-amber-500/40 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400">
                        <Zap className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200 group-hover:text-amber-300">
                            Instant Demo Wallet
                          </span>
                          <span className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-slate-800 text-amber-400 border border-amber-500/30">
                            SANDBOX
                          </span>
                        </div>
                        <p className="text-xs text-slate-400">Explore platform with 88.50 Synthetic COOK</p>
                      </div>
                    </div>
                    <span className="text-xs text-amber-400 font-medium">1-Click Test</span>
                  </button>
                </div>
              </div>

              {connectError && (
                <div className="mt-3 p-3 rounded-xl bg-red-950/50 border border-red-500/40 text-xs text-red-200 leading-relaxed animate-fade-in">
                  <span className="font-semibold text-red-300">Connection Notice: </span>
                  {connectError}
                </div>
              )}

              <div className="mt-4 p-3 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                <span className="text-amber-400 font-semibold">Cookie Chain Network:</span> RPC: <code className="text-slate-300">rpc.cookiescan.io</code> | 1-sec block times | Native token: <span className="text-amber-300 font-semibold">$COOK</span>.
              </div>

              {isServerSignerConfigured && (
                <div className="mt-3 p-2.5 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between">
                  <div className="flex items-center gap-1.5">
                    <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Server Signer Active (PLATFORM_PRIVATE_KEY)</span>
                  </div>
                  <span className="font-mono text-[10px] text-emerald-400">On-Chain Ready</span>
                </div>
              )}
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
          <span className="font-bold text-[10px] text-amber-400">
            {walletType === 'demo' ? 'Synthetic COOK' : 'COOK'}
          </span>
        </div>

        {walletType === 'demo' && (
          <span className="px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30 text-[10px] font-bold">
            [SANDBOX DEMO MODE]
          </span>
        )}

        <div className="flex items-center gap-1.5">
          <span
            className={`w-2 h-2 rounded-full ${
              isAuthenticated ? 'bg-emerald-400 shadow-sm shadow-emerald-400/50 animate-pulse' : 'bg-amber-400'
            }`}
          ></span>
          <span className="font-mono text-slate-200 text-xs font-medium">
            {formatAddress(walletAddress || '', 4)}
          </span>
          {isAuthenticated && (
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
          )}
        </div>

        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
      </button>

      {isOpen && (
        <div className="absolute right-0 mt-2 w-72 max-w-[calc(100vw-2rem)] rounded-2xl bg-[#0d1527] border border-slate-700/80 p-3 shadow-2xl z-50 animate-fade-in text-xs">
          <div className="pb-2.5 mb-2 border-b border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-slate-400">
                Connected Wallet ({walletType === 'trust' ? 'Trust Wallet' : walletType === 'nightly' ? 'Nightly' : walletType === 'solana' ? 'Solana / Phantom' : 'Demo'})
              </span>
              {walletType === 'demo' && (
                <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold">
                  SANDBOX
                </span>
              )}
            </div>
            <div className="font-mono text-slate-200 break-all font-medium mt-0.5 text-[11px] select-all bg-slate-900/80 p-1.5 rounded-lg border border-slate-800">
              {walletAddress}
            </div>
            <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-800/60">
              <span className="text-slate-400">
                {walletType === 'demo' ? 'Synthetic Balance:' : 'Cookie Chain Balance:'}
              </span>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-amber-300 font-mono text-sm">
                  {cookBalance.toFixed(2)} {walletType === 'demo' ? 'Synthetic COOK' : 'COOK'}
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

          <div className="space-y-1.5">
            {/* Session SIWS status / Authenticate button */}
            {isAuthenticated ? (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                <ShieldCheck className="w-3.5 h-3.5 flex-shrink-0" />
                <span>Session Verified (SIWS)</span>
              </div>
            ) : (
              <button
                onClick={async () => {
                  try {
                    await authenticateWallet();
                  } catch (err: any) {
                    console.error('Session authentication failed:', err);
                  }
                }}
                disabled={authenticating}
                className="w-full flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium transition-all"
              >
                <span className="flex items-center gap-1.5">
                  <Shield className="w-3.5 h-3.5" />
                  <span>{authenticating ? 'Signing SIWS...' : 'Authenticate Session'}</span>
                </span>
                <span className="text-[10px] uppercase font-bold text-amber-400">SIWS</span>
              </button>
            )}

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
