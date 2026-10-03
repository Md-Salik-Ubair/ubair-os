'use client';

import React, { useState, useRef, useEffect, useCallback } from 'react';
import CameraModal from './CameraModal';

interface ChatInputProps {
  onSendMessage?: (message: string, files: File[], engineMode?: 'fast' | 'forge') => void;
  disabled?: boolean;
  maxFiles?: number;
  maxFileSizeMb?: number;
  hasMessages?: boolean;
  forgeStatus?: {
    used: number;
    max: number;
    is_available: boolean;
    reset_in: string;
  } | null;
}

const SUPPORTED_EXTENSIONS = new Set([
  // Images (Multimodal Vision)
  'png', 'jpg', 'jpeg', 'webp', 'bmp', 'gif',
  // Documents
  'pdf', 'docx', 'doc', 'txt', 'md', 'rtf',
  // Code & Scripts
  'py', 'js', 'ts', 'tsx', 'jsx', 'html', 'css', 'sql', 'sh', 'bash', 'cpp', 'c', 'h', 'java', 'rs', 'go', 'php',
  // Data
  'json', 'csv', 'tsv', 'yaml', 'yml', 'xml', 'env', 'toml', 'ini', 'xlsx', 'xls'
]);

const ACCEPT_ALL_STRING = Array.from(SUPPORTED_EXTENSIONS).map((ext) => `.${ext}`).join(',');

export default function ChatInput({ 
  onSendMessage, 
  disabled = false,
  maxFiles = 3,
  maxFileSizeMb = 25,
  hasMessages = false,
  forgeStatus = null
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const [attachedFiles, setAttachedFiles] = useState<File[]>([]);
  const [previewUrls, setPreviewUrls] = useState<{ [key: string]: string }>({});
  const [isDragging, setIsDragging] = useState(false);
  const [isAttachMenuOpen, setIsAttachMenuOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  
  // Camera Modal State
  const [isCameraModalOpen, setIsCameraModalOpen] = useState(false);

  // Speech-To-Text Dictation State
  const [isDictating, setIsDictating] = useState(false);
  
  // Forge Deep Architectural Logic State
  const [isForgeMode, setIsForgeMode] = useState(false);

  const isForgeAvailable = !forgeStatus || forgeStatus.is_available;

  // Auto-switch off if limit gets exhausted
  useEffect(() => {
    if (forgeStatus && !forgeStatus.is_available && isForgeMode) {
      setIsForgeMode(false);
    }
  }, [forgeStatus, isForgeMode]);

  const handleToggleForge = () => {
    if (!isForgeAvailable && !isForgeMode) {
      showToast(`⚡ Forge 120B limit reached (${forgeStatus?.used}/${forgeStatus?.max}). Resets in ${forgeStatus?.reset_in}.`);
      return;
    }
    setIsForgeMode(!isForgeMode);
  };
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const mobileCameraInputRef = useRef<HTMLInputElement>(null);
  const attachMenuRef = useRef<HTMLDivElement>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const recognitionRef = useRef<any>(null);
  const dragCounterRef = useRef<number>(0);

  const showToast = useCallback((msg: string, duration: number = 3000) => {
    if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
    setToastMessage(msg);
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage(null);
    }, duration);
  }, []);

  // Auto-grow Textarea height dynamically (Mobile friendly)
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
      const scrollHeight = textareaRef.current.scrollHeight;
      const maxHeight = typeof window !== 'undefined' && window.innerWidth < 640 ? 110 : 180;
      textareaRef.current.style.height = `${Math.min(scrollHeight, maxHeight)}px`;
    }
  }, [input]);

  // Click Outside Handler for Attach Menu
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setIsAttachMenuOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        setIsAttachMenuOpen(false);
      }
    }
    if (isAttachMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      document.addEventListener('keydown', handleKeyDown);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [isAttachMenuOpen]);

  // Memory cleanup for image blob URLs and Speech instances
  useEffect(() => {
    return () => {
      if (toastTimeoutRef.current) clearTimeout(toastTimeoutRef.current);
      Object.values(previewUrls).forEach((url) => URL.revokeObjectURL(url));
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {}
      }
    };
  }, [previewUrls]);

  // Speech-To-Text Dictation
  const toggleVoiceDictation = () => {
    if (isDictating) {
      if (recognitionRef.current) {
        try {
          recognitionRef.current.stop();
        } catch {}
      }
      setIsDictating(false);
      return;
    }

    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      showToast('Speech recognition is unsupported in this browser.');
      return;
    }

    try {
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = true;
      recognition.lang = navigator.language || 'en-US';

      let baseText = input;

      recognition.onstart = () => {
        setIsDictating(true);
        baseText = input;
      };

      recognition.onresult = (event: any) => {
        let transcript = '';
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          transcript += event.results[i][0].transcript;
        }

        const separator = baseText.trim() && transcript ? ' ' : '';
        setInput(`${baseText}${separator}${transcript}`);
      };

      recognition.onerror = (event: any) => {
        if (event.error === 'not-allowed') {
          showToast('Microphone access blocked.');
        } else if (event.error !== 'no-speech') {
          console.warn('Dictation notice:', event.error);
        }
        setIsDictating(false);
      };

      recognition.onend = () => {
        setIsDictating(false);
      };

      recognitionRef.current = recognition;
      recognition.start();
    } catch (err: any) {
      console.error('Dictation failure:', err);
      showToast('Microphone initialization fault.');
      setIsDictating(false);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const isImageFile = (file: File) => {
    return file.type.startsWith('image/') || /\.(png|jpe?g|webp|bmp|gif)$/i.test(file.name);
  };

  const validateAndProcessFiles = (incomingFiles: FileList | File[] | null) => {
    if (!incomingFiles || incomingFiles.length === 0) return;

    const filesArray = Array.from(incomingFiles);
    const currentCount = attachedFiles.length;
    const maxSizeBytes = maxFileSizeMb * 1024 * 1024;
    let validFiles: File[] = [];
    let newPreviews: { [key: string]: string } = {};

    for (let i = 0; i < filesArray.length; i++) {
      const file = filesArray[i];
      const ext = file.name.split('.').pop()?.toLowerCase() || '';

      if (!SUPPORTED_EXTENSIONS.has(ext)) {
        showToast(`"${file.name}" format is unsupported.`);
        continue;
      }

      if (file.size > maxSizeBytes) {
        showToast(`"${file.name}" exceeds ${maxFileSizeMb}MB limit.`);
        continue;
      }

      const isDuplicate = attachedFiles.some(f => f.name === file.name && f.size === file.size) || 
                          validFiles.some(f => f.name === file.name && f.size === file.size);
      
      if (isDuplicate) {
        showToast(`"${file.name}" is already attached.`);
        continue;
      }

      if (currentCount + validFiles.length >= maxFiles) {
        showToast(`Maximum ${maxFiles} files allowed.`);
        break;
      }

      validFiles.push(file);

      if (isImageFile(file)) {
        newPreviews[`${file.name}-${file.size}`] = URL.createObjectURL(file);
      }
    }

    if (validFiles.length > 0) {
      setAttachedFiles((prev) => [...prev, ...validFiles]);
      setPreviewUrls((prev) => ({ ...prev, ...newPreviews }));
    }
  };

  // Clipboard Paste Handler (Screenshots & Files)
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    if (disabled) return;
    const items = e.clipboardData?.items;
    if (!items) return;

    const pastedFiles: File[] = [];
    for (let i = 0; i < items.length; i++) {
      if (items[i].kind === 'file') {
        const file = items[i].getAsFile();
        if (file) {
          const finalFile = file.name === 'image.png' 
            ? new File([file], `screenshot_${Date.now()}.png`, { type: file.type })
            : file;
          pastedFiles.push(finalFile);
        }
      }
    }

    if (pastedFiles.length > 0) {
      e.preventDefault();
      validateAndProcessFiles(pastedFiles);
    }
  };

  const removeFile = (index: number) => {
    const fileToRemove = attachedFiles[index];
    if (fileToRemove) {
      const key = `${fileToRemove.name}-${fileToRemove.size}`;
      if (previewUrls[key]) {
        URL.revokeObjectURL(previewUrls[key]);
        setPreviewUrls((prev) => {
          const updated = { ...prev };
          delete updated[key];
          return updated;
        });
      }
    }
    setAttachedFiles((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Synchronous Direct File Picker Dispatcher (Zero latency & race-condition free)
  const handleCategoryClick = (acceptString: string) => {
    setIsAttachMenuOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.accept = acceptString;
      fileInputRef.current.click();
    }
  };

  // Cross-Device Camera Dispatcher
  const handleCameraTrigger = () => {
    setIsAttachMenuOpen(false);

    if (attachedFiles.length >= maxFiles) {
      showToast(`Limit reached (${maxFiles} files).`);
      return;
    }

    if (typeof window !== 'undefined') {
      const isMobile = /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) || 
                       (navigator.maxTouchPoints > 1 && window.innerWidth < 768);

      if (isMobile && mobileCameraInputRef.current) {
        mobileCameraInputRef.current.click();
      } else {
        setIsCameraModalOpen(true);
      }
    }
  };

  const handleSubmit = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (disabled || (!input.trim() && attachedFiles.length === 0)) return;

    if (isDictating && recognitionRef.current) {
      recognitionRef.current.stop();
      setIsDictating(false);
    }

    if (onSendMessage) {
      onSendMessage(input.trim(), attachedFiles, isForgeMode ? 'forge' : 'fast');
    }

    // Revoke all Blob URLs to eliminate browser RAM leaks
    Object.values(previewUrls).forEach((url) => URL.revokeObjectURL(url));

    setInput('');
    setAttachedFiles([]);
    setPreviewUrls({});
    setIsAttachMenuOpen(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
      fileInputRef.current.accept = ACCEPT_ALL_STRING;
    }
    if (mobileCameraInputRef.current) mobileCameraInputRef.current.value = '';
    
    if (textareaRef.current) {
      textareaRef.current.style.height = 'auto';
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      if ((e.nativeEvent as any).isComposing) return;
      e.preventDefault();
      handleSubmit();
    }
  };

  const isSendActive = (input.trim().length > 0 || attachedFiles.length > 0) && !disabled;

  return (
    <div className="w-full mx-auto flex flex-col relative font-sans isolate">
      
      {/* File Explorer Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept={ACCEPT_ALL_STRING}
        className="hidden"
        onChange={(e) => validateAndProcessFiles(e.target.files)}
        onClick={(e) => (e.currentTarget.value = '')} 
      />

      {/* Mobile Camera Input */}
      <input
        ref={mobileCameraInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => validateAndProcessFiles(e.target.files)}
        onClick={(e) => (e.currentTarget.value = '')} 
      />

      {/* Desktop Camera Modal */}
      <CameraModal
        isOpen={isCameraModalOpen}
        onClose={() => setIsCameraModalOpen(false)}
        onCapture={(file: File) => validateAndProcessFiles([file])}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="absolute -top-14 left-1/2 -translate-x-1/2 z-50 px-4 py-2.5 bg-[#262626] border border-white/10 text-white text-[12px] font-medium rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-from-bottom-2 duration-200 whitespace-nowrap">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-cyan-400">
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Attachment Previews */}
      {attachedFiles.length > 0 && (
        <div className="w-full flex flex-wrap gap-2 mb-3 px-2 animate-in fade-in slide-in-from-bottom-1 duration-150">
          {attachedFiles.map((file, idx) => {
            const preview = previewUrls[`${file.name}-${file.size}`];
            return (
              <div
                key={`${file.name}-${idx}`}
                className="flex items-center gap-2.5 bg-[#262626] border border-white/10 hover:border-white/20 rounded-xl px-3 py-2 text-sm text-neutral-200 shadow-sm group transition-all"
              >
                {preview ? (
                  <img
                    src={preview}
                    alt={file.name}
                    className="w-6 h-6 object-cover rounded-md border border-white/10"
                  />
                ) : (
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                    <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                    <polyline points="14 2 14 8 20 8" />
                  </svg>
                )}
                
                <span className="max-w-[150px] truncate text-[13px] font-medium text-white">{file.name}</span>
                <span className="text-[11px] text-neutral-400 font-mono">({formatFileSize(file.size)})</span>
                
                <button
                  type="button"
                  onClick={() => removeFile(idx)}
                  className="ml-1 p-0.5 text-neutral-400 hover:text-white rounded-md hover:bg-white/10 transition-colors"
                  title="Remove attachment"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                  </svg>
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Forge Mode Ambient Engine Aura */}
      <div 
        className={`pointer-events-none absolute -inset-x-3 -top-12 -bottom-4 -z-1 rounded-3xl bg-gradient-to-t from-amber-500/25 via-amber-500/[0.08] to-transparent blur-2xl transition-all duration-500 ${
          isForgeMode ? 'opacity-100 scale-100' : 'opacity-0 scale-95'
        }`} 
      />

      {/* Main Input Container */}
      <form
        onSubmit={handleSubmit}
        onDragEnter={(e) => {
          e.preventDefault();
          if (!disabled) {
            dragCounterRef.current += 1;
            setIsDragging(true);
          }
        }}
        onDragOver={(e) => e.preventDefault()}
        onDragLeave={(e) => {
          e.preventDefault();
          if (!disabled) {
            dragCounterRef.current -= 1;
            if (dragCounterRef.current <= 0) {
              dragCounterRef.current = 0;
              setIsDragging(false);
            }
          }
        }}
        onDrop={(e) => {
          e.preventDefault();
          dragCounterRef.current = 0;
          setIsDragging(false);
          if (!disabled) validateAndProcessFiles(e.dataTransfer.files);
        }}
        className={`w-full relative flex items-end bg-[#0f1013]/95 backdrop-blur-2xl rounded-[22px] sm:rounded-2xl px-2.5 sm:px-3.5 py-2 sm:py-2.5 transition-all duration-200 shadow-[0_12px_40px_rgba(0,0,0,0.7)] ${
          isDragging 
            ? 'bg-[#15171c] border border-cyan-400/50 shadow-[0_0_24px_rgba(6,182,212,0.15)]' 
            : isDictating
            ? 'border border-amber-400/50 shadow-[0_0_24px_rgba(245,158,11,0.2)]'
            : 'border border-white/[0.08] hover:border-white/[0.14] focus-within:border-white/25 focus-within:shadow-[0_0_30px_rgba(255,255,255,0.02)]'
        }`}
      >
        {/* Drag Overlay */}
        {isDragging && (
          <div className="absolute inset-0 z-40 bg-black/75 backdrop-blur-sm rounded-3xl border border-dashed border-cyan-400/60 flex items-center justify-center pointer-events-none">
            <span className="text-white text-sm font-medium tracking-wide flex items-center gap-2">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-cyan-400">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="17 8 12 3 7 8" />
                <line x1="12" y1="3" x2="12" y2="15" />
              </svg>
              Drop files to attach to conversation
            </span>
          </div>
        )}

        {/* Attachment Menu Button */}
        <div className="relative mb-1" ref={attachMenuRef}>
          <button
            type="button"
            onClick={() => {
              if (attachedFiles.length >= maxFiles) {
                showToast(`Limit reached (${maxFiles} files).`);
                return;
              }
              setIsAttachMenuOpen(!isAttachMenuOpen);
            }}
            disabled={disabled}
            className={`w-8 h-8 flex items-center justify-center rounded-xl transition-all shrink-0 z-10 relative ${
              isAttachMenuOpen
                ? 'bg-white/15 text-white'
                : attachedFiles.length >= maxFiles
                ? 'text-neutral-600 cursor-not-allowed'
                : 'text-neutral-400 hover:text-white hover:bg-white/10'
            }`}
            title="Attach images or files"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
            </svg>
          </button>

          {/* Attach Menu Dropdown (Sleek Obsidian Stealth) */}
          {isAttachMenuOpen && (
            <div className="absolute bottom-full left-0 mb-3 w-[220px] bg-[#0c0d11]/95 backdrop-blur-2xl border border-white/[0.1] rounded-2xl shadow-2xl p-1.5 z-50 animate-in fade-in zoom-in-95 duration-100 flex flex-col gap-0.5">
              
              <button
                type="button"
                onClick={() => handleCategoryClick(ACCEPT_ALL_STRING)}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-neutral-300 hover:text-white transition-all text-[12.5px] font-medium cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-neutral-400">
                  <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                </svg>
                <span>Browse All Files</span>
              </button>

              <button
                type="button"
                onClick={handleCameraTrigger}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-neutral-300 hover:text-white transition-all text-[12.5px] font-medium cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400">
                  <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                  <circle cx="12" cy="13" r="4" />
                </svg>
                <span>Camera Capture</span>
              </button>

              <button
                type="button"
                onClick={() => handleCategoryClick('.png,.jpg,.jpeg,.webp,.bmp,.gif')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-neutral-300 hover:text-white transition-all text-[12.5px] font-medium cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-neutral-400">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>Upload Image</span>
              </button>

              <button
                type="button"
                onClick={() => handleCategoryClick('.pdf,.docx,.doc,.txt,.md,.rtf')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-neutral-300 hover:text-white transition-all text-[12.5px] font-medium cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-neutral-400">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                  <polyline points="14 2 14 8 20 8" />
                  <line x1="16" y1="13" x2="8" y2="13" />
                  <line x1="16" y1="17" x2="8" y2="17" />
                </svg>
                <span>Document</span>
              </button>

              <button
                type="button"
                onClick={() => handleCategoryClick('.py,.js,.ts,.tsx,.jsx,.html,.css,.sql,.sh,.bash,.cpp,.c,.h,.java,.rs,.go,.php')}
                className="w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-left hover:bg-white/[0.06] text-neutral-300 hover:text-white transition-all text-[12.5px] font-medium cursor-pointer"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="text-neutral-400">
                  <polyline points="16 18 22 12 16 6" />
                  <polyline points="8 6 2 12 8 18" />
                </svg>
                <span>Code / Scripts</span>
              </button>

            </div>
          )}
        </div>

        {/* Dynamic Multiline Input Area */}
        <textarea
          ref={textareaRef}
          rows={1}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          onPaste={handlePaste}
          disabled={disabled}
          placeholder={isDictating ? "Listening..." : hasMessages ? "Reply to Ubair OS..." : "Message Ubair OS..."}
          className="flex-1 bg-transparent border-none outline-none text-white text-[15px] placeholder-neutral-500/90 px-2 sm:px-3 py-1 sm:py-1.5 leading-relaxed resize-none max-h-[110px] sm:max-h-[180px] z-10 font-sans selection:bg-cyan-500/30"
        />

        {/* Action Controls: Forge Mode Pill + Dynamic Action (Mic/Send) */}
        <div className="flex items-center gap-1.5 sm:gap-2 mb-0.5 sm:mb-1 z-10 shrink-0">
          
          {/* Forge Mode Switcher Pill (Compact icon on mobile, full pill on desktop) */}
          <button
            type="button"
            onClick={handleToggleForge}
            disabled={disabled}
            className={`px-2.5 py-1 rounded-xl text-[11.5px] font-medium tracking-wide flex items-center gap-1.5 transition-all duration-200 shrink-0 select-none cursor-pointer ${
              !isForgeAvailable
                ? 'bg-white/[0.02] text-neutral-600 border border-white/[0.05]'
                : isForgeMode
                ? 'bg-amber-500/10 text-amber-300 border border-amber-400/30 shadow-[0_0_14px_rgba(245,158,11,0.15)] font-semibold'
                : 'bg-white/[0.03] text-neutral-400 border border-white/[0.08] hover:text-white hover:border-white/20'
            }`}
            title={
              !isForgeAvailable
                ? `Forge 120B Paused (${forgeStatus?.used}/${forgeStatus?.max}) · Resets in ${forgeStatus?.reset_in}`
                : isForgeMode
                ? 'Forge Deep Logic Active'
                : 'Switch to Forge Deep Logic'
            }
          >
            <svg 
              width="13" 
              height="13" 
              viewBox="0 0 24 24" 
              fill={isForgeMode ? "currentColor" : "none"} 
              stroke="currentColor" 
              strokeWidth="2" 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              className={
                !isForgeAvailable
                  ? "text-neutral-500"
                  : isForgeMode 
                  ? "text-amber-400 animate-pulse" 
                  : "text-neutral-400"
              }
            >
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
            <span className="hidden sm:inline">Forge</span>
          </button>

          {/* Dynamic Unified Action: Mic when Empty, Send Arrow when Active */}
          {isSendActive ? (
            <button
              type="submit"
              className="w-8 h-8 rounded-full bg-white text-black flex items-center justify-center shadow-md hover:bg-neutral-200 active:scale-95 transition-all duration-150 shrink-0 animate-in fade-in zoom-in-75 duration-150"
              title="Send (Enter)"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="19" x2="12" y2="5" />
                <polyline points="5 12 12 5 19 12" />
              </svg>
            </button>
          ) : (
            <button
              type="button"
              onClick={toggleVoiceDictation}
              disabled={disabled}
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-all duration-200 shrink-0 ${
                isDictating
                  ? 'bg-cyan-400 text-black shadow-[0_0_12px_rgba(6,182,212,0.6)] animate-pulse'
                  : 'text-neutral-400 hover:text-white hover:bg-white/10'
              }`}
              title={isDictating ? 'Stop dictation' : 'Voice dictation'}
            >
              {isDictating ? (
                <div className="flex items-center gap-0.5 h-3">
                  <span className="w-0.5 h-2 bg-black animate-bounce rounded-full" style={{ animationDelay: '0ms' }} />
                  <span className="w-0.5 h-3 bg-black animate-bounce rounded-full" style={{ animationDelay: '150ms' }} />
                  <span className="w-0.5 h-2 bg-black animate-bounce rounded-full" style={{ animationDelay: '300ms' }} />
                </div>
              ) : (
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" y1="19" x2="12" y2="23" />
                  <line x1="8" y1="23" x2="16" y2="23" />
                </svg>
              )}
            </button>
          )}

        </div>

      </form>
      
      <div className="text-center mt-2 sm:mt-2.5 text-[10px] sm:text-[11px] text-neutral-500/80 font-medium select-none tracking-tight">
        Ubair OS can make mistakes. Verify critical technical data.
      </div>
    </div>
  );
}