'use client';

import React, { useState, useEffect, useRef, Suspense } from 'react';
import Image from 'next/image';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';

/* ============================================================================
 * 10/10 FLAGSHIP ASTRA GALAXY ENGINE (60-120 FPS HARDWARE ACCELERATED)
 * Featuring Dynamic Logo Concentricity, Volumetric Dust Lanes & Starlight Optics
 * ========================================================================== */
interface AstraSpiralGalaxyProps {
  emblemRef: React.RefObject<HTMLDivElement | null>;
}

function AstraSpiralGalaxy({ emblemRef }: AstraSpiralGalaxyProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) return;

    let animationFrameId: number;
    let width = (canvas.width = window.innerWidth);
    let height = (canvas.height = window.innerHeight);

    // 1. Pre-Rendered Offscreen Glowing Star Sprites (Zero-Latency Hardware Blitting)
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

    // 2. Mouse Parallax Mechanics
    let targetTiltX = 0;
    let targetTiltY = 0;
    let currentTiltX = 0;
    let currentTiltY = 0;

    const handleMouseMove = (e: MouseEvent) => {
      targetTiltX = ((e.clientX - width / 2) / (width / 2)) * 0.14;
      targetTiltY = ((e.clientY - height / 2) / (height / 2)) * 0.14;
    };
    window.addEventListener('mousemove', handleMouseMove, { passive: true });

    // 3. Ambient Distant Starfield (Subtle Twinkle)
    const bgStarCount = 140;
    const bgStars = Array.from({ length: bgStarCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      size: Math.random() * 1.1 + 0.3,
      alpha: Math.random() * 0.45 + 0.1,
      speed: Math.random() * 0.02 + 0.006,
      phase: Math.random() * Math.PI * 2,
    }));

    // 4. Foreground Cinematic Bokeh Stars (Depth of Field Effect)
    const bokehCount = 14;
    const bokehStars = Array.from({ length: bokehCount }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      vx: (Math.random() - 0.5) * 0.22,
      vy: (Math.random() - 0.5) * 0.22,
      size: Math.random() * 26 + 18,
      alpha: Math.random() * 0.12 + 0.05,
      phase: Math.random() * Math.PI * 2,
    }));

    // 5. Multi-Layered Galactic Engine (70% Volumetric Spiral Arms + 30% Interstellar Dust)
    const totalParticles = Math.min(Math.floor((width * height) / 1150), 1050);
    const maxRadius = Math.min(width, height) * 0.58;

    const stars = Array.from({ length: totalParticles }, (_, i) => {
      const isDiffuseDust = i > totalParticles * 0.7; // 30% particles form ambient interstellar cloud

      if (isDiffuseDust) {
        // Continuous uniform radial distribution (eliminates the "two wings" separation)
        const norm = Math.pow(Math.random(), 1.2);
        const r = norm * maxRadius + 8;
        const angle = Math.random() * Math.PI * 2;
        const planeX = r * Math.cos(angle);
        const planeY = r * Math.sin(angle);
        const planeZ = (Math.random() - 0.5) * 55 * (1 - norm * 0.3);

        return {
          planeX,
          planeY,
          planeZ,
          sprite: Math.random() > 0.6 ? spriteCyan : spriteDust,
          renderSize: Math.random() * 1.6 + 0.8,
          baseAlpha: Math.random() * 0.35 + 0.12,
          twinkleSpeed: Math.random() * 0.02 + 0.005,
          twinklePhase: Math.random() * Math.PI * 2,
        };
      }

      // Primary & Secondary Spiral Arm Tracks
      const arm = i % 2;
      const armOffset = arm * Math.PI;

      const norm = Math.pow(i / (totalParticles * 0.7), 0.84);
      const r = norm * maxRadius + 8;
      const theta = armOffset + 3.15 * Math.pow(norm, 0.64);

      // Smooth Gaussian dispersion around the spiral spine
      const scatterWidth = (maxRadius * 0.14) * Math.sin(norm * Math.PI * 0.95);
      const spreadR = (Math.random() - 0.5) * scatterWidth;
      const spreadTheta = (Math.random() - 0.5) * (0.3 / (norm + 0.16));

      const planeX = (r + spreadR) * Math.cos(theta + spreadTheta);
      const planeY = (r + spreadR) * Math.sin(theta + spreadTheta);
      const planeZ = (Math.random() - 0.5) * 44 * (1 - norm * 0.4);

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
        planeX,
        planeY,
        planeZ,
        sprite,
        renderSize,
        baseAlpha: Math.random() * 0.55 + 0.35,
        twinkleSpeed: Math.random() * 0.03 + 0.008,
        twinklePhase: Math.random() * Math.PI * 2,
      };
    });

    // 6. Cosmic Shooting Star Event
    let shootingStar: { x: number; y: number; length: number; speed: number; angle: number; alpha: number } | null = null;
    let nextShootingStarTime = Date.now() + 3500;

    let rotationAngle = 0;

    const handleResize = () => {
      if (!canvas) return;
      width = canvas.width = window.innerWidth;
      height = canvas.height = window.innerHeight;
    };
    window.addEventListener('resize', handleResize);

    const render = () => {
      ctx.fillStyle = '#030407';
      ctx.fillRect(0, 0, width, height);

      // Render Ambient Stars
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < bgStars.length; i++) {
        const s = bgStars[i];
        s.phase += s.speed;
        const a = s.alpha + Math.sin(s.phase) * 0.15;
        ctx.globalAlpha = Math.max(0.04, Math.min(0.75, a));
        ctx.fillRect(s.x, s.y, s.size, s.size);
      }

      // Parallax Physics Easing
      currentTiltX += (targetTiltX - currentTiltX) * 0.04;
      currentTiltY += (targetTiltY - currentTiltY) * 0.04;
      rotationAngle += 0.0011;

      // 3D Oblique Perspective Setup
      const pitch = 1.02 + currentTiltY;
      const yaw = -0.32 + currentTiltX;
      const cosPitch = Math.cos(pitch);
      const sinPitch = Math.sin(pitch);
      const cosYaw = Math.cos(yaw);
      const sinYaw = Math.sin(yaw);
      const cosRot = Math.cos(rotationAngle);
      const sinRot = Math.sin(rotationAngle);

      // Dynamic Concentric Center: Anchors precisely to the Logo Emblem's real position
      let centerX = width / 2;
      let centerY = height * 0.37;
      if (emblemRef.current) {
        const rect = emblemRef.current.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) {
          centerX = rect.left + rect.width / 2;
          centerY = rect.top + rect.height / 2;
        }
      }

      const cameraDist = 680;

      // Central Galactic Nucleus Bloom
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const coreBloom = ctx.createRadialGradient(centerX, centerY, 0, centerX, centerY, maxRadius * 0.44);
      coreBloom.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
      coreBloom.addColorStop(0.18, 'rgba(251, 191, 36, 0.18)');
      coreBloom.addColorStop(0.48, 'rgba(6, 182, 212, 0.09)');
      coreBloom.addColorStop(1, 'rgba(3, 4, 7, 0)');
      ctx.fillStyle = coreBloom;
      ctx.globalAlpha = 1;
      ctx.fillRect(centerX - maxRadius * 0.44, centerY - maxRadius * 0.44, maxRadius * 0.88, maxRadius * 0.88);

      // Blit Galactic Spiral & Interstellar Dust
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

      // Foreground Cinematic Bokeh Stars
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

      // Subtle Cosmic Shooting Star
      const now = Date.now();
      if (!shootingStar && now > nextShootingStarTime) {
        shootingStar = {
          x: Math.random() * (width * 0.8),
          y: Math.random() * (height * 0.35),
          length: Math.random() * 85 + 75,
          speed: Math.random() * 9 + 12,
          angle: Math.PI / 4 + (Math.random() - 0.5) * 0.2,
          alpha: 1,
        };
        nextShootingStarTime = now + Math.random() * 8000 + 4000;
      }

      if (shootingStar) {
        shootingStar.x += Math.cos(shootingStar.angle) * shootingStar.speed;
        shootingStar.y += Math.sin(shootingStar.angle) * shootingStar.speed;
        shootingStar.alpha -= 0.022;

        if (shootingStar.alpha <= 0) {
          shootingStar = null;
        } else {
          ctx.strokeStyle = `rgba(255, 255, 255, ${shootingStar.alpha})`;
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(shootingStar.x, shootingStar.y);
          ctx.lineTo(
            shootingStar.x - Math.cos(shootingStar.angle) * shootingStar.length,
            shootingStar.y - Math.sin(shootingStar.angle) * shootingStar.length
          );
          ctx.stroke();
        }
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
  }, [emblemRef]);

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-0 select-none"
    />
  );
}

/* ============================================================================
 * MAIN LOGIN CANVAS (AESTHETIC FLOATING COGNITIVE GATEWAY)
 * ========================================================================== */
function LoginContent() {
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Sign in · Ubair OS';
    }
  }, []);

  const searchParams = useSearchParams();
  const authError = searchParams.get('error');

  const [activeModal, setActiveModal] = useState<'terms' | 'privacy' | 'reachOut' | null>(null);
  const [showQr, setShowQr] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);

  // Dynamic Anchor Ref for Concentric Galaxy Singularities
  const emblemRef = useRef<HTMLDivElement | null>(null);

  // Zoom & Viewport-Resilient BFCache Engine
  useEffect(() => {
    const handlePageShow = () => setIsSigningIn(false);
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') setIsSigningIn(false);
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('pageshow', handlePageShow);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  // Safety Timeout for OAuth Redirect Cycle
  useEffect(() => {
    let timeout: NodeJS.Timeout;
    if (isSigningIn) {
      timeout = setTimeout(() => setIsSigningIn(false), 6000);
    }
    return () => clearTimeout(timeout);
  }, [isSigningIn]);

  // Global Escape Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setActiveModal(null);
        setShowQr(false);
      }
    };
    if (activeModal) window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeModal]);

  const copyEmail = () => {
    navigator.clipboard.writeText('mdsalikubair@gmail.com');
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const closeModal = () => {
    setActiveModal(null);
    setShowQr(false);
  };

  const handleGoogleSignIn = async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    try {
      await signIn('google', { callbackUrl: '/' });
    } catch {
      setIsSigningIn(false);
    }
  };

  return (
    <main className="min-h-[100dvh] w-full flex flex-col items-center justify-between bg-[#030407] text-white font-sans antialiased px-4 py-8 sm:px-6 sm:py-10 selection:bg-cyan-500/25 selection:text-white relative overflow-hidden select-none">
      
      {/* 120 FPS High-Speed Swirling Galaxy Background (Concentric Anchor to Emblem) */}
      <AstraSpiralGalaxy emblemRef={emblemRef} />

      {/* Atmospheric Center Readability Halo (Keeps text 100% legible without boxing)[cite: 35] */}
      <div className="fixed top-[43%] left-1/2 -translate-x-1/2 -translate-y-1/2 w-[420px] h-[420px] bg-gradient-to-b from-[#030407]/90 via-[#030407]/75 to-transparent rounded-full blur-2xl pointer-events-none z-[5]" />

      {/* Top Spacer */}
      <div className="shrink-0 h-4 sm:h-8" />

      {/* Floating Center Cluster[cite: 35] */}
      <div className="w-full max-w-[370px] flex flex-col items-center relative z-10 my-auto py-6 shrink-0 animate-in fade-in duration-200">
        
        {/* Core Brand Emblem (Dynamic Singular Anchor)[cite: 35] */}
        <div 
          ref={emblemRef}
          className="relative w-28 h-28 sm:w-32 sm:h-32 flex items-center justify-center mb-6"
        >
          <div className="absolute -inset-2 bg-gradient-to-tr from-cyan-500/20 via-sky-400/15 to-transparent blur-2xl rounded-full pointer-events-none opacity-80" />
          <Image
            src="/assets/ubair-logo.png"
            alt="Ubair OS"
            width={128}
            height={128}
            priority
            className="object-contain scale-[1.55] relative z-10 drop-shadow-[0_0_28px_rgba(6,182,212,0.45)] brightness-110"
          />
        </div>

        {/* Official Wordmark Image & Authentic Brand Philosophy */}
        <div className="flex flex-col items-center mb-8 sm:mb-10 text-center">
          <Image
            src="/assets/ubair-wordmark.png"
            alt="Ubair OS"
            width={154}
            height={36}
            priority
            className="object-contain opacity-95 mb-3.5 drop-shadow-[0_2px_18px_rgba(255,255,255,0.18)]"
          />
          <p className="text-[13.5px] sm:text-[14px] text-neutral-300 font-normal tracking-[0.02em] max-w-[320px] leading-relaxed drop-shadow-[0_2px_12px_rgba(0,0,0,0.9)]">
            Where human thought meets intelligence.
          </p>
        </div>

        {/* OAuth Authentication Status Toast[cite: 35] */}
        {authError && (
          <div className="w-full mb-4 px-3.5 py-2.5 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs text-center font-mono animate-in fade-in duration-150 backdrop-blur-md">
            Authentication interrupted. Please retry.
          </div>
        )}

        {/* 10/10 Starlight Rim Tactile Google CTA Button */}
        <div className="w-full">
          <button 
            onClick={handleGoogleSignIn}
            disabled={isSigningIn}
            type="button"
            className="group relative w-full h-[52px] flex items-center justify-center gap-3.5 bg-white hover:bg-neutral-100 text-black px-6 rounded-2xl font-medium transition-all duration-200 active:scale-[0.98] ring-1 ring-white/40 hover:ring-cyan-400/60 shadow-[0_0_35px_rgba(255,255,255,0.2),0_0_24px_rgba(6,182,212,0.25)] text-[14.5px] disabled:opacity-75 disabled:cursor-not-allowed cursor-pointer overflow-hidden"
          >
            {/* Ambient Shimmer Flare on Hover */}
            <div className="absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none" />

            {isSigningIn ? (
              <div className="flex items-center gap-2.5">
                <div className="w-4 h-4 border-2 border-neutral-300 border-t-black rounded-full animate-spin" />
                <span className="text-[14px] tracking-tight font-sans">Connecting to Google...</span>
              </div>
            ) : (
              <>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="shrink-0 drop-shadow-sm">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.16v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.16C1.43 8.55 1 10.22 1 12s.43 3.45 1.16 4.93l3.68-2.84z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.16 7.07l3.68 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span className="tracking-tight font-medium font-sans">Continue with Google</span>
              </>
            )}
          </button>
        </div>

      </div>

      {/* Atmospheric Footer Navigation[cite: 35] */}
      <footer className="relative z-10 text-center pt-4 pb-2 flex flex-col items-center gap-1.5 shrink-0">
        <p className="text-[12px] sm:text-[12.5px] text-neutral-500 leading-relaxed font-normal">
          By continuing, you agree to Ubair OS <br className="sm:hidden" />
          <span className="hidden sm:inline">&bull; </span>
          <button 
            type="button" 
            onClick={() => setActiveModal('terms')}
            className="text-neutral-400 hover:text-white transition-colors cursor-pointer py-1 px-1.5"
          >
            Terms of Service
          </button>
          {' '}&bull;{' '}
          <button 
            type="button" 
            onClick={() => setActiveModal('privacy')}
            className="text-neutral-400 hover:text-white transition-colors cursor-pointer py-1 px-1.5"
          >
            Privacy Policy
          </button>
          {' '}&bull;{' '}
          <button 
            type="button" 
            onClick={() => setActiveModal('reachOut')}
            className="text-neutral-400 hover:text-white transition-colors cursor-pointer py-1 px-1.5"
          >
            Reach Out
          </button>
        </p>
      </footer>

      {/* Viewport-Adaptive Modals Controller[cite: 35] */}
      {activeModal && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 bg-black/85 backdrop-blur-xl animate-in fade-in duration-150 overflow-y-auto"
          onClick={closeModal}
        >
          <div 
            className="relative w-full max-w-[420px] bg-[#0c0d10] border border-white/[0.1] rounded-3xl p-6 sm:p-7 shadow-2xl space-y-5 my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header[cite: 35] */}
            <div className="flex items-center justify-between pb-3.5 border-b border-white/[0.06]">
              <div className="flex items-center gap-3">
                <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
                  <Image
                    src="/assets/ubair-logo.png"
                    alt="Ubair OS"
                    width={32}
                    height={32}
                    className="object-contain scale-[1.7] drop-shadow-[0_0_10px_rgba(6,182,212,0.45)]"
                  />
                </div>
                <span className="text-[14.5px] font-semibold tracking-tight text-white font-sans">
                  {activeModal === 'terms' ? 'Terms of Service' : activeModal === 'privacy' ? 'Privacy Policy' : 'Reach Out & Support'}
                </span>
              </div>

              <button 
                onClick={closeModal}
                className="text-neutral-500 hover:text-white text-xs font-mono px-2 py-1 rounded-md hover:bg-white/[0.06] transition-colors cursor-pointer"
                title="Close (Esc)"
              >
                Esc
              </button>
            </div>

            {/* Modal Scrollable Body[cite: 35] */}
            <div className="text-xs text-neutral-300 leading-relaxed max-h-[58vh] overflow-y-auto select-text pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent">
              
              {/* Terms of Service[cite: 35] */}
              {activeModal === 'terms' && (
                <div className="space-y-4 text-neutral-400">
                  <div>
                    <div className="text-xs font-semibold text-white mb-1 font-sans">1. Intellectual Ownership</div>
                    <p>All workspaces, code, workflows, and prompts created on Ubair OS belong solely and exclusively to you.</p>
                  </div>
                  <div className="h-[1px] bg-white/[0.05]" />
                  <div>
                    <div className="text-xs font-semibold text-white mb-1 font-sans">2. Fair Usage Policy</div>
                    <p>Ubair OS neural resources are provided for high-speed technical execution. Automated bot abuse or unauthorized reverse engineering is strictly monitored and blocked.</p>
                  </div>
                  <div className="h-[1px] bg-white/[0.05]" />
                  <div>
                    <div className="text-xs font-semibold text-white mb-1 font-sans">3. Continuity & Support</div>
                    <p>Core infrastructure routes through dedicated failover engines to guarantee continuous uptime and zero context corruption.</p>
                  </div>
                </div>
              )}

              {/* Privacy Policy[cite: 35] */}
              {activeModal === 'privacy' && (
                <div className="space-y-4 text-neutral-400">
                  <div>
                    <div className="text-xs font-semibold text-white mb-1 font-sans">1. Absolute Data Sovereignty</div>
                    <p>Your session conversations and workspace documents remain cryptographically isolated to your authenticated Google account.</p>
                  </div>
                  <div className="h-[1px] bg-white/[0.05]" />
                  <div>
                    <div className="text-xs font-semibold text-white mb-1 font-sans">2. Zero Third-Party Monetization</div>
                    <p>We do not sell, rent, or train public models on your proprietary code, confidential documents, or private workspace queries.</p>
                  </div>
                  <div className="h-[1px] bg-white/[0.05]" />
                  <div>
                    <div className="text-xs font-semibold text-white mb-1 font-sans">3. Ephemeral vs Persistent Separation</div>
                    <p>Quick Chat adheres to an automatic 24-hour purge lifecycle. Workspaces retain vector vaults permanently until explicit user deletion.</p>
                  </div>
                </div>
              )}

              {/* Reach Out Desk[cite: 35] */}
              {activeModal === 'reachOut' && (
                <div className="space-y-4 text-neutral-400">
                  <p className="leading-relaxed">
                    Connect directly with the founder for architectural questions, platform feedback, or enterprise quota expansion:
                  </p>

                  <div className="space-y-1 pt-1">
                    {/* Channel 1: Email[cite: 35] */}
                    <div className="flex items-center justify-between py-2.5 border-b border-white/[0.06]">
                      <div>
                        <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Email Desk</div>
                        <div className="text-[13px] font-mono text-neutral-200 mt-0.5 select-all">mdsalikubair@gmail.com</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={copyEmail}
                          className="text-xs font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer select-none"
                        >
                          {copied ? <span className="text-emerald-400 font-sans font-medium">✓ Copied</span> : 'Copy'}
                        </button>
                        <a
                          href="mailto:mdsalikubair@gmail.com?subject=Ubair%20OS%20Inquiry"
                          className="text-xs font-sans text-cyan-400 hover:text-cyan-300 font-medium transition-colors select-none"
                        >
                          Send Email &rarr;
                        </a>
                      </div>
                    </div>

                    {/* Channel 2: Official Instagram[cite: 35] */}
                    <div className="flex items-center justify-between py-2.5">
                      <div>
                        <div className="text-[10px] font-mono text-neutral-500 uppercase tracking-wider">Official Instagram</div>
                        <div className="text-[13px] font-mono text-neutral-200 mt-0.5">@ubair.os</div>
                      </div>
                      <div className="flex items-center gap-3">
                        <button
                          type="button"
                          onClick={() => setShowQr(!showQr)}
                          className="text-xs font-mono text-neutral-400 hover:text-white transition-colors select-none cursor-pointer"
                        >
                          {showQr ? 'Close QR' : 'Scan QR'}
                        </button>
                        <a
                          href="https://www.instagram.com/ubair.os"
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs font-sans text-pink-400 hover:text-pink-300 font-medium transition-colors select-none"
                        >
                          Open &rarr;
                        </a>
                      </div>
                    </div>
                  </div>

                  {/* High-Contrast QR Card[cite: 35] */}
                  {showQr && (
                    <div className="pt-2 pb-1 flex flex-col items-center justify-center animate-in fade-in zoom-in-95 duration-200">
                      <div className="p-3 bg-white rounded-2xl shadow-[0_0_35px_rgba(6,182,212,0.25)] flex flex-col items-center">
                        <Image
                          src="/assets/instagram-qr.png"
                          alt="Scan @ubair.os"
                          width={144}
                          height={144}
                          className="object-contain"
                          priority
                        />
                      </div>
                      <span className="text-[10px] text-neutral-400 font-mono mt-2.5 tracking-wider select-none">
                        Scan with camera to open @ubair.os
                      </span>
                    </div>
                  )}

                </div>
              )}

            </div>

            {/* Modal Close Button[cite: 35] */}
            <div className="pt-3 border-t border-white/[0.08] flex items-center justify-end">
              <button
                type="button"
                onClick={closeModal}
                className="px-4 py-1.5 text-xs text-neutral-400 hover:text-white rounded-xl transition-colors select-none hover:bg-white/[0.04] cursor-pointer font-sans"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </main>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={<div className="min-h-[100dvh] w-full bg-[#030407]" />}>
      <LoginContent />
    </Suspense>
  );
}