'use client';

import React, { useState } from 'react';
import { User, Product, Post, CreatorWidget, TransactionRecord } from '@/types';
import { useShield } from '@/lib/shield/shieldContext';
import { useWallet } from '@/lib/wallet/walletContext';
import { TxStatusModal, TxStep } from '../transactions/TxStatusModal';
import { Storefront } from '../store/Storefront';
import { PostCard } from '../feed/PostCard';
import { AudioPlayer } from '../feed/AudioPlayer';
import { CustomCodeWidget } from '../widgets/CustomCodeWidget';
import { CustomCodeStudio } from '../widgets/CustomCodeStudio';
import { EditProfileModal } from './EditProfileModal';
import { FriendsModal } from './FriendsModal';
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
  Edit3,
  Share2,
  Copy,
  Check,
  Link as LinkIcon,
  UserPlus,
  Heart,
  DollarSign,
  TrendingUp,
  Zap,
  Gift,
  Users,
} from 'lucide-react';

interface CreatorProfileProps {
  creator: User;
  posts: Post[];
  products: Product[];
  onAddProduct: (prod: Product) => void;
  onPostUpdated: (post: Post, meta?: { tipAmount?: number; signature?: string }) => void;
  onOpenVerifyModal?: (tab?: 'card_auth' | 'video_liveness' | 'id_upload') => void;
  onTransactionRecorded?: (tx: TransactionRecord) => void;
  onUpdateCreator?: (updatedCreator: User) => void;
  onSelectCreator?: (handle: string) => void;
}

export const CreatorProfile: React.FC<CreatorProfileProps> = ({
  creator,
  posts,
  products,
  onAddProduct,
  onPostUpdated,
  onOpenVerifyModal,
  onTransactionRecorded,
  onUpdateCreator,
  onSelectCreator,
}) => {
  const { isIdVerified, isVideoVerified, isCardVerified, isAdultContentUnlocked, canAccessAdultContent } = useShield();
  const { connected, connect, signAndSendTransaction, walletAddress } = useWallet();
  const [activeTab, setActiveTab] = useState<'store' | 'feed' | 'widgets' | 'monetization'>('store');
  const [crowdfundRaised, setCrowdfundRaised] = useState(0);
  const [studioOpen, setStudioOpen] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [friendsModalOpen, setFriendsModalOpen] = useState(false);
  const [friendsModalTab, setFriendsModalTab] = useState<'followers' | 'following' | 'friends'>('followers');
  const [copiedUrl, setCopiedUrl] = useState(false);

  // Social Following & Friends State
  const [isFollowing, setIsFollowing] = useState(false);
  const [isFriend, setIsFriend] = useState(false);
  const [followersCount, setFollowersCount] = useState(creator.followersCount);

  // Crowdfund Tip Transaction State
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txStep, setTxStep] = useState<TxStep>('idle');
  const [txSig, setTxSig] = useState('');
  const [txError, setTxError] = useState('');
  const [customTipOpen, setCustomTipOpen] = useState(false);
  const [tipAmount, setTipAmount] = useState<number>(5.0);

  // Initialize with creator's widgets and a default custom code mini-app
  const [widgetsList, setWidgetsList] = useState<CreatorWidget[]>([
    {
      id: 'default-custom-code',
      type: 'custom_code',
      title: 'Cookie Clicker On-Chain Mini-App',
      enabled: true,
      data: {
        description: 'Interactive creator-authored game running in client-side sandbox.',
        html: `<div style="text-align: center;">
  <h3 style="color: #fbbf24; font-size: 15px; margin-bottom: 4px;">Cookie Baker Mini-Game</h3>
  <p style="color: #94a3b8; font-size: 11px; margin-bottom: 10px;">Click the cookie to bake $COOK on Cookie Chain!</p>
  <button id="cookieBtn" style="font-size: 48px; background: none; border: none; cursor: pointer; transition: transform 0.1s; user-select: none;">[COOKIE]</button>
  <div style="margin: 10px 0; font-family: monospace; font-size: 13px; color: #38bdf8; display: flex; justify-content: space-around; background: #070b14; padding: 8px; border-radius: 12px; border: 1px solid #1e293b;">
    <div>Baked: <strong id="score" style="color: #fbbf24;">0</strong> COOK</div>
    <div>Speed: <span id="cps">0.0</span> /s</div>
  </div>
  <button id="upgradeBtn" style="background: #ca8a2c; color: #000; border: none; padding: 8px 14px; border-radius: 10px; font-size: 11px; font-weight: bold; cursor: pointer; width: 100%;">Buy Auto-Baker (+1/s) [Cost: 10 COOK]</button>
  <div id="msg" style="color: #f87171; font-size: 11px; height: 16px; margin-top: 6px; font-weight: bold;"></div>
</div>`,
        css: `button:active { transform: scale(0.92); }`,
        js: `let count = 0; let autoBake = 0; let upgradeCost = 10;
const scoreEl = document.getElementById('score');
const cpsEl = document.getElementById('cps');
const btn = document.getElementById('cookieBtn');
const upBtn = document.getElementById('upgradeBtn');
const msgEl = document.getElementById('msg');
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
    if (msgEl) msgEl.textContent = '';
  } else {
    if (msgEl) {
      msgEl.textContent = 'Need ' + upgradeCost + ' COOK to upgrade!';
      setTimeout(() => { if (msgEl) msgEl.textContent = ''; }, 2000);
    }
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

  const handleToggleFollow = () => {
    if (isFollowing) {
      setIsFollowing(false);
      setFollowersCount((prev) => Math.max(0, prev - 1));
    } else {
      setIsFollowing(true);
      setFollowersCount((prev) => prev + 1);
    }
  };

  const handleToggleFriend = () => {
    setIsFriend((prev) => !prev);
  };

  const handleExecuteDirectTip = async (amount: number) => {
    if (!connected) {
      await connect('nightly');
      return;
    }

    setTxModalOpen(true);
    setTxStep('preparing');

    try {
      await new Promise((r) => setTimeout(r, 600));
      setTxStep('signing');

      setTxStep('broadcasting');
      const sig = await signAndSendTransaction({
        to: creator.walletAddress,
        amount,
        action: 'direct_profile_tip',
      });

      setTxSig(sig);
      setTxStep('confirmed');

      if (onTransactionRecorded) {
        const newTx: TransactionRecord = {
          id: `tx-tip-${Date.now()}`,
          signature: sig,
          fromAddress: walletAddress || 'CookYourWallet11111111111111111111111111',
          toAddress: creator.walletAddress,
          treasuryAddress: 'HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9',
          totalAmountCook: amount,
          creatorAmountCook: +(amount * 0.95).toFixed(3),
          treasuryAmountCook: +(amount * 0.05).toFixed(3),
          actionType: 'tip',
          itemTitle: `Direct Tip & Super-Chat to ${creator.name}`,
          timestamp: 'Just now',
          status: 'confirmed',
        };
        onTransactionRecorded(newTx);
      }
    } catch (err: any) {
      console.error(err);
      setTxError(err.message || 'Tip transaction failed or was rejected.');
      setTxStep('error');
    }
  };

  const handleContributeCrowdfund = async () => {
    if (!connected) {
      await connect('nightly');
      return;
    }

    setTxModalOpen(true);
    setTxStep('preparing');

    try {
      await new Promise((r) => setTimeout(r, 600));
      setTxStep('signing');

      setTxStep('broadcasting');
      const sig = await signAndSendTransaction({
        to: creator.walletAddress,
        amount: 5.0,
        action: 'crowdfund_contribution',
      });

      setTxSig(sig);
      setTxStep('confirmed');
      setCrowdfundRaised((prev) => Math.min(100, +(prev + 5.0).toFixed(1)));

      if (onTransactionRecorded) {
        const newTx: TransactionRecord = {
          id: `tx-crowd-${Date.now()}`,
          signature: sig,
          fromAddress: walletAddress || 'CookYourWallet11111111111111111111111111',
          toAddress: creator.walletAddress,
          treasuryAddress: 'HMnySuX1CdBfqysiLtU4brPawufcHxFTFZu97jrKQwT9',
          totalAmountCook: 5.0,
          creatorAmountCook: 4.75,
          treasuryAmountCook: 0.25,
          actionType: 'crowdfund',
          itemTitle: `Crowdfund Goal Support for ${creator.name}`,
          timestamp: 'Just now',
          status: 'confirmed',
        };
        onTransactionRecorded(newTx);
      }
    } catch (err: any) {
      console.error(err);
      setTxError(err.message || 'Contribution failed or signature was rejected.');
      setTxStep('error');
    }
  };

  const handleSaveCustomWidget = (newWidget: CreatorWidget) => {
    setWidgetsList([newWidget, ...widgetsList]);
  };

  const personalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?u=${creator.handle}`
    : `https://socialwtf.vercel.app/?u=${creator.handle}`;

  const handleCopyPersonalUrl = async () => {
    try {
      await navigator.clipboard.writeText(personalUrl);
      setCopiedUrl(true);
      setTimeout(() => setCopiedUrl(false), 2500);
    } catch (err) {
      console.error('Failed to copy personal url', err);
    }
  };

  const handleShareNative = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: `${creator.name} (@${creator.handle}) on Social.wtf`,
          text: `Check out ${creator.name}'s creator storefront and mini-app on Cookie Chain!`,
          url: personalUrl,
        });
      } catch (e) {
        handleCopyPersonalUrl();
      }
    } else {
      handleCopyPersonalUrl();
    }
  };

  const creatorPosts = posts.filter((p) => p.author.handle === creator.handle);
  const creatorProducts = products.filter((p) => p.creatorHandle === creator.handle);

  return (
    <div className="space-y-6">
      {/* Profile Header Mini-App Hero */}
      <div className="relative rounded-3xl overflow-hidden bg-[#0d1527] border border-slate-700/80 shadow-2xl">
        {/* Cover Banner */}
        <div className="h-44 md:h-56 w-full relative bg-slate-900 overflow-hidden group">
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

          {/* Quick Edit Banner Button */}
          <button
            onClick={() => setEditModalOpen(true)}
            className="absolute top-4 right-4 px-3 py-1.5 rounded-xl bg-black/60 hover:bg-black/80 backdrop-blur-md border border-white/20 text-white text-xs font-semibold flex items-center gap-1.5 opacity-80 group-hover:opacity-100 transition-all"
          >
            <Camera className="w-3.5 h-3.5 text-amber-400" />
            <span>Change Banner</span>
          </button>
        </div>

        {/* Creator Info Overlay */}
        <div className="relative px-6 pb-6 pt-0 flex flex-col md:flex-row md:items-end justify-between gap-4 -mt-16">
          <div className="flex items-end gap-4">
            <div className="relative group shrink-0">
              <img
                src={creator.avatar}
                alt={creator.name}
                className="w-24 h-24 md:w-28 md:h-28 rounded-3xl object-cover border-4 border-[#0d1527] shadow-xl bg-slate-900"
              />
              <button
                onClick={() => setEditModalOpen(true)}
                className="absolute inset-0 rounded-3xl bg-black/50 opacity-0 group-hover:opacity-100 flex items-center justify-center text-amber-300 transition-opacity border-4 border-amber-500/40"
                title="Click to Upload Profile Photo"
              >
                <Camera className="w-6 h-6" />
              </button>
            </div>

            <div className="mb-2">
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-xl md:text-2xl font-bold text-slate-100">
                  {creator.name}
                </h1>
                {creator.verified && (
                  <span className="w-5 h-5 rounded-full bg-blue-500/20 text-blue-400 flex items-center justify-center text-xs font-bold">
                    <CheckCircle className="w-4 h-4 text-blue-400" />
                  </span>
                )}
                <span className="px-2 py-0.5 rounded-lg bg-amber-500/15 border border-amber-500/30 text-[10px] font-bold text-amber-300">
                  CREATOR MINI-APP
                </span>

                <button
                  onClick={() => setEditModalOpen(true)}
                  className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[11px] font-semibold text-slate-300 flex items-center gap-1.5 transition-colors ml-1"
                >
                  <Edit3 className="w-3 h-3 text-amber-400" />
                  <span>Edit Profile</span>
                </button>
              </div>

              <div className="flex items-center gap-3 mt-1 flex-wrap">
                <p className="text-xs text-slate-400 font-mono">@{creator.handle}</p>

                {/* Social Gathering Follow & Friend Actions */}
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleToggleFollow}
                    className={`px-3 py-1 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      isFollowing
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md'
                    }`}
                  >
                    {isFollowing ? (
                      <>
                        <UserCheck className="w-3 h-3 text-emerald-400" />
                        <span>Following</span>
                      </>
                    ) : (
                      <>
                        <UserPlus className="w-3 h-3" />
                        <span>Follow</span>
                      </>
                    )}
                  </button>

                  <button
                    onClick={handleToggleFriend}
                    className={`px-2.5 py-1 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1 ${
                      isFriend
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    }`}
                  >
                    <Heart className={`w-3 h-3 ${isFriend ? 'fill-amber-400 text-amber-400' : ''}`} />
                    <span>{isFriend ? 'Friend' : 'Add Friend'}</span>
                  </button>

                  <button
                    onClick={() => handleExecuteDirectTip(5.0)}
                    className="px-2.5 py-1 rounded-xl bg-gradient-to-r from-amber-500/20 to-yellow-500/20 hover:from-amber-500/30 border border-amber-500/40 text-amber-300 text-xs font-bold transition-all flex items-center gap-1"
                  >
                    <Gift className="w-3 h-3 text-amber-400" />
                    <span>Tip 5 COOK</span>
                  </button>
                </div>
              </div>

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
                    <span>AI Sentinel Video Verified (Adult Entertainment Unlocked)</span>
                  </span>
                ) : (
                  onOpenVerifyModal && (
                    <button
                      onClick={() => onOpenVerifyModal('card_auth')}
                      className="px-2 py-0.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-[10px] font-semibold text-amber-300 flex items-center gap-1 transition-colors"
                    >
                      <Camera className="w-3 h-3 text-amber-400" />
                      <span>Verify 18+ Adult Entertainment Access</span>
                    </button>
                  )
                )}
              </div>
            </div>
          </div>

          {/* Social Counts & Friends Quick Access */}
          <div className="flex items-center gap-3 text-xs">
            <button
              onClick={() => {
                setFriendsModalTab('followers');
                setFriendsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-center transition-colors cursor-pointer group"
            >
              <span className="font-bold text-slate-200 block text-sm font-mono group-hover:text-amber-300">
                {followersCount.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Followers</span>
            </button>

            <button
              onClick={() => {
                setFriendsModalTab('following');
                setFriendsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-center transition-colors cursor-pointer group"
            >
              <span className="font-bold text-slate-200 block text-sm font-mono group-hover:text-amber-300">
                {creator.followingCount.toLocaleString()}
              </span>
              <span className="text-[10px] text-slate-400">Following</span>
            </button>

            <button
              onClick={() => {
                setFriendsModalTab('friends');
                setFriendsModalOpen(true);
              }}
              className="px-3 py-1.5 rounded-xl bg-slate-900/80 hover:bg-slate-800 border border-slate-800 text-center transition-colors cursor-pointer group"
            >
              <span className="font-bold text-amber-400 block text-sm font-mono">
                {creator.friendsCount || 12}
              </span>
              <span className="text-[10px] text-slate-400">Friends</span>
            </button>

            <div className="px-3 py-1.5 rounded-xl bg-slate-900/80 border border-slate-800 text-center">
              <span className="font-bold text-emerald-400 block text-sm font-mono">
                95%
              </span>
              <span className="text-[10px] text-slate-400">Proceeds Cut</span>
            </div>
          </div>
        </div>

        {/* Bio & Personal Shareable Link Section */}
        <div className="px-6 pb-6 pt-2 border-t border-slate-800/80 space-y-3">
          <p className="text-slate-300 text-xs md:text-sm leading-relaxed max-w-3xl">
            {creator.bio}
          </p>

          {/* Personal Shareable URL Banner */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-2xl bg-amber-500/10 border border-amber-500/25">
            <div className="flex items-center gap-2.5 overflow-hidden">
              <div className="p-2 rounded-xl bg-amber-500/20 text-amber-400 shrink-0">
                <LinkIcon className="w-4 h-4" />
              </div>
              <div className="overflow-hidden">
                <div className="text-[10px] uppercase tracking-wider font-bold text-amber-300">
                  Personal Shareable Page URL
                </div>
                <div className="text-xs font-mono text-slate-200 truncate">
                  {personalUrl}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCopyPersonalUrl}
                className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold transition-all shadow-md active:scale-95"
              >
                {copiedUrl ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy Link</span>
                  </>
                )}
              </button>

              <button
                onClick={handleShareNative}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-300 text-xs font-semibold transition-all"
                title="Share Profile Link"
              >
                <Share2 className="w-3.5 h-3.5 text-amber-400" />
                <span>Share</span>
              </button>
            </div>
          </div>

          <div className="flex flex-wrap sm:flex-nowrap items-center gap-2 font-mono text-[11px] text-slate-400 max-w-full overflow-hidden">
            <span className="text-amber-400 shrink-0">SVM Address:</span>
            <span className="bg-slate-900/80 px-2.5 py-1 rounded-xl border border-slate-800 text-[10px] sm:text-[11px] text-slate-300 break-all select-all inline-block max-w-full">
              {creator.walletAddress}
            </span>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex px-6 border-t border-slate-800/80 bg-slate-900/40 overflow-x-auto">
          <button
            onClick={() => setActiveTab('store')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'store'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <ShoppingBag className="w-4 h-4" />
            <span>Storefront ({creatorProducts.length})</span>
          </button>

          <button
            onClick={() => setActiveTab('monetization')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 ${
              activeTab === 'monetization'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <DollarSign className="w-4 h-4" />
            <span>Monetization &amp; Earnings</span>
          </button>

          <button
            onClick={() => setActiveTab('widgets')}
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 ${
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
            className={`flex items-center gap-2 py-3 px-4 text-xs font-semibold border-b-2 transition-all shrink-0 ${
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

      {/* Parental & Guardian Safeguard Alert for Mature Profiles */}
      {!isAdultContentUnlocked && creator.handle === 'sol_vixen' && (
        <div className="p-4 rounded-3xl bg-amber-950/40 border border-amber-500/40 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs shadow-xl animate-fade-in">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-2xl bg-amber-500/20 text-amber-400 border border-amber-500/30 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <strong className="text-amber-300 block text-sm font-bold">
                18+ Adult Entertainment Verification Required
              </strong>
              <p className="text-slate-300 text-[11px] mt-0.5">
                Must be 18 years old or over to access. Requires a debit or credit card ($0 authorization age check) with AI video verification.
                Anyone determined to be under 25 will be required to produce a valid Driver&apos;s License or Government ID card to continue.
                <span className="text-emerald-300 font-semibold block sm:inline sm:ml-1">
                  Verified strictly by autonomous AI agents with zero human review for viewer privacy unless flagged for review.
                </span>
              </p>
            </div>
          </div>
          {onOpenVerifyModal && (
            <button
              onClick={() => onOpenVerifyModal('card_auth')}
              className="shrink-0 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md"
            >
              Verify Age (18+)
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

      {/* Tab 2: Monetization & Creator Earnings Suite (YouTube / Shopify / Patreon style) */}
      {activeTab === 'monetization' && (
        <div className="space-y-6 animate-fade-in">
          {/* Earnings Overview Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="p-5 rounded-3xl bg-[#0d1527] border border-amber-500/30 shadow-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Total Page Revenue</span>
                <Coins className="w-4 h-4 text-amber-400" />
              </div>
              <div className="text-xl font-bold text-amber-300 font-mono">
                {((creatorProducts.length * 15) + (crowdfundRaised) + 42.5).toFixed(1)} COOK
              </div>
              <div className="text-[10px] text-emerald-400 font-semibold">95% Creator Split</div>
            </div>

            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Direct Tips &amp; Super-Chats</span>
                <Gift className="w-4 h-4 text-purple-400" />
              </div>
              <div className="text-xl font-bold text-slate-100 font-mono">
                42.5 COOK
              </div>
              <div className="text-[10px] text-slate-400">From 18 Fans</div>
            </div>

            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Store Drops Revenue</span>
                <ShoppingBag className="w-4 h-4 text-blue-400" />
              </div>
              <div className="text-xl font-bold text-slate-100 font-mono">
                {(creatorProducts.length * 15).toFixed(1)} COOK
              </div>
              <div className="text-[10px] text-slate-400">{creatorProducts.length} Active Products</div>
            </div>

            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Active Friends &amp; VIPs</span>
                <Users className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-xl font-bold text-slate-100 font-mono">
                {followersCount.toLocaleString()}
              </div>
              <div className="text-[10px] text-emerald-400">Across Social Network</div>
            </div>
          </div>

          {/* Monetization Tools & Action Launchers */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Tool 1: Storefront Drops */}
            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl space-y-3">
              <div className="flex items-center gap-2.5 text-xs font-bold text-slate-200 pb-2 border-b border-slate-800">
                <ShoppingBag className="w-4 h-4 text-amber-400" />
                <span>Creator Store Drops (95% Proceeds)</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                List your digital artwork, sound stems, 3D assets, VIP access passes, or code scripts for sale on Cookie Chain with sub-second finality.
              </p>
              <button
                onClick={() => setActiveTab('store')}
                className="w-full py-2.5 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-md"
              >
                <PlusCircle className="w-4 h-4" />
                <span>List New Store Drop</span>
              </button>
            </div>

            {/* Tool 2: Crowdfund Campaign */}
            <div className="p-5 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-xl space-y-3">
              <div className="flex items-center gap-2.5 text-xs font-bold text-slate-200 pb-2 border-b border-slate-800">
                <Target className="w-4 h-4 text-amber-400" />
                <span>Crowdfund Goal Support</span>
              </div>
              <p className="text-xs text-slate-300 leading-relaxed">
                Set up an on-chain crowdfunding goal on your profile for upcoming video productions, music albums, or software development.
              </p>
              <button
                onClick={() => setActiveTab('widgets')}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 font-bold text-xs transition-all flex items-center justify-center gap-2"
              >
                <Target className="w-4 h-4 text-amber-400" />
                <span>Manage Crowdfund Widget</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Tab 3: Customizable Mini-App Widgets */}
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
                onClick={handleContributeCrowdfund}
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

      {/* Tab 4: Creator Posts */}
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

      {/* Edit Profile Modal */}
      <EditProfileModal
        isOpen={editModalOpen}
        onClose={() => setEditModalOpen(false)}
        creator={creator}
        onSave={(updated) => {
          if (onUpdateCreator) {
            onUpdateCreator(updated);
          }
        }}
      />

      {/* Friends & Followers Modal */}
      <FriendsModal
        isOpen={friendsModalOpen}
        onClose={() => setFriendsModalOpen(false)}
        creator={creator}
        initialTab={friendsModalTab}
        onSelectCreator={onSelectCreator}
      />

      {/* Custom Code Studio Modal */}
      <CustomCodeStudio
        isOpen={studioOpen}
        onClose={() => setStudioOpen(false)}
        onSaveWidget={handleSaveCustomWidget}
      />

      {/* Crowdfund Contribution Transaction Status Modal */}
      <TxStatusModal
        isOpen={txModalOpen}
        step={txStep}
        actionTitle="Crowdfund Contribution"
        signature={txSig}
        errorMessage={txError}
        totalAmountCook={5.0}
        creatorAmountCook={4.75}
        treasuryAmountCook={0.25}
        recipientName={creator.name}
        onClose={() => setTxModalOpen(false)}
        onRetry={handleContributeCrowdfund}
      />
    </div>
  );
};
