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

// Ambient Time-of-Day & Milestone Generator (Hydration Safe - Only runs on client)
function getClientDynamicNotifications(email: string): NotificationItem[] {
  if (typeof window === 'undefined' || !email) return [];
  const items: NotificationItem[] = [];
  const now = new Date();
  const hour = now.getHours();
  const dateKey = now.toISOString().slice(0, 10);

  // 1. Contextual Time Greetings & Ambient Notes
  let timeTitle = '';
  let timeMsg = '';
  if (hour >= 5 && hour < 12) {
    timeTitle = '🌅 Morning Clarity & Focus';
    timeMsg = 'Rise and build. The neural fleet and workspace routers are primed for your morning workflow.';
  } else if (hour >= 12 && hour < 17) {
    timeTitle = '⚡ Afternoon Momentum';
    timeMsg = 'Keep the stride going. Multi-model failover mesh is running at peak throughput.';
  } else if (hour >= 17 && hour < 22) {
    timeTitle = '🌆 Evening Creative Hours';
    timeMsg = 'Reviewing the day or deep in ideation? Your vector vaults and notes bridge are synchronized.';
  } else {
    timeTitle = '🌙 Midnight Flow State';
    timeMsg = 'Night owl mode engaged. Low latency, zero distractions—ambient engines ready.';
  }

  items.push({
    id: `ambient-greeting-${dateKey}`,
    recipient_email: email,
    title: timeTitle,
    message: timeMsg,
    category: 'system',
    sender_name: 'Ubair OS Ambient',
    is_read: false,
    created_at: now.toISOString()
  });

  // 2. User Journey & Loyalty Milestones
  try {
    const joinKey = `ubair_first_seen_${email}`;
    let joinTime = localStorage.getItem(joinKey);
    if (!joinTime) {
      joinTime = Date.now().toString();
      localStorage.setItem(joinKey, joinTime);
    }
    const daysActive = Math.floor((Date.now() - parseInt(joinTime, 10)) / (1000 * 60 * 60 * 24));

    let milestoneTitle = '';
    let milestoneMsg = '';
    let milestoneId = '';

    if (daysActive >= 365) {
      milestoneId = `milestone-365d-${email}`;
      milestoneTitle = '👑 1-Year OS Pioneer';
      milestoneMsg = 'You have been building on Ubair OS for over a year! Thank you for being an indispensable founder-tier user.';
    } else if (daysActive >= 30) {
      milestoneId = `milestone-30d-${email}`;
      milestoneTitle = '🚀 1 Month with Ubair OS';
      milestoneMsg = 'A full month of intelligence, documents, and compute. Glad to have you shaping the OS with us!';
    } else if (daysActive >= 7) {
      milestoneId = `milestone-7d-${email}`;
      milestoneTitle = '⚡ 1 Week Milestone';
      milestoneMsg = 'One week into your journey. Hope the multi-tier failover and forge studio are accelerating your output.';
    } else {
      milestoneId = `milestone-day0-${email}`;
      milestoneTitle = '✨ Welcome to Ubair OS';
      milestoneMsg = 'Your personal neural workspace is online. Explore Forge Studio, Assessment Arena, and multi-tier LLMs.';
    }

    if (milestoneId) {
      items.push({
        id: milestoneId,
        recipient_email: email,
        title: milestoneTitle,
        message: milestoneMsg,
        category: 'welcome',
        sender_name: 'Md Salik (Founder)',
        is_read: false,
        created_at: new Date(parseInt(joinTime, 10)).toISOString()
      });
    }
  } catch {}

  return items;
}

interface NotificationInboxProps {
  userEmail: string;
  apiBase?: string;
}

// ============================================================================
// TOUCH-SWIPABLE NOTIFICATION CARD (MOBILE SLIDE-TO-REMOVE + PC DIRECT CROSS)
// ============================================================================
interface NotificationCardProps {
  item: NotificationItem;
  isRead: boolean;
  isPinned: boolean;
  onMarkRead: (item: NotificationItem) => void;
  onTogglePin: (id: string, e: React.MouseEvent) => void;
  onDismiss: (id: string, e?: React.MouseEvent) => void;
}

function NotificationCard({
  item,
  isRead,
  isPinned,
  onMarkRead,
  onTogglePin,
  onDismiss
}: NotificationCardProps) {
  const [offsetX, setOffsetX] = useState(0);
  const [isSwiping, setIsSwiping] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);

  const startXRef = useRef<number>(0);
  const startYRef = useRef<number>(0);
  const isHorizontalScrollRef = useRef<boolean | null>(null);

  const handleTouchStart = (e: React.TouchEvent) => {
    startXRef.current = e.touches[0].clientX;
    startYRef.current = e.touches[0].clientY;
    isHorizontalScrollRef.current = null;
    setIsSwiping(true);
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    const currentX = e.touches[0].clientX;
    const currentY = e.touches[0].clientY;
    const diffX = currentX - startXRef.current;
    const diffY = currentY - startYRef.current;

    // Detect direction on initial movement
    if (isHorizontalScrollRef.current === null) {
      if (Math.abs(diffX) > 8 || Math.abs(diffY) > 8) {
        isHorizontalScrollRef.current = Math.abs(diffX) > Math.abs(diffY);
      }
    }

    // Only drag horizontally if user isn't scrolling vertically
    if (isHorizontalScrollRef.current) {
      const damp = Math.abs(diffX) > 100 ? diffX * 0.75 : diffX;
      setOffsetX(damp);
    }
  };

  const handleTouchEnd = () => {
    setIsSwiping(false);
    const threshold = 75; // 75px drag triggers dismissal

    if (Math.abs(offsetX) > threshold) {
      setIsDismissing(true);
      // Animate out in the swipe direction
      setOffsetX(offsetX > 0 ? 380 : -380);
      setTimeout(() => {
        onDismiss(item.id);
      }, 200);
    } else {
      // Snap back smoothly
      setOffsetX(0);
    }
    isHorizontalScrollRef.current = null;
  };

  return (
    <div className="relative overflow-hidden rounded-2xl select-none">
      {/* Background reveal on swipe (Rose / Trash action) */}
      <div
        className={`absolute inset-0 rounded-2xl flex items-center justify-between px-4 transition-colors ${
          Math.abs(offsetX) > 30 ? 'bg-rose-500/20 border border-rose-500/40' : 'bg-transparent'
        }`}
      >
        <span className={`text-xs font-mono font-medium text-rose-300 transition-opacity ${offsetX > 35 ? 'opacity-100' : 'opacity-0'}`}>
          ✕ Remove
        </span>
        <span className={`text-xs font-mono font-medium text-rose-300 transition-opacity ${offsetX < -35 ? 'opacity-100' : 'opacity-0'}`}>
          Remove ✕
        </span>
      </div>

      {/* Main card body with real-time translation and touch listeners */}
      <div
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onClick={() => {
          // Only trigger click mark-read if user was not swiping
          if (Math.abs(offsetX) < 10) {
            onMarkRead(item);
          }
        }}
        style={{
          transform: `translateX(${offsetX}px)`,
          transition: isSwiping ? 'none' : 'transform 0.25s cubic-bezier(0.2, 0.8, 0.2, 1), opacity 0.2s ease',
          opacity: isDismissing ? 0 : 1
        }}
        className={`group relative p-3 rounded-2xl border transition-colors cursor-pointer flex flex-col gap-1.5 touch-pan-y ${
          !isRead
            ? 'bg-[#0f1117] hover:bg-[#14161f] border-white/[0.12] shadow-sm'
            : 'bg-[#0a0b0e] hover:bg-[#0e0f14] border-white/[0.05] opacity-80 hover:opacity-100'
        }`}
      >
        <div className="flex items-center justify-between text-xs">
          <div className="flex items-center gap-1.5 min-w-0">
            {!isRead && (
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0 shadow-[0_0_6px_rgba(251,191,36,0.8)]" />
            )}
            <span className="text-[9px] font-mono text-neutral-500 uppercase tracking-wider truncate">
              {item.category === 'broadcast'
                ? 'Announcement'
                : item.category === 'welcome'
                ? 'Journey Milestone'
                : item.category === 'system'
                ? 'Ambient Transmission'
                : 'Direct Notice'}
            </span>
          </div>

          {/* Action triggers: ✕ is ALWAYS clearly visible on touch/mobile, and hover on desktop */}
          <div className="flex items-center gap-1 shrink-0 ml-2">
            <button
              type="button"
              onClick={(e) => onTogglePin(item.id, e)}
              className={`p-1.5 rounded-md hover:bg-white/[0.08] transition-colors text-[11px] cursor-pointer ${
                isPinned ? 'text-amber-400' : 'text-neutral-500 hover:text-white'
              }`}
              title={isPinned ? 'Unpin' : 'Pin to top'}
            >
              📌
            </button>
            <button
              type="button"
              onClick={(e) => onDismiss(item.id, e)}
              className="p-1.5 rounded-md text-neutral-400 hover:text-rose-400 active:text-rose-400 hover:bg-white/[0.08] transition-colors text-xs cursor-pointer flex items-center justify-center min-w-[24px] min-h-[24px]"
              title="Remove notification"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="space-y-0.5">
          <h5 className={`text-xs ${!isRead ? 'text-white font-semibold' : 'text-neutral-200 font-medium'}`}>
            {item.title}
          </h5>
          <p className="text-[11.5px] text-neutral-300 leading-relaxed font-sans whitespace-pre-wrap break-words">
            {item.message}
          </p>
        </div>

        <div className="flex items-center justify-between pt-1 border-t border-white/[0.04] text-[9.5px] font-mono text-neutral-500 select-none">
          <span>{item.sender_name || 'Founder (Ubair OS)'}</span>
          <span>{new Date(item.created_at).toLocaleDateString([], { month: 'short', day: 'numeric' })}</span>
        </div>
      </div>
    </div>
  );
}

export default function NotificationInbox({
  userEmail,
  apiBase = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'
}: NotificationInboxProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isLoading, setIsLoading] = useState(false);

  // Dynamic Client Items (Hydration Safe State)
  const [dynamicItems, setDynamicItems] = useState<NotificationItem[]>([]);

  // Local Preferences (Pins, Dismissals & Client Read States)
  const [pinnedIds, setPinnedIds] = useState<string[]>([]);
  const [dismissedIds, setDismissedIds] = useState<string[]>([]);
  const [clientReadIds, setClientReadIds] = useState<string[]>([]);

  // Real-Time Toast Banner State
  const [activeToast, setActiveToast] = useState<NotificationItem | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const knownIdsRef = useRef<Set<string>>(new Set());
  const isInitialLoadRef = useRef(true);

  const containerRef = useRef<HTMLDivElement>(null);
  const cleanEmail = useMemo(() => userEmail.trim().toLowerCase(), [userEmail]);

  // 1. Hydrate dynamic items & localStorage on client mount (Safe Lifecycle)
  useEffect(() => {
    if (typeof window === 'undefined' || !cleanEmail) return;
    try {
      setDynamicItems(getClientDynamicNotifications(cleanEmail));

      const storedPins = localStorage.getItem(`ubair_pinned_notifs_${cleanEmail}`);
      if (storedPins) setPinnedIds(JSON.parse(storedPins));

      const storedDismissed = localStorage.getItem(`ubair_dismissed_notifs_${cleanEmail}`);
      if (storedDismissed) setDismissedIds(JSON.parse(storedDismissed));

      const storedClientRead = localStorage.getItem(`ubair_client_read_notifs_${cleanEmail}`);
      if (storedClientRead) setClientReadIds(JSON.parse(storedClientRead));
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

      if (!isInitialLoadRef.current && isBackgroundPoll) {
        const freshArrivals = serverNotifs.filter(n => !knownIdsRef.current.has(n.id));
        if (freshArrivals.length > 0) {
          const newest = freshArrivals[0];
          if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
          setActiveToast(newest);
          toastTimeoutRef.current = setTimeout(() => {
            setActiveToast(null);
          }, 3500);
        }
      }

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
    if (notif.id.startsWith('ambient-') || notif.id.startsWith('milestone-')) {
      if (clientReadIds.includes(notif.id)) return;
      const updated = [...clientReadIds, notif.id];
      setClientReadIds(updated);
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ubair_client_read_notifs_${cleanEmail}`, JSON.stringify(updated));
      }
      return;
    }

    const isDirect = notif.recipient_email === cleanEmail;
    const isAlreadyRead = isDirect ? notif.is_read : (notif.read_by || []).includes(cleanEmail);
    if (isAlreadyRead) return;

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
    const dynamicIds = dynamicItems.map(d => d.id);
    const updatedClientReads = Array.from(new Set([...clientReadIds, ...dynamicIds]));
    setClientReadIds(updatedClientReads);
    if (typeof window !== 'undefined') {
      localStorage.setItem(`ubair_client_read_notifs_${cleanEmail}`, JSON.stringify(updatedClientReads));
    }

    if (unreadCount > 0) {
      setNotifications(prev =>
        prev.map(n => ({
          ...n,
          is_read: true,
          read_by: Array.from(new Set([...(n.read_by || []), cleanEmail]))
        }))
      );
      setUnreadCount(0);

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
    }
  };

  // Toggle Pin Status
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

  // Dismiss Notification (Used by both ✕ click & mobile touch swipe)
  const handleDismissNotification = (id: string, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDismissedIds(prev => {
      if (prev.includes(id)) return prev;
      const updated = [...prev, id];
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ubair_dismissed_notifs_${cleanEmail}`, JSON.stringify(updated));
      }
      return updated;
    });
  };

  // Clear All
  const handleClearAll = () => {
    const allIds = [...notifications.map(n => n.id), ...dynamicItems.map(d => d.id)];
    setDismissedIds(prev => {
      const merged = Array.from(new Set([...prev, ...allIds]));
      if (typeof window !== 'undefined') {
        localStorage.setItem(`ubair_dismissed_notifs_${cleanEmail}`, JSON.stringify(merged));
      }
      return merged;
    });
    setUnreadCount(0);
  };

  // Total Unread Count
  const totalUnreadCount = useMemo(() => {
    const validDynamic = dynamicItems.filter(n => !dismissedIds.includes(n.id));
    const dynamicUnread = validDynamic.filter(item => !clientReadIds.includes(item.id)).length;
    return unreadCount + dynamicUnread;
  }, [dynamicItems, dismissedIds, clientReadIds, unreadCount]);

  // Combined Feed
  const activeFeed = useMemo(() => {
    const dynamicWithRead = dynamicItems.map(item => ({
      ...item,
      is_read: clientReadIds.includes(item.id)
    }));

    const combined = [...notifications, ...dynamicWithRead];

    return combined
      .filter(n => !dismissedIds.includes(n.id))
      .sort((a, b) => {
        const aPinned = pinnedIds.includes(a.id);
        const bPinned = pinnedIds.includes(b.id);
        if (aPinned && !bPinned) return -1;
        if (!aPinned && bPinned) return 1;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [notifications, dynamicItems, dismissedIds, pinnedIds, clientReadIds]);

  return (
    <>
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

      <div className="relative shrink-0" ref={containerRef}>
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

          {totalUnreadCount > 0 && (
            <span className="absolute top-1 right-1 w-1.5 h-1.5 bg-amber-400 rounded-full shadow-[0_0_6px_rgba(251,191,36,0.9)]" />
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-3 w-[min(92vw,390px)] max-h-[85dvh] bg-[#090a0d] border border-white/[0.1] rounded-3xl shadow-[0_24px_80px_rgba(0,0,0,0.9)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-100 z-50 flex flex-col overflow-hidden [scrollbar-width:none]">
            <div className="px-4 py-3.5 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-[#090a0d]/90">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-white tracking-tight">Inbox</span>
                <span className="text-[10px] font-mono text-neutral-400 bg-white/[0.04] px-1.5 py-0.5 rounded border border-white/[0.06]">
                  {activeFeed.length}
                </span>
                {totalUnreadCount > 0 && (
                  <span className="text-[10px] font-mono text-amber-300">
                    ({totalUnreadCount} new)
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2.5">
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

                {totalUnreadCount > 0 && (
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

            {/* Mobile swipe hint */}
            {activeFeed.length > 0 && (
              <div className="px-4 py-1.5 bg-white/[0.02] border-b border-white/[0.03] flex items-center justify-between text-[10px] font-mono text-neutral-500 select-none">
                <span className="sm:hidden flex items-center gap-1">
                  <span>⇄</span> Swipe left/right to remove
                </span>
                <span className="hidden sm:inline">Click message to mark read</span>
                <span>Click ✕ to delete</span>
              </div>
            )}

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
                  const isRead = item.id.startsWith('ambient-') || item.id.startsWith('milestone-')
                    ? clientReadIds.includes(item.id)
                    : (isDirect ? item.is_read : (item.read_by || []).includes(cleanEmail));
                  const isPinned = pinnedIds.includes(item.id);

                  return (
                    <NotificationCard
                      key={item.id}
                      item={item}
                      isRead={isRead}
                      isPinned={isPinned}
                      onMarkRead={handleMarkAsRead}
                      onTogglePin={handleTogglePin}
                      onDismiss={handleDismissNotification}
                    />
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