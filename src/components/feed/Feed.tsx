'use client';

import React, { useState } from 'react';
import { Post, User } from '@/types';
import { useShield } from '@/lib/shield/shieldContext';
import { useWallet } from '@/lib/wallet/walletContext';
import { PostCard } from './PostCard';
import {
  Send,
  Filter,
  TrendingUp,
  Flame,
  Users,
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
  onOpenVerifyModal?: (tab?: 'card_auth' | 'video_liveness' | 'id_upload') => void;
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
  const { connected, connect, walletAddress, sessionToken, isAuthenticated, authenticateWallet } = useWallet();

  // News feed defaults strictly to Following feed
  const [feedMode, setFeedMode] = useState<'following' | 'explore'>('following');
  const [activeFilter, setActiveFilter] = useState<'all' | 'trending'>('all');

  // New Post Form State (Text-First Production Release)
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
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
    return true;
  });

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

    // Ensure user has an active SIWS session
    let activeToken = sessionToken || (typeof window !== 'undefined' ? localStorage.getItem('social_wtf_session_token') : null);
    if (!activeToken || !isAuthenticated) {
      try {
        setConnectError(null);
        const authed = await authenticateWallet();
        if (!authed) {
          setConnectError('Sign-In with Solana (SIWS) authentication required to publish posts.');
          return;
        }
        activeToken = sessionToken || (typeof window !== 'undefined' ? localStorage.getItem('social_wtf_session_token') : null);
      } catch (authErr: any) {
        setConnectError(authErr?.message || 'Sign-In with Solana (SIWS) authentication failed');
        return;
      }
    }

    if (!activeToken) {
      setConnectError('Authentication session token is missing. Please re-authenticate your wallet.');
      return;
    }

    setIsSubmitting(true);
    setConnectError(null);

    try {
      const res = await fetch('/api/posts', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          content: content.trim(),
          tags: ['SocialWTF', 'CookieChain', 'cApp'],
        }),
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok || !data.success || !data.post) {
        if (res.status === 401) {
          throw new Error('Authentication expired. Please re-authenticate your wallet.');
        }
        if (res.status === 403) {
          throw new Error(data.error || 'Access restricted.');
        }
        if (res.status === 429) {
          throw new Error('Post creation rate limit exceeded. Please wait a moment.');
        }
        if (res.status === 503) {
          throw new Error('Post service temporarily unavailable. Please try again later.');
        }
        throw new Error(data.error || 'Failed to publish post');
      }

      // Insert canonical server-returned post into authoritative feed
      if (onPostCreated) {
        onPostCreated(data.post);
      }

      // Reset Form
      setContent('');
    } catch (err: any) {
      console.warn('[Feed] Post creation error:', err);
      setConnectError(err?.message || 'Failed to publish post');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Create Post Card */}
      <div className="rounded-3xl bg-white dark:bg-[#0d1527] border border-slate-200 dark:border-slate-700/80 p-5 shadow-sm dark:shadow-xl transition-colors">
        <div className="flex items-center gap-3 mb-3">
          <img
            src={currentUser?.avatar || `https://api.dicebear.com/7.x/bottts/svg?seed=${currentUser?.walletAddress || 'default'}`}
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
            placeholder="What's happening on the chain? Drop alpha, announcements, or thoughts..."
            className="w-full bg-slate-50 dark:bg-slate-900/90 border border-slate-200 dark:border-slate-700/80 rounded-2xl p-3.5 text-xs text-slate-900 dark:text-slate-200 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none focus:border-amber-500 leading-relaxed resize-none"
          />

          {/* Actions & Format Selector */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] font-medium">
                Text Broadcast
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 hidden sm:inline">
                Media sharing is temporarily unavailable.
              </span>
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
                disabled={!content.trim() || isSubmitting}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md shadow-amber-500/20"
              >
                <Send className="w-3.5 h-3.5" />
                <span>{isSubmitting ? 'Publishing...' : 'Broadcast Post'}</span>
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
            All Posts
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
