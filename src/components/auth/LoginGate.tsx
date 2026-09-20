'use client';

import React, { useState } from 'react';
import { useWallet } from '@/lib/wallet/walletContext';
import {
  ShieldCheck,
  Lock,
  Wallet,
  Users,
  EyeOff,
  ArrowRight,
  AlertCircle,
  Shield,
  UserPlus,
  LogIn,
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

  const [mode, setMode] = useState<'login' | 'register' | 'wallet'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [authStep, setAuthStep] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccountAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setIsSubmitting(true);
    setAuthStep(mode === 'register' ? 'Creating secure account...' : 'Authenticating...');

    try {
      const endpoint = mode === 'register' ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        setErrorMessage(data.message || data.error || 'Authentication failed. Please check your credentials.');
        setIsSubmitting(false);
        setAuthStep(null);
        return;
      }

      setAuthStep(null);
      setIsSubmitting(false);
      if (onAuthenticated) {
        onAuthenticated();
      } else {
        window.location.reload();
      }
    } catch (err: any) {
      console.error('Account authentication failed:', err);
      setErrorMessage(err?.message || 'Network error occurred. Please try again.');
      setIsSubmitting(false);
      setAuthStep(null);
    }
  };

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
        else window.location.reload();
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

  const isBusy = connecting || authenticating || isSubmitting || !!authStep;

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
        <div className="text-center max-w-2xl mx-auto mb-8 space-y-3">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-300 text-xs font-semibold">
            <Lock className="w-3.5 h-3.5" />
            <span>Private &bull; Relationship-Scoped &bull; Self-Sovereign</span>
          </div>

          <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight text-white leading-tight">
            {mode === 'register'
              ? 'Create Your Account'
              : mode === 'login'
              ? 'Welcome to Social.wtf'
              : 'Web3 Wallet Sign In'}
          </h1>

          <p className="text-slate-400 text-xs sm:text-sm leading-relaxed max-w-md mx-auto">
            Social.wtf is a private social network. Sign in with your account to access your friend-scoped feed and profile.
          </p>
        </div>

        {/* Central Authentication Card */}
        <div className="w-full max-w-md bg-slate-900/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Subtle glow effect */}
          <div className="absolute -top-24 -right-24 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
          <div className="absolute -bottom-24 -left-24 w-48 h-48 bg-blue-500/10 rounded-full blur-3xl pointer-events-none" />

          {/* Mode Tabs */}
          <div className="flex rounded-2xl bg-slate-950/80 p-1 mb-6 border border-slate-800/80">
            <button
              onClick={() => { setMode('login'); setErrorMessage(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'login'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Sign In
            </button>
            <button
              onClick={() => { setMode('register'); setErrorMessage(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'register'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Register
            </button>
            <button
              onClick={() => { setMode('wallet'); setErrorMessage(null); }}
              className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                mode === 'wallet'
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20'
                  : 'text-slate-400 hover:text-white'
              }`}
            >
              Web3 Wallet
            </button>
          </div>

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

          {/* Account-First Form (Login / Register) */}
          {mode === 'login' || mode === 'register' ? (
            <form onSubmit={handleAccountAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Username
                </label>
                <input
                  type="text"
                  required
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. alice_dev"
                  autoComplete="username"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/80 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  autoComplete={mode === 'register' ? 'new-password' : 'current-password'}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-950/70 border border-slate-800 text-white placeholder-slate-500 text-sm focus:outline-none focus:border-amber-500/80 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isBusy || !username || !password}
                className="w-full mt-2 py-3.5 px-4 rounded-2xl bg-gradient-to-r from-amber-500 via-amber-600 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-slate-950 font-bold text-sm shadow-lg shadow-amber-500/20 transition-all flex items-center justify-center gap-2 active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer"
              >
                {mode === 'register' ? <UserPlus className="w-4 h-4" /> : <LogIn className="w-4 h-4" />}
                <span>{isBusy ? authStep || 'Processing...' : mode === 'register' ? 'Create Account' : 'Sign In'}</span>
              </button>
            </form>
          ) : (
            /* Web3 Wallet Selector Tab */
            <div className="space-y-3">
              <button
                onClick={() => handleConnectAndAuth('trust')}
                disabled={isBusy}
                className="w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-500/50 text-left transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-blue-500/10 border border-blue-500/20 flex items-center justify-center text-blue-400 font-bold text-xs">
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

              <button
                onClick={() => handleConnectAndAuth('nightly')}
                disabled={isBusy}
                className="w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-500/50 text-left transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400 font-bold text-xs">
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

              <button
                onClick={() => handleConnectAndAuth('solana')}
                disabled={isBusy}
                className="w-full p-3.5 rounded-2xl bg-slate-800/80 hover:bg-slate-800 border border-slate-700/70 hover:border-amber-500/50 text-left transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center text-amber-400 font-bold text-xs">
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

              <button
                onClick={() => handleConnectAndAuth('demo')}
                disabled={isBusy}
                className="w-full p-3 rounded-2xl bg-slate-950/50 hover:bg-slate-950/80 border border-slate-800 text-left transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-lg bg-slate-800 flex items-center justify-center text-slate-400 font-mono text-xs">
                    DEV
                  </div>
                  <div>
                    <div className="font-bold text-xs text-slate-300 group-hover:text-amber-300 transition-colors">
                      Developer Sandbox Wallet
                    </div>
                    <div className="text-[10px] text-slate-500">Local Ed25519 Keypair</div>
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
              No public directory or global feed. Content is visible strictly to verified reciprocal friends.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <EyeOff className="w-4 h-4" />
              <span>Anti-Enumeration</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              Unrelated profiles and posts return generic 404 responses with zero metadata leakage.
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-slate-900/50 border border-slate-800/80 space-y-1.5">
            <div className="flex items-center gap-2 text-amber-400 text-xs font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>Argon2id + SIWS</span>
            </div>
            <p className="text-[11px] text-slate-400 leading-relaxed">
              One account login with optional cryptographic wallet attachment for Web3 actions.
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
                className="px-2.5 py-1 rounded-lg bg-slate-800 text-slate-400 hover:text-white text-xs font-semibold cursor-pointer"
              >
                Close
              </button>
            </div>

            <div className="text-xs text-slate-300 space-y-3 leading-relaxed">
              {legalModal === 'terms' ? (
                <>
                  <p>
                    <strong>1. Platform Access:</strong> Access to Social.wtf requires an authenticated account or verified SIWS session.
                  </p>
                  <p>
                    <strong>2. Relationship Privacy:</strong> Content published to Social.wtf is strictly scoped to accepted friendship relationships.
                  </p>
                  <p>
                    <strong>3. Self-Sovereignty:</strong> Bound blockchain wallets maintain private key control on user devices. Private keys are never handled by the server.
                  </p>
                </>
              ) : (
                <>
                  <p>
                    <strong>1. Zero Public Indexing:</strong> Social.wtf does not expose a public directory of members or global content feeds.
                  </p>
                  <p>
                    <strong>2. Password Protection:</strong> Account passwords are protected with OWASP-recommended Argon2id hashing.
                  </p>
                  <p>
                    <strong>3. Anti-Enumeration:</strong> Unauthorized requests return generic 404 responses to prevent identity discovery.
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
