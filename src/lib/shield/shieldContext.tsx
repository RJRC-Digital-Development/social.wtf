'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Post } from '@/types';
import {
  CardAgeProof,
  EphemeralVerificationProof,
  IdProfileCredential,
  VideoVerificationProof,
} from '../verification/verifier';

interface ShieldContextType {
  isAgeVerified: boolean; // True if either video, card, or ID is verified
  isCardVerified: boolean; // Debit or Credit Card $0 age authorization verified
  isVideoVerified: boolean; // Live video liveness verified
  isIdVerified: boolean; // ID Front & Back uploaded into account profile or required for under-25
  isUnder25Flagged: boolean; // True if AI estimated age < 25, requiring Driver's License or ID
  isAdultContentUnlocked: boolean; // True when Card + Video + (ID if under 25) are satisfied
  canAccessAdultContent: boolean; // True when unlocked && unshieldedMode
  unshieldedMode: boolean;
  cardProof: CardAgeProof | null;
  videoProof: VideoVerificationProof | EphemeralVerificationProof | null;
  idCredential: IdProfileCredential | null;
  setCardVerification: (proof: CardAgeProof) => void;
  setVideoVerification: (proof: VideoVerificationProof | EphemeralVerificationProof) => void;
  setIdVerification: (cred: IdProfileCredential) => void;
  setVerification: (proof: EphemeralVerificationProof) => void; // Legacy support
  toggleUnshieldedMode: () => void;
  filterFeedPosts: (posts: Post[]) => Post[];
  revokeCardVerification: () => void;
  revokeVideoVerification: () => void;
  revokeIdVerification: () => void;
  revokeVerification: () => void;
  syncBackendAuthorization: () => Promise<void>;
  shieldStats: {
    totalShieldedHidden: number;
    unshieldedVisible: boolean;
  };
}

const ShieldContext = createContext<ShieldContextType | undefined>(undefined);

const STORAGE_KEY_CARD = 'social_wtf_card_proof';
const STORAGE_KEY_VIDEO = 'social_wtf_video_proof';
const STORAGE_KEY_ID = 'social_wtf_id_cred';
const STORAGE_KEY_UNSHIELD = 'social_wtf_unshield_active';

export const ShieldProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isCardVerified, setIsCardVerified] = useState(false);
  const [isVideoVerified, setIsVideoVerified] = useState(false);
  const [isIdVerified, setIsIdVerified] = useState(false);
  const [isUnder25FlaggedState, setIsUnder25FlaggedState] = useState(false);
  const [unshieldedMode, setUnshieldedMode] = useState(false);
  const [cardProof, setCardProof] = useState<CardAgeProof | null>(null);
  const [videoProof, setVideoProof] = useState<VideoVerificationProof | EphemeralVerificationProof | null>(null);
  const [idCredential, setIdCredential] = useState<IdProfileCredential | null>(null);

  /**
   * Synchronize client state with authoritative backend authorization claims
   */
  const syncBackendAuthorization = async () => {
    if (typeof window === 'undefined') return;
    try {
      const token = localStorage.getItem('social_wtf_session_token');
      if (!token) return;

      const res = await fetch('/api/auth/authorize', {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (res.ok) {
        const data = await res.json();
        if (data.authenticated && data.claims) {
          if (data.claims.isCardVerified) setIsCardVerified(true);
          if (data.claims.isVideoVerified) setIsVideoVerified(true);
          if (data.claims.isIdVerified) setIsIdVerified(true);
          if (data.claims.isUnder25Flagged !== undefined) {
            setIsUnder25FlaggedState(Boolean(data.claims.isUnder25Flagged));
          }
          if (data.claims.isAdultAuthorized) {
            setUnshieldedMode(true);
          }
        }
      }
    } catch {
      // Silently handle offline/network errors during background introspection
    }
  };

  // Restore session proofs if still valid & sync backend claims
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Check card verification proof
      const storedCard = sessionStorage.getItem(STORAGE_KEY_CARD);
      if (storedCard) {
        try {
          const parsed: CardAgeProof = JSON.parse(storedCard);
          if (parsed.verified) {
            setIsCardVerified(true);
            setCardProof(parsed);
          }
        } catch (e) {
          console.error(e);
        }
      }

      // 2. Check video verification proof
      const storedVideo = sessionStorage.getItem(STORAGE_KEY_VIDEO);
      if (storedVideo) {
        try {
          const parsed = JSON.parse(storedVideo);
          if (parsed.expiresAt > Date.now()) {
            setIsVideoVerified(true);
            setVideoProof(parsed);
            if (parsed.under25Flagged) {
              setIsUnder25FlaggedState(true);
            }
            const pref = sessionStorage.getItem(STORAGE_KEY_UNSHIELD) === 'true';
            setUnshieldedMode(pref);
          } else {
            sessionStorage.removeItem(STORAGE_KEY_VIDEO);
          }
        } catch (e) {
          console.error(e);
        }
      }

      // 3. Check ID credentials (stored in account profile or required for under-25)
      const storedId = sessionStorage.getItem(STORAGE_KEY_ID);
      if (storedId) {
        try {
          const parsed: IdProfileCredential = JSON.parse(storedId);
          if (parsed.verified) {
            setIsIdVerified(true);
            setIdCredential(parsed);
          }
        } catch (e) {
          console.error(e);
        }
      }

      // 4. Introspect backend authorization claims
      syncBackendAuthorization();
    }
  }, []);

  /**
   * Payment Card ($0 Authorization) Adulthood Verification
   */
  const setCardVerification = (proof: CardAgeProof) => {
    setIsCardVerified(true);
    setCardProof(proof);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_CARD, JSON.stringify(proof));
    }
    syncBackendAuthorization();
  };

  /**
   * Live Video Verification:
   * Biometric liveness check by AI agent with neural age estimation.
   */
  const setVideoVerification = (proof: VideoVerificationProof | EphemeralVerificationProof) => {
    setIsVideoVerified(true);
    setUnshieldedMode(true);
    setVideoProof(proof);
    if ('under25Flagged' in proof && proof.under25Flagged) {
      setIsUnder25FlaggedState(true);
    }
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_VIDEO, JSON.stringify(proof));
      sessionStorage.setItem(STORAGE_KEY_UNSHIELD, 'true');
    }
    syncBackendAuthorization();
  };

  /**
   * Government ID Verification (Front & Back):
   * Placed into user account profile and required for viewers determined under 25.
   */
  const setIdVerification = (cred: IdProfileCredential) => {
    setIsIdVerified(true);
    setIdCredential(cred);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_ID, JSON.stringify(cred));
    }
    syncBackendAuthorization();
  };

  // Legacy setVerification helper (maps to video verification if liveness)
  const setVerification = (proof: EphemeralVerificationProof) => {
    setVideoVerification(proof);
  };

  const toggleUnshieldedMode = () => {
    setUnshieldedMode((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY_UNSHIELD, String(next));
      }
      return next;
    });
  };

  const revokeCardVerification = () => {
    setIsCardVerified(false);
    setCardProof(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY_CARD);
    }
  };

  const revokeVideoVerification = () => {
    setIsVideoVerified(false);
    setUnshieldedMode(false);
    setVideoProof(null);
    setIsUnder25FlaggedState(false);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY_VIDEO);
      sessionStorage.removeItem(STORAGE_KEY_UNSHIELD);
    }
  };

  const revokeIdVerification = () => {
    setIsIdVerified(false);
    setIdCredential(null);
    if (typeof window !== 'undefined') {
      sessionStorage.removeItem(STORAGE_KEY_ID);
    }
  };

  const revokeVerification = () => {
    revokeCardVerification();
    revokeVideoVerification();
    revokeIdVerification();
  };

  const isUnder25Flagged =
    isUnder25FlaggedState ||
    !!(
      videoProof &&
      'under25Flagged' in videoProof &&
      (videoProof as any).under25Flagged
    );

  // 18+ Adult Entertainment Access Rules:
  // 1. Payment card verification ($0 authorization check) provides cardholder adulthood proof.
  // 2. AI Sentinel Live video verification confirms active human presence and biometric liveness.
  // 3. Anyone determined to be under 25 by the AI agent is required to produce a valid Driver's License or ID card.
  const isAdultContentUnlocked =
    isCardVerified && isVideoVerified && (!isUnder25Flagged || isIdVerified);

  const canAccessAdultContent = isAdultContentUnlocked && unshieldedMode;
  const isAgeVerified = isVideoVerified || isIdVerified || isCardVerified;

  /**
   * Strict Zero-Trace & No Blurred Placeholders Rule:
   * Conceals restricted Adult Entertainment content invisibly from unverified feeds.
   * Not a single hint, blur card, or teaser is shown unless 18+ Adult Entertainment access is verified.
   */
  const filterFeedPosts = (posts: Post[]): Post[] => {
    if (canAccessAdultContent) {
      return posts;
    }
    // Zero-trace shielding: Completely omit all shielded posts
    return posts.filter((post) => !post.isShielded);
  };

  return (
    <ShieldContext.Provider
      value={{
        isAgeVerified,
        isCardVerified,
        isVideoVerified,
        isIdVerified,
        isUnder25Flagged,
        isAdultContentUnlocked,
        canAccessAdultContent,
        unshieldedMode,
        cardProof,
        videoProof,
        idCredential,
        setCardVerification,
        setVideoVerification,
        setIdVerification,
        setVerification,
        toggleUnshieldedMode,
        filterFeedPosts,
        revokeCardVerification,
        revokeVideoVerification,
        revokeIdVerification,
        revokeVerification,
        syncBackendAuthorization,
        shieldStats: {
          totalShieldedHidden: canAccessAdultContent ? 0 : 2,
          unshieldedVisible: canAccessAdultContent,
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
