'use client';

import React, { useState } from 'react';
import { useWallet } from '@/lib/wallet/walletContext';
import {
  ShieldCheck,
  Lock,
  Wallet,
  Users,
  EyeOff,
  Sparkles,
  ArrowRight,
  AlertCircle,
  FileText,
  Shield,
  CheckCircle,
} from 'lucide-react';

interface LoginGateProps {
  onAuthenticated?: () => void;
}

export const LoginGate: React.FC<LoginGateProps> = ({ onAuthenticated }) => {
  const {
    connected,
    connecting,
    walletAddress,
    walletType,
    isNightlyInstalled,
    isTrustWalletInstalled,
    isAuthenticated,
    authenticating,
    connect,
    authenticateWallet,
    disconnect,
  } = useWallet();

  const [authStep, setAuthStep] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);

  const handleConnectAndAuth = async (type: 'trust' | 'nightly' | 'solana' | 'demo') => {
    setErrorMessage(null);
    setAuthStep('Connecting to wallet...');
    try {
      if (!connected || walletType !== type) {
        await connect(type);
      }
      setAuthStep('Requesting SIWS challenge & signature...');
      const success = await authenticateWallet();
      if (success) {
        setAuthStep(null);
        if (onAuthenticated) onAuthenticated();
      } else {
        setErrorMessage('Authentication challenge verification failed. Please try again.');
        setAuthStep(null);
      }
    } catch (err: any) {
      console.warn('Authentication gate failure:', err);
      const msg = err?.message || 'Authentication failed';
      setErrorMessage(
        msg.includes('Broadcast channel')
          ? 'Browser wallet communication was interrupted. Please reload or unlock your wallet extension and try again.'
          : msg
      );
      setAuthStep(null);
    }
  };

  const handleDirectAuth = async () => {
    setErrorMessage(null);
    setAuthStep('Requesting SIWS challenge & signature...');
    try {
      const success = await authenticateWallet();
      if (success) {
        setAuthStep(null);
        if (onAuthenticated) onAuthenticated();
      } else {
        setErrorMessage('Authentication challenge verification failed. Please try again.');
        setAuthStep(null);
      }
    } catch (err: any) {
      console.warn('SIWS direct authentication failure:', err);
      setErrorMessage(err?.message || 'Authentication failed');
      setAuthStep(null);
    }
  };

  const isBusy = connecting || authenticating || !!authStep;

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col justify-between selection:bg-amber-500/30 selection:text-amber-200">
      {/* Top Header */}
      <header className="w-full border-b border-slate-800/80 bg-[#070b14]/80 backdrop-blur-md px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-2xl bg-gradient-to-br from-amber-500 via-amber-600 to-yellow-600 flex items-center justify-center shadow-lg shadow-amber-500/20">
            <span className="font-black text-slate-950 text-base leading-none">W</span>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-extrabold text-lg tracking-tight text-white">
                Social<span className="text-amber-400">.wtf</span>
              </span>
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-amber-500/10 text-amber-300 border border-amber-500/25">
                COOKIE CHAIN SVM
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 text-xs text-slate-400">
          <ShieldCheck className="w-4 h-4 text-emerald-400" />
          <span>Encrypted Platform Gate</span>
        </div>
      </header>

      {/* Main Hero & Gate Container */}
      <main className="max-w-4xl mx-auto px-4 py-12 flex flex-col items-center justify-center flex-1 w-full">
        {/* Brand Headline */}
        <div className="text-center max-w-2xl mx-auto mb-10 space-y-4">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
            <Lock className="w-3.5 h-3.5" />
            <span>Private &bull; Relationship-Scoped &bull; Self-Sovereign</span>
          </div>

          <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight text-white leading-tight">
            Authentication Required for Platform Access
          </h1>

          <p className="text-slate-400 text-sm sm:text-base leading-relaxed">
            Social.wtf is a private, relationship-authorized network built on Cookie Chain SVM.
            All content, profiles, and storefronts are visible strictly to verified friends.
          </p>
        </div>

        {/* Central Authentication Card */}
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Subtle glow effect */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Error Banner */}
          {errorMessage && (
            <div className="mb-6 p-3.5 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5 text-rose-400" />
              <div className="flex-1">
                <span className="font-semibold block mb-0.5">Authentication Error</span>
                <span>{errorMessage}</span>
              </div>
            </div>
          )}

          {/* Connected but unauthenticated state */}
          {connected && walletAddress && !isAuthenticated ? (
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-slate-950/70 border border-slate-800 text-center space-y-1">
                <span className="text-[11px] text-slate-500 uppercase tracking-wider font-semibold block">
                  Connected Wallet
                </span>
                <span className="font-mono text-xs font-bold text-amber-300 block">
                  {walletAddress.slice(0, 8)}...{walletAddress.slice(-8)}
                </span>
                <span className="text-[11px] text-amber-400/80 block pt-1">
                  Cryptographic SIWS signature required to open platform
                </span>
              </div>

              <button
                onClick={handleDirectAuth}
                disabled={isBusy}
                className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>{isBusy ? authStep || 'Authenticating...' : 'Sign In with Solana (SIWS)'}</span>
              </button>

              <button
                onClick={disconnect}
                disabled={isBusy}
                className="w-full py-2.5 px-4 rounded-xl bg-slate-800/80 hover:bg-slate-800 text-slate-400 hover:text-slate-200 text-xs font-semibold transition-all text-center"
              >
                Disconnect &amp; Switch Wallet
              </button>
            </div>
          ) : (
            /* Unconnected State: Wallet Selector */
            <div className="space-y-4">
              <div className="text-center pb-2">
                <h3 className="text-base font-bold text-white">Connect &amp; Sign In</h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Select your Solana Web3 wallet to authenticate
                </p>
              </div>

              {/* Trust Wallet Button */}
              <button
                onClick={() => handleConnectAndAuth('trust')}
                disabled={isBusy}
                className="w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-500/50 text-left transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-sm">
                    TW
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
                      <span>Trust Wallet</span>
                      {isTrustWalletInstalled && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-normal">
                          Detected
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">Solana SVM Web3 Provider</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* Nightly Wallet Button */}
              <button
                onClick={() => handleConnectAndAuth('nightly')}
                disabled={isBusy}
                className="w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-500/50 text-left transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-sm">
                    N
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white group-hover:text-amber-300 transition-colors flex items-center gap-1.5">
                      <span>Nightly Wallet</span>
                      {isNightlyInstalled && (
                        <span className="text-[9px] px-1.5 py-0.2 rounded bg-emerald-500/20 text-emerald-300 font-normal">
                          Detected
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-400">Multi-Chain SVM Web3 Wallet</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* Solana Standard / Phantom */}
              <button
                onClick={() => handleConnectAndAuth('solana')}
                disabled={isBusy}
                className="w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-500/50 text-left transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-sm">
                    SOL
                  </div>
                  <div>
                    <div className="font-bold text-xs text-white group-hover:text-amber-300 transition-colors">
                      Solana Wallet (Phantom / Solflare)
                    </div>
                    <div className="text-[11px] text-slate-400">Standard Solana Provider</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 group-hover:translate-x-0.5 transition-all" />
              </button>

              {/* Developer / Demo Mode */}
              <button
                onClick={() => handleConnectAndAuth('demo')}
                disabled={isBusy}
                className="w-full p-3 rounded-2xl bg-slate-950/50 hover:bg-slate-950/80 border border-slate-800 text-left transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 font-mono text-xs">
                    DEV
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-300 group-hover:text-amber-300 transition-colors">
                      Developer Sandbox Wallet
                    </div>
                    <div className="text-[10px] text-slate-500">Local Ed25519 SVM Keypair</div>
                  </div>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-slate-600 group-hover:text-amber-400 transition-all" />
              </button>
            </div>
          )}

          {/* Loading status indicator */}
          {isBusy && (
            <div className="mt-4 pt-4 border-t border-slate-800 text-center">
              <div className="flex items-center justify-center gap-2 text-xs text-amber-400 font-semibold animate-pulse">
                <Shield className="w-3.5 h-3.5 animate-spin" />
                <span>{authStep || 'Processing authentication...'}</span>
              </div>
            </div>
          )}
        </div>

        {/* Architectural Pillars / Invariant Badges */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 w-full mt-12 max-w-3xl">
          <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <Users className="w-4 h-4" />
              <span>Relationship-Scoped</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              No global feed or public directory. Content is visible strictly to verified reciprocal friends.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <EyeOff className="w-4 h-4" />
              <span>Anti-Enumeration</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Unrelated profiles and posts return generic 404 responses with zero metadata or existence leakage.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Fail-Closed SIWS</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Authentication authority is derived strictly from server-verified cryptographic wallet signatures.
            </p>
          </div>
        </div>
      </main>

      {/* Footer & Legal Notices */}
      <footer className="w-full border-t border-slate-800/80 bg-[#070b14] py-6 px-6 text-center text-xs text-slate-500 space-y-2">
        <div className="flex items-center justify-center gap-6">
          <button
            onClick={() => setLegalModal('terms')}
            className="hover:text-slate-300 transition-colors underline-offset-2 hover:underline"
          >
            Terms of Service
          </button>
          <span>&bull;</span>
          <button
            onClick={() => setLegalModal('privacy')}
            className="hover:text-slate-300 transition-colors underline-offset-2 hover:underline"
          >
            Privacy Policy
          </button>
        </div>
        <div className="text-[11px] text-slate-600 font-mono">
          Social.wtf &bull; Cookie Chain SVM &bull; 100% Fail-Closed Access Control
        </div>
      </footer>

      {/* Terms / Privacy Modal */}
      {legalModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-800">
              <h3 className="font-bold text-base text-white">
                {legalModal === 'terms' ? 'Terms of Service' : 'Privacy Policy'}
              </h3>
              <button
                onClick={() => setLegalModal(null)}
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold"
              >
                Close
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              {legalModal === 'terms' ? (
                <>
                  <p>
                    <strong>1. Platform Access:</strong> Access to Social.wtf requires a valid, authenticated Sign-In with Solana (SIWS) session. Unauthenticated access is strictly prohibited.
                  </p>
                  <p>
                    <strong>2. Self-Sovereignty:</strong> You maintain sole control of your cryptographic private keys. The platform never requests or stores private keys.
                  </p>
                  <p>
                    <strong>3. Content &amp; Relationships:</strong> Content published to Social.wtf is scoped to accepted friendship relationships. Unilateral access or unauthorized data scraping is prohibited.
                  </p>
                  <p>
                    <strong>4. Cookie Chain SVM:</strong> On-chain actions, transactions, and creator tips execute directly on Cookie Chain SVM infrastructure.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>1. Zero Public Indexing:</strong> Social.wtf does not expose a public directory of members or global content feeds. Your profile and content are accessible only by accepted friends.
                  </p>
                  <p>
                    <strong>2. Anti-Enumeration:</strong> Requests for unrelated or unauthorized content return generic 404 responses to prevent wallet existence discovery.
                  </p>
                  <p>
                    <strong>3. Cryptographic Sessions:</strong> Session authorization tokens are cryptographically signed by the server and tied strictly to your wallet address.
                  </p>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
