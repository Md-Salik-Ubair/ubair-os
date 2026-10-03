'use client';

import React, { useState, useEffect, useRef } from 'react';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userName?: string;
  apiBase?: string;
}

const CATEGORIES = [
  { id: 'Feature', label: 'Feature Request', icon: '✨' },
  { id: 'Bug', label: 'Bug Report', icon: '🐞' },
  { id: 'General', label: 'General Feedback', icon: '💬' },
  { id: 'Performance', label: 'Speed & UX', icon: '⚡' }
];

export default function FeedbackModal({
  isOpen,
  onClose,
  userEmail = '',
  userName = 'User',
  apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}: FeedbackModalProps) {
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [category, setCategory] = useState('General');
  const [feedbackText, setFeedbackText] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Reset and auto-focus when opened
  useEffect(() => {
    if (isOpen) {
      setIsSuccess(false);
      setErrorMessage(null);
      setTimeout(() => textareaRef.current?.focus(), 80);
    }
  }, [isOpen]);

  // Bulletproof Capture-Phase ESC Handling
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanText = feedbackText.trim();
    if (!cleanText || isSending) return;

    setIsSending(true);
    setErrorMessage(null);

    try {
      const selectedCategoryObj = CATEGORIES.find(c => c.id === category);
      const res = await fetch(`${apiBase}/api/feedback`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: userEmail.trim().toLowerCase() || 'anonymous@ubair-os.internal',
          user_name: userName.trim() || 'User',
          rating,
          category: selectedCategoryObj?.label || category,
          feedback_text: cleanText
        })
      });

      if (!res.ok) {
        throw new Error(`Server status ${res.status}`);
      }

      setIsSuccess(true);
      setTimeout(() => {
        setIsSuccess(false);
        setFeedbackText('');
        setRating(5);
        setCategory(CATEGORIES[0].id);
        onClose();
      }, 1500);
    } catch {
      setErrorMessage('Transmission failed. Check network or server connection.');
    } finally {
      setIsSending(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150 font-sans"
      onClick={onClose}
    >
      <div
        className="w-full max-w-[430px] max-h-[90dvh] overflow-y-auto bg-[#0a0b0e] border border-white/[0.1] rounded-2xl p-5 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.95)] space-y-4 [scrollbar-width:none] animate-in zoom-in-95 duration-150"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header (Bigger Logo + Crisp Title) */}
        <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.06]">
          <div className="flex items-center gap-3">
            <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
              <img
                src="/assets/ubair-logo.png"
                alt="Ubair Logo"
                className="w-full h-full object-contain scale-[1.7] drop-shadow-[0_0_12px_rgba(56,189,248,0.5)] pointer-events-none"
              />
            </div>
            <div>
              <h4 className="text-[14.5px] font-semibold text-white tracking-tight">Share Feedback</h4>
              <p className="text-[10px] font-mono text-neutral-500">Direct transmission to Founder Console</p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="h-6.5 px-2 rounded-md bg-white/[0.04] hover:bg-white/[0.08] text-neutral-400 hover:text-white text-[11px] font-mono transition-all cursor-pointer flex items-center gap-1 active:scale-95"
            title="Close (Esc)"
          >
            <span>Esc</span>
            <span className="text-[9px] opacity-60">✕</span>
          </button>
        </div>

        {isSuccess ? (
          <div className="py-8 text-center space-y-3 animate-in zoom-in-95 duration-150">
            <div className="w-10 h-10 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(16,185,129,0.3)]">
              ✓
            </div>
            <h4 className="text-sm font-semibold text-white">Dispatched to Console</h4>
            <p className="text-xs text-neutral-400 max-w-[280px] mx-auto leading-relaxed">
              Your feedback is now live on Ubair's telemetry desk.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Rating Row (Zero Nested Box, Clean Open Stars) */}
            <div className="flex items-center justify-between pt-1">
              <div className="flex items-center gap-1">
                {[1, 2, 3, 4, 5].map((star) => {
                  const isActive = (hoverRating || rating) >= star;
                  return (
                    <button
                      key={star}
                      type="button"
                      onClick={() => setRating(star)}
                      onMouseEnter={() => setHoverRating(star)}
                      onMouseLeave={() => setHoverRating(0)}
                      className="p-1.5 rounded-lg hover:bg-white/[0.06] transition-all cursor-pointer"
                    >
                      <svg
                        width="21"
                        height="21"
                        viewBox="0 0 24 24"
                        fill={isActive ? '#fbbf24' : 'none'}
                        stroke={isActive ? '#fbbf24' : '#4b5563'}
                        strokeWidth="1.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        className="transition-transform duration-100 hover:scale-115"
                      >
                        <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                      </svg>
                    </button>
                  );
                })}
              </div>

              <span className="text-xs font-mono font-bold text-amber-300 tracking-wider">
                ★ {hoverRating || rating} / 5
              </span>
            </div>

            {/* Category Segment (Clean Flat Tabs) */}
            <div>
              <div className="grid grid-cols-2 gap-1.5">
                {CATEGORIES.map((cat) => {
                  const isSelected = category === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() => setCategory(cat.id)}
                      className={`px-3 py-2 rounded-xl text-xs font-mono transition-all border text-left flex items-center gap-2 cursor-pointer ${
                        isSelected
                          ? 'bg-white/[0.12] text-white border-white/20 shadow-sm font-medium'
                          : 'bg-transparent text-neutral-400 border-white/[0.05] hover:border-white/10 hover:text-white hover:bg-white/[0.02]'
                      }`}
                    >
                      <span className="text-xs">{cat.icon}</span>
                      <span className="truncate text-[11px]">{cat.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Message Area */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-[10px] font-mono text-neutral-400 uppercase tracking-wider">
                  Feedback Note
                </label>
                <span className="text-[10px] font-mono text-neutral-500">
                  {feedbackText.length}/1000
                </span>
              </div>
              <textarea
                ref={textareaRef}
                required
                maxLength={1000}
                rows={3}
                value={feedbackText}
                onChange={(e) => setFeedbackText(e.target.value)}
                onKeyDown={(e) => {
                  if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                    e.preventDefault();
                    handleSubmit(e);
                  }
                }}
                placeholder="What feature should we build next or what needs engineering fix... (Ctrl+Enter to send)"
                className="w-full bg-white/[0.02] border border-white/[0.08] focus:border-white/25 rounded-xl p-3 text-xs text-white placeholder-neutral-600 outline-none transition-all resize-none leading-relaxed font-sans"
              />
            </div>

            {errorMessage && (
              <p className="text-[11px] font-mono text-rose-400 leading-tight">
                {errorMessage}
              </p>
            )}

            {/* Footer Actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onClose}
                className="px-3.5 py-1.5 text-xs text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSending || !feedbackText.trim()}
                className="px-4 py-1.5 text-xs font-semibold bg-white text-black hover:bg-neutral-200 rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-40 cursor-pointer flex items-center gap-1.5"
              >
                {isSending && (
                  <div className="w-2.5 h-2.5 border-2 border-neutral-400 border-t-black rounded-full animate-spin" />
                )}
                <span>{isSending ? 'Sending...' : 'Send Feedback →'}</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}