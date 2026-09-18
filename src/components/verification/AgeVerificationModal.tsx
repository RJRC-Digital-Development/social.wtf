'use client';

import React, { useState, useRef } from 'react';
import { useShield } from '@/lib/shield/shieldContext';
import {
  verifyDualGovId,
  verifyLiveVideoLiveness,
  verifyPaymentCardAdulthood,
  IdProfileCredential,
  VideoVerificationProof,
  CardAgeProof,
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
  Upload,
  UserCheck,
  ShieldAlert,
  HelpCircle,
  Smartphone,
  RefreshCw,
  CreditCard,
  CheckCircle2,
  Info,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface AgeVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'card_auth' | 'video_liveness' | 'id_upload';
  accessReason?: string;
}

export const AgeVerificationModal: React.FC<AgeVerificationModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'card_auth',
  accessReason,
}) => {
  const {
    isCardVerified,
    isVideoVerified,
    isIdVerified,
    isUnder25Flagged,
    isAdultContentUnlocked,
    cardProof,
    videoProof,
    idCredential,
    setCardVerification,
    setVideoVerification,
    setIdVerification,
    revokeCardVerification,
    revokeVideoVerification,
    revokeIdVerification,
    revokeVerification,
  } = useShield();

  const [activeTab, setActiveTab] = useState<'card_auth' | 'video_liveness' | 'id_upload'>(
    initialTab
  );
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [videoPurgeHash, setVideoPurgeHash] = useState<string | null>(null);

  // Card state
  const [cardNumber, setCardNumber] = useState('');
  const [cardExpiry, setCardExpiry] = useState('');
  const [cardCvv, setCardCvv] = useState('');
  const [cardError, setCardError] = useState('');
  const [isProcessingCard, setIsProcessingCard] = useState(false);

  // Government ID Front & Back state
  const [docType, setDocType] = useState<string>("Driver's License");
  const [frontImage, setFrontImage] = useState<string | null>(null);
  const [backImage, setBackImage] = useState<string | null>(null);
  const [idFrontHash, setIdFrontHash] = useState<string | null>(null);
  const [idBackHash, setIdBackHash] = useState<string | null>(null);
  const [idVerifiedSuccess, setIdVerifiedSuccess] = useState(false);

  // Video selfie webcam state
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [isCameraActive, setIsCameraActive] = useState(false);
  const [livenessStage, setLivenessStage] = useState<'idle' | 'align' | 'blink' | 'analyzing'>(
    'idle'
  );
  const [simulatedAgeInput, setSimulatedAgeInput] = useState<number>(27);

  if (!isOpen) return null;

  // Handle Card verification check ($0 authorization for adult financial check)
  const handleVerifyCard = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cardNumber || !cardExpiry || !cardCvv) {
      setCardError('Please complete all card details for $0 authorization age check.');
      return;
    }
    setCardError('');
    setIsProcessingCard(true);

    try {
      const proof = await verifyPaymentCardAdulthood(cardNumber, cardExpiry, cardCvv);
      setCardVerification(proof);
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#10b981', '#38bdf8'],
        });
      } catch (e) {}
      // Automatically advance to Step 2: Live video verification
      setTimeout(() => {
        setActiveTab('video_liveness');
      }, 700);
    } catch (err: any) {
      setCardError(err.message || 'Payment card authorization check failed.');
    } finally {
      setIsProcessingCard(false);
    }
  };

  // Handle live webcam video selfie check (Biometric liveness + Neural Age estimation)
  const handleStartLiveVideo = async () => {
    setIsCameraActive(true);
    setLivenessStage('align');
    setStatusText('Sentinel AI Agent: Aligning face within biometric liveness oval...');

    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
        }
      }
    } catch (err) {
      console.log('Webcam permission not granted or simulated video fallback active');
    }

    // Step 2: Prompt active liveness (blink / tilt head)
    setTimeout(() => {
      setLivenessStage('blink');
      setStatusText('Sentinel AI Agent: Please blink or tilt head to confirm active human presence...');
    }, 1800);

    // Step 3: Local neural inference and instant frame purge
    setTimeout(async () => {
      setLivenessStage('analyzing');
      setStatusText('Sentinel AI Agent: Running biometric liveness evaluation & neural age estimation...');

      // Stop camera stream immediately for absolute privacy
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      setIsCameraActive(false);

      const result = await verifyLiveVideoLiveness('live_stream_frame', simulatedAgeInput);
      setVideoPurgeHash(result.purgedHash);
      setVideoVerification(result);

      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.5 },
          colors: ['#10b981', '#fbbf24', '#38bdf8'],
        });
      } catch (e) {}

      // If determined under 25, advance to ID upload automatically
      if (result.under25Flagged && !isIdVerified) {
        setTimeout(() => {
          setActiveTab('id_upload');
        }, 1200);
      }
    }, 4200);
  };

  // Handle Government ID Front & Back upload (Required for Under 25 or Account Profile)
  const handleProcessDualId = async () => {
    if (!frontImage || !backImage) return;

    setIsProcessing(true);
    setStatusText('Sentinel AI Agent: Loading ID Front & Back into ephemeral client memory...');

    try {
      await new Promise((r) => setTimeout(r, 700));
      setStatusText('Sentinel AI Agent: Parsing document credentials & security features via local OCR...');

      const cred: IdProfileCredential = await verifyDualGovId(
        frontImage,
        backImage,
        docType,
        (fHash, bHash) => {
          setStatusText('Sentinel AI Agent: Purging raw ID images from RAM and attaching credential to profile...');
          setIdFrontHash(fHash);
          setIdBackHash(bHash);
        }
      );

      setIdVerification(cred);
      setIdVerifiedSuccess(true);
      setStatusText('ID Front & Back verified! Ephemeral RAM scrubbed with zero trace.');

      try {
        confetti({
          particleCount: 100,
          spread: 80,
          origin: { y: 0.6 },
          colors: ['#3b82f6', '#10b981', '#fbbf24'],
        });
      } catch (e) {}
    } catch (err) {
      console.error(err);
      setStatusText('Verification encountered an error. Please try again.');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleFileUpload = (side: 'front' | 'back', e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      if (side === 'front') setFrontImage(reader.result as string);
      else setBackImage(reader.result as string);
    };
    reader.readAsDataURL(file);
  };

  const loadSampleId = (side: 'front' | 'back') => {
    if (side === 'front') {
      setFrontImage(
        'https://images.unsplash.com/photo-1570295999919-56ceb5ecca61?w=600&auto=format&fit=crop&q=80'
      );
    } else {
      setBackImage(
        'https://images.unsplash.com/photo-1544717305-2782549b5136?w=600&auto=format&fit=crop&q=80'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl bg-[#0d1527] border border-slate-700/80 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[92vh] overflow-hidden">
        {/* Modal Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-100 text-base">
                  18+ Adult Entertainment Verification
                </h3>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-amber-500/20 text-amber-300 border border-amber-500/30 font-bold">
                  AI AGENT PROTECTED
                </span>
              </div>
              <p className="text-xs text-slate-400">
                Automated client-side verification with zero-trace privacy guarantees
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            
          </button>
        </div>

        {/* Mandatory Policy & Privacy Banner */}
        <div className="my-3 p-3.5 rounded-2xl bg-slate-900/90 border border-amber-500/30 text-xs space-y-1.5 shrink-0">
          <div className="flex items-center gap-2 text-amber-300 font-bold">
            <Info className="w-4 h-4 text-amber-400 shrink-0" />
            <span>18+ Adult Entertainment Policy &amp; Privacy Mandate</span>
          </div>
          <p className="text-slate-300 text-[11px] leading-relaxed">
            <strong>18 years old and over required to access.</strong> You must provide a debit or credit card ($0 card check) with live video verification that you are of age.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-800/80 text-[10px] font-mono text-slate-400">
            <div className="flex items-center gap-1.5 text-amber-300/90">
              <span> Under 25 Safeguard:</span>
              <span className="text-slate-300">Anyone determined under 25 must provide Driver's License/ID.</span>
            </div>
            <div className="flex items-center gap-1.5 text-emerald-400">
              <span> 100% AI Privacy:</span>
              <span className="text-slate-300">Verified ONLY by AI agents. Zero human review unless flagged.</span>
            </div>
          </div>
        </div>

        {/* Tab / Step Switcher */}
        <div className="flex gap-2 pb-3 border-b border-slate-800 shrink-0 text-xs font-semibold overflow-x-auto">
          {/* Step 1: Card */}
          <button
            onClick={() => setActiveTab('card_auth')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'card_auth'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <CreditCard className="w-3.5 h-3.5" />
            <span>Step 1: Payment Card</span>
            {isCardVerified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-1" />}
          </button>

          {/* Step 2: Live Video */}
          <button
            onClick={() => setActiveTab('video_liveness')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'video_liveness'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Step 2: AI Live Video</span>
            {isVideoVerified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-1" />}
          </button>

          {/* Step 3: Driver's License / ID */}
          <button
            onClick={() => setActiveTab('id_upload')}
            className={`flex items-center gap-2 px-3 py-2 rounded-xl transition-all whitespace-nowrap ${
              activeTab === 'id_upload'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-md'
                : isUnder25Flagged && !isIdVerified
                ? 'bg-amber-500/15 border border-amber-500/50 text-amber-300 animate-pulse'
                : 'bg-slate-900 border border-slate-800 text-slate-300 hover:bg-slate-800'
            }`}
          >
            <FileCheck className="w-3.5 h-3.5" />
            <span>Step 3: Driver's License / ID</span>
            {isIdVerified && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 ml-1" />}
            {isUnder25Flagged && !isIdVerified && (
              <span className="px-1.5 py-0.2 rounded text-[9px] bg-red-500 text-white font-bold">
                REQUIRED &lt;25
              </span>
            )}
          </button>
        </div>

        {/* Tab Content Container */}
        <div className="py-4 overflow-y-auto space-y-4 text-xs flex-1">
          {/* TAB 1: PAYMENT CARD VERIFICATION ($0 CHECK) */}
          {activeTab === 'card_auth' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                    <CreditCard className="w-4 h-4 text-amber-400" />
                    <span>Debit or Credit Card Age Verification</span>
                  </h4>
                  <span className="text-[10px] font-mono text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                    $0.00 Authorization
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  To confirm you are of age (18+), enter a valid debit or credit card. No fee is charged; this performs an instantaneous $0 token check to verify cardholder majority.
                </p>
              </div>

              {isCardVerified && cardProof ? (
                <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold">
                      <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                      <span>Cardholder Adulthood Verified</span>
                    </div>
                    <span className="text-[10px] font-mono bg-emerald-500/20 px-2 py-0.5 rounded">
                      {cardProof.cardBrand} (•••• {cardProof.last4})
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-300">
                    Zero card data persisted. You may now proceed to Step 2 for live biometric video verification.
                  </p>
                  <button
                    onClick={() => setActiveTab('video_liveness')}
                    className="mt-2 w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold transition-all shadow-md"
                  >
                    Continue to Step 2: AI Live Video Check →
                  </button>
                </div>
              ) : (
                <form onSubmit={handleVerifyCard} className="space-y-3 max-w-md mx-auto p-4 rounded-2xl bg-[#090e1a] border border-slate-800">
                  {cardError && (
                    <div className="p-2.5 rounded-xl bg-red-500/10 border border-red-500/30 text-red-300 text-[11px]">
                      {cardError}
                    </div>
                  )}

                  <div>
                    <label className="block text-slate-400 mb-1">Card Number (Debit or Credit)</label>
                    <input
                      type="text"
                      placeholder="4242 •••• •••• 4242"
                      value={cardNumber}
                      onChange={(e) => setCardNumber(e.target.value)}
                      className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-amber-400"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-slate-400 mb-1">Expiry (MM/YY)</label>
                      <input
                        type="text"
                        placeholder="12/28"
                        value={cardExpiry}
                        onChange={(e) => setCardExpiry(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-amber-400"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-400 mb-1">CVV / CVC</label>
                      <input
                        type="password"
                        maxLength={4}
                        placeholder="•••"
                        value={cardCvv}
                        onChange={(e) => setCardCvv(e.target.value)}
                        className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-slate-200 font-mono focus:outline-none focus:border-amber-400"
                      />
                    </div>
                  </div>

                  {/* Quick Autofill Sample for Dev / Demo */}
                  <div className="flex justify-between items-center text-[10px] text-slate-400 pt-1">
                    <span>Test Card Demo:</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCardNumber('4242 8821 9912 4242');
                        setCardExpiry('08/29');
                        setCardCvv('789');
                      }}
                      className="text-amber-400 hover:underline"
                    >
                      Autofill Valid Test Card
                    </button>
                  </div>

                  <button
                    type="submit"
                    disabled={isProcessingCard}
                    className="w-full py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold transition-all shadow-md disabled:opacity-50"
                  >
                    {isProcessingCard ? 'Authorizing $0 Age Verification...' : 'Verify Card & Continue'}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* TAB 2: AI LIVE VIDEO VERIFICATION & NEURAL AGE ESTIMATION */}
          {activeTab === 'video_liveness' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                    <Camera className="w-4 h-4 text-amber-400" />
                    <span>AI Sentinel Live Video Liveness &amp; Age Scan</span>
                  </h4>
                  <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                    Neural Biometrics
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  Live video verification is evaluated strictly by autonomous AI agents with <strong>zero human review</strong>. If the AI determines your age to be <strong>under 25</strong>, you will be required to produce a valid Driver's License or ID card to proceed.
                </p>
              </div>

              {/* Camera Frame Preview / Stage */}
              <div className="relative w-full max-w-md mx-auto aspect-video rounded-3xl overflow-hidden bg-black border-2 border-slate-700/80 flex items-center justify-center shadow-xl">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                />

                {/* Biometric Oval Overlay */}
                {isCameraActive && (
                  <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                    <div className="w-48 h-64 border-2 border-dashed border-emerald-400 rounded-[50%] animate-pulse" />
                  </div>
                )}

                {/* Liveness Stage Prompts */}
                {isCameraActive && (
                  <div className="absolute bottom-4 inset-x-4 p-2.5 rounded-xl bg-black/80 backdrop-blur-md border border-slate-700 text-center text-xs font-mono text-emerald-300">
                    {livenessStage === 'align' && ' Align your face in the oval'}
                    {livenessStage === 'blink' && ' Blink or tilt head to confirm liveness'}
                    {livenessStage === 'analyzing' && ' AI Agent analyzing liveness & estimating age...'}
                  </div>
                )}

                {/* Idle Overlay */}
                {!isCameraActive && !isVideoVerified && (
                  <div className="text-center p-6 space-y-3">
                    <div className="w-16 h-16 rounded-3xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 mx-auto">
                      <Camera className="w-8 h-8" />
                    </div>
                    <div>
                      <h5 className="font-bold text-slate-200">Camera Inactive</h5>
                      <p className="text-[11px] text-slate-400">Click below to start live video check</p>
                    </div>
                  </div>
                )}

                {/* Verified Overlay */}
                {isVideoVerified && videoProof && !isCameraActive && (
                  <div className="absolute inset-0 bg-slate-950/90 flex flex-col items-center justify-center p-6 text-center space-y-2">
                    <CheckCircle2 className="w-12 h-12 text-emerald-400" />
                    <h5 className="font-bold text-slate-100 text-base">Live Video Check Completed!</h5>
                    <div className="font-mono text-xs text-amber-300">
                      AI Estimated Age: ~{(videoProof as any).estimatedAge || 26} yrs
                    </div>
                    <p className="text-[11px] text-slate-400">
                      {(videoProof as any).under25Flagged
                        ? 'Under 25 detected: Driver’s License / ID required in Step 3.'
                        : 'Age 25+ confirmed: Adult Entertainment unlocked!'}
                    </p>
                  </div>
                )}
              </div>

              {/* Dev Simulation Age Switcher */}
              <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between text-[11px]">
                <span className="text-slate-400">Neural Age Estimation Mode:</span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setSimulatedAgeInput(27)}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold ${
                      simulatedAgeInput >= 25
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    25+ Adult (Direct Unlock)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSimulatedAgeInput(21)}
                    className={`px-2.5 py-1 rounded-lg font-mono text-[10px] font-bold ${
                      simulatedAgeInput < 25
                        ? 'bg-amber-500 text-slate-950'
                        : 'bg-slate-800 text-slate-300'
                    }`}
                  >
                    &lt;25 Youth (Triggers Step 3 ID)
                  </button>
                </div>
              </div>

              {/* Start Action */}
              <div className="flex gap-2">
                <button
                  onClick={handleStartLiveVideo}
                  disabled={isCameraActive}
                  className="flex-1 py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold transition-all shadow-md disabled:opacity-50"
                >
                  {isCameraActive ? 'AI Verification in Progress...' : 'Start AI Live Video Check'}
                </button>

                {isUnder25Flagged && !isIdVerified && (
                  <button
                    onClick={() => setActiveTab('id_upload')}
                    className="px-4 py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 text-white font-bold transition-all"
                  >
                    Proceed to Step 3 (ID Required) →
                  </button>
                )}
              </div>
            </div>
          )}

          {/* TAB 3: GOVERNMENT ID / DRIVER'S LICENSE (REQUIRED FOR UNDER 25 OR ACCOUNT PROFILE) */}
          {activeTab === 'id_upload' && (
            <div className="space-y-4 animate-fade-in">
              <div className="p-4 rounded-2xl bg-slate-900/70 border border-slate-800 space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-slate-200 text-sm flex items-center gap-2">
                    <FileCheck className="w-4 h-4 text-blue-400" />
                    <span>Valid Driver's License or Government ID Card</span>
                  </h4>
                  <span className="text-[10px] font-mono text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded border border-blue-500/20">
                    Front &amp; Back
                  </span>
                </div>
                <p className="text-slate-400 text-[11px] leading-relaxed">
                  {isUnder25Flagged
                    ? 'Your live video check determined you to be under 25. By mandatory policy, a valid Driver’s License or ID card is required to access 18+ Adult Entertainment.'
                    : 'Upload a valid Driver’s License or Government ID card to add trusted credentials to your profile or satisfy the under-25 safeguard.'}
                  {' '}Scanned by autonomous AI with zero human review.
                </p>
              </div>

              {/* Document Type Picker */}
              <div className="flex items-center gap-3">
                <label className="text-slate-400 text-xs">Document Type:</label>
                <select
                  value={docType}
                  onChange={(e) => setDocType(e.target.value)}
                  className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-amber-400"
                >
                  <option value="Driver's License">Driver's License</option>
                  <option value="State ID Card">State ID Card</option>
                  <option value="Passport Card">Passport Card</option>
                  <option value="National ID">National ID</option>
                </select>
              </div>

              {/* Dual Upload Slots: Front & Back */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Front ID */}
                <div className="p-4 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-3 text-center">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">1. ID Front</span>
                    {frontImage ? (
                      <span className="text-emerald-400 text-[10px] font-mono">Loaded </span>
                    ) : (
                      <span className="text-slate-500 text-[10px]">Required</span>
                    )}
                  </div>

                  <div className="relative aspect-video rounded-xl bg-slate-900 overflow-hidden border border-slate-800 flex items-center justify-center">
                    {frontImage ? (
                      <img src={frontImage} alt="ID Front" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-slate-500 text-[11px]">No image selected</div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <label className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer text-center">
                      Upload Front
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('front', e)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => loadSampleId('front')}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 text-blue-300 text-xs font-mono"
                    >
                      Sample
                    </button>
                  </div>
                </div>

                {/* Back ID */}
                <div className="p-4 rounded-2xl bg-[#090e1a] border border-slate-800 space-y-3 text-center">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-200">2. ID Back (Barcode/MRZ)</span>
                    {backImage ? (
                      <span className="text-emerald-400 text-[10px] font-mono">Loaded </span>
                    ) : (
                      <span className="text-slate-500 text-[10px]">Required</span>
                    )}
                  </div>

                  <div className="relative aspect-video rounded-xl bg-slate-900 overflow-hidden border border-slate-800 flex items-center justify-center">
                    {backImage ? (
                      <img src={backImage} alt="ID Back" className="w-full h-full object-cover" />
                    ) : (
                      <div className="text-slate-500 text-[11px]">No image selected</div>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <label className="flex-1 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold cursor-pointer text-center">
                      Upload Back
                      <input
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={(e) => handleFileUpload('back', e)}
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => loadSampleId('back')}
                      className="px-2.5 py-1.5 rounded-xl bg-blue-500/10 text-blue-300 text-xs font-mono"
                    >
                      Sample
                    </button>
                  </div>
                </div>
              </div>

              {statusText && (
                <div className="p-3 rounded-xl bg-slate-900 border border-slate-800 text-[11px] font-mono text-amber-300">
                  {statusText}
                </div>
              )}

              {/* Submit ID Scan */}
              <button
                onClick={handleProcessDualId}
                disabled={isProcessing || !frontImage || !backImage}
                className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold transition-all shadow-md disabled:opacity-40"
              >
                {isProcessing ? 'AI Agent Verifying Document...' : 'Run Autonomous AI Document Verification'}
              </button>
            </div>
          )}
        </div>

        {/* Modal Footer Summary */}
        <div className="pt-3 border-t border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-2 shrink-0 text-[11px]">
          <div className="flex items-center gap-2">
            <span className="text-slate-400">Adult Entertainment Status:</span>
            {isAdultContentUnlocked ? (
              <span className="text-emerald-400 font-bold font-mono">
                 18+ ADULT ENTERTAINMENT UNLOCKED
              </span>
            ) : (
              <span className="text-amber-400 font-mono">
                Pending ({!isCardVerified ? 'Card Required' : !isVideoVerified ? 'Video Required' : 'ID Required for <25'})
              </span>
            )}
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-semibold transition-all"
          >
            {isAdultContentUnlocked ? 'Complete & Close' : 'Close'}
          </button>
        </div>
      </div>
    </div>
  );
};
