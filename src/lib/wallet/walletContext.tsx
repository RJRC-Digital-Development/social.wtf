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

export function getTrustWalletProvider() {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  if (win.trustwallet?.solana) return win.trustwallet.solana;
  if (win.trustWallet?.solana) return win.trustWallet.solana;
  if (win.trustwallet && typeof win.trustwallet.signMessage === 'function') return win.trustwallet;
  if (win.solana?.isTrust) return win.solana;
  return null;
}

export function getNightlyProvider() {
  if (typeof window === 'undefined') return null;
  const win = window as any;
  if (win.nightly?.solana) return win.nightly.solana;
  if (win.nightly && typeof win.nightly.connect === 'function') return win.nightly;
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

  // Introspect active session on mount
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const introspectSession = async () => {
      try {
        const storedToken = localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
        const headers: Record<string, string> = {};
        if (storedToken) {
          headers['Authorization'] = `Bearer ${storedToken}`;
        }
        const res = await fetch('/api/auth/session', {
          method: 'GET',
          headers,
        });
        if (res.ok) {
          const data = await res.json();
          if (data.authenticated) {
            setIsAuthenticated(true);
            if (data.scope) {
              setSessionScope(data.scope);
            }
            if (storedToken) setSessionToken(storedToken);
          }
        } else {
          localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
          setIsAuthenticated(false);
          setSessionToken(null);
          setSessionScope(null);
        }
      } catch {
        // Silently ignore network errors during background introspection
      }
    };
    introspectSession();
  }, []);

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

  // Connect handler supporting Trust Wallet, Nightly, general Solana, and Demo Web3 wallet
  const connect = async (type: 'trust' | 'nightly' | 'solana' | 'demo' = 'trust') => {
    setConnecting(true);
    try {
      if (typeof window === 'undefined') return;

      const trust = getTrustWalletProvider();
      const nightly = (window as any)?.nightly?.solana || (window as any)?.nightly;
      const solana = (window as any)?.solana;

      if (type === 'trust') {
        const trust = getTrustWalletProvider();
        if (trust) {
          try {
            const resp = await trust.connect();
            const pubkeyStr = resp?.publicKey?.toString() || trust.publicKey?.toString() || trust.account?.address?.toString();
            if (pubkeyStr) {
              const pk = new PublicKey(pubkeyStr);
              setPublicKey(pk);
              setWalletAddress(pubkeyStr);
              setWalletType('trust');
              setConnected(true);
              localStorage.setItem(WALLET_CONNECTED_KEY, 'trust');
              return;
            }
          } catch (providerErr: any) {
            const fallbackKey = trust.publicKey?.toString() || trust.account?.address?.toString();
            if (fallbackKey) {
              const pk = new PublicKey(fallbackKey);
              setPublicKey(pk);
              setWalletAddress(fallbackKey);
              setWalletType('trust');
              setConnected(true);
              localStorage.setItem(WALLET_CONNECTED_KEY, 'trust');
              return;
            }
            if (providerErr?.message?.includes('Broadcast channel')) {
              throw new Error('Trust Wallet communication lost. Please reload the page or re-open Trust Wallet.');
            }
            throw new Error(providerErr?.message || 'Failed to connect to Trust Wallet.');
          }
        } else {
          if (typeof window !== 'undefined') {
            window.open('https://trustwallet.com/browser-extension', '_blank');
          }
          throw new Error('Trust Wallet not detected. Please install Trust Wallet or open in Trust Wallet App.');
        }
      } else if (type === 'nightly') {
        const nightly = getNightlyProvider();
        if (nightly) {
          try {
            const resp = await nightly.connect();
            const pubkeyStr = resp?.publicKey?.toString() || nightly.publicKey?.toString();
            if (pubkeyStr) {
              const pk = new PublicKey(pubkeyStr);
              setPublicKey(pk);
              setWalletAddress(pubkeyStr);
              setWalletType('nightly');
              setConnected(true);
              localStorage.setItem(WALLET_CONNECTED_KEY, 'nightly');
              return;
            }
          } catch (providerErr: any) {
            const fallbackKey = nightly.publicKey?.toString();
            if (fallbackKey) {
              const pk = new PublicKey(fallbackKey);
              setPublicKey(pk);
              setWalletAddress(fallbackKey);
              setWalletType('nightly');
              setConnected(true);
              localStorage.setItem(WALLET_CONNECTED_KEY, 'nightly');
              return;
            }
            throw new Error(providerErr?.message || 'Failed to connect to Nightly Wallet.');
          }
        } else {
          if (typeof window !== 'undefined') {
            window.open('https://nightly.app/', '_blank');
          }
          throw new Error('Nightly Wallet not detected. Please install Nightly Wallet.');
        }
      } else if (type === 'solana') {
        const solana = getSolanaProvider();
        if (solana) {
          try {
            const resp = await solana.connect();
            const pubkeyStr = resp?.publicKey?.toString() || solana.publicKey?.toString();
            if (pubkeyStr) {
              const pk = new PublicKey(pubkeyStr);
              setPublicKey(pk);
              setWalletAddress(pubkeyStr);
              setWalletType('solana');
              setConnected(true);
              localStorage.setItem(WALLET_CONNECTED_KEY, 'solana');
              return;
            }
          } catch (providerErr: any) {
            const fallbackKey = solana.publicKey?.toString();
            if (fallbackKey) {
              const pk = new PublicKey(fallbackKey);
              setPublicKey(pk);
              setWalletAddress(fallbackKey);
              setWalletType('solana');
              setConnected(true);
              localStorage.setItem(WALLET_CONNECTED_KEY, 'solana');
              return;
            }
            if (providerErr?.message?.includes('Broadcast channel')) {
              throw new Error('Wallet communication unavailable. Please reload the page or unlock your wallet extension.');
            }
            throw new Error(providerErr?.message || 'Failed to connect to Solana wallet extension.');
          }
        } else {
          if (typeof window !== 'undefined') {
            window.open('https://phantom.app/', '_blank');
          }
          throw new Error('No Solana wallet detected. Please install Phantom or Nightly.');
        }
      }

      // Demo/Instant Web3 Cookie Chain Wallet (deterministic Keypair)
      let storedDemo = localStorage.getItem(DEMO_WALLET_STORAGE_KEY);
      let storedSecret = localStorage.getItem(DEMO_WALLET_SECRET_KEY);

      if (!storedDemo || !storedSecret) {
        const kp = Keypair.generate();
        storedDemo = kp.publicKey.toBase58();
        storedSecret = JSON.stringify(Array.from(kp.secretKey));
        localStorage.setItem(DEMO_WALLET_STORAGE_KEY, storedDemo);
        localStorage.setItem(DEMO_WALLET_SECRET_KEY, storedSecret);
        localStorage.setItem('social_wtf_demo_balance', '88.50');
      }

      const pk = new PublicKey(storedDemo);
      setWalletAddress(storedDemo);
      setPublicKey(pk);
      setWalletType('demo');
      setCookBalance(parseFloat(localStorage.getItem('social_wtf_demo_balance') || '88.50'));
      setConnected(true);
      localStorage.setItem(WALLET_CONNECTED_KEY, 'demo');
    } catch (err: any) {
      console.error('Wallet connection error:', err);
      throw err;
    } finally {
      setConnecting(false);
    }
  };

  // Authenticate session via cryptographic challenge (SIWS)
  const authenticateWallet = useCallback(async (): Promise<boolean> => {
    if (!walletAddress || !publicKey) {
      throw new Error('Wallet must be connected before authenticating session');
    }

    setAuthenticating(true);
    try {
      // 1. Request challenge nonce
      const nonceRes = await fetch(
        `/api/auth/nonce?walletAddress=${encodeURIComponent(walletAddress)}`
      );
      if (!nonceRes.ok) {
        throw new Error('Failed to obtain challenge nonce from authentication server');
      }
      const challengeData = await nonceRes.json();
      const challengeMessage: string = challengeData.message;
      const nonce: string = challengeData.nonce;

      const messageBytes = new TextEncoder().encode(challengeMessage);
      let signatureBase58 = '';

      // 2. Sign challenge message using wallet
      if (walletType === 'trust') {
        const trust = getTrustWalletProvider();
        if (!trust?.signMessage) {
          throw new Error('Trust Wallet does not support message signing');
        }
        const signed = await (trust.signMessage(messageBytes, 'utf8') || trust.signMessage(messageBytes));
        const sigBytes: Uint8Array = signed.signature || signed;
        signatureBase58 = bs58.encode(sigBytes);
      } else if (walletType === 'nightly') {
        const nightly = (window as any)?.nightly?.solana || (window as any)?.nightly;
        if (!nightly?.signMessage) {
          throw new Error('Nightly wallet does not support message signing');
        }
        const signed = await nightly.signMessage(messageBytes);
        const sigBytes: Uint8Array = signed.signature || signed;
        signatureBase58 = bs58.encode(sigBytes);
      } else if (walletType === 'solana') {
        const solana = (window as any)?.solana;
        if (!solana?.signMessage) {
          throw new Error('Solana wallet does not support message signing');
        }
        const signed = await solana.signMessage(messageBytes, 'utf8');
        const sigBytes: Uint8Array = signed.signature || signed;
        signatureBase58 = bs58.encode(sigBytes);
      } else if (walletType === 'demo') {
        // Sign using local demo keypair secret
        const storedSecret = localStorage.getItem(DEMO_WALLET_SECRET_KEY);
        if (!storedSecret) {
          throw new Error('Demo wallet secret key not found in storage');
        }
        const secretBytes = new Uint8Array(JSON.parse(storedSecret));
        const sigBytes = ed25519.sign(messageBytes, secretBytes.slice(0, 32));
        signatureBase58 = bs58.encode(sigBytes);
      } else {
        throw new Error('Unsupported wallet provider for SIWS authentication');
      }

      // 3. Post to /api/auth/verify to obtain signed session token & HttpOnly cookie
      const verifyRes = await fetch('/api/auth/verify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          walletAddress,
          nonce,
          signatureBase58,
        }),
      });

      if (!verifyRes.ok) {
        const errData = await verifyRes.json().catch(() => ({}));
        throw new Error(errData.error || 'Cryptographic verification failed');
      }

      const verifyData = await verifyRes.json();
      if (verifyData.verified && verifyData.sessionToken) {
        setSessionToken(verifyData.sessionToken);
        setSessionScope(verifyData.scope === 'admin' ? 'admin' : 'user');
        setIsAuthenticated(true);
        localStorage.setItem(SESSION_TOKEN_STORAGE_KEY, verifyData.sessionToken);
        return true;
      }

      return false;
    } finally {
      setAuthenticating(false);
    }
  }, [walletAddress, publicKey, walletType]);

  // Revoke session (logout)
  const logoutSession = useCallback(async () => {
    try {
      const storedToken = sessionToken || localStorage.getItem(SESSION_TOKEN_STORAGE_KEY);
      await fetch('/api/auth/session', {
        method: 'DELETE',
        headers: storedToken ? { Authorization: `Bearer ${storedToken}` } : {},
      });
    } catch (err) {
      console.warn('Error during session logout:', err);
    } finally {
      setSessionToken(null);
      setSessionScope(null);
      setIsAuthenticated(false);
      localStorage.removeItem(SESSION_TOKEN_STORAGE_KEY);
    }
  }, [sessionToken]);

  const disconnect = useCallback(async () => {
    await logoutSession();
    setConnected(false);
    setWalletAddress(null);
    setPublicKey(null);
    setCookBalance(0);
    setWalletType(null);
    localStorage.removeItem(WALLET_CONNECTED_KEY);
  }, [logoutSession]);

  // Sign and send transaction to Cookie Chain RPC
  const signAndSendTransaction = async (tx: any): Promise<string> => {
    if (!connected || !publicKey) {
      throw new Error('Wallet not connected to Cookie Chain');
    }

    const trust = getTrustWalletProvider();
    const nightly = (window as any)?.nightly?.solana || (window as any)?.nightly;
    const solana = (window as any)?.solana;

    // 1. Trust Wallet native signing and broadcasting
    if (walletType === 'trust') {
      if (trust?.signAndSendTransaction) {
        const response = await trust.signAndSendTransaction(tx);
        return response.signature || response;
      } else if (trust?.signTransaction) {
        const signed = await trust.signTransaction(tx);
        const raw = signed.serialize
          ? signed.serialize().toString('base64')
          : Buffer.from(signed).toString('base64');
        const storedToken =
          sessionToken ||
          (typeof window !== 'undefined'
            ? localStorage.getItem(SESSION_TOKEN_STORAGE_KEY)
            : null);
        const res = await fetch('/api/transactions/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
          },
          body: JSON.stringify({ rawTransaction: raw }),
        });
        const data = await res.json();
        if (data.success && data.signature) {
          return data.signature;
        }
        if (!res.ok || data.error) {
          throw new Error(data.error || 'Failed to broadcast raw transaction');
        }
      }
    }

    // 2. Nightly Wallet
    if (walletType === 'nightly' && nightly?.signAndSendTransaction) {
      const response = await nightly.signAndSendTransaction(tx);
      return response.signature || response;
    }

    // 3. Solana / Phantom standard adapter
    if (walletType === 'solana' && solana?.signAndSendTransaction) {
      const response = await solana.signAndSendTransaction(tx);
      return response.signature || response;
    }

    // 4. Server Signer execution (via PLATFORM_PRIVATE_KEY env var)
    if (isServerSignerConfiguredState && (tx.to || tx.recipient)) {
      try {
        const storedToken = sessionToken || (typeof window !== 'undefined' ? localStorage.getItem(SESSION_TOKEN_STORAGE_KEY) : null);
        const res = await fetch('/api/transactions/execute', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(storedToken ? { Authorization: `Bearer ${storedToken}` } : {}),
          },
          body: JSON.stringify({
            recipientPublicKey: tx.to || tx.recipient,
            amountCook: typeof tx.amount === 'number' ? tx.amount : 0.5,
            action: tx.action || 'tip',
            memo: tx.memo || '',
          }),
        });
        const data = await res.json();
        if (data.success && data.signature) {
          return data.signature;
        }
      } catch (err) {
        console.warn('Server signer transaction execution failed, falling back:', err);
      }
    }

    // 5. Demo/Simulated SVM Mode: simulate real on-chain transaction hash
    await new Promise((resolve) => setTimeout(resolve, 1400));
    
    // Deduct simulated balance
    const currentBal = parseFloat(localStorage.getItem('social_wtf_demo_balance') || '88.50');
    const deductAmount = typeof tx?.amount === 'number' ? tx.amount : 0.5;
    const newBal = Math.max(0, currentBal - deductAmount);
    localStorage.setItem('social_wtf_demo_balance', newBal.toFixed(2));
    setCookBalance(newBal);

    // Realistic SVM tx signature
    const chars = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
    let mockSig = 'cook_tx_';
    for (let i = 0; i < 64; i++) {
      mockSig += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return mockSig;
  };

  // Auto-reconnect on mount if previously connected
  useEffect(() => {
    const prev = localStorage.getItem(WALLET_CONNECTED_KEY);
    if (prev === 'trust' || prev === 'nightly' || prev === 'solana' || prev === 'demo') {
      connect(prev).catch((err) => {
        console.warn('Auto-reconnect skipped:', err?.message || err);
        localStorage.removeItem(WALLET_CONNECTED_KEY);
      });
    }
  }, []);

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

export const useWallet = () => {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error('useWallet must be used within a WalletProvider');
  }
  return context;
};
