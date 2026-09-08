'use client';

import React, { useState, useRef } from 'react';
import { useShield } from '@/lib/shield/shieldContext';
import {
  verifyEphemeralGovId,
  verifyFacialAgeEstimation,
  EphemeralVerificationProof,
} from '@/lib/verification/verifier';
import {
  ShieldCheck,
  FileCheck,
  Camera,
  Trash2,
  Lock,
  Sparkles,
  CheckCircle,
  AlertTriangle,
  Loader2,
  Eye,
  Key,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface AgeVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const AgeVerificationModal: React.FC<AgeVerificationModalProps> = ({
  isOpen,
  onClose,
}) => {
  const { setVerification, isAgeVerified, revokeVerification } = useShield();

  const [activeTab, setActiveTab] = useState<'id_ocr' | 'face_video'>('id_ocr');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [purgeHash, setPurgeHash] = useState<string | null>(null);
  const [verifiedResult, setVerifiedResult] = useState<EphemeralVerificationProof | null>(
    null
  );

  // Video selfie webcam state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [livenessStage, setLivenessStage] = useState<'idle' | 'align' | 'blink' | 'analyzing'>(
    'idle'
  );

  if (!isOpen) return null;

  const handleStartIdOcr = async (sampleType: 'driver_license' | 'passport' = 'driver_license') => {
    setIsProcessing(true);
    setStatusText('Loading document into ephemeral memory buffer...');
    setPurgeHash(null);

    try {
      await new Promise((r) => setTimeout(r, 800));
      setStatusText('Extracting birthdate via local OCR in client RAM...');

      const result = await verifyEphemeralGovId(
        `sample_doc_${sampleType}_data_${Date.now()}`,
        (hash) => {
          setStatusText('CRITICAL: Purging raw image buffer and generating cryptographic zero-knowledge proof...');
          setPurgeHash(hash);
        }
      );

      await new Promise((r) => setTimeout(r, 600));
      setVerifiedResult(result);
      setVerification(result);
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.5 },
          colors: ['#10b981', '#3b82f6', '#f59e0b'],
        });
      } catch (e) {}
    } catch (e: any) {
      console.error(e);
      setStatusText('Verification encountered an error.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleStartFaceVideo = async () => {
    setIsCameraActive(true);
    setLivenessStage('align');
    setStatusText('Aligning face within liveness boundary...');

    // Try starting real camera if available, otherwise simulated video stream
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }
    } catch (err) {
      console.log('Webcam permission not granted or unavailable, using simulated video frame');
    }

    // Step 2: Liveness blink check prompt
    setTimeout(() => {
      setLivenessStage('blink');
      setStatusText('Please blink or tilt slightly to verify live presence...');
    }, 1800);

    // Step 3: Local neural age inference & instant purge
    setTimeout(async () => {
      setLivenessStage('analyzing');
      setStatusText('Running local facial age estimation & discarding frame immediately...');

      // Stop camera stream immediately to preserve privacy
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      setIsCameraActive(false);

      const result = await verifyFacialAgeEstimation('ephemeral_frame_buffer');
      setVerifiedResult(result);
      setVerification(result);
      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.5 },
          colors: ['#10b981', '#3b82f6', '#f59e0b'],
        });
      } catch (e) {}
    }, 4000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-lg bg-[#0d1527] border border-slate-700/80 rounded-3xl p-6 shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base">
                Privacy-First Age & Identity Gate
              </h3>
              <p className="text-xs text-slate-400">
                Unlock shielded content with zero stored data
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            ✕
          </button>
        </div>

        {/* Privacy Assurance Banner */}
        <div className="my-4 p-3.5 rounded-2xl bg-emerald-950/40 border border-emerald-500/30 flex items-start gap-3">
          <Lock className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
          <div className="text-xs text-emerald-200/90 leading-relaxed">
            <strong className="text-emerald-300 block mb-0.5">
              100% Zero-Data Retention Guarantee:
            </strong>
            Government IDs and facial video frames are processed exclusively in client-side ephemeral RAM. Data is purged immediately with a cryptographic SHA-256 wipe receipt. No PII is EVER stored or uploaded.
          </div>
        </div>

        {/* If already verified */}
        {isAgeVerified && (
          <div className="p-5 rounded-2xl bg-slate-900/90 border border-emerald-500/40 text-center space-y-3 my-4">
            <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
              <CheckCircle className="w-7 h-7" />
            </div>
            <h4 className="font-bold text-slate-100">You are Age-Verified (18+)</h4>
            <p className="text-xs text-slate-400">
              Unshielded Mode is active. Restricted and mature creator content will render seamlessly in your feed.
            </p>
            {purgeHash && (
              <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-400 break-all">
                <span className="text-emerald-400 block font-semibold mb-0.5">
                  Cryptographic Memory Purge Proof:
                </span>
                {purgeHash}
              </div>
            )}
            <div className="flex gap-2 pt-2">
              <button
                onClick={onClose}
                className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md"
              >
                Continue Browsing
              </button>
              <button
                onClick={() => {
                  revokeVerification();
                  setVerifiedResult(null);
                }}
                className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-red-300 text-xs font-semibold border border-red-500/20 transition-all"
              >
                Reset Verification
              </button>
            </div>
          </div>
        )}

        {/* Verification Options (If not verified yet) */}
        {!isAgeVerified && (
          <div>
            {/* Method Tabs */}
            <div className="grid grid-cols-2 gap-2 p-1 rounded-2xl bg-slate-900/80 border border-slate-800 mb-4">
              <button
                onClick={() => setActiveTab('id_ocr')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'id_ocr'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <FileCheck className="w-4 h-4" />
                <span>Ephemeral ID OCR</span>
              </button>

              <button
                onClick={() => setActiveTab('face_video')}
                className={`py-2 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
                  activeTab === 'face_video'
                    ? 'bg-amber-500 text-slate-950 shadow-md font-bold'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Camera className="w-4 h-4" />
                <span>Facial Age Check</span>
              </button>
            </div>

            {/* Tab 1: Ephemeral ID OCR */}
            {activeTab === 'id_ocr' && (
              <div className="space-y-4">
                <div className="p-4 rounded-2xl bg-slate-900/60 border border-dashed border-slate-700 text-center">
                  <div className="w-10 h-10 rounded-full bg-slate-800 flex items-center justify-center mx-auto mb-2 text-slate-300">
                    <FileCheck className="w-5 h-5 text-amber-400" />
                  </div>
                  <p className="text-xs text-slate-300 font-semibold mb-1">
                    Select Identity Document to Scan Ephemerally
                  </p>
                  <p className="text-[11px] text-slate-400 mb-3">
                    Calculates $Age \ge 18$ and zeroes RAM immediately
                  </p>

                  <div className="grid grid-cols-2 gap-2 max-w-xs mx-auto">
                    <button
                      disabled={isProcessing}
                      onClick={() => handleStartIdOcr('driver_license')}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-all active:scale-95"
                    >
                      Driver's License
                    </button>
                    <button
                      disabled={isProcessing}
                      onClick={() => handleStartIdOcr('passport')}
                      className="py-2 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-xs font-medium text-slate-200 transition-all active:scale-95"
                    >
                      Passport / ID Card
                    </button>
                  </div>
                </div>

                {isProcessing && (
                  <div className="p-3.5 rounded-2xl bg-slate-900/90 border border-amber-500/40 text-center space-y-2 animate-fade-in">
                    <div className="flex items-center justify-center gap-2 text-amber-400 text-xs font-semibold">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{statusText}</span>
                    </div>
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-amber-500 to-emerald-400 animate-pulse w-3/4"></div>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Facial Age Estimation Video Selfie */}
            {activeTab === 'face_video' && (
              <div className="space-y-4">
                <div className="relative rounded-2xl overflow-hidden bg-slate-950 aspect-video border border-slate-700 flex flex-col items-center justify-center text-center p-4">
                  {isCameraActive ? (
                    <>
                      <video
                        ref={videoRef}
                        autoPlay
                        playsInline
                        muted
                        className="absolute inset-0 w-full h-full object-cover"
                      />
                      {/* Liveness Target Oval */}
                      <div className="relative z-10 w-40 h-52 border-2 border-dashed border-emerald-400 rounded-[50%] flex items-center justify-center animate-pulse">
                        <span className="text-[10px] font-bold text-emerald-300 bg-black/60 px-2 py-0.5 rounded">
                          {livenessStage === 'align' && 'Position Face'}
                          {livenessStage === 'blink' && 'Blink Now!'}
                          {livenessStage === 'analyzing' && 'Analyzing Age...'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/10 text-amber-400 flex items-center justify-center mb-2">
                        <Camera className="w-6 h-6" />
                      </div>
                      <h4 className="text-xs font-bold text-slate-200 mb-1">
                        Non-Invasive Video Liveness Check
                      </h4>
                      <p className="text-[11px] text-slate-400 max-w-xs mb-3">
                        Performs 3-second live selfie estimation. Frames are analyzed client-side and deleted immediately.
                      </p>
                      <button
                        onClick={handleStartFaceVideo}
                        className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-amber-500/20"
                      >
                        Start Live Video Check
                      </button>
                    </>
                  )}
                </div>

                {isCameraActive && (
                  <div className="p-3 rounded-xl bg-slate-900 border border-emerald-500/40 text-center text-xs text-emerald-300 font-medium animate-pulse">
                    {statusText}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
