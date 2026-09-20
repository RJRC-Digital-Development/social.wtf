'use client';

import React, { useState, useEffect } from 'react';
import { User } from '@/types';
import {
  X,
  Users,
  Clock,
} from 'lucide-react';

interface FriendsModalProps {
  isOpen: boolean;
  onClose: () => void;
  creator: User;
  initialTab?: 'friends' | 'inbound' | 'outbound' | 'blocked';
  onSelectCreator?: (handle: string) => void;
  onRelationshipChanged?: () => void;
}

interface FriendProfile {
  walletAddress: string;
  handle: string;
  name: string;
  avatar: string;
  bio: string;
  verified: boolean;
  isCreator: boolean;
}

export const FriendsModal: React.FC<FriendsModalProps> = ({
  isOpen,
  onClose,
  creator,
  initialTab = 'friends',
  onSelectCreator,
  onRelationshipChanged,
}) => {
  const [activeTab, setActiveTab] = useState<'friends' | 'inbound' | 'outbound' | 'blocked'>(initialTab);
  const [friends, setFriends] = useState<FriendProfile[]>([]);
  const [inbound, setInbound] = useState<string[]>([]);
  const [outbound, setOutbound] = useState<string[]>([]);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const token = typeof window !== 'undefined' ? localStorage.getItem('social_wtf_session_token') : null;

  const loadRelationships = async () => {
    if (!token) return;
    setLoading(true);
    setActionError(null);
    try {
      const res = await fetch('/api/friends', {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setFriends(data.friends || []);
        setInbound(data.inboundRequests || []);
        setOutbound(data.outboundRequests || []);
        setBlocked(data.blockedWallets || []);
      }
    } catch {
      setActionError('Failed to load relationships.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadRelationships();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAccept = async (senderWallet: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends/accept', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ senderWallet }),
      });
      if (res.ok) {
        await loadRelationships();
        if (onRelationshipChanged) onRelationshipChanged();
      } else {
        const err = await res.json().catch(() => ({}));
        setActionError(err.error || 'Failed to accept request.');
      }
    } catch {
      setActionError('Network error accepting request.');
    }
  };

  const handleReject = async (senderWallet: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ senderWallet }),
      });
      if (res.ok) {
        await loadRelationships();
        if (onRelationshipChanged) onRelationshipChanged();
      }
    } catch {}
  };

  const handleUnfriend = async (targetWallet: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends/remove', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetWallet }),
      });
      if (res.ok) {
        await loadRelationships();
        if (onRelationshipChanged) onRelationshipChanged();
      }
    } catch {}
  };

  const handleUnblock = async (targetWallet: string) => {
    if (!token) return;
    try {
      const res = await fetch('/api/friends/block', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ targetWallet, action: 'unblock' }),
      });
      if (res.ok) {
        await loadRelationships();
        if (onRelationshipChanged) onRelationshipChanged();
      }
    } catch {}
  };

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
                Authoritative Friend Graph
              </h2>
              <p className="text-[11px] text-slate-400 font-mono">
                Relationship-Scoped Social Network
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
        <div className="grid grid-cols-4 p-2 bg-slate-950/60 border-b border-slate-800 text-xs shrink-0 font-semibold text-center">
          <button
            onClick={() => setActiveTab('friends')}
            className={`py-2 rounded-xl transition-all ${
              activeTab === 'friends'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Friends ({friends.length})
          </button>
          <button
            onClick={() => setActiveTab('inbound')}
            className={`py-2 rounded-xl transition-all ${
              activeTab === 'inbound'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Requests ({inbound.length})
          </button>
          <button
            onClick={() => setActiveTab('outbound')}
            className={`py-2 rounded-xl transition-all ${
              activeTab === 'outbound'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Sent ({outbound.length})
          </button>
          <button
            onClick={() => setActiveTab('blocked')}
            className={`py-2 rounded-xl transition-all ${
              activeTab === 'blocked'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            Blocked ({blocked.length})
          </button>
        </div>

        {actionError && (
          <div className="p-3 mx-4 mt-3 rounded-xl bg-rose-500/20 border border-rose-500/40 text-rose-300 text-xs">
            {actionError}
          </div>
        )}

        {/* List Content */}
        <div className="p-4 overflow-y-auto space-y-3 flex-1">
          {loading && (
            <div className="text-center py-8 text-xs text-slate-400">Loading relationship graph...</div>
          )}

          {!loading && activeTab === 'friends' && (
            friends.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">No accepted friends yet.</div>
            ) : (
              friends.map((f) => (
                <div
                  key={f.walletAddress}
                  className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between"
                >
                  <div className="flex items-center gap-3">
                    <img src={f.avatar} alt={f.name} className="w-10 h-10 rounded-xl object-cover" />
                    <div>
                      <div className="font-bold text-slate-200 text-xs">{f.name}</div>
                      <div className="text-[11px] text-amber-400 font-mono">@{f.handle}</div>
                    </div>
                  </div>
                  <button
                    onClick={() => handleUnfriend(f.walletAddress)}
                    className="px-3 py-1.5 rounded-xl bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-300 text-xs font-semibold"
                  >
                    Unfriend
                  </button>
                </div>
              ))
            )
          )}

          {!loading && activeTab === 'inbound' && (
            inbound.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">No pending inbound requests.</div>
            ) : (
              inbound.map((sender) => (
                <div
                  key={sender}
                  className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between"
                >
                  <div className="font-mono text-xs text-slate-300">
                    {sender.slice(0, 6)}...{sender.slice(-6)}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleAccept(sender)}
                      className="px-3 py-1.5 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-bold"
                    >
                      Accept
                    </button>
                    <button
                      onClick={() => handleReject(sender)}
                      className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                    >
                      Decline
                    </button>
                  </div>
                </div>
              ))
            )
          )}

          {!loading && activeTab === 'outbound' && (
            outbound.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">No sent requests pending.</div>
            ) : (
              outbound.map((recip) => (
                <div
                  key={recip}
                  className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between"
                >
                  <div className="font-mono text-xs text-slate-300">
                    {recip.slice(0, 6)}...{recip.slice(-6)}
                  </div>
                  <span className="text-[11px] text-amber-400 font-semibold flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" /> Pending
                  </span>
                </div>
              ))
            )
          )}

          {!loading && activeTab === 'blocked' && (
            blocked.length === 0 ? (
              <div className="text-center py-10 text-xs text-slate-500">No blocked wallets.</div>
            ) : (
              blocked.map((bWallet) => (
                <div
                  key={bWallet}
                  className="p-3 rounded-2xl bg-slate-900/70 border border-slate-800 flex items-center justify-between"
                >
                  <div className="font-mono text-xs text-rose-300">
                    {bWallet.slice(0, 6)}...{bWallet.slice(-6)}
                  </div>
                  <button
                    onClick={() => handleUnblock(bWallet)}
                    className="px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                  >
                    Unblock
                  </button>
                </div>
              ))
            )
          )}
        </div>
      </div>
    </div>
  );
};
