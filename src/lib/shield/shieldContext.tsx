'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Post } from '@/types';
import { EphemeralVerificationProof } from '../verification/verifier';

interface ShieldContextType {
  isAgeVerified: boolean;
  unshieldedMode: boolean;
  verificationProof: EphemeralVerificationProof | null;
  setVerification: (proof: EphemeralVerificationProof) => void;
  toggleUnshieldedMode: () => void;
  filterFeedPosts: (posts: Post[]) => Post[];
  revokeVerification: () => void;
  shieldStats: {
    totalShieldedHidden: number;
    unshieldedVisible: boolean;
  };
}

const ShieldContext = createContext<ShieldContextType | undefined>(undefined);

const STORAGE_KEY_PROOF = 'social_wtf_age_proof';
const STORAGE_KEY_UNSHIELD = 'social_wtf_unshield_active';

export const ShieldProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isAgeVerified, setIsAgeVerified] = useState(false);
  const [unshieldedMode, setUnshieldedMode] = useState(false);
  const [verificationProof, setVerificationProof] =
    useState<EphemeralVerificationProof | null>(null);

  // Restore session proof if still valid
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = sessionStorage.getItem(STORAGE_KEY_PROOF);
      if (stored) {
        try {
          const parsed: EphemeralVerificationProof = JSON.parse(stored);
          if (parsed.expiresAt > Date.now()) {
            setIsAgeVerified(true);
            setVerificationProof(parsed);
            const pref = sessionStorage.getItem(STORAGE_KEY_UNSHIELD) === 'true';
            setUnshieldedMode(pref);
          } else {
            sessionStorage.removeItem(STORAGE_KEY_PROOF);
          }
        } catch (e) {
          console.error(e);
        }
      }
    }
  }, []);

  const setVerification = (proof: EphemeralVerificationProof) => {
    setIsAgeVerified(true);
    setUnshieldedMode(true); // default to true once verified
    setVerificationProof(proof);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_PROOF, JSON.stringify(proof));
      sessionStorage.setItem(STORAGE_KEY_UNSHIELD, 'true');
    }
  };

  const toggleUnshieldedMode = () => {
    if (!isAgeVerified) return;
    setUnshieldedMode((prev) => {
      const next = !prev;
      sessionStorage.setItem(STORAGE_KEY_UNSHIELD, String(next));
      return next;
    });
  };

  const revokeVerification = () => {
    setIsAgeVerified(false);
    setUnshieldedMode(false);
    setVerificationProof(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY_PROOF);
      sessionStorage.removeItem(STORAGE_KEY_UNSHIELD);
    }
  };

  /**
   * Complete Invisible Shielding:
   * Conceals restricted content invisibly from unverified feeds,
   * ensuring NOT A HINT of its availability is shown to underage or unverified users.
   */
  const filterFeedPosts = (posts: Post[]): Post[] => {
    if (isAgeVerified && unshieldedMode) {
      return posts;
    }
    // Zero-trace shielding: Completely omit all shielded posts
    return posts.filter((post) => !post.isShielded);
  };

  return (
    <ShieldContext.Provider
      value={{
        isAgeVerified,
        unshieldedMode,
        verificationProof,
        setVerification,
        toggleUnshieldedMode,
        filterFeedPosts,
        revokeVerification,
        shieldStats: {
          totalShieldedHidden: isAgeVerified && unshieldedMode ? 0 : 2,
          unshieldedVisible: isAgeVerified && unshieldedMode,
        },
      }}
    >
      {children}
    </ShieldContext.Provider>
  );
};

export const useShield = () => {
  const context = useContext(ShieldContext);
  if (!context) {
    throw new Error('useShield must be used within a ShieldProvider');
  }
  return context;
};
