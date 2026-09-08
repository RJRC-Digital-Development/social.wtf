'use client';

import React, { createContext, useContext, useState, useEffect } from 'react';
import { Post } from '@/types';
import {
  EphemeralVerificationProof,
  IdProfileCredential,
  VideoVerificationProof,
} from '../verification/verifier';

interface ShieldContextType {
  isAgeVerified: boolean; // True if either video or ID is verified
  isVideoVerified: boolean; // Live video verified: strictly required for XXX feature
  isIdVerified: boolean; // ID Front & Back uploaded into account profile for login
  canAccessXxx: boolean; // True only when isVideoVerified && unshieldedMode
  unshieldedMode: boolean;
  videoProof: VideoVerificationProof | EphemeralVerificationProof | null;
  idCredential: IdProfileCredential | null;
  setVideoVerification: (proof: VideoVerificationProof | EphemeralVerificationProof) => void;
  setIdVerification: (cred: IdProfileCredential) => void;
  setVerification: (proof: EphemeralVerificationProof) => void; // Legacy support
  toggleUnshieldedMode: () => void;
  filterFeedPosts: (posts: Post[]) => Post[];
  revokeVideoVerification: () => void;
  revokeIdVerification: () => void;
  revokeVerification: () => void;
  shieldStats: {
    totalShieldedHidden: number;
    unshieldedVisible: boolean;
  };
}

const ShieldContext = createContext<ShieldContextType | undefined>(undefined);

const STORAGE_KEY_VIDEO = 'social_wtf_video_proof';
const STORAGE_KEY_ID = 'social_wtf_id_cred';
const STORAGE_KEY_UNSHIELD = 'social_wtf_unshield_active';

export const ShieldProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [isVideoVerified, setIsVideoVerified] = useState(false);
  const [isIdVerified, setIsIdVerified] = useState(false);
  const [unshieldedMode, setUnshieldedMode] = useState(false);
  const [videoProof, setVideoProof] = useState<VideoVerificationProof | EphemeralVerificationProof | null>(null);
  const [idCredential, setIdCredential] = useState<IdProfileCredential | null>(null);

  // Restore session proofs if still valid
  useEffect(() => {
    if (typeof window !== 'undefined') {
      // 1. Check video verification proof (required for XXX feature)
      const storedVideo = sessionStorage.getItem(STORAGE_KEY_VIDEO);
      if (storedVideo) {
        try {
          const parsed = JSON.parse(storedVideo);
          if (parsed.expiresAt > Date.now()) {
            setIsVideoVerified(true);
            setVideoProof(parsed);
            const pref = sessionStorage.getItem(STORAGE_KEY_UNSHIELD) === 'true';
            setUnshieldedMode(pref);
          } else {
            sessionStorage.removeItem(STORAGE_KEY_VIDEO);
          }
        } catch (e) {
          console.error(e);
        }
      }

      // 2. Check ID credentials (stored in account profile for login)
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
    }
  }, []);

  /**
   * Live Video Verification:
   * Strictly required to access the XXX feature.
   * Government ID is explicitly not required virtually.
   */
  const setVideoVerification = (proof: VideoVerificationProof | EphemeralVerificationProof) => {
    setIsVideoVerified(true);
    setUnshieldedMode(true);
    setVideoProof(proof);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_VIDEO, JSON.stringify(proof));
      sessionStorage.setItem(STORAGE_KEY_UNSHIELD, 'true');
    }
  };

  /**
   * Government ID Verification (Front & Back):
   * Placed into user account profile for login reasons and profile trust badge.
   */
  const setIdVerification = (cred: IdProfileCredential) => {
    setIsIdVerified(true);
    setIdCredential(cred);
    if (typeof window !== 'undefined') {
      sessionStorage.setItem(STORAGE_KEY_ID, JSON.stringify(cred));
    }
  };

  // Legacy setVerification helper (maps to video verification if liveness)
  const setVerification = (proof: EphemeralVerificationProof) => {
    setVideoVerification(proof);
  };

  const toggleUnshieldedMode = () => {
    if (!isVideoVerified) return;
    setUnshieldedMode((prev) => {
      const next = !prev;
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(STORAGE_KEY_UNSHIELD, String(next));
      }
      return next;
    });
  };

  const revokeVideoVerification = () => {
    setIsVideoVerified(false);
    setUnshieldedMode(false);
    setVideoProof(null);
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
    revokeVideoVerification();
    revokeIdVerification();
  };

  const isAgeVerified = isVideoVerified || isIdVerified;
  const canAccessXxx = isVideoVerified && unshieldedMode;

  /**
   * Strict Zero-Trace & No Blurred Placeholders Rule:
   * Conceals restricted XXX content invisibly from unverified feeds.
   * Not a single hint, blur card, or teaser is shown unless live video verification is verified.
   */
  const filterFeedPosts = (posts: Post[]): Post[] => {
    if (canAccessXxx) {
      return posts;
    }
    // Zero-trace shielding: Completely omit all shielded posts
    return posts.filter((post) => !post.isShielded);
  };

  return (
    <ShieldContext.Provider
      value={{
        isAgeVerified,
        isVideoVerified,
        isIdVerified,
        canAccessXxx,
        unshieldedMode,
        videoProof,
        idCredential,
        setVideoVerification,
        setIdVerification,
        setVerification,
        toggleUnshieldedMode,
        filterFeedPosts,
        revokeVideoVerification,
        revokeIdVerification,
        revokeVerification,
        shieldStats: {
          totalShieldedHidden: canAccessXxx ? 0 : 2,
          unshieldedVisible: canAccessXxx,
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
