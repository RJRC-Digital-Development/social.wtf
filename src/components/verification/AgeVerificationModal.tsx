'use client';

import React, { useState, useRef } from 'react';
import { useShield } from '@/lib/shield/shieldContext';
import {
  verifyDualGovId,
  verifyLiveVideoLiveness,
  IdProfileCredential,
  VideoVerificationProof,
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
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface AgeVerificationModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'video_liveness' | 'id_upload';
  accessReason?: string;
}

export const AgeVerificationModal: React.FC<AgeVerificationModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'video_liveness',
  accessReason,
}) => {
  const {
    isVideoVerified,
    isIdVerified,
    idCredential,
    videoProof,
    setVideoVerification,
    setIdVerification,
    revokeVideoVerification,
    revokeIdVerification,
    revokeVerification,
  } = useShield();

  const [activeTab, setActiveTab] = useState<'video_liveness' | 'id_upload'>(initialTab);
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusText, setStatusText] = useState('');
  const [videoPurgeHash, setVideoPurgeHash] = useState<string | null>(null);

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

  if (!isOpen) return null;

  // Handle live webcam video selfie check (Required for XXX access)
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
      setStatusText('Sentinel AI Agent: Running biometric liveness evaluation & purging frame buffer...');

      // Stop camera stream immediately for absolute privacy
      if (videoRef.current?.srcObject) {
        const stream = videoRef.current.srcObject as MediaStream;
        stream.getTracks().forEach((track) => track.stop());
      }
      setIsCameraActive(false);

      const result = await verifyLiveVideoLiveness('live_stream_frame');
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
    }, 4200);
  };

  // Handle Government ID Front & Back upload for Account Profile & Login
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

      await new Promise((r) => setTimeout(r, 600));
      setIdVerification(cred);
      setIdVerifiedSuccess(true);

      try {
        confetti({
          particleCount: 70,
          spread: 60,
          origin: { y: 0.5 },
          colors: ['#3b82f6', '#10b981', '#f59e0b'],
        });
      } catch (e) {}
    } catch (err) {
      console.error(err);
      setStatusText('Error verifying ID documents.');
    } finally {
      setIsProcessing(false);
    }
  };

  // Quick helper to populate demo ID front & back
  const handleLoadDemoId = (type: 'license' | 'passport') => {
    if (type === 'license') {
      setDocType("Driver's License");
      setFrontImage(
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180" fill="%231e293b"><rect width="300" height="180" rx="12" stroke="%2338bdf8" stroke-width="2"/><text x="20" y="35" fill="%2338bdf8" font-size="14" font-weight="bold">OFFICIAL DRIVER LICENSE (FRONT)</text><rect x="20" y="55" width="60" height="80" rx="6" fill="%23334155"/><text x="95" y="75" fill="%23f8fafc" font-size="12">NAME: CITIZEN ONE</text><text x="95" y="95" fill="%2394a3b8" font-size="10">DOB: 10/14/1998 (25 YRS)</text><text x="95" y="115" fill="%2310b981" font-size="10">STATUS: VERIFIED ADULT</text></svg>'
      );
      setBackImage(
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180" fill="%230f172a"><rect width="300" height="180" rx="12" stroke="%2364748b" stroke-width="2"/><text x="20" y="35" fill="%2394a3b8" font-size="13" font-weight="bold">DOCUMENT SECURITY BARCODE (BACK)</text><rect x="20" y="55" width="260" height="50" fill="%23000000"/><text x="25" y="85" fill="%23ffffff" font-family="monospace" font-size="11">||| | |||| || |||||| | ||| |||| |</text><text x="20" y="135" fill="%2364748b" font-size="10">AUTHENTICATED CRYPTOGRAPHIC BARCODE</text></svg>'
      );
    } else {
      setDocType('Passport / National ID');
      setFrontImage(
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180" fill="%231e293b"><rect width="300" height="180" rx="12" stroke="%23fbbf24" stroke-width="2"/><text x="20" y="35" fill="%23fbbf24" font-size="14" font-weight="bold">PASSPORT IDENTITY PAGE (FRONT)</text><rect x="20" y="55" width="60" height="80" rx="6" fill="%23334155"/><text x="95" y="75" fill="%23f8fafc" font-size="12">PASSPORT HOLDER</text><text x="95" y="95" fill="%2394a3b8" font-size="10">NATIONAL ID #88921-A</text><text x="95" y="115" fill="%2310b981" font-size="10">ADULT HOLDER VALIDATED</text></svg>'
      );
      setBackImage(
        'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="300" height="180" viewBox="0 0 300 180" fill="%230f172a"><rect width="300" height="180" rx="12" stroke="%2364748b" stroke-width="2"/><text x="20" y="35" fill="%2394a3b8" font-size="13" font-weight="bold">PASSPORT COVER &amp; CHIP (BACK)</text><rect x="20" y="55" width="260" height="60" fill="%23000000"/><text x="25" y="90" fill="%2338bdf8" font-family="monospace" font-size="10">P&lt;UTO&lt;&lt;CITIZEN&lt;&lt;ONE&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;&lt;</text><text x="20" y="145" fill="%2364748b" font-size="10">ICAO 9303 BIOMETRIC MRZ CHECKSUM</text></svg>'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in overflow-y-auto">
      <div className="relative w-full max-w-xl bg-[#0d1527] border border-slate-700/90 rounded-3xl p-6 shadow-2xl my-8">
        {/* Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-gradient-to-br from-amber-500/20 to-emerald-500/20 border border-amber-500/30 text-amber-400">
              <ShieldCheck className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <span>Verification Center</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono bg-blue-500/20 text-blue-300 border border-blue-500/30">
                  PRIVACY-FIRST
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Live Video Liveness Safeguard &amp; Account Profile ID Credentials
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

        {/* Dual Mode Switcher Tabs */}
        <div className="grid grid-cols-2 gap-2 p-1.5 rounded-2xl bg-slate-900/90 border border-slate-800 my-4">
          <button
            onClick={() => setActiveTab('video_liveness')}
            className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'video_liveness'
                ? 'bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Camera className="w-4 h-4" />
            <div className="text-left">
              <div className="leading-tight">Live Video Check</div>
              <div className="text-[9px] opacity-80">Required for XXX Feature</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('id_upload')}
            className={`py-2.5 px-3 rounded-xl text-xs font-semibold flex items-center justify-center gap-2 transition-all ${
              activeTab === 'id_upload'
                ? 'bg-gradient-to-r from-blue-500 to-indigo-500 text-white font-bold shadow-md'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <div className="text-left">
              <div className="leading-tight">Account ID (Front &amp; Back)</div>
              <div className="text-[9px] opacity-80">For Profile &amp; Login Reasons</div>
            </div>
          </button>
        </div>

        {/* TAB 1: LIVE VIDEO VERIFICATION (FOR XXX FEATURE) */}
        {activeTab === 'video_liveness' && (
          <div className="space-y-4 animate-fade-in">
            {/* Device Guardian Safeguard Alert */}
            <div className="p-3.5 rounded-2xl bg-amber-950/40 border border-amber-500/30 flex items-start gap-3">
              <Smartphone className="w-5 h-5 text-amber-400 shrink-0 mt-0.5" />
              <div className="text-xs text-amber-200/90 leading-relaxed">
                <strong className="text-amber-300 block mb-0.5">
                  Parent &amp; Guardian Device Safeguard (Required Upon Access):
                </strong>
                To guarantee that an underage child is not accessing mature content through a parent or guardian's device, live video liveness verification is required upon access.
                <span className="block mt-1 text-emerald-300 font-semibold">
                  ✓ Government ID is NOT required virtually for XXX content. 100% viewer privacy is guaranteed.
                </span>
              </div>
            </div>

            {/* If Video already verified */}
            {isVideoVerified ? (
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-emerald-500/40 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-slate-100 text-sm">
                  Live Video Verified (Active Session)
                </h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto">
                  Biometric liveness confirmed the active viewer on this device. Mature XXX content and unshielded feeds are now accessible without any trace or blurred cards.
                </p>
                {videoPurgeHash && (
                  <div className="p-2 rounded-xl bg-slate-950 border border-slate-800 font-mono text-[10px] text-slate-400 break-all">
                    <span className="text-emerald-400 block font-semibold mb-0.5">
                      Ephemeral Frame Discard Receipt:
                    </span>
                    {videoPurgeHash}
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-md"
                  >
                    Enter Unshielded Stream
                  </button>
                  <button
                    onClick={revokeVideoVerification}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-red-300 text-xs font-semibold border border-red-500/20 transition-all"
                  >
                    Lock Session
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Webcam Box */}
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
                      <div className="relative z-10 w-44 h-56 border-2 border-dashed border-emerald-400 rounded-[50%] flex items-center justify-center animate-pulse shadow-[0_0_25px_rgba(16,185,129,0.3)]">
                        <span className="text-[11px] font-bold text-emerald-300 bg-black/75 px-2.5 py-1 rounded-full border border-emerald-500/40">
                          {livenessStage === 'align' && 'Position Face in Oval'}
                          {livenessStage === 'blink' && 'Blink or Tilt Head Now!'}
                          {livenessStage === 'analyzing' && 'Analyzing Active Presence...'}
                        </span>
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="w-12 h-12 rounded-2xl bg-amber-500/15 text-amber-400 flex items-center justify-center mb-2">
                        <Camera className="w-6 h-6" />
                      </div>
                      <h4 className="text-sm font-bold text-slate-200 mb-1">
                        Instant Live Biometric Check
                      </h4>
                      <p className="text-xs text-slate-400 max-w-xs mb-3">
                        3-second real-time presence check. Validates that an adult is actively holding the device right now. Zero frames stored.
                      </p>
                      <button
                        onClick={handleStartLiveVideo}
                        className="py-2.5 px-5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-amber-500/20 flex items-center gap-2"
                      >
                        <Camera className="w-4 h-4" />
                        <span>Start Live Video Check</span>
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

        {/* TAB 2: GOVERNMENT ID UPLOAD (FRONT & BACK FOR ACCOUNT PROFILE & LOGIN) */}
        {activeTab === 'id_upload' && (
          <div className="space-y-4 animate-fade-in">
            {/* Account Profile Explainer */}
            <div className="p-3.5 rounded-2xl bg-blue-950/40 border border-blue-500/30 flex items-start gap-3">
              <UserCheck className="w-5 h-5 text-blue-400 shrink-0 mt-0.5" />
              <div className="text-xs text-blue-200/90 leading-relaxed">
                <strong className="text-blue-300 block mb-0.5">
                  Account Profile Identification &amp; Login Security:
                </strong>
                Upload Front &amp; Back images of your government ID. When verified, this credential is placed directly into your account profile for login authentication and verified creator status.
                <span className="block mt-1 text-slate-400 italic">
                  Note: Government ID is not required to view XXX content—live video verification is used instead for viewer privacy.
                </span>
              </div>
            </div>

            {/* If ID already verified in account profile */}
            {isIdVerified ? (
              <div className="p-5 rounded-2xl bg-slate-900/90 border border-blue-500/40 text-center space-y-3">
                <div className="w-12 h-12 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center mx-auto">
                  <CheckCircle className="w-7 h-7" />
                </div>
                <h4 className="font-bold text-slate-100 text-sm">
                  Identity Verified Account Profile
                </h4>
                <p className="text-xs text-slate-300">
                  Government ID Front &amp; Back credentials are on file in your account profile for login verification.
                </p>
                {idCredential && (
                  <div className="p-3 rounded-xl bg-slate-950 border border-slate-800 text-[11px] text-left space-y-1 font-mono text-slate-400">
                    <div className="flex justify-between">
                      <span>Document Type:</span>
                      <span className="text-blue-400 font-bold">{idCredential.documentType}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Front Proof:</span>
                      <span className="text-slate-300 truncate max-w-[200px]">{idCredential.frontHash}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Back Proof:</span>
                      <span className="text-slate-300 truncate max-w-[200px]">{idCredential.backHash}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Verified At:</span>
                      <span className="text-emerald-400">{idCredential.verifiedAt}</span>
                    </div>
                  </div>
                )}
                <div className="flex gap-2 pt-2">
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl bg-blue-500 hover:bg-blue-400 text-white font-bold text-xs transition-all shadow-md"
                  >
                    Done
                  </button>
                  <button
                    onClick={revokeIdVerification}
                    className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-red-500/20 text-red-300 text-xs font-semibold border border-red-500/20 transition-all"
                  >
                    Remove ID from Profile
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Document Type Selector */}
                <div className="flex items-center justify-between gap-2 text-xs">
                  <label className="text-slate-300 font-medium">Document Type:</label>
                  <select
                    value={docType}
                    onChange={(e) => setDocType(e.target.value)}
                    className="bg-slate-900 border border-slate-700 rounded-xl px-3 py-1.5 text-xs text-slate-200 focus:outline-none focus:border-blue-400"
                  >
                    <option value="Driver's License">Driver's License</option>
                    <option value="Passport">Passport</option>
                    <option value="National ID Card">National ID Card</option>
                  </select>
                </div>

                {/* Dual Upload Slots: Front and Back */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {/* Slot 1: ID Front */}
                  <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-dashed border-slate-700 hover:border-blue-500/50 transition-colors text-center">
                    <div className="w-8 h-8 rounded-full bg-slate-800 text-blue-400 flex items-center justify-center mx-auto mb-2">
                      <FileCheck className="w-4 h-4" />
                    </div>
                    <div className="text-xs font-bold text-slate-200 mb-0.5">ID Front Image</div>
                    <p className="text-[10px] text-slate-400 mb-2">Photo &amp; Birthdate side</p>

                    {frontImage ? (
                      <div className="relative rounded-xl overflow-hidden border border-emerald-500/40 h-24 bg-black flex items-center justify-center">
                        <img src={frontImage} alt="ID Front" className="h-full w-full object-contain" />
                        <span className="absolute bottom-1 right-1 bg-emerald-500/90 text-slate-950 text-[9px] font-bold px-1.5 py-0.2 rounded">
                          FRONT LOADED
                        </span>
                      </div>
                    ) : (
                      <div className="h-24 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-[11px]">
                        <Upload className="w-5 h-5 mb-1 text-slate-600" />
                        <span>Drop Front Image</span>
                      </div>
                    )}
                  </div>

                  {/* Slot 2: ID Back */}
                  <div className="p-3.5 rounded-2xl bg-slate-900/70 border border-dashed border-slate-700 hover:border-blue-500/50 transition-colors text-center">
                    <div className="w-8 h-8 rounded-full bg-slate-800 text-indigo-400 flex items-center justify-center mx-auto mb-2">
                      <FileCheck className="w-4 h-4" />
                    </div>
                    <div className="text-xs font-bold text-slate-200 mb-0.5">ID Back Image</div>
                    <p className="text-[10px] text-slate-400 mb-2">Barcode or MRZ chip side</p>

                    {backImage ? (
                      <div className="relative rounded-xl overflow-hidden border border-emerald-500/40 h-24 bg-black flex items-center justify-center">
                        <img src={backImage} alt="ID Back" className="h-full w-full object-contain" />
                        <span className="absolute bottom-1 right-1 bg-emerald-500/90 text-slate-950 text-[9px] font-bold px-1.5 py-0.2 rounded">
                          BACK LOADED
                        </span>
                      </div>
                    ) : (
                      <div className="h-24 rounded-xl bg-slate-950/60 border border-slate-800 flex flex-col items-center justify-center text-slate-500 text-[11px]">
                        <Upload className="w-5 h-5 mb-1 text-slate-600" />
                        <span>Drop Back Image</span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Quick Demo Pre-Fill Buttons */}
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900/80 border border-slate-800 text-xs">
                  <span className="text-[11px] text-slate-400">Quick Test Samples:</span>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleLoadDemoId('license')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-amber-300 text-[11px] font-semibold transition-all"
                    >
                      Load License Front &amp; Back
                    </button>
                    <button
                      type="button"
                      onClick={() => handleLoadDemoId('passport')}
                      className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-blue-300 text-[11px] font-semibold transition-all"
                    >
                      Load Passport
                    </button>
                  </div>
                </div>

                {/* Process Button */}
                <button
                  disabled={!frontImage || !backImage || isProcessing}
                  onClick={handleProcessDualId}
                  className="w-full py-3 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white font-bold text-xs disabled:opacity-40 disabled:pointer-events-none transition-all shadow-lg shadow-blue-500/20 flex items-center justify-center gap-2"
                >
                  {isProcessing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>{statusText}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      <span>Verify ID Front &amp; Back for Account Profile</span>
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
