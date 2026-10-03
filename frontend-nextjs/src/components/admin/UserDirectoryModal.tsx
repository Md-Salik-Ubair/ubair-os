'use client';

import React, { useState, useMemo, useEffect } from 'react';

export interface UserDirectoryItem {
  email: string;
  name: string;
  role: string;
  created_at: string;
  avatar_url?: string;
}

interface UserDirectoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  users: UserDirectoryItem[];
  isLoading: boolean;
  onRefresh: () => void;
}

const getAvatarGradient = (str: string) => {
  const gradients = [
    'from-cyan-500 to-blue-600',
    'from-purple-500 to-indigo-600',
    'from-emerald-500 to-teal-600',
    'from-amber-500 to-orange-600',
    'from-rose-500 to-pink-600',
    'from-sky-500 to-indigo-600'
  ];
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  return gradients[Math.abs(hash) % gradients.length];
};

export default function UserDirectoryModal({
  isOpen,
  onClose,
  users,
  isLoading,
  onRefresh
}: UserDirectoryModalProps) {
  const [filterRole, setFilterRole] = useState<'all' | 'free' | 'pro' | 'admin'>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Auto-refresh when opened if list is empty
  useEffect(() => {
    if (isOpen && users.length === 0) {
      onRefresh();
    }
  }, [isOpen]);

  // Capture phase ESC handling
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, onClose]);

  // Telemetry Metrics
  const total = users.length;
  const adminCount = users.filter(u => (u.role || '').toLowerCase() === 'admin').length;
  const proCount = users.filter(u => (u.role || '').toLowerCase() === 'pro').length;
  const freeCount = total - (adminCount + proCount);

  // Filtered List
  const filteredUsers = useMemo(() => {
    return users.filter(user => {
      const role = (user.role || 'free').toLowerCase();
      if (filterRole === 'free' && role !== 'free') return false;
      if (filterRole === 'pro' && role !== 'pro') return false;
      if (filterRole === 'admin' && role !== 'admin') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const emailMatch = user.email?.toLowerCase().includes(q);
        const nameMatch = user.name?.toLowerCase().includes(q);
        if (!emailMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [users, filterRole, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#07080a] flex flex-col w-full h-[100dvh] overflow-hidden select-none animate-in fade-in duration-150 font-sans">
      
      {/* 1. TOP EXECUTIVE APP BAR */}
      <header className="h-14 sm:h-15 shrink-0 border-b border-white/[0.04] px-4 sm:px-8 lg:px-12 flex items-center justify-between bg-black/50 backdrop-blur-2xl select-none">
        
        {/* Left: Brand Mark + Golden Founder Title + Desk Subtitle */}
        <div className="flex items-center gap-3 min-w-0">
          <div className="w-7 h-7 flex items-center justify-center shrink-0">
            <img
              src="/assets/ubair-logo.png"
              alt="Ubair OS"
              className="w-full h-full object-contain scale-[1.6] drop-shadow-[0_0_10px_rgba(245,158,11,0.35)] pointer-events-none"
            />
          </div>

          <div className="flex items-center gap-2.5 min-w-0">
            <div className="flex items-center gap-1.5 text-sm sm:text-[14.5px] tracking-tight">
              <span className="font-semibold text-white">Founder</span>
              <span className="font-semibold text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 drop-shadow-[0_0_12px_rgba(245,158,11,0.25)]">
                Console
              </span>
            </div>

            <div className="h-3 w-[1px] bg-white/[0.08] hidden sm:block shrink-0" />

            <div className="hidden sm:flex items-center gap-2 text-[11px] font-mono tracking-tight truncate">
              <span className="text-neutral-300 font-medium">Ubair's Directory</span>
              <span className="text-neutral-600">/</span>
              <span className="text-neutral-500 text-[10.5px]">Registered Accounts & Identities</span>
            </div>
          </div>
        </div>

        {/* Right: Refresh & Esc Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="w-7.5 h-7.5 rounded-lg hover:bg-white/[0.06] text-neutral-400 hover:text-white transition-all flex items-center justify-center active:scale-95 disabled:opacity-40 cursor-pointer"
            title="Refresh User Directory"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLoading ? 'animate-spin text-white' : ''}>
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-7.5 px-2.5 rounded-lg hover:bg-white/[0.06] text-neutral-400 hover:text-white text-xs font-mono transition-all active:scale-95 cursor-pointer flex items-center gap-1"
            title="Close (Esc)"
          >
            <span>Esc</span>
            <span className="text-[10px] opacity-50 font-sans">✕</span>
          </button>
        </div>
      </header>

      {/* 2. CARDLESS WORKSTATION CANVAS (100% Zoom Desktop Scale) */}
      <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col px-4 sm:px-8 lg:px-12 py-4 min-h-0 overflow-hidden">
        
        {/* A. UNIFIED STAT RIBBON (Zero Boxes, Crisp Hairlines) */}
        <div className="flex items-center justify-between py-2.5 px-2 border-b border-white/[0.04] shrink-0 text-xs sm:text-[13px] font-mono">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Registered Accounts</span>
            <span className="text-base sm:text-lg font-bold text-white">{total}</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">identities</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Pro Subscriptions</span>
            <span className="text-base sm:text-lg font-bold text-emerald-400">{proCount}</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">active seats</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Free Tier</span>
            <span className="text-base sm:text-lg font-bold text-neutral-300">{freeCount}</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">members</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Founders & Admins</span>
            <span className="text-base sm:text-lg font-bold text-cyan-400">{adminCount}</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">authorized</span>
          </div>
        </div>

        {/* B. CONTROLS (Role Filter Tabs + Instant Substring Search) */}
        <div className="flex items-center justify-between gap-3 py-3 shrink-0 border-b border-white/[0.03]">
          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {[
              { id: 'all', label: `All (${total})` },
              { id: 'pro', label: `Pro (${proCount})` },
              { id: 'free', label: `Free (${freeCount})` },
              { id: 'admin', label: `Admins (${adminCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterRole(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap ${
                  filterRole === tab.id
                    ? 'bg-white/[0.12] text-white font-medium shadow-sm'
                    : 'text-neutral-500 hover:text-neutral-300 hover:bg-white/[0.03]'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          <div className="relative w-52 sm:w-72 shrink-0">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search user name or email..."
              className="w-full bg-white/[0.02] border border-white/[0.06] focus:border-white/20 rounded-lg px-3 py-1.5 text-xs text-white placeholder-neutral-600 outline-none font-sans"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-neutral-500 hover:text-white text-[10px] font-mono"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* C. HIGH-DENSITY CARDLESS USER STREAM */}
        <div className="flex-1 overflow-y-auto overscroll-contain pr-1 divide-y divide-white/[0.025] min-h-[160px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [scrollbar-width:thin]">
          {isLoading ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span className="text-xs text-neutral-500 font-mono">Syncing directory ledger...</span>
            </div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-24 text-xs text-neutral-500 font-mono">
              {searchQuery ? 'No accounts match search query.' : 'No accounts in this category.'}
            </div>
          ) : (
            filteredUsers.map((user, idx) => {
              const initials = (user.name || user.email || 'U').trim().charAt(0).toUpperCase();
              const role = (user.role || 'free').toLowerCase();

              return (
                <div
                  key={idx}
                  className="py-3 px-2 hover:bg-white/[0.015] rounded-xl transition-colors flex items-center justify-between flex-wrap gap-3 group"
                >
                  {/* Left: Dynamic Avatar + User Info */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-6.5 h-6.5 rounded-full bg-gradient-to-tr ${getAvatarGradient(user.email || user.name || '')} flex items-center justify-center text-[10px] font-mono text-white font-bold shadow-sm shrink-0 border border-white/10`}>
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate text-[13px]">{user.name || 'Anonymous User'}</span>
                        <span className="text-neutral-500 font-mono text-[10.5px] truncate">({user.email})</span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-neutral-500">
                        <span>Joined: {new Date(user.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Minimalist Role Pill */}
                  <div className="flex items-center gap-2.5 ml-auto shrink-0 font-mono">
                    <span className={`text-[10px] px-2.5 py-0.5 rounded-md border tracking-wider uppercase font-semibold ${
                      role === 'admin' ? 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20' :
                      role === 'pro' ? 'text-emerald-300 bg-emerald-500/10 border-emerald-500/20' :
                      'text-neutral-400 bg-white/[0.02] border-white/[0.05]'
                    }`}>
                      {role}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}