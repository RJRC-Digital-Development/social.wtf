'use client';

import React, { useState, useRef, ChangeEvent } from 'react';
import { User } from '@/types';
import {
  X,
  Upload,
  Camera,
  Image as ImageIcon,
  User as UserIcon,
  Sparkles,
  Link as LinkIcon,
  Check,
  Save,
  Wallet,
  Gift,
  Heart,
} from 'lucide-react';

interface EditProfileModalProps {
  isOpen: boolean;
  onClose: () => void;
  creator: User;
  onSave: (updatedCreator: User) => Promise<{ success: boolean; error?: string } | void> | void;
}

export const EditProfileModal: React.FC<EditProfileModalProps> = ({
  isOpen,
  onClose,
  creator,
  onSave,
}) => {
  const [name, setName] = useState(creator.name);
  const [handle, setHandle] = useState(creator.handle);
  const [bio, setBio] = useState(creator.bio);
  const [walletAddress, setWalletAddress] = useState(creator.walletAddress);
  const [sponsorUrl, setSponsorUrl] = useState(creator.sponsorUrl || '');
  const [sponsorGoal, setSponsorGoal] = useState(creator.sponsorGoal || '');
  const [avatar, setAvatar] = useState(creator.avatar);
  const [coverImage, setCoverImage] = useState(creator.coverImage || '');
  const [avatarPreview, setAvatarPreview] = useState(creator.avatar);
  const [coverPreview, setCoverPreview] = useState(creator.coverImage || '');
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');

  const avatarInputRef = useRef<HTMLInputElement>(null);
  const coverInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleAvatarFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        alert('Image size exceeds 5MB. Please choose a smaller image.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setAvatar(reader.result);
          setAvatarPreview(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCoverFileChange = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 8 * 1024 * 1024) {
        alert('Cover banner size exceeds 8MB. Please choose a smaller image.');
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        if (typeof reader.result === 'string') {
          setCoverImage(reader.result);
          setCoverPreview(reader.result);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleFormSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage('');
    const cleanHandle = handle.trim().replace(/^@+/, '').toLowerCase() || 'creator';

    const updatedUser: User = {
      ...creator,
      name: name.trim() || 'Anonymous Creator',
      handle: cleanHandle,
      bio: bio.trim(),
      walletAddress: walletAddress.trim() || creator.walletAddress,
      sponsorUrl: sponsorUrl.trim() || undefined,
      sponsorGoal: sponsorGoal.trim() || undefined,
      avatar: avatar || creator.avatar,
      coverImage: coverImage || undefined,
    };

    setIsSaving(true);
    try {
      const result = await onSave(updatedUser);
      if (result && !result.success) {
        setErrorMessage(result.error || 'Failed to save profile. Please retry.');
        setIsSaving(false);
        return;
      }
      setSavedSuccess(true);
      setTimeout(() => {
        setSavedSuccess(false);
        setIsSaving(false);
        onClose();
      }, 600);
    } catch (err: any) {
      setErrorMessage(err.message || 'An unexpected error occurred while saving profile.');
      setIsSaving(false);
    }
  };

  const cleanHandlePreview = handle.trim().replace(/^@+/, '').toLowerCase() || 'creator';
  const personalUrl = typeof window !== 'undefined'
    ? `${window.location.origin}/?u=${cleanHandlePreview}`
    : `https://socialwtf.vercel.app/?u=${cleanHandlePreview}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md overflow-y-auto">
      <div className="relative w-full max-w-xl my-8 rounded-3xl bg-[#0d1527] border border-slate-700/80 shadow-2xl overflow-hidden animate-fade-in">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between bg-slate-900/60">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400">
              <Camera className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-100">Edit Profile &amp; Images</h2>
              <p className="text-[11px] text-slate-400">
                Upload custom avatar, banner, and manage your personal shareable URL.
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

        <form onSubmit={handleFormSubmit} className="p-6 space-y-6">
          {/* Cover Banner Upload Preview */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Cover Banner</span>
              <span className="text-[10px] text-slate-500 font-mono">Recommended: 1200x400 PNG/JPG</span>
            </label>

            <div className="relative h-32 w-full rounded-2xl bg-slate-900 border border-slate-800 overflow-hidden group">
              {coverPreview ? (
                <img
                  src={coverPreview}
                  alt="Cover Preview"
                  className="w-full h-full object-cover brightness-90"
                />
              ) : (
                <div className="w-full h-full bg-gradient-to-r from-blue-950 via-slate-900 to-amber-950 flex items-center justify-center text-slate-500 text-xs font-mono">
                  No cover banner uploaded
                </div>
              )}

              {/* Banner Upload Button Overlay */}
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-3">
                <button
                  type="button"
                  onClick={() => coverInputRef.current?.click()}
                  className="px-3 py-1.5 rounded-xl bg-amber-500 text-slate-950 text-xs font-bold flex items-center gap-1.5 hover:brightness-110 shadow-lg"
                >
                  <Upload className="w-3.5 h-3.5" />
                  <span>Upload Banner</span>
                </button>
                {coverPreview && (
                  <button
                    type="button"
                    onClick={() => {
                      setCoverImage('');
                      setCoverPreview('');
                    }}
                    className="px-3 py-1.5 rounded-xl bg-slate-800/90 text-red-400 text-xs font-semibold hover:bg-red-500/20"
                  >
                    Remove
                  </button>
                )}
              </div>
            </div>

            <input
              ref={coverInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleCoverFileChange}
            />
          </div>

          {/* Profile Avatar Upload */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span>Profile Avatar Image</span>
              <span className="text-[10px] text-slate-500 font-mono">JPG, PNG, WebP up to 5MB</span>
            </label>

            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 rounded-2xl bg-slate-900 border-2 border-amber-500/40 overflow-hidden shrink-0 group">
                <img
                  src={avatarPreview}
                  alt="Avatar Preview"
                  className="w-full h-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-amber-300"
                >
                  <Camera className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-2 flex-1">
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
                >
                  <Upload className="w-4 h-4 text-amber-400" />
                  <span>Upload New Photo</span>
                </button>
                <p className="text-[11px] text-slate-400">
                  Select a photo from your device. It will instantly update your on-chain creator presence.
                </p>
              </div>
            </div>

            <input
              ref={avatarInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleAvatarFileChange}
            />
          </div>

          {/* Display Name & Handle */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Display Name</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Satoshi Baker"
                required
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-amber-400 font-medium"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Handle / Username</label>
              <div className="relative">
                <span className="absolute left-3.5 top-2.5 text-xs text-slate-500 font-mono">@</span>
                <input
                  type="text"
                  value={handle}
                  onChange={(e) => setHandle(e.target.value)}
                  placeholder="handle"
                  required
                  className="w-full pl-8 pr-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-amber-400 font-mono font-medium"
                />
              </div>
            </div>
          </div>

          {/* Personal URL Preview Box */}
          <div className="p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30 space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <LinkIcon className="w-3.5 h-3.5 text-amber-400" />
              <span>Your Personal Shareable URL</span>
            </div>
            <p className="text-[11px] text-slate-300 font-mono break-all bg-slate-900/80 px-3 py-2 rounded-xl border border-slate-800">
              {personalUrl}
            </p>
            <p className="text-[10px] text-slate-400">
              Share this link with your friends and audience. It opens directly to your creator profile and mini-app.
            </p>
          </div>

          {/* Bio */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300">Bio &amp; Creator Description</label>
            <textarea
              value={bio}
              onChange={(e) => setBio(e.target.value)}
              rows={3}
              placeholder="Tell your fans about yourself, your art, and your Cookie Chain projects..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-amber-400 leading-relaxed resize-none"
            />
          </div>

          {/* SVM Wallet Address */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Wallet className="w-3.5 h-3.5 text-amber-400" />
              <span>Cookie Chain SVM Wallet Address</span>
            </label>
            <input
              type="text"
              value={walletAddress}
              onChange={(e) => setWalletAddress(e.target.value)}
              placeholder="e.g. Cook... or Solana Base58 Address"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-100 text-xs font-mono focus:outline-none focus:border-amber-400"
            />
          </div>

          {/* Creator Sponsor Link & Funding Goal */}
          <div className="space-y-3 p-3.5 rounded-2xl bg-amber-500/10 border border-amber-500/30">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-300">
              <Gift className="w-3.5 h-3.5 text-amber-400" />
              <span>Creator Sponsor &amp; Grant Link</span>
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300">Sponsor / Donation URL</label>
              <input
                type="url"
                value={sponsorUrl}
                onChange={(e) => setSponsorUrl(e.target.value)}
                placeholder="https://github.com/sponsors/... or custom patron link"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-amber-400 font-mono"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-semibold text-slate-300">Sponsorship Goal / Purpose</label>
              <input
                type="text"
                value={sponsorGoal}
                onChange={(e) => setSponsorGoal(e.target.value)}
                placeholder="e.g. Building open source Cookie Chain tools & generative artwork"
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-slate-700 text-slate-100 text-xs focus:outline-none focus:border-amber-400"
              />
            </div>
          </div>

          {/* Error Message Display */}
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-center justify-between">
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-yellow-500 text-slate-950 font-bold text-xs hover:brightness-110 active:scale-95 transition-all shadow-lg shadow-amber-500/20 disabled:opacity-50"
            >
              {savedSuccess ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>Profile Saved!</span>
                </>
              ) : isSaving ? (
                <>
                  <Save className="w-4 h-4 animate-spin" />
                  <span>Saving to Network...</span>
                </>
              ) : (
                <>
                  <Save className="w-4 h-4" />
                  <span>Save Profile</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
