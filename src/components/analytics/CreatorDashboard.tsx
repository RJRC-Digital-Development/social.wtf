'use client';

import React from 'react';
import { TransactionRecord, TreasuryMetrics } from '@/types';
import { formatAddress, getExplorerTxUrl, COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import {
  TrendingUp,
  Coins,
  ShieldCheck,
  ShoppingBag,
  ExternalLink,
  ArrowUpRight,
  PieChart,
  Landmark,
} from 'lucide-react';

interface CreatorDashboardProps {
  transactions: TransactionRecord[];
  metrics: TreasuryMetrics;
}

export const CreatorDashboard: React.FC<CreatorDashboardProps> = ({
  transactions,
  metrics,
}) => {
  // Aggregate stats
  const totalVolume = transactions.reduce((acc, tx) => acc + tx.totalAmountCook, 0);
  const totalCreatorEarnings = transactions.reduce((acc, tx) => acc + tx.creatorAmountCook, 0);
  const totalTreasuryFees = transactions.reduce((acc, tx) => acc + tx.treasuryAmountCook, 0);

  const tipsCount = transactions.filter((tx) => tx.actionType === 'tip').length;
  const storeSalesCount = transactions.filter((tx) => tx.actionType === 'store_purchase').length;

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Top Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Gross Volume */}
        <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Gross Platform Volume</span>
            <div className="p-2 rounded-xl bg-amber-500/10 text-amber-400">
              <Coins className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-300">
            {metrics.totalPlatformVolumeCook.toLocaleString()} COOK
          </div>
          <p className="text-[11px] text-emerald-400 mt-1 flex items-center gap-1 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" /> +24.8% this week
          </p>
        </div>

        {/* Net Creator Earnings (95%) */}
        <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Net Creator Earnings (95%)</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-emerald-400">
            {(metrics.totalPlatformVolumeCook * 0.95).toFixed(1)} COOK
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Direct to creator wallets</p>
        </div>

        {/* Platform Treasury Cut (5%) */}
        <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Treasury Protocol Cut (5%)</span>
            <div className="p-2 rounded-xl bg-blue-500/10 text-blue-400">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-blue-300">
            {metrics.totalTreasuryCollectedCook.toFixed(2)} COOK
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Funds ecosystem R&D</p>
        </div>

        {/* Total Interactions */}
        <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-slate-400 font-medium">Total On-Chain Txns</span>
            <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-100">
            {metrics.totalTransactionsCount.toLocaleString()}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Sub-second finality</p>
        </div>
      </div>

      {/* Treasury Protocol Fee Transparency Card */}
      <div className="p-5 rounded-3xl bg-gradient-to-r from-blue-950/40 via-[#0d1527] to-amber-950/30 border border-blue-500/30 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-2xl bg-blue-500/15 text-blue-400">
            <Landmark className="w-6 h-6" />
          </div>
          <div>
            <h3 className="font-bold text-slate-100 text-sm">
              Automated 5% Platform Treasury Split Mechanism
            </h3>
            <p className="text-xs text-slate-300 mt-0.5 leading-relaxed">
              Every economic interaction (tips, digital goods, subscriptions) splits funds automatically at the smart contract level: 95% proceeds to creator, 5% to the Cookie Chain treasury wallet.
            </p>
          </div>
        </div>

        <div className="shrink-0 font-mono text-xs text-right">
          <span className="text-slate-400 block text-[10px]">Treasury Vault Address</span>
          <span className="text-blue-300 font-semibold bg-slate-900 px-3 py-1.5 rounded-xl border border-slate-800 inline-block">
            {formatAddress(COOKIE_CHAIN_CONFIG.treasuryPublicKey, 6)}
          </span>
        </div>
      </div>

      {/* Recent On-Chain Transactions Table */}
      <div className="rounded-3xl bg-[#0d1527] border border-slate-700/80 p-5 shadow-xl">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-800">
          <div className="flex items-center gap-2">
            <Coins className="w-4 h-4 text-amber-400" />
            <h3 className="font-bold text-slate-100 text-sm">Recent On-Chain Activity</h3>
          </div>
          <span className="text-xs text-slate-400 font-mono">Cookie Chain SVM</span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="text-slate-500 border-b border-slate-800/80 font-medium">
                <th className="pb-2.5">Action</th>
                <th className="pb-2.5">Item / Memo</th>
                <th className="pb-2.5">Total ($COOK)</th>
                <th className="pb-2.5">Creator Proceeds</th>
                <th className="pb-2.5">Treasury (5%)</th>
                <th className="pb-2.5">Time</th>
                <th className="pb-2.5 text-right">CookieScan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60 font-mono">
              {transactions.map((tx) => (
                <tr key={tx.id} className="hover:bg-slate-800/30 transition-colors">
                  <td className="py-3 font-sans">
                    <span
                      className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${
                        tx.actionType === 'store_purchase'
                          ? 'bg-amber-500/15 text-amber-300 border border-amber-500/30'
                          : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                      }`}
                    >
                      {tx.actionType.toUpperCase().replace('_', ' ')}
                    </span>
                  </td>
                  <td className="py-3 font-sans text-slate-300 max-w-[180px] truncate">
                    {tx.itemTitle || 'Direct Creator Tip'}
                  </td>
                  <td className="py-3 font-bold text-amber-300">
                    {tx.totalAmountCook.toFixed(2)} COOK
                  </td>
                  <td className="py-3 text-emerald-400">
                    +{tx.creatorAmountCook.toFixed(3)}
                  </td>
                  <td className="py-3 text-blue-400">
                    +{tx.treasuryAmountCook.toFixed(3)}
                  </td>
                  <td className="py-3 font-sans text-slate-400 text-[11px]">
                    {tx.timestamp}
                  </td>
                  <td className="py-3 text-right">
                    <a
                      href={getExplorerTxUrl(tx.signature)}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex items-center gap-1 text-amber-400 hover:text-amber-300 underline"
                    >
                      <span>{formatAddress(tx.signature, 3)}</span>
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
