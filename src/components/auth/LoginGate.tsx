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
  KeyRound,
  CheckCircle2,
  Mail,
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
    refreshAccountAuth,
  } = useWallet();

  const [mode, setMode] = useState<'login' | 'register' | 'forgot_password' | 'reset_password' | 'wallet'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [resetIdentifier, setResetIdentifier] = useState('');
  const [resetToken, setResetToken] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [authStep, setAuthStep] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [legalModal, setLegalModal] = useState<'terms' | 'privacy' | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleAccountAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
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

      setAuthStep('Synchronizing session...');
      const synced = await refreshAccountAuth();
      setIsSubmitting(false);
      setAuthStep(null);

      if (synced && onAuthenticated) {
        onAuthenticated();
      }
    } catch (err: any) {
      console.error('Account authentication failed:', err);
      setErrorMessage(err?.message || 'Network error occurred. Please try again.');
      setIsSubmitting(false);
      setAuthStep(null);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    setAuthStep('Requesting password recovery...');

    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ identifier: resetIdentifier }),
      });

      const data = await res.json();
      setIsSubmitting(false);
      setAuthStep(null);

      if (res.ok && data.success) {
        setSuccessMessage(data.message || 'If an account with a verified recovery email exists, recovery instructions have been sent.');
      } else {
        setErrorMessage(data.message || data.error || 'Failed to submit password reset request.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error occurred. Please try again.');
      setIsSubmitting(false);
      setAuthStep(null);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);
    setIsSubmitting(true);
    setAuthStep('Resetting password...');

    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: resetToken, newPassword }),
      });

      const data = await res.json();
      setIsSubmitting(false);
      setAuthStep(null);

      if (res.ok && data.success) {
        setSuccessMessage('Password has been successfully updated! You can now log in with your new password.');
        setMode('login');
        setPassword('');
      } else {
        setErrorMessage(data.message || data.error || 'Failed to reset password.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Network error occurred. Please try again.');
      setIsSubmitting(false);
      setAuthStep(null);
    }
  };

  const handleConnectAndAuth = async (type: 'trust' | 'nightly' | 'solana' | 'demo') => {
    setErrorMessage(null);
    setSuccessMessage(null);
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
              : mode === 'forgot_password'
              ? 'Recover Account Access'
              : mode === 'reset_password'
              ? 'Set New Password'
              : mode === 'wallet'
              ? 'Connect Web3 Wallet'
              : 'Sign In to Social.wtf'}
          </h1>

          <p className="text-sm sm:text-base text-slate-400 leading-relaxed">
            {mode === 'register'
              ? 'Join the private creator network. Account-first, zero wallet required to get started.'
              : mode === 'forgot_password'
              ? 'Enter your username or verified recovery email to receive reset instructions.'
              : mode === 'reset_password'
              ? 'Enter your reset token and choose a new secure password.'
              : mode === 'wallet'
              ? 'Connect your Solana wallet to bind on-chain capabilities.'
              : 'Enter your credentials to access your friend feed, profile, and storefronts.'}
          </p>
        </div>

        {/* Auth Mode Toggle Tabs */}
        <div className="flex items-center p-1 bg-slate-900/90 border border-slate-800 rounded-2xl mb-6 shadow-inner w-full max-w-md">
          <button
            type="button"
            onClick={() => {
              setMode('login');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'login'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Sign In</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('register');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'register'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Register</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setMode('wallet');
              setErrorMessage(null);
              setSuccessMessage(null);
            }}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-xs font-bold transition-all ${
              mode === 'wallet'
                ? 'bg-amber-500 text-slate-950 shadow-md'
                : 'text-slate-400 hover:text-white hover:bg-slate-800/50'
            }`}
          >
            <Wallet className="w-3.5 h-3.5" />
            <span>Wallet</span>
          </button>
        </div>

        {/* Card Box */}
        <div className="w-full max-w-md bg-[#0d1527]/90 border border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-xl relative overflow-hidden">
          {/* Status / Error / Success Alerts */}
          {errorMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-3">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{errorMessage}</div>
            </div>
          )}

          {successMessage && (
            <div className="mb-6 p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-3">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <div className="flex-1 leading-relaxed">{successMessage}</div>
            </div>
          )}

          {authStep && (
            <div className="mb-6 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs flex items-center gap-3">
              <div className="w-3.5 h-3.5 border-2 border-amber-400 border-t-transparent rounded-full animate-spin shrink-0" />
              <span className="font-medium">{authStep}</span>
            </div>
          )}

          {/* Form 1: Account Login / Register */}
          {(mode === 'login' || mode === 'register') && (
            <form onSubmit={handleAccountAuth} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Username
                </label>
                <input
                  type="text"
                  required
                  disabled={isBusy}
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="e.g. alice_crypto"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider">
                    Password
                  </label>
                  {mode === 'login' && (
                    <button
                      type="button"
                      onClick={() => {
                        setMode('forgot_password');
                        setErrorMessage(null);
                        setSuccessMessage(null);
                      }}
                      className="text-[11px] text-amber-400 hover:underline"
                    >
                      Forgot password?
                    </button>
                  )}
                </div>
                <input
                  type="password"
                  required
                  disabled={isBusy}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isBusy || !username.trim() || !password}
                className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all mt-2 flex items-center justify-center gap-2"
              >
                {isBusy ? (
                  <>
                    <div className="w-4 h-4 border-2 border-slate-950 border-t-transparent rounded-full animate-spin" />
                    <span>Processing...</span>
                  </>
                ) : mode === 'register' ? (
                  <>
                    <UserPlus className="w-4 h-4" />
                    <span>Create Account</span>
                  </>
                ) : (
                  <>
                    <LogIn className="w-4 h-4" />
                    <span>Sign In</span>
                  </>
                )}
              </button>
            </form>
          )}

          {/* Form 2: Forgot Password */}
          {mode === 'forgot_password' && (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Username or Verified Recovery Email
                </label>
                <input
                  type="text"
                  required
                  disabled={isBusy}
                  value={resetIdentifier}
                  onChange={(e) => setResetIdentifier(e.target.value)}
                  placeholder="username or email@example.com"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isBusy || !resetIdentifier.trim()}
                className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <Mail className="w-4 h-4" />
                <span>Send Recovery Instructions</span>
              </button>

              <div className="flex items-center justify-between pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-slate-400 hover:text-white"
                >
                  &larr; Back to Sign In
                </button>
                <button
                  type="button"
                  onClick={() => setMode('reset_password')}
                  className="text-amber-400 hover:underline"
                >
                  Have a reset token?
                </button>
              </div>
            </form>
          )}

          {/* Form 3: Reset Password with Token */}
          {mode === 'reset_password' && (
            <form onSubmit={handleResetPassword} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  Reset Token
                </label>
                <input
                  type="text"
                  required
                  disabled={isBusy}
                  value={resetToken}
                  onChange={(e) => setResetToken(e.target.value)}
                  placeholder="Paste 64-character token from email"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-700 text-white text-sm font-mono focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider mb-2">
                  New Password
                </label>
                <input
                  type="password"
                  required
                  disabled={isBusy}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="At least 8 characters"
                  className="w-full px-4 py-3 rounded-2xl bg-slate-900/90 border border-slate-700 text-white text-sm focus:outline-none focus:border-amber-500 transition-colors"
                />
              </div>

              <button
                type="submit"
                disabled={isBusy || !resetToken.trim() || !newPassword}
                className="w-full py-3.5 px-4 rounded-2xl font-extrabold text-sm text-slate-950 bg-gradient-to-r from-amber-400 to-amber-500 hover:from-amber-300 hover:to-amber-400 shadow-lg shadow-amber-500/20 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center justify-center gap-2"
              >
                <KeyRound className="w-4 h-4" />
                <span>Update Password</span>
              </button>

              <div className="text-center pt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setMode('login')}
                  className="text-slate-400 hover:text-white"
                >
                  &larr; Back to Sign In
                </button>
              </div>
            </form>
          )}

          {/* Form 4: Wallet Connect */}
          {mode === 'wallet' && (
            <div className="space-y-3">
              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleConnectAndAuth('trust')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-700/80 hover:border-amber-500/50 hover:bg-slate-800/80 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-600/20 flex items-center justify-center text-blue-400">
                    <Shield className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">Trust Wallet</div>
                    <div className="text-xs text-slate-400">Solana SVM Extension / Mobile</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleConnectAndAuth('nightly')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-slate-700/80 hover:border-amber-500/50 hover:bg-slate-800/80 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-purple-600/20 flex items-center justify-center text-purple-400">
                    <Wallet className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">Nightly Wallet</div>
                    <div className="text-xs text-slate-400">Multi-chain Solana SVM</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
              </button>

              <button
                type="button"
                disabled={isBusy}
                onClick={() => handleConnectAndAuth('demo')}
                className="w-full flex items-center justify-between p-4 rounded-2xl bg-slate-900/80 border border-amber-500/30 hover:border-amber-500/60 hover:bg-slate-800/80 transition-all text-left group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-400">
                    <KeyRound className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-white">Sandbox Demo Wallet</div>
                    <div className="text-xs text-amber-300/70">Local keypair sandbox for testing</div>
                  </div>
                </div>
                <ArrowRight className="w-4 h-4 text-slate-500 group-hover:text-amber-400 transition-colors" />
              </button>
            </div>
          )}
        </div>
      </main>

      {/* Footer Legal & Security */}
      <footer className="w-full border-t border-slate-800/80 bg-[#070b14]/80 px-6 py-4 text-center text-xs text-slate-500">
        Social.wtf Cookie Chain SVM Platform &bull; Account-First Private Social Architecture
      </footer>
    </div>
  );
};
