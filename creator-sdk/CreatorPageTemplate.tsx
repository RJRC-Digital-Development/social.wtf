import React, { useState } from 'react';

export interface CreatorProduct {
  id: string;
  title: string;
  description: string;
  priceCook: number;
  category: string;
  previewUrl: string;
  downloadUrl?: string;
}

export interface CreatorPageProps {
  handle: string;
  name: string;
  avatar: string;
  bio: string;
  walletAddress: string;
  coverImage?: string;
  treasuryCutPct?: number; // default 5%
  products?: CreatorProduct[];
  children?: React.ReactNode;
}

/**
 * Clean, concise Creator Page Template for Cookie Chain creators.
 * Exposes sovereign storefront, tipping, and widget slots
 * while keeping internal platform neural scanners securely abstracted.
 */
export const CreatorPageTemplate: React.FC<CreatorPageProps> = ({
  handle,
  name,
  avatar,
  bio,
  walletAddress,
  coverImage,
  treasuryCutPct = 5,
  products = [],
  children,
}) => {
  const [tipSuccess, setTipSuccess] = useState(false);

  const calculateSplit = (amount: number) => {
    const treasury = (amount * treasuryCutPct) / 100;
    const creatorProceeds = amount - treasury;
    return { creatorProceeds, treasury };
  };

  return (
    <div className="w-full max-w-4xl mx-auto rounded-3xl overflow-hidden bg-[#0d1527] border border-slate-700/80 shadow-2xl text-slate-100 font-sans">
      {/* Cover */}
      <div className="h-44 w-full bg-slate-800 relative overflow-hidden">
        {coverImage ? (
          <img src={coverImage} alt="Cover" className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full bg-gradient-to-r from-amber-600 via-yellow-700 to-indigo-900" />
        )}
      </div>

      {/* Profile Header */}
      <div className="px-6 pb-6 pt-0 -mt-14 relative flex flex-col sm:flex-row items-start sm:items-end justify-between gap-4">
        <div className="flex items-end gap-3.5">
          <img
            src={avatar}
            alt={name}
            className="w-24 h-24 rounded-3xl object-cover border-4 border-[#0d1527] shadow-xl bg-slate-900"
          />
          <div>
            <h1 className="text-xl font-bold text-white">{name}</h1>
            <p className="text-xs text-slate-400 font-mono">@{handle}</p>
          </div>
        </div>

        <div className="text-xs px-3 py-1.5 rounded-xl bg-slate-900/90 border border-slate-800 text-emerald-400 font-mono">
          95% Creator Proceeds • 5% Protocol Fee
        </div>
      </div>

      {/* Bio */}
      <div className="px-6 pb-4 border-b border-slate-800/80 text-xs text-slate-300 leading-relaxed">
        <p>{bio}</p>
        <div className="mt-2 font-mono text-[11px] text-slate-400">
          <span className="text-amber-400">Cookie Chain SVM Address:</span> {walletAddress}
        </div>
      </div>

      {/* Modular Creator Slots */}
      <div className="p-6 space-y-6">
        {/* Children Widgets */}
        {children}

        {/* Storefront Section */}
        {products.length > 0 && (
          <div className="space-y-3">
            <h3 className="font-bold text-sm text-slate-200">Digital Storefront Drops</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {products.map((item) => (
                <div
                  key={item.id}
                  className="p-4 rounded-2xl bg-slate-900/80 border border-slate-800 hover:border-amber-500/40 transition-colors space-y-2.5"
                >
                  <img
                    src={item.previewUrl}
                    alt={item.title}
                    className="w-full h-36 rounded-xl object-cover"
                  />
                  <div className="flex justify-between items-start">
                    <div>
                      <h4 className="font-bold text-xs text-slate-100">{item.title}</h4>
                      <p className="text-[11px] text-slate-400 line-clamp-2">{item.description}</p>
                    </div>
                    <span className="font-mono font-bold text-amber-400 text-xs shrink-0 ml-2">
                      {item.priceCook} COOK
                    </span>
                  </div>
                  <button
                    onClick={() => alert(`Purchasing ${item.title} on Cookie Chain SVM...`)}
                    className="w-full py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all"
                  >
                    Buy on Cookie Chain
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
