'use client';

import React, { useState } from 'react';
import { Post, MediaType } from '@/types';
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
} from 'lucide-react';

interface FeedProps {
  posts: Post[];
  onOpenStore?: (creatorHandle: string) => void;
  onPostCreated?: (newPost: Post) => void;
  onPostUpdated?: (updatedPost: Post) => void;
  onOpenVerifyModal: () => void;
}

export const Feed: React.FC<FeedProps> = ({
  posts,
  onOpenStore,
  onPostCreated,
  onPostUpdated,
  onOpenVerifyModal,
}) => {
  const { filterFeedPosts, isAgeVerified, unshieldedMode } = useShield();
  const { connected, connect } = useWallet();

  const [activeFilter, setActiveFilter] = useState<'all' | 'trending' | 'audio' | 'video' | 'shielded'>(
    'all'
  );

  // New Post Form State
  const [content, setContent] = useState('');
  const [postType, setPostType] = useState<MediaType>('text');
  const [mediaUrl, setMediaUrl] = useState('');
  const [isScanningAI, setIsScanningAI] = useState(false);
  const [aiResult, setAiResult] = useState<{
    isShielded: boolean;
    reason: string;
  } | null>(null);

  // Apply invisible shielding filter
  const visiblePosts = filterFeedPosts(posts);

  // Apply tab filtering
  const filteredPosts = visiblePosts.filter((post) => {
    if (activeFilter === 'trending') return post.likes > 150;
    if (activeFilter === 'audio') return post.type === 'audio';
    if (activeFilter === 'video') return post.type === 'video';
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

  const handleCreatePost = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim()) return;

    const isShielded = aiResult ? aiResult.isShielded : false;

    const newPost: Post = {
      id: `post-${Date.now()}`,
      author: {
        id: 'creator-you',
        handle: 'you',
        name: 'You (Cookie Chain Creator)',
        avatar:
          'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=150&auto=format&fit=crop&q=80',
        bio: 'Building on Cookie Chain SVM.',
        verified: true,
        ageVerified: isAgeVerified,
        walletAddress: 'CookYou1111111111111111111111111111111111',
        followersCount: 1,
        followingCount: 42,
        isCreator: true,
      },
      type: postType,
      content: content.trim(),
      mediaUrl: mediaUrl.trim() || undefined,
      mediaMetadata:
        postType === 'audio'
          ? {
              title: 'Original Audio Stream',
              artist: 'You',
              duration: '3:20',
            }
          : undefined,
      createdAt: 'Just now',
      likes: 0,
      tipsCount: 0,
      totalTipsCook: 0,
      reposts: 0,
      commentsCount: 0,
      tags: ['SocialWTF', 'CookieChain'],
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
      <div className="rounded-3xl bg-[#0d1527] border border-slate-700/80 p-5 shadow-xl">
        <div className="flex items-center gap-3 mb-3">
          <img
            src="https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?w=100&auto=format&fit=crop&q=80"
            alt="Avatar"
            className="w-10 h-10 rounded-2xl object-cover border border-amber-500/30"
          />
          <div>
            <h3 className="font-bold text-slate-200 text-sm">Create on Cookie Chain</h3>
            <p className="text-[11px] text-slate-400">
              Multimodal AI auto-screens uploads in real-time
            </p>
          </div>
        </div>

        <form onSubmit={handleCreatePost} className="space-y-3">
          <textarea
            rows={3}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            placeholder="What's happening on the chain? Drop alpha, track stems, or art..."
            className="w-full bg-slate-900/90 border border-slate-700/80 rounded-2xl p-3.5 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400 leading-relaxed resize-none"
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
                    ? 'Paste MP4 video URL...'
                    : 'Paste high-res image URL...'
                }
                value={mediaUrl}
                onChange={(e) => handleMediaUrlChange(e.target.value)}
                className="w-full bg-slate-900 border border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-amber-400"
              />

              {/* Sample quick picks */}
              <div className="flex items-center gap-2 text-[10px] text-slate-400">
                <span>Quick demo:</span>
                {postType === 'audio' && (
                  <button
                    type="button"
                    onClick={() =>
                      handleMediaUrlChange(
                        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3'
                      )
                    }
                    className="text-amber-400 hover:underline"
                  >
                    Load Sample Audio
                  </button>
                )}
                {postType === 'photo' && (
                  <>
                    <button
                      type="button"
                      onClick={() =>
                        handleMediaUrlChange(
                          'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=1000'
                        )
                      }
                      className="text-amber-400 hover:underline"
                    >
                      Safe Photo
                    </button>
                    <span>•</span>
                    <button
                      type="button"
                      onClick={() =>
                        handleMediaUrlChange(
                          'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=1000&tag=18+adult'
                        )
                      }
                      className="text-red-400 hover:underline"
                    >
                      Test 18+ Restricted (Auto-Shielded)
                    </button>
                  </>
                )}
                {postType === 'video' && (
                  <button
                    type="button"
                    onClick={() =>
                      handleMediaUrlChange(
                        'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/ForBiggerBlazes.mp4'
                      )
                    }
                    className="text-amber-400 hover:underline"
                  >
                    Load Sample Video
                  </button>
                )}
              </div>
            </div>
          )}

          {/* AI Vision Screening Result Feedback */}
          {isScanningAI && (
            <div className="p-2.5 rounded-xl bg-slate-900 border border-slate-800 text-[11px] text-amber-300 flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping"></span>
              <span>Scanning media upload with Multimodal AI Vision API...</span>
            </div>
          )}

          {aiResult && !isScanningAI && (
            <div
              className={`p-2.5 rounded-xl text-[11px] flex items-center justify-between ${
                aiResult.isShielded
                  ? 'bg-red-500/10 border border-red-500/30 text-red-300'
                  : 'bg-emerald-500/10 border border-emerald-500/30 text-emerald-300'
              }`}
            >
              <div className="flex items-center gap-2">
                {aiResult.isShielded ? (
                  <ShieldAlert className="w-4 h-4 text-red-400 shrink-0" />
                ) : (
                  <ShieldCheck className="w-4 h-4 text-emerald-400 shrink-0" />
                )}
                <span>
                  {aiResult.isShielded
                    ? 'AI Shielding Applied: Content classified as 18+ and will be invisible to unverified users.'
                    : 'AI Vision Clean: Safe for public feed.'}
                </span>
              </div>
            </div>
          )}

          {/* Bottom Bar: Post Type Toggles + Submit */}
          <div className="flex items-center justify-between pt-2 border-t border-slate-800/80">
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => setPostType('text')}
                className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all ${
                  postType === 'text'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <span>Text</span>
              </button>

              <button
                type="button"
                onClick={() => setPostType('photo')}
                className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all ${
                  postType === 'photo'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <ImageIcon className="w-3.5 h-3.5" />
                <span>Photo</span>
              </button>

              <button
                type="button"
                onClick={() => setPostType('video')}
                className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all ${
                  postType === 'video'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Video className="w-3.5 h-3.5" />
                <span>Video</span>
              </button>

              <button
                type="button"
                onClick={() => setPostType('audio')}
                className={`p-2 rounded-xl text-xs flex items-center gap-1.5 transition-all ${
                  postType === 'audio'
                    ? 'bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Music className="w-3.5 h-3.5" />
                <span>Audio Track</span>
              </button>
            </div>

            <button
              type="submit"
              disabled={!content.trim()}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 disabled:opacity-40 disabled:pointer-events-none transition-all shadow-md shadow-amber-500/20"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Publish Post</span>
            </button>
          </div>
        </form>
      </div>

      {/* Feed Filters */}
      <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800">
        <div className="flex flex-wrap gap-2">
          {[
            { id: 'all', label: '🌟 All Stream' },
            { id: 'trending', label: '🔥 Trending' },
            { id: 'audio', label: '🎵 Music Hub' },
            { id: 'video', label: '🎬 Video Drops' },
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveFilter(tab.id as any)}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeFilter === tab.id
                  ? 'bg-amber-500 text-slate-950 shadow-md shadow-amber-500/20 font-bold'
                  : 'bg-slate-900 border border-slate-700/80 text-slate-400 hover:text-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}

          {/* 18+ Unshielded Filter Tab */}
          {isAgeVerified && unshieldedMode ? (
            <button
              onClick={() => setActiveFilter('shielded')}
              className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                activeFilter === 'shielded'
                  ? 'bg-red-500 text-white shadow-md shadow-red-500/20 font-bold'
                  : 'bg-red-500/10 border border-red-500/30 text-red-300 hover:bg-red-500/20'
              }`}
            >
              🔥 18+ Unshielded Only
            </button>
          ) : (
            <button
              onClick={onOpenVerifyModal}
              className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-slate-900 border border-slate-700/60 text-slate-400 hover:text-amber-300 flex items-center gap-1.5 transition-all"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
              <span>Unlock 18+ Shielded (Private)</span>
            </button>
          )}
        </div>

        <div className="text-[11px] font-mono text-slate-500">
          Showing {filteredPosts.length} posts
        </div>
      </div>

      {/* Posts List */}
      <div className="space-y-4">
        {filteredPosts.map((post) => (
          <PostCard
            key={post.id}
            post={post}
            onOpenStore={onOpenStore}
            onPostUpdated={onPostUpdated}
          />
        ))}

        {filteredPosts.length === 0 && (
          <div className="p-10 rounded-3xl bg-[#0d1527] border border-slate-700/60 text-center space-y-2">
            <p className="text-slate-400 text-xs">No posts matching filter.</p>
          </div>
        )}
      </div>
    </div>
  );
};
