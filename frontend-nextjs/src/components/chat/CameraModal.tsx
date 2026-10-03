'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import Image from 'next/image';

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCapture: (file: File) => void;
}

export default function CameraModal({ isOpen, onClose, onCapture }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isMountedRef = useRef<boolean>(false);

  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [capturedBlob, setCapturedBlob] = useState<Blob | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [facingMode, setFacingMode] = useState<'user' | 'environment'>('user');

  // Stop video stream hardware safely & release DOM sources
  const stopStream = useCallback(() => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.stop();
      });
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
  }, []);

  // Safe Close
  const handleClose = useCallback(() => {
    stopStream();
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }
    setCapturedImage(null);
    setCapturedBlob(null);
    setErrorMsg(null);
    onClose();
  }, [stopStream, capturedImage, onClose]);

  // Start Hardware Camera Stream with Race-Condition Guard
  const startCamera = useCallback(async (mode: 'user' | 'environment' = facingMode) => {
    setIsLoading(true);
    setErrorMsg(null);
    setCapturedImage(null);
    setCapturedBlob(null);

    try {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        throw new Error('Camera interface is unsupported on this browser or environment.');
      }

      // Stop previous stream if switching camera
      stopStream();

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1920 },
          height: { ideal: 1080 },
          facingMode: mode,
        },
        audio: false,
      });

      // Race-Condition Guard: If user closed modal while awaiting permission, immediately kill hardware stream
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        try {
          await videoRef.current.play();
        } catch {
          // Playback gracefully handled if unmounted
        }
      }
    } catch (err: any) {
      if (!isMountedRef.current) return;
      console.error('Camera initialization error:', err);
      if (err.name === 'NotAllowedError' || err.name === 'PermissionDeniedError') {
        setErrorMsg('Camera access denied. Please allow camera permissions in your browser settings.');
      } else if (err.name === 'NotFoundError' || err.name === 'DevicesNotFoundError') {
        setErrorMsg('No camera hardware detected on this system.');
      } else {
        setErrorMsg(err.message || 'Unable to access neural camera interface.');
      }
    } finally {
      if (isMountedRef.current) {
        setIsLoading(false);
      }
    }
  }, [facingMode, stopStream]);

  useEffect(() => {
    isMountedRef.current = isOpen;

    if (isOpen) {
      startCamera();
    } else {
      stopStream();
    }

    return () => {
      isMountedRef.current = false;
      stopStream();
    };
  }, [isOpen, startCamera, stopStream]);

  // Esc key listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleClose]);

  // Capture Frame to Canvas using native Blob
  const takeSnapshot = () => {
    if (!videoRef.current) return;

    const video = videoRef.current;
    const canvas = canvasRef.current || document.createElement('canvas');
    canvas.width = video.videoWidth || 1280;
    canvas.height = video.videoHeight || 720;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Draw current video frame
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(
      (blob) => {
        if (!blob) return;
        const objectUrl = URL.createObjectURL(blob);
        setCapturedBlob(blob);
        setCapturedImage(objectUrl);
        stopStream();
      },
      'image/jpeg',
      0.92
    );
  };

  // Submit captured File
  const confirmCapture = () => {
    if (!capturedBlob) return;

    const file = new File([capturedBlob], `snap_${Date.now()}.jpg`, { type: 'image/jpeg' });
    onCapture(file);
    handleClose();
  };

  const retakePhoto = () => {
    if (capturedImage) {
      URL.revokeObjectURL(capturedImage);
    }
    setCapturedImage(null);
    setCapturedBlob(null);
    startCamera();
  };

  const toggleCameraFacing = () => {
    const nextMode = facingMode === 'user' ? 'environment' : 'user';
    setFacingMode(nextMode);
    startCamera(nextMode);
  };

  if (!isOpen) return null;

  return (
    <div 
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-xl flex items-center justify-center p-4 animate-in fade-in duration-150 font-sans select-none"
      onClick={handleClose}
    >
      <div 
        className="w-full max-w-[560px] bg-[#0c0d10] border border-white/[0.12] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Top Header */}
        <div className="flex items-center justify-between pb-3 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div className="relative w-6 h-6 flex items-center justify-center shrink-0">
              <img 
                src="/assets/ubair-logo.png" 
                alt="Ubair Logo" 
                className="w-full h-full object-contain scale-[1.8] select-none pointer-events-none drop-shadow-[0_0_10px_rgba(6,182,212,0.6)]" 
              />
            </div>
            <span className="text-[13px] font-medium text-neutral-200 tracking-wide font-sans">
              Ubair Vision Capture
            </span>
          </div>

          <div className="flex items-center gap-2">
            {!capturedImage && !errorMsg && !isLoading && (
              <button
                type="button"
                onClick={toggleCameraFacing}
                className="px-2.5 py-1 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] text-[11px] font-mono text-neutral-400 hover:text-white transition-colors"
                title="Switch Camera (Front/Rear)"
              >
                {facingMode === 'user' ? 'Front' : 'Rear'}
              </button>
            )}

            <button
              type="button"
              onClick={handleClose}
              className="text-neutral-500 hover:text-white text-xs font-mono px-2 py-1 rounded-md hover:bg-white/[0.06] transition-colors"
            >
              Esc
            </button>
          </div>
        </div>

        {/* Viewfinder Display Area */}
        <div className="relative aspect-video w-full rounded-2xl overflow-hidden bg-black border border-white/[0.08] flex items-center justify-center">
          {isLoading && !errorMsg && (
            <div className="flex flex-col items-center gap-2.5">
              <div className="w-6 h-6 border-2 border-white/20 border-t-cyan-400 rounded-full animate-spin" />
              <span className="text-[11px] font-mono text-neutral-400">Initializing camera feed...</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-6 text-center space-y-2">
              <div className="w-8 h-8 rounded-full bg-rose-500/10 border border-rose-500/20 text-rose-400 flex items-center justify-center mx-auto text-sm font-semibold">
                !
              </div>
              <p className="text-xs text-neutral-300 max-w-[320px] leading-relaxed mx-auto">{errorMsg}</p>
            </div>
          )}

          {/* Live Video Feed */}
          <video
            ref={videoRef}
            autoPlay
            playsInline
            muted
            className={`w-full h-full object-cover ${capturedImage || errorMsg || isLoading ? 'hidden' : 'block'}`}
          />

          {/* Frozen Preview After Capture */}
          {capturedImage && (
            <img 
              src={capturedImage} 
              alt="Captured Snapshot" 
              className="w-full h-full object-cover animate-in fade-in duration-100" 
            />
          )}

          {/* HUD Reticle Corners */}
          {!capturedImage && !errorMsg && !isLoading && (
            <div className="absolute inset-4 pointer-events-none flex flex-col justify-between">
              <div className="flex justify-between">
                <div className="w-3 h-3 border-t-2 border-l-2 border-cyan-400/60 rounded-tl-sm" />
                <div className="w-3 h-3 border-t-2 border-r-2 border-cyan-400/60 rounded-tr-sm" />
              </div>
              <div className="flex justify-between">
                <div className="w-3 h-3 border-b-2 border-l-2 border-cyan-400/60 rounded-bl-sm" />
                <div className="w-3 h-3 border-b-2 border-r-2 border-cyan-400/60 rounded-br-sm" />
              </div>
            </div>
          )}

          <canvas ref={canvasRef} className="hidden" />
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-1">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs text-neutral-400 hover:text-white rounded-xl transition-colors"
          >
            Cancel
          </button>

          {!capturedImage ? (
            <button
              type="button"
              onClick={takeSnapshot}
              disabled={isLoading || !!errorMsg}
              className="px-5 py-2.5 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all shadow-md active:scale-95 disabled:opacity-40 flex items-center gap-2"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                <circle cx="12" cy="13" r="4" />
              </svg>
              <span>Capture Photo</span>
            </button>
          ) : (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={retakePhoto}
                className="px-4 py-2 text-xs text-neutral-300 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 rounded-xl transition-all active:scale-95"
              >
                Retake
              </button>
              <button
                type="button"
                onClick={confirmCapture}
                className="px-5 py-2 text-xs font-semibold bg-cyan-400 text-black hover:bg-cyan-300 rounded-xl transition-all shadow-[0_0_15px_rgba(6,182,212,0.4)] active:scale-95"
              >
                Attach Photo
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}