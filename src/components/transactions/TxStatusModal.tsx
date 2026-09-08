'use client';

import React from 'react';
import { ExternalLink, CheckCircle2, AlertCircle, Loader2, Sparkles } from 'lucide-react';
import confetti from 'canvas-confetti';
import { getExplorerTxUrl } from '@/lib/solana/cookieChain';

export type TxStep = 'idle' | 'preparing' | 'signing' | 'broadcasting' | 'confirmed' | 'error';

interface TxStatusModalProps {
  isOpen: boolean;
  step: TxStep;
  actionTitle: string;
  signature?: string;
  errorMessage?: string;
  totalAmountCook?: number;
  creatorAmountCook?: number;
  treasuryAmountCook?: number;
  recipientName?: string;
  onClose: () => void;
  onRetry?: () => void;
}

export const TxStatusModal: React.FC<TxStatusModalProps> = ({
  isOpen,
  step,
  actionTitle,
  signature,
  errorMessage,
  totalAmountCook,
  creatorAmountCook,
  treasuryAmountCook,
  recipientName,
  onClose,
  onRetry,
}) => {
  React.useEffect(() => {
    if (step === 'confirmed') {
      try {
        confetti({
          particleCount: 80,
          spread: 70,
          origin: { y: 0.6 },
          colors: ['#f59e0b', '#fbbf24', '#3b82f6', '#10b981'],
        });
      } catch (e) {
        // ignore
      }
    }
  }, [step]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-md bg-[#0d1527] border border-slate-700/80 rounded-3xl p-6 shadow-2xl text-center">
        {/* Step Icons and State */}
        {step === 'preparing' && (
          <div className="flex flex-col items-center py-4">
            <div className="w-16 h-16 rounded-full bg-blue-500/10 border border-blue-500/30 flex items-center justify-center mb-4 text-blue-400">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-slate-100">Preparing Transaction...</h3>
            <p className="text-xs text-slate-400 mt-1">
              Calculating 5% platform treasury fee & fetching Cookie Chain blockhash
            </p>
          </div>
        )}

        {step === 'signing' && (
          <div className="flex flex-col items-center py-4">
            <div className="w-16 h-16 rounded-full bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-4 text-amber-400 animate-pulse">
              <Sparkles className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-slate-100">Awaiting Signature</h3>
            <p className="text-xs text-slate-400 mt-1">
              Please approve the transaction in your Nightly / SVM Wallet
            </p>
          </div>
        )}

        {step === 'broadcasting' && (
          <div className="flex flex-col items-center py-4">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400">
              <Loader2 className="w-8 h-8 animate-spin" />
            </div>
            <h3 className="text-lg font-bold text-slate-100">Broadcasting to Cookie Chain</h3>
            <p className="text-xs text-slate-400 mt-1">
              Executing atomic split with ~1-second SVM finality...
            </p>
          </div>
        )}

        {step === 'confirmed' && (
          <div className="flex flex-col items-center py-2">
            <div className="w-16 h-16 rounded-full bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mb-4 text-emerald-400">
              <CheckCircle2 className="w-9 h-9 text-emerald-400" />
            </div>
            <h3 className="text-xl font-bold text-slate-100">Transaction Confirmed!</h3>
            <p className="text-xs text-emerald-400 font-medium mt-0.5">
              Settled on Cookie Chain SVM
            </p>
          </div>
        )}

        {step === 'error' && (
          <div className="flex flex-col items-center py-2">
            <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mb-4 text-red-400">
              <AlertCircle className="w-9 h-9" />
            </div>
            <h3 className="text-xl font-bold text-slate-100">Transaction Failed</h3>
            <p className="text-xs text-red-400 mt-1 px-4">
              {errorMessage || 'Signature rejected or insufficient funds on Cookie Chain.'}
            </p>
          </div>
        )}

        {/* Transaction Breakdown Details */}
        {totalAmountCook && (
          <div className="mt-4 p-4 rounded-2xl bg-slate-900/90 border border-slate-800 text-left text-xs space-y-2">
            <div className="flex justify-between items-center text-slate-400">
              <span>Action:</span>
              <span className="font-semibold text-slate-200">{actionTitle}</span>
            </div>
            {recipientName && (
              <div className="flex justify-between items-center text-slate-400">
                <span>Creator:</span>
                <span className="font-medium text-slate-300">{recipientName}</span>
              </div>
            )}
            <div className="pt-2 border-t border-slate-800 space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-slate-400">Total Payment:</span>
                <span className="font-mono font-bold text-amber-300">
                  {totalAmountCook.toFixed(3)} COOK
                </span>
              </div>
              <div className="flex justify-between items-center pl-2 text-slate-400 text-[11px]">
                <span>↳ Creator Proceeds (95%):</span>
                <span className="font-mono text-emerald-400">
                  +{creatorAmountCook?.toFixed(3)} COOK
                </span>
              </div>
              <div className="flex justify-between items-center pl-2 text-slate-400 text-[11px]">
                <span>↳ Social.wtf Treasury (5%):</span>
                <span className="font-mono text-blue-400">
                  +{treasuryAmountCook?.toFixed(3)} COOK
                </span>
              </div>
            </div>
          </div>
        )}

        {/* Signature link */}
        {signature && (
          <div className="mt-4">
            <a
              href={getExplorerTxUrl(signature)}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 underline font-mono break-all"
            >
              <span>View On-Chain on CookieScan</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </a>
          </div>
        )}

        {/* Actions */}
        <div className="mt-6 flex gap-3">
          {step === 'error' && onRetry && (
            <button
              onClick={onRetry}
              className="flex-1 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-all"
            >
              Retry
            </button>
          )}
          {(step === 'confirmed' || step === 'error') && (
            <button
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 font-bold text-sm hover:brightness-110 transition-all"
            >
              Done
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
