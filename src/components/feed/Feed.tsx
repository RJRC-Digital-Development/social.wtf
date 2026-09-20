'use client';

import React, { useState } from 'react';
import { Post, MediaType, User } from '@/types';
import { useShield } from '@/lib/shield/shieldContext';
import { useWallet } from '@/lib/wallet/walletContext';
import { scanMediaContent } from '@/lib/ai/scanner';
import { PostCard } from './PostCard';
import {
  Sparkles,
  Image as ImageIcon,
  Video,
  Music,
  Send,
  ShieldAlert,
  ShieldCheck,
  Filter,
  CheckCircle2,
  TrendingUp,
  Flame,
  Users,
  Tv,
  UserCheck,
  Globe,
  LogIn,
} from 'lucide-react';

interface FeedProps {
  posts: Post[];
  currentUser?: User;
  followingHandles?: string[];
  onToggleFollow?: (handle: string) => void;
  onOpenStore?: (creatorHandle: string) => void;
  onPostCreated?: (newPost: Post) => void;
  onPostUpdated?: (updatedPost: Post, meta?: { tipAmount?: number; signature?: string }) => void;
  onOpenVerifyModal: () => void;
}

export const Feed: React.FC<FeedProps> = ({
  posts,
  currentUser,
  followingHandles = ['creator', 'you'],
  onToggleFollow,
  onOpenStore,
  onPostCreated,
  onPostUpdated,
  onOpenVerifyModal,
}) => {
  const { filterFeedPosts, canAccessAdultContent, isVideoVerified, isAgeVerified, isIdVerified } = useShield();
  const { connected, connect, walletAddress } = useWallet();

  // News feed defaults strictly to Following feed
  const [feedMode, setFeedMode] = useState<'following' | 'explore'>('following');
  const [activeFilter, setActiveFilter] = useState<'all' | 'video' | 'audio' | 'trending' | 'shielded'>('all');

  // New Post Form State
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<MediaType>('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [aiResult, setAiResult] = useState<{
    isShielded: boolean;
    reason: string;
  } | null>(null);

  const [connectError, setConnectError] = useState<string | null>(null);

  // Apply invisible shielding filter
  const visiblePosts = filterFeedPosts(posts);

  // Normalize followed handles (lowercased) + always include current user and primary creator
  const lowerFollowed = followingHandles.map((h) => h.toLowerCase());
  const myHandle = (currentUser?.handle || 'you').toLowerCase();

  // Filter feed: Following mode strictly shows posts from authors you follow or your own page
  const streamPosts = visiblePosts.filter((post) => {
    const authorHandle = post.author.handle.toLowerCase();
    if (feedMode === 'following') {
      const isFollowed =
        lowerFollowed.includes(authorHandle) ||
        authorHandle === myHandle ||
        authorHandle === 'creator' ||
        authorHandle === 'you';
      if (!isFollowed) return false;
    }

    if (activeFilter === 'trending') return post.likes > 100 || post.tipsCount > 5;
    if (activeFilter === 'video') return post.type === 'video';
    if (activeFilter === 'audio') return post.type === 'audio';
    if (activeFilter === 'shielded') return post.isShielded;
    return true;
  });

  const handleMediaUrlChange = async (url: string) => {
    setMediaUrl(url);
    if (!url.trim()) {
      setAiResult(null);
      return;
    }

    setIsScanningAI(true);
    try {
      const scan = await scanMediaContent(url, postType === 'text' ? 'image' : (postType as any));
      setAiResult({
        isShielded: scan.isShielded,
        reason: scan.reason,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setIsScanningAI(false);
    }
  };

  const handleCreatePost = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    if (!connected || !walletAddress) {
      try {
        setConnectError(null);
        await connect();
      } catch (err: any) {
        console.warn('Feed wallet connect error:', err?.message || err);
        setConnectError(err?.message || 'Failed to connect wallet');
      }
      return;
    }

    const isShielded = aiResult ? aiResult.isShielded : false;

    const userAuthor: User = currentUser || {
      id: `user-${walletAddress}`,
      handle: `user_${walletAddress.slice(0, 4).toLowerCase()}${walletAddress.slice(-4).toLowerCase()}`,
      name: `@${walletAddress.slice(0, 4)}...${walletAddress.slice(-4)}`,
      avatar: `https://api.dicebear.com/7.x/bottts/svg?seed=${walletAddress}`,
      bio: 'Building and socializing on Cookie Chain SVM.',
      verified: false,
      ageVerified: isAgeVerified,
      isIdVerified: isIdVerified,
      isVideoVerified: isVideoVerified,
      walletAddress: walletAddress,
      followersCount: 0,
      followingCount: 0,
      isCreator: true,
    };

    const newPost: Post = {
      id: `post-${Date.now()}`,
      author: userAuthor,
      type: postType,
      content: content.trim(),
      mediaUrl: mediaUrl.trim() || undefined,
      mediaMetadata:
        postType === 'audio'
          ? {
              title: 'Original Audio Stream',
              artist: userAuthor.name,
              duration: '3:20',
            }
          : undefined,
      createdAt: 'Just now',
      likes: 0,
      tipsCount: 0,
      totalTipsCook: 0,
      reposts: 0,
      commentsCount: 0,
      tags: ['SocialWTF', 'CookieChain', 'cApp'],
      isShielded,
      shieldCategory: isShielded ? 'age_restricted' : 'safe',
      shieldConfidence: 0.98,
      shieldReason: aiResult?.reason,
    };

    if (onPostCreated) {
      onPostCreated(newPost);
    }

    // Reset Form
    setContent('');
    setMediaUrl('');
    setAiResult(null);
    setPostType('text');
  };

  return (
    <div className="space-y-6">
      {/* Create Post Card */}
      <div className="rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/80 p-5 shadow-sm dark:shadow-xl transition-colors">
        <div className="flex items-center gap-3 mb-3">
          <img
            src={currentUser?.avatar || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=100&auto=format&fit=crop&q=80'}
            alt="Avatar"
            className="w-10 h-10 rounded-2xl object-cover border border-amber-500/30"
          />
          <div>
            <h3 className="font-bold text-slate-900 dark:text-slate-200 text-sm">
              {currentUser ? `Post as ${currentUser.name}` : 'Create on Cookie Chain'}
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Your posts appear immediately in the following news feeds of all your followers and friends.
            </p>
          </div>
        </div>

        <form onSubmit={handleCreatePost} className="space-y-3">
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's happening on the chain? Drop alpha, track stems, videos, or store drops..."
            className="w-full bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 leading-relaxed resize-none"
          />

          {/* Media URL Input if Photo / Video / Audio */}
          {postType !== 'text' && (
            <div className="space-y-1.5 animate-fade-in">
              <input
                type="text"
                placeholder={
                  postType === 'audio'
                    ? 'Paste audio MP3 stream URL...'
                    : postType === 'video'
                    ? 'Paste YouTube / MP4 video URL...'
                    : 'Paste high-res image URL...'
                }
                value={mediaUrl}
                onChange={(e) => handleMediaUrlChange(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500"
              />

              {/* Sample quick picks */}
              <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400">
                <span>Quick demo:</span>
                {postType === 'audio' && (
                  <button
                    type="button"
                    onClick={() =>
                      handleMediaUrlChange(
                        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
                      )
                    }
                    className="text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Sample Audio
                  </button>
                )}
                {postType === 'video' && (
                  <button
                    type="button"
                    onClick={() =>
                      handleMediaUrlChange(
                        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
                      )
                    }
                    className="text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Sample Video
                  </button>
                )}
                {postType === 'photo' && (
                  <button
                    type="button"
                    onClick={() =>
                      handleMediaUrlChange(
                        'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=800'
                      )
                    }
                    className="text-amber-600 dark:text-amber-400 hover:underline"
                  >
                    Sample Image
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Scanner AI Feedback */}
          {isScanningAI && (
            <div className="p-2.5 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-700 dark:text-amber-300 flex items-center gap-2">
              <Sparkles className="w-3.5 h-3.5 animate-spin" />
              <span>Multimodal AI scanning media content...</span>
            </div>
          )}

          {aiResult && !isScanningAI && (
            <div
              className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${
                aiResult.isShielded
                  ? 'bg-amber-50 border-amber-200 text-amber-800 dark:bg-amber-500/10 dark:border-amber-500/30 dark:text-amber-300'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-800 dark:bg-emerald-500/10 dark:border-emerald-500/30 dark:text-emerald-300'
              }`}
            >
              {aiResult.isShielded ? (
                <>
                  <ShieldAlert className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400 shrink-0" />
                  <span>AI Shield Active: {aiResult.reason}</span>
                </>
              ) : (
                <>
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>AI Shield Passed: Safe stream verified.</span>
                </>
              )}
            </div>
          )}

          {/* Actions & Format Selector */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setPostType('text')}
                className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  postType === 'text'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                Text
              </button>
              <button
                type="button"
                onClick={() => setPostType('photo')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  postType === 'photo'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <ImageIcon className="w-3 h-3" />
                <span>Photo</span>
              </button>
              <button
                type="button"
                onClick={() => setPostType('video')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  postType === 'video'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Video className="w-3 h-3" />
                <span>Video</span>
              </button>
              <button
                type="button"
                onClick={() => setPostType('audio')}
                className={`flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-all ${
                  postType === 'audio'
                    ? 'bg-amber-500 text-slate-950 font-bold'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
                }`}
              >
                <Music className="w-3 h-3" />
                <span>Audio</span>
              </button>
            </div>

            {!connected || !walletAddress ? (
              <button
                type="button"
                onClick={async () => {
                  try {
                    setConnectError(null);
                    await connect();
                  } catch (err: any) {
                    console.warn('Feed wallet connect click error:', err?.message || err);
                    setConnectError(err?.message || 'Failed to connect wallet');
                  }
                }}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-md shadow-amber-500/20"
              >
                <LogIn className="w-3.5 h-3.5" />
                <span>Connect Wallet to Post</span>
              </button>
            ) : (
              <button
                type="submit"
                disabled={!content.trim() || isScanningAI}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-amber-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>Broadcast Post</span>
              </button>
            )}
          </div>
          {connectError && (
            <div className="mt-3 p-2.5 rounded-lg bg-red-500/10 border border-red-500/20 text-red-400 text-xs flex items-center justify-between">
              <span>{connectError}</span>
              <button
                type="button"
                onClick={() => setConnectError(null)}
                className="text-red-400 hover:text-red-300 font-bold text-xs ml-2"
              >
                Dismiss
              </button>
            </div>
          )}
        </form>
      </div>

      {/* Mode Switcher: Following Feed (Default) vs Explore Network */}
      <div className="p-3.5 rounded-2xl bg-white dark:bg-[#0d1527] border border-amber-500/30 flex flex-col sm:flex-row items-center justify-between gap-3 shadow-sm dark:shadow-lg transition-colors">
        <div className="flex items-center gap-2.5">
          <div className="p-2 rounded-xl bg-amber-500/20 text-amber-600 dark:text-amber-400">
            <UserCheck className="w-4 h-4" />
          </div>
          <div>
            <div className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              <span>{feedMode === 'following' ? 'Following News Feed Active' : 'Explore All Network Stream'}</span>
              <span className="px-2 py-0.5 rounded-full text-[9px] font-mono bg-emerald-500/15 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300 font-bold">
                {feedMode === 'following' ? 'FOLLOWERS ONLY' : 'ALL NETWORK'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {feedMode === 'following'
                ? 'Only reflecting posts from creators and friends you follow (and your personal page).'
                : 'Showing all public broadcasts across Cookie Chain SVM.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-900/90 p-1 rounded-xl border border-slate-200 dark:border-slate-700 text-xs shrink-0">
          <button
            onClick={() => setFeedMode('following')}
            className={`px-3 py-1.5 rounded-lg font-bold transition-all flex items-center gap-1.5 ${
              feedMode === 'following'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Following</span>
          </button>
          <button
            onClick={() => setFeedMode('explore')}
            className={`px-3 py-1.5 rounded-lg font-semibold transition-all flex items-center gap-1.5 ${
              feedMode === 'explore'
                ? 'bg-amber-500 text-slate-950 shadow-sm'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Explore All</span>
          </button>
        </div>
      </div>

      {/* Multi-Channel Format Filter */}
      <div className="flex items-center justify-between pb-1 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-amber-600 dark:text-amber-400" />
          <span className="text-xs font-bold text-slate-800 dark:text-slate-200">Stream Channels</span>
        </div>

        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200 dark:border-slate-800 text-xs overflow-x-auto">
          <button
            onClick={() => setActiveFilter('all')}
            className={`px-2.5 py-1 rounded-lg transition-all shrink-0 ${
              activeFilter === 'all'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            All Types
          </button>
          <button
            onClick={() => setActiveFilter('trending')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all shrink-0 ${
              activeFilter === 'trending'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Flame className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>Trending</span>
          </button>
          <button
            onClick={() => setActiveFilter('video')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all shrink-0 ${
              activeFilter === 'video'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Tv className="w-3 h-3" />
            <span>Videos</span>
          </button>
          <button
            onClick={() => setActiveFilter('audio')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all shrink-0 ${
              activeFilter === 'audio'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <Music className="w-3 h-3" />
            <span>Audio</span>
          </button>
          <button
            onClick={() => setActiveFilter('shielded')}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg transition-all shrink-0 ${
              activeFilter === 'shielded'
                ? 'bg-amber-500 text-slate-950 font-bold'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200'
            }`}
          >
            <ShieldAlert className="w-3 h-3 text-amber-600 dark:text-amber-400" />
            <span>18+ Adult</span>
          </button>
        </div>
      </div>

      {/* Feed Stream List */}
      <div className="space-y-4">
        {streamPosts.length === 0 ? (
          <div className="p-8 text-center rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 text-xs space-y-2">
            <p>No posts found in your Following feed.</p>
            <p className="text-[11px] text-slate-500">
              Publish a new post above, or switch to &quot;Explore All&quot; to discover and follow other Cookie Chain creators.
            </p>
          </div>
        ) : (
          streamPosts.map((post) => (
            <PostCard
              key={post.id}
              post={post}
              onOpenStore={onOpenStore}
              onPostUpdated={onPostUpdated}
            />
          ))
        )}
      </div>
    </div>
  );
};
