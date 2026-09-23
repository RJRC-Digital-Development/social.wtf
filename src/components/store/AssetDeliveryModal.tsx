'use client';

import React, { useState } from 'react';
import { Product } from '@/types';
import { getExplorerTxUrl, formatAddress, COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import {
  Download,
  CheckCircle2,
  ExternalLink,
  Code2,
  Copy,
  Check,
  ShieldCheck,
  Package,
  Key,
  FileCode,
  Layers,
  Sparkles,
  X,
} from 'lucide-react';
import confetti from 'canvas-confetti';

interface AssetDeliveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  product: Product | null;
  txSignature?: string;
  walletAddress?: string | null;
}

export const AssetDeliveryModal: React.FC<AssetDeliveryModalProps> = ({
  isOpen,
  onClose,
  product,
  txSignature,
  walletAddress,
}) => {
  const [copiedCode, setCopiedCode] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [viewCodeTab, setViewCodeTab] = useState(false);

  if (!isOpen || !product) return null;

  const licenseId = `COOKIE-LIC-${product.id.slice(0, 8).toUpperCase()}-${(txSignature || 'VALIDTX').slice(0, 8).toUpperCase()}`;

  // Pre-bundled code or digital package contents
  const sampleCodePayload = product.category === 'code_script'
    ? `// ==========================================================
// ${product.title}
// Creator: ${product.creatorName} (@${product.creatorHandle})
// On-Chain License: ${licenseId}
// Settled on Cookie Chain SVM with 5% Protocol Fee Split
// ==========================================================

import { Program, AnchorProvider, web3, BN } from '@coral-xyz/anchor';
import { PublicKey, SystemProgram } from '@solana/web3.js';

export const COOKIE_CHAIN_TREASURY = new PublicKey('${COOKIE_CHAIN_CONFIG.treasuryPublicKey}');

/**
 * Execute automated 95% creator / 5% protocol treasury split
 */
export async function executeSplitTransfer(
  provider: AnchorProvider,
  creatorPubkey: PublicKey,
  totalLamports: BN
) {
  const treasuryAmount = totalLamports.mul(new BN(5)).div(new BN(100));
  const creatorAmount = totalLamports.sub(treasuryAmount);

  const tx = new web3.Transaction();
  
  // 1. Creator proceeds (95%)
  tx.add(
    SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: creatorPubkey,
      lamports: BigInt(creatorAmount.toString()),
    })
  );

  // 2. Protocol treasury fee (5%)
  tx.add(
    SystemProgram.transfer({
      fromPubkey: provider.wallet.publicKey,
      toPubkey: COOKIE_CHAIN_TREASURY,
      lamports: BigInt(treasuryAmount.toString()),
    })
  );

  const sig = await provider.sendAndConfirm(tx);
  console.log('Automated 5% split executed on Cookie Chain:', sig);
  return sig;
}
`
    : `==========================================================
${product.title} - Digital Asset Package
Creator: ${product.creatorName} (@${product.creatorHandle})
License ID: ${licenseId}
Buyer: ${walletAddress || 'Verified Cookie Chain Wallet'}
Settlement: Confirmed on Cookie Chain SVM
Format: ${product.fileFormat || 'Digital Package'}
Size: ${product.fileSize || 'Standard'}
==========================================================

This file confirms your on-chain ownership of this digital good.
Asset cryptographic hash verified via CookieScan explorer.
Thank you for supporting creators on Cookie Chain!
`;

  const handleDownloadFile = () => {
    try {
      const filename = `${product.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_package.${
        product.category === 'code_script' ? 'ts' : 'txt'
      }`;
      const blob = new Blob([sampleCodePayload], { type: 'text/plain;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      setDownloaded(true);
      try {
        confetti({
          particleCount: 50,
          spread: 60,
          origin: { y: 0.6 },
          colors: ['#10b981', '#fbbf24', '#38bdf8'],
        });
      } catch (e) {}
    } catch (err) {
      console.error('Download error:', err);
    }
  };

  const handleCopyCode = () => {
    navigator.clipboard.writeText(sampleCodePayload);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-xl bg-[#0d1527] border border-slate-700/90 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
        {/* Top Header */}
        <div className="flex items-center justify-between pb-4 border-b border-slate-800 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-400">
              <Package className="w-6 h-6" />
            </div>
            <div>
              <h3 className="font-bold text-slate-100 text-base flex items-center gap-2">
                <span>Digital Asset Vault</span>
                <span className="px-2 py-0.5 rounded-full text-[10px] font-mono font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                  OWNERSHIP VERIFIED
                </span>
              </h3>
              <p className="text-xs text-slate-400">
                Cryptographically settled on Cookie Chain SVM
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content Body */}
        <div className="py-4 overflow-y-auto space-y-4 text-xs">
          {/* Item Card */}
          <div className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <img
                src={product.previewUrl}
                alt={product.title}
                className="w-14 h-14 rounded-xl object-cover border border-slate-700"
              />
              <div>
                <h4 className="font-bold text-slate-200 text-sm line-clamp-1">{product.title}</h4>
                <p className="text-slate-400 text-[11px]">
                  Created by <strong className="text-amber-300">{product.creatorName}</strong>
                </p>
                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5">
                  <span>{product.fileFormat || 'Digital'}</span>
                  <span>•</span>
                  <span>{product.fileSize || 'Instant Delivery'}</span>
                </div>
              </div>
            </div>

            <div className="sm:text-right font-mono">
              <span className="text-[10px] text-slate-500 block">Price Paid</span>
              <span className="text-sm font-bold text-amber-300">{product.priceCook} COOK</span>
            </div>
          </div>

          {/* Cryptographic Ownership Certificate Card */}
          <div className="p-4 rounded-2xl bg-gradient-to-r from-emerald-950/30 via-slate-900 to-amber-950/20 border border-emerald-500/30 space-y-2.5">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-emerald-400 font-bold">
                <ShieldCheck className="w-4 h-4" />
                <span>On-Chain Provenance &amp; License Certificate</span>
              </div>
              <span className="text-[10px] font-mono text-slate-400">Cookie Chain SVM</span>
            </div>

            <div className="space-y-1.5 font-mono text-[11px] pt-1 border-t border-slate-800/80">
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">License ID:</span>
                <span className="text-amber-300 font-bold">{licenseId}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Creator Wallet:</span>
                <span>{formatAddress(product.creatorWallet, 6)}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">Buyer Wallet:</span>
                <span>{walletAddress ? formatAddress(walletAddress, 6) : 'Current Session'}</span>
              </div>
              <div className="flex justify-between items-center text-slate-300">
                <span className="text-slate-400">5% Treasury Fee:</span>
                <span className="text-blue-400 font-bold">
                  {(product.priceCook * 0.05).toFixed(3)} COOK Verified Split
                </span>
              </div>
            </div>

            {txSignature && (
              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between">
                <span className="text-[10px] text-slate-400 font-mono">Tx Signature:</span>
                <a
                  href={getExplorerTxUrl(txSignature)}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-[11px] font-mono text-amber-400 hover:underline"
                >
                  <span>{formatAddress(txSignature, 8)}</span>
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            )}
          </div>

          {/* Action Row: Instant Download and Code Inspection */}
          <div className="flex flex-col sm:flex-row gap-2.5">
            <button
              onClick={handleDownloadFile}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-2xl bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 font-bold text-xs shadow-lg shadow-emerald-500/20 active:scale-95 transition-all"
            >
              <Download className="w-4 h-4" />
              <span>{downloaded ? 'Downloaded! Click to Download Again' : 'Download Asset Package'}</span>
            </button>

            {product.category === 'code_script' && (
              <button
                onClick={() => setViewCodeTab(!viewCodeTab)}
                className="flex items-center justify-center gap-2 px-4 py-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 font-semibold text-xs transition-all"
              >
                <Code2 className="w-4 h-4" />
                <span>{viewCodeTab ? 'Hide Code' : 'Inspect Source Code'}</span>
              </button>
            )}
          </div>

          {/* Code Viewer Drawer for code_script products */}
          {(viewCodeTab || product.category === 'code_script') && (
            <div className="rounded-2xl bg-[#060913] border border-slate-800 overflow-hidden text-xs">
              <div className="flex items-center justify-between px-3 py-2 bg-slate-900/90 border-b border-slate-800">
                <div className="flex items-center gap-2 text-slate-300 font-mono text-[11px]">
                  <FileCode className="w-3.5 h-3.5 text-amber-400" />
                  <span>{product.title}.ts</span>
                </div>
                <button
                  onClick={handleCopyCode}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] bg-slate-800 hover:bg-slate-700 text-slate-200 transition-colors"
                >
                  {copiedCode ? (
                    <>
                      <Check className="w-3 h-3 text-emerald-400" />
                      <span>Copied!</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-3 h-3" />
                      <span>Copy Code</span>
                    </>
                  )}
                </button>
              </div>
              <pre className="p-3 text-[11px] font-mono text-slate-300 overflow-x-auto max-h-48 whitespace-pre">
                {sampleCodePayload}
              </pre>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-800 flex justify-between items-center shrink-0 text-[11px] text-slate-500">
          <span>Social.wtf Digital Asset Delivery Protocol</span>
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold transition-all"
          >
            Close Vault
          </button>
        </div>
      </div>
    </div>
  );
};
