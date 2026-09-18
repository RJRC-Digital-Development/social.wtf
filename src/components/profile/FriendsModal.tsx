'use client';

import React, { useState } from 'react';
import { User } from '@/types';
import {
  X,
  Users,
  UserPlus,
  UserCheck,
  Search,
  ExternalLink,
  ShieldCheck,
  Sparkles,
  Heart,
} from 'lucide-react';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  creator: User;
  initialTab?: 'followers' | 'following' | 'friends';
  onSelectCreator?: (handle: string) => void;
}

interface SocialConnection {
  id: string;
  handle: string;
  name: string;
  avatar: string;
  bio: string;
  isFollowing: boolean;
  isFriend: boolean;
  verified: boolean;
  followersCount: number;
}

const INITIAL_CONNECTIONS: SocialConnection[] = [
  {
    id: 'conn-1',
    handle: 'cookie_monk',
    name: 'Cookie Monk',
    avatar: 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150',
    bio: 'SVM smart contract auditor & Cookie Chain pioneer.',
    isFollowing: true,
    isFriend: true,
    verified: true,
    followersCount: 3840,
  },
  {
    id: 'conn-2',
    handle: 'sol_vixen',
    name: 'Sol Vixen',
    avatar: 'https://images.unsplash.com/photo-1517841905240-472988babdf9?w=150',
    bio: 'Adult entertainment creator on Cookie Chain. 18+ Sentinel verified.',
    isFollowing: true,
    isFriend: false,
    verified: true,
    followersCount: 12900,
  },
  {
    id: 'conn-3',
    handle: 'cyber_chef',
    name: 'Cyber Chef',
    avatar: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150',
    bio: 'Generating AI beats, music stems, and interactive audio apps.',
    isFollowing: false,
    isFriend: false,
    verified: true,
    followersCount: 2100,
  },
  {
    id: 'conn-4',
    handle: 'svm_builder',
    name: 'SVM Builder',
    avatar: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150',
    bio: 'Deploying high-speed SVM smart contracts with sub-second finality.',
    isFollowing: true,
    isFriend: true,
    verified: false,
    followersCount: 940,
  },
  {
    id: 'conn-5',
    handle: 'pixel_witch',
    name: 'Pixel Witch',
    avatar: 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150',
    bio: '3D digital art and generative animations on Cookie Chain.',
    isFollowing: false,
    isFriend: false,
    verified: true,
    followersCount: 4500,
  },
];

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  creator,
  initialTab = 'followers',
  onSelectCreator,
}) => {
  const [activeTab, setActiveTab] = useState<'followers' | 'following' | 'friends'>(initialTab);
  const [searchQuery, setSearchQuery] = useState('');
  const [connections, setConnections] = useState<SocialConnection[]>(INITIAL_CONNECTIONS);

  if (!isOpen) return null;

  const toggleFollow = (id: string) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isFollowing: !c.isFollowing } : c))
    );
  };

  const toggleFriend = (id: string) => {
    setConnections((prev) =>
      prev.map((c) => (c.id === id ? { ...c, isFriend: !c.isFriend } : c))
    );
  };

  const filteredList = connections.filter((c) => {
    const matchesSearch =
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.handle.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.bio.toLowerCase().includes(searchQuery.toLowerCase());

    if (!matchesSearch) return false;
    if (activeTab === 'following') return c.isFollowing;
    if (activeTab === 'friends') return c.isFriend;
    return true; // followers tab shows all community followers
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
      <div className="relative w-full max-w-lg rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Users className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">
                {creator.name} Social Network
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                @{creator.handle} &bull; Followers, Following &amp; Friends
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="flex border-b border-slate-800 bg-slate-900/40 shrink-0 px-4">
          <button
            onClick={() => setActiveTab('followers')}
            className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-all ${
              activeTab === 'followers'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Followers ({creator.followersCount.toLocaleString()})</span>
          </button>

          <button
            onClick={() => setActiveTab('following')}
            className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-all ${
              activeTab === 'following'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Following ({creator.followingCount.toLocaleString()})</span>
          </button>

          <button
            onClick={() => setActiveTab('friends')}
            className={`flex-1 py-3 text-xs font-semibold text-center border-b-2 transition-all ${
              activeTab === 'friends'
                ? 'border-amber-400 text-amber-300 font-bold'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <span>Friends ({connections.filter((c) => c.isFriend).length})</span>
          </button>
        </div>

        {/* Search Input */}
        <div className="p-3.5 border-b border-slate-800/80 shrink-0">
          <div className="relative">
            <Search className="absolute left-3.5 top-2.5 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search followers, following, or friends..."
              className="w-full pl-9 pr-3.5 py-2 rounded-xl bg-slate-900 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-amber-400 placeholder-slate-500"
            />
          </div>
        </div>

        {/* Connections List */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {filteredList.length === 0 ? (
            <div className="py-12 text-center text-slate-400 text-xs">
              No users found matching your search.
            </div>
          ) : (
            filteredList.map((c) => (
              <div
                key={c.id}
                className="p-3 rounded-2xl bg-slate-900/80 border border-slate-800 flex items-center justify-between gap-3 hover:border-slate-700 transition-all"
              >
                <div
                  onClick={() => {
                    if (onSelectCreator) {
                      onSelectCreator(c.handle);
                      onClose();
                    }
                  }}
                  className="flex items-center gap-3 cursor-pointer group flex-1 overflow-hidden"
                >
                  <img
                    src={c.avatar}
                    alt={c.name}
                    className="w-10 h-10 rounded-2xl object-cover border border-slate-700 group-hover:border-amber-400 transition-colors shrink-0"
                  />
                  <div className="overflow-hidden">
                    <div className="flex items-center gap-1.5">
                      <span className="font-bold text-slate-100 text-xs group-hover:text-amber-300 transition-colors truncate">
                        {c.name}
                      </span>
                      {c.verified && (
                        <ShieldCheck className="w-3.5 h-3.5 text-blue-400 shrink-0" />
                      )}
                    </div>
                    <div className="text-[10px] text-slate-400 font-mono">@{c.handle}</div>
                    <div className="text-[11px] text-slate-300 line-clamp-1 mt-0.5">
                      {c.bio}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => toggleFriend(c.id)}
                    className={`px-2.5 py-1.5 rounded-xl text-xs font-semibold border transition-all flex items-center gap-1 ${
                      c.isFriend
                        ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                        : 'bg-slate-800 hover:bg-slate-700 border-slate-700 text-slate-300'
                    }`}
                  >
                    <Heart className={`w-3 h-3 ${c.isFriend ? 'fill-amber-400 text-amber-400' : ''}`} />
                    <span className="hidden sm:inline">
                      {c.isFriend ? 'Friend' : 'Add Friend'}
                    </span>
                  </button>

                  <button
                    onClick={() => toggleFollow(c.id)}
                    className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1 ${
                      c.isFollowing
                        ? 'bg-slate-800 hover:bg-slate-700 text-slate-300 border border-slate-700'
                        : 'bg-amber-500 hover:bg-amber-400 text-slate-950 shadow-md'
                    }`}
                  >
                    {c.isFollowing ? (
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
                </div>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
