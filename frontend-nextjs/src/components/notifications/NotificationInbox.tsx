'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';

export interface NotificationItem {
  id: string;
  recipient_email: string;
  title: string;
  message: string;
  category: 'direct' | 'broadcast' | 'welcome' | 'system';
  sender_name?: string;
  is_read: boolean;
  read_by?: string[];
  created_at: string;
}

interface NotificationInboxProps {
  userEmail: string;
  apiBase?: string;
}

export default function NotificationInbox({
  userEmail,
  apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}: NotificationInboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Local Preferences (Pins & Client Dismissals)
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);

  // Real-Time Online Toast Banner State
  const [activeToast, setActiveToast] = useState<NotificationItem | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const cleanEmail = useMemo(() => userEmail.trim().toLowerCase(), [userEmail]);

  // 1. Hydrate Pins and Dismissals from LocalStorage
  useEffect(() => {
    if (typeof window === 'undefined' || !cleanEmail) return;
    try {
      const storedPins = localStorage.getItem(`ubair_pinned_notifs_${cleanEmail}`);
      if (storedPins) setPinnedIds(JSON.parse(storedPins));

      const storedDismissed = localStorage.getItem(`ubair_dismissed_notifs_${cleanEmail}`);
      if (storedDismissed) setDismissedIds(JSON.parse(storedDismissed));
    } catch {}
  }, [cleanEmail]);

  // 2. Fetch Notifications from Backend
  const fetchNotifications = useCallback(async (isBackgroundPoll = false) => {
    if (!cleanEmail) return;
    if (!isBackgroundPoll) setIsLoading(true);

    try {
      const res = await fetch(`${apiBase}/api/notifications?email=${encodeURIComponent(cleanEmail)}`);
      if (!res.ok) return;

      const data = await res.json();
      const serverNotifs: NotificationItem[] = data.notifications || [];

      // Check for incoming new messages while user is active
      if (!isInitialLoadRef.current && isBackgroundPoll) {
        const freshArrivals = serverNotifs.filter(n => !knownIdsRef.current.has(n.id));
        if (freshArrivals.length > 0) {
          const newest = freshArrivals[0];
          // Trigger floating 3-second toast banner
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          setActiveToast(newest);
          toastTimeoutRef.current = setTimeout(() => {
            setActiveToast(null);
          }, 3500);
        }
      }

      // Update known IDs registry
      serverNotifs.forEach(n => knownIdsRef.current.add(n.id));
      isInitialLoadRef.current = false;

      setNotifications(serverNotifs);
      setUnreadCount(data.unread_count || 0);
    } catch (err) {
      console.warn('Notifications poll standby:', err);
    } finally {
      if (!isBackgroundPoll) setIsLoading(false);
    }
  }, [cleanEmail, apiBase]);

  // Initial Fetch & Active Polling Interval (every 25 seconds)
  useEffect(() => {
    fetchNotifications(false);
    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 25000);

    return () => {
      clearInterval(interval);
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    };
  }, [fetchNotifications]);

  // Close Popover on Outside Click & Escape Key
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape' && isOpen) {
        e.stopImmediatePropagation();
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen]);

  // Mark Single Notification as Read
  const handleMarkAsRead = async (notif: NotificationItem) => {
    // Check if already read
    const isDirect = notif.recipient_email === cleanEmail;
    const isAlreadyRead = isDirect ? notif.is_read : (notif.read_by || []).includes(cleanEmail);
    if (isAlreadyRead) return;

    // Optimistic UI update
    setNotifications(prev =>
      prev.map(n => {
        if (n.id === notif.id) {
          return {
            ...n,
            is_read: true,
            read_by: [...(n.read_by || []), cleanEmail]
          };
        }
        return n;
      })
    );
    setUnreadCount(prev => Math.max(0, prev - 1));

    try {
      await fetch(`${apiBase}/api/notifications/mark-read`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          notification_id: notif.id,
          user_email: cleanEmail,
          email: cleanEmail
        })
      });
    } catch {}
  };

  // Mark All Notifications as Read
  const handleMarkAllRead = async () => {
    if (unreadCount === 0) return;

    // Optimistically mark all in state
    setNotifications(prev =>
      prev.map(n => ({
        ...n,
        is_read: true,
        read_by: Array.from(new Set([...(n.read_by || []), cleanEmail]))
      }))
    );
    setUnreadCount(0);

    // Call mark-read for each unread notification
    const unreadItems = notifications.filter(n => {
      const isDirect = n.recipient_email === cleanEmail;
      return isDirect ? !n.is_read : !(n.read_by || []).includes(cleanEmail);
    });

    for (const item of unreadItems) {
      try {
        await fetch(`${apiBase}/api/notifications/mark-read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            notification_id: item.id,
            user_email: cleanEmail,
            email: cleanEmail
          })
        });
      } catch {}
    }
  };

  // Toggle Pin Status (Local User Preference)
  const handleTogglePin = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setPinnedIds(prev => {
      const updated = prev.includes(id) ? prev.filter(item => item !== id) : [id, ...prev];
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ubair_pinned_notifs_${cleanEmail}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Dismiss / Erase Notification from User View
  const handleDismissNotification = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setDismissedIds(prev => {
      const updated = [...prev, id];
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ubair_dismissed_notifs_${cleanEmail}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Clear All / Dismiss Entire Inbox
  const handleClearAll = () => {
    if (notifications.length === 0) return;
    const allIds = notifications.map(n => n.id);
    setDismissedIds(prev => {
      const merged = Array.from(new Set([...prev, ...allIds]));
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ubair_dismissed_notifs_${cleanEmail}`, JSON.stringify(merged));
      }
      return merged;
    });
    setUnreadCount(0);
  };

  // Filtered & Sorted Notification Feed
  const activeFeed = useMemo(() => {
    return notifications
      .filter(n => !dismissedIds.includes(n.id))
      .sort((a, b) => {
        const aPinned = pinnedIds.includes(a.id);
        const bPinned = pinnedIds.includes(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [notifications, dismissedIds, pinnedIds]);

  return (
    <>
      {/* ================= 1. FLOATING REAL-TIME TOAST (Auto-dismiss in 3.5s) ================= */}
      {activeToast && !isOpen && (
        <div 
          onClick={() => {
            setActiveToast(null);
            setIsOpen(true);
            handleMarkAsRead(activeToast);
          }}
          className="fixed top-16 right-4 sm:right-6 z-[100] w-[min(90vw,360px)] bg-[#0d0e12]/95 border border-white/[0.12] hover:border-amber-400/40 rounded-2xl p-3.5 shadow-[0_16px_50px_rgba(0,0,0,0.8)] backdrop-blur-2xl animate-in slide-in-from-top-3 fade-in duration-200 cursor-pointer group select-none"
        >
          <div className="flex items-start justify-between gap-2.5">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-ping" />
              <span className="text-[10.5px] font-mono text-amber-300 uppercase tracking-wider font-semibold">
                {activeToast.category === 'broadcast' ? 'Platform Broadcast' : 'Founder Message'}
              </span>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setActiveToast(null);
              }}
              className="text-neutral-500 hover:text-white text-xs px-1 rounded transition-colors"
            >
              ✕
            </button>
          </div>

          <h5 className="text-xs font-semibold text-white mt-1.5 line-clamp-1">
            {activeToast.title}
          </h5>
          <p className="text-[11.5px] text-neutral-300 mt-0.5 line-clamp-2 leading-relaxed">
            {activeToast.message}
          </p>

          <div className="mt-2 pt-2 border-t border-white/[0.04] flex items-center justify-between text-[10px] font-mono text-neutral-500">
            <span>{activeToast.sender_name || 'Md Salik (Founder)'}</span>
            <span className="text-amber-300/80 group-hover:underline">Open Inbox →</span>
          </div>
        </div>
      )}

      {/* ================= 2. HEADER BELL BUTTON & POPOVER ================= */}
      <div className="relative shrink-0" ref={containerRef}>
        
        {/* Clean Flat Bell Trigger (No Circle Wrapper) */}
        <button
          type="button"
          onClick={() => {
            setIsOpen(!isOpen);
            if (activeToast) setActiveToast(null);
          }}
          className={`relative p-1.5 rounded-lg flex items-center justify-center transition-all select-none active:scale-95 cursor-pointer ${
            isOpen
              ? 'bg-white/[0.08] text-white'
              : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
          }`}
          title="Notifications & Founder Messages"
        >
          <svg
            width="15"
            height="15"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="opacity-80 hover:opacity-100 transition-opacity"
          >
            <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
            <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
          </svg>

          {/* Micro Amber Ping Indicator */}
          {unreadCount > 0 && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
          )}
        </button>

        {/* ================= 3. INBOX POPOVER WINDOW ================= */}
        {isOpen && (
          <div className="absolute right-0 mt-3 w-[min(92vw,390px)] max-h-[85dvh] bg-[#090a0d] border border-white/[0.1] rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 z-50 flex flex-col overflow-hidden [scrollbar-width:none]">
            
            {/* Popover Header */}
            <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#090a0d]/90">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white tracking-tight">Inbox</span>
                <span className="text-[10px] font-mono text-neutral-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                  {activeFeed.length}
                </span>
                {unreadCount > 0 && (
                  <span className="text-[10px] font-mono text-amber-300">
                    ({unreadCount} new)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
                {/* Manual Refresh Trigger */}
                <button
                  type="button"
                  onClick={() => fetchNotifications(false)}
                  disabled={isLoading}
                  className="p-1 rounded-md text-neutral-500 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
                  title="Refresh notifications"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={isLoading ? "animate-spin text-white" : ""}>
                    <path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
                  </svg>
                </button>

                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllRead}
                    className="text-[10.5px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    title="Mark all as read"
                  >
                    Read all
                  </button>
                )}

                {activeFeed.length > 0 && (
                  <button
                    type="button"
                    onClick={handleClearAll}
                    className="text-[10.5px] font-mono text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                    title="Clear all notifications"
                  >
                    Clear
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="w-6 h-6 flex items-center justify-center text-neutral-500 hover:text-white text-xs rounded transition-colors cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Notification Stream Feed */}
            <div className="flex-1 overflow-y-auto p-2 space-y-1.5 min-h-[220px] max-h-[60vh] [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [scrollbar-width:thin]">
              {isLoading ? (
                <div className="h-44 flex flex-col items-center justify-center gap-2 text-center">
                  <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
                  <span className="text-[11px] font-mono text-neutral-500">Checking transmission links...</span>
                </div>
              ) : activeFeed.length === 0 ? (
                <div className="h-44 flex flex-col items-center justify-center text-center px-4 space-y-1 select-none">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-600 mb-1">
                    <path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
                    <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
                  </svg>
                  <span className="text-xs font-medium text-neutral-300">No Notifications</span>
                  <p className="text-[11px] text-neutral-500 font-sans leading-relaxed">
                    Direct founder replies and platform updates will appear here.
                  </p>
                </div>
              ) : (
                activeFeed.map(item => {
                  const isDirect = item.recipient_email === cleanEmail;
                  const isRead = isDirect ? item.is_read : (item.read_by || []).includes(cleanEmail);
                  const isPinned = pinnedIds.includes(item.id);

                  return (
                    <div
                      key={item.id}
                      onClick={() => handleMarkAsRead(item)}
                      className={`group relative p-3 rounded-2xl border transition-all cursor-pointer flex flex-col gap-1.5 ${
                        !isRead
                          ? 'bg-white/[0.04] hover:bg-white/[0.06] border-white/[0.1] shadow-sm'
                          : 'bg-white/[0.015] hover:bg-white/[0.035] border-white/[0.04] opacity-80 hover:opacity-100'
                      }`}
                    >
                      {/* Top Row: Clean Label + Pin & Dismiss Triggers */}
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider">
                            {item.category === 'broadcast' ? 'Announcement' : 'Direct Notice'}
                          </span>
                        </div>

                        {/* Action Buttons: Pin & Dismiss */}
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={(e) => handleTogglePin(item.id, e)}
                            className={`p-1 rounded hover:bg-white/[0.08] transition-colors text-[11px] ${
                              isPinned ? 'text-amber-400' : 'text-neutral-500 hover:text-white'
                            }`}
                            title={isPinned ? 'Unpin' : 'Pin to top'}
                          >
                            📌
                          </button>
                          <button
                            type="button"
                            onClick={(e) => handleDismissNotification(item.id, e)}
                            className="p-1 rounded text-neutral-500 hover:text-rose-400 hover:bg-white/[0.08] transition-colors text-xs"
                            title="Dismiss notification"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Title & Body */}
                      <div className="space-y-0.5">
                        <h5 className={`text-xs font-medium ${!isRead ? 'text-white font-semibold' : 'text-neutral-200'}`}>
                          {item.title}
                        </h5>
                        <p className="text-[11.5px] text-neutral-300 leading-relaxed font-sans whitespace-pre-wrap break-words">
                          {item.message}
                        </p>
                      </div>

                      {/* Footer: Sender & Time */}
                      <div className="flex items-center justify-between pt-1 border-t border-white/[0.03] text-[9.5px] font-mono text-neutral-500">
                        <span>{item.sender_name || 'Founder (Ubair OS)'}</span>
                        <span>{new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}

      </div>
    </>
  );
}