'use client';

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

export interface SlateNote {
  id: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
}

interface UbairSlateProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type GuideLang = 
  | 'en' 
  | 'hinglish' 
  | 'hi' 
  | 'es' 
  | 'fr' 
  | 'de' 
  | 'ar' 
  | 'ja' 
  | 'ru' 
  | 'zh' 
  | 'pt';

interface LangOption {
  code: GuideLang;
  label: string;
  native: string;
}

const SUPPORTED_LANGS: LangOption[] = [
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hinglish', label: 'Hinglish', native: 'Hinglish' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
  { code: 'es', label: 'Spanish', native: 'Español' },
  { code: 'fr', label: 'French', native: 'Français' },
  { code: 'de', label: 'German', native: 'Deutsch' },
  { code: 'ar', label: 'Arabic', native: 'العربية' },
  { code: 'ja', label: 'Japanese', native: '日本語' },
  { code: 'ru', label: 'Russian', native: 'Русский' },
  { code: 'zh', label: 'Chinese', native: '中文' },
  { code: 'pt', label: 'Portuguese', native: 'Português' },
];

const SYNC_GUIDES: Record<GuideLang, { title: string; steps: string[] }> = {
  en: {
    title: 'How Device Sync Works',
    steps: [
      'Select the "Push" tab to generate your single-use 4-digit PIN.',
      'Open Ubair Slate on your other device, open Sync Device, and select "Pull".',
      'Enter the 4-digit code within 10 minutes. Notes transfer directly, and the temporary cloud bridge burns permanently.',
    ],
  },
  hinglish: {
    title: 'Device Sync Kaise Kaam Karta Hai',
    steps: [
      '"Push" tab ke andar jakar apna single-use 4-digit PIN generate karein.',
      'Dusre device (phone/laptop) par Ubair Slate kholein aur Sync me "Pull" select karein.',
      '10 minute ke andar ye code dalein. Notes transfer hote hi cloud copy turant permanently delete ho jayegi.',
    ],
  },
  hi: {
    title: 'डिवाइस सिंक कैसे काम करता है',
    steps: [
      '"Push" टैब पर जाकर अपना 4 अंकों का अस्थायी पिन बनाएं।',
      'अपने दूसरे डिवाइस पर Ubair Slate खोलें और सिंक में "Pull" विकल्प चुनें।',
      '10 मिनट के अंदर कोड दर्ज करें। नोट्स ट्रांसफर होते ही क्लाउड डेटा हमेशा के लिए मिट जाएगा।',
    ],
  },
  es: {
    title: 'Cómo funciona la sincronización',
    steps: [
      'Seleccione la pestaña "Push" para generar su código PIN de 4 dígitos.',
      'Abra Ubair Slate en su otro dispositivo y seleccione "Pull" en la ventana de sincronización.',
      'Ingrese el código antes de 10 minutos. Las notas se transfieren y la copia temporal en la nube se destruye de inmediato.',
    ],
  },
  fr: {
    title: 'Comment fonctionne la synchronisation',
    steps: [
      'Cliquez sur l\'onglet "Push" pour générer votre code PIN à 4 chiffres.',
      'Ouvrez Ubair Slate sur votre autre appareil et sélectionnez "Pull".',
      'Entrez le code dans les 10 minutes. Vos notes sont transférées et le pont temporaire est détruit aussitôt.',
    ],
  },
  de: {
    title: 'So funktioniert die Gerätesynchronisierung',
    steps: [
      'Wählen Sie den Reiter "Push", um eine 4-stellige PIN zu generieren.',
      'Öffnen Sie Ubair Slate auf Ihrem anderen Gerät und wählen Sie "Pull".',
      'Geben Sie den Code innerhalb von 10 Minuten ein. Die Daten werden synchronisiert und danach sofort vernichtet.',
    ],
  },
  ar: {
    title: 'كيف تعمل ميزة مزامنة الأجهزة',
    steps: [
      'انقر فوق علامة التبويب "Push" لإنشاء رمز PIN مكون من 4 أرقام.',
      'افتح Ubair Slate على جهازك الآخر وحدد علامة التبويب "Pull".',
      'أدخل الرمز خلال 10 دقائق. يتم نقل الملاحظات وحذف السجل السحابي المؤقت فوراً.',
    ],
  },
  ja: {
    title: 'デバイス同期の仕組み',
    steps: [
      '「Push」タブを開き、4桁の一时コードを発行します。',
      'もう1台の端末でUbair Slateを開き、「Pull」タブを選択します。',
      '10分以内に4桁のコードを入力します。転送が完了すると、クラウド上の一時データは完全に消去されます。',
    ],
  },
  ru: {
    title: 'Как работает синхронизация',
    steps: [
      'Перейдите на вкладку "Push" для генерации временного 4-значного кода.',
      'Откройте Ubair Slate на втором устройстве и выберите вкладку "Pull".',
      'Введите код в течение 10 минут. Заметки перенесутся, а временная облачная копия сразу удалится.',
    ],
  },
  zh: {
    title: '跨设备同步操作指南',
    steps: [
      '在 "Push" 标签页生成您的 4 位数临时验证码。',
      '在您的其他设备上打开 Ubair Slate，并进入同步弹框选择 "Pull"。',
      '在 10 分钟内输入该验证码。便签同步完成后，云端临时中转数据将立即彻底销毁。',
    ],
  },
  pt: {
    title: 'Como funciona a sincronização',
    steps: [
      'Acesse a aba "Push" para gerar seu código temporário de 4 dígitos.',
      'Abra o Ubair Slate no seu outro aparelho e clique na aba "Pull".',
      'Insira o código em até 10 minutos. As notas serão transferidas e a ponte temporária será destruída.',
    ],
  },
};

export default function UbairSlate({ isOpen, onClose, userEmail = '' }: UbairSlateProps) {
  const cleanEmail = useMemo(() => userEmail.trim().toLowerCase(), [userEmail]);
  const storageKey = useMemo(() => `ubair_slate_notes_${cleanEmail || 'local_vault'}`, [cleanEmail]);

  // Notes State
  const [notes, setNotes] = useState<SlateNote[]>([]);
  const [activeNoteId, setActiveNoteId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copied, setCopied] = useState(false);
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');
  const [canvasMode, setCanvasMode] = useState<'edit' | 'preview'>('preview');
  const [isFormatting, setIsFormatting] = useState(false);
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  // Note Action Popover, Create Modal & Rename Modal
  const [openNoteMenuId, setOpenNoteMenuId] = useState<string | null>(null);
  const [notePendingDelete, setNotePendingDelete] = useState<SlateNote | null>(null);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newNoteTitleInput, setNewNoteTitleInput] = useState('');
  const [notePendingRename, setNotePendingRename] = useState<SlateNote | null>(null);
  const [renameTitleInput, setRenameTitleInput] = useState('');

  // Sync Bridge State
  const [isBridgeOpen, setIsBridgeOpen] = useState(false);
  const [bridgeTab, setBridgeTab] = useState<'push' | 'pull'>('push');
  const [showHowItWorks, setShowHowItWorks] = useState(false);
  const [guideLang, setGuideLang] = useState<GuideLang>('en');
  const [isLangMenuOpen, setIsLangMenuOpen] = useState(false);

  const [isPushing, setIsPushing] = useState(false);
  const [isPulling, setIsPulling] = useState(false);
  const [transferCode, setTransferCode] = useState<string | null>(null);
  const [pullInputCode, setPullInputCode] = useState('');
  const [timeRemaining, setTimeRemaining] = useState<number>(600);
  const [bridgeStatusMsg, setBridgeStatusMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const countdownIntervalRef = useRef<any>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const saveTimeoutRef = useRef<any>(null);
  const langDropdownRef = useRef<HTMLDivElement | null>(null);
  const createInputRef = useRef<HTMLInputElement | null>(null);
  const renameInputRef = useRef<HTMLInputElement | null>(null);

  // Close menus on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (langDropdownRef.current && !langDropdownRef.current.contains(e.target as Node)) {
        setIsLangMenuOpen(false);
      }
      const target = e.target as HTMLElement;
      if (!target.closest('[data-note-menu-container]')) {
        setOpenNoteMenuId(null);
      }
    }
    window.addEventListener('mousedown', handleClickOutside);
    return () => window.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Responsive Sidebar Initializer
  useEffect(() => {
    const handleResize = () => {
      if (typeof window !== 'undefined') {
        if (window.innerWidth < 768) {
          setIsSidebarOpen(false);
        } else {
          setIsSidebarOpen(true);
        }
      }
    };
    handleResize();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 1. Safe Hydration from LocalStorage
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setNotes(parsed);
          setActiveNoteId(parsed[0].id);
          return;
        }
      }
      const initialNote: SlateNote = {
        id: `note_${Date.now()}`,
        title: 'Welcome to Ubair Slate ⚡',
        content: 'Ubair Slate aapka private, distraction-free scratchpad hai jahan aap ideas, code snippets aur quick drafts likh sakte hain.\n\n### 🚀 Quick Guide:\n- **100% Device Private:** Saare notes aapke browser me securely save hote hain, server par store nahi hote.\n- **Real-Time Auto-Save:** Har ek shabd likhte hi automatically save hota hai.\n- **✨ Auto-Structure:** Rough text ya code likhne ke baad neeche "Auto-Structure" dabayein, AI use clean Markdown me convert kar dega.\n- **Device Sync (⇪):** Upar "Sync" button se 4-digit temporary code generate karke dusre phone ya laptop par notes transfer kar sakte hain.\n\n*Naya note shuru karne ke liye left sidebar me "+ New Note" par click karein!*',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      setNotes([initialNote]);
      setActiveNoteId(initialNote.id);
      localStorage.setItem(storageKey, JSON.stringify([initialNote]));
    } catch {
      setNotes([]);
      setActiveNoteId(null);
    }
  }, [storageKey]);

  // Persist Changes Safely
  const persistNotes = useCallback(
    (updated: SlateNote[]) => {
      setNotes(updated);
      if (typeof window !== 'undefined') {
        try {
          localStorage.setItem(storageKey, JSON.stringify(updated));
        } catch (err) {
          console.error('Storage error:', err);
        }
      }
    },
    [storageKey]
  );

  // Debounced Auto-Save Pulse
  const triggerSavePulse = () => {
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => setSaveStatus('saved'), 350);
  };

  const activeNote = useMemo(() => {
    return notes.find((n) => n.id === activeNoteId) || notes[0] || null;
  }, [notes, activeNoteId]);

  // Trigger New Note Modal
  const openCreateModal = () => {
    setNewNoteTitleInput('');
    setIsCreateModalOpen(true);
    setTimeout(() => createInputRef.current?.focus(), 60);
  };

  // Confirm Note Creation with Defined Title
  const handleConfirmCreateNote = () => {
    const title = newNoteTitleInput.trim() || 'Untitled Note';
    const newNote: SlateNote = {
      id: `note_${Date.now()}`,
      title: title,
      content: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    persistNotes([newNote, ...notes]);
    setActiveNoteId(newNote.id);
    setCanvasMode('edit');
    setIsCreateModalOpen(false);
    if (typeof window !== 'undefined' && window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
    setTimeout(() => textareaRef.current?.focus(), 50);
  };

  // Trigger Rename Modal
  const openRenameModal = (note: SlateNote) => {
    setNotePendingRename(note);
    setRenameTitleInput(note.title);
    setTimeout(() => renameInputRef.current?.focus(), 60);
  };

  // Confirm Note Rename
  const handleConfirmRenameNote = () => {
    if (!notePendingRename) return;
    const finalTitle = renameTitleInput.trim() || 'Untitled Note';
    persistNotes(
      notes.map((n) =>
        n.id === notePendingRename.id
          ? { ...n, title: finalTitle, updatedAt: new Date().toISOString() }
          : n
      )
    );
    triggerSavePulse();
    setNotePendingRename(null);
  };

  // Safe Verification Delete
  const confirmDeleteNote = () => {
    if (!notePendingDelete) return;
    const filtered = notes.filter((n) => n.id !== notePendingDelete.id);
    persistNotes(filtered);
    if (activeNoteId === notePendingDelete.id) {
      setActiveNoteId(filtered.length > 0 ? filtered[0].id : null);
    }
    setNotePendingDelete(null);
  };

  // Pure Content Change
  const handleContentChange = (val: string) => {
    if (!activeNote) return;

    persistNotes(
      notes.map((n) =>
        n.id === activeNote.id
          ? {
              ...n,
              content: val,
              updatedAt: new Date().toISOString(),
            }
          : n
      )
    );

    triggerSavePulse();
  };

  const handleCopyNoteContent = (contentToCopy?: string) => {
    const text = contentToCopy ?? activeNote?.content ?? '';
    if (!text) return;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  // Clean In-Place Format Action
  const handleSmartStructure = async (targetNote?: SlateNote) => {
    const noteToProcess = targetNote || activeNote;
    if (!noteToProcess || !noteToProcess.content.trim() || isFormatting) return;

    setIsFormatting(true);

    const directive = `[SLATE DIRECTIVE: CLEAN MARKDOWN FORMATTING]
Organize and format this note into clean, polished Markdown:
- DO NOT include or repeat the note title as a top-level (#) heading (the title is already permanently rendered in the header UI).
- Start directly with body content or logical subheadings (##).
- Clean up bullet lists and checklists (- [ ]).
- Fence any code blocks cleanly with appropriate syntax.
- Keep all facts, notes, and code 100% faithful to original.
- OUTPUT ONLY the final formatted Markdown content. No conversational intro or outro.

Title: ${noteToProcess.title}
Content:
${noteToProcess.content}`;

    try {
      const formData = new FormData();
      formData.append('message', directive);
      formData.append('user_id', cleanEmail || 'anonymous');
      formData.append('user_email', cleanEmail || 'anonymous');
      formData.append('mode', 'temp');
      formData.append('session_id', 'slate_formatter');

      const response = await fetch(`${API_BASE}/api/chat`, {
        method: 'POST',
        body: formData,
      });

      if (!response.ok || !response.body) throw new Error('API busy');

      const reader = response.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let structuredResult = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;
        structuredResult += decoder.decode(value, { stream: true });
      }

      let cleanFormatted = structuredResult.trim();
      // Bulletproof Strip: Agar AI ne galti se fir bhi leading # Title chipka diya ho, use turant remove karo
      const escapedTitle = noteToProcess.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const leadingTitleRegex = new RegExp(`^#\\s*(${escapedTitle}|note|untitled)?\\s*\\n+`, 'i');
      cleanFormatted = cleanFormatted.replace(leadingTitleRegex, '').trim();

      if (cleanFormatted) {
        persistNotes(
          notes.map((n) =>
            n.id === noteToProcess.id
              ? {
                  ...n,
                  content: cleanFormatted,
                  updatedAt: new Date().toISOString(),
                }
              : n
          )
        );
        triggerSavePulse();
        if (activeNote?.id === noteToProcess.id) {
          setCanvasMode('preview');
        }
      }
    } catch (err) {
      console.error('Formatting error:', err);
    } finally {
      setIsFormatting(false);
    }
  };

  // Sync Bridge Timers
  const stopTimer = () => {
    if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
  };

  const handlePushBridge = async () => {
    if (!cleanEmail || notes.length === 0) return;
    setIsPushing(true);
    setBridgeStatusMsg(null);
    stopTimer();

    try {
      const res = await fetch(`${API_BASE}/api/notes/bridge/push`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: cleanEmail, notes }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Push failed');

      setTransferCode(data.transfer_code);
      setTimeRemaining(data.expires_in_seconds || 600);

      countdownIntervalRef.current = setInterval(() => {
        setTimeRemaining((prev) => {
          if (prev <= 1) {
            stopTimer();
            setTransferCode(null);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    } catch (err: any) {
      setBridgeStatusMsg({ type: 'error', text: err.message || 'Bridge service unavailable.' });
    } finally {
      setIsPushing(false);
    }
  };

  const handlePullBridge = async () => {
    if (!cleanEmail || pullInputCode.length < 4) return;
    setIsPulling(true);
    setBridgeStatusMsg(null);

    try {
      const res = await fetch(`${API_BASE}/api/notes/bridge/pull`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_email: cleanEmail, transfer_code: pullInputCode.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Claim failed');

      if (data.notes && Array.isArray(data.notes)) {
        persistNotes(data.notes);
        if (data.notes.length > 0) setActiveNoteId(data.notes[0].id);
        setBridgeStatusMsg({ type: 'success', text: 'Notes synced. Ephemeral bridge burned.' });
        setTimeout(() => {
          setIsBridgeOpen(false);
          setPullInputCode('');
          setBridgeStatusMsg(null);
        }, 1200);
      }
    } catch (err: any) {
      setBridgeStatusMsg({ type: 'error', text: err.message || 'Invalid or expired code.' });
    } finally {
      setIsPulling(false);
    }
  };

  const filteredNotes = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return notes;
    return notes.filter(
      (n) => n.title.toLowerCase().includes(q) || n.content.toLowerCase().includes(q)
    );
  }, [notes, searchQuery]);

  // Keyboard Navigation Listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if (e.key === 'Escape') {
        if (isCreateModalOpen) {
          e.stopImmediatePropagation();
          setIsCreateModalOpen(false);
        } else if (notePendingRename) {
          e.stopImmediatePropagation();
          setNotePendingRename(null);
        } else if (notePendingDelete) {
          e.stopImmediatePropagation();
          setNotePendingDelete(null);
        } else if (openNoteMenuId) {
          e.stopImmediatePropagation();
          setOpenNoteMenuId(null);
        } else if (isLangMenuOpen) {
          e.stopImmediatePropagation();
          setIsLangMenuOpen(false);
        } else if (showHowItWorks) {
          e.stopImmediatePropagation();
          setShowHowItWorks(false);
        } else if (isBridgeOpen) {
          e.stopImmediatePropagation();
          setIsBridgeOpen(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCreateModalOpen, notePendingRename, notePendingDelete, openNoteMenuId, isLangMenuOpen, showHowItWorks, isBridgeOpen, onClose]);

  if (!isOpen) return null;

  const currentLangObj = SUPPORTED_LANGS.find((l) => l.code === guideLang) || SUPPORTED_LANGS[0];

  return (
    <div className="fixed inset-0 z-[70] bg-[#07080a] text-neutral-200 flex flex-col font-sans selection:bg-white/20 selection:text-white h-[100dvh] w-full overflow-hidden animate-in fade-in duration-150">
      
      {/* 1. Header */}
      <header className="h-14 px-3 sm:px-6 border-b border-white/[0.04] flex items-center justify-between shrink-0 select-none bg-[#07080a] relative z-30">
        
        {/* Left: Sidebar Toggle + Pure Vector Logo + Clean Brand */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <button
            type="button"
            onClick={() => setIsSidebarOpen(!isSidebarOpen)}
            className="p-1.5 rounded-lg text-neutral-400 hover:text-white hover:bg-white/[0.05] transition-colors cursor-pointer shrink-0"
            title={isSidebarOpen ? 'Collapse Sidebar' : 'Expand Sidebar'}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <line x1="9" y1="3" x2="9" y2="21" />
            </svg>
          </button>

          {/* Guaranteed Zero-Fail Pure SVG Brand Mark */}
          <div className="flex items-center justify-center text-white shrink-0">
            <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2L2 7l10 5 10-5-10-5z" />
              <path d="M2 17l10 5 10-5" />
              <path d="M2 12l10 5 10-5" />
            </svg>
          </div>

          <div className="flex items-baseline gap-2 min-w-0">
            <div className="flex items-baseline gap-1.5 shrink-0">
              <span className="text-[14px] sm:text-[14.5px] font-semibold tracking-tight text-white">Ubair</span>
              <span className="text-[13.5px] sm:text-[14px] font-semibold tracking-tight bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-500 bg-clip-text text-transparent">
                Slate
              </span>
            </div>
            <span className="text-[11px] font-sans text-neutral-500 hidden lg:inline truncate">
              • Private notes that stay strictly on your device
            </span>
          </div>
        </div>

        {/* Right: Clean Minimal Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          
          {/* Edit / View Mode Switcher */}
          <div className="flex items-center rounded-lg bg-white/[0.03] border border-white/[0.05] p-0.5 text-xs font-mono">
            <button
              type="button"
              onClick={() => setCanvasMode('edit')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-colors cursor-pointer text-[11px] sm:text-xs ${
                canvasMode === 'edit'
                  ? 'bg-white/[0.08] text-white font-medium'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              Edit
            </button>
            <button
              type="button"
              onClick={() => setCanvasMode('preview')}
              className={`px-2 sm:px-2.5 py-1 rounded-md transition-colors cursor-pointer text-[11px] sm:text-xs ${
                canvasMode === 'preview'
                  ? 'bg-white/[0.08] text-white font-medium'
                  : 'text-neutral-500 hover:text-neutral-300'
              }`}
            >
              View
            </button>
          </div>

          {/* Sync Device Button */}
          <button
            type="button"
            onClick={() => {
              setBridgeStatusMsg(null);
              setShowHowItWorks(false);
              setIsBridgeOpen(true);
            }}
            className="h-7 px-2 sm:px-2.5 rounded-lg text-neutral-400 hover:text-white text-xs font-medium flex items-center gap-1.5 transition-all hover:bg-white/[0.04] cursor-pointer"
            title="Sync Device"
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-300">
              <path d="M16 3h5v5" /><path d="M4 20L21 3" /><path d="M21 16v5h-5" /><path d="M15 15l6 6" />
            </svg>
            <span className="hidden sm:inline text-[11px] sm:text-xs">Sync</span>
          </button>

          {/* Ghost Copy Icon Only */}
          <button
            type="button"
            onClick={() => handleCopyNoteContent()}
            className="w-7 h-7 flex items-center justify-center rounded-lg text-neutral-400 hover:text-white transition-all hover:bg-white/[0.05] active:scale-95 cursor-pointer shrink-0"
            title={copied ? "Copied" : "Copy Note"}
          >
            {copied ? (
              <span className="text-amber-400 text-xs font-bold animate-in zoom-in-75 duration-100">
                ✓
              </span>
            ) : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-80">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            )}
          </button>

          <div className="h-3 w-[1px] bg-white/[0.08] mx-0.5 sm:mx-1" />

          {/* Close Button */}
          <button
            type="button"
            onClick={onClose}
            className="h-7 px-2 rounded-lg text-neutral-500 hover:text-white text-[11px] font-mono transition-all hover:bg-white/[0.04] cursor-pointer"
          >
            ESC
          </button>
        </div>
      </header>

      {/* 2. Workspace Body: Left Sidebar + Center Canvas */}
      <div className="flex-1 flex min-h-0 overflow-hidden relative w-full">
        
        {/* Mobile Backdrop for Sidebar Drawer */}
        {isSidebarOpen && (
          <div 
            onClick={() => setIsSidebarOpen(false)}
            className="md:hidden fixed inset-0 top-14 bg-black/60 backdrop-blur-sm z-20 animate-in fade-in duration-150"
          />
        )}

        {/* Left Responsive Sidebar */}
        <aside
          className={`${
            isSidebarOpen 
              ? 'w-64 translate-x-0 border-r border-white/[0.06]' 
              : 'w-0 -translate-x-full border-none'
          } md:translate-x-0 flex flex-col shrink-0 bg-[#07080a] select-none transition-all duration-200 overflow-hidden fixed md:relative top-14 md:top-0 bottom-0 z-30 md:z-10`}
        >
          <div className="p-3 border-b border-white/[0.03] space-y-2 shrink-0">
            
            {/* Search Bar with Crisp SVG Symbol */}
            <div className="relative flex items-center">
              <svg 
                className="absolute left-2.5 w-3.5 h-3.5 text-neutral-500 pointer-events-none" 
                viewBox="0 0 24 24" 
                fill="none" 
                stroke="currentColor" 
                strokeWidth="2" 
                strokeLinecap="round" 
                strokeLinejoin="round"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search scratchpad..."
                className="w-full bg-white/[0.02] border border-white/[0.06] rounded-lg pl-8 pr-2.5 py-1.5 text-xs text-white placeholder-neutral-600 outline-none focus:border-white/20 transition-all font-sans"
              />
            </div>

            {/* Create Note Trigger Button */}
            <button
              type="button"
              onClick={openCreateModal}
              className="w-full h-8 rounded-lg bg-white/[0.04] hover:bg-white/[0.07] text-white text-xs font-medium flex items-center justify-center gap-1.5 transition-all cursor-pointer"
            >
              <span className="text-sm font-semibold text-neutral-400">+</span>
              <span>New Note</span>
            </button>
          </div>

          {/* Notes Item List */}
          <div className="flex-1 overflow-y-auto p-1.5 space-y-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [scrollbar-width:thin]">
            {filteredNotes.map((note) => {
              const isSelected = activeNote?.id === note.id;
              const isMenuOpen = openNoteMenuId === note.id;
              return (
                <div
                  key={note.id}
                  data-note-menu-container
                  onClick={() => {
                    setActiveNoteId(note.id);
                    if (typeof window !== 'undefined' && window.innerWidth < 768) {
                      setIsSidebarOpen(false);
                    }
                  }}
                  className={`group relative px-3 py-2 rounded-lg cursor-pointer transition-all flex items-center justify-between ${
                    isSelected
                      ? 'bg-white/[0.06] text-white font-medium'
                      : 'text-neutral-400 hover:bg-white/[0.02] hover:text-neutral-200'
                  }`}
                >
                  <span className="text-xs truncate flex-1 pr-2">
                    {note.title || 'Untitled Note'}
                  </span>

                  {/* Three Dots (...) SaaS Context Trigger - Always Visible */}
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setOpenNoteMenuId(isMenuOpen ? null : note.id);
                    }}
                    className={`p-1.5 rounded-md transition-all cursor-pointer shrink-0 ${
                      isMenuOpen
                        ? 'bg-white/[0.15] text-white shadow-sm'
                        : 'text-neutral-400 hover:text-white hover:bg-white/[0.08] active:scale-95'
                    }`}
                    title="Note Options"
                  >
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="1.5" fill="currentColor"/>
                      <circle cx="19" cy="12" r="1.5" fill="currentColor"/>
                      <circle cx="5" cy="12" r="1.5" fill="currentColor"/>
                    </svg>
                  </button>

                  {/* Floating Action Menu */}
                  {isMenuOpen && (
                    <div
                      onClick={(e) => e.stopPropagation()}
                      className="absolute right-2 top-8 w-44 bg-[#111215] border border-white/[0.08] rounded-xl shadow-2xl p-1 z-40 space-y-0.5 animate-in fade-in zoom-in-95 duration-100"
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setOpenNoteMenuId(null);
                          openRenameModal(note);
                        }}
                        className="w-full px-2.5 py-1.5 text-left rounded-lg text-xs font-sans text-neutral-300 hover:text-white hover:bg-white/[0.05] flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="text-neutral-400">✏️</span>
                        <span>Rename Note</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOpenNoteMenuId(null);
                          handleSmartStructure(note);
                        }}
                        className="w-full px-2.5 py-1.5 text-left rounded-lg text-xs font-sans text-neutral-300 hover:text-white hover:bg-white/[0.05] flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="text-neutral-400">✨</span>
                        <span>Auto-Structure</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOpenNoteMenuId(null);
                          handleCopyNoteContent(note.content);
                        }}
                        className="w-full px-2.5 py-1.5 text-left rounded-lg text-xs font-sans text-neutral-300 hover:text-white hover:bg-white/[0.05] flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="text-neutral-400">📋</span>
                        <span>Copy Content</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setOpenNoteMenuId(null);
                          setBridgeStatusMsg(null);
                          setShowHowItWorks(false);
                          setIsBridgeOpen(true);
                        }}
                        className="w-full px-2.5 py-1.5 text-left rounded-lg text-xs font-sans text-neutral-300 hover:text-white hover:bg-white/[0.05] flex items-center gap-2 transition-colors cursor-pointer"
                      >
                        <span className="text-neutral-400">⇪</span>
                        <span>Sync Device</span>
                      </button>

                      {notes.length > 1 && (
                        <>
                          <div className="h-[1px] bg-white/[0.06] my-1" />
                          <button
                            type="button"
                            onClick={() => {
                              setOpenNoteMenuId(null);
                              setNotePendingDelete(note);
                            }}
                            className="w-full px-2.5 py-1.5 text-left rounded-lg text-xs font-sans text-rose-400 hover:bg-rose-500/10 flex items-center gap-2 transition-colors cursor-pointer"
                          >
                            <span>🗑️</span>
                            <span>Delete Note</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </aside>

        {/* Center: Canvas Viewport */}
        <main className="flex-1 flex flex-col min-w-0 bg-[#07080a] relative overflow-hidden">
          {activeNote ? (
            <div className="flex-1 max-w-3xl w-full mx-auto p-3.5 sm:p-6 md:p-8 flex flex-col min-h-0">
              
              {/* Clean Heading Title */}
              <div className="flex items-center justify-between mb-2.5 sm:mb-4 group shrink-0">
                <h2 className="text-lg sm:text-2xl font-bold text-white tracking-tight font-sans truncate mr-2">
                  {activeNote.title || 'Untitled Note'}
                </h2>
                <button
                  type="button"
                  onClick={() => openRenameModal(activeNote)}
                  className="opacity-0 group-hover:opacity-100 p-1.5 rounded-lg text-neutral-500 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer shrink-0"
                  title="Rename Title"
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M12 20h9" />
                    <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
                  </svg>
                </button>
              </div>

              {/* View / Edit Mode Canvas */}
              {canvasMode === 'preview' ? (
                <div
                  onClick={() => setCanvasMode('edit')}
                  className="flex-1 overflow-y-auto cursor-text text-[13.5px] sm:text-[14px] text-neutral-300 leading-relaxed space-y-3 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [scrollbar-width:thin]"
                  title="Click anywhere to edit"
                >
                  {activeNote.content ? (
                    <ReactMarkdown
                      remarkPlugins={[remarkGfm]}
                      components={{
                        h1: ({ node, ...props }) => <h1 className="text-lg sm:text-xl font-bold text-white mt-4 mb-2 pb-1 border-b border-white/[0.06]" {...props} />,
                        h2: ({ node, ...props }) => <h2 className="text-base sm:text-lg font-semibold text-white mt-3 mb-1.5" {...props} />,
                        h3: ({ node, ...props }) => <h3 className="text-sm sm:text-base font-medium text-neutral-300 mt-2 mb-1" {...props} />,
                        p: ({ node, ...props }) => <p className="mb-2 leading-relaxed text-neutral-300" {...props} />,
                        ul: ({ node, ...props }) => <ul className="list-disc pl-5 mb-2 space-y-1 text-neutral-300" {...props} />,
                        ol: ({ node, ...props }) => <ol className="list-decimal pl-5 mb-2 space-y-1 text-neutral-300" {...props} />,
                        blockquote: ({ node, ...props }) => <blockquote className="border-l-2 border-neutral-500 pl-3 py-0.5 italic text-neutral-400 my-2" {...props} />,
                        code: ({ node, ...props }) => <code className="bg-white/[0.06] text-neutral-200 px-1 py-0.5 rounded text-[11.5px] sm:text-[12px] font-mono break-all" {...props} />,
                      }}
                    >
                      {activeNote.content}
                    </ReactMarkdown>
                  ) : (
                    <span className="text-neutral-600 font-mono text-xs">Empty note. Click to start drafting...</span>
                  )}
                </div>
              ) : (
                <textarea
                  ref={textareaRef}
                  value={activeNote.content}
                  onChange={(e) => handleContentChange(e.target.value)}
                  placeholder="Draft ideas, blueprints, prompt directives, or code here..."
                  className="w-full flex-1 bg-transparent text-[13.5px] sm:text-[14.5px] text-neutral-200 placeholder-neutral-600 outline-none resize-none leading-relaxed font-mono [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [scrollbar-width:thin]"
                  spellCheck={false}
                />
              )}

              {/* Status Intel & In-Place Clean Action (Safe Responsive Wrap) */}
              <div className="pt-2.5 sm:pt-3 border-t border-white/[0.04] flex flex-wrap items-center justify-between gap-2 text-[10.5px] sm:text-[11px] font-mono text-neutral-500 select-none shrink-0">
                <div className="flex items-center gap-2 sm:gap-3">
                  <span>{activeNote.content ? activeNote.content.trim().split(/\s+/).filter(Boolean).length : 0} words</span>
                  <span>•</span>
                  
                  <button
                    type="button"
                    onClick={() => handleSmartStructure()}
                    disabled={isFormatting || !activeNote.content.trim()}
                    className="text-neutral-400 hover:text-white font-sans cursor-pointer transition-colors disabled:opacity-40 flex items-center gap-1.5"
                    title="Organize headings, bullet points, and code blocks using AI"
                  >
                    <span>{isFormatting ? 'Formatting...' : '✨ Auto-Structure'}</span>
                  </button>
                </div>

                <div className="flex items-center gap-1.5 text-neutral-500 font-mono text-[10px] sm:text-[10.5px] ml-auto">
                  {saveStatus === 'saving' ? (
                    <>
                      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
                      <span className="text-neutral-400">Saving...</span>
                    </>
                  ) : (
                    <span className="text-neutral-500 flex items-center gap-1">
                      <span>🔒</span> Locally Encrypted
                    </span>
                  )}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs font-mono text-neutral-500">
              No note selected.
            </div>
          )}
        </main>
      </div>

      {/* 3. Ephemeral Device Sync Modal */}
      {isBridgeOpen && (
        <div
          className="fixed inset-0 z-[80] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-100"
          onClick={() => {
            setIsLangMenuOpen(false);
            setIsBridgeOpen(false);
          }}
        >
          <div
            className="w-full max-w-[390px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 [scrollbar-width:none]"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between border-b border-white/[0.05] pb-2.5">
              <span className="text-xs font-semibold text-white">Ephemeral Device Bridge</span>
              <div className="flex items-center gap-2">
                {!showHowItWorks && (
                  <button
                    type="button"
                    onClick={() => setShowHowItWorks(true)}
                    className="text-[11px] font-sans text-neutral-400 hover:text-white transition-colors cursor-pointer"
                  >
                    How it works?
                  </button>
                )}
                <button
                  onClick={() => setIsBridgeOpen(false)}
                  className="text-neutral-500 hover:text-white text-xs cursor-pointer"
                >
                  ✕
                </button>
              </div>
            </div>

            {showHowItWorks ? (
              <div className="space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-medium text-white">{SYNC_GUIDES[guideLang].title}</span>
                  
                  <div className="relative" ref={langDropdownRef}>
                    <button
                      type="button"
                      onClick={() => setIsLangMenuOpen(!isLangMenuOpen)}
                      className="h-7 px-2.5 rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-[11px] text-neutral-300 font-sans flex items-center gap-1.5 cursor-pointer transition-all"
                    >
                      <span>{currentLangObj.native}</span>
                      <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-neutral-400">
                        <polyline points="6 9 12 15 18 9" />
                      </svg>
                    </button>

                    {isLangMenuOpen && (
                      <div className="absolute right-0 mt-1.5 w-44 max-h-52 overflow-y-auto bg-[#121316] border border-white/[0.1] rounded-xl shadow-2xl p-1 z-50 space-y-0.5 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 animate-in fade-in zoom-in-95 duration-100">
                        {SUPPORTED_LANGS.map((lang) => (
                          <button
                            key={lang.code}
                            type="button"
                            onClick={() => {
                              setGuideLang(lang.code);
                              setIsLangMenuOpen(false);
                            }}
                            className={`w-full px-2.5 py-1.5 text-left rounded-lg text-xs font-sans flex items-center justify-between transition-colors ${
                              guideLang === lang.code
                                ? 'bg-white/[0.08] text-white font-medium'
                                : 'text-neutral-400 hover:bg-white/[0.04] hover:text-neutral-200'
                            }`}
                          >
                            <span>{lang.native}</span>
                            <span className="text-[10px] font-mono text-neutral-500 uppercase">{lang.code}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                <ol className="list-decimal pl-4 space-y-2 text-xs text-neutral-400 leading-relaxed font-sans">
                  {SYNC_GUIDES[guideLang].steps.map((st, idx) => (
                    <li key={idx}>{st}</li>
                  ))}
                </ol>

                <button
                  type="button"
                  onClick={() => setShowHowItWorks(false)}
                  className="w-full h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] text-white text-xs font-medium transition-all cursor-pointer"
                >
                  Got it
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="grid grid-cols-2 p-1 bg-white/[0.03] border border-white/[0.05] rounded-lg text-xs">
                  <button
                    type="button"
                    onClick={() => setBridgeTab('push')}
                    className={`py-1 rounded-md transition-all cursor-pointer ${
                      bridgeTab === 'push' ? 'bg-white text-black font-semibold' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Push (Send)
                  </button>
                  <button
                    type="button"
                    onClick={() => setBridgeTab('pull')}
                    className={`py-1 rounded-md transition-all cursor-pointer ${
                      bridgeTab === 'pull' ? 'bg-white text-black font-semibold' : 'text-neutral-400 hover:text-white'
                    }`}
                  >
                    Pull (Receive)
                  </button>
                </div>

                {bridgeTab === 'push' ? (
                  <div className="space-y-3">
                    <p className="text-[11.5px] text-neutral-400 leading-relaxed">
                      Generate a single-use 4-digit code. Claim it on any other phone or laptop within 10 minutes.
                    </p>

                    {transferCode ? (
                      <div className="p-4 bg-white/[0.02] border border-white/[0.1] rounded-xl text-center space-y-1">
                        <span className="text-[10px] font-mono text-neutral-500 uppercase">Single-Use Code</span>
                        <div className="text-3xl font-mono font-bold tracking-[0.25em] text-white py-1 select-all">
                          {transferCode}
                        </div>
                        <div className="text-[10.5px] font-mono text-amber-400">
                          Expires in: {Math.floor(timeRemaining / 60)}:{(timeRemaining % 60).toString().padStart(2, '0')}
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handlePushBridge}
                        disabled={isPushing}
                        className="w-full h-9 rounded-lg bg-white text-black font-semibold text-xs transition-all hover:bg-neutral-200 cursor-pointer disabled:opacity-50"
                      >
                        {isPushing ? 'Generating PIN...' : 'Generate 4-Digit Code'}
                      </button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <p className="text-[11.5px] text-neutral-400 leading-relaxed">
                      Enter the 4-digit code generated from your primary device.
                    </p>
                    <input
                      type="text"
                      maxLength={4}
                      value={pullInputCode}
                      onChange={(e) => setPullInputCode(e.target.value.replace(/[^0-9]/g, ''))}
                      placeholder="e.g. 7291"
                      className="w-full h-10 bg-white/[0.03] border border-white/[0.08] rounded-lg text-center font-mono text-lg font-bold tracking-widest text-white outline-none focus:border-white/30"
                    />
                    <button
                      type="button"
                      onClick={handlePullBridge}
                      disabled={isPulling || pullInputCode.length < 4}
                      className="w-full h-9 rounded-lg bg-white text-black font-semibold text-xs transition-all hover:bg-neutral-200 cursor-pointer disabled:opacity-40"
                    >
                      {isPulling ? 'Claiming notes...' : 'Claim Notes'}
                    </button>
                  </div>
                )}

                {bridgeStatusMsg && (
                  <div
                    className={`p-2 rounded-lg text-xs font-mono text-center ${
                      bridgeStatusMsg.type === 'success'
                        ? 'bg-emerald-500/10 text-emerald-400'
                        : 'bg-rose-500/10 text-rose-400'
                    }`}
                  >
                    {bridgeStatusMsg.text}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. Create Note Modal */}
      {isCreateModalOpen && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-100"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div
            className="w-full max-w-[360px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white tracking-tight">
                Create New Scratchpad
              </h4>
              <p className="text-xs text-neutral-400 font-sans">
                Give your note a title to keep your workspace organized.
              </p>
            </div>

            <input
              ref={createInputRef}
              type="text"
              value={newNoteTitleInput}
              onChange={(e) => setNewNoteTitleInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmCreateNote()}
              placeholder="e.g. System Architecture Blueprint"
              className="w-full h-10 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 text-xs text-white placeholder-neutral-600 outline-none focus:border-white/30 font-sans"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="flex-1 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmCreateNote}
                className="flex-1 h-8 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors cursor-pointer shadow-sm"
              >
                Create Note
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Rename Note Modal */}
      {notePendingRename && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-100"
          onClick={() => setNotePendingRename(null)}
        >
          <div
            className="w-full max-w-[360px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1">
              <h4 className="text-sm font-semibold text-white tracking-tight">
                Rename Scratchpad
              </h4>
              <p className="text-xs text-neutral-400 font-sans">
                Enter a new title for this note.
              </p>
            </div>

            <input
              ref={renameInputRef}
              type="text"
              value={renameTitleInput}
              onChange={(e) => setRenameTitleInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleConfirmRenameNote()}
              placeholder="Enter note title..."
              className="w-full h-10 bg-white/[0.03] border border-white/[0.08] rounded-xl px-3 text-xs text-white placeholder-neutral-600 outline-none focus:border-white/30 font-sans"
            />

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNotePendingRename(null)}
                className="flex-1 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmRenameNote}
                className="flex-1 h-8 rounded-lg bg-white text-black text-xs font-semibold hover:bg-neutral-200 transition-colors cursor-pointer shadow-sm"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Safe Delete Confirmation Dialog Modal */}
      {notePendingDelete && (
        <div
          className="fixed inset-0 z-[90] bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 animate-in fade-in duration-100"
          onClick={() => setNotePendingDelete(null)}
        >
          <div
            className="w-full max-w-[340px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.08] rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h4 className="text-sm font-semibold text-white tracking-tight">
                Delete Note?
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed font-sans">
                This will permanently erase <strong className="text-white">"{notePendingDelete.title}"</strong> from your browser's local storage. This action cannot be undone.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => setNotePendingDelete(null)}
                className="flex-1 h-8 rounded-lg bg-white/[0.05] hover:bg-white/[0.1] text-xs font-medium text-neutral-300 transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={confirmDeleteNote}
                className="flex-1 h-8 rounded-lg bg-rose-500 hover:bg-rose-600 text-xs font-semibold text-white transition-colors cursor-pointer shadow-sm"
              >
                Delete Note
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}