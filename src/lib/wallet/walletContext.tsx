'use client';

import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
} from 'react';
import { PublicKey, LAMPORTS_PER_SOL, Keypair } from '@solana/web3.js';
import { ed25519 } from '@noble/curves/ed25519';
import bs58 from 'bs58';
import {
  COOKIE_CHAIN_CONFIG,
  getCookieConnection,
} from '../solana/cookieChain';

export interface AuthenticatedAccount {
  accountId: string;
  username: string;
  status: string;
  createdAt?: number;
  primaryWalletAddress?: string;
  recoveryEmail?: string;
  recoveryEmailVerifiedAt?: number;
}

export function getTrustWalletProvider() {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  const provider = win.trustwallet?.solana || win.trustWallet?.solana;
  if (
    provider &&
    typeof provider.connect === 'function' &&
    typeof provider.signMessage === 'function'
  ) {
    return provider;
  }
  if (
    win.solana?.isTrust &&
    typeof win.solana.connect === 'function' &&
    typeof win.solana.signMessage === 'function'
  ) {
    return win.solana;
  }
  return null;
}

export function getNightlyProvider() {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  const provider = win.nightly?.solana || (win.nightly?.connect ? win.nightly : null);
  if (
    provider &&
    typeof provider.connect === 'function' &&
    typeof provider.signMessage === 'function'
  ) {
    return provider;
  }
  return null;
}

export function getSolanaProvider() {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  if (win.phantom?.solana?.isPhantom) return win.phantom.solana;
  if (win.solana && !win.solana.isTrust) return win.solana;
  if (win.solana) return win.solana;
  return null;
}

export function classifyWalletError(providerErr: any, walletName: string): Error {
  const msg = providerErr?.message || (typeof providerErr === 'string' ? providerErr : '');
  const code = providerErr?.code;

  if (
    code === 4001 ||
    /user rejected|user canceled|cancelled|rejected by user/i.test(msg)
  ) {
    return new Error(`${walletName} connection request was rejected.`);
  }

  if (
    /broadcast channel|channel closed|disconnected port|port closed|extension context invalidated/i.test(msg)
  ) {
    return new Error(
      `${walletName} lost communication with this page. Reopen or unlock ${walletName}, then try Connect again.`
    );
  }

  if (/not found|not detected|missing provider/i.test(msg)) {
    return new Error(`${walletName} was not detected. Please install or enable the extension.`);
  }

  return new Error(msg || `Failed to connect to ${walletName}.`);
}

export interface WalletContextType {
  connected: boolean;
  connecting: boolean;
  walletAddress: string | null;
  publicKey: PublicKey | null;
  cookBalance: number;
  walletType: 'trust' | 'nightly' | 'solana' | 'demo' | null;
  isNightlyInstalled: boolean;
  isTrustWalletInstalled: boolean;
  isServerSignerConfigured: boolean;
  serverSignerAddress: string | null;
  sessionToken: string | null;
  sessionScope: 'admin' | 'user' | null;
  isOwner: boolean;
  isAuthenticated: boolean;
  authenticating: boolean;
  authStatus: 'unknown' | 'authenticated' | 'unauthenticated';
  account: AuthenticatedAccount | null;
  roles: string[];
  capabilities: string[];
  refreshAccountAuth: () => Promise<boolean>;
  connect: (type?: 'trust' | 'nightly' | 'solana' | 'demo') => Promise<void>;
  disconnect: () => Promise<void>;
  refreshBalance: () => Promise<void>;
  signAndSendTransaction: (transaction: any) => Promise<string>;
  authenticateWallet: () => Promise<boolean>;
  logoutSession: () => Promise<void>;
  networkName: string;
}

const WalletContext = createContext<WalletContextType | undefined>(undefined);

// Storage keys
const DEMO_WALLET_STORAGE_KEY = 'social_wtf_demo_wallet';
const DEMO_WALLET_SECRET_KEY = 'social_wtf_demo_secret';
const WALLET_CONNECTED_KEY = 'social_wtf_wallet_connected';
const SESSION_TOKEN_STORAGE_KEY = 'social_wtf_session_token';

export const WalletProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [connected, setConnected] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [walletAddress, setWalletAddress] = useState<string | null>(null);
  const [publicKey, setPublicKey] = useState<PublicKey | null>(null);
  const [cookBalance, setCookBalance] = useState<number>(0);
  const [walletType, setWalletType] = useState<'trust' | 'nightly' | 'solana' | 'demo' | null>(
    null
  );
  const [isNightlyInstalled, setIsNightlyInstalled] = useState(false);
  const [isTrustWalletInstalled, setIsTrustWalletInstalled] = useState(false);
  const [isServerSignerConfiguredState, setIsServerSignerConfiguredState] = useState(false);
  const [serverSignerAddress, setServerSignerAddress] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [sessionScope, setSessionScope] = useState<'admin' | 'user' | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [authenticating, setAuthenticating] = useState(false);
  const [authStatus, setAuthStatus] = useState<'unknown' | 'authenticated' | 'unauthenticated'>('unauthenticated');
  const [account, setAccount] = useState<AuthenticatedAccount | null>(null);
  const [roles, setRoles] = useState<string[]>([]);
  const [capabilities, setCapabilities] = useState<string[]>([]);

  const isOwner = sessionScope === 'admin';

  // Check if Web3 providers (Nightly, Trust Wallet) and Server Signer are available
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const checkProviders = () => {
        const nightly = (window as any)?.nightly?.solana || (window as any)?.nightly;
        setIsNightlyInstalled(!!nightly);
        const trust = getTrustWalletProvider();
        setIsTrustWalletInstalled(!!trust);
      };
      checkProviders();
      window.addEventListener('load', checkProviders);

      // Check if server-side signer private key is configured
      fetch('/api/transactions/execute')
        .then((res) => res.json())
        .then((data) => {
          if (data.isConfigured) {
            setIsServerSignerConfiguredState(true);
            setServerSignerAddress(data.signerAddress);
          }
        })
        .catch(() => {});

      return () => window.removeEventListener('load', checkProviders);
    }
  }, []);

  // Synchronize authoritative account authentication from server using cookies
  const refreshAccountAuth = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch('/api/auth/me', {
        method: 'GET',
        headers: { 'Content-Type': 'application/json' },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.account) {
          setAccount(data.account);
          const accountRoles = data.roles || ['ROLE_USER'];
          setRoles(accountRoles);
          setCapabilities(data.capabilities || []);
          const isAdmin = accountRoles.includes('ROLE_ADMIN') || accountRoles.includes('ROLE_PLATFORM_OWNER');
          setSessionScope(isAdmin ? 'admin' : 'user');
          setIsAuthenticated(true);
          setAuthStatus('authenticated');
          return true;
        }
      }

      setAccount(null);
      setRoles([]);
      setCapabilities([]);
      setIsAuthenticated(false);
      setSessionScope(null);
      setAuthStatus('unauthenticated');
      return false;
    } catch (err) {
      console.warn('Session introspection failed:', err);
      setAccount(null);
      setRoles([]);
      setCapabilities([]);
      setIsAuthenticated(false);
      setSessionScope(null);
      setAuthStatus('unauthenticated');
      return false;
    }
  }, []);

  // Introspect active session on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    refreshAccountAuth();
  }, [refreshAccountAuth]);

  // Fetch balance from Cookie Chain RPC
  const refreshBalance = useCallback(async () => {
    if (!publicKey) return;

    try {
      const connection = getCookieConnection();
      const balanceLamports = await connection.getBalance(publicKey, 'confirmed');
      setCookBalance(balanceLamports / LAMPORTS_PER_SOL);
    } catch (err) {
      console.warn('Could not fetch Cookie Chain balance, using fallback:', err);
      if (walletType === 'demo') {
        const stored = localStorage.getItem('social_wtf_demo_balance');
        setCookBalance(stored ? parseFloat(stored) : 88.50);
      }
    }
  }, [publicKey, walletType]);

  useEffect(() => {
    if (connected && publicKey) {
      refreshBalance();
      const interval = setInterval(refreshBalance, 8000);
      return () => clearInterval(interval);
    }
  }, [connected, publicKey, refreshBalance]);

  // Local session invalidation helper (fails closed immediately)
  const invalidateAuthSessionLocally = useCallback(() => {
    setIsAuthenticated(false);
    setAuthStatus('unauthenticated');
    setAccount(null);
    setRoles([]);
    setCapabilities([]);
    setSessionToken(null);
    setSessionScope(null);
  }, []);

  // Local wallet state reset helper (clears ONLY wallet, leaves account session intact)
  const clearWalletState = useCallback(() => {
    setConnected(false);
    setWalletAddress(null);
    setPublicKey(null);
    setCookBalance(0);
    setWalletType(null);
    if (typeof window !== 'undefined') {
      localStorage.removeItem(WALLET_CONNECTED_KEY);
    }
  }, []);

  // Revoke session (logout) - calls API and always clears auth state
  const logoutSession = useCallback(async () => {
    try {
      await fetch('/api/auth/logout', {
        method: 'POST',
      });
    } catch (err) {
      console.warn('Error during session logout:', err);
    } finally {
      invalidateAuthSessionLocally();
      clearWalletState();
    }
  }, [invalidateAuthSessionLocally, clearWalletState]);

  // Wallet disconnect handler (clears wallet connection without logging out the account)
  const disconnect = useCallback(async () => {
    clearWalletState();
  }, [clearWalletState]);

  // Manage provider event listeners (account change, disconnect)
  useEffect(() => {
    if (!connected || !walletType || walletType === 'demo' || typeof window === 'undefined') {
      return;
    }

    let activeProvider: any = null;
    if (walletType === 'trust') activeProvider = getTrustWalletProvider();
    else if (walletType === 'nightly') activeProvider = getNightlyProvider();
    else if (walletType === 'solana') activeProvider = getSolanaProvider();

    if (!activeProvider) return;

    const handleAccountChanged = (newAccount: any) => {
      if (!newAccount) {
        clearWalletState();
        return;
      }

      const newKeyCandidate =
        typeof newAccount === 'string'
          ? newAccount
          : newAccount?.publicKey?.toString() || newAccount?.toString?.();

      if (!newKeyCandidate || newKeyCandidate === '[object Object]') {
        clearWalletState();
        return;
      }

      try {
        const validatedPk = new PublicKey(newKeyCandidate);
        const validatedStr = validatedPk.toBase58();

        if (validatedStr === walletAddress) {
          return;
        }

        setPublicKey(validatedPk);
        setWalletAddress(validatedStr);
      } catch {
        clearWalletState();
      }
    };

    const handleDisconnect = () => {
      clearWalletState();
    };

    const hasOn = typeof activeProvider.on === 'function';
    const hasRemoveListener = typeof activeProvider.removeListener === 'function';
    const hasOff = typeof activeProvider.off === 'function';

    if (hasOn) {
      try {
        activeProvider.on('accountChanged', handleAccountChanged);
        activeProvider.on('disconnect', handleDisconnect);
      } catch (e) {
        console.warn('Failed to attach wallet event listeners:', e);
      }
    }

    return () => {
      if (activeProvider) {
        try {
          if (hasRemoveListener) {
            activeProvider.removeListener('accountChanged', handleAccountChanged);
            activeProvider.removeListener('disconnect', handleDisconnect);
          } else if (hasOff) {
            activeProvider.off('accountChanged', handleAccountChanged);
            activeProvider.off('disconnect', handleDisconnect);
          }
        } catch (e) {
          console.warn('Failed to remove wallet event listeners:', e);
        }
      }
    };
  }, [connected, walletType, walletAddress, clearWalletState]);

  // Connect handler supporting Trust Wallet, Nightly, general Solana, and Demo Web3 wallet
  const connect = async (type: 'trust' | 'nightly' | 'solana' | 'demo' = 'trust') => {
    setConnecting(true);
    try {
      if (typeof window === 'undefined') return;

      if (type === 'trust') {
        const trust = getTrustWalletProvider();
        if (!trust) {
          if (typeof window !== 'undefined') {
            window.open('https://trustwallet.com/browser-extension', '_blank');
          }
          throw new Error('Trust Wallet not detected. Please install Trust Wallet or open in Trust Wallet App.');
        }

        try {
          const resp = await trust.connect();
          const pubkeyCandidate =
            resp?.publicKey?.toString() ||
            trust.publicKey?.toString() ||
            trust.account?.address?.toString();

          if (!pubkeyCandidate || typeof pubkeyCandidate !== 'string') {
            throw new Error('Trust Wallet did not return a valid account address.');
          }

          let pk: PublicKey;
          try {
            pk = new PublicKey(pubkeyCandidate);
          } catch {
            throw new Error('Trust Wallet returned an invalid Solana public key.');
          }

          const pubkeyStr = pk.toBase58();

          setPublicKey(pk);
          setWalletAddress(pubkeyStr);
          setWalletType('trust');
          setConnected(true);
          localStorage.setItem(WALLET_CONNECTED_KEY, 'trust');
          return;
        } catch (providerErr: any) {
          clearWalletState();
          throw classifyWalletError(providerErr, 'Trust Wallet');
        }
      } else if (type === 'nightly') {
        const nightly = getNightlyProvider();
        if (!nightly) {
          if (typeof window !== 'undefined') {
            window.open('https://nightly.app/', '_blank');
          }
          throw new Error('Nightly Wallet not detected. Please install Nightly Wallet.');
        }

        try {
          const resp = await nightly.connect();
          const pubkeyCandidate = resp?.publicKey?.toString() || nightly.publicKey?.toString();

          if (!pubkeyCandidate || typeof pubkeyCandidate !== 'string') {
            throw new Error('Nightly Wallet did not return a valid account address.');
          }

          let pk: PublicKey;
          try {
            pk = new PublicKey(pubkeyCandidate);
          } catch {
            throw new Error('Nightly Wallet returned an invalid Solana public key.');
          }

          const pubkeyStr = pk.toBase58();

          setPublicKey(pk);
          setWalletAddress(pubkeyStr);
          setWalletType('nightly');
          setConnected(true);
          localStorage.setItem(WALLET_CONNECTED_KEY, 'nightly');
          return;
        } catch (providerErr: any) {
          clearWalletState();
          throw classifyWalletError(providerErr, 'Nightly Wallet');
        }
      } else if (type === 'solana') {
        const solana = getSolanaProvider();
        if (!solana) {
          if (typeof window !== 'undefined') {
            window.open('https://phantom.app/', '_blank');
          }
          throw new Error('Solana Wallet not detected. Please install Phantom, Trust, or Nightly Wallet.');
        }

        try {
          const resp = await solana.connect();
          const pubkeyCandidate = resp?.publicKey?.toString() || solana.publicKey?.toString();

          if (!pubkeyCandidate || typeof pubkeyCandidate !== 'string') {
            throw new Error('Solana Wallet did not return a valid account address.');
          }

          let pk: PublicKey;
          try {
            pk = new PublicKey(pubkeyCandidate);
          } catch {
            throw new Error('Solana Wallet returned an invalid Solana public key.');
          }

          const pubkeyStr = pk.toBase58();

          setPublicKey(pk);
          setWalletAddress(pubkeyStr);
          setWalletType('solana');
          setConnected(true);
          localStorage.setItem(WALLET_CONNECTED_KEY, 'solana');
          return;
        } catch (providerErr: any) {
          clearWalletState();
          throw classifyWalletError(providerErr, 'Solana Wallet');
        }
      } else if (type === 'demo') {
        let demoPubkeyStr = localStorage.getItem(DEMO_WALLET_STORAGE_KEY);
        let demoSecretStr = localStorage.getItem(DEMO_WALLET_SECRET_KEY);

        let keypair: Keypair;
        if (demoPubkeyStr && demoSecretStr) {
          try {
            const secretBytes = bs58.decode(demoSecretStr);
            keypair = Keypair.fromSecretKey(secretBytes);
          } catch {
            keypair = Keypair.generate();
            demoPubkeyStr = keypair.publicKey.toBase58();
            demoSecretStr = bs58.encode(keypair.secretKey);
            localStorage.setItem(DEMO_WALLET_STORAGE_KEY, demoPubkeyStr);
            localStorage.setItem(DEMO_WALLET_SECRET_KEY, demoSecretStr);
          }
        } else {
          keypair = Keypair.generate();
          demoPubkeyStr = keypair.publicKey.toBase58();
          demoSecretStr = bs58.encode(keypair.secretKey);
          localStorage.setItem(DEMO_WALLET_STORAGE_KEY, demoPubkeyStr);
          localStorage.setItem(DEMO_WALLET_SECRET_KEY, demoSecretStr);
        }

        setPublicKey(keypair.publicKey);
        setWalletAddress(demoPubkeyStr);
        setWalletType('demo');
        setConnected(true);
        localStorage.setItem(WALLET_CONNECTED_KEY, 'demo');

        const storedBalance = localStorage.getItem('social_wtf_demo_balance');
        setCookBalance(storedBalance ? parseFloat(storedBalance) : 88.50);
      }
    } finally {
      setConnecting(false);
    }
  };

  // SIWS wallet binding / challenge authentication
  const authenticateWallet = async (): Promise<boolean> => {
    if (!walletAddress) {
      throw new Error('Please connect your wallet before authenticating.');
    }

    setAuthenticating(true);
    try {
      const challengeRes = await fetch('/api/auth/wallet/challenge', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ walletAddress }),
      });

      if (!challengeRes.ok) {
        throw new Error('Failed to request wallet challenge from server.');
      }

      const challengeData = await challengeRes.json();
      const { nonce, message } = challengeData;
      if (!nonce || !message) {
        throw new Error('Malformed challenge received from server.');
      }

      let signatureBase58: string;
      const encodedMsg = new TextEncoder().encode(message);

      if (walletType === 'demo') {
        const secretStr = localStorage.getItem(DEMO_WALLET_SECRET_KEY);
        if (!secretStr) throw new Error('Demo private key missing from storage.');
        const secretBytes = bs58.decode(secretStr);
        const kp = Keypair.fromSecretKey(secretBytes);
        const sig = ed25519.sign(encodedMsg, kp.secretKey.slice(0, 32));
        signatureBase58 = bs58.encode(sig);
      } else {
        let provider: any = null;
        if (walletType === 'trust') provider = getTrustWalletProvider();
        else if (walletType === 'nightly') provider = getNightlyProvider();
        else if (walletType === 'solana') provider = getSolanaProvider();

        if (!provider || typeof provider.signMessage !== 'function') {
          throw new Error('Active wallet does not support cryptographic message signing.');
        }

        const signResult = await provider.signMessage(encodedMsg, 'utf8');
        const rawSig = signResult?.signature || signResult;
        if (typeof rawSig === 'string') {
          signatureBase58 = rawSig;
        } else if (rawSig instanceof Uint8Array || Array.isArray(rawSig)) {
          signatureBase58 = bs58.encode(Uint8Array.from(rawSig));
        } else {
          throw new Error('Unexpected signature format returned by wallet.');
        }
      }

      const bindRes = await fetch('/api/auth/wallet/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          nonce,
          signatureBase58,
        }),
      });

      if (!bindRes.ok) {
        const errData = await bindRes.json().catch(() => ({}));
        throw new Error(errData.message || 'Server rejected wallet challenge signature.');
      }

      await refreshAccountAuth();
      return true;
    } finally {
      setAuthenticating(false);
    }
  };

  // Sign and send transaction helper
  const signAndSendTransaction = async (transaction: any): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected.');
    }

    if (walletType === 'demo') {
      const secretStr = localStorage.getItem(DEMO_WALLET_SECRET_KEY);
      if (!secretStr) throw new Error('Demo wallet secret missing.');
      const secretBytes = bs58.decode(secretStr);
      const kp = Keypair.fromSecretKey(secretBytes);
      transaction.sign([kp]);
      const connection = getCookieConnection();
      return await connection.sendRawTransaction(transaction.serialize(), {
        skipPreflight: false,
        preflightCommitment: 'confirmed',
      });
    }

    let provider: any = null;
    if (walletType === 'trust') provider = getTrustWalletProvider();
    else if (walletType === 'nightly') provider = getNightlyProvider();
    else if (walletType === 'solana') provider = getSolanaProvider();

    if (!provider || typeof provider.signAndSendTransaction !== 'function') {
      throw new Error('Wallet provider does not support signAndSendTransaction.');
    }

    const res = await provider.signAndSendTransaction(transaction);
    return res?.signature || res;
  };

  return (
    <WalletContext.Provider
      value={{
        connected,
        connecting,
        walletAddress,
        publicKey,
        cookBalance,
        walletType,
        isNightlyInstalled,
        isTrustWalletInstalled,
        isServerSignerConfigured: isServerSignerConfiguredState,
        serverSignerAddress,
        sessionToken,
        sessionScope,
        isOwner,
        isAuthenticated,
        authenticating,
        authStatus,
        account,
        roles,
        capabilities,
        refreshAccountAuth,
        connect,
        disconnect,
        refreshBalance,
        signAndSendTransaction,
        authenticateWallet,
        logoutSession,
        networkName: COOKIE_CHAIN_CONFIG.chainName,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
};

export const useWallet = (): WalletContextType => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
