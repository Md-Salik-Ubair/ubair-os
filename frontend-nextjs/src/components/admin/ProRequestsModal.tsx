'use client';

import React, { useState, useMemo, useEffect } from 'react';

export interface ProRequestItem {
  id?: string | number;
  user_email: string;
  user_name?: string;
  created_at: string;
  updated_at?: string;
  status: 'pending' | 'granted' | 'rejected' | string;
  duration_days?: number;
}

interface ProRequestsModalProps {
  isOpen: boolean;
  onClose: () => void;
  requests: ProRequestItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onManageAccess: (userEmail: string, action: 'grant' | 'revoke' | 'reject', durationDays?: number) => Promise<void>;
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

export default function ProRequestsModal({
  isOpen,
  onClose,
  requests,
  isLoading,
  onRefresh,
  onManageAccess
}: ProRequestsModalProps) {
  const [filterStatus, setFilterStatus] = useState<'all' | 'pending' | 'granted' | 'rejected'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [processingEmail, setProcessingEmail] = useState<string | null>(null);

  // Auto-refresh when opened
  useEffect(() => {
    if (isOpen && requests.length === 0) {
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

  // Metrics
  const total = requests.length;
  const pendingCount = requests.filter(r => (r.status || 'pending').toLowerCase() === 'pending').length;
  const grantedCount = requests.filter(r => (r.status || '').toLowerCase() === 'granted').length;
  const rejectedCount = requests.filter(r => (r.status || '').toLowerCase() === 'rejected').length;

  // Filtered List
  const filteredRequests = useMemo(() => {
    return requests.filter(req => {
      const status = (req.status || 'pending').toLowerCase();
      if (filterStatus === 'pending' && status !== 'pending') return false;
      if (filterStatus === 'granted' && status !== 'granted') return false;
      if (filterStatus === 'rejected' && status !== 'rejected') return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const emailMatch = req.user_email?.toLowerCase().includes(q);
        const nameMatch = req.user_name?.toLowerCase().includes(q);
        if (!emailMatch && !nameMatch) return false;
      }
      return true;
    });
  }, [requests, filterStatus, searchQuery]);

  const handleAction = async (userEmail: string, action: 'grant' | 'revoke' | 'reject', durationDays = 30) => {
    if (processingEmail) return;
    setProcessingEmail(userEmail);
    try {
      await onManageAccess(userEmail, action, durationDays);
    } finally {
      setProcessingEmail(null);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#07080a] flex flex-col w-full h-[100dvh] overflow-hidden select-none animate-in fade-in duration-150 font-sans">
      
      {/* 1. TOP EXECUTIVE APP BAR */}
      <header className="h-14 sm:h-15 shrink-0 border-b border-white/[0.04] px-4 sm:px-8 lg:px-12 flex items-center justify-between bg-black/50 backdrop-blur-2xl select-none">
        
        {/* Left: Brand Mark + Pro Manager Title */}
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
              <span className="text-neutral-300 font-medium">Ubair's Tier Control</span>
              <span className="text-neutral-600">/</span>
              <span className="text-neutral-500 text-[10.5px]">Pro Access Management</span>
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
            title="Refresh Requests"
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
        
        {/* A. UNIFIED STAT RIBBON (Zero Boxes) */}
        <div className="flex items-center justify-between py-2.5 px-2 border-b border-white/[0.04] shrink-0 text-xs sm:text-[13px] font-mono">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Pending Review</span>
            <span className={`text-base sm:text-lg font-bold ${pendingCount > 0 ? 'text-amber-300' : 'text-neutral-400'}`}>
              {pendingCount}
            </span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">requests</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Granted Seats</span>
            <span className="text-base sm:text-lg font-bold text-emerald-400">{grantedCount}</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">active users</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Rejected</span>
            <span className="text-base sm:text-lg font-bold text-rose-400">{rejectedCount}</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">denied</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">All Inquiries</span>
            <span className="text-base sm:text-lg font-bold text-white">{total}</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">historical</span>
          </div>
        </div>

        {/* B. CONTROLS (Status Filter Tabs + Filter Search) */}
        <div className="flex items-center justify-between gap-3 py-3 shrink-0 border-b border-white/[0.03]">
          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {[
              { id: 'all', label: `All (${total})` },
              { id: 'pending', label: `Pending (${pendingCount})` },
              { id: 'granted', label: `Granted (${grantedCount})` },
              { id: 'rejected', label: `Rejected (${rejectedCount})` }
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterStatus(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap ${
                  filterStatus === tab.id
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

        {/* C. HIGH-DENSITY CARDLESS PRO APPLICANT ROWS */}
        <div className="flex-1 overflow-y-auto overscroll-contain pr-1 divide-y divide-white/[0.025] min-h-[160px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [scrollbar-width:thin]">
          {isLoading ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span className="text-xs text-neutral-500 font-mono">Syncing entitlement queue...</span>
            </div>
          ) : filteredRequests.length === 0 ? (
            <div className="text-center py-24 text-xs text-neutral-500 font-mono">
              {searchQuery ? 'No requests match search query.' : 'No requests in this segment.'}
            </div>
          ) : (
            filteredRequests.map((req, idx) => {
              const initials = (req.user_name || req.user_email || 'U').trim().charAt(0).toUpperCase();
              const status = (req.status || 'pending').toLowerCase();
              const isProcessing = processingEmail === req.user_email;

              return (
                <div
                  key={idx}
                  className="py-3.5 px-2 hover:bg-white/[0.015] rounded-xl transition-colors flex items-center justify-between flex-wrap gap-3 group"
                >
                  {/* Left: Avatar + Identity + Requested Date */}
                  <div className="flex items-center gap-3 min-w-0">
                    <div className={`w-6.5 h-6.5 rounded-full bg-gradient-to-tr ${getAvatarGradient(req.user_email || req.user_name || '')} flex items-center justify-center text-[10px] font-mono text-white font-bold shadow-sm shrink-0 border border-white/10`}>
                      {initials}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-white truncate text-[13px]">{req.user_name || 'Anonymous User'}</span>
                        <span className="text-neutral-500 font-mono text-[10.5px] truncate">({req.user_email})</span>
                      </div>

                      <div className="flex items-center gap-2 mt-0.5 text-[10px] font-mono text-neutral-500">
                        <span>Applied: {new Date(req.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                        <span>·</span>
                        <span>
                          Status: {' '}
                          <strong className={
                            status === 'granted' ? 'text-emerald-400 font-semibold' :
                            status === 'rejected' ? 'text-rose-400 font-semibold' :
                            'text-amber-400 font-semibold'
                          }>
                            {status === 'granted' ? 'Active Pro' : status === 'rejected' ? 'Rejected' : 'Under Review'}
                          </strong>
                          {req.duration_days ? ` (${req.duration_days} Days)` : ''}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Sleek Action Pill Cluster */}
                  <div className="flex items-center gap-1.5 sm:gap-2 ml-auto shrink-0">
                    {isProcessing ? (
                      <div className="h-6 px-3 rounded-md bg-white/[0.04] text-neutral-400 text-xs font-mono flex items-center gap-1.5">
                        <div className="w-2.5 h-2.5 border border-white/20 border-t-white rounded-full animate-spin" />
                        <span>Applying...</span>
                      </div>
                    ) : status === 'granted' ? (
                      <>
                        <span className="h-6 px-2.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-[11px] font-mono flex items-center gap-1">
                          ✓ Pro Active
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAction(req.user_email, 'revoke')}
                          className="h-6 px-2 rounded-md hover:bg-rose-500/10 text-neutral-500 hover:text-rose-400 text-[10.5px] font-mono transition-colors cursor-pointer active:scale-95"
                          title="Revoke Pro Access"
                        >
                          Revoke
                        </button>
                      </>
                    ) : status === 'rejected' ? (
                      <>
                        <span className="h-6 px-2.5 rounded-md bg-rose-500/10 border border-rose-500/20 text-rose-400 text-[11px] font-mono flex items-center">
                          ✕ Denied
                        </span>
                        <button
                          type="button"
                          onClick={() => handleAction(req.user_email, 'grant', 30)}
                          className="h-6 px-2.5 rounded-md hover:bg-emerald-500/10 text-neutral-400 hover:text-emerald-400 text-[11px] font-mono transition-colors cursor-pointer active:scale-95"
                        >
                          Approve (30D)
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={() => handleAction(req.user_email, 'grant', 30)}
                          className="h-6 px-2.5 rounded-md bg-emerald-500/10 hover:bg-emerald-500/20 border border-emerald-500/25 text-emerald-300 text-[11px] font-mono font-medium transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          Grant (30D)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(req.user_email, 'grant', 365)}
                          className="h-6 px-2.5 rounded-md bg-cyan-500/10 hover:bg-cyan-500/20 border border-cyan-500/25 text-cyan-300 text-[11px] font-mono font-medium transition-all active:scale-95 cursor-pointer shadow-sm"
                        >
                          1 Year
                        </button>
                        <button
                          type="button"
                          onClick={() => handleAction(req.user_email, 'reject')}
                          className="h-6 px-2 rounded-md hover:bg-rose-500/10 text-neutral-500 hover:text-rose-400 text-[11px] font-mono transition-colors active:scale-95 cursor-pointer"
                        >
                          Reject
                        </button>
                      </>
                    )}
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