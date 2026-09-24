'use client';

import React from 'react';
import Link from 'next/link';
import { NightlyWalletButton } from '../wallet/NightlyWalletButton';
import { useShield } from '@/lib/shield/shieldContext';
import { useWallet } from '@/lib/wallet/walletContext';
import { useTheme } from '@/lib/theme/themeContext';
import { User } from '@/types';
import {
  Cookie,
  Sun,
  Moon,
  MessageSquare,
  ShoppingBag,
  User as UserIcon,
  TrendingUp,
  Bot,
  Sparkles,
  BookOpen,
} from 'lucide-react';

interface NavbarProps {
  activeView: 'feed' | 'store' | 'creator' | 'community' | 'analytics';
  onSelectView: (view: 'feed' | 'store' | 'creator' | 'community' | 'analytics') => void;
  onOpenVerifyModal: (tab?: 'card_auth' | 'video_liveness' | 'id_upload') => void;
  onOpenEcosystemModal?: (tab?: 'bridge' | 'cookieswap' | 'cookiebox' | 'das' | 'mcp') => void;
  onOpenAiAgent?: () => void;
  userProfile?: User;
  onOpenMyPage?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  activeView,
  onSelectView,
  onOpenVerifyModal,
  onOpenEcosystemModal,
  onOpenAiAgent,
  userProfile,
  onOpenMyPage,
}) => {
  const { isAdultContentUnlocked, unshieldedMode, toggleUnshieldedMode } = useShield();
  const { connected, walletAddress } = useWallet();
  const { theme, isNight, isDay, toggleTheme } = useTheme();

  const navItems = [
    { id: 'feed'      as const, label: 'Feed',     Icon: MessageSquare },
    { id: 'store'     as const, label: 'Store',    Icon: ShoppingBag },
    { id: 'creator'   as const, label: 'Creators', Icon: UserIcon },
    { id: 'community' as const, label: 'Wiki',     Icon: BookOpen },
    { id: 'analytics' as const, label: 'Treasury', Icon: TrendingUp },
  ];

  return (
    <header className="sticky top-0 z-40 w-full border-b border-[--border-main] bg-[--bg-card]/95 backdrop-blur-md transition-colors duration-200">
      <div className="social-navbar-shell max-w-[1400px] mx-auto px-5 sm:px-8 lg:px-10 py-3">

        {/* Logo */}
        <div className="social-navbar-brand shrink-0">
          <button
            onClick={() => onSelectView('feed')}
            className="flex items-center gap-2.5"
          >
            <div className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{background: 'var(--accent)'}}>
              <Cookie className="w-3.5 h-3.5 text-white" />
            </div>
            <span className="font-semibold text-[15px] tracking-tight" style={{color: 'var(--text-main)'}}>
              Social<span style={{color: 'var(--accent)'}}>.</span>wtf
            </span>
          </button>
        </div>

        {/* Center nav — text only, no icons, generous spacing */}
        <nav className="social-navbar-primary flex items-center justify-center gap-1" aria-label="Main navigation">
          {navItems.map(({ id, label }) => (
            <button
              key={id}
              onClick={() => onSelectView(id)}
              className="px-4 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-all"
              style={activeView === id ? {
                background: 'var(--accent-muted)',
                color: 'var(--accent)',
                fontWeight: 600,
              } : {
                color: 'var(--text-muted)',
              }}
              onMouseEnter={e => { if (activeView !== id) { (e.currentTarget as HTMLElement).style.color = 'var(--text-main)'; (e.currentTarget as HTMLElement).style.background = 'var(--bg-card-subtle)'; } }}
              onMouseLeave={e => { if (activeView !== id) { (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; (e.currentTarget as HTMLElement).style.background = ''; } }}
            >
              {label}
            </button>
          ))}
        </nav>

        {/* Right: theme + wallet */}
        <div className="social-navbar-wallet flex items-center gap-2 shrink-0">
          <button
            onClick={toggleTheme}
            className="w-8 h-8 rounded-md flex items-center justify-center transition-colors"
            style={{color: 'var(--text-muted)'}}
            title={isNight ? 'Light mode' : 'Dark mode'}
            aria-label="Toggle theme"
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--bg-card-subtle)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-main)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = ''; (e.currentTarget as HTMLElement).style.color = 'var(--text-muted)'; }}
          >
            {isNight ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
          <NightlyWalletButton />
        </div>
      </div>
    </header>
  );
};

export interface MobileBottomNavProps {
  activeView: 'feed' | 'store' | 'creator' | 'community' | 'analytics';
  onSelectView: (view: 'feed' | 'store' | 'creator' | 'community' | 'analytics') => void;
  onOpenAiAgent?: () => void;
  userProfile?: User;
  onOpenMyPage?: () => void;
}

export const MobileBottomNav: React.FC<MobileBottomNavProps> = ({
  activeView,
  onSelectView,
  onOpenAiAgent,
  userProfile,
  onOpenMyPage,
}) => {
  const items = [
    { id: 'feed'      as const, label: 'Feed',     Icon: MessageSquare },
    { id: 'store'     as const, label: 'Store',    Icon: ShoppingBag },
    { id: 'creator'   as const, label: 'Me',       Icon: UserIcon },
    { id: 'community' as const, label: 'Wiki',     Icon: BookOpen },
    { id: 'analytics' as const, label: 'Treasury', Icon: TrendingUp },
  ];

  return (
    <nav
      aria-label="Mobile navigation"
      className="fixed bottom-0 left-0 right-0 z-40 lg:hidden backdrop-blur-md border-t flex items-center justify-around px-2 py-2 transition-colors duration-200"
      style={{ background: 'var(--bg-card)', borderColor: 'var(--border-main)' }}
    >
      {items.map(({ id, label, Icon }) => {
        const isActive = activeView === id;
        return (
          <button
            key={id}
            onClick={() => {
              if (id === 'creator' && onOpenMyPage) onOpenMyPage();
              else onSelectView(id);
            }}
            className="flex flex-col items-center justify-center py-1.5 px-3 rounded-lg gap-0.5 transition-colors"
            style={{ color: isActive ? 'var(--accent)' : 'var(--text-muted)' }}
          >
            {id === 'creator' && userProfile?.avatar ? (
              <img src={userProfile.avatar} alt="" className="w-5 h-5 rounded-full object-cover" style={isActive ? {outline: '2px solid var(--accent)', outlineOffset: '1px'} : {}} />
            ) : (
              <Icon className="w-5 h-5" />
            )}
            <span className="text-[10px] font-medium">{label}</span>
          </button>
        );
      })}

      {onOpenAiAgent && (
        <button
          onClick={onOpenAiAgent}
          className="flex flex-col items-center justify-center py-1.5 px-3 rounded-lg gap-0.5 transition-colors"
          style={{ color: 'var(--text-muted)' }}
        >
          <Bot className="w-5 h-5" />
          <span className="text-[10px] font-medium">AI</span>
        </button>
      )}
    </nav>
  );
};
