'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useSession, signOut } from 'next-auth/react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import ChatInput from '../components/chat/ChatInput';
import WorkspaceDrawer, { WorkspaceItem } from '../components/workspace/WorkspaceDrawer';
import ImageStudio from '../components/ImageStudio';
import AssessmentArena from '../components/AssessmentArena';
import UbairCodex from '../components/codex/UbairCodex';
import UbairSlate from '../components/UbairSlate';
import ForgeStudio from '../components/workspace/ForgeStudio';
import BrandLogo from '../components/ui/BrandLogo';
import NotificationInbox from '../components/notifications/NotificationInbox';
import FounderAnalyticsModal from '../components/admin/FounderAnalyticsModal';
import ProRequestsModal from '../components/admin/ProRequestsModal';
import UserDirectoryModal from '../components/admin/UserDirectoryModal';
import FeedbackModal from '../components/feedback/FeedbackModal';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

/* ============================================================================
 * AMBIENT COSMIC GALAXY CANVAS (HARDWARE ACCELERATED · 60-120 FPS)
 * ========================================================================== */
function AmbientCosmicGalaxy() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    const createSprite = (r: number, g: number, b: number, size: number) => {
      const sCanvas = document.createElement('canvas');
      sCanvas.width = size * 2;
      sCanvas.height = size * 2;
      const sCtx = sCanvas.getContext('2d');
      if (!sCtx) return sCanvas;

      const grad = sCtx.createRadialGradient(size, size, 0, size, size, size);
      grad.addColorStop(0, `rgba(${r}, ${g}, ${b}, 1)`);
      grad.addColorStop(0.22, `rgba(${r}, ${g}, ${b}, 0.6)`);
      grad.addColorStop(0.65, `rgba(${r}, ${g}, ${b}, 0.12)`);
      grad.addColorStop(1, `rgba(${r}, ${g}, ${b}, 0)`);

      sCtx.fillStyle = grad;
      sCtx.beginPath();
      sCtx.arc(size, size, size, 0, Math.PI * 2);
      sCtx.fill();
      return sCanvas;
    };

    const spriteWhite = createSprite(255, 255, 255, 14);
    const spriteCyan = createSprite(6, 182, 212, 14);
    const spriteGold = createSprite(251, 191, 36, 14);
    const spriteDust = createSprite(140, 200, 255, 10);
    const spriteBokeh = createSprite(180, 230, 255, 38);

    let targetTiltX = 0;
    let targetTiltY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      targetTiltX = ((e.clientX - width / 2) / (width / 2)) * 0.12;
      targetTiltY = ((e.clientY - height / 2) / (height / 2)) * 0.12;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    const bgStarCount = 120;
    const bgStars = Array.from({ length: bgStarCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.1 + 0.3,
      alpha: Math.random() * 0.45 + 0.1,
      speed: Math.random() * 0.02 + 0.006,
      phase: Math.random() * Math.PI * 2,
    }));

    const bokehCount = 12;
    const bokehStars = Array.from({ length: bokehCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.2,
      vy: (Math.random() - 0.5) * 0.2,
      size: Math.random() * 26 + 18,
      alpha: Math.random() * 0.11 + 0.04,
      phase: Math.random() * Math.PI * 2,
    }));

    const totalParticles = Math.min(Math.floor((width * height) / 1200), 950);
    const maxRadius = Math.min(width, height) * 0.58;

    const stars = Array.from({ length: totalParticles }, (_, i) => {
      const isDiffuseDust = i > totalParticles * 0.7;

      if (isDiffuseDust) {
        const norm = Math.pow(Math.random(), 1.2);
        const r = norm * maxRadius + 8;
        const angle = Math.random() * Math.PI * 2;
        return {
          planeX: r * Math.cos(angle),
          planeY: r * Math.sin(angle),
          planeZ: (Math.random() - 0.5) * 55 * (1 - norm * 0.3),
          sprite: Math.random() > 0.6 ? spriteCyan : spriteDust,
          renderSize: Math.random() * 1.6 + 0.8,
          baseAlpha: Math.random() * 0.35 + 0.12,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          twinklePhase: Math.random() * Math.PI * 2,
        };
      }

      const arm = i % 2;
      const armOffset = arm * Math.PI;
      const norm = Math.pow(i / (totalParticles * 0.7), 0.84);
      const r = norm * maxRadius + 8;
      const theta = armOffset + 3.15 * Math.pow(norm, 0.64);

      const scatterWidth = (maxRadius * 0.14) * Math.sin(norm * Math.PI * 0.95);
      const spreadR = (Math.random() - 0.5) * scatterWidth;
      const spreadTheta = (Math.random() - 0.5) * (0.3 / (norm + 0.16));

      let sprite = spriteWhite;
      let renderSize = Math.random() * 2.2 + 1.2;

      if (norm < 0.14) {
        sprite = Math.random() > 0.35 ? spriteWhite : spriteGold;
        renderSize = Math.random() * 3.6 + 2.0;
      } else if (norm < 0.5) {
        sprite = i % 3 === 0 ? spriteGold : (i % 3 === 1 ? spriteCyan : spriteWhite);
        renderSize = Math.random() * 2.6 + 1.4;
      } else {
        sprite = Math.random() > 0.45 ? spriteCyan : spriteWhite;
        renderSize = Math.random() * 1.8 + 0.9;
      }

      return {
        planeX: (r + spreadR) * Math.cos(theta + spreadTheta),
        planeY: (r + spreadR) * Math.sin(theta + spreadTheta),
        planeZ: (Math.random() - 0.5) * 44 * (1 - norm * 0.4),
        sprite,
        renderSize,
        baseAlpha: Math.random() * 0.55 + 0.35,
        twinkleSpeed: Math.random() * 0.03 + 0.008,
        twinklePhase: Math.random() * Math.PI * 2,
      };
    });

    let rotationAngle = 0;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const render = () => {
      ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < bgStars.length; i++) {
        const s = bgStars[i];
        s.phase += s.speed;
        const a = s.alpha + Math.sin(s.phase) * 0.15;
        ctx.globalAlpha = Math.max(0.04, Math.min(0.75, a));
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }

      currentTiltX += (targetTiltX - currentTiltX) * 0.04;
      currentTiltY += (targetTiltY - currentTiltY) * 0.04;
      rotationAngle += 0.0011;

      const pitch = 1.02 + currentTiltY;
      const yaw = -0.32 + currentTiltX;
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const cosRot = Math.cos(rotationAngle);
      const sinRot = Math.sin(rotationAngle);

      const centerX = width / 2;
      const centerY = height * 0.42;
      const cameraDist = 680;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const coreBloom = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius * 0.44);
      coreBloom.addColorStop(0, 'rgba(255, 255, 255, 0.4)');
      coreBloom.addColorStop(0.18, 'rgba(251, 191, 36, 0.16)');
      coreBloom.addColorStop(0.48, 'rgba(6, 182, 212, 0.08)');
      coreBloom.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = coreBloom;
      ctx.globalAlpha = 1;
      ctx.fillRect(centerX - maxRadius * 0.44, centerY - maxRadius * 0.44, maxRadius * 0.88, maxRadius * 0.88);

      for (let i = 0; i < stars.length; i++) {
        const s = stars[i];
        const rx = s.planeX * cosRot - s.planeY * sinRot;
        const ry = s.planeX * sinRot + s.planeY * cosRot;
        const rz = s.planeZ;

        const yTilt = ry * cosPitch - rz * sinPitch;
        const zTilt = ry * sinPitch + rz * cosPitch;
        const fx = rx * cosYaw + zTilt * sinYaw;
        const fy = yTilt;
        const fz = -rx * sinYaw + zTilt * cosYaw;

        const f = cameraDist / (cameraDist + fz);
        const screenX = centerX + fx * f;
        const screenY = centerY + fy * f;

        s.twinklePhase += s.twinkleSpeed;
        const alpha = Math.max(0.08, Math.min(1, (s.baseAlpha + Math.sin(s.twinklePhase) * 0.16) * f));
        const drawDiam = s.renderSize * f * 2;

        ctx.globalAlpha = alpha;
        ctx.drawImage(s.sprite, screenX - drawDiam / 2, screenY - drawDiam / 2, drawDiam, drawDiam);
      }

      for (let i = 0; i < bokehStars.length; i++) {
        const b = bokehStars[i];
        b.x += b.vx;
        b.y += b.vy;
        if (b.x < -40) b.x = width + 40;
        if (b.x > width + 40) b.x = -40;
        if (b.y < -40) b.y = height + 40;
        if (b.y > height + 40) b.y = -40;

        b.phase += 0.015;
        const bAlpha = b.alpha + Math.sin(b.phase) * 0.035;
        ctx.globalAlpha = Math.max(0.02, bAlpha);
        ctx.drawImage(spriteBokeh, b.x + currentTiltX * 40, b.y + currentTiltY * 40, b.size, b.size);
      }

      ctx.restore();
      ctx.globalAlpha = 1;

      animationFrameId = requestAnimationFrame(render);
    };

    render();

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('mousemove', handleMouseMove);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 select-none"
    />
  );
}

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  attachments?: { name: string; size: number }[];
}

interface FeedbackItem {
  id: number;
  user_email: string;
  user_name: string;
  rating: number;
  category: string;
  feedback_text: string;
  created_at: string;
}

interface UserDirectoryItem {
  email: string;
  name: string;
  role: string;
  created_at: string;
}

interface TierLimits {
  max_workspaces: number;
  max_files_per_workspace: number;
  max_file_size_mb: number;
  vision_daily_limit: number;
  image_daily_limit: number;
}

const DEFAULT_TIER_LIMITS: Record<string, TierLimits> = {
  free: { max_workspaces: 3, max_files_per_workspace: 3, max_file_size_mb: 10, vision_daily_limit: 5, image_daily_limit: 3 },
  pro: { max_workspaces: 25, max_files_per_workspace: 20, max_file_size_mb: 50, vision_daily_limit: 50, image_daily_limit: 50 },
  admin: { max_workspaces: 999999, max_files_per_workspace: 999999, max_file_size_mb: 500, vision_daily_limit: 999999, image_daily_limit: 999999 }
};

export default function WorkspacePage() {
  const { data: session, status } = useSession();
  const [timeGreeting, setTimeGreeting] = useState('Welcome');
  const [isProfileMenuOpen, setIsProfileMenuOpen] = useState(false);

  useEffect(() => {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) setTimeGreeting('Good morning');
    else if (hour >= 12 && hour < 17) setTimeGreeting('Good afternoon');
    else if (hour >= 17 && hour < 22) setTimeGreeting('Good evening');
    else setTimeGreeting('Late night flow');
  }, []);

  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  // Dynamic User Tier & Quota Limits
  const [userRole, setUserRole] = useState<'free' | 'pro' | 'admin'>('free');
  const [userLimits, setUserLimits] = useState<TierLimits>(DEFAULT_TIER_LIMITS.free);
  const [hasPendingProRequest, setHasPendingProRequest] = useState(false);

  // 3-Hour Rolling Forge Status
  const [forgeStatus, setForgeStatus] = useState<{
    used: number;
    max: number;
    is_available: boolean;
    reset_in: string;
  } | null>(null);

  // Modals Management
  const [isFeedbackOpen, setIsFeedbackOpen] = useState(false);

  const [isProModalOpen, setIsProModalOpen] = useState(false);
  const [isRequestingPro, setIsRequestingPro] = useState(false);
  const [proRequestSent, setProRequestSent] = useState(false);

  const [isInstaModalOpen, setIsInstaModalOpen] = useState(false);
  const [isSupportModalOpen, setIsSupportModalOpen] = useState(false);
  const [copiedSupportEmail, setCopiedSupportEmail] = useState(false);
  const [isLogoutModalOpen, setIsLogoutModalOpen] = useState(false);

  const [isFounderReviewsOpen, setIsFounderReviewsOpen] = useState(false);
  const [founderFeedbacks, setFounderFeedbacks] = useState<FeedbackItem[]>([]);
  const [isLoadingFeedbacks, setIsLoadingFeedbacks] = useState(false);
  const [deletingFeedbackId, setDeletingFeedbackId] = useState<number | null>(null);
  const [replyingFeedbackId, setReplyingFeedbackId] = useState<number | null>(null);
  const [replyTextMap, setReplyTextMap] = useState<Record<number, string>>({});
  const [isSendingReply, setIsSendingReply] = useState(false);
  const [founderActionNotice, setFounderActionNotice] = useState<string | null>(null);

  // Founder Broadcast Studio State
  const [isBroadcastModalOpen, setIsBroadcastModalOpen] = useState(false);
  const [broadcastTarget, setBroadcastTarget] = useState<'all' | 'role:free' | 'role:pro' | 'custom'>('all');
  const [broadcastCustomEmail, setBroadcastCustomEmail] = useState('');
  const [broadcastTitle, setBroadcastTitle] = useState('');
  const [broadcastMessage, setBroadcastMessage] = useState('');
  const [isSendingBroadcast, setIsSendingBroadcast] = useState(false);

  const [isProRequestsOpen, setIsProRequestsOpen] = useState(false);
  const [proRequests, setProRequests] = useState<any[]>([]);
  const [isLoadingProRequests, setIsLoadingProRequests] = useState(false);

  const [isUserDirectoryOpen, setIsUserDirectoryOpen] = useState(false);
  const [registeredUsers, setRegisteredUsers] = useState<UserDirectoryItem[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);

  // Live Admin Counters
  const [unreadFeedbackCount, setUnreadFeedbackCount] = useState(0);
  const [pendingProCount, setPendingProCount] = useState(0);

  const [previewRole, setPreviewRole] = useState<string | null>(null);

  const profileMenuRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [workspaces, setWorkspaces] = useState<WorkspaceItem[]>([]);
  const [activeWorkspaceId, setActiveWorkspaceId] = useState<string | null>(null);

  const [messages, setMessages] = useState<Message[]>([]);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isWaitingForNetwork, setIsWaitingForNetwork] = useState(false);

  // Flagship Workstations
  const [showImageStudio, setShowImageStudio] = useState(false);
  const [showAssessmentArena, setShowAssessmentArena] = useState(false);
  const [showUbairCodex, setShowUbairCodex] = useState(false);
  const [isSlateOpen, setIsSlateOpen] = useState(false);
  const [showForgeStudio, setShowForgeStudio] = useState(false);
  const [arenaTopic, setArenaTopic] = useState<string | undefined>(undefined);
  const [arenaPrinciples, setArenaPrinciples] = useState<string[] | undefined>(undefined);

  const [playingAudioId, setPlayingAudioId] = useState<string | null>(null);
  const [audioLoadingId, setAudioLoadingId] = useState<string | null>(null);
  const currentAudioRef = useRef<HTMLAudioElement | null>(null);
  const currentAudioUrlRef = useRef<string | null>(null);

  // In-Chat Search & Message Copy States
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [chatSearchQuery, setChatSearchQuery] = useState('');
  const [copiedResponseId, setCopiedResponseId] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const currentUserEmail = session?.user?.email?.trim().toLowerCase() || null;

  const isRealAdmin = currentUserEmail === 'mdsalikubair@gmail.com';
  const isAdmin = previewRole ? previewRole === 'admin' : (isRealAdmin || userRole === 'admin');
  const isPro = previewRole ? previewRole === 'pro' : (userRole === 'pro' && !isAdmin);

  const updateUrlParams = useCallback((wsId: string | null, view: string | null) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);

    if (wsId) {
      url.searchParams.set('ws', wsId);
    } else {
      url.searchParams.delete('ws');
    }

    if (view) {
      url.searchParams.set('view', view);
    } else {
      url.searchParams.delete('view');
    }

    window.history.pushState({}, '', url.toString());
  }, []);

  // Workstation Switcher
  const openWorkstation = (target: 'studio' | 'arena' | 'codex' | 'slate' | 'forge' | 'chat') => {
    setShowImageStudio(target === 'studio');
    setShowAssessmentArena(target === 'arena');
    setShowUbairCodex(target === 'codex');
    setIsSlateOpen(target === 'slate');
    setShowForgeStudio(target === 'forge');
    updateUrlParams(activeWorkspaceId, target === 'chat' ? null : target);
  };

  // Browser Back/Forward Popstate Navigation
  useEffect(() => {
    const handlePopState = () => {
      const params = new URLSearchParams(window.location.search);
      const view = params.get('view');
      setShowImageStudio(view === 'studio');
      setShowAssessmentArena(view === 'arena' || view === 'assessment');
      setShowUbairCodex(view === 'codex');
      setShowForgeStudio(view === 'forge');
      setIsFounderReviewsOpen(view === 'reviews');
      setIsProRequestsOpen(view === 'pro-requests');
      setIsUserDirectoryOpen(view === 'directory');
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Fetch Session History
  const loadChatHistory = useCallback(async (wsId: string | null) => {
    if (!currentUserEmail) return;
    const mode = wsId ? 'workspace' : 'temp';
    const sId = wsId || 'quick_1';

    try {
      const res = await fetch(`${API_BASE}/api/chat/history?email=${encodeURIComponent(currentUserEmail)}&mode=${mode}&session_id=${sId}`);
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages || []);
      } else {
        setMessages([]);
      }
    } catch {
      setMessages([]);
    }
  }, [currentUserEmail, API_BASE]);

  // Sync User Profile & Live Role from Backend
  useEffect(() => {
    if (!currentUserEmail || status !== 'authenticated') return;

    const syncProfile = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/user/profile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            user_id: currentUserEmail,
            email: currentUserEmail,
            name: session?.user?.name || 'User'
          })
        });

        if (res.ok) {
          const data = await res.json();
          const role = isRealAdmin ? 'admin' : (data.role || 'free');
          setUserRole(role);
          setUserLimits(data.limits || DEFAULT_TIER_LIMITS[role] || DEFAULT_TIER_LIMITS.free);
          setHasPendingProRequest(Boolean(data.has_pending_pro_request));
          if (data.forge_status) {
            setForgeStatus(data.forge_status);
          }
        }
      } catch (err) {
        console.warn('Profile sync standby:', err);
        if (isRealAdmin) {
          setUserRole('admin');
          setUserLimits(DEFAULT_TIER_LIMITS.admin);
        }
      }
    };

    syncProfile();
  }, [currentUserEmail, session, status, isRealAdmin, API_BASE]);

  // Admin Notification Badge Sync
  useEffect(() => {
    if (!isAdmin || !currentUserEmail) return;
    const checkAdminBadges = async () => {
      try {
        const [resFb, resPro] = await Promise.all([
          fetch(`${API_BASE}/api/admin/feedbacks?email=${encodeURIComponent(currentUserEmail)}`),
          fetch(`${API_BASE}/api/admin/pro-requests?email=${encodeURIComponent(currentUserEmail)}`)
        ]);
        if (resFb.ok) {
          const dataFb = await resFb.json();
          const lastSeen = Number(localStorage.getItem('ubair_last_feedback_seen') || 0);
          const validFeedbacks = (dataFb.feedbacks || []).filter((f: any) => f.category !== 'Pro Upgrade Request');
          const unread = validFeedbacks.filter((f: any) => new Date(f.created_at).getTime() > lastSeen).length;
          setUnreadFeedbackCount(unread);
        }
        if (resPro.ok) {
          const dataPro = await resPro.json();
          const lastSeenPro = Number(localStorage.getItem('ubair_last_pro_seen') || 0);
          const pending = (dataPro.requests || []).filter((r: any) => r.status === 'pending' && new Date(r.created_at || r.updated_at).getTime() > lastSeenPro).length;
          setPendingProCount(pending);
        }
      } catch {}
    };
    checkAdminBadges();
  }, [isAdmin, currentUserEmail, API_BASE]);

  // Deep-Linking & Initial View Restore
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const roleOverride = params.get('preview_role');
      if (roleOverride) {
        const cleanRole = roleOverride.toLowerCase();
        setPreviewRole(cleanRole);
        if (cleanRole === 'free' || cleanRole === 'pro' || cleanRole === 'admin') {
          setUserLimits(DEFAULT_TIER_LIMITS[cleanRole]);
        }
      }

      const view = params.get('view');
      setShowImageStudio(view === 'studio');
      setShowAssessmentArena(view === 'arena' || view === 'assessment');
      setShowUbairCodex(view === 'codex');

      if (view === 'reviews' && isAdmin) setIsFounderReviewsOpen(true);
      else if (view === 'pro-requests' && isAdmin) setIsProRequestsOpen(true);
      else if (view === 'directory' && isAdmin) setIsUserDirectoryOpen(true);

      const initialWs = params.get('ws');
      if (initialWs) {
        setActiveWorkspaceId(initialWs);
      }
    }
  }, [isAdmin]);

  // Dynamic Browser Tab Title
  useEffect(() => {
    if (typeof document === 'undefined') return;

    const currentWs = workspaces.find((w) => w.id === activeWorkspaceId);

    if (isFounderReviewsOpen) {
      document.title = 'Reviews · Ubair OS';
    } else if (isProRequestsOpen) {
      document.title = 'Pro Manager · Ubair OS';
    } else if (isUserDirectoryOpen) {
      document.title = 'Users · Ubair OS';
    } else if (isWaitingForNetwork) {
      document.title = 'Thinking... · Ubair OS';
    } else if (isStreaming) {
      document.title = 'Generating... · Ubair OS';
    } else if (showForgeStudio) {
      document.title = 'Forge · Ubair OS';
    } else if (showUbairCodex) {
      document.title = 'Codex · Ubair OS';
    } else if (showAssessmentArena) {
      document.title = 'Arena · Ubair OS';
    } else if (isSlateOpen) {
      document.title = 'Slate · Ubair OS';
    } else if (showImageStudio) {
      document.title = 'Studio · Ubair OS';
    } else if (currentWs) {
      document.title = `${currentWs.name} · Ubair OS`;
    } else if (messages.length > 0) {
      document.title = 'Quick Chat · Ubair OS';
    } else {
      document.title = 'Ubair OS';
    }
  }, [activeWorkspaceId, workspaces, showImageStudio, showAssessmentArena, showUbairCodex, isSlateOpen, showForgeStudio, isFounderReviewsOpen, isProRequestsOpen, isUserDirectoryOpen, isStreaming, isWaitingForNetwork, messages]);

  const scrollToBottom = () => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ 
        behavior: isStreaming ? 'auto' : 'smooth',
        block: 'end'
      });
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isWaitingForNetwork]);

  const stopAudio = useCallback(() => {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    if (currentAudioRef.current) {
      currentAudioRef.current.onended = null;
      currentAudioRef.current.onerror = null;
      currentAudioRef.current.pause();
      currentAudioRef.current = null;
    }
    if (currentAudioUrlRef.current) {
      URL.revokeObjectURL(currentAudioUrlRef.current);
      currentAudioUrlRef.current = null;
    }
    setPlayingAudioId(null);
    setAudioLoadingId(null);
  }, []);

  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (isBroadcastModalOpen) {
          e.preventDefault();
          e.stopPropagation();
          setIsBroadcastModalOpen(false);
          return;
        }
        if (isSearchOpen) {
          e.preventDefault();
          setIsSearchOpen(false);
          setChatSearchQuery('');
          return;
        }
        if (isFounderReviewsOpen) {
          e.preventDefault();
          setIsFounderReviewsOpen(false);
          setIsBroadcastModalOpen(false);
          updateUrlParams(activeWorkspaceId, null);
          return;
        }
        if (isLogoutModalOpen) { setIsLogoutModalOpen(false); return; }
        if (isSupportModalOpen) { setIsSupportModalOpen(false); return; }
        if (isInstaModalOpen) { setIsInstaModalOpen(false); return; }
        if (isUserDirectoryOpen) {
          setIsUserDirectoryOpen(false);
          updateUrlParams(activeWorkspaceId, null);
          return;
        }
        if (isProRequestsOpen) {
          setIsProRequestsOpen(false);
          updateUrlParams(activeWorkspaceId, null);
          return;
        }
        if (isProModalOpen) { setIsProModalOpen(false); return; }
        if (isFeedbackOpen) { setIsFeedbackOpen(false); return; }
        if (isProfileMenuOpen) { setIsProfileMenuOpen(false); return; }
        if (isDrawerOpen) { setIsDrawerOpen(false); return; }
        if (showImageStudio || showAssessmentArena || showUbairCodex || isSlateOpen || showForgeStudio) {
          openWorkstation('chat');
          return;
        }
        if (playingAudioId || audioLoadingId) { stopAudio(); return; }
      }
    };
    window.addEventListener('keydown', handleGlobalKeyDown);
    return () => window.removeEventListener('keydown', handleGlobalKeyDown);
  }, [
    isBroadcastModalOpen, isSearchOpen, isFounderReviewsOpen, isDrawerOpen, showImageStudio, 
    showAssessmentArena, showUbairCodex, isSlateOpen, showForgeStudio, playingAudioId, 
    audioLoadingId, isFeedbackOpen, isProModalOpen, isProRequestsOpen, isUserDirectoryOpen, 
    isProfileMenuOpen, isInstaModalOpen, isSupportModalOpen, isLogoutModalOpen, activeWorkspaceId, 
    updateUrlParams, stopAudio, openWorkstation
  ]);

  // Dual-Layer Cloud Sync for Workspaces + History Hydration
  useEffect(() => {
    if (!currentUserEmail || status !== 'authenticated') {
      setWorkspaces([]);
      setActiveWorkspaceId(null);
      setMessages([]);
      return;
    }

    const storageKey = `ubair_workspaces_${currentUserEmail}`;

    try {
      const cached = localStorage.getItem(storageKey);
      if (cached) {
        setWorkspaces(JSON.parse(cached));
      }
    } catch {}

    const fetchCloudWorkspaces = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/workspaces?email=${encodeURIComponent(currentUserEmail)}`);
        if (res.ok) {
          const data = await res.json();
          const cloudWorkspaces = data.workspaces || [];
          setWorkspaces(cloudWorkspaces);
          localStorage.setItem(storageKey, JSON.stringify(cloudWorkspaces));

          if (typeof window !== 'undefined') {
            const currentParamWs = new URLSearchParams(window.location.search).get('ws');
            if (currentParamWs && cloudWorkspaces.some((w: WorkspaceItem) => w.id === currentParamWs)) {
              setActiveWorkspaceId(currentParamWs);
              loadChatHistory(currentParamWs);
            } else {
              loadChatHistory(null);
            }
          }
        }
      } catch (err) {
        console.warn('Workspace sync standby:', err);
      }
    };

    fetchCloudWorkspaces();
  }, [currentUserEmail, status, API_BASE, loadChatHistory]);

  const handleSelectWorkspace = (id: string | null) => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    stopAudio();
    setActiveWorkspaceId(id);
    updateUrlParams(id, showImageStudio ? 'studio' : showAssessmentArena ? 'arena' : showUbairCodex ? 'codex' : null);
    loadChatHistory(id);
  };

  const handleCreateWorkspace = async (name: string) => {
    if (!currentUserEmail) return;

    if (!isAdmin && workspaces.length >= userLimits.max_workspaces) {
      setIsProModalOpen(true);
      return;
    }

    const newWsId = `ws_${Date.now()}`;
    const newWsItem: WorkspaceItem = {
      id: newWsId,
      name,
      createdAt: new Date().toISOString(),
    };

    const updated = [newWsItem, ...workspaces];
    setWorkspaces(updated);
    setActiveWorkspaceId(newWsId);
    setMessages([]);
    updateUrlParams(newWsId, showImageStudio ? 'studio' : showAssessmentArena ? 'arena' : showUbairCodex ? 'codex' : null);

    const storageKey = `ubair_workspaces_${currentUserEmail}`;
    localStorage.setItem(storageKey, JSON.stringify(updated));

    try {
      await fetch(`${API_BASE}/api/workspaces/create`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: currentUserEmail,
          user_id: currentUserEmail,
          name: name,
          workspace_id: newWsId
        })
      });
    } catch (err) {
      console.error('Failed to persist workspace in cloud:', err);
    }
  };

  const handleDeleteWorkspace = async (id: string) => {
    const updated = workspaces.filter((w) => w.id !== id);
    setWorkspaces(updated);
    if (activeWorkspaceId === id) {
      setActiveWorkspaceId(null);
      updateUrlParams(null, showImageStudio ? 'studio' : showAssessmentArena ? 'arena' : showUbairCodex ? 'codex' : null);
      loadChatHistory(null);
    }

    if (currentUserEmail) {
      const storageKey = `ubair_workspaces_${currentUserEmail}`;
      localStorage.setItem(storageKey, JSON.stringify(updated));
    }
  };

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileMenuRef.current && !profileMenuRef.current.contains(event.target as Node)) {
        setIsProfileMenuOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const formatTime = (isoString: string) => {
    try {
      const date = new Date(isoString);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const handlePlayTTS = async (msgId: string, text: string) => {
    if (playingAudioId === msgId || audioLoadingId === msgId) {
      stopAudio();
      return;
    }

    stopAudio();
    setAudioLoadingId(msgId);

    const cleanSpokenText = text
      .replace(/```[\s\S]*?```/g, 'Code block omitted.')
      .replace(/`([^`]+)`/g, '$1')
      .replace(/[*_~#>-]/g, '')
      .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
      .trim();

    try {
      const res = await fetch(`${API_BASE}/api/audio/tts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanSpokenText })
      });

      if (!res.ok) {
        stopAudio();
        return;
      }

      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      currentAudioUrlRef.current = url;
      const audio = new Audio(url);
      currentAudioRef.current = audio;
      audio.loop = false;

      audio.onended = () => stopAudio();
      audio.onerror = () => stopAudio();

      await audio.play();
      setAudioLoadingId(null);
      setPlayingAudioId(msgId);
    } catch (err) {
      console.error('Audio playback fault:', err);
      stopAudio();
    }
  };

  const handlePurgeMemory = async () => {
    const mode = activeWorkspaceId ? 'workspace' : 'temp';
    const sessionId = activeWorkspaceId || 'quick_1';

    const confirmationMessage = activeWorkspaceId 
      ? 'Clear workspace conversation? Your indexed files and workspace memory will remain 100% safe.'
      : 'Reset Quick Chat? All temporary messages from this session will be permanently erased.';

    if (!window.confirm(confirmationMessage)) return;

    try {
      const res = await fetch(`${API_BASE}/api/chat/clear`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: currentUserEmail || 'anonymous',
          user_email: currentUserEmail || 'anonymous',
          mode: mode,
          session_id: sessionId
        })
      });

      if (res.ok) {
        setMessages([]);
      }
    } catch (err) {
      console.error('Purge failed:', err);
    }
  };

  const handleRequestProUpgrade = async () => {
    if (isRequestingPro || proRequestSent || hasPendingProRequest) return;
    
    let targetEmail = currentUserEmail;
    if (!targetEmail && typeof window !== 'undefined') {
      targetEmail = localStorage.getItem('ubair_user_email') || localStorage.getItem('user_email');
    }
    if (!targetEmail) return;

    setIsRequestingPro(true);
    try {
      const res = await fetch(`${API_BASE}/api/user/upgrade-request`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: targetEmail,
          email: targetEmail,
          user_name: session?.user?.name || 'User',
          tier: 'pro'
        })
      });
      if (res.ok) {
        setProRequestSent(true);
        setHasPendingProRequest(true);
      }
    } catch (err) {
      console.error('Pro request fault:', err);
    } finally {
      setIsRequestingPro(false);
    }
  };

  const fetchFounderFeedbacks = async () => {
    setIsLoadingFeedbacks(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/feedbacks?email=${encodeURIComponent(currentUserEmail || '')}`);
      if (res.ok) {
        const data = await res.json();
        const cleanReviews = (data.feedbacks || []).filter((fb: any) => fb.category !== 'Pro Upgrade Request');
        setFounderFeedbacks(cleanReviews);
      } else {
        setFounderFeedbacks([]);
      }
    } catch {
      setFounderFeedbacks([]);
    } finally {
      setIsLoadingFeedbacks(false);
    }
  };

  useEffect(() => {
    if (isFounderReviewsOpen && isAdmin && currentUserEmail) {
      fetchFounderFeedbacks();
    }
  }, [isFounderReviewsOpen, isAdmin, currentUserEmail]);

  const handleDeleteFeedback = async (id: number) => {
    if (!isAdmin || deletingFeedbackId) return;
    setDeletingFeedbackId(id);
    try {
      const res = await fetch(`${API_BASE}/api/admin/feedback/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_email: currentUserEmail,
          feedback_id: id
        })
      });
      if (res.ok) {
        setFounderFeedbacks(prev => prev.filter(fb => fb.id !== id));
        setFounderActionNotice('Review permanently erased from database.');
        setTimeout(() => setFounderActionNotice(null), 2500);
      }
    } catch {
      setFounderActionNotice('Failed to erase feedback.');
      setTimeout(() => setFounderActionNotice(null), 2500);
    } finally {
      setDeletingFeedbackId(null);
    }
  };

  const handleSendDirectReply = async (fb: FeedbackItem, customText?: string) => {
    const text = (customText || replyTextMap[fb.id] || '').trim();
    if (!text || isSendingReply || !isAdmin) return;
    setIsSendingReply(true);

    try {
      const res = await fetch(`${API_BASE}/api/admin/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_email: currentUserEmail,
          recipient_email: fb.user_email,
          title: `Founder Reply to your Feedback`,
          message: text,
          category: 'direct'
        })
      });
      if (res.ok) {
        setReplyTextMap(prev => ({ ...prev, [fb.id]: '' }));
        setReplyingFeedbackId(null);
        setFounderActionNotice(`In-app message dispatched to ${fb.user_name || fb.user_email}`);
        setTimeout(() => setFounderActionNotice(null), 3500);
      }
    } catch {
      setFounderActionNotice('Failed to dispatch notification.');
      setTimeout(() => setFounderActionNotice(null), 3000);
    } finally {
      setIsSendingReply(false);
    }
  };

  const handleDispatchBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!broadcastMessage.trim() || isSendingBroadcast || !isAdmin) return;

    const targetRecipient = broadcastTarget === 'custom' 
      ? broadcastCustomEmail.trim().toLowerCase() 
      : broadcastTarget;

    if (broadcastTarget === 'custom' && !targetRecipient) {
      setFounderActionNotice('Target user email required.');
      setTimeout(() => setFounderActionNotice(null), 2500);
      return;
    }

    setIsSendingBroadcast(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/notifications/send`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_email: currentUserEmail,
          recipient_email: targetRecipient,
          target: targetRecipient,
          title: broadcastTitle.trim() || 'System Announcement · Ubair OS',
          message: broadcastMessage.trim(),
        })
      });

      if (res.ok) {
        setBroadcastTitle('');
        setBroadcastMessage('');
        setBroadcastCustomEmail('');
        setIsBroadcastModalOpen(false);
        setFounderActionNotice(`Broadcast successfully dispatched to [${targetRecipient}]`);
        setTimeout(() => setFounderActionNotice(null), 3500);
      }
    } catch {
      setFounderActionNotice('Broadcast transmission failed.');
      setTimeout(() => setFounderActionNotice(null), 3000);
    } finally {
      setIsSendingBroadcast(false);
    }
  };

  const fetchProRequests = async () => {
    setIsLoadingProRequests(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/pro-requests?email=${encodeURIComponent(currentUserEmail || '')}`);
      if (res.ok) {
        const data = await res.json();
        setProRequests(data.requests || []);
      } else {
        setProRequests([]);
      }
    } catch {
      setProRequests([]);
    } finally {
      setIsLoadingProRequests(false);
    }
  };

  const fetchUserDirectory = async () => {
    setIsLoadingUsers(true);
    try {
      const res = await fetch(`${API_BASE}/api/admin/users?email=${encodeURIComponent(currentUserEmail || '')}`);
      if (res.ok) {
        const data = await res.json();
        setRegisteredUsers(data.users || []);
      } else {
        setRegisteredUsers([]);
      }
    } catch {
      setRegisteredUsers([]);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleManageProAccess = async (userEmail: string, action: 'grant' | 'revoke' | 'reject', durationDays = 30) => {
    try {
      await fetch(`${API_BASE}/api/admin/pro-requests/manage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          admin_email: currentUserEmail,
          target_user_email: userEmail,
          action: action,
          duration_days: durationDays
        })
      });
      fetchProRequests();
    } catch (err) {
      console.error('Pro action failed:', err);
    }
  };

  const openFounderReviews = useCallback(() => {
    setIsProfileMenuOpen(false);
    setIsFounderReviewsOpen(true);
    localStorage.setItem('ubair_last_feedback_seen', Date.now().toString());
    setUnreadFeedbackCount(0);
    updateUrlParams(activeWorkspaceId, 'reviews');
    fetchFounderFeedbacks();
  }, [activeWorkspaceId, updateUrlParams]);

  const closeFounderReviews = useCallback(() => {
    setIsFounderReviewsOpen(false);
    setIsBroadcastModalOpen(false);
    updateUrlParams(activeWorkspaceId, null);
  }, [activeWorkspaceId, updateUrlParams]);

  const openProRequests = () => {
    setIsProfileMenuOpen(false);
    setIsProRequestsOpen(true);
    localStorage.setItem('ubair_last_pro_seen', Date.now().toString());
    setPendingProCount(0);
    updateUrlParams(activeWorkspaceId, 'pro-requests');
    fetchProRequests();
  };

  const closeProRequests = () => {
    setIsProRequestsOpen(false);
    updateUrlParams(activeWorkspaceId, null);
  };

  const openUserDirectory = () => {
    setIsProfileMenuOpen(false);
    setIsUserDirectoryOpen(true);
    updateUrlParams(activeWorkspaceId, 'directory');
    fetchUserDirectory();
  };

  const closeUserDirectory = () => {
    setIsUserDirectoryOpen(false);
    updateUrlParams(activeWorkspaceId, null);
  };

  const handleSendMessage = async (
    rawPrompt: string, 
    attachedFiles: File[] = [], 
    engineMode: 'fast' | 'forge' = 'fast'
  ) => {
    let finalPrompt = rawPrompt.trim();

    if (!finalPrompt && attachedFiles.length > 0) {
      const hasImages = attachedFiles.some(f => f.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(f.name));
      finalPrompt = hasImages
        ? "Please analyze and describe the contents of this image in detail."
        : "Please analyze and summarize the attached document(s).";
    }

    if (!finalPrompt && attachedFiles.length === 0) return;
    if (isStreaming || isWaitingForNetwork) return;

    const userMessageId = `msg_${Date.now()}`;
    const assistantMessageId = `msg_${Date.now() + 1}`;

    const newMsg: Message = {
      id: userMessageId,
      role: 'user',
      content: finalPrompt,
      timestamp: new Date().toISOString(),
      attachments: attachedFiles.map((f) => ({ name: f.name, size: f.size })),
    };

    setMessages((prev) => [...prev, newMsg]);
    setIsWaitingForNetwork(true);

    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const formData = new FormData();
      formData.append('message', finalPrompt);
      formData.append('user_id', currentUserEmail || 'anonymous');
      formData.append('user_email', currentUserEmail || 'anonymous');
      formData.append('user_full_name', session?.user?.name || 'User');
      formData.append('engine_mode', engineMode);

      if (engineMode === 'forge' && forgeStatus && !isAdmin) {
        setForgeStatus(prev => prev ? {
          ...prev,
          used: prev.used + 1,
          is_available: (prev.used + 1) < prev.max
        } : null);
      }

      if (activeWorkspaceId) {
        formData.append('mode', 'workspace');
        formData.append('session_id', activeWorkspaceId);
      } else {
        formData.append('mode', 'temp');
        formData.append('session_id', 'quick_1');
      }

      attachedFiles.forEach((file) => formData.append('files', file));

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        body: formData,
        signal: controller.signal
      });

      if (!response.ok) throw new Error(`API Error: ${response.statusText}`);
      if (!response.body) return;

      setIsWaitingForNetwork(false);
      setIsStreaming(true);

      setMessages((prev) => [
        ...prev,
        { id: assistantMessageId, role: 'assistant', content: '', timestamp: new Date().toISOString() },
      ]);

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let assistantReply = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        assistantReply += decoder.decode(value, { stream: true });

        let displayReply = assistantReply;
        if (displayReply.includes('__ACTION_CARD__')) {
          const cardMatch = displayReply.match(/__ACTION_CARD__(\{[\s\S]*?\})\n\n/);
          if (cardMatch) {
            try {
              const actionCard = JSON.parse(cardMatch[1]);
              if (actionCard.action === 'open_arena' && actionCard.topic) {
                setArenaTopic(actionCard.topic);
                if (actionCard.principles) setArenaPrinciples(actionCard.principles);
                openWorkstation('arena');
              } else if (actionCard.action === 'open_studio') {
                openWorkstation('studio');
              } else if (actionCard.action === 'open_forge') {
                openWorkstation('forge');
              } else if (actionCard.action === 'open_slate') {
                openWorkstation('slate');
              }
            } catch {}
            displayReply = displayReply.replace(cardMatch[0], '');
          }
        }

        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId ? { ...msg, content: displayReply } : msg
          )
        );
      }
    } catch (error: any) {
      if (error.name !== 'AbortError') {
        console.error('Chat stream failed:', error);
        setIsWaitingForNetwork(false);
        setMessages((prev) => [
          ...prev,
          { id: `err_${Date.now()}`, role: 'assistant', content: 'Connection fault with Neural Engine. Please retry.', timestamp: new Date().toISOString() },
        ]);
      }
    } finally {
      setIsStreaming(false);
      abortControllerRef.current = null;
    }
  };

  if (status === 'loading') {
    return (
      <div className="h-[100dvh] w-full bg-black flex flex-col items-center justify-center">
        <div className="w-5 h-5 border-2 border-white/20 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  const rawNameParts = session?.user?.name ? session.user.name.trim().split(/\s+/) : ['User'];
  const firstToken = rawNameParts[0] || 'User';
  const targetToken = (firstToken.toLowerCase() === 'md' || firstToken.toLowerCase() === 'md.') && rawNameParts.length > 1
    ? rawNameParts[1]
    : firstToken;
  const preferredName = targetToken.charAt(0).toUpperCase() + targetToken.slice(1).toLowerCase();
  

  const activeWorkspace = workspaces.find((w) => w.id === activeWorkspaceId);
  const hasMessages = messages.length > 0 || isWaitingForNetwork;
  const isChatActive = !showImageStudio && !showAssessmentArena && !showUbairCodex && !showForgeStudio && !isSlateOpen;

  const cleanSearchQ = chatSearchQuery.trim().toLowerCase();
  const turnNumMatch = cleanSearchQ.match(/^(?:#|turn\s*|conv\s*)?(\d+)$/i);
  const targetSearchTurn = turnNumMatch ? parseInt(turnNumMatch[1], 10) : null;
  const searchTokens = !targetSearchTurn && cleanSearchQ ? cleanSearchQ.split(/\s+/).filter(Boolean) : [];

  const displayMessages = messages
    .map((msg, origIdx) => ({
      ...msg,
      origIdx,
      turnNumber: Math.floor(origIdx / 2) + 1
    }))
    .filter((msg) => {
      if (!cleanSearchQ) return true;
      if (targetSearchTurn !== null) {
        return msg.turnNumber === targetSearchTurn;
      }
      return searchTokens.some((tok) => msg.content.toLowerCase().includes(tok));
    });

  return (
    <main className="h-[100dvh] w-full bg-black text-neutral-100 flex flex-col overflow-hidden font-sans selection:bg-cyan-500/20 selection:text-white relative">

      {/* ====================================================================
       * AESTHETIC COSMIC GALAXY LAYER (AUTONOMOUS 700MS FADE-OUT ON CHAT START)
       * ================================================================== */}
      <div 
        className={`fixed inset-0 pointer-events-none z-0 select-none transition-opacity duration-700 ease-in-out ${
          hasMessages || !isChatActive ? 'opacity-0' : 'opacity-70'
        }`}
      >
        <AmbientCosmicGalaxy />
        {/* Soft Vignette Behind Welcome Text */}
        <div className="absolute top-[42%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[480px] h-[480px] bg-gradient-to-b from-black/80 via-black/60 to-transparent rounded-full blur-2xl pointer-events-none" />
      </div>

      {/* 1. TOP HEADER (Unified Navigation Suite) */}
      <header className="w-full h-14 sm:h-16 shrink-0 backdrop-blur-xl bg-black/40 sticky top-0 flex items-center justify-between px-3 sm:px-6 z-40 select-none border-b border-white/[0.04]">
        <div className="flex items-center gap-2.5 sm:gap-4 min-w-0">
          <button 
            type="button"
            onClick={() => setIsDrawerOpen(true)}
            className="p-1.5 text-neutral-400 hover:text-white transition-colors rounded-lg hover:bg-white/[0.04] cursor-pointer shrink-0"
            title="Open Workspaces"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round">
              <line x1="4" y1="12" x2="20" y2="12" />
              <line x1="4" y1="6" x2="20" y2="6" />
              <line x1="4" y1="18" x2="14" y2="18" />
            </svg>
          </button>

          <div 
            className="flex items-center gap-2 cursor-pointer shrink-0" 
            onClick={() => {
              openWorkstation('chat');
              handleSelectWorkspace(null);
            }}
          >
            <BrandLogo size="md" showWordmark={true} />
          </div>

          <div className="h-3.5 w-[1px] bg-white/[0.12] mx-1 shrink-0" />
          
          <div className="flex items-center gap-1 font-sans shrink min-w-0">
            <button
              type="button"
              onClick={() => {
                if (isFounderReviewsOpen) closeFounderReviews();
                openWorkstation('chat');
              }}
              className={`h-7 px-2.5 rounded-lg transition-all flex items-center gap-2 text-[12px] font-medium cursor-pointer active:scale-95 shrink-0 ${
                isFounderReviewsOpen
                  ? 'bg-cyan-500/10 text-cyan-300 border border-cyan-500/25 shadow-sm'
                  : isChatActive
                  ? 'bg-white/[0.08] text-white shadow-sm'
                  : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
              }`}
              title={isFounderReviewsOpen ? "Founder Intelligence Deck Active" : "Active Chat Workspace"}
            >
              <span className={`w-1.5 h-1.5 rounded-full transition-all duration-300 shrink-0 ${
                isFounderReviewsOpen
                  ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.9)] animate-pulse'
                  : isWaitingForNetwork || isStreaming
                  ? 'bg-cyan-400 animate-ping'
                  : activeWorkspace
                  ? 'bg-cyan-400 shadow-[0_0_6px_rgba(6,182,212,0.8)]'
                  : isChatActive
                  ? 'bg-white shadow-[0_0_6px_rgba(255,255,255,0.6)]'
                  : 'bg-neutral-600'
              }`} />
              <span className="truncate max-w-[85px] sm:max-w-[130px] lg:max-w-none">
                {isFounderReviewsOpen
                  ? 'Reviews'
                  : isWaitingForNetwork
                  ? 'Thinking...'
                  : isStreaming
                  ? 'Generating...'
                  : activeWorkspace
                  ? activeWorkspace.name
                  : messages.length > 0
                  ? 'Quick Chat'
                  : 'Chat'}
              </span>
            </button>

            <div className="hidden md:flex items-center gap-1">
              <button
                type="button"
                onClick={() => openWorkstation('studio')}
                className={`h-7 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-[12px] font-medium cursor-pointer active:scale-95 group shrink-0 ${
                  showImageStudio
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
                title="Open Image Studio"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Studio</span>
              </button>

              <button
                type="button"
                onClick={() => openWorkstation('arena')}
                className={`h-7 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-[12px] font-medium cursor-pointer active:scale-95 group shrink-0 ${
                  showAssessmentArena
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
                title="Open Assessment Arena"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                  <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                </svg>
                <span>Arena</span>
              </button>

              <button
                type="button"
                onClick={() => openWorkstation(isSlateOpen ? 'chat' : 'slate')}
                className={`h-7 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-[12px] font-medium cursor-pointer active:scale-95 group shrink-0 ${
                  isSlateOpen
                    ? 'bg-white/[0.08] text-white shadow-sm'
                    : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                }`}
                title="Open Ubair Slate (Local Scratchpad & Bridge)"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="opacity-80 group-hover:opacity-100 transition-opacity shrink-0">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <line x1="8" y1="9" x2="16" y2="9" />
                  <line x1="8" y1="13" x2="14" y2="13" />
                  <line x1="8" y1="17" x2="11" y2="17" />
                </svg>
                <span>Slate</span>
              </button>
            </div>

            {hasMessages && isChatActive && (
              <div className="hidden sm:flex items-center gap-1 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsSearchOpen(!isSearchOpen);
                    if (isSearchOpen) setChatSearchQuery('');
                  }}
                  className={`h-7 px-2.5 rounded-lg transition-all flex items-center gap-1.5 text-[12px] font-medium active:scale-95 cursor-pointer shrink-0 ${
                    isSearchOpen || chatSearchQuery 
                      ? 'bg-white/10 text-white border border-white/20 shadow-sm' 
                      : 'text-neutral-400 hover:text-white hover:bg-white/[0.04]'
                  }`}
                  title="Search conversation"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </svg>
                  <span>Search</span>
                </button>

                <div className="h-3 w-[1px] bg-white/10 mx-0.5 shrink-0" />

                <button
                  type="button"
                  onClick={handlePurgeMemory}
                  className="h-7 px-2.5 rounded-lg hover:bg-rose-500/10 text-neutral-500 hover:text-rose-300 transition-all flex items-center gap-1.5 text-[12px] font-medium active:scale-95 cursor-pointer shrink-0"
                  title="Clear conversation"
                >
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                    <path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                  </svg>
                  <span>Reset</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right Utility Cluster */}
        <div className="flex items-center gap-1.5 sm:gap-2.5 shrink-0">
          {currentUserEmail && (
            <NotificationInbox userEmail={currentUserEmail} apiBase={API_BASE} />
          )}

          <div className="relative shrink-0" ref={profileMenuRef}>
            <button 
              onClick={() => setIsProfileMenuOpen(!isProfileMenuOpen)}
              className="flex items-center gap-2 p-1 pl-1.5 pr-1.5 sm:pr-2.5 rounded-full hover:bg-white/[0.08] transition-all cursor-pointer"
            >
              {session?.user?.image ? (
                <img src={session.user.image} alt="Profile" className="w-7 h-7 rounded-full bg-neutral-900 object-cover border border-white/10 shrink-0" referrerPolicy="no-referrer" />
              ) : (
                <div className="w-[26px] h-[26px] sm:w-[28px] sm:h-[28px] rounded-full bg-white/[0.05] flex items-center justify-center text-xs font-medium text-white border border-white/10 shrink-0">
                  {preferredName.charAt(0)}
                </div>
              )}
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-500 hidden sm:block shrink-0">
                <circle cx="12" cy="12" r="1" /><circle cx="19" cy="12" r="1" /><circle cx="5" cy="12" r="1" />
              </svg>
            </button>

            {isProfileMenuOpen && (
              <div className="absolute right-0 mt-3 w-64 max-h-[85dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.1] rounded-2xl shadow-2xl animate-in fade-in duration-100 z-50 divide-y divide-white/[0.06] [scrollbar-width:none]">
                <div className="px-4 py-3.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-white truncate max-w-[150px]">{session?.user?.name}</span>
                    <span className="text-[11px] font-mono text-neutral-400 font-medium tracking-wider uppercase italic">
                      {isAdmin ? 'Founder' : isPro ? 'Pro' : 'Free'}
                    </span>
                  </div>
                  <div className="text-[11px] text-neutral-500 truncate mt-1 font-mono">{session?.user?.email}</div>
                </div>

                {!isAdmin && !isPro && (
                  <div className="p-2">
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        setIsProModalOpen(true);
                      }}
                      className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-gradient-to-r from-amber-500/[0.08] via-amber-500/[0.02] to-transparent border border-amber-400/25 hover:border-amber-400/50 text-left transition-all duration-200 group cursor-pointer"
                    >
                      <div>
                        <div className="text-xs font-semibold text-white group-hover:text-amber-200 transition-colors flex items-center gap-1.5">
                          <span>Upgrade to Ubair Pro</span>
                        </div>
                        <div className="text-[10.5px] text-neutral-400 mt-0.5 font-sans">
                          {hasPendingProRequest ? 'Request currently under review' : 'Unlock 25 workspaces & high quotas'}
                        </div>
                      </div>
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 group-hover:translate-x-0.5 transition-transform shrink-0">
                        <polyline points="9 18 15 12 9 6" />
                      </svg>
                    </button>
                  </div>
                )}

                <div className="p-1.5 space-y-0.5">
                  {isAdmin && (
                    <>
                      <button
                        type="button"
                        onClick={openFounderReviews}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors text-left font-medium group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400 shrink-0">
                            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                          </svg>
                          <span>User Reviews & Feedback</span>
                        </div>
                        {unreadFeedbackCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-white/80 font-mono text-[10px] italic border border-white/10 shrink-0">
                            {unreadFeedbackCount} new
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={openProRequests}
                        className="w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors text-left font-medium group cursor-pointer"
                      >
                        <div className="flex items-center gap-2.5">
                          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400 shrink-0">
                            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
                            <circle cx="9" cy="7" r="4" />
                            <polyline points="16 11 18 13 22 9" />
                          </svg>
                          <span>Manage Pro Requests</span>
                        </div>
                        {pendingProCount > 0 && (
                          <span className="px-2 py-0.5 rounded-full bg-white/[0.08] text-white/80 font-mono text-[10px] italic border border-white/10 shrink-0">
                            {pendingProCount} req
                          </span>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={openUserDirectory}
                        className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors text-left font-medium cursor-pointer"
                      >
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400 shrink-0">
                          <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                          <circle cx="9" cy="7" r="4" />
                          <path d="M23 21v-2a4 4 0 0 0-3-3.87" />
                          <path d="M16 3.13a4 4 0 0 1 0 7.75" />
                        </svg>
                        <span>Registered User Accounts</span>
                      </button>
                    </>
                  )}

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setIsInstaModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-pink-400 shrink-0">
                      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
                      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
                      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
                    </svg>
                    <span>Official Instagram</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setIsSupportModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors text-left font-medium cursor-pointer"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-sky-400 shrink-0">
                      <rect width="20" height="16" x="2" y="4" rx="2" />
                      <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
                    </svg>
                    <span>Support & Inquiries</span>
                  </button>

                  {!isAdmin && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsProfileMenuOpen(false);
                        setIsFeedbackOpen(true);
                      }}
                      className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-neutral-200 hover:text-white hover:bg-white/[0.06] transition-colors text-left cursor-pointer"
                    >
                      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-amber-400 shrink-0">
                        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                      </svg>
                      <span>Share Feedback</span>
                    </button>
                  )}
                </div>

                <div className="p-1.5">
                  <button 
                    onClick={() => {
                      setIsProfileMenuOpen(false);
                      setIsLogoutModalOpen(true);
                    }}
                    className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors cursor-pointer"
                  >
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
                      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                      <polyline points="16 17 21 12 16 7" />
                      <line x1="21" y1="12" x2="9" y2="12" />
                    </svg>
                    <span>Log out</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Floating Chat Search Bar */}
      {isSearchOpen && isChatActive && hasMessages && (
        <div className="w-full bg-[#0a0b0e]/95 border-b border-white/[0.08] px-3 sm:px-6 py-2.5 backdrop-blur-xl z-30 animate-in fade-in slide-in-from-top-2 duration-150 flex items-center justify-between gap-3 shrink-0">
          <div className="max-w-3xl w-full mx-auto flex items-center gap-2.5 sm:gap-3 min-w-0">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-amber-400 shrink-0">
              <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              type="text"
              autoFocus
              value={chatSearchQuery}
              onChange={(e) => setChatSearchQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setChatSearchQuery('');
                  setIsSearchOpen(false);
                }
              }}
              placeholder="Search context, code, or jump to turn (e.g. #1, 2, 'python')..."
              className="w-full bg-transparent text-xs text-white placeholder-neutral-500 outline-none font-sans min-w-0"
            />

            {chatSearchQuery.trim() && (() => {
              const cleanQ = chatSearchQuery.trim().toLowerCase();
              const turnNumMatch = cleanQ.match(/^(?:#|turn\s*|conv\s*)?(\d+)$/i);
              
              if (turnNumMatch) {
                const targetTurn = parseInt(turnNumMatch[1], 10);
                const turnExists = messages.some((_, i) => Math.floor(i / 2) + 1 === targetTurn);
                return (
                  <span className={`text-[10px] font-mono px-2 py-0.5 rounded-full border shrink-0 whitespace-nowrap ${
                    turnExists 
                      ? 'bg-amber-500/15 border-amber-400/30 text-amber-300' 
                      : 'bg-rose-500/15 border-rose-400/30 text-rose-300'
                  }`}>
                    {turnExists ? `Turn #${targetTurn}` : `Not Found`}
                  </span>
                );
              }

              const tokens = cleanQ.split(/\s+/).filter(Boolean);
              const matchesCount = messages.filter(m => 
                tokens.some(tok => m.content.toLowerCase().includes(tok))
              ).length;

              return (
                <span className="text-[10px] font-mono text-neutral-400 shrink-0 bg-white/[0.04] border border-white/10 px-2 py-0.5 rounded-full whitespace-nowrap">
                  {matchesCount} hits
                </span>
              );
            })()}

            <button
              type="button"
              onClick={() => {
                setChatSearchQuery('');
                setIsSearchOpen(false);
              }}
              className="text-xs text-neutral-400 hover:text-white px-2 py-0.5 rounded hover:bg-white/10 font-mono transition-colors shrink-0"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      <WorkspaceDrawer
        isOpen={isDrawerOpen} 
        onClose={() => setIsDrawerOpen(false)} 
        workspaces={workspaces}
        activeWorkspaceId={activeWorkspaceId}
        userEmail={currentUserEmail || ''}
        onSelectWorkspace={handleSelectWorkspace}
        onCreateWorkspace={handleCreateWorkspace}
        onDeleteWorkspace={handleDeleteWorkspace}
        userRole={isAdmin ? 'admin' : isPro ? 'pro' : 'free'}
        maxWorkspaces={userLimits.max_workspaces}
        maxFilesPerWorkspace={userLimits.max_files_per_workspace}
        maxFileSizeMb={userLimits.max_file_size_mb}
        onOpenUpgradeModal={() => setIsProModalOpen(true)}
        onOpenWorkstation={openWorkstation}
      />

      {/* 2. CHAT CANVAS */}
      <div className="flex-1 flex flex-col min-h-0 relative w-full z-10">

        {!hasMessages ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 -mt-8 sm:-mt-12 animate-in fade-in duration-200">
            <h1 className="text-[26px] sm:text-[36px] font-semibold tracking-tight text-white mb-6 sm:mb-8 text-center px-2 drop-shadow-[0_2px_12px_rgba(0,0,0,0.8)]">
              {activeWorkspace ? activeWorkspace.name : `${timeGreeting}, ${preferredName}.`}
            </h1>
            
            <div className="w-full max-w-3xl">
              <ChatInput 
                onSendMessage={handleSendMessage} 
                disabled={isStreaming || isWaitingForNetwork} 
                forgeStatus={forgeStatus}
              />
            </div>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto w-full px-3 sm:px-6 pt-5 sm:pt-6 pb-[130px] sm:pb-[160px] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-track]:bg-transparent [scrollbar-width:thin]">
              <div className="max-w-3xl w-full mx-auto space-y-6 sm:space-y-8">
                {displayMessages.map((msg) => {
                  const isHighlighted = targetSearchTurn !== null && msg.turnNumber === targetSearchTurn;
                  return (
                  <div 
                    key={msg.id} 
                    className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} animate-in fade-in duration-150 transition-all ${
                      isHighlighted ? 'p-2 rounded-2xl ring-1 ring-amber-400/40 bg-amber-500/[0.02] shadow-[0_0_20px_rgba(251,191,36,0.06)]' : ''
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <div className="max-w-[92%] sm:max-w-[85%] flex flex-col items-end">
                        {msg.attachments && msg.attachments.length > 0 && (
                          <div className="flex flex-wrap justify-end gap-1.5 mb-2">
                            {msg.attachments.map((att, idx) => (
                              <span key={idx} className="inline-flex items-center gap-1.5 px-2 py-0.5 bg-white/[0.04] border border-white/10 rounded-lg text-[10px] sm:text-[11px] font-mono text-neutral-300">
                                {att.name}
                              </span>
                            ))}
                          </div>
                        )}
                        <div className="px-3.5 py-2 sm:px-5 sm:py-3 rounded-2xl rounded-tr-sm bg-white/[0.08] border border-white/[0.1] text-white text-[13.5px] sm:text-[15px] font-normal leading-relaxed whitespace-pre-wrap shadow-sm break-words max-w-full">
                          {msg.content}
                        </div>
                        <div className="flex items-center gap-2 mt-1.5 font-mono text-[9px] sm:text-[10px] text-neutral-500 tracking-wide select-none">
                          {messages.length >= 6 && (
                            <span className="text-neutral-500 tracking-wider font-semibold">
                              #{msg.turnNumber}
                            </span>
                          )}
                          <span>{formatTime(msg.timestamp)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="w-full text-neutral-200 text-[13.5px] sm:text-[15px] leading-relaxed flex items-start gap-2.5 sm:gap-4">
                        
                        <div className="relative w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0 mt-0.5 select-none">
                          <img
                            src="/assets/ubair-logo.png"
                            alt="Ubair OS"
                            className="w-full h-full object-contain scale-[1.7] drop-shadow-[0_0_10px_rgba(6,182,212,0.5)] opacity-95 pointer-events-none select-none"
                          />
                        </div>

                        <div className="flex-1 overflow-hidden space-y-1.5 min-w-0">
                          {isStreaming && msg.content === '' ? (
                             <div className="mt-1 flex items-center h-6">
                               <span className="inline-block w-2 h-4 bg-cyan-400/50 animate-pulse rounded-sm"></span>
                             </div>
                          ) : (
                            <div className="break-words max-w-full">
                              <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={{
                                  p: ({ node, ...props }: any) => <div className="mb-3.5 last:mb-0 leading-relaxed text-[14px] sm:text-[15px]" {...props} />,
                                  strong: ({ node, ...props }: any) => <strong className="font-semibold text-white" {...props} />,
                                  a: ({ node, ...props }: any) => <a className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors break-words" target="_blank" rel="noopener noreferrer" {...props} />,
                                  ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-3.5 space-y-1 text-neutral-300" {...props} />,
                                  ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-3.5 space-y-1 text-neutral-300" {...props} />,
                                  h1: ({ node, ...props }: any) => <h1 className="text-lg sm:text-2xl font-bold text-white mb-3 mt-5" {...props} />,
                                  h2: ({ node, ...props }: any) => <h2 className="text-base sm:text-xl font-bold text-white mb-2.5 mt-4" {...props} />,
                                  h3: ({ node, ...props }: any) => <h3 className="text-sm sm:text-lg font-semibold text-white mb-2 mt-3.5" {...props} />,
                                  table: ({ node, ...props }: any) => <div className="overflow-x-auto my-3 border border-white/10 rounded-lg max-w-full [scrollbar-width:thin]"><table className="w-full text-left text-xs sm:text-sm" {...props} /></div>,
                                  thead: ({ node, ...props }: any) => <thead className="bg-white/5 text-neutral-300 border-b border-white/10" {...props} />,
                                  th: ({ node, ...props }: any) => <th className="px-3 sm:px-4 py-2 sm:py-2.5 font-semibold" {...props} />,
                                  td: ({ node, ...props }: any) => <td className="px-3 sm:px-4 py-2 border-b border-white/5 last:border-0" {...props} />,
                                  code: ({ node, className, children, ...props }: any) => {
                                    const match = /language-(\w+)/.exec(className || '');
                                    const lang = match ? match[1] : '';
                                    const isInline = !match && !className;
                                    const codeString = String(children).replace(/\n$/, '');

                                    return isInline ? (
                                      <code className="bg-white/[0.08] px-1.5 py-0.5 rounded-md text-neutral-200 font-mono text-[11.5px] sm:text-[12.5px] break-all" {...props}>
                                        {children}
                                      </code>
                                    ) : (
                                      <div className="relative rounded-2xl overflow-hidden my-3.5 border border-white/[0.07] bg-[#07080a] max-w-full shadow-[0_8px_30px_rgba(0,0,0,0.6)]">
                                        <div className="px-3.5 pt-2.5 pb-1 flex items-center justify-between font-mono select-none bg-transparent">
                                          <span className="text-neutral-500 font-medium tracking-wider uppercase text-[10px] sm:text-[10.5px]">
                                            {lang || 'code'}
                                          </span>

                                          <button
                                            type="button"
                                            onClick={(e) => {
                                              navigator.clipboard.writeText(codeString);
                                              const btn = e.currentTarget;
                                              const span = btn.querySelector('span');
                                              if (span) {
                                                span.innerText = 'Copied';
                                                span.classList.add('text-amber-400');
                                                setTimeout(() => {
                                                  span.innerText = 'Copy';
                                                  span.classList.remove('text-amber-400');
                                                }, 1800);
                                              }
                                            }}
                                            className="text-[10.5px] sm:text-[11px] text-neutral-400 hover:text-white transition-colors flex items-center gap-1 font-sans cursor-pointer py-1 px-1.5 group select-none active:scale-95"
                                            title="Copy snippet"
                                          >
                                            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-60 group-hover:opacity-100 transition-opacity">
                                              <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                              <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                            </svg>
                                            <span className="transition-colors">Copy</span>
                                          </button>
                                        </div>

                                        <div className="text-[12px] sm:text-[13px] font-mono leading-relaxed overflow-x-auto select-text [scrollbar-width:thin]">
                                          <SyntaxHighlighter
                                            style={vscDarkPlus}
                                            language={lang || 'text'}
                                            PreTag="div"
                                            customStyle={{
                                              margin: 0,
                                              padding: '0.75rem 1rem 1rem 1rem',
                                              background: 'transparent',
                                              fontSize: 'inherit',
                                              lineHeight: '1.65',
                                            }}
                                            codeTagProps={{
                                              style: { fontFamily: 'inherit' }
                                            }}
                                          >
                                            {codeString}
                                          </SyntaxHighlighter>
                                        </div>
                                      </div>
                                    );
                                  },
                                  img: ({ node, ...props }: any) => (
                                    <div className="my-3.5 w-fit max-w-full rounded-2xl overflow-hidden border border-white/10 bg-[#07090e] shadow-2xl relative">
                                      <img 
                                        {...props} 
                                        alt={props.alt || 'Visual frame'}
                                        className="max-h-[460px] w-auto max-w-full rounded-2xl object-contain block select-none" 
                                        loading="lazy" 
                                      />
                                    </div>
                                  )
                                }}
                              >
                                {msg.content}
                              </ReactMarkdown>
                            </div>
                          )}

                          <div className="flex items-center gap-2 sm:gap-2.5 pt-2 flex-wrap">
                            {messages.length >= 6 && (
                              <span className="text-[10px] font-mono text-cyan-400/75 select-none font-semibold tracking-wider">
                                #{msg.turnNumber}
                              </span>
                            )}
                            <span className="text-[9.5px] sm:text-[10px] text-neutral-500 font-mono tracking-tight select-none">
                              {formatTime(msg.timestamp)}
                            </span>

                            {msg.content && !isStreaming && (
                              <>
                                <button
                                  type="button"
                                  onClick={() => {
                                    navigator.clipboard.writeText(msg.content);
                                    setCopiedResponseId(msg.id);
                                    setTimeout(() => setCopiedResponseId(null), 1800);
                                  }}
                                  className="w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 select-none active:scale-95 cursor-pointer bg-white/[0.03] hover:bg-white/[0.08] text-neutral-400 hover:text-white border border-white/[0.08] hover:border-white/20 shrink-0"
                                  title="Copy response"
                                >
                                  {copiedResponseId === msg.id ? (
                                    <span className="text-amber-400 text-xs font-bold">✓</span>
                                  ) : (
                                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-75">
                                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                                    </svg>
                                  )}
                                </button>

                                <button
                                  type="button"
                                  onClick={() => handlePlayTTS(msg.id, msg.content)}
                                  className={`w-7 h-7 rounded-full flex items-center justify-center transition-all duration-200 select-none active:scale-95 cursor-pointer shrink-0 ${
                                    playingAudioId === msg.id
                                      ? 'bg-white text-black font-semibold'
                                      : audioLoadingId === msg.id
                                      ? 'bg-white/10 text-neutral-300 border border-white/20 animate-pulse'
                                      : 'bg-white/[0.03] hover:bg-white/[0.08] text-neutral-400 hover:text-white border border-white/[0.08] hover:border-white/20'
                                  }`}
                                  title={playingAudioId === msg.id ? 'Stop playback (Esc)' : 'Listen to message'}
                                >
                                {audioLoadingId === msg.id ? (
                                  <div className="w-2.5 h-2.5 border-[1.5px] border-neutral-400 border-t-white rounded-full animate-spin" />
                                ) : playingAudioId === msg.id ? (
                                  <div className="flex items-center gap-0.5 h-2.5">
                                    <span className="w-0.5 h-2 bg-black rounded-full animate-bounce" style={{ animationDuration: '0.6s' }} />
                                    <span className="w-0.5 h-3 bg-black rounded-full animate-bounce" style={{ animationDuration: '0.4s', animationDelay: '0.15s' }} />
                                  </div>
                                ) : (
                                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-75">
                                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                                  </svg>
                                )}
                              </button>
                            </>
                          )}
                        </div>

                        </div>
                      </div>
                    )}
                  </div>
                  );
                })}

                {isWaitingForNetwork && (
                  <div className="w-full text-neutral-200 flex items-start gap-2.5 sm:gap-4 animate-in fade-in duration-300">
                    <div className="relative w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0 mt-0.5 select-none">
                      <img
                        src="/assets/ubair-logo.png"
                        alt="Processing"
                        className="w-full h-full object-contain scale-[1.7] drop-shadow-[0_0_10px_rgba(6,182,212,0.5)] opacity-60 animate-pulse pointer-events-none select-none"
                      />
                    </div>
                    <div className="flex-1 space-y-2 sm:space-y-3 mt-1 sm:mt-1.5 max-w-[75%] sm:max-w-[60%]">
                      <div className="h-3.5 bg-white/[0.06] rounded-md w-full animate-pulse"></div>
                      <div className="h-3.5 bg-white/[0.04] rounded-md w-2/3 animate-pulse delay-75"></div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} className="h-1" />
              </div>
            </div>

            {/* 3. FIXED BOTTOM CHAT BOX */}
            <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black via-black/95 to-transparent pt-8 sm:pt-12 pb-[max(1rem,env(safe-area-inset-bottom))] sm:pb-6 px-3 sm:px-4 flex justify-center pointer-events-none z-20">
              <div className="w-full max-w-3xl pointer-events-auto">
                <ChatInput 
                  onSendMessage={handleSendMessage} 
                  disabled={isStreaming || isWaitingForNetwork} 
                  forgeStatus={forgeStatus}
                  hasMessages={true}
                />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Flagship Image Studio Workstation */}
      <ImageStudio 
        isOpen={showImageStudio} 
        onClose={() => openWorkstation('chat')} 
        userEmail={currentUserEmail || ''}
        userRole={isAdmin ? 'admin' : isPro ? 'pro' : 'free'}
        onOpenUpgradeModal={() => setIsProModalOpen(true)}
        hasPendingProRequest={hasPendingProRequest}
      />

      {/* Neural Assessment Arena Workstation */}
      <AssessmentArena 
        isOpen={showAssessmentArena} 
        onClose={() => {
          setArenaTopic(undefined);
          setArenaPrinciples(undefined);
          openWorkstation('chat');
        }} 
        userEmail={currentUserEmail || ''}
        userTier={isAdmin ? 'admin' : isPro ? 'pro' : 'free'}
        initialTopic={arenaTopic}
        initialPrinciples={arenaPrinciples}
        onOpenUpgradeModal={() => setIsProModalOpen(true)}
        hasPendingProRequest={hasPendingProRequest}
      />

      {/* Adaptive Ubair Codex Workstation */}
      <UbairCodex
        isOpen={showUbairCodex}
        onClose={() => openWorkstation('chat')}
        onLaunchArena={(topic, principles) => {
          setArenaTopic(topic);
          setArenaPrinciples(principles);
          openWorkstation('arena');
        }}
      />

      {/* Zero-Trace Local Vault & Ephemeral Bridge */}
      <UbairSlate 
        isOpen={isSlateOpen} 
        onClose={() => openWorkstation('chat')} 
        userEmail={currentUserEmail || ''} 
      />

      {/* Autonomous Ubair Forge Studio */}
      <ForgeStudio
        isOpen={showForgeStudio}
        onClose={() => openWorkstation('chat')}
        userEmail={currentUserEmail || ''}
      />

      {/* 4. OFFICIAL INSTAGRAM MODAL */}
      {isInstaModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150 font-sans"
          onClick={() => setIsInstaModalOpen(false)}
        >
          <div 
            className="w-full max-w-[390px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.1] rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 sm:space-y-5 [scrollbar-width:none]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="relative w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0">
                  <img src="/assets/ubair-logo.png" alt="Logo" className="w-full h-full object-contain scale-[1.5] drop-shadow-[0_0_10px_rgba(56,189,248,0.45)]" />
                </div>
                <span className="text-[14px] sm:text-[14.5px] font-semibold text-white tracking-tight">
                  Official Instagram
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsInstaModalOpen(false)}
                className="group flex items-center justify-center px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.12] hover:border-white/30 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Close (Esc)"
              >
                <span className="text-[10.5px] sm:text-[11px] font-mono font-medium tracking-wider text-neutral-400 group-hover:text-white transition-colors">ESC</span>
              </button>
            </div>

            <div className="flex flex-col items-center justify-center p-2 sm:p-3">
              <div className="p-3 bg-white rounded-2xl shadow-[0_0_35px_rgba(6,182,212,0.22)] flex flex-col items-center">
                <Image 
                  src="/assets/instagram-qr.png" 
                  alt="Scan Instagram QR" 
                  width={140} 
                  height={140} 
                  className="object-contain" 
                  priority
                />
              </div>
              <p className="text-[11px] text-neutral-400 mt-3 text-center font-mono select-none">
                Scan with camera to open @ubair.os
              </p>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsInstaModalOpen(false)}
                className="px-3.5 py-2 text-xs text-neutral-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <a
                href="https://instagram.com/ubair.os"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setIsInstaModalOpen(false)}
                className="px-4 sm:px-5 py-2 text-xs font-semibold bg-white text-black hover:bg-neutral-200 rounded-xl transition-all shadow-md active:scale-95"
              >
                Open @ubair.os
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 4.5 OFFICIAL FOUNDER SUPPORT & INQUIRIES MODAL */}
      {isSupportModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150 font-sans"
          onClick={() => setIsSupportModalOpen(false)}
        >
          <div 
            className="w-full max-w-[400px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.1] rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 sm:space-y-5 [scrollbar-width:none]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2.5">
                <div className="relative w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0">
                  <img src="/assets/ubair-logo.png" alt="Logo" className="w-full h-full object-contain scale-[1.5] drop-shadow-[0_0_10px_rgba(56,189,248,0.45)]" />
                </div>
                <span className="text-[14px] sm:text-[14.5px] font-semibold tracking-tight text-white">
                  Founder Support Desk
                </span>
              </div>
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(false)}
                className="group flex items-center justify-center px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.12] hover:border-white/30 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Close (Esc)"
              >
                <span className="text-[10.5px] sm:text-[11px] font-mono font-medium tracking-wider text-neutral-400 group-hover:text-white transition-colors">ESC</span>
              </button>
            </div>

            <div className="space-y-3 text-xs text-neutral-400 leading-relaxed">
              <p>For technical inquiries, enterprise quotas, or direct system feedback:</p>
              
              <div className="flex items-center justify-between py-1 bg-white/[0.02] p-2.5 rounded-xl border border-white/[0.05]">
                <span className="text-neutral-200 font-mono text-[12px] sm:text-[13px] tracking-wide select-none cursor-default truncate mr-2">
                  mdsalikubair@gmail.com
                </span>
                
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText('mdsalikubair@gmail.com');
                    setCopiedSupportEmail(true);
                    setTimeout(() => setCopiedSupportEmail(false), 2000);
                  }}
                  className="text-xs font-mono text-neutral-400 hover:text-white flex items-center gap-1 transition-colors cursor-pointer select-none active:scale-95 py-1 shrink-0"
                >
                  {copiedSupportEmail ? (
                    <span className="text-amber-400 font-sans font-medium">✓ Copied</span>
                  ) : (
                    <>
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                        <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                        <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                      </svg>
                      <span>Copy</span>
                    </>
                  )}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-3 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setIsSupportModalOpen(false)}
                className="px-3.5 py-2 text-xs text-neutral-400 hover:text-white rounded-xl transition-colors cursor-pointer"
              >
                Close
              </button>
              <a
                href="mailto:mdsalikubair@gmail.com?subject=Ubair%20OS%20Inquiry%20%26%20Support"
                onClick={() => setIsSupportModalOpen(false)}
                className="px-4 sm:px-5 py-2 text-xs font-semibold bg-white text-black hover:bg-neutral-200 rounded-xl transition-all shadow-md active:scale-95"
              >
                Launch Mail App
              </a>
            </div>
          </div>
        </div>
      )}

      {/* 5. USER FEEDBACK & ISSUE REPORT MODAL */}
      <FeedbackModal
        isOpen={isFeedbackOpen && !isAdmin}
        onClose={() => setIsFeedbackOpen(false)}
        userEmail={currentUserEmail || ''}
        userName={session?.user?.name || 'User'}
        apiBase={API_BASE}
      />

      {/* 6. PRO TIER UPGRADE MODAL */}
      {isProModalOpen && !isAdmin && (
        <div 
          className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150 font-sans"
          onClick={() => setIsProModalOpen(false)}
        >
          <div 
            className="w-full max-w-[480px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.1] rounded-3xl p-5 sm:p-7 shadow-2xl space-y-4 sm:space-y-5 [scrollbar-width:none]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div className="flex items-center gap-2">
                <div className="relative w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0">
                  <img 
                    src="/assets/ubair-logo.png" 
                    alt="Logo" 
                    className="w-full h-full object-contain scale-[1.7] drop-shadow-[0_0_10px_rgba(6,182,212,0.5)] opacity-95" 
                  />
                </div>
                <div className="flex items-center gap-1.5">
                  <Image src="/assets/ubair-wordmark.png" alt="Ubair OS" width={78} height={16} className="object-contain opacity-95" />
                  <span className="text-[10.5px] font-sans font-extrabold tracking-[0.18em] text-transparent bg-clip-text bg-gradient-to-r from-amber-200 via-amber-400 to-yellow-500 drop-shadow-[0_0_8px_rgba(245,158,11,0.25)] italic select-none">
                    PRO
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsProModalOpen(false)}
                className="group flex items-center justify-center px-2 py-1 rounded-md bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.12] hover:border-white/30 transition-all cursor-pointer shadow-sm active:scale-95"
                title="Close (Esc)"
              >
                <span className="text-[10.5px] sm:text-[11px] font-mono font-medium tracking-wider text-neutral-400 group-hover:text-white transition-colors">ESC</span>
              </button>
            </div>

            <div className="space-y-2.5">
              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <div className="text-cyan-400 shrink-0 mt-0.5 font-bold text-xs">📁</div>
                <div>
                  <h4 className="text-xs font-semibold text-white">25 Workspaces & 50MB Vector RAG Vaults</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed font-sans">
                    Store 20 large documents per workspace with long-term conversational memory indexing.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <div className="text-amber-400 shrink-0 mt-0.5 font-bold text-xs">⚡</div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Deep Works Reasoning & Greater Limits</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed font-sans">
                    Uncapped 120B LPU architectural reasoning in chat, expanded context windows, and priority execution pipelines.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <div className="text-amber-300 shrink-0 mt-0.5 font-bold text-xs">🎨</div>
                <div>
                  <h4 className="text-xs font-semibold text-white">50 Studio Frames & Lossless Master HD (No Watermark)</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed font-sans">
                    Export crystal-clear master renders without frosted badge watermarks and bypass daily free limits.
                  </p>
                </div>
              </div>

              <div className="p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] flex items-start gap-3">
                <div className="text-emerald-400 shrink-0 mt-0.5 font-bold text-xs">🎯</div>
                <div>
                  <h4 className="text-xs font-semibold text-white">Cognitive Arena & Socratic Defense</h4>
                  <p className="text-[11px] text-neutral-400 mt-0.5 leading-relaxed font-sans">
                    Up to 30 challenge sets per day with AI concept scoring, failure retesting, and scenario invariant checks.
                  </p>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-white/[0.06] flex items-center justify-between">
              <span className="text-[11px] font-mono text-neutral-500">Free during early access</span>
              
              {proRequestSent || hasPendingProRequest ? (
                <div className="px-3.5 py-1.5 rounded-xl bg-amber-500/10 border border-amber-400/30 text-amber-300 text-xs font-semibold flex items-center gap-1.5 shadow-[0_0_12px_rgba(245,158,11,0.15)]">
                  ✓ Request Under Review
                </div>
              ) : (
                <button
                  type="button"
                  disabled={isRequestingPro}
                  onClick={handleRequestProUpgrade}
                  className="px-4 sm:px-5 py-2 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-2 cursor-pointer"
                >
                  {isRequestingPro && <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
                  <span>{isRequestingPro ? 'Submitting...' : 'Request Pro Access'}</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* 7. FOUNDER INTELLIGENCE & ANALYTICS COCKPIT */}
      <FounderAnalyticsModal
        isOpen={isFounderReviewsOpen && isAdmin}
        onClose={closeFounderReviews}
        feedbacks={founderFeedbacks}
        isLoading={isLoadingFeedbacks}
        onRefresh={fetchFounderFeedbacks}
        onDeleteFeedback={handleDeleteFeedback}
        onSendDirectReply={handleSendDirectReply}
        onOpenBroadcast={() => setIsBroadcastModalOpen(true)}
        deletingFeedbackId={deletingFeedbackId}
        isSendingReply={isSendingReply}
      />

      {/* 7.5 FOUNDER BROADCAST & SEGMENT DISPATCH STUDIO */}
      {isBroadcastModalOpen && isAdmin && (
        <div 
          className="fixed inset-0 z-[60] bg-black/85 backdrop-blur-2xl flex items-center justify-center p-3 sm:p-6 animate-in fade-in duration-150 font-sans"
          onClick={() => setIsBroadcastModalOpen(false)}
        >
          <div 
            className="w-full max-w-[440px] bg-[#090a0d] border border-white/[0.1] rounded-2xl p-5 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.95)] space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <div>
                <h4 className="text-sm font-semibold text-white tracking-tight">New Broadcast</h4>
                <p className="text-[11px] text-neutral-500 font-mono mt-0.5">Platform announcement & notifications</p>
              </div>
              <button
                type="button"
                onClick={() => setIsBroadcastModalOpen(false)}
                className="w-6 h-6 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] text-neutral-400 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleDispatchBroadcast} className="space-y-3.5">
              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1.5">
                  Target Audience
                </label>
                <div className="p-1 rounded-xl bg-white/[0.03] border border-white/[0.06] grid grid-cols-4 gap-1">
                  {[
                    { id: 'all', label: 'All Users' },
                    { id: 'role:free', label: 'Free' },
                    { id: 'role:pro', label: 'Pro' },
                    { id: 'custom', label: 'Direct' }
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setBroadcastTarget(tab.id as any)}
                      className={`py-1 rounded-lg text-xs font-medium transition-all cursor-pointer text-center ${
                        broadcastTarget === tab.id
                          ? 'bg-white/[0.12] text-white shadow-sm'
                          : 'text-neutral-400 hover:text-white'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>

              {broadcastTarget === 'custom' && (
                <div>
                  <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                    Recipient Email
                  </label>
                  <input
                    type="email"
                    required
                    autoFocus
                    value={broadcastCustomEmail}
                    onChange={(e) => setBroadcastCustomEmail(e.target.value)}
                    placeholder="user@example.com"
                    className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-cyan-400/40 font-mono"
                  />
                </div>
              )}

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                  Subject
                </label>
                <input
                  type="text"
                  required
                  value={broadcastTitle}
                  onChange={(e) => setBroadcastTitle(e.target.value)}
                  placeholder="e.g. Ubair OS 6.0 Deployed"
                  className="w-full bg-white/[0.02] border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-neutral-600 outline-none focus:border-cyan-400/40 font-sans"
                />
              </div>

              <div>
                <label className="text-[10px] font-mono uppercase tracking-wider text-neutral-400 block mb-1">
                  Message
                </label>
                <textarea
                  rows={3}
                  required
                  value={broadcastMessage}
                  onChange={(e) => setBroadcastMessage(e.target.value)}
                  placeholder="Type your message here..."
                  className="w-full bg-white/[0.02] border border-white/10 rounded-xl p-3 text-xs text-white placeholder-neutral-600 outline-none focus:border-cyan-400/40 font-sans resize-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.06]">
                <button
                  type="button"
                  onClick={() => setIsBroadcastModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-neutral-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSendingBroadcast || !broadcastMessage.trim()}
                  className="px-4 py-1.5 text-xs font-semibold bg-white text-black hover:bg-neutral-200 rounded-lg transition-all shadow-sm active:scale-95 disabled:opacity-40 cursor-pointer"
                >
                  {isSendingBroadcast ? 'Sending...' : 'Send Broadcast →'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 8. FOUNDER PRO REQUESTS & SUBSCRIPTION MANAGER */}
      <ProRequestsModal
        isOpen={isProRequestsOpen && isAdmin}
        onClose={closeProRequests}
        requests={proRequests}
        isLoading={isLoadingProRequests}
        onRefresh={fetchProRequests}
        onManageAccess={handleManageProAccess}
      />

      {/* 9. REGISTERED USER DIRECTORY MODAL */}
      <UserDirectoryModal
        isOpen={isUserDirectoryOpen && isAdmin}
        onClose={closeUserDirectory}
        users={registeredUsers}
        isLoading={isLoadingUsers}
        onRefresh={fetchUserDirectory}
      />

      {/* 10. SAAS LOGOUT MODAL */}
      {isLogoutModalOpen && (
        <div 
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150 font-sans"
          onClick={() => setIsLogoutModalOpen(false)}
        >
          <div 
            className="w-full max-w-[370px] bg-[#0a0b0e] border border-white/[0.08] rounded-2xl p-5 sm:p-6 shadow-[0_24px_70px_rgba(0,0,0,0.9)] space-y-4 animate-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div className="w-8 h-8 rounded-xl bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 shrink-0">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                  <polyline points="16 17 21 12 16 7" />
                  <line x1="21" y1="12" x2="9" y2="12" />
                </svg>
              </div>

              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="text-neutral-500 hover:text-white text-xs p-1 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-1.5">
              <h3 className="text-[15px] font-semibold text-white tracking-tight">
                Log out of Ubair OS?
              </h3>
              <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                Are you sure you want to end your session? Your workspaces and data remain safely saved.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setIsLogoutModalOpen(false)}
                className="h-8 px-3.5 rounded-lg text-xs font-medium text-neutral-400 hover:text-white hover:bg-white/[0.06] transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => signOut({ callbackUrl: '/login' })}
                className="h-8 px-4 rounded-lg text-xs font-semibold text-white bg-rose-600 hover:bg-rose-500 transition-colors shadow-sm cursor-pointer active:scale-95"
              >
                Log out
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 11. FOUNDER ACTION TOAST NOTICE */}
      {founderActionNotice && (
        <div className="fixed bottom-5 right-5 z-[80] bg-[#0c0d10]/95 border border-amber-400/30 text-amber-300 px-4 py-2 rounded-xl text-xs font-mono shadow-[0_10px_30px_rgba(0,0,0,0.8)] backdrop-blur-xl animate-in slide-in-from-bottom-2 fade-in duration-150 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          <span>{founderActionNotice}</span>
        </div>
      )}

    </main>
  );
}