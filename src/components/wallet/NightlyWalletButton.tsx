'use client';

import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
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
    account,
    roles,
    isOwner,
    authenticateWallet,
    connect,
    disconnect,
    logoutSession,
    refreshBalance,
  } = useWallet();

  const [isOpen, setIsOpen] = useState(false);
  const [showSelectModal, setShowSelectModal] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

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

        {showSelectModal && mounted && createPortal(
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowSelectModal(false);
            }}
            className="fixed inset-0 z-[99999] overflow-y-auto bg-black/80 backdrop-blur-md p-3 sm:p-6 animate-fade-in"
          >
            <div className="min-h-full flex items-center justify-center py-4 sm:py-8">
              <div
                onClick={(e) => e.stopPropagation()}
                className="relative w-full max-w-md bg-[#0d1527] border border-slate-700/80 rounded-2xl p-5 sm:p-6 shadow-2xl ring-1 ring-white/10 my-auto"
              >
                <div className="flex items-center justify-between pb-4 border-b border-slate-800">
                  <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
                      <Wallet className="w-5 h-5" />
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-100 text-base">Connect to Cookie Chain</h3>
                      <p className="text-xs text-slate-400">Select your preferred SVM Web3 wallet</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSelectModal(false)}
                    className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                    aria-label="Close modal"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="mt-4 space-y-2.5">
                  <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1">
                    Supported Web3 Wallets
                  </div>

                  {/* Nightly Wallet Option (PRIMARY) */}
                  <button
                    onClick={() => handleConnect('nightly')}
                    className="w-full flex items-center justify-between p-3.5 rounded-xl border border-amber-500/60 bg-amber-500/10 hover:bg-amber-500/20 hover:border-amber-400 transition-all text-left group shadow-lg shadow-amber-500/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-500/40 flex items-center justify-center font-bold text-amber-400 shrink-0">
                        N
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-100 group-hover:text-amber-300 text-sm">
                            Nightly Wallet
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-extrabold rounded bg-amber-500/30 text-amber-300 border border-amber-500/50 tracking-wider">
                            PRIMARY SVM
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-300">Official Cookie Chain SVM Multi-chain Wallet</p>
                      </div>
                    </div>
                    {isNightlyInstalled ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-semibold">
                        <CheckCircle className="w-3.5 h-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="text-xs text-amber-400 font-medium group-hover:underline">Install / Connect</span>
                    )}
                  </button>

                  {/* Solana / Phantom Standard Adapter */}
                  <button
                    onClick={() => handleConnect('solana')}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800 hover:border-purple-500/50 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-purple-600/20 border border-purple-500/30 flex items-center justify-center font-bold text-purple-400 shrink-0">
                        S
                      </div>
                      <div>
                        <span className="font-semibold text-slate-200 group-hover:text-purple-300 text-sm">
                          Phantom / Solana Wallet
                        </span>
                        <p className="text-[11px] text-slate-400">Standard Solana SVM Extension</p>
                      </div>
                    </div>
                    <span className="text-xs text-slate-400">SVM Standard</span>
                  </button>

                  {/* Trust Wallet Option */}
                  <button
                    onClick={() => handleConnect('trust')}
                    className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/60 bg-slate-800/40 hover:bg-slate-800 hover:border-blue-400/50 transition-all text-left group"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-lg bg-[#0500FF]/20 border border-[#0500FF]/40 flex items-center justify-center font-bold text-blue-400 shrink-0">
                        <Shield className="w-4 h-4 text-blue-400" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-semibold text-slate-200 group-hover:text-blue-300 text-sm">
                            Trust Wallet
                          </span>
                          <span className="px-1.5 py-0.5 text-[9px] font-medium rounded bg-blue-500/20 text-blue-300 border border-blue-500/30">
                            MOBILE & EXT
                          </span>
                        </div>
                        <p className="text-[11px] text-slate-400">Solana SVM Extension / Mobile Browser</p>
                      </div>
                    </div>
                    {isTrustWalletInstalled ? (
                      <span className="text-xs text-emerald-400 flex items-center gap-1 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" /> Ready
                      </span>
                    ) : (
                      <span className="text-xs text-slate-500">Auto-Detect</span>
                    )}
                  </button>

                  {/* Secondary / Evaluation Mode */}
                  <div className="pt-2.5 border-t border-slate-800">
                    <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider px-1 mb-2">
                      Sandbox Evaluation Mode
                    </div>
                    <button
                      onClick={() => handleConnect('demo')}
                      className="w-full flex items-center justify-between p-3 rounded-xl border border-slate-700/60 bg-slate-900/60 hover:bg-slate-800 hover:border-amber-500/40 transition-all text-left group"
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center font-bold text-amber-400 shrink-0">
                          <Zap className="w-4 h-4" />
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-slate-200 group-hover:text-amber-300 text-sm">
                              Instant Demo Wallet
                            </span>
                            <span className="px-1.5 py-0.5 text-[9px] font-bold rounded bg-slate-800 text-amber-400 border border-amber-500/30">
                              SANDBOX
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">Explore platform with 88.50 Synthetic COOK</p>
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

                <div className="mt-3.5 p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-[11px] text-slate-400 leading-relaxed">
                  <span className="text-amber-400 font-semibold">Cookie Chain Network:</span> RPC: <code className="text-slate-300">rpc.cookiescan.io</code> | 1-sec block times | Native token: <span className="text-amber-300 font-semibold">$COOK</span>.
                </div>

                {isServerSignerConfigured && (
                  <div className="mt-2.5 p-2 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-[11px] text-emerald-300 flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Server Signer Active (PLATFORM_PRIVATE_KEY)</span>
                    </div>
                    <span className="font-mono text-[10px] text-emerald-400">On-Chain Ready</span>
                  </div>
                )}
              </div>
            </div>
          </div>,
          document.body
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

      {isOpen && mounted && createPortal(
        <>
          {/* Backdrop overlay for dismissing when clicking outside */}
          <div
            className="fixed inset-0 z-[99998] bg-black/40 backdrop-blur-[2px] sm:bg-transparent sm:backdrop-blur-none"
            onClick={() => setIsOpen(false)}
          />

          {/* Floating wallet details card */}
          <div className="fixed right-4 sm:right-6 lg:right-10 top-16 sm:top-[4.25rem] w-[calc(100vw-2rem)] sm:w-80 max-h-[calc(100vh-5rem)] overflow-y-auto rounded-2xl bg-[#0d1527] border border-slate-700/90 p-4 shadow-2xl z-[99999] animate-fade-in ring-1 ring-white/10 backdrop-blur-xl text-xs">
            <div className="flex items-center justify-between pb-2.5 mb-2.5 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400">
                  <Wallet className="w-4 h-4" />
                </div>
                <div>
                  <div className="text-[11px] font-semibold text-slate-300">
                    {walletType === 'trust' ? 'Trust Wallet' : walletType === 'nightly' ? 'Nightly Wallet' : walletType === 'solana' ? 'Solana / Phantom' : 'Demo Wallet'}
                  </div>
                  {walletType === 'demo' && (
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/20 text-amber-300 font-bold inline-block">
                      SANDBOX MODE
                    </span>
                  )}
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Account Info & Strapping Section */}
            {account && (
              <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 mb-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-400 text-[10px] uppercase font-bold tracking-wider">Account</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
                      isOwner
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                        : roles.includes('ROLE_ADMIN')
                        ? 'bg-purple-500/20 text-purple-300 border border-purple-500/40'
                        : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    }`}
                  >
                    {isOwner ? 'PLATFORM OWNER' : roles.includes('ROLE_ADMIN') ? 'ADMIN' : 'MEMBER'}
                  </span>
                </div>
                <div className="font-semibold text-slate-100 text-sm flex items-center gap-1.5">
                  <span>@{account.username}</span>
                </div>

                {/* Strapped status */}
                <div className="pt-1 text-[11px] flex items-center justify-between text-slate-400">
                  <span>Wallet Binding:</span>
                  {account.primaryWalletAddress ? (
                    <span className="text-emerald-400 font-mono font-medium flex items-center gap-1">
                      <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Strapped</span>
                    </span>
                  ) : (
                    <button
                      type="button"
                      onClick={async () => {
                        try {
                          await authenticateWallet();
                        } catch (err: any) {
                          alert(err?.message || 'Failed to strap wallet to account');
                        }
                      }}
                      className="text-amber-400 hover:text-amber-300 font-bold hover:underline"
                    >
                      Strap Wallet Now
                    </button>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-2 mb-3">
              <div className="text-[10px] text-slate-400 uppercase tracking-wider font-semibold">
                Wallet Address
              </div>
              <div className="font-mono text-slate-200 break-all font-medium text-[11px] select-all bg-slate-900/90 p-2 rounded-xl border border-slate-800">
                {walletAddress}
              </div>

              <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/60 border border-slate-800/80 mt-2">
                <span className="text-slate-400 text-[11px]">
                  {walletType === 'demo' ? 'Synthetic Balance' : 'Network Balance'}
                </span>
                <div className="flex items-center gap-1.5">
                  <span className="font-bold text-amber-300 font-mono text-sm">
                    {cookBalance.toFixed(2)} {walletType === 'demo' ? 'Synthetic COOK' : 'COOK'}
                  </span>
                  <button
                    onClick={handleRefresh}
                    title="Refresh balance from RPC"
                    className="p-1 rounded text-slate-400 hover:text-amber-300 hover:bg-slate-800 transition-colors"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-amber-400' : ''}`} />
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-slate-800">
              {/* Session SIWS status / Authenticate button */}
              {isAuthenticated ? (
                <div className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-medium">
                  <ShieldCheck className="w-4 h-4 flex-shrink-0" />
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
                  className="w-full flex items-center justify-between px-3 py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/30 text-amber-300 font-medium transition-all"
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
                className="flex items-center justify-between p-2.5 rounded-xl text-slate-300 hover:text-white hover:bg-slate-800/80 transition-colors"
              >
                <span>View on CookieScan</span>
                <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
              </a>

              <button
                onClick={() => {
                  disconnect();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800/60 transition-colors font-medium"
              >
                <span>Disconnect Wallet Only</span>
                <LogOut className="w-3.5 h-3.5" />
              </button>

              <button
                onClick={async () => {
                  await logoutSession();
                  setIsOpen(false);
                }}
                className="w-full flex items-center justify-between p-2.5 rounded-xl text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors font-bold"
              >
                <span>Sign Out & Disconnect (Universal)</span>
                <LogOut className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </>,
        document.body
      )}
    </div>
  );
};
