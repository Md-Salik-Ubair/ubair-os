'use client';

import React, { useState, useMemo, useEffect } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip
} from 'recharts';

export interface FeedbackItem {
  id: number;
  user_email: string;
  user_name: string;
  rating: number;
  category: string;
  feedback_text: string;
  created_at: string;
  user_avatar?: string;
  avatar_url?: string;
  image?: string;
}

interface FounderAnalyticsModalProps {
  isOpen: boolean;
  onClose: () => void;
  feedbacks: FeedbackItem[];
  isLoading: boolean;
  onRefresh: () => void;
  onDeleteFeedback: (id: number) => Promise<void>;
  onSendDirectReply: (fb: FeedbackItem, text: string) => Promise<void>;
  onOpenBroadcast?: () => void;
  deletingFeedbackId?: number | null;
  isSendingReply?: boolean;
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

const CustomChartTooltip = ({ active, payload, label }: any) => {
  if (active && payload && payload.length) {
    return (
      <div className="bg-[#0b0c10]/95 border border-white/[0.12] rounded-xl px-2.5 py-1.5 shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl">
        <span className="text-[10px] font-mono text-neutral-400 block">{label}</span>
        <span className="font-mono text-xs font-semibold text-cyan-300">
          {payload[0].value} {payload[0].value === 1 ? 'submission' : 'submissions'}
        </span>
      </div>
    );
  }
  return null;
};

export default function FounderAnalyticsModal({
  isOpen,
  onClose,
  feedbacks,
  isLoading,
  onRefresh,
  onDeleteFeedback,
  onSendDirectReply,
  onOpenBroadcast,
  deletingFeedbackId = null,
  isSendingReply = false
}: FounderAnalyticsModalProps) {
  const [isMounted, setIsMounted] = useState(false);
  const [filterCategory, setFilterCategory] = useState<'all' | 'Bug' | 'Feature' | 'General' | 'low'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [replyingFeedbackId, setReplyingFeedbackId] = useState<number | null>(null);
  const [replyTextMap, setReplyTextMap] = useState<Record<number, string>>({});

  useEffect(() => {
    setIsMounted(true);
    if (isOpen && feedbacks.length === 0) {
      onRefresh();
    }
  }, [isOpen]);

  // Priority Capture-Phase ESC Interceptor: If reply composer is open, close ONLY the composer!
  useEffect(() => {
    if (!isOpen) return;

    const handleCaptureKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && replyingFeedbackId !== null) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();
        setReplyingFeedbackId(null);
      }
    };

    window.addEventListener('keydown', handleCaptureKeyDown, true);
    return () => window.removeEventListener('keydown', handleCaptureKeyDown, true);
  }, [isOpen, replyingFeedbackId]);

  const total = feedbacks.length;
  const avgRating = total > 0 ? (feedbacks.reduce((acc, f) => acc + (f.rating || 5), 0) / total).toFixed(1) : '5.0';
  const positiveCount = feedbacks.filter(f => (f.rating || 5) >= 4).length;
  const positiveRate = total > 0 ? Math.round((positiveCount / total) * 100) : 100;
  const bugCount = feedbacks.filter(f => f.category?.toLowerCase().includes('bug')).length;
  const featureCount = feedbacks.filter(f => f.category?.toLowerCase().includes('feature')).length;
  const generalCount = Math.max(0, total - (bugCount + featureCount));

  const timelineData = useMemo(() => {
    if (feedbacks.length === 0) return [];
    const dateMap: Record<string, number> = {};
    const sorted = [...feedbacks].sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());

    sorted.forEach(fb => {
      const dateKey = new Date(fb.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' });
      dateMap[dateKey] = (dateMap[dateKey] || 0) + 1;
    });

    return Object.entries(dateMap).map(([date, count]) => ({ date, count }));
  }, [feedbacks]);

  const ratingSpread = useMemo(() => {
    const counts: Record<number, number> = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    feedbacks.forEach(f => {
      const r = Math.min(5, Math.max(1, f.rating || 5));
      counts[r] = (counts[r] || 0) + 1;
    });
    return [5, 4, 3, 2, 1].map(star => ({
      star,
      count: counts[star] || 0,
      pct: total > 0 ? Math.round(((counts[star] || 0) / total) * 100) : 0
    }));
  }, [feedbacks, total]);

  const filteredFeedbacks = useMemo(() => {
    return feedbacks.filter(fb => {
      if (filterCategory === 'Bug' && !fb.category?.toLowerCase().includes('bug')) return false;
      if (filterCategory === 'Feature' && !fb.category?.toLowerCase().includes('feature')) return false;
      if (filterCategory === 'General' && (fb.category?.toLowerCase().includes('bug') || fb.category?.toLowerCase().includes('feature'))) return false;
      if (filterCategory === 'low' && (fb.rating || 5) > 3) return false;

      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const textMatch = fb.feedback_text?.toLowerCase().includes(q);
        const nameMatch = fb.user_name?.toLowerCase().includes(q);
        const emailMatch = fb.user_email?.toLowerCase().includes(q);
        if (!textMatch && !nameMatch && !emailMatch) return false;
      }
      return true;
    });
  }, [feedbacks, filterCategory, searchQuery]);

  const handleSendReply = async (fb: FeedbackItem) => {
    const text = (replyTextMap[fb.id] || '').trim();
    if (!text || isSendingReply) return;
    await onSendDirectReply(fb, text);
    setReplyTextMap(prev => ({ ...prev, [fb.id]: '' }));
    setReplyingFeedbackId(null);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-[#07080a] flex flex-col w-full h-[100dvh] overflow-hidden select-none animate-in fade-in duration-150 font-sans">
      
      {/* 1. TOP EXECUTIVE APP BAR */}
      <header className="h-14 sm:h-15 shrink-0 border-b border-white/[0.04] px-4 sm:px-8 lg:px-12 flex items-center justify-between bg-black/50 backdrop-blur-2xl select-none">
        
        {/* Left: Brand Mark + Golden Founder Title + Ubair's Sub-Desk */}
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
              <span className="text-neutral-300 font-medium">Ubair's Intelligence Desk</span>
              <span className="text-neutral-600">/</span>
              <span className="text-neutral-500 text-[10.5px]">Direct Product Pulse</span>
            </div>
          </div>
        </div>

        {/* Right: Action Suite */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {onOpenBroadcast && (
            <button
              type="button"
              onClick={onOpenBroadcast}
              className="h-7.5 px-3 rounded-lg bg-white/[0.03] hover:bg-amber-400/10 hover:border-amber-400/25 border border-white/[0.06] text-neutral-300 hover:text-amber-300 text-[11.5px] font-mono transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
              title="Broadcast Announcement"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 text-amber-400/90">
                <path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9" />
                <path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5" />
                <circle cx="12" cy="12" r="2" />
                <path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5" />
                <path d="M19.1 4.9C23 8.8 23 15.1 19.1 19" />
              </svg>
              <span>Broadcast</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={isLoading}
            className="w-7.5 h-7.5 rounded-lg hover:bg-white/[0.06] text-neutral-400 hover:text-white transition-all flex items-center justify-center active:scale-95 disabled:opacity-40 cursor-pointer"
            title="Refresh Feedback Stream"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLoading ? 'animate-spin text-white' : ''}>
              <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
            </svg>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="h-7.5 px-2.5 rounded-lg hover:bg-white/[0.06] text-neutral-400 hover:text-white text-xs font-mono transition-all active:scale-95 cursor-pointer flex items-center gap-1"
            title="Close Console (Esc)"
          >
            <span>Esc</span>
            <span className="text-[10px] opacity-50 font-sans">✕</span>
          </button>
        </div>
      </header>

      {/* 2. CARDLESS WORKSTATION CANVAS */}
      <div className="max-w-7xl w-full mx-auto flex-1 flex flex-col px-4 sm:px-8 lg:px-12 py-4 min-h-0 overflow-hidden">
        
        {/* A. UNIFIED TELEMETRY RIBBON */}
        <div className="flex items-center justify-between py-2.5 px-2 border-b border-white/[0.04] shrink-0 text-xs sm:text-[13px] font-mono">
          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">CSAT Rating</span>
            <span className="text-base sm:text-lg font-bold text-amber-300">★ {avgRating}</span>
            <span className="text-[10.5px] text-neutral-600">/ 5.0</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Total Volume</span>
            <span className="text-base sm:text-lg font-bold text-white">{total}</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">reviews</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Positive Sentiment</span>
            <span className="text-base sm:text-lg font-bold text-emerald-400">{positiveRate}%</span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">promoters</span>
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.07]" />

          <div className="flex items-center gap-2 sm:gap-2.5">
            <span className="text-[11px] uppercase tracking-wider text-neutral-500">Reported Issues</span>
            <span className={`text-base sm:text-lg font-bold ${bugCount > 0 ? 'text-rose-400' : 'text-neutral-400'}`}>
              {bugCount}
            </span>
            <span className="text-[10.5px] text-neutral-600 hidden sm:inline">bugs triaged</span>
          </div>
        </div>

        {/* B. INTEGRATED VISUAL BAY */}
        {isMounted && feedbacks.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8 py-3.5 border-b border-white/[0.04] shrink-0">
            {/* Timeline Sparkline */}
            <div className="flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                  Ingestion Velocity
                </span>
                <span className="text-[10px] font-mono text-neutral-500">{timelineData.length} dates logged</span>
              </div>
              <div className="h-20 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={timelineData} margin={{ top: 2, right: 0, left: -30, bottom: 0 }} maxBarSize={16}>
                    <XAxis dataKey="date" stroke="#404040" fontSize={9} tickLine={false} axisLine={false} />
                    <YAxis stroke="#404040" fontSize={9} tickLine={false} axisLine={false} allowDecimals={false} />
                    <Tooltip content={<CustomChartTooltip />} cursor={false} />
                    <Bar dataKey="count" fill="#06b6d4" radius={[3, 3, 0, 0]} opacity={0.85} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Rating Spectrum */}
            <div className="flex flex-col justify-between">
              <div className="flex items-center justify-between mb-2">
                <span className="text-[11px] font-mono text-neutral-400 uppercase tracking-wider">
                  Rating Distribution
                </span>
                <div className="flex items-center gap-1.5 text-[9.5px] font-mono">
                  <span className="px-2 py-0.5 rounded text-purple-300 bg-purple-500/10 border border-purple-500/20">{featureCount} Features</span>
                  <span className="px-2 py-0.5 rounded text-rose-300 bg-rose-500/10 border border-rose-500/20">{bugCount} Bugs</span>
                  <span className="px-2 py-0.5 rounded text-cyan-300 bg-cyan-500/10 border border-cyan-500/20">{generalCount} General</span>
                </div>
              </div>

              <div className="space-y-1.5">
                {ratingSpread.map(item => (
                  <div key={item.star} className="flex items-center gap-2.5 text-[10.5px] font-mono">
                    <span className="text-neutral-500 w-4 text-right">{item.star}★</span>
                    <div className="flex-1 h-1.5 bg-white/[0.04] rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-amber-400 to-amber-300 rounded-full transition-all duration-300"
                        style={{ width: `${item.pct}%` }}
                      />
                    </div>
                    <span className="text-neutral-500 w-4 text-right text-[10px]">{item.count}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* C. CONTROLS */}
        <div className="flex items-center justify-between gap-3 py-3 shrink-0 border-b border-white/[0.03]">
          <div className="flex items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
            {[
              { id: 'all', label: `All (${total})` },
              { id: 'Bug', label: `Bugs (${bugCount})` },
              { id: 'Feature', label: `Features (${featureCount})` },
              { id: 'low', label: 'Low Rating (≤ 3★)' },
            ].map(tab => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setFilterCategory(tab.id as any)}
                className={`px-3 py-1 rounded-lg text-xs font-mono transition-all cursor-pointer whitespace-nowrap ${
                  filterCategory === tab.id
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
              placeholder="Search user, email, review context..."
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

        {/* D. CARDLESS ACTIVITY THREAD */}
        <div className="flex-1 overflow-y-auto overscroll-contain pr-1 divide-y divide-white/[0.025] min-h-[160px] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [scrollbar-width:thin]">
          {isLoading ? (
            <div className="h-44 flex flex-col items-center justify-center gap-2 text-center">
              <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
              <span className="text-xs text-neutral-500 font-mono">Syncing reviews...</span>
            </div>
          ) : filteredFeedbacks.length === 0 ? (
            <div className="text-center py-24 text-xs text-neutral-500 font-mono">
              {searchQuery ? 'No reviews match query.' : 'No reviews in this segment.'}
            </div>
          ) : (
            filteredFeedbacks.map((fb) => {
              const initials = (fb.user_name || fb.user_email || 'U').trim().charAt(0).toUpperCase();
              const isBug = fb.category?.toLowerCase().includes('bug');
              const isFeature = fb.category?.toLowerCase().includes('feature');
              const isReplying = replyingFeedbackId === fb.id;
              const isDeleting = deletingFeedbackId === fb.id;
              const rating = Math.min(5, Math.max(1, fb.rating || 5));
              const avatarSrc = fb.user_avatar || fb.avatar_url || fb.image;

              return (
                <div
                  key={fb.id}
                  className="py-4 px-2 hover:bg-white/[0.015] rounded-xl transition-colors space-y-2 group"
                >
                  {/* Top Line: Avatar + User + Tags + Stars */}
                  <div className="flex items-center justify-between text-xs flex-wrap gap-2">
                    <div className="flex items-center gap-2.5 min-w-0">
                      {avatarSrc ? (
                        <img
                          src={avatarSrc}
                          alt={fb.user_name || 'User'}
                          className="w-6 h-6 rounded-full object-cover border border-white/15 shrink-0"
                          onError={(e) => {
                            (e.target as HTMLElement).style.display = 'none';
                          }}
                        />
                      ) : (
                        <div className={`w-6 h-6 rounded-full bg-gradient-to-tr ${getAvatarGradient(fb.user_email || fb.user_name)} flex items-center justify-center text-[10px] font-mono text-white font-bold shadow-sm shrink-0 border border-white/10`}>
                          {initials}
                        </div>
                      )}

                      <span className="font-medium text-white truncate text-[13px]">{fb.user_name || 'Anonymous'}</span>
                      <span className="text-neutral-500 font-mono text-[10.5px] truncate">({fb.user_email})</span>
                    </div>

                    <div className="flex items-center gap-3 ml-auto shrink-0">
                      <span className={`text-[10px] font-mono px-2 py-0.5 rounded border ${
                        isBug ? 'text-rose-300 bg-rose-500/10 border-rose-500/20'
                        : isFeature ? 'text-purple-300 bg-purple-500/10 border-purple-500/20'
                        : 'text-cyan-300 bg-cyan-500/10 border-cyan-500/20'
                      }`}>
                        {fb.category || 'General'}
                      </span>

                      <div className="flex items-center gap-0.5 text-xs">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <span key={star} className={star <= rating ? 'text-amber-400' : 'text-neutral-700'}>
                            ★
                          </span>
                        ))}
                        <span className="text-[10px] font-mono text-neutral-500 ml-1">{rating}.0</span>
                      </div>
                    </div>
                  </div>

                  {/* Feedback Text */}
                  <p className="text-[13px] sm:text-[13.5px] text-neutral-300 leading-relaxed font-sans pl-8.5 pr-4 select-text">
                    {fb.feedback_text}
                  </p>

                  {/* Actions & Timestamp Row (Clean Interactive Micro-Buttons) */}
                  <div className="flex items-center justify-between pl-8.5 text-[10.5px] font-mono text-neutral-500 pt-0.5">
                    <span>
                      {new Date(fb.created_at).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>

                    <div className="flex items-center gap-2">
                      {fb.user_email && !fb.user_email.includes('anonymous') && (
                        <button
                          type="button"
                          onClick={() => setReplyingFeedbackId(isReplying ? null : fb.id)}
                          className={`h-6 px-2.5 rounded-md transition-all flex items-center gap-1 cursor-pointer active:scale-95 ${
                            isReplying 
                              ? 'bg-amber-400/15 text-amber-300 border border-amber-400/30' 
                              : 'text-neutral-400 hover:text-white hover:bg-white/[0.05]'
                          }`}
                        >
                          <span>{isReplying ? '✕ Cancel' : '✉ Reply'}</span>
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={isDeleting}
                        onClick={() => onDeleteFeedback(fb.id)}
                        className="h-6 px-2 rounded-md text-neutral-500 hover:text-rose-400 hover:bg-rose-500/10 transition-all cursor-pointer disabled:opacity-40 flex items-center gap-1 active:scale-95"
                        title="Delete review"
                      >
                        {isDeleting ? (
                          <div className="w-2.5 h-2.5 border-2 border-neutral-400 border-t-white rounded-full animate-spin" />
                        ) : (
                          <span>🗑 Delete</span>
                        )}
                      </button>
                    </div>
                  </div>

                  {/* Inline Composer */}
                  {isReplying && (
                    <div className="ml-8.5 mt-2.5 p-3 rounded-xl bg-black/60 border border-amber-400/25 space-y-2.5 animate-in fade-in duration-100 shadow-[0_4px_20px_rgba(0,0,0,0.4)]">
                      <span className="text-[10px] font-mono text-amber-300/90 uppercase tracking-wider block">
                        In-App Dispatch to {fb.user_email}
                      </span>
                      <textarea
                        rows={2}
                        autoFocus
                        value={replyTextMap[fb.id] || ''}
                        onChange={(e) => setReplyTextMap(prev => ({ ...prev, [fb.id]: e.target.value }))}
                        placeholder="Write direct message to user inbox..."
                        className="w-full bg-white/[0.02] border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-neutral-600 outline-none focus:border-amber-400/50 resize-none font-sans"
                      />
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setReplyingFeedbackId(null)}
                          className="px-2.5 py-1 text-xs text-neutral-400 hover:text-white rounded transition-colors cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          disabled={isSendingReply || !(replyTextMap[fb.id] || '').trim()}
                          onClick={() => handleSendReply(fb)}
                          className="px-3.5 py-1 text-xs font-semibold bg-white text-black hover:bg-neutral-200 rounded-md transition-all disabled:opacity-40 cursor-pointer shadow-sm active:scale-95"
                        >
                          {isSendingReply ? 'Sending...' : 'Send'}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

      </div>
    </div>
  );
}