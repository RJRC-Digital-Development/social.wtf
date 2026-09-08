import React, { useState } from 'react';
import { User, Product, Post, CreatorWidget } from '@/types';
import { useShield } from '@/lib/shield/shieldContext';
import { Storefront } from '../store/Storefront';
import { PostCard } from '../feed/PostCard';
import { AudioPlayer } from '../feed/AudioPlayer';
import { CustomCodeWidget } from '../widgets/CustomCodeWidget';
import { CustomCodeStudio } from '../widgets/CustomCodeStudio';
import {
  CheckCircle,
  ShoppingBag,
  Grid,
  Sliders,
  Radio,
  Target,
  ExternalLink,
  Coins,
  Sparkles,
  Code2,
  PlusCircle,
  UserCheck,
  Camera,
  Upload,
  Smartphone,
  ShieldCheck,
  Lock,
} from 'lucide-react';

interface CreatorProfileProps {
  creator: User;
  posts: Post[];
  products: Product[];
  onAddProduct: (prod: Product) => void;
  onPostUpdated: (post: Post) => void;
  onOpenVerifyModal?: (tab?: 'video_liveness' | 'id_upload') => void;
}

export const CreatorProfile: React.FC<CreatorProfileProps> = ({
  creator,
  posts,
  products,
  onAddProduct,
  onPostUpdated,
  onOpenVerifyModal,
}) => {
  const { isIdVerified, isVideoVerified, idCredential, canAccessXxx } = useShield();
  const [activeTab, setActiveTab] = useState<'store' | 'feed' | 'widgets'>('widgets');
  const [crowdfundRaised, setCrowdfundRaised] = useState(76.5);
  const [studioOpen, setStudioOpen] = useState(false);

  // Initialize with creator's widgets and a default custom code mini-app
  const [widgetsList, setWidgetsList] = useState<CreatorWidget[]>([
    {
      id: 'default-custom-code',
      type: 'custom_code',
      title: '🍪 Cookie Clicker On-Chain Mini-App',
      enabled: true,
      data: {
        description: 'Interactive creator-authored game running in client-side sandbox.',
        html: `<div style="text-align: center;">
  <h3 style="color: #fbbf24; font-size: 15px; margin-bottom: 4px;">🍪 Cookie Baker Mini-Game</h3>
  <p style="color: #94a3b8; font-size: 11px; margin-bottom: 10px;">Click the cookie to bake $COOK on Cookie Chain!</p>
  <button id="cookieBtn" style="font-size: 48px; background: none; border: none; cursor: pointer; transition: transform 0.1s; user-select: none;">🍪</button>
  <div style="margin: 10px 0; font-family: monospace; font-size: 13px; color: #38bdf8; display: flex; justify-content: space-around; background: #070b14; padding: 8px; border-radius: 12px; border: 1px solid #1e293b;">
    <div>Baked: <strong id="score" style="color: #fbbf24;">0</strong> COOK</div>
    <div>Speed: <span id="cps">0.0</span> /s</div>
  </div>
  <button id="upgradeBtn" style="background: #ca8a2c; color: #000; border: none; padding: 8px 14px; border-radius: 10px; font-size: 11px; font-weight: bold; cursor: pointer; width: 100%;">Buy Auto-Baker (+1/s) [Cost: 10 COOK]</button>
</div>`,
        css: `button:active { transform: scale(0.92); }`,
        js: `let count = 0; let autoBake = 0; let upgradeCost = 10;
const scoreEl = document.getElementById('score');
const cpsEl = document.getElementById('cps');
const btn = document.getElementById('cookieBtn');
const upBtn = document.getElementById('upgradeBtn');
btn.addEventListener('click', () => {
  count += 1;
  scoreEl.textContent = count;
  btn.style.transform = 'scale(1.2)';
  setTimeout(() => btn.style.transform = 'scale(1)', 100);
});
upBtn.addEventListener('click', () => {
  if (count >= upgradeCost) {
    count -= upgradeCost;
    autoBake += 1;
    upgradeCost = Math.round(upgradeCost * 1.5);
    scoreEl.textContent = count;
    cpsEl.textContent = autoBake.toFixed(1);
    upBtn.textContent = 'Buy Auto-Baker (+1/s) [Cost: ' + upgradeCost + ' COOK]';
  } else {
    alert('Need ' + upgradeCost + ' COOK to upgrade!');
  }
});
setInterval(() => {
  if (autoBake > 0) {
    count += autoBake;
    scoreEl.textContent = count;
  }
}, 1000);`,
      },
    },
    ...(creator.widgets || []),
  ]);

  const handleSaveCustomWidget = (newWidget: CreatorWidget) => {
    setWidgetsList([newWidget, ...widgetsList]);
  };

  const creatorPosts = posts.filter((p) => p.author.handle === creator.handle);
  const creatorProducts = products.filter((p) => p.creatorHandle === creator.handle);

  return (
    <div className="space-y-6">
      {/* Profile Header Mini-App Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-[#0d1527] border border-slate-700/80 shadow-2xl">
        {/* Cover Banner */}
        <div className="h-44 md:h-56 w-full relative bg-slate-900 overflow-hidden">
          {creator.coverImage ? (
            <img
              src={creator.coverImage}
              alt="Cover"
              className="w-full h-full object-cover brightness-90"
            />
          ) : (
            <div className="w-full h-full bg-gradient-to-r from-blue-900 via-amber-900 to-indigo-900" />
          )}
          <div className="absolute inset-0 bg-gradient-to-t from-[#0d1527] via-transparent to-black/30" />
        </div>

        {/* Creator Info Overlay */}
        <div className="relative px-6 pb-6 pt-0 flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-16">
          <div className="flex items-end gap-4">
            <img
              src={creator.avatar}
              alt={creator.name}
              className="w-24 h-24 md:w-28 md:h-28 rounded-3xl object-cover border-4 border-[#0d1527] shadow-xl bg-slate-900"
            />
            <div className="mb-2">
              <div className="flex items-center gap-2">
                <h1 className="text-xl md:text-2xl font-bold text-slate-100">
                  {creator.name}
                </h1>
                {creator.verified && (
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                    ✓
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                  CREATOR MINI-APP
                </span>
              </div>
              <p className="text-xs text-slate-400 font-mono">@{creator.handle}</p>

              {/* Account Profile Verification & Sentinel AI Badges */}
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                {isIdVerified ? (
                  <span className="px-2 py-0.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[10px] font-bold text-emerald-300 flex items-center gap-1">
                    <UserCheck className="w-3 h-3 text-emerald-400" />
                    <span>ID Verified Account (Front &amp; Back on Profile)</span>
                  </span>
                ) : (
                  onOpenVerifyModal && (
                    <button
                      onClick={() => onOpenVerifyModal('id_upload')}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-slate-300 flex items-center gap-1 transition-colors"
                    >
                      <Upload className="w-3 h-3 text-blue-400" />
                      <span>Upload ID Front &amp; Back to Profile</span>
                    </button>
                  )
                )}

                {isVideoVerified ? (
                  <span className="px-2 py-0.5 rounded-lg bg-purple-500/15 border border-purple-500/30 text-[10px] font-bold text-purple-300 flex items-center gap-1">
                    <Camera className="w-3 h-3 text-purple-400" />
                    <span>AI Sentinel Video Verified (XXX Unlocked)</span>
                  </span>
                ) : (
                  onOpenVerifyModal && (
                    <button
                      onClick={() => onOpenVerifyModal('video_liveness')}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 transition-colors"
                    >
                      <Camera className="w-3 h-3 text-amber-400" />
                      <span>Live Video Check (Access XXX Feature)</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4 text-xs">
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <span className="font-bold text-slate-200 block text-sm font-mono">
                {creator.followersCount.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Followers</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <span className="font-bold text-amber-400 block text-sm font-mono">
                {creatorProducts.length}
              </span>
              <span className="text-[10px] text-slate-400">Store Drops</span>
            </div>
            <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <span className="font-bold text-emerald-400 block text-sm font-mono">
                95%
              </span>
              <span className="text-[10px] text-slate-400">Proceeds Cut</span>
            </div>
          </div>
        </div>

        {/* Bio & Micro-Ecosystem Description */}
        <div className="px-6 pb-6 pt-2 border-t border-slate-800/80">
          <p className="text-slate-300 text-xs md:text-sm leading-relaxed max-w-3xl">
            {creator.bio}
          </p>
          <div className="mt-3 flex items-center gap-2 font-mono text-[11px] text-slate-400">
            <span className="text-amber-400">SVM Address:</span>
            <span className="bg-slate-900/80 px-2 py-0.5 rounded border border-slate-800">
              {creator.walletAddress}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex px-6 border-t border-slate-800/80 bg-slate-900/40">
          <button
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'store'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Storefront ({creatorProducts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('widgets')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'widgets'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span>Mini-App Widgets ({widgetsList.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('feed')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all ${
              activeTab === 'feed'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Grid className="w-4 h-4" />
            <span>Creator Feed ({creatorPosts.length})</span>
          </button>
        </div>
      </div>

      {/* Parental & Guardian Device Safeguard Alert for Mature Profiles */}
      {!isVideoVerified && creator.handle === 'sol_vixen' && (
        <div className="p-4 rounded-3xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs shadow-xl animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <Smartphone className="w-5 h-5" />
            </div>
            <div>
              <strong className="text-amber-300 block text-sm font-bold">
                Parental &amp; Guardian Device Safeguard Active
              </strong>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Verification is required upon access to guarantee that an underage child is not accessing mature content through a parent or guardian's device. 
                <span className="text-emerald-300 font-semibold block sm:inline sm:ml-1">
                  Verified by Sentinel AI Agent — no government ID required virtually.
                </span>
              </p>
            </div>
          </div>
          {onOpenVerifyModal && (
            <button
              onClick={() => onOpenVerifyModal('video_liveness')}
              className="shrink-0 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md"
            >
              Verify Live Video Now
            </button>
          )}
        </div>
      )}

      {/* Tab 1: Creator Storefront */}
      {activeTab === 'store' && (
        <Storefront
          products={products}
          creatorHandle={creator.handle}
          onAddProduct={onAddProduct}
        />
      )}

      {/* Tab 2: Customizable Mini-App Widgets */}
      {activeTab === 'widgets' && (
        <div className="space-y-6">
          {/* Create Your Own Code Mini-App Callout Banner */}
          <div className="p-5 rounded-3xl bg-gradient-to-r from-amber-500/15 via-[#0d1527] to-blue-500/15 border border-amber-500/30 shadow-xl flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30">
                <Code2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-100 text-sm flex items-center gap-2">
                  <span>Creator Code Studio</span>
                  <span className="px-2 py-0.5 rounded-full text-[9px] font-mono font-bold bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    PROGRAMMABLE PROFILE
                  </span>
                </h3>
                <p className="text-xs text-slate-300 mt-0.5">
                  Write, customize, and deploy your own interactive code mini-apps, games, or Web3 widgets directly to your personal ecosystem.
                </p>
              </div>
            </div>

            <button
              onClick={() => setStudioOpen(true)}
              className="shrink-0 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-amber-500/20"
            >
              <Code2 className="w-4 h-4" />
              <span>Write Custom Code Mini-App</span>
            </button>
          </div>

          {/* Render Custom Code Mini-Apps First */}
          <div className="space-y-5">
            {widgetsList
              .filter((w) => w.type === 'custom_code')
              .map((w) => (
                <CustomCodeWidget
                  key={w.id}
                  title={w.title}
                  description={w.data?.description}
                  codeHtml={w.data?.html || ''}
                  codeCss={w.data?.css || ''}
                  codeJs={w.data?.js || ''}
                  authorName={creator.name}
                />
              ))}
          </div>

          {/* Standard Modular Widgets Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Widget 1: Audio Spotlight */}
            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Radio className="w-4 h-4 text-amber-400" />
                  <span>Audio Spotlight Widget</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-emerald-500/10 text-emerald-400 font-medium">
                  Live On Profile
                </span>
              </div>
              <AudioPlayer
                audioUrl="https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3"
                title="Midnight In Gorbagana (SVM Mix)"
                artist={creator.name}
              />
            </div>

            {/* Widget 2: Tipping Jar Crowdfund Goal */}
            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-4">
              <div className="flex items-center justify-between pb-2 border-b border-slate-800">
                <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
                  <Target className="w-4 h-4 text-amber-400" />
                  <span>Crowdfund Tip Goal Widget</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] bg-blue-500/10 text-blue-400 font-medium font-mono">
                  {crowdfundRaised} / 100 COOK
                </span>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1.5">
                  <span className="text-slate-300 font-medium">Funding Community Album EP</span>
                  <span className="text-amber-400 font-bold font-mono">
                    {Math.round((crowdfundRaised / 100) * 100)}%
                  </span>
                </div>
                <div className="w-full bg-slate-800 h-3 rounded-full overflow-hidden p-0.5">
                  <div
                    className="h-full bg-gradient-to-r from-amber-500 to-yellow-400 rounded-full transition-all duration-500"
                    style={{ width: `${Math.min(100, (crowdfundRaised / 100) * 100)}%` }}
                  />
                </div>
              </div>

              <p className="text-[11px] text-slate-400 leading-relaxed">
                Every tip automatically triggers a 5% split to the Social.wtf treasury to fund upcoming platform features and validator grants.
              </p>

              <button
                onClick={() => setCrowdfundRaised((prev) => Math.min(100, prev + 5))}
                className="w-full py-2 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 border border-amber-500/40 text-amber-300 font-semibold text-xs transition-all flex items-center justify-center gap-2"
              >
                <Coins className="w-3.5 h-3.5" />
                <span>Contribute 5 $COOK to Goal</span>
              </button>
            </div>

            {/* Widget 3: Official Links */}
            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/70 shadow-xl space-y-3">
              <div className="flex items-center gap-2 text-xs font-bold text-amber-300 pb-2 border-b border-slate-800">
                <ExternalLink className="w-4 h-4 text-amber-400" />
                <span>Verified Creator Links</span>
              </div>
              <div className="space-y-2 text-xs">
                <a
                  href="https://docs.cookiechain.wtf"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                >
                  <span>Cookie Chain Documentation</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>
                <a
                  href="https://cookiescan.io"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                >
                  <span>CookieScan Explorer</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>
                <a
                  href="https://t.me/TheCookieNetChain"
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center justify-between p-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 transition-colors"
                >
                  <span>Cookie Chain Official Telegram</span>
                  <ExternalLink className="w-3.5 h-3.5 text-slate-500" />
                </a>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Creator Posts */}
      {activeTab === 'feed' && (
        <div className="space-y-4">
          {creatorPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onPostUpdated={onPostUpdated}
            />
          ))}
        </div>
      )}

      {/* Custom Code Studio Modal */}
      <CustomCodeStudio
        isOpen={studioOpen}
        onClose={() => setStudioOpen(false)}
        onSaveWidget={handleSaveCustomWidget}
      />
    </div>
  );
};
