'use client';

import React, { useState } from 'react';
import { Post } from '@/types';
import { useWallet } from '@/lib/wallet/walletContext';
import { calculateFeeSplit, COOKIE_CHAIN_CONFIG } from '@/lib/solana/cookieChain';
import { AudioPlayer } from './AudioPlayer';
import { VideoPlayer } from './VideoPlayer';
import { TxStatusModal, TxStep } from '../transactions/TxStatusModal';
import {
  Heart,
  Repeat2,
  MessageCircle,
  Coins,
  ShieldCheck,
  ShieldAlert,
  ShoppingBag,
  Sparkles,
  Send,
  Lock,
} from 'lucide-react';
import Link from 'next/link';

interface PostCardProps {
  post: Post;
  onOpenStore?: (creatorHandle: string) => void;
  onPostUpdated?: (updatedPost: Post, meta?: { tipAmount?: number; signature?: string }) => void;
}

export const PostCard: React.FC<PostCardProps> = ({
  post,
  onOpenStore,
  onPostUpdated,
}) => {
  const { connected, connect, signAndSendTransaction, cookBalance } = useWallet();

  const [liked, setLiked] = useState(false);
  const [likesCount, setLikesCount] = useState(post.likes);
  const [reposted, setReposted] = useState(false);
  const [repostsCount, setRepostsCount] = useState(post.reposts);

  // Tip Modal State
  const [showTipModal, setShowTipModal] = useState(false);
  const [showFeeBreakdown, setShowFeeBreakdown] = useState(false);
  const [tipAmount, setTipAmount] = useState<number>(2.0);

  // Transaction Status State
  const [txStep, setTxStep] = useState<TxStep>('idle');
  const [txModalOpen, setTxModalOpen] = useState(false);
  const [txSig, setTxSig] = useState<string>('');
  const [txError, setTxError] = useState<string>('');

  // Comment State
  const [showComments, setShowComments] = useState(false);
  const [commentsList, setCommentsList] = useState(post.comments || []);
  const [newCommentText, setNewCommentText] = useState('');

  const split = calculateFeeSplit(tipAmount);

  const handleLike = () => {
    setLiked(!liked);
    setLikesCount(liked ? likesCount - 1 : likesCount + 1);
  };

  const handleRepost = () => {
    setReposted(!reposted);
    setRepostsCount(reposted ? repostsCount - 1 : repostsCount + 1);
  };

  const handleExecuteTip = async () => {
    if (!connected) {
      await connect('nightly');
      return;
    }

    setShowTipModal(false);
    setTxModalOpen(true);
    setTxStep('preparing');

    try {
      // Step 1: Preparing
      await new Promise((r) => setTimeout(r, 600));

      // Step 2: Signing in Nightly Wallet
      setTxStep('signing');

      // Step 3: Broadcasting to Cookie Chain
      setTxStep('broadcasting');
      const sig = await signAndSendTransaction({
        to: post.author.walletAddress,
        amount: tipAmount,
        action: 'tip',
        postId: post.id,
      });

      setTxSig(sig);
      setTxStep('confirmed');

      // Update post metrics
      const updated = {
        ...post,
        tipsCount: post.tipsCount + 1,
        totalTipsCook: post.totalTipsCook + tipAmount,
      };
      if (onPostUpdated) {
        onPostUpdated(updated, {
          tipAmount,
          signature: sig,
        });
      }
    } catch (err: any) {
      console.error(err);
      setTxError(err.message || 'Tip transaction was canceled or rejected.');
      setTxStep('error');
    }
  };

  const handleAddComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCommentText.trim()) return;

    const newComment = {
      id: `comm-${Date.now()}`,
      author: {
        handle: 'you',
        name: 'You',
        avatar: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80',
      },
      content: newCommentText.trim(),
      createdAt: 'Just now',
      likes: 0,
    };

    const updatedComments = [newComment, ...commentsList];
    setCommentsList(updatedComments);
    setNewCommentText('');

    if (onPostUpdated) {
      onPostUpdated({
        ...post,
        comments: updatedComments,
        commentsCount: updatedComments.length,
      });
    }
  };

  return (
    <>
      <article className="rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/70 p-5 shadow-sm dark:shadow-xl transition-all hover:border-slate-300 dark:hover:border-slate-600/80 mb-5">
        {/* Author Header */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <img
              src={post.author.avatar}
              alt={post.author.name}
              className="w-11 h-11 rounded-2xl object-cover border border-amber-500/30"
            />
            <div>
              <div className="flex items-center gap-1.5">
                <span className="font-bold text-slate-900 dark:text-slate-100 text-sm hover:underline cursor-pointer">
                  {post.author.name}
                </span>
                {post.author.verified && (
                  <span className="w-4 h-4 rounded-full bg-blue-500/15 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 flex items-center justify-center text-[10px] font-bold">
                    ✓
                  </span>
                )}
                {post.isShielded && (
                  <span className="px-2 py-0.5 rounded-md bg-red-50 border border-red-200 text-red-700 dark:bg-red-500/15 dark:border-red-500/30 text-[10px] font-bold dark:text-red-400 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3" /> 18+ RESTRICTED UNLOCKED
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>@{post.author.handle}</span>
                <span>•</span>
                <span>{post.createdAt}</span>
              </div>
            </div>
          </div>

          {/* Action / Store shortcut */}
          <div className="flex items-center gap-2">
            {post.author.isCreator && (
              <button
                onClick={() => onOpenStore && onOpenStore(post.author.handle)}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 dark:bg-amber-500/10 dark:hover:bg-amber-500/20 border border-amber-300 dark:border-amber-500/30 text-amber-800 dark:text-amber-300 text-xs font-semibold transition-all"
              >
                <ShoppingBag className="w-3.5 h-3.5" />
                <span>Visit Store</span>
              </button>
            )}
          </div>
        </div>

        {/* Post Text Content */}
        <div className="text-slate-700 dark:text-slate-200 text-sm leading-relaxed mb-4 whitespace-pre-line break-words [overflow-wrap:anywhere] max-w-full">
          {post.content}
        </div>

        {/* Tags */}
        {post.tags.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mb-4">
            {post.tags.map((tag) => (
              <span
                key={tag}
                className="px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800/80 text-[11px] font-medium text-amber-700 dark:text-amber-400/90 border border-slate-200 dark:border-slate-700/50"
              >
                #{tag}
              </span>
            ))}
          </div>
        )}

        {/* Multi-Format Media Rendering */}
        {post.type === 'audio' && post.mediaUrl && (
          <div className="mb-4">
            <AudioPlayer
              audioUrl={post.mediaUrl}
              title={post.mediaMetadata?.title}
              artist={post.mediaMetadata?.artist}
              duration={post.mediaMetadata?.duration}
            />
          </div>
        )}

        {post.type === 'video' && post.mediaUrl && (
          <div className="mb-4">
            <VideoPlayer
              videoUrl={post.mediaUrl}
              poster={post.mediaMetadata?.videoThumbnail}
            />
          </div>
        )}

        {post.type === 'photo' && post.mediaUrl && (
          <div className="mb-4 rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-100 dark:bg-black/40">
            <img
              src={post.mediaUrl}
              alt="Post media"
              className="w-full max-h-[520px] object-cover hover:scale-[1.01] transition-transform duration-300"
            />
          </div>
        )}

        {/* AI Screening Metadata Badge */}
        <div className="flex items-center justify-between py-2 px-3 mb-4 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-600 dark:text-slate-400">
          <div className="flex items-center gap-1.5">
            <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>
              AI Vision Status: {post.isShielded ? 'Verified Age-Gated 18+' : 'Passed Safe Screening'}
            </span>
          </div>
          <div className="font-mono text-amber-700 dark:text-amber-400 text-[10px]">
            Cookie Chain SVM Verified
          </div>
        </div>

        {/* Bottom Social Interactions Bar */}
        <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800/80">
          {/* Like */}
          <button
            onClick={handleLike}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              liked
                ? 'text-rose-600 bg-rose-50 dark:text-rose-400 dark:bg-rose-500/10'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Heart className={`w-4 h-4 ${liked ? 'fill-rose-500 text-rose-500' : ''}`} />
            <span>{likesCount}</span>
          </button>

          {/* Repost */}
          <button
            onClick={handleRepost}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              reposted
                ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-400 dark:bg-emerald-500/10'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Repeat2 className="w-4 h-4" />
            <span>{repostsCount}</span>
          </button>

          {/* Comments */}
          <button
            onClick={() => setShowComments(!showComments)}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-all"
          >
            <MessageCircle className="w-4 h-4" />
            <span>{commentsList.length}</span>
          </button>

          {/* On-Chain Tip Button ($COOK with 5% split) */}
          <button
            onClick={() => setShowTipModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-amber-50 dark:bg-gradient-to-r dark:from-amber-500/15 dark:via-amber-500/20 dark:to-yellow-500/15 border border-amber-300 dark:border-amber-500/40 text-amber-800 dark:text-amber-300 hover:brightness-105 dark:hover:brightness-125 transition-all text-xs font-bold shadow-sm"
          >
            <Coins className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>Tip {post.totalTipsCook.toFixed(1)} COOK</span>
          </button>
        </div>

        {/* Comment Drawer */}
        {showComments && (
          <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800/80 animate-fade-in">
            <form onSubmit={handleAddComment} className="flex gap-2 mb-4">
              <input
                type="text"
                placeholder="Add on-chain comment..."
                value={newCommentText}
                onChange={(e) => setNewCommentText(e.target.value)}
                className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700/80 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />
              <button
                type="submit"
                className="p-2 rounded-xl bg-amber-500 text-slate-950 hover:bg-amber-400 transition-colors"
              >
                <Send className="w-4 h-4" />
              </button>
            </form>

            <div className="space-y-3">
              {commentsList.map((comm) => (
                <div key={comm.id} className="flex items-start gap-2.5 text-xs">
                  <img
                    src={comm.author.avatar}
                    alt={comm.author.name}
                    className="w-7 h-7 rounded-xl object-cover border border-slate-200 dark:border-slate-700 mt-0.5"
                  />
                  <div className="flex-1 bg-slate-50 dark:bg-slate-900/60 p-2.5 rounded-xl border border-slate-200 dark:border-slate-800">
                    <div className="flex justify-between items-center mb-1">
                      <span className="font-bold text-slate-900 dark:text-slate-200">{comm.author.name}</span>
                      <span className="text-[10px] text-slate-500">{comm.createdAt}</span>
                    </div>
                    <p className="text-slate-700 dark:text-slate-300">{comm.content}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </article>

      {/* Tip Amount Picker Modal */}
      {showTipModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 dark:bg-black/80 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-sm bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700 rounded-3xl p-6 shadow-2xl">
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-slate-100 dark:border-slate-800">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-amber-500/15 text-amber-600 dark:text-amber-400">
                  <Coins className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 dark:text-slate-100 text-sm">Send Tip in $COOK</h3>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">To {post.author.name}</p>
                </div>
              </div>
              <button
                onClick={() => setShowTipModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-white"
              >
                ✕
              </button>
            </div>

            {/* Presets */}
            <div className="grid grid-cols-4 gap-2 mb-4">
              {[1.0, 2.0, 5.0, 10.0].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setTipAmount(amt)}
                  className={`py-2 rounded-xl font-mono text-xs font-bold transition-all ${
                    tipAmount === amt
                      ? 'bg-amber-500 text-slate-950 shadow-sm'
                      : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                  }`}
                >
                  {amt} COOK
                </button>
              ))}
            </div>

            {/* Custom input */}
            <div className="mb-4">
              <label className="text-[11px] text-slate-500 dark:text-slate-400 block mb-1">Custom Amount</label>
              <div className="flex items-center bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2">
                <input
                  type="number"
                  min="0.1"
                  step="0.5"
                  value={tipAmount}
                  onChange={(e) => setTipAmount(Math.max(0.1, parseFloat(e.target.value) || 0.1))}
                  className="bg-transparent flex-1 text-sm font-mono text-amber-600 dark:text-amber-300 focus:outline-none"
                />
                <span className="text-xs font-bold text-slate-500 dark:text-slate-400">COOK</span>
              </div>
            </div>

            {/* Automated Split Transparency */}
            <div className="mb-5">
              <button
                type="button"
                onClick={() => setShowFeeBreakdown(!showFeeBreakdown)}
                className="text-[11px] text-slate-400 hover:text-slate-300 flex items-center gap-1 mb-2 font-medium transition-colors"
              >
                <span>{showFeeBreakdown ? 'Hide' : 'View'} Settlement Details (0.05% fee)</span>
              </button>
              {showFeeBreakdown && (
                <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800 text-[11px] space-y-1.5 animate-fade-in">
                  <div className="flex justify-between text-slate-700 dark:text-slate-300 font-medium">
                    <span>Creator Proceeds (99.95%):</span>
                    <span className="font-mono text-emerald-600 dark:text-emerald-400">
                      +{split.creatorAmount.toFixed(4)} COOK
                    </span>
                  </div>
                  <div className="flex justify-between text-slate-500 dark:text-slate-400">
                    <span>Social.wtf Treasury (0.05%):</span>
                    <span className="font-mono text-blue-600 dark:text-blue-400">
                      +{split.treasuryAmount.toFixed(4)} COOK
                    </span>
                  </div>
                  <p className="text-[10px] text-slate-400 dark:text-slate-500 pt-1 border-t border-slate-200 dark:border-slate-800">
                    Automated protocol fee split executed atomically on Cookie Chain SVM.
                  </p>
                </div>
              )}
            </div>

            {/* Submit */}
            <button
              onClick={handleExecuteTip}
              className="w-full py-3 rounded-2xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-sm hover:brightness-110 active:scale-95 transition-all shadow-md shadow-amber-500/20"
            >
              Sign & Send {tipAmount} COOK
            </button>

            <div className="mt-3 text-center text-[10px] text-slate-400 dark:text-slate-500">
              Direct peer-to-peer creator tip (99.95% to creator, 0.05% protocol sustainability fee).
            </div>
          </div>
        </div>
      )}

      {/* Transaction Status Modal */}
      <TxStatusModal
        isOpen={txModalOpen}
        step={txStep}
        actionTitle="Post Tip"
        signature={txSig}
        errorMessage={txError}
        totalAmountCook={tipAmount}
        creatorAmountCook={split.creatorAmount}
        treasuryAmountCook={split.treasuryAmount}
        recipientName={post.author.name}
        onClose={() => setTxModalOpen(false)}
        onRetry={handleExecuteTip}
      />
    </>
  );
};
