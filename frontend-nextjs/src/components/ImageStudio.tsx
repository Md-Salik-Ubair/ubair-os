'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

/* ============================================================================
 * MODULE-LEVEL CONFIGURATION
 * ========================================================================== */
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const REFERENCE_MAX_DIM = 1024;
const REFERENCE_JPEG_QUALITY = 0.85;

interface RatioOption {
  id: string;
  label: string;
  desc: string;
  w: number;
  h: number;
}

const RATIOS: RatioOption[] = [
  { id: '16:9', label: '16:9', desc: 'Landscape', w: 1024, h: 576 },
  { id: '1:1', label: '1:1', desc: 'Square', w: 1024, h: 1024 },
  { id: '9:16', label: '9:16', desc: 'Portrait', w: 576, h: 1024 },
  { id: '21:9', label: '21:9', desc: 'Cinematic', w: 1024, h: 448 },
];

const STYLES = [
  'Cinematic',
  'Photorealistic',
  'Anime',
  'Cyberpunk',
  '3D Render',
  'Concept Art',
  'Minimalist',
  'Studio Portrait',
];

const GENERATION_STAGES = [
  'Sampling latent diffusion space…',
  'Calibrating light & atmosphere…',
  'Synthesizing neural details…',
  'Refining surface textures…',
  'Finalizing optical master…',
];

const STYLE_OPTICS: Record<string, {
  glow: string;
  accent: string;
  tag: string;
  profile: string;
}> = {
  'Cinematic': {
    glow: 'from-amber-500/10 via-stone-500/5 to-transparent',
    accent: 'text-amber-200/90',
    tag: 'ANAMORPHIC 35MM',
    profile: 'T/1.5 • KODAK VISION3',
  },
  'Photorealistic': {
    glow: 'from-neutral-400/10 via-stone-500/5 to-transparent',
    accent: 'text-neutral-200',
    tag: 'HASSELBLAD RAW',
    profile: '85MM F/1.4 • NATURAL KEY',
  },
  'Anime': {
    glow: 'from-fuchsia-500/10 via-purple-500/5 to-transparent',
    accent: 'text-fuchsia-200/90',
    tag: 'MAKOTO DYNAMIC',
    profile: 'CEL-FRAME • 4K ULTRA',
  },
  'Cyberpunk': {
    glow: 'from-neutral-400/10 via-stone-600/5 to-transparent',
    accent: 'text-neutral-200',
    tag: 'NEO-MATRIX',
    profile: 'RAYTRACED CAUSTICS',
  },
  '3D Render': {
    glow: 'from-indigo-500/10 via-stone-500/5 to-transparent',
    accent: 'text-indigo-200/90',
    tag: 'OCTANE RENDER',
    profile: 'SUBSURFACE • UNREAL 5',
  },
  'Concept Art': {
    glow: 'from-emerald-500/10 via-stone-500/5 to-transparent',
    accent: 'text-emerald-200/90',
    tag: 'MATTE COMPOSITION',
    profile: 'DIGITAL CANVAS • EPIC',
  },
  'Minimalist': {
    glow: 'from-white/10 via-neutral-500/5 to-transparent',
    accent: 'text-neutral-200',
    tag: 'BAUHAUS MONO',
    profile: 'HIGH-CONTRAST NEGATIVE',
  },
  'Studio Portrait': {
    glow: 'from-rose-500/10 via-stone-500/5 to-transparent',
    accent: 'text-rose-200/90',
    tag: 'EDITORIAL STUDIO',
    profile: 'SOFTBOX KEY • REMBRANDT',
  },
};

/* ============================================================================
 * INTERFACES
 * ========================================================================== */
export interface ImageStudioProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string | null;
  userRole?: 'free' | 'pro' | 'admin';
  onOpenUpgradeModal?: () => void;
  hasPendingProRequest?: boolean;
}

export interface GeneratedImage {
  id: string;
  image_url: string;
  prompt: string;
  style: string;
  aspect_ratio: string;
  provider?: string;
  timestamp: string;
}

export interface ClarificationOption {
  id: number;
  label: string;
  prompt: string;
}

export interface ClarificationState {
  active: boolean;
  raw_prompt: string;
  observation: string;
  options: ClarificationOption[];
}

/* ============================================================================
 * CLIENT REFERENCE COMPRESSOR
 * ========================================================================== */
async function compressReferenceImage(file: File): Promise<{ dataUrl: string; sizeKb: string; name: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const img = new window.Image();
      img.onload = () => {
        let { width, height } = img;
        if (width > REFERENCE_MAX_DIM || height > REFERENCE_MAX_DIM) {
          const scale = REFERENCE_MAX_DIM / Math.max(width, height);
          width = Math.round(width * scale);
          height = Math.round(height * scale);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error('Canvas context unavailable'));
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL('image/jpeg', REFERENCE_JPEG_QUALITY);
        const sizeKb = `${Math.round((dataUrl.length * 3) / 4 / 1024)} KB`;
        resolve({ dataUrl, sizeKb, name: file.name });
      };
      img.onerror = () => reject(new Error('Invalid image file'));
      img.src = e.target?.result as string;
    };
    reader.onerror = () => reject(new Error('Could not read file'));
    reader.readAsDataURL(file);
  });
}

export default function ImageStudio({
  isOpen,
  onClose,
  userEmail = '',
  userRole,
  onOpenUpgradeModal,
  hasPendingProRequest = false
}: ImageStudioProps) {
  const [prompt, setPrompt] = useState('');
  const [selectedStyle, setSelectedStyle] = useState(STYLES[0]);
  const [selectedRatio, setSelectedRatio] = useState(RATIOS[0].id);

  // Responsive Mobile/Zoom Viewport Tab Switcher
  const [mobileTab, setMobileTab] = useState<'controls' | 'viewport'>('controls');

  // Reference Asset
  const [refImage, setRefImage] = useState<{ dataUrl: string; sizeKb: string; name: string } | null>(null);
  const [isCompressingRef, setIsCompressingRef] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Pipeline Execution
  const [isGenerating, setIsGenerating] = useState(false);
  const [stageIndex, setStageIndex] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [isImageLoaded, setIsImageLoaded] = useState(false);

  // Quota & Identity
  const [usedToday, setUsedToday] = useState(0);
  const [effectiveRole, setEffectiveRole] = useState<'free' | 'pro' | 'admin'>('free');
  const [resetCountdown, setResetCountdown] = useState<string>('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);

  // Anti-Screenshot / Security Interceptor State
  const [isSecurityShieldActive, setIsSecurityShieldActive] = useState(false);

  // 3D Parallax Tilt
  const [tilt, setTilt] = useState({ x: 0, y: 0 });
  const [specular, setSpecular] = useState({ x: 50, y: 50, opacity: 0 });
  const frameRef = useRef<HTMLDivElement>(null);

  // Clarification System
  const [clarification, setClarification] = useState<ClarificationState>({
    active: false,
    raw_prompt: '',
    observation: '',
    options: [],
  });
  const [currentImage, setCurrentImage] = useState<GeneratedImage | null>(null);
  const [history, setHistory] = useState<GeneratedImage[]>([]);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const statusTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Identity Resolver (Deep Supabase & Admin Token Resolution)
  const resolveUserEmail = useCallback((): string => {
    if (userEmail && userEmail.trim()) return userEmail.trim().toLowerCase();
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('ubair_user_email') || localStorage.getItem('user_email') || localStorage.getItem('email');
      if (stored && stored.trim()) return stored.trim().toLowerCase();

      const storedUser = localStorage.getItem('ubair_user');
      if (storedUser) {
        try {
          const u = JSON.parse(storedUser);
          if (u?.email) return u.email.trim().toLowerCase();
        } catch {}
      }

      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && (k.includes('auth-token') || k.includes('supabase'))) {
          try {
            const p = JSON.parse(localStorage.getItem(k) || '{}');
            const foundEmail = p?.user?.email || p?.currentSession?.user?.email || p?.session?.user?.email;
            if (foundEmail) return String(foundEmail).trim().toLowerCase();
          } catch {}
        }
      }
      let guestId = localStorage.getItem('ubair_guest_session_id');
      if (!guestId) {
        guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('ubair_guest_session_id', guestId);
      }
      return `${guestId}@ubair.os`;
    }
    return 'guest_node@ubair.os';
  }, [userEmail]);

  const maxLimit = effectiveRole === 'admin' ? 999999 : effectiveRole === 'pro' ? 50 : 3;
  const isLimitReached = effectiveRole !== 'admin' && usedToday >= maxLimit;

  // Personal 3-Hour Cooldown Timer from Moment of Limit Exhaustion
  useEffect(() => {
    const tick = () => {
      const email = resolveUserEmail();
      const cooldownKey = `ubair_img_cooldown_end_${email}`;
      let endTime = Number(localStorage.getItem(cooldownKey) || 0);

      if (usedToday >= maxLimit && !endTime) {
        endTime = Date.now() + (3 * 60 * 60 * 1000); // 3 Hours from now
        localStorage.setItem(cooldownKey, String(endTime));
      }

      if (!endTime) {
        setResetCountdown('03h 00m 00s');
        return;
      }

      const diffMs = endTime - Date.now();

      if (diffMs <= 1000) {
        localStorage.removeItem(cooldownKey);
        setUsedToday(0);
        setShowUpgradeModal(false);
        setResetCountdown('03h 00m 00s');
        return;
      }

      const h = Math.floor(diffMs / 3600000).toString().padStart(2, '0');
      const m = Math.floor((diffMs % 3600000) / 60000).toString().padStart(2, '0');
      const s = Math.floor((diffMs % 60000) / 1000).toString().padStart(2, '0');
      setResetCountdown(`${h}h ${m}m ${s}s`);
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [usedToday, maxLimit, resolveUserEmail]);

  // Sync Role & Current Day Usage (Strict Identity Validation)
  useEffect(() => {
    const email = resolveUserEmail();
    const isAdmin = userRole === 'admin' || email === 'mdsalikubair@gmail.com';
    const isPro = userRole === 'pro' && !isAdmin;
    const initialRole: 'admin' | 'pro' | 'free' = isAdmin ? 'admin' : (isPro ? 'pro' : 'free');
    
    setEffectiveRole(initialRole);

    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const windowBucket = Math.floor(now.getUTCHours() / 3);
    const windowKey = `ubair_img_usage_${dateStr}_w${windowBucket}_${email}`;
    setUsedToday(Number(localStorage.getItem(windowKey) || '0'));

    if (isAdmin) return;

    if (email && !email.includes('guest_')) {
      fetch(`${API_BASE}/api/user/profile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email })
      })
        .then((r) => r.json())
        .then((d) => {
          if (d?.role) setEffectiveRole(d.role);
        })
        .catch(() => {});
    }
  }, [userEmail, userRole, resolveUserEmail]);

  const incrementUsage = useCallback(() => {
    const email = resolveUserEmail();
    const now = new Date();
    const dateStr = now.toISOString().slice(0, 10);
    const windowBucket = Math.floor(now.getUTCHours() / 3);
    const windowKey = `ubair_img_usage_${dateStr}_w${windowBucket}_${email}`;
    const newCount = usedToday + 1;
    setUsedToday(newCount);
    localStorage.setItem(windowKey, String(newCount));
  }, [usedToday, resolveUserEmail]);

  // Stage Cycle Indicator
  useEffect(() => {
    if (!isGenerating) return;
    setStageIndex(0);
    const interval = setInterval(() => {
      setStageIndex((prev) => (prev + 1) % GENERATION_STAGES.length);
    }, 1500);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const showStatus = useCallback((msg: string) => {
    if (statusTimeoutRef.current) clearTimeout(statusTimeoutRef.current);
    setStatusMessage(msg);
    statusTimeoutRef.current = setTimeout(() => setStatusMessage(null), 2500);
  }, []);

  // DRM & Security Handlers
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDownSecurity = (e: KeyboardEvent) => {
      if (e.key === 'PrintScreen') {
        setIsSecurityShieldActive(true);
        navigator.clipboard?.writeText?.('').catch(() => {});
        showStatus('Protected Workspace • Screen capture restricted');
        setTimeout(() => setIsSecurityShieldActive(false), 1200);
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        showStatus('Use Download Master HD button below');
      }

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'p') {
        e.preventDefault();
        showStatus('Studio print export disabled');
      }

      if (e.key === 'Escape') {
        if (showUpgradeModal) {
          e.stopImmediatePropagation();
          setShowUpgradeModal(false);
          return;
        } else if (clarification.active) {
          e.stopImmediatePropagation();
          setClarification({ active: false, raw_prompt: '', observation: '', options: [] });
          return;
        }
      }
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter' && prompt.trim() && !isGenerating && !isLimitReached) {
        handleGenerate(undefined, false);
      }
      if (clarification.active && ['1', '2', '3'].includes(e.key)) {
        const idx = Number(e.key) - 1;
        if (clarification.options[idx]) {
          const opt = clarification.options[idx];
          setPrompt(opt.prompt);
          handleGenerate(opt.prompt, true);
        }
      }
    };

    window.addEventListener('keyup', handleKeyDownSecurity);
    window.addEventListener('keydown', handleKeyDownSecurity);
    return () => {
      window.removeEventListener('keyup', handleKeyDownSecurity);
      window.removeEventListener('keydown', handleKeyDownSecurity);
    };
  }, [isOpen, prompt, isGenerating, isLimitReached, clarification, showUpgradeModal, onClose, showStatus]);

  // 3D Parallax Tilt (Desktop only)
  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!frameRef.current || typeof window === 'undefined' || window.innerWidth < 1024) return;
    const rect = frameRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;

    const rotateX = ((y - centerY) / centerY) * -3.5;
    const rotateY = ((x - centerX) / centerX) * 3.5;

    setTilt({ x: rotateX, y: rotateY });
    setSpecular({
      x: (x / rect.width) * 100,
      y: (y / rect.height) * 100,
      opacity: 0.12,
    });
  };

  const handleMouseLeave = () => {
    setTilt({ x: 0, y: 0 });
    setSpecular((prev) => ({ ...prev, opacity: 0 }));
  };

  const onFileSelect = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      showStatus('Please drop an image file (PNG, JPG, WEBP)');
      return;
    }
    setIsCompressingRef(true);
    try {
      const res = await compressReferenceImage(file);
      setRefImage(res);
      showStatus('Reference image attached');
    } catch {
      showStatus('Could not read image file');
    } finally {
      setIsCompressingRef(false);
    }
  };

  const activeRatioConfig = useMemo(() => RATIOS.find((r) => r.id === selectedRatio) || RATIOS[0], [selectedRatio]);

  // Generation Trigger
  const handleGenerate = async (overridePrompt?: string, forceGen: boolean = false) => {
    const targetPrompt = (overridePrompt || prompt).trim();
    if (!targetPrompt || isGenerating) return;

    if (effectiveRole !== 'admin' && usedToday >= maxLimit && !forceGen) {
      setShowUpgradeModal(true);
      return;
    }

    // Auto-switch mobile view to viewport to watch generation
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setMobileTab('viewport');
    }

    setIsGenerating(true);
    setIsImageLoaded(false);
    setClarification({ active: false, raw_prompt: '', observation: '', options: [] });

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const emailToUse = resolveUserEmail();

    try {
      const payload: Record<string, any> = {
        prompt: targetPrompt,
        style: selectedStyle,
        width: activeRatioConfig.w,
        height: activeRatioConfig.h,
        user_email: emailToUse,
        session_id: emailToUse,
        force_generate: forceGen,
      };

      if (refImage) {
        payload.ref_image = refImage.dataUrl;
        payload.ref_image_mime = 'image/jpeg';
      }

      const res = await fetch(`${API_BASE}/api/studio/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 403 && data.upgrade_required) {
        setShowUpgradeModal(true);
        return;
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || 'Failed to synthesize frame.');
      }

      if (data.status === 'clarification_needed' && data.options?.length > 0) {
        const rawObs = String(data.observation || data.message || '');
        const cleanObs = rawObs.split(/\*\*Option|\nOption|👉/i)[0].replace(/[*_#]/g, '').trim();

        setClarification({
          active: true,
          raw_prompt: targetPrompt,
          observation: cleanObs || 'Select an interpretation:',
          options: data.options,
        });
        return;
      }

      const outputUrl = data.image_url || data.data_uri || data.image || data.url;
      if (!outputUrl) throw new Error('No image returned by synthesis engine.');

      const generated: GeneratedImage = {
        id: `img_${Date.now()}`,
        image_url: outputUrl,
        prompt: targetPrompt,
        style: selectedStyle,
        aspect_ratio: selectedRatio,
        provider: data.provider,
        timestamp: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      };

      const img = new window.Image();
      img.src = outputUrl;
      await new Promise((r) => {
        img.onload = r;
        img.onerror = r;
      });

      setCurrentImage(generated);
      setIsImageLoaded(true);
      setHistory((prev) => [generated, ...prev.slice(0, 11)]);
      incrementUsage();
      showStatus('Frame generated');
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        showStatus(err.message || 'Generation failed.');
      }
    } finally {
      setIsGenerating(false);
      abortControllerRef.current = null;
    }
  };

  // SaaS Export: Pro/Admin = Raw Lossless; Free = Frosted Corner Micro-Pill
  const handleExport = async (url: string) => {
    try {
      const isUnwatermarkedRole = effectiveRole === 'admin' || effectiveRole === 'pro';

      if (isUnwatermarkedRole) {
        showStatus('Exporting Master HD (Pro Lossless)…');
        const link = document.createElement('a');
        link.href = url;
        link.download = `ubair_master_${Date.now()}.png`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        showStatus('Downloaded (Unbranded Lossless)');
        return;
      }

      showStatus('Rendering Studio Export (Free Plan)…');
      const img = new window.Image();
      if (!url.startsWith('data:')) img.crossOrigin = 'anonymous';

      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });

      const canvas = document.createElement('canvas');
      canvas.width = img.naturalWidth || 1024;
      canvas.height = img.naturalHeight || 576;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas rendering pipeline unavailable');

      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0);

      const scale = canvas.width / 1024;
      const badgeH = Math.max(26, Math.round(30 * scale));
      const fontSize = Math.max(10, Math.round(badgeH * 0.36));
      ctx.font = `600 ${fontSize}px Inter, -apple-system, sans-serif`;
      const textW = ctx.measureText('Ubair Studio').width;
      const padX = Math.round(badgeH * 0.42);
      const badgeW = padX * 2 + textW;
      const margin = Math.round(16 * scale);
      const x = canvas.width - badgeW - margin;
      const y = canvas.height - badgeH - margin;

      ctx.save();
      ctx.beginPath();
      ctx.roundRect(x, y, badgeW, badgeH, badgeH / 2);
      ctx.fillStyle = 'rgba(10, 11, 16, 0.65)';
      ctx.fill();
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
      ctx.lineWidth = 1;
      ctx.stroke();

      ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
      ctx.textBaseline = 'middle';
      ctx.fillText('Ubair Studio', x + padX, y + badgeH / 2);
      ctx.restore();

      canvas.toBlob((blob) => {
        if (!blob) throw new Error('Blob serialization failed');
        const objUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = objUrl;
        link.download = `ubair_studio_${Date.now()}.jpg`;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(objUrl), 1500);
        showStatus('Downloaded (Free Watermark)');
      }, 'image/jpeg', 0.96);

    } catch (err) {
      console.warn('Fallback stream export triggered:', err);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ubair_studio_${Date.now()}.png`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      showStatus('Downloaded');
    }
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 flex h-[100dvh] w-full select-none overflow-hidden bg-[#050609] font-sans text-neutral-200 antialiased animate-in fade-in duration-150"
      onContextMenu={(e) => e.preventDefault()}
    >
      
      {/* DRM Screen Capture Interceptor */}
      {isSecurityShieldActive && (
        <div className="fixed inset-0 z-[100] bg-black flex items-center justify-center pointer-events-none">
          <span className="font-mono text-xs uppercase tracking-widest text-neutral-500">
            Protected Digital Asset
          </span>
        </div>
      )}

      {/* ================= LEFT CONTROLS DRAWER ================= */}
      <aside 
        className={`${
          mobileTab === 'controls' ? 'flex' : 'hidden lg:flex'
        } relative w-full lg:w-[360px] xl:w-[400px] shrink-0 flex-col justify-between bg-[#07080d]/90 backdrop-blur-3xl p-4 sm:p-6 z-20 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden border-r border-white/[0.08] shadow-[25px_0_60px_rgba(0,0,0,0.65)]`}
      >
        <div className="flex flex-col gap-5 sm:gap-6">
          
          {/* Header Brand & Dismiss */}
          <div className="flex items-center justify-between pb-1 shrink-0">
            <div className="flex items-center gap-2.5 sm:gap-3">
              <div className="w-7 h-7 flex items-center justify-center shrink-0">
                <img 
                  src="/assets/ubair-logo.png" 
                  alt="Ubair OS" 
                  className="w-full h-full object-contain scale-[1.7] drop-shadow-[0_0_12px_rgba(255,255,255,0.35)] pointer-events-none"
                  draggable={false}
                />
              </div>

              <div className="flex items-baseline gap-1.5 select-none">
                <span className="text-[15px] font-semibold tracking-tight text-white">Ubair</span>
                <span className="text-[14px] font-semibold tracking-tight bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-500 bg-clip-text text-transparent">
                  Studio
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={onClose}
              className="flex items-center gap-1.5 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 py-1 text-[11px] font-mono text-neutral-400 hover:text-white hover:border-white/20 transition-all active:scale-95 cursor-pointer"
            >
              <span>Esc</span>
              <span>✕</span>
            </button>
          </div>

          {/* Mobile / High-Zoom Segmented View Switcher */}
          <div className="flex lg:hidden items-center p-1 bg-white/[0.03] border border-white/[0.08] rounded-xl text-xs font-medium shrink-0">
            <button
              type="button"
              onClick={() => setMobileTab('controls')}
              className={`flex-1 py-1.5 rounded-lg text-center transition-all ${
                mobileTab === 'controls' ? 'bg-white text-black font-semibold shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              Directives
            </button>
            <button
              type="button"
              onClick={() => setMobileTab('viewport')}
              className={`flex-1 py-1.5 rounded-lg text-center transition-all flex items-center justify-center gap-1.5 ${
                mobileTab === 'viewport' ? 'bg-white text-black font-semibold shadow-sm' : 'text-neutral-400 hover:text-white'
              }`}
            >
              <span>Viewport</span>
              {isGenerating ? (
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-ping" />
              ) : currentImage ? (
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              ) : null}
            </button>
          </div>

          {/* Prompt Directive Input */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] sm:text-[10.5px] font-mono font-medium tracking-wider uppercase text-neutral-400">
              Directive
            </span>
            <textarea
              ref={textareaRef}
              rows={3}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Describe your visual concept in detail..."
              className="w-full resize-none rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-3.5 text-xs sm:text-[13px] leading-relaxed text-neutral-100 placeholder-neutral-600 outline-none transition-all focus:border-white/30 focus:bg-white/[0.04] shadow-inner min-h-[75px] max-h-[140px]"
            />
          </div>

          {/* Reference Asset Dropzone */}
          <div className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <span className="text-[10px] sm:text-[10.5px] font-mono font-medium tracking-wider uppercase text-neutral-400">
                Reference Image <span className="text-neutral-600 normal-case">(Optional)</span>
              </span>
              {refImage && (
                <button
                  type="button"
                  onClick={() => setRefImage(null)}
                  className="text-[10px] font-mono text-neutral-500 hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Clear ✕
                </button>
              )}
            </div>

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFileSelect(f);
                e.target.value = '';
              }}
            />

            {!refImage ? (
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDragging(false);
                  const f = e.dataTransfer.files?.[0];
                  if (f) void onFileSelect(f);
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border border-dashed py-3 px-3 transition-all ${
                  isDragging
                    ? 'border-white/40 bg-white/[0.06]'
                    : 'border-white/[0.08] bg-white/[0.015] hover:border-white/25 hover:bg-white/[0.03]'
                }`}
              >
                <span className="text-xs text-neutral-400">
                  {isCompressingRef ? 'Processing…' : 'Attach reference image'}
                </span>
                <span className="text-[10px] font-mono text-neutral-600">· Drag & drop</span>
              </div>
            ) : (
              <div className="flex items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.025] p-2 sm:p-2.5">
                <img 
                  src={refImage.dataUrl} 
                  alt="Ref" 
                  className="h-9 w-9 rounded-xl object-cover border border-white/10 pointer-events-none" 
                  draggable={false}
                />
                <div className="flex flex-1 flex-col overflow-hidden text-left">
                  <span className="truncate text-xs font-medium text-neutral-200">{refImage.name}</span>
                  <span className="text-[10px] font-mono text-neutral-500">{refImage.sizeKb}</span>
                </div>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="rounded px-2 py-1 text-[11px] text-neutral-400 hover:text-white transition-colors cursor-pointer"
                >
                  Change
                </button>
              </div>
            )}
          </div>

          {/* Aesthetic Presets */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] sm:text-[10.5px] font-mono font-medium tracking-wider uppercase text-neutral-400">
              Aesthetic Preset
            </span>
            <div className="flex flex-wrap gap-1.5">
              {STYLES.map((st) => {
                const isSelected = selectedStyle === st;
                return (
                  <button
                    key={st}
                    type="button"
                    onClick={() => setSelectedStyle(st)}
                    className={`rounded-xl px-2.5 sm:px-3 py-1 sm:py-1.5 text-[11px] sm:text-xs transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-white text-black font-semibold shadow-sm scale-[1.02]'
                        : 'border border-white/[0.06] bg-white/[0.02] text-neutral-400 hover:text-neutral-200 hover:border-white/15'
                    }`}
                  >
                    {st}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Aspect Ratios */}
          <div className="flex flex-col gap-2">
            <span className="text-[10px] sm:text-[10.5px] font-mono font-medium tracking-wider uppercase text-neutral-400">
              Aspect Ratio
            </span>
            <div className="grid grid-cols-2 gap-1.5 sm:gap-2">
              {RATIOS.map((r) => {
                const isSelected = selectedRatio === r.id;
                return (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRatio(r.id)}
                    className={`flex items-baseline justify-between rounded-xl border p-2 sm:p-2.5 transition-all cursor-pointer ${
                      isSelected
                        ? 'border-white/30 bg-white/[0.08] text-white font-medium shadow-sm'
                        : 'border-white/[0.06] bg-white/[0.015] text-neutral-500 hover:border-white/15 hover:text-neutral-300'
                    }`}
                  >
                    <span className="text-xs">{r.label}</span>
                    <span className="text-[10px] font-mono text-neutral-500">{r.desc}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Generate / SaaS Pro Upgrade Conversion Bar (Sticky Bottom Resilience) */}
        <div className="pt-4 pb-1 mt-4 sticky bottom-0 bg-[#07080d]/95 backdrop-blur-xl border-t border-white/[0.04] -mx-4 px-4 sm:-mx-6 sm:px-6 shrink-0 flex flex-col gap-2">
          {isLimitReached ? (
            <div className="flex flex-col gap-2 w-full animate-in fade-in duration-200">
              {hasPendingProRequest ? (
                <div 
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-white/[0.03] border border-white/[0.08] text-amber-200/90 text-xs font-mono select-none backdrop-blur-md cursor-default shadow-sm"
                  title="Pro upgrade request registered in Founder Vault"
                >
                  <span className="text-amber-400 text-sm font-semibold">✓</span>
                  <span className="tracking-wide font-medium">Under Review</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenUpgradeModal) onOpenUpgradeModal();
                    else setShowUpgradeModal(true);
                  }}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-amber-200 via-white to-amber-100 text-black font-semibold text-xs sm:text-[13px] tracking-wide shadow-[0_0_25px_rgba(255,255,255,0.18)] hover:shadow-[0_0_35px_rgba(255,255,255,0.25)] active:scale-[0.98] transition-all cursor-pointer"
                >
                  <span>Upgrade to Ubair Pro</span>
                  <span className="text-[11px]">⚡</span>
                </button>
              )}

              <div className="flex items-center justify-between px-1 text-[10px] sm:text-[10.5px] font-mono text-neutral-500 select-none">
                <span>3 / 3 frames used</span>
                <span className="tabular-nums text-neutral-400">Resets in {resetCountdown}</span>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => handleGenerate(undefined, false)}
              disabled={!prompt.trim() || isGenerating}
              className={`flex h-11 sm:h-12 w-full items-center justify-center rounded-2xl text-xs sm:text-sm font-semibold transition-all cursor-pointer ${
                prompt.trim() && !isGenerating
                  ? 'bg-white text-black hover:bg-neutral-100 active:scale-[0.98] shadow-[0_0_25px_rgba(255,255,255,0.2)]'
                  : 'cursor-not-allowed border border-white/[0.06] bg-white/[0.02] text-neutral-600'
              }`}
            >
              {isGenerating ? 'Synthesizing Frame…' : 'Generate Frame →'}
            </button>
          )}
        </div>
      </aside>

      {/* ================= RIGHT VIEWPORT ================= */}
      <main 
        className={`${
          mobileTab === 'viewport' ? 'flex' : 'hidden lg:flex'
        } relative flex-1 flex-col overflow-hidden bg-[#050609] min-w-0`}
      >
        
        {/* Top Minimal Typography HUD & Mobile Back Trigger */}
        <header className="h-12 sm:h-14 px-4 sm:px-8 flex items-center justify-between shrink-0 bg-transparent relative z-10">
          
          {/* Mobile Back Button to switch to Directives */}
          <div className="flex lg:hidden items-center">
            <button
              type="button"
              onClick={() => setMobileTab('controls')}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg border border-white/[0.08] bg-white/[0.03] text-[11px] font-mono text-neutral-400 hover:text-white transition-all active:scale-95"
            >
              <span>←</span>
              <span>Directives</span>
            </button>
          </div>

          <div className="flex items-center gap-2 text-[10px] sm:text-[10.5px] font-mono tracking-widest uppercase ml-auto">
            {effectiveRole === 'admin' ? (
              <span className="text-neutral-400">FOUNDER ACCESS</span>
            ) : effectiveRole === 'pro' ? (
              <span className="text-neutral-300">PRO PLAN • {maxLimit - usedToday} REMAINING</span>
            ) : isLimitReached ? null : (
              <span className="text-neutral-500 font-normal">
                {maxLimit - usedToday} / {maxLimit} FREE FRAMES
              </span>
            )}
          </div>
        </header>

        {/* Floating Status Notification */}
        {statusMessage && (
          <div className="absolute top-14 sm:top-16 left-1/2 z-30 -translate-x-1/2 rounded-full border border-white/10 bg-[#121318]/90 px-4 py-1 text-xs font-mono text-neutral-200 backdrop-blur-md animate-in fade-in shadow-xl whitespace-nowrap">
            {statusMessage}
          </div>
        )}

        {/* Center Stage Canvas Viewport */}
        <div className="relative flex flex-1 items-center justify-center p-3 sm:p-6 lg:p-8 overflow-hidden min-h-0">
          
          {/* STATE 1: GENERATING */}
          {isGenerating ? (
            <div className="flex flex-col items-center gap-4 text-center animate-in fade-in duration-300">
              <div className="h-8 w-8 sm:h-9 sm:w-9 animate-spin rounded-full border-2 border-white/20 border-t-white" />
              <p key={stageIndex} className="font-mono text-xs text-neutral-300 tracking-wide animate-in fade-in px-4">
                {GENERATION_STAGES[stageIndex]}
              </p>
            </div>
          ) : currentImage ? (
            /* STATE 2: RENDERED IMAGE (PROTECTED SHIELD) */
            <div className="relative flex h-full w-full max-w-4xl flex-col items-center justify-center gap-3 animate-in fade-in duration-200">
              
              <div 
                className="relative flex max-h-[58vh] sm:max-h-[66vh] max-w-full items-center justify-center overflow-hidden rounded-2xl border border-white/[0.08] bg-[#08090d] shadow-2xl group"
                onContextMenu={(e) => e.preventDefault()}
              >
                {!isImageLoaded && (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/40">
                    <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/20 border-t-white" />
                  </div>
                )}

                <img
                  src={currentImage.image_url}
                  alt={currentImage.prompt}
                  onLoad={() => setIsImageLoaded(true)}
                  draggable={false}
                  className={`max-h-[58vh] sm:max-h-[66vh] w-auto max-w-full object-contain pointer-events-none transition-opacity duration-300 ${
                    isImageLoaded ? 'opacity-100' : 'opacity-0'
                  }`}
                />

                <div 
                  className="absolute inset-0 z-10 bg-transparent select-none cursor-default"
                  onContextMenu={(e) => e.preventDefault()}
                  draggable={false}
                />
              </div>

              {/* Action Toolbar */}
              <div className="flex w-full max-w-full items-center justify-between px-1 shrink-0 flex-wrap gap-2">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleGenerate(currentImage.prompt, true)}
                    className="rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 sm:px-3.5 py-1.5 text-[11px] sm:text-xs text-neutral-300 hover:text-white hover:border-white/20 transition-all cursor-pointer"
                  >
                    Regenerate
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCurrentImage(null);
                      setPrompt('');
                    }}
                    className="rounded-xl px-2.5 sm:px-3 py-1.5 text-[11px] sm:text-xs font-mono text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer"
                  >
                    Clear Canvas
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => handleExport(currentImage.image_url)}
                  className="rounded-xl bg-white px-3.5 sm:px-5 py-1.5 sm:py-2 text-[11px] sm:text-xs font-semibold text-black hover:bg-neutral-200 transition-all active:scale-95 cursor-pointer shadow-md flex items-center gap-1.5 ml-auto"
                >
                  <span>Download Master HD</span>
                  {(effectiveRole === 'admin' || effectiveRole === 'pro') && (
                    <span className="text-[9.5px] sm:text-[10px] font-mono text-neutral-600 bg-black/10 px-1 rounded">PRO</span>
                  )}
                </button>
              </div>
            </div>
          ) : (
            /* STATE 3: PURE OPTICAL FRAME (VIEWPORT LENS) */
            <div 
              className="relative flex h-full w-full items-center justify-center animate-in fade-in duration-300 p-2 sm:p-4 [perspective:1200px]"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            >
              {(() => {
                const currentOptic = STYLE_OPTICS[selectedStyle] || STYLE_OPTICS['Cinematic'];
                const hasRef = Boolean(refImage);

                return (
                  <div
                    ref={frameRef}
                    style={{ 
                      aspectRatio: `${activeRatioConfig.w} / ${activeRatioConfig.h}`,
                      maxWidth: activeRatioConfig.id === '9:16' ? 'min(90vw, 360px)' : activeRatioConfig.id === '1:1' ? 'min(90vw, 480px)' : 'min(92vw, 760px)',
                      maxHeight: 'min(58vh, 460px)',
                      transform: `rotateX(${tilt.x}deg) rotateY(${tilt.y}deg)`,
                      transition: 'transform 0.18s cubic-bezier(0.2, 0, 0, 1)',
                    }}
                    className="relative flex w-full items-center justify-center rounded-2xl sm:rounded-3xl border border-white/[0.04] bg-white/[0.01] hover:border-white/[0.08] shadow-[0_20px_80px_rgba(0,0,0,0.6)] backdrop-blur-xl overflow-hidden group transition-all duration-500"
                  >
                    <div className={`pointer-events-none absolute inset-0 bg-gradient-to-br ${currentOptic.glow} opacity-60 transition-all duration-700`} />
                    
                    <div 
                      className="pointer-events-none absolute inset-0 transition-opacity duration-300"
                      style={{
                        background: `radial-gradient(circle 320px at ${specular.x}% ${specular.y}%, rgba(255,255,255,${specular.opacity}), transparent 70%)`
                      }}
                    />

                    {/* Rule-of-Thirds Grid */}
                    <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-20">
                      <div className="border-r border-b border-white/[0.06]" />
                      <div className="border-r border-b border-white/[0.06]" />
                      <div className="border-b border-white/[0.06]" />
                      <div className="border-r border-b border-white/[0.06]" />
                      <div className="border-r border-b border-white/[0.06]" />
                      <div className="border-b border-white/[0.06]" />
                      <div className="border-r border-b border-white/[0.06]" />
                      <div className="border-r border-b border-white/[0.06]" />
                      <div />
                    </div>

                    {/* Corner Precision Marks */}
                    <div className="pointer-events-none absolute top-2.5 sm:top-4 left-2.5 sm:left-4 h-3.5 w-3.5 sm:h-4 sm:w-4 border-t-2 border-l-2 border-white/30 rounded-tl-sm" />
                    <div className="pointer-events-none absolute top-2.5 sm:top-4 right-2.5 sm:right-4 h-3.5 w-3.5 sm:h-4 sm:w-4 border-t-2 border-r-2 border-white/30 rounded-tr-sm" />
                    <div className="pointer-events-none absolute bottom-2.5 sm:bottom-4 left-2.5 sm:left-4 h-3.5 w-3.5 sm:h-4 sm:w-4 border-b-2 border-l-2 border-white/30 rounded-bl-sm" />
                    <div className="pointer-events-none absolute bottom-2.5 sm:bottom-4 right-2.5 sm:right-4 h-3.5 w-3.5 sm:h-4 sm:w-4 border-b-2 border-r-2 border-white/30 rounded-br-sm" />

                    {/* Top Telemetry Labels */}
                    <div className="pointer-events-none absolute top-2.5 sm:top-4 inset-x-4 sm:inset-x-6 flex items-center justify-between text-[8.5px] sm:text-[10px] font-mono z-20">
                      <span className={`font-semibold tracking-[0.2em] uppercase ${currentOptic.accent}`}>
                        {currentOptic.tag}
                      </span>
                      <span className="text-neutral-400 tracking-[0.14em] uppercase opacity-75">
                        {currentOptic.profile}
                      </span>
                    </div>

                    {/* Silent Minimal Center Focal Point (Lens Shutter + Dual Tone Wordmark) */}
                    <div className="relative z-10 flex flex-col items-center justify-center text-center px-4 max-w-sm space-y-2.5 sm:space-y-3.5 select-none">
                      <div className="relative flex items-center justify-center">
                        <div className="absolute w-10 sm:w-12 h-10 sm:h-12 rounded-full bg-amber-400/[0.08] blur-xl pointer-events-none" />
                        <svg 
                          width="24" 
                          height="24" 
                          viewBox="0 0 24 24" 
                          fill="none" 
                          stroke="currentColor" 
                          strokeWidth="1.5" 
                          strokeLinecap="round" 
                          strokeLinejoin="round" 
                          className="text-amber-300/80 drop-shadow-[0_0_12px_rgba(251,191,36,0.35)] sm:w-7 sm:h-7"
                        >
                          <circle cx="12" cy="12" r="10" stroke="rgba(255,255,255,0.2)" />
                          <line x1="14.31" y1="8" x2="20.05" y2="17.94" />
                          <line x1="9.69" y1="8" x2="21.17" y2="8" />
                          <line x1="7.38" y1="12" x2="13.12" y2="2.06" />
                          <line x1="9.69" y1="16" x2="3.95" y2="6.06" />
                          <line x1="14.31" y1="16" x2="2.83" y2="16" />
                          <line x1="16.62" y1="12" x2="10.88" y2="21.94" />
                        </svg>
                      </div>

                      <h2 className="text-base sm:text-xl font-light tracking-[0.24em] uppercase drop-shadow-[0_0_25px_rgba(245,158,11,0.2)]">
                        <span className="text-white font-normal">Ubair</span>{' '}
                        <span className="bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-500 bg-clip-text text-transparent font-medium">Studio</span>
                      </h2>
                    </div>

                    {/* Bottom Telemetry */}
                    <div className="pointer-events-none absolute bottom-2.5 sm:bottom-4 inset-x-4 sm:inset-x-6 flex items-center justify-between text-[8.5px] sm:text-[10px] font-mono tracking-wider z-20">
                      {hasRef ? (
                        <div className="flex items-center gap-1.5">
                          <img src={refImage?.dataUrl} alt="Ref" className="h-3 w-3 sm:h-3.5 sm:w-3.5 rounded-full object-cover border border-white/40" />
                          <span className="text-neutral-200 font-semibold tracking-wide text-[9px] sm:text-[10px]">REF ATTACHED</span>
                        </div>
                      ) : (
                        <span className="text-neutral-500 font-mono tracking-widest uppercase">
                          {activeRatioConfig.label} • {activeRatioConfig.desc}
                        </span>
                      )}

                      <span className="text-neutral-300 font-semibold tracking-widest">
                        {activeRatioConfig.w} × {activeRatioConfig.h} PX
                      </span>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* ================= CLAUDE-GRADE CLARIFICATION DECK ================= */}
          {clarification.active && (
            <div className="absolute inset-x-3 sm:inset-x-4 bottom-3 sm:bottom-6 z-40 mx-auto flex w-full max-w-[540px] max-h-[75vh] flex-col gap-3 rounded-2xl sm:rounded-3xl border border-white/[0.1] bg-[#0c0d12]/95 p-4 sm:p-5 shadow-[0_24px_80px_rgba(0,0,0,0.85)] backdrop-blur-2xl animate-in fade-in zoom-in-95 duration-150 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              
              <div className="flex items-start justify-between gap-3 border-b border-white/[0.06] pb-2.5 sm:pb-3">
                <div className="pr-2">
                  {clarification.observation && (
                    <p className="text-xs sm:text-[13px] text-neutral-200 font-sans leading-relaxed font-normal">
                      {clarification.observation}
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => handleGenerate(clarification.raw_prompt, true)}
                  className="shrink-0 text-[10.5px] font-mono text-neutral-400 hover:text-white px-2.5 py-1 rounded-lg border border-white/[0.08] hover:border-white/20 bg-white/[0.02] hover:bg-white/[0.06] transition-all cursor-pointer active:scale-95"
                >
                  Original
                </button>
              </div>

              <div className="flex flex-col gap-2">
                {clarification.options.map((opt, idx) => (
                  <button
                    key={opt.id || idx}
                    type="button"
                    onClick={() => {
                      setPrompt(opt.prompt);
                      handleGenerate(opt.prompt, true);
                    }}
                    className="group relative flex items-start gap-2.5 sm:gap-3 rounded-xl border border-white/[0.07] bg-white/[0.02] hover:bg-white/[0.06] hover:border-white/25 p-2.5 sm:p-3 text-left transition-all duration-150 active:scale-[0.99] cursor-pointer"
                  >
                    <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border border-white/10 bg-white/[0.04] font-mono text-[10.5px] font-semibold text-neutral-400 group-hover:bg-white group-hover:text-black group-hover:border-white transition-all">
                      {idx + 1}
                    </span>
                    <div className="flex flex-1 flex-col overflow-hidden">
                      <span className="text-xs sm:text-[12.5px] font-semibold text-white tracking-wide group-hover:text-neutral-100 transition-colors">
                        {opt.label || `Option ${idx + 1}`}
                      </span>
                      <span className="text-[10.5px] sm:text-[11px] text-neutral-400 mt-0.5 leading-relaxed line-clamp-2">
                        {opt.prompt}
                      </span>
                    </div>
                  </button>
                ))}
              </div>

              <div className="flex items-center justify-end pt-0.5 text-[10.5px] font-mono text-neutral-400">
                <button
                  type="button"
                  onClick={() => setClarification({ active: false, raw_prompt: '', observation: '', options: [] })}
                  className="hover:text-neutral-200 transition-colors cursor-pointer"
                >
                  Cancel (Esc)
                </button>
              </div>
            </div>
          )}
        </div>

        {/* History Filmstrip */}
        {history.length > 0 && !isGenerating && (
          <div className="flex gap-2 overflow-x-auto border-t border-white/[0.06] bg-[#050608]/90 px-4 sm:px-6 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden shrink-0 z-10">
            {history.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  setCurrentImage(item);
                  setPrompt(item.prompt);
                }}
                className={`h-9 w-14 sm:h-10 sm:w-16 shrink-0 overflow-hidden rounded-xl border transition-all cursor-pointer ${
                  currentImage?.id === item.id 
                    ? 'border-white opacity-100 scale-105 shadow-sm' 
                    : 'border-white/[0.08] opacity-50 hover:opacity-85'
                }`}
              >
                <img 
                  src={item.image_url} 
                  alt="History" 
                  className="h-full w-full object-cover pointer-events-none" 
                  draggable={false}
                />
              </button>
            ))}
          </div>
        )}
      </main>

      {/* ================= SAAS PRO UPGRADE MODAL ================= */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 sm:p-6 backdrop-blur-xl animate-in fade-in"
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0b10] p-5 sm:p-7 space-y-5 shadow-[0_20px_70px_rgba(0,0,0,0.9)] max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
              <div className="space-y-0.5">
                <span className="text-[10px] sm:text-[10.5px] font-mono uppercase tracking-widest text-amber-400/80 font-medium">
                  Studio Quota
                </span>
                <h4 className="text-sm sm:text-base font-semibold text-white tracking-tight">
                  Generation Window Reached
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="text-xs font-mono text-neutral-500 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-neutral-300 leading-relaxed font-sans">
              You have utilized your 3 free generation frames for this window. Quota resets in {resetCountdown}. Request Pro access to bypass limitations.
            </p>

            <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5 text-xs font-sans">
              <div className="flex items-center gap-2.5 text-neutral-200">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>50 High-Resolution Generations Per Day</span>
              </div>
              <div className="flex items-center gap-2.5 text-neutral-200">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>100% Raw Unbranded Lossless Master HD Exports</span>
              </div>
              <div className="flex items-center gap-2.5 text-neutral-200">
                <span className="text-emerald-400 font-bold">✓</span>
                <span>Priority Dedicated GPU Latent Pipeline</span>
              </div>
            </div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={async () => {
                  setShowUpgradeModal(false);
                  const emailToRequest = resolveUserEmail();
                  try {
                    await fetch(`${API_BASE}/api/user/upgrade-request`, {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({
                        user_email: emailToRequest,
                        email: emailToRequest,
                        tier: 'pro'
                      })
                    });
                    showStatus('Pro access request logged to Founder • Reviewing workspace');
                  } catch {
                    showStatus('Pro request noted • Founder notified');
                  }
                }}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-200 via-white to-amber-100 py-2.5 sm:py-3 text-xs font-semibold text-black hover:opacity-90 transition-all active:scale-95 cursor-pointer shadow-lg"
              >
                Request Pro Access · Free Early Access
              </button>

              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-1.5 text-xs font-mono text-neutral-500 hover:text-neutral-300 transition-colors cursor-pointer text-center"
              >
                Continue on Free Plan (Resets in {resetCountdown})
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}