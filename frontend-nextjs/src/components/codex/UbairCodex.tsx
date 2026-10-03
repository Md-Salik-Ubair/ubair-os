'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

// -------------------------------------------------------------
// 1. Data Contracts (Synchronized with Backend Engine)
// -------------------------------------------------------------
interface InteractiveCheckpoint {
  question: string;
  hint: string;
  solution: string;
}

interface ChapterItem {
  chapter_id: number;
  title: string;
  analogies: string[];
  core_theory_markdown: string;
  diagram_ascii?: string | null;
  exam_pitfalls: string[];
  interactive_checkpoint: InteractiveCheckpoint;
}

interface ArenaBridgePayload {
  topic: string;
  core_principles: string[];
  exam_pitfalls?: string[];
}

interface CodexBook {
  book_title: string;
  subtitle: string;
  target_horizon: string;
  target_depth: string;
  language: string;
  reading_time_minutes: number;
  executive_summary: string;
  chapters: ChapterItem[];
  arena_bridge: ArenaBridgePayload;
}

interface ClarificationData {
  is_valid_domain: boolean;
  needs_clarification: boolean;
  detected_domain?: string;
  clarification_question?: string;
  suggested_focus_scopes: string[];
  calibrated_title: string;
  target_horizon: string;
  target_depth: string;
  target_language: string;
}

interface QuotaState {
  used_books: number;
  max_books: number;
  remaining_books: number;
  used_expansions: number;
  max_expansions: number;
  remaining_expansions: number;
  used_mentors: number;
  max_mentors: number;
  remaining_mentors: number;
  role: 'free' | 'pro' | 'admin';
}

interface UbairCodexProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userTier?: 'free' | 'pro' | 'admin';
  onLaunchArena?: (topic: string, principles?: string[], pitfalls?: string[]) => void;
}

interface MentorMessage {
  role: 'user' | 'assistant';
  content: string;
}

// -------------------------------------------------------------
// Safe Native Syntax Highlighter (VS Code Studio Palette)
// -------------------------------------------------------------
function highlightCodeLine(line: string): React.ReactNode {
  if (!line) return <span>&nbsp;</span>;

  const commentMatch = line.match(/(.*?)(\/\/.*|#.*)$/);
  const codeSegment = commentMatch ? commentMatch[1] : line;
  const commentSegment = commentMatch ? commentMatch[2] : null;

  const tokenRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[a-zA-Z_]\w*|\d+|[^\s\w]|\s+)/g;
  const tokens = codeSegment.match(tokenRegex) || [codeSegment];

  const renderedTokens = tokens.map((token, idx) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return <span key={idx} className="text-emerald-400 font-normal">{token}</span>;
    }
    if (/^(return|if|else|elif|while|for|switch|case|break|continue|default|sizeof|import|from|class|def|in|async|await|try|except|catch|finally|throw)$/.test(token)) {
      return <span key={idx} className="text-rose-400 font-medium">{token}</span>;
    }
    if (/^(int|float|double|char|void|bool|size_t|long|short|unsigned|struct|const|static|auto|NULL|nullptr|true|false|True|False|None|let|var|str|list|dict|set|tuple|self)$/.test(token)) {
      return <span key={idx} className="text-cyan-400 font-medium">{token}</span>;
    }
    if (/^(malloc|free|calloc|realloc|memcpy|memset|strlen|strcpy|strncpy|printf|scanf|print|range|len|input|open|append|push|pop|console|log)$/.test(token)) {
      return <span key={idx} className="text-amber-300 font-medium">{token}</span>;
    }
    if (/^\d+$/.test(token)) {
      return <span key={idx} className="text-orange-400">{token}</span>;
    }
    return <span key={idx} className="text-neutral-200">{token}</span>;
  });

  return (
    <>
      {renderedTokens}
      {commentSegment && <span className="text-neutral-500 italic">{commentSegment}</span>}
    </>
  );
}

// Inline Math & Rich Text Helper Component
function CodexRichText({ content, className = '' }: { content: string; className?: string }) {
  if (!content) return null;
  return (
    <span className={className}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false }]]}
        components={{
          p: ({ node, ...props }: any) => <span className="leading-relaxed" {...props} />,
          strong: ({ node, ...props }: any) => <strong className="font-semibold text-white" {...props} />,
          code: ({ node, ...props }: any) => (
            <code className="bg-white/[0.08] px-1.5 py-0.5 rounded text-cyan-300 font-mono text-[12px]" {...props} />
          )
        } as any}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
}

export default function UbairCodex({ isOpen, onClose, userEmail = '', userTier, onLaunchArena }: UbairCodexProps) {
  const [phase, setPhase] = useState<'setup' | 'clarification' | 'loading' | 'reader' | 'completed'>('setup');
  const [topicPrompt, setTopicPrompt] = useState('');
  const [selectedHorizon, setSelectedHorizon] = useState<string | null>(null);
  const [selectedLanguage, setSelectedLanguage] = useState<'English' | 'Hinglish' | 'Other'>('English');
  const [customLanguage, setCustomLanguage] = useState('');

  // Live Quota & Telemetry State
  const [quotaInfo, setQuotaInfo] = useState<QuotaState | null>(null);
  const [resetCountdown, setResetCountdown] = useState<string>('');
  const [quotaExceededModal, setQuotaExceededModal] = useState<{ isOpen: boolean; message: string } | null>(null);

  // Clarification Gate State
  const [clarificationData, setClarificationData] = useState<ClarificationData | null>(null);

  // Book State & Active Chapter
  const [book, setBook] = useState<CodexBook | null>(null);
  const [activeChapterIndex, setActiveChapterIndex] = useState<number>(0);
  const [copiedDiagram, setCopiedDiagram] = useState<boolean>(false);
  const [checkpointState, setCheckpointState] = useState<Record<number, { hint: boolean; solution: boolean }>>({});

  // Dynamic Chapter Expansion
  const [isExpandingChapter, setIsExpandingChapter] = useState<boolean>(false);

  // Native Client-Side Audiobook (Speech Synthesis)
  const [isSpeaking, setIsSpeaking] = useState<boolean>(false);

  // Telemetry & Metrics
  const [loadingElapsed, setLoadingElapsed] = useState<number>(0);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Modals Guarding
  const [showExitModal, setShowExitModal] = useState<boolean>(false);
  const [showArenaConfirmModal, setShowArenaConfirmModal] = useState<boolean>(false);
  const [showNewTopicModal, setShowNewTopicModal] = useState<boolean>(false);

  // Floating Ubair Mentor Chatbot
  const [isMentorOpen, setIsMentorOpen] = useState<boolean>(false);
  const [mentorInput, setMentorInput] = useState<string>('');
  const [mentorMessages, setMentorMessages] = useState<MentorMessage[]>([]);
  const [isMentorThinking, setIsMentorThinking] = useState<boolean>(false);
  const mentorScrollRef = useRef<HTMLDivElement | null>(null);

  const abortControllerRef = useRef<AbortController | null>(null);
  const readerScrollRef = useRef<HTMLDivElement | null>(null);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  // -------------------------------------------------------------
  // Identity Resolver (Founder & Multi-Account Safe)
  // -------------------------------------------------------------
  const resolveUserEmail = useCallback((): string => {
    if (userEmail && userEmail.trim()) {
      return userEmail.trim().toLowerCase();
    }
    if (typeof window !== 'undefined') {
      const stored = 
        localStorage.getItem('ubair_user_email') || 
        localStorage.getItem('user_email') || 
        localStorage.getItem('email');
      if (stored && stored.trim()) {
        return stored.trim().toLowerCase();
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && key.includes('auth-token')) {
          try {
            const parsed = JSON.parse(localStorage.getItem(key) || '{}');
            if (parsed?.user?.email) {
              return parsed.user.email.toLowerCase();
            }
          } catch {}
        }
      }
    }
    return 'mdsalikubair@gmail.com';
  }, [userEmail]);

  // Fetch Live Codex Quota
  const fetchQuota = useCallback(async () => {
    try {
      const email = resolveUserEmail();
      const res = await fetch(`${API_BASE}/api/codex/quota?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        setQuotaInfo({
          used_books: data.used_books ?? 0,
          max_books: data.max_books ?? 5,
          remaining_books: data.remaining_books ?? 0,
          used_expansions: data.used_expansions ?? 0,
          max_expansions: data.max_expansions ?? 10,
          remaining_expansions: data.remaining_expansions ?? 0,
          used_mentors: data.used_mentors ?? 0,
          max_mentors: data.max_mentors ?? 30,
          remaining_mentors: data.remaining_mentors ?? 0,
          role: data.role || (email === 'mdsalikubair@gmail.com' ? 'admin' : (userTier || 'free'))
        });
      }
    } catch {}
  }, [resolveUserEmail, userTier, API_BASE]);

  useEffect(() => {
    if (isOpen) {
      fetchQuota();
    }
  }, [isOpen, fetchQuota]);

  // Live UTC Reset Countdown
  useEffect(() => {
    const calcTime = () => {
      const now = new Date();
      const midnight = new Date();
      midnight.setUTCHours(24, 0, 0, 0);
      const diff = midnight.getTime() - now.getTime();
      if (diff <= 0) {
        setResetCountdown('Resetting...');
        return;
      }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setResetCountdown(`${h}h ${m}m`);
    };

    calcTime();
    const interval = setInterval(calcTime, 30000);
    return () => clearInterval(interval);
  }, []);

  const normalizeAscii = (text?: string | null): string => {
    if (!text) return '';
    return text
      .replace(/\\r\\n/g, '\n')
      .replace(/\\n/g, '\n')
      .replace(/\\t/g, '    ')
      .replace(/^["']|["']$/g, '');
  };

  const cleanMentorContent = (text: string): string => {
    if (!text) return '';
    let cleaned = text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
    if (cleaned.toLowerCase().includes('<think>')) {
      cleaned = cleaned.replace(/<think>[\s\S]*$/gi, '').trim();
    }
    return cleaned || text;
  };

  // URL Synchronization
  const syncUrlState = useCallback((targetPhase: string, chapterIdx?: number) => {
    if (typeof window === 'undefined') return;
    const url = new URL(window.location.href);

    if (isOpen) {
      url.searchParams.set('view', 'codex');
      url.searchParams.set('stage', targetPhase);
      if (targetPhase === 'reader' && typeof chapterIdx === 'number') {
        url.searchParams.set('ch', String(chapterIdx + 1));
      } else {
        url.searchParams.delete('ch');
      }
    } else {
      url.searchParams.delete('view');
      url.searchParams.delete('stage');
      url.searchParams.delete('ch');
    }
    window.history.replaceState({}, '', url.toString());
  }, [isOpen]);

  useEffect(() => {
    syncUrlState(phase, activeChapterIndex);
  }, [phase, activeChapterIndex, syncUrlState]);

  // Loading Telemetry Seconds Tracker
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (phase === 'loading') {
      setLoadingElapsed(0);
      const start = Date.now();
      interval = setInterval(() => {
        setLoadingElapsed(Number(((Date.now() - start) / 1000).toFixed(1)));
      }, 100);
    } else {
      setLoadingElapsed(0);
    }
    return () => clearInterval(interval);
  }, [phase]);

  // Ephemeral Reset Guard on Reload/Navigation
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (phase === 'loading' || ((phase === 'reader' || phase === 'completed') && book)) {
        e.preventDefault();
        e.returnValue = 'Codex synthesis or reading session is active. Discard current session?';
        return e.returnValue;
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase, book]);

  useEffect(() => {
    if (isOpen) {
      setPhase('setup');
      setErrorMessage(null);
      setShowExitModal(false);
      setShowArenaConfirmModal(false);
      setShowNewTopicModal(false);
      setIsMentorOpen(false);
      setMentorMessages([]);
      if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
        window.speechSynthesis.cancel();
      }
      setIsSpeaking(false);
    }
  }, [isOpen]);

  // Native Client-Side Audiobook Speech Handler
  const handleToggleListenChapter = () => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window) || !currentChapter) return;

    if (isSpeaking) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
      return;
    }

    window.speechSynthesis.cancel();
    const cleanText = `${currentChapter.title}. ${currentChapter.core_theory_markdown.replace(/[#*`_~\[\]]/g, '')}`;
    const utterance = new SpeechSynthesisUtterance(cleanText);
    utterance.rate = 1.0;
    utterance.pitch = 1.0;
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
    setIsSpeaking(true);
  };

  const handleExitTrigger = () => {
    if (phase === 'loading' || phase === 'reader' || phase === 'completed') {
      setShowExitModal(true);
    } else {
      handleCloseCodex();
    }
  };

  const handleCloseCodex = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
    setIsSpeaking(false);
    setShowExitModal(false);
    setShowArenaConfirmModal(false);
    setShowNewTopicModal(false);
    setIsMentorOpen(false);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('view');
      url.searchParams.delete('stage');
      url.searchParams.delete('ch');
      window.history.replaceState({}, '', url.toString());
    }
    onClose();
  };

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        if (quotaExceededModal?.isOpen) {
          setQuotaExceededModal(null);
        } else if (isMentorOpen) {
          setIsMentorOpen(false);
        } else if (showNewTopicModal) {
          setShowNewTopicModal(false);
        } else if (showArenaConfirmModal) {
          setShowArenaConfirmModal(false);
        } else if (showExitModal) {
          setShowExitModal(false);
        } else {
          handleExitTrigger();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, phase, showExitModal, showArenaConfirmModal, showNewTopicModal, isMentorOpen, quotaExceededModal]);

  useEffect(() => {
    if (readerScrollRef.current) {
      readerScrollRef.current.scrollTop = 0;
    }
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    }
  }, [activeChapterIndex]);

  useEffect(() => {
    if (mentorScrollRef.current) {
      mentorScrollRef.current.scrollTop = mentorScrollRef.current.scrollHeight;
    }
  }, [mentorMessages, isMentorThinking]);

  if (!isOpen) return null;

  const validatePromptIntegrity = (text: string): string | null => {
    const trimmed = text.trim();
    if (trimmed.length < 2) {
      return 'Please enter a valid study subject, theory, or academic domain.';
    }
    if (trimmed.length > 800) {
      return 'Topic prompt exceeds maximum allowable length (800 characters).';
    }
    if (/^\.+$/.test(trimmed) || trimmed.replace(/[^a-zA-Z0-9]/g, '').length < 2) {
      return 'Input cannot be dots or symbols alone. Try topics like "Distributed Consensus", "Cardiovascular Physiology", or "Transformers".';
    }
    if (selectedLanguage === 'Other' && !customLanguage.trim()) {
      return 'Please specify your preferred language.';
    }
    return null;
  };

  const getEffectiveLanguage = (): string => {
    if (selectedLanguage === 'Other') {
      return customLanguage.trim() || 'English';
    }
    return selectedLanguage;
  };

  const handleInitiateClarification = async (overridePrompt?: string) => {
    const cleanPrompt = (overridePrompt || topicPrompt).trim();
    const validationError = validatePromptIntegrity(cleanPrompt);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    setErrorMessage(null);
    setPhase('loading');

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const resolvedLang = getEffectiveLanguage();
    const emailToUse = resolveUserEmail();

    try {
      const res = await fetch(`${API_BASE}/api/codex/clarify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: cleanPrompt,
          horizon: selectedHorizon || undefined,
          language: resolvedLang,
          user_email: emailToUse
        }),
        signal: controller.signal
      });

      const data = await res.json();

      if (res.status === 403 && data.detail?.upgrade_required) {
        setQuotaExceededModal({
          isOpen: true,
          message: data.detail.message || 'Daily limit reached.'
        });
        setPhase('setup');
        return;
      }

      if (!res.ok) {
        const errorDetail = typeof data.detail === 'string' ? data.detail : (data.detail?.message || 'Neural nodes adjusting. Please retry.');
        throw new Error(errorDetail);
      }

      const rawCalib = data.clarification || data;

      const calib: ClarificationData = {
        is_valid_domain: rawCalib.is_valid_domain ?? rawCalib.is_valid_topic ?? true,
        needs_clarification: Boolean(rawCalib.needs_clarification),
        detected_domain: rawCalib.detected_domain || rawCalib.domain || 'TECH_PROGRAMMING',
        clarification_question: rawCalib.clarification_question || rawCalib.clarification_prompt || `Which angle of ${cleanPrompt} would you like to master?`,
        suggested_focus_scopes: rawCalib.suggested_focus_scopes || rawCalib.suggested_focus_areas || [],
        calibrated_title: rawCalib.calibrated_title || cleanPrompt,
        target_horizon: rawCalib.target_horizon || selectedHorizon || 'General Mastery',
        target_depth: rawCalib.target_depth || 'Foundational',
        target_language: rawCalib.target_language || resolvedLang
      };

      if (!calib.is_valid_domain) {
        setErrorMessage(calib.clarification_question || 'Invalid domain. Please enter an academic or technical topic.');
        setPhase('setup');
        return;
      }

      if (calib.needs_clarification && calib.suggested_focus_scopes?.length > 0) {
        setClarificationData(calib);
        setPhase('clarification');
      } else {
        await executeBookCompilation(calib.calibrated_title || cleanPrompt, resolvedLang);
      }
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Connection lost. Please retry.');
        setPhase('setup');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const executeBookCompilation = async (finalTopic: string, lang: string) => {
    setPhase('loading');
    setErrorMessage(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const emailToUse = resolveUserEmail();

    try {
      const res = await fetch(`${API_BASE}/api/codex/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          topic: finalTopic,
          horizon: selectedHorizon || 'General Mastery',
          depth: 'Foundational',
          language: lang,
          chapter_count: 3,
          user_email: emailToUse
        }),
        signal: controller.signal
      });

      const data = await res.json();

      if (res.status === 403 && data.detail?.upgrade_required) {
        setQuotaExceededModal({
          isOpen: true,
          message: data.detail.message || 'Daily book limit reached. Upgrade to Pro for 50 books/day.'
        });
        setPhase('setup');
        return;
      }

      if (!res.ok) {
        const errorDetail = typeof data.detail === 'string' ? data.detail : (data.detail?.message || 'Textbook synthesis timed out. Please retry.');
        throw new Error(errorDetail);
      }

      if (!data.book || !data.book.chapters?.length) {
        throw new Error('Failed to generate textbook chapters. Please retry.');
      }

      setBook(data.book);
      setActiveChapterIndex(0);
      setCheckpointState({});
      setMentorMessages([]);
      setPhase('reader');
      fetchQuota();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Synthesis failed. Please refine your subject.');
        setPhase('setup');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  const handleExtendBook = async () => {
    if (!book || isExpandingChapter) return;

    setIsExpandingChapter(true);
    const emailToUse = resolveUserEmail();
    const existingChaptersPayload = book.chapters.map(c => ({
      chapter_id: c.chapter_id,
      title: c.title
    }));

    try {
      const res = await fetch(`${API_BASE}/api/codex/expand`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_title: book.book_title,
          existing_chapters: existingChaptersPayload,
          horizon: book.target_horizon,
          depth: 'Deep Dive / Advanced Mechanics',
          language: book.language,
          user_email: emailToUse
        })
      });

      const data = await res.json();

      if (res.status === 403 && data.detail?.upgrade_required) {
        setQuotaExceededModal({
          isOpen: true,
          message: data.detail.message || 'Daily chapter expansion limit reached. Upgrade to Pro for 150 expansions/day.'
        });
        return;
      }

      if (!res.ok || !data.chapter) throw new Error(data.detail || 'Could not compile next chapter.');

      const newChapter: ChapterItem = data.chapter;
      setBook(prev => {
        if (!prev) return prev;
        return {
          ...prev,
          reading_time_minutes: prev.reading_time_minutes + 6,
          chapters: [...prev.chapters, newChapter]
        };
      });
      setActiveChapterIndex(book.chapters.length);
      fetchQuota();
    } catch {
      alert('Could not extend textbook further right now. Please retry in a moment.');
    } finally {
      setIsExpandingChapter(false);
    }
  };

  const handleSelectScope = (scope: string) => {
    const refined = `${clarificationData?.calibrated_title || topicPrompt}: ${scope}`;
    setTopicPrompt(refined);
    setClarificationData(null);
    executeBookCompilation(refined, getEffectiveLanguage());
  };

  const handleConfirmNewTopic = () => {
    setShowNewTopicModal(false);
    setBook(null);
    setTopicPrompt('');
    setSelectedHorizon(null);
    setClarificationData(null);
    setIsMentorOpen(false);
    setMentorMessages([]);
    setPhase('setup');
    fetchQuota();
  };

  const handlePrintPDF = () => {
    window.print();
  };

  const handleTransitionToArena = () => {
    if (!book) return;
    setShowArenaConfirmModal(false);
    handleCloseCodex();
    if (onLaunchArena) {
      const accumulatedPitfalls = book.chapters.flatMap(c => c.exam_pitfalls || []);
      onLaunchArena(
        book.arena_bridge?.topic || book.book_title,
        book.arena_bridge?.core_principles || [],
        accumulatedPitfalls
      );
    }
  };

  const handleSendMentorQuery = async (e: React.FormEvent) => {
    e.preventDefault();
    const query = mentorInput.trim();
    if (!query || !book || !currentChapter || isMentorThinking) return;

    const userMessage: MentorMessage = { role: 'user', content: query };
    setMentorMessages(prev => [...prev, userMessage]);
    setMentorInput('');
    setIsMentorThinking(true);
    const emailToUse = resolveUserEmail();

    try {
      const res = await fetch(`${API_BASE}/api/codex/mentor`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          book_title: book.book_title,
          chapter_title: currentChapter.title,
          chapter_content: currentChapter.core_theory_markdown || 'Core conceptual principles.',
          history: mentorMessages.map(m => ({ role: m.role, content: m.content })),
          question: query,
          language: book.language,
          user_email: emailToUse
        })
      });

      const data = await res.json();

      if (res.status === 403 && data.detail?.upgrade_required) {
        setMentorMessages(prev => [...prev, { 
          role: 'assistant', 
          content: `⚠️ **Daily Mentor Limit Reached**: ${data.detail.message || 'You have exhausted your mentor queries for today.'}` 
        }]);
        return;
      }

      if (!res.ok) throw new Error('Mentor unreachable');
      const replyContent = data.reply || data.response || data.answer || data.content || 'Verify core principles before proceeding.';
      setMentorMessages(prev => [...prev, { role: 'assistant', content: replyContent }]);
      fetchQuota();
    } catch {
      setMentorMessages(prev => [...prev, { role: 'assistant', content: 'Mentor node is re-calibrating. Re-examine the active chapter principles.' }]);
    } finally {
      setIsMentorThinking(false);
    }
  };

  const currentChapter = book?.chapters[activeChapterIndex];

  return (
    <div className="fixed inset-0 z-50 bg-[#07080b] text-neutral-200 flex flex-col font-sans select-none overflow-hidden antialiased animate-in fade-in duration-150">
      
      {/* ----------------- Stylesheet (KaTeX Math & Print Vault) ----------------- */}
      <style dangerouslySetInnerHTML={{ __html: `
        .katex {
          font-size: 1.05em !important;
          color: #f3f4f6 !important;
        }
        .katex-display {
          margin: 0.85em 0 !important;
          overflow-x: auto !important;
          overflow-y: hidden !important;
          padding-bottom: 2px !important;
        }
        @media screen {
          #codex-print-vault {
            display: none !important;
          }
        }
        @media print {
          @page {
            size: A4 portrait;
            margin: 14mm 14mm 14mm 14mm;
          }
          html, body {
            height: auto !important;
            overflow: visible !important;
            background: #ffffff !important;
            color: #111827 !important;
            margin: 0 !important;
            padding: 0 !important;
            font-size: 10pt !important;
            line-height: 1.55 !important;
          }
          body > *, #__next, .fixed, main, aside, section, article {
            position: static !important;
            overflow: visible !important;
            height: auto !important;
            max-height: none !important;
          }
          body * {
            visibility: hidden !important;
          }
          #codex-print-vault, #codex-print-vault * {
            visibility: visible !important;
          }
          #codex-print-vault {
            display: block !important;
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            margin: 0 !important;
            padding: 0 !important;
            background: #ffffff !important;
            color: #111827 !important;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif !important;
          }
          .codex-cover-page {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
            page-break-after: always !important;
            break-after: page !important;
            padding-bottom: 20px !important;
          }
          .codex-chapter-page {
            page-break-before: always !important;
            break-before: page !important;
            padding-top: 8px !important;
            margin-bottom: 24px !important;
          }
          .codex-no-split {
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          table {
            border-collapse: collapse !important;
            width: 100% !important;
            margin: 14px 0 !important;
            font-size: 9pt !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          th, td {
            border: 1px solid #d1d5db !important;
            padding: 6px 10px !important;
            text-align: left !important;
          }
          th {
            background-color: #f3f4f6 !important;
            font-weight: 600 !important;
            color: #111827 !important;
          }
          pre {
            background: #f8fafc !important;
            border: 1px solid #e2e8f0 !important;
            padding: 10px 14px !important;
            font-family: monospace !important;
            font-size: 8.5pt !important;
            line-height: 1.4 !important;
            white-space: pre-wrap !important;
            page-break-inside: avoid !important;
            break-inside: avoid !important;
          }
          .katex {
            color: #111827 !important;
          }
        }
      `}} />

      {/* ----------------- Top Header Navigation with Telemetry ----------------- */}
      <header className="h-16 px-6 sm:px-12 flex items-center justify-between shrink-0 bg-[#07080b]/80 backdrop-blur-xl relative z-20 select-none border-b border-white/[0.05]">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0 shadow-[0_0_12px_rgba(6,182,212,0.15)]">
            <img
              src="/assets/ubair-logo.png"
              alt="Ubair OS"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
                e.currentTarget.nextElementSibling?.classList.remove('hidden');
              }}
              className="w-4 h-4 object-contain pointer-events-none drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]"
            />
            <svg
              className="hidden w-3.5 h-3.5 text-cyan-400"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
            </svg>
          </div>

          <div className="flex items-baseline gap-1.5 select-none">
            <span className="text-[15px] font-semibold text-white tracking-tight">Ubair</span>
            <span className="text-[14px] font-semibold bg-gradient-to-r from-cyan-400 via-sky-300 to-indigo-400 bg-clip-text text-transparent">
              Codex
            </span>
          </div>

          {book && (phase === 'reader' || phase === 'completed') && (
            <span className="hidden sm:inline-block text-xs text-neutral-500 font-mono ml-2 truncate max-w-xs">
              / {book.book_title}
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Live Quota Badge */}
          {quotaInfo && (
            <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full bg-white/[0.03] border border-white/[0.08] text-[11px] font-mono mr-1 shadow-inner">
              <span className="text-neutral-500">Allocation:</span>
              {quotaInfo.role === 'admin' || resolveUserEmail() === 'mdsalikubair@gmail.com' ? (
                <span className="text-cyan-400 font-medium">Founder · Unlimited</span>
              ) : (
                <div className="flex items-center gap-1.5 text-neutral-300">
                  <span className={quotaInfo.remaining_books <= 0 ? 'text-rose-400 font-bold' : 'text-neutral-200'}>
                    {quotaInfo.used_books} / {quotaInfo.max_books} Books
                  </span>
                  <span className="text-neutral-600">•</span>
                  <span className="text-cyan-400/90 text-[10px]">Resets in {resetCountdown || '24h'}</span>
                </div>
              )}
            </div>
          )}

          {book && (phase === 'reader' || phase === 'completed') && (
            <>
              {/* Native Speech Synthesis (Audiobook Mode) */}
              <button
                type="button"
                onClick={handleToggleListenChapter}
                className={`h-8 px-3 rounded-lg border text-xs font-medium transition-all flex items-center gap-1.5 cursor-pointer active:scale-95 ${
                  isSpeaking
                    ? 'bg-cyan-500/20 border-cyan-500/50 text-cyan-300 animate-pulse'
                    : 'bg-white/[0.03] hover:bg-white/[0.08] border-white/[0.08] text-neutral-300 hover:text-white'
                }`}
                title="Listen to chapter"
              >
                <span>{isSpeaking ? '⏸' : '🔊'}</span>
                <span>{isSpeaking ? 'Pause' : 'Listen'}</span>
              </button>

              <button
                type="button"
                onClick={handlePrintPDF}
                className="h-8 px-3.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-xs font-medium text-neutral-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Export complete multi-chapter PDF"
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2" />
                  <path d="M6 14h12v8H6z" />
                </svg>
                <span>Export PDF</span>
              </button>

              <button
                type="button"
                onClick={() => setShowArenaConfirmModal(true)}
                className="h-8 px-3.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] hover:border-white/20 text-xs font-medium text-neutral-300 hover:text-white transition-all flex items-center gap-1.5 cursor-pointer active:scale-95"
                title="Test retention in Arena"
              >
                <span>Practice in Arena</span>
                <span className="text-[11px]">→</span>
              </button>
            </>
          )}

          <button
            type="button"
            onClick={handleExitTrigger}
            className="group flex items-center gap-1.5 rounded-lg border border-white/[0.08] hover:border-white/25 bg-white/[0.02] hover:bg-white/[0.06] px-2.5 py-1 text-[11px] font-mono text-neutral-400 hover:text-white transition-all active:scale-95 cursor-pointer shadow-sm"
            title="Exit Codex (Esc)"
          >
            <span className="text-neutral-500 group-hover:text-neutral-300">Esc</span>
            <span>✕</span>
          </button>
        </div>
      </header>

      {/* ----------------- STAGE 1: SETUP VIEW WITH AMBIENT GLOW & PRESETS ----------------- */}
      {phase === 'setup' && (
        <div className="flex-1 overflow-y-auto px-6 py-12 flex flex-col items-center justify-center relative">
          <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[320px] bg-gradient-to-tr from-cyan-500/[0.06] via-indigo-500/[0.04] to-transparent rounded-full blur-[100px] pointer-events-none -z-10" />

          <div className="max-w-2xl w-full space-y-8 animate-in fade-in zoom-in-95 duration-200 text-center sm:text-left relative z-10">
            
            <div className="space-y-3">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-500/[0.08] border border-cyan-500/20 text-[11px] font-mono text-cyan-300 tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400 animate-pulse" />
                Adaptive Ephemeral Manual Synthesizer v6
              </div>

              <h3 className="text-3xl sm:text-4xl font-semibold text-white tracking-tight font-sans leading-tight">
                What are we mastering today?
              </h3>
              <p className="text-xs sm:text-sm text-neutral-400 leading-relaxed font-sans max-w-lg">
                Specify any technical concept, computer science mechanism, or scientific domain to generate a tailored, multi-chapter textbook.
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleInitiateClarification(); }} className="space-y-6">
              <div className="relative group">
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={600}
                  value={topicPrompt}
                  onChange={(e) => {
                    setTopicPrompt(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="e.g. Distributed Consensus, Cardiovascular Physiology, Docker Internals..."
                  className="w-full rounded-2xl border border-white/[0.08] bg-white/[0.02] p-4 text-xs sm:text-sm text-white placeholder-neutral-600 outline-none transition-all focus:border-cyan-500/40 focus:bg-white/[0.03] shadow-inner font-sans"
                />
              </div>

              {/* Quick Topic Presets */}
              <div className="space-y-2 text-left">
                <span className="text-[11px] font-mono tracking-wider text-neutral-500 uppercase">
                  Popular Technical Tracks
                </span>
                <div className="flex flex-wrap gap-2">
                  {[
                    'Transformers & Attention',
                    'Distributed Consensus (Raft)',
                    'Linux Virtual Memory & Paging',
                    'PostgreSQL Indexing Internals'
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => {
                        setTopicPrompt(preset);
                        handleInitiateClarification(preset);
                      }}
                      className="h-7 px-3 rounded-lg border border-white/[0.06] bg-white/[0.015] hover:bg-white/[0.05] hover:border-white/20 text-[11px] font-mono text-neutral-400 hover:text-neutral-200 transition-all cursor-pointer active:scale-95"
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Study Focus Horizon Pills */}
              <div className="space-y-2.5 text-left">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-mono tracking-wider text-neutral-500 uppercase">
                    Study Focus (Optional)
                  </span>
                  {selectedHorizon && (
                    <button
                      type="button"
                      onClick={() => setSelectedHorizon(null)}
                      className="text-[11px] font-mono text-neutral-400 hover:text-white transition-colors cursor-pointer"
                    >
                      Clear
                    </button>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  {[
                    { id: 'Semester Exam', label: 'Semester Exam' },
                    { id: 'Viva Tomorrow (Express)', label: 'Viva Tomorrow (Express)' },
                    { id: 'Deep First-Principles', label: 'Deep First-Principles' }
                  ].map((h) => {
                    const isSelected = selectedHorizon === h.id;
                    return (
                      <button
                        key={h.id}
                        type="button"
                        onClick={() => setSelectedHorizon(isSelected ? null : h.id)}
                        className={`h-8 px-3.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-white text-black font-semibold shadow-sm scale-[1.02]'
                            : 'bg-white/[0.02] border border-white/[0.08] text-neutral-300 hover:text-white hover:bg-white/[0.05]'
                        }`}
                      >
                        {h.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Language Medium Selector */}
              <div className="space-y-2.5 text-left">
                <span className="text-[11px] font-mono tracking-wider text-neutral-500 uppercase">
                  Language Medium
                </span>
                <div className="flex flex-wrap items-center gap-2">
                  {(['English', 'Hinglish', 'Other'] as const).map((lang) => {
                    const isSelected = selectedLanguage === lang;
                    return (
                      <button
                        key={lang}
                        type="button"
                        onClick={() => {
                          setSelectedLanguage(lang);
                          if (errorMessage) setErrorMessage(null);
                        }}
                        className={`h-8 px-3.5 rounded-full text-xs font-medium transition-all duration-150 cursor-pointer select-none ${
                          isSelected
                            ? 'bg-white text-black font-semibold shadow-sm scale-[1.02]'
                            : 'bg-white/[0.03] border border-white/[0.08] text-neutral-300 hover:text-white hover:bg-white/[0.06]'
                        }`}
                      >
                        {lang === 'Other' ? 'Other / Custom' : lang}
                      </button>
                    );
                  })}

                  {selectedLanguage === 'Other' && (
                    <input
                      type="text"
                      autoFocus
                      value={customLanguage}
                      onChange={(e) => setCustomLanguage(e.target.value)}
                      placeholder="e.g. Urdu, German, Hindi..."
                      className="h-8 px-3 rounded-full bg-white/[0.05] border border-white/20 text-xs text-white placeholder-neutral-500 outline-none focus:border-white transition-all font-sans w-44"
                    />
                  )}
                </div>
              </div>

              {errorMessage && (
                <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.03] border border-rose-500/20 text-xs font-sans text-rose-300 flex items-center gap-2.5">
                  <span>⚠️</span>
                  <span>{errorMessage}</span>
                </div>
              )}

              <div className="pt-4 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!topicPrompt.trim()}
                  className={`h-11 px-8 rounded-full text-xs sm:text-sm font-semibold tracking-wide transition-all select-none flex items-center gap-2 cursor-pointer ${
                    topicPrompt.trim()
                      ? 'bg-white text-black hover:bg-neutral-200 shadow-[0_0_24px_rgba(255,255,255,0.18)] active:scale-95'
                      : 'bg-white/[0.04] text-neutral-500 border border-white/[0.08] cursor-not-allowed'
                  }`}
                >
                  <span>Build Codex</span>
                  <span className="text-xs">→</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ----------------- STAGE 2: CLARIFICATION GATE ----------------- */}
      {phase === 'clarification' && clarificationData && (
        <div className="flex-1 overflow-y-auto px-6 py-12 flex flex-col items-center justify-center bg-[#07080b]">
          <div className="max-w-xl w-full space-y-6 animate-in fade-in duration-200 select-none">
            
            <div className="space-y-3">
              <div className="flex items-center gap-3">
                <div className="text-[11px] font-mono tracking-wider flex items-center gap-1.5 text-neutral-400">
                  <span className="text-cyan-400 uppercase font-medium">Focus Calibration</span>
                  <span className="text-neutral-600">/</span>
                  <span className="text-white font-medium capitalize truncate max-w-xs">{clarificationData.calibrated_title || topicPrompt}</span>
                </div>
              </div>

              <h3 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight leading-snug font-sans">
                {clarificationData.clarification_question || `Which track of ${topicPrompt} are we synthesizing?`}
              </h3>
            </div>

            <div className="space-y-2">
              {clarificationData.suggested_focus_scopes.map((scope, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleSelectScope(scope)}
                  className="w-full p-4 rounded-xl bg-white/[0.015] hover:bg-white/[0.05] border border-white/[0.06] hover:border-cyan-500/40 text-left transition-all duration-150 flex items-center justify-between group cursor-pointer active:scale-[0.99] shadow-sm"
                >
                  <div className="flex items-center gap-3.5 min-w-0">
                    <span className="w-6 h-6 rounded-lg bg-white/[0.05] border border-white/[0.1] group-hover:bg-cyan-400 group-hover:text-black font-mono text-[11px] flex items-center justify-center text-neutral-400 group-hover:font-semibold transition-all shrink-0">
                      {idx + 1}
                    </span>
                    <span className="text-xs sm:text-sm font-medium text-neutral-200 group-hover:text-white transition-colors truncate">
                      {scope}
                    </span>
                  </div>

                  <div className="w-5 h-5 rounded-full border border-white/10 group-hover:border-cyan-400/60 group-hover:bg-cyan-500/[0.08] flex items-center justify-center text-transparent group-hover:text-cyan-400 transition-all shrink-0 ml-3">
                    <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                </button>
              ))}
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                const target = (e.currentTarget.elements.namedItem('customCodexScope') as HTMLInputElement)?.value?.trim();
                if (target) handleSelectScope(target);
              }} 
              className="pt-0.5"
            >
              <div className="relative flex items-center bg-white/[0.02] border border-white/[0.08] focus-within:border-cyan-500/40 rounded-xl p-1 transition-all">
                <input
                  name="customCodexScope"
                  type="text"
                  placeholder={`Or enter custom ${topicPrompt} focus area...`}
                  className="w-full h-10 px-3 pr-24 bg-transparent text-xs sm:text-sm text-white placeholder-neutral-500 outline-none font-sans"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 h-8 px-4 rounded-lg bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all cursor-pointer shadow-sm active:scale-95"
                >
                  Apply
                </button>
              </div>
            </form>

            <div className="pt-4 flex items-center justify-between border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="h-9 px-3 rounded-lg text-xs font-mono text-neutral-400 hover:text-white hover:bg-white/[0.04] transition-all cursor-pointer flex items-center gap-1.5"
              >
                <span>←</span>
                <span>Change Topic</span>
              </button>

              <button
                type="button"
                onClick={() => executeBookCompilation(topicPrompt, getEffectiveLanguage())}
                className="h-9 px-5 rounded-full bg-white text-black hover:bg-neutral-200 text-xs font-semibold tracking-wide transition-all cursor-pointer flex items-center gap-2 shadow-[0_0_16px_rgba(255,255,255,0.18)] active:scale-95"
              >
                <span>Compile Full Subject</span>
                <span className="text-[11px]">→</span>
              </button>
            </div>

          </div>
        </div>
      )}

      {/* ----------------- STAGE 3: PRISTINE FOUNDER LOADER ----------------- */}
      {phase === 'loading' && (
        <div className="my-auto py-20 flex flex-col items-center justify-center text-center animate-in fade-in duration-300 select-none max-w-sm w-full px-6 relative mx-auto">
          
          <div className="absolute w-72 h-72 bg-cyan-500/[0.07] rounded-full blur-[80px] pointer-events-none -z-10" />

          <div className="relative w-16 h-16 flex items-center justify-center mb-6">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-white/15 border-t-white" />
          </div>

          <h3 className="text-xl font-medium tracking-tight text-white font-sans mb-7">
            Synthesizing Adaptive Codex
          </h3>

          <div className="w-56 space-y-3.5">
            <div className="w-full h-[1.5px] bg-white/[0.08] rounded-full overflow-hidden relative">
              <div 
                className="h-full bg-gradient-to-r from-transparent via-cyan-400 to-transparent w-24 rounded-full animate-shimmer"
                style={{ animation: 'shimmer 1.6s infinite ease-in-out' }}
              />
            </div>

            <div className="text-[11.5px] font-sans text-neutral-400 tracking-wide">
              {loadingElapsed < 8
                ? 'Analyzing conceptual foundations...'
                : loadingElapsed < 22
                ? 'Synthesizing textbook chapters & mental models...'
                : 'Finalizing interactive checkpoints...'}
            </div>
          </div>

        </div>
      )}

      {/* ----------------- STAGE 4: READER STUDIO ----------------- */}
      {phase === 'reader' && book && (
        <div className="flex-1 flex flex-col md:flex-row overflow-hidden relative">
          
          {/* Left Navigation Sidebar */}
          <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-white/[0.06] bg-[#07080b]/50 backdrop-blur-md p-5 flex flex-col shrink-0 h-full">
            <div className="space-y-1.5 mb-5 shrink-0">
              <span className="text-[11px] font-mono text-neutral-500 tracking-wider">
                {book.target_horizon} · {book.language}
              </span>
              <h2 className="text-base font-semibold text-white leading-snug">
                {book.book_title}
              </h2>
              <p className="text-xs text-neutral-400 line-clamp-2">
                {book.subtitle}
              </p>
            </div>

            {/* Chapter Index */}
            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10">
              <span className="text-[11px] font-mono uppercase text-neutral-500 tracking-wider">
                Chapters
              </span>
              {book.chapters.map((ch, idx) => {
                const isActive = activeChapterIndex === idx;
                return (
                  <button
                    key={ch.chapter_id}
                    type="button"
                    onClick={() => setActiveChapterIndex(idx)}
                    className={`w-full p-3 rounded-xl text-left text-xs transition-all flex items-center justify-between cursor-pointer ${
                      isActive
                        ? 'bg-white text-black font-semibold shadow-md'
                        : 'bg-white/[0.02] hover:bg-white/[0.06] text-neutral-300'
                    }`}
                  >
                    <div className="flex items-center gap-2.5 truncate">
                      <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-mono shrink-0 ${
                        isActive ? 'bg-black text-white' : 'bg-white/10 text-neutral-400'
                      }`}>
                        {idx + 1}
                      </span>
                      <span className="truncate">{ch.title}</span>
                    </div>
                  </button>
                );
              })}

              {/* Chapter Extender Button */}
              <button
                type="button"
                disabled={isExpandingChapter}
                onClick={handleExtendBook}
                className="w-full p-2.5 rounded-xl border border-dashed border-white/15 hover:border-white/30 text-xs font-mono text-neutral-400 hover:text-white transition-all flex items-center justify-center gap-2 mt-2 cursor-pointer disabled:opacity-50"
              >
                {isExpandingChapter ? (
                  <>
                    <div className="w-3 h-3 border-2 border-neutral-400 border-t-white rounded-full animate-spin" />
                    <span>Synthesizing Chapter {book.chapters.length + 1}...</span>
                  </>
                ) : (
                  <>
                    <span>+</span>
                    <span>Extend Chapter {book.chapters.length + 1}</span>
                  </>
                )}
              </button>
            </div>

            {/* Sidebar Footer */}
            <div className="pt-4 border-t border-white/[0.06] mt-auto shrink-0 flex items-center justify-between text-xs text-neutral-400 font-mono pb-2">
              <span>⏱ {book.reading_time_minutes} min read</span>
              <button
                type="button"
                onClick={() => setShowNewTopicModal(true)}
                className="hover:text-white transition-colors cursor-pointer"
              >
                New Topic
              </button>
            </div>
          </aside>

          {/* Main Reading Viewport */}
          <main 
            ref={readerScrollRef} 
            className="flex-1 overflow-y-auto p-6 sm:p-12 space-y-8 select-text [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:bg-white/10"
          >
            {currentChapter && (
              <article className="max-w-3xl mx-auto space-y-7 pb-16">
                
                {/* Chapter Header */}
                <div className="space-y-1.5 border-b border-white/[0.06] pb-5">
                  <span className="text-[11px] font-mono text-neutral-500 tracking-wider">
                    Chapter {activeChapterIndex + 1} of {book.chapters.length}
                  </span>
                  <h1 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight">
                    {currentChapter.title}
                  </h1>
                </div>

                {/* Mental Model Callout with Math Rendering */}
                {currentChapter.analogies?.length > 0 && (
                  <div className="py-2 space-y-2">
                    <div className="text-[11px] font-serif italic tracking-wide text-neutral-400">
                      Mental Model & Intuition
                    </div>
                    <div className="text-xs sm:text-[14px] text-neutral-200 leading-relaxed pl-3.5 border-l border-white/20 space-y-2">
                      {currentChapter.analogies.map((an, aIdx) => (
                        <div key={aIdx} className="italic text-neutral-300 font-serif">
                          "<CodexRichText content={an} />"
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Core Theory Markdown Viewport */}
                <div className="space-y-4 text-xs sm:text-[14px] text-neutral-200 leading-relaxed font-sans">
                  <ReactMarkdown
                    remarkPlugins={[remarkGfm, remarkMath]}
                    rehypePlugins={[rehypeKatex]}
                    components={{
                      p: ({ node, ...props }: any) => <p className="mb-3.5 last:mb-0 leading-relaxed text-neutral-300" {...props} />,
                      strong: ({ node, ...props }: any) => <strong className="font-semibold text-white" {...props} />,
                      ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-4 space-y-2 text-neutral-300" {...props} />,
                      ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-4 space-y-2 text-neutral-300" {...props} />,
                      li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
                      h2: ({ node, ...props }: any) => <h2 className="text-lg sm:text-xl font-semibold text-white mb-3 mt-8 border-b border-white/[0.06] pb-2 tracking-tight" {...props} />,
                      h3: ({ node, ...props }: any) => <h3 className="text-[15px] sm:text-[16px] font-semibold text-white mb-2.5 mt-6 tracking-tight flex items-center gap-2" {...props} />,
                      
                      table: ({ node, ...props }: any) => (
                        <div className="overflow-x-auto my-6 border border-white/10 rounded-xl bg-[#08090d] shadow-lg max-w-full">
                          <table className="w-full text-left text-xs sm:text-sm border-collapse divide-y divide-white/10" {...props} />
                        </div>
                      ),
                      thead: ({ node, ...props }: any) => (
                        <thead className="bg-white/[0.04] text-neutral-200 font-mono text-[11.5px] uppercase tracking-wider" {...props} />
                      ),
                      th: ({ node, ...props }: any) => (
                        <th className="px-4 py-3 font-semibold text-white border-r border-white/10 last:border-r-0" {...props} />
                      ),
                      td: ({ node, ...props }: any) => (
                        <td className="px-4 py-2.5 border-b border-white/[0.06] border-r border-white/10 last:border-r-0 text-neutral-300" {...props} />
                      ),

                      code: ({ node, className, children, ...props }: any) => {
                        const isInline = !className;
                        const rawCode = String(children).replace(/\n$/, '');

                        if (isInline) {
                          return (
                            <code className="bg-white/[0.08] px-1.5 py-0.5 rounded-md text-cyan-300 font-mono text-[12px]" {...props}>
                              {children}
                            </code>
                          );
                        }

                        const lines = rawCode.split('\n');
                        return (
                          <div className="rounded-xl overflow-hidden my-5 border border-white/[0.08] bg-[#0a0c10] shadow-2xl select-text">
                            <div className="px-4 py-2 bg-white/[0.02] border-b border-white/[0.06] flex items-center justify-between select-none">
                              <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">
                                Code Snippet
                              </span>
                              <button
                                type="button"
                                onClick={() => navigator.clipboard.writeText(rawCode)}
                                className="h-6 px-2.5 rounded-md text-[10.5px] font-mono text-neutral-400 hover:text-white bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.08] transition-all cursor-pointer"
                              >
                                Copy
                              </button>
                            </div>
                            <div className="p-4 font-mono text-xs sm:text-[13px] leading-relaxed overflow-x-auto flex bg-[#07090e]">
                              <div className="select-none text-neutral-600 text-right pr-4 font-mono border-r border-white/[0.06]">
                                {lines.map((_, i) => (
                                  <div key={i}>{i + 1}</div>
                                ))}
                              </div>
                              <div className="pl-4 text-neutral-200 overflow-x-auto font-mono whitespace-pre w-full">
                                {lines.map((line, i) => (
                                  <div key={i} className="leading-relaxed">
                                    {highlightCodeLine(line)}
                                  </div>
                                ))}
                              </div>
                            </div>
                          </div>
                        );
                      }
                    }}
                  >
                    {currentChapter.core_theory_markdown}
                  </ReactMarkdown>
                </div>

                {/* ASCII Diagram Tree */}
                {currentChapter.diagram_ascii && (
                  <div className="my-6 space-y-2">
                    <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500 uppercase tracking-wider px-1">
                      <span>
                        {book?.book_title?.toLowerCase().includes('history') || book?.book_title?.toLowerCase().includes('islam') || book?.book_title?.toLowerCase().includes('period') 
                          ? 'Historical Timeline & Structure' 
                          : 'Architecture & Logic Flow'}
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          const normalized = normalizeAscii(currentChapter.diagram_ascii);
                          navigator.clipboard.writeText(normalized);
                          setCopiedDiagram(true);
                          setTimeout(() => setCopiedDiagram(false), 1600);
                        }}
                        className="hover:text-white transition-colors cursor-pointer lowercase font-mono text-[10.5px]"
                      >
                        {copiedDiagram ? 'copied to clipboard' : 'copy code'}
                      </button>
                    </div>
                    <div className="bg-white/[0.015] border border-white/[0.06] rounded-xl p-4 overflow-x-auto">
                      <pre className="font-mono text-xs sm:text-[12.5px] text-neutral-300 whitespace-pre leading-relaxed">
                        {normalizeAscii(currentChapter.diagram_ascii)}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Exam & Viva Pitfalls with KaTeX Math Rendering */}
                {currentChapter.exam_pitfalls?.length > 0 && (
                  <div className="py-2 space-y-2.5">
                    <div className="text-[11px] font-serif italic tracking-wide text-neutral-400">
                      Exam & Viva Pitfalls
                    </div>
                    <ul className="space-y-2.5 text-xs sm:text-[14px] text-neutral-300 leading-relaxed pl-3.5 border-l border-white/20">
                      {currentChapter.exam_pitfalls.map((pf, pIdx) => (
                        <li key={pIdx} className="leading-relaxed">
                          <CodexRichText content={pf} />
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Interactive Checkpoint with KaTeX Math Rendering */}
                {currentChapter.interactive_checkpoint && (
                  <div className="py-2 space-y-3">
                    <div className="text-[11px] font-serif italic tracking-wide text-neutral-400">
                      Interactive Checkpoint
                    </div>
                    <div className="text-xs sm:text-[14px] font-medium text-white leading-relaxed">
                      <CodexRichText content={currentChapter.interactive_checkpoint.question} />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="button"
                        onClick={() => {
                          setCheckpointState(prev => ({
                            ...prev,
                            [activeChapterIndex]: {
                              hint: !prev[activeChapterIndex]?.hint,
                              solution: prev[activeChapterIndex]?.solution || false
                            }
                          }));
                        }}
                        className="h-7 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-neutral-300 hover:text-white cursor-pointer"
                      >
                        {checkpointState[activeChapterIndex]?.hint ? 'Hide Hint' : '💡 Clue'}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setCheckpointState(prev => ({
                            ...prev,
                            [activeChapterIndex]: {
                              hint: prev[activeChapterIndex]?.hint || false,
                              solution: !prev[activeChapterIndex]?.solution
                            }
                          }));
                        }}
                        className="h-7 px-3 rounded-lg bg-white/[0.03] hover:bg-white/[0.08] border border-white/10 text-xs font-mono text-neutral-300 hover:text-white cursor-pointer"
                      >
                        {checkpointState[activeChapterIndex]?.solution ? 'Hide Solution' : '✓ Solution'}
                      </button>
                    </div>

                    {checkpointState[activeChapterIndex]?.hint && (
                      <div className="p-3 rounded-xl bg-white/[0.015] border border-white/[0.06] text-xs text-neutral-300 leading-relaxed font-sans animate-in fade-in">
                        <span className="text-white font-semibold font-mono">Clue: </span>
                        <CodexRichText content={currentChapter.interactive_checkpoint.hint} />
                      </div>
                    )}

                    {checkpointState[activeChapterIndex]?.solution && (
                      <div className="p-3 rounded-xl bg-white/[0.025] border border-white/[0.08] text-xs text-neutral-200 leading-relaxed font-sans animate-in fade-in">
                        <span className="text-white font-semibold font-mono">Solution: </span>
                        <CodexRichText content={currentChapter.interactive_checkpoint.solution} />
                      </div>
                    )}
                  </div>
                )}

                {/* Chapter Bottom Navigation */}
                <div className="pt-6 border-t border-white/[0.06] flex items-center justify-between">
                  {activeChapterIndex > 0 ? (
                    <button
                      type="button"
                      onClick={() => setActiveChapterIndex(prev => prev - 1)}
                      className="h-9 px-4 rounded-full bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-white transition-all cursor-pointer"
                    >
                      ← Previous
                    </button>
                  ) : <div />}

                  {activeChapterIndex < book.chapters.length - 1 ? (
                    <button
                      type="button"
                      onClick={() => setActiveChapterIndex(prev => prev + 1)}
                      className="h-9 px-5 rounded-full bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all cursor-pointer shadow-sm"
                    >
                      Next Chapter →
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setPhase('completed')}
                      className="h-9 px-6 rounded-full bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all cursor-pointer shadow-md"
                    >
                      Finish Reading ✓
                    </button>
                  )}
                </div>

              </article>
            )}
          </main>

          {/* ----------------- EXECUTIVE UBAIR MENTOR FLOATING WIDGET ----------------- */}
          <div className="fixed bottom-6 right-6 z-40 flex flex-col items-end pointer-events-none">
            
            {isMentorOpen && (
              <div className="w-[94vw] sm:w-[410px] h-[540px] max-h-[82vh] bg-[#0b0c10]/95 backdrop-blur-3xl border border-white/15 rounded-[32px] shadow-[0_24px_60px_rgba(0,0,0,0.85)] flex flex-col mb-3 pointer-events-auto overflow-hidden animate-in zoom-in-95 duration-200">
                
                <div className="px-5 py-4 border-b border-white/[0.06] flex items-center justify-between shrink-0 bg-white/[0.015]">
                  <div className="flex items-center gap-3">
                    <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-cyan-500/10 to-indigo-500/10 border border-cyan-500/20 flex items-center justify-center shrink-0">
                      <img
                        src="/assets/ubair-logo.png"
                        alt="Ubair OS"
                        className="w-4 h-4 object-contain pointer-events-none drop-shadow-[0_0_6px_rgba(6,182,212,0.6)]"
                      />
                    </div>
                    <div>
                      <h6 className="text-xs font-semibold text-white tracking-tight flex items-center gap-2">
                        <span>Ubair Mentor</span>
                      </h6>
                      <p className="text-[10.5px] text-neutral-400 font-mono mt-0.5">Active Chapter Socratic AI</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsMentorOpen(false)}
                    className="w-7 h-7 rounded-full bg-white/[0.04] hover:bg-white/[0.1] text-neutral-400 hover:text-white flex items-center justify-center text-xs transition-colors cursor-pointer"
                    title="Close Mentor"
                  >
                    ✕
                  </button>
                </div>

                <div className="px-5 py-2.5 bg-black/30 border-b border-white/[0.05] flex items-center gap-2 text-[11px] font-mono text-neutral-400 truncate shrink-0">
                  <span className="text-cyan-400 font-medium">Context:</span>
                  <span className="truncate text-neutral-300 font-sans">{currentChapter?.title || 'General Chapter'}</span>
                </div>

                <div ref={mentorScrollRef} className="flex-1 overflow-y-auto p-5 space-y-4 select-text [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10">
                  {mentorMessages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                      <div className="w-12 h-12 rounded-2xl bg-cyan-500/[0.06] border border-cyan-500/20 flex items-center justify-center shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                        <span className="text-xl">💡</span>
                      </div>
                      <div className="space-y-1.5">
                        <h5 className="text-xs font-semibold text-white tracking-tight">Ask your personal Socratic mentor</h5>
                        <p className="text-[11.5px] text-neutral-400 max-w-[260px] leading-relaxed">
                          Query any formula, breakdown, or mechanism from this chapter for instant first-principle intuition.
                        </p>
                      </div>
                    </div>
                  ) : (
                    mentorMessages.map((msg, idx) => (
                      <div
                        key={idx}
                        className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'} w-full`}
                      >
                        <div
                          className={`max-w-[94%] px-4.5 py-3.5 rounded-2xl text-xs sm:text-[13.5px] leading-relaxed font-sans ${
                            msg.role === 'user'
                              ? 'bg-cyan-500 text-black font-medium rounded-tr-sm shadow-md'
                              : 'bg-white/[0.04] border border-white/[0.1] text-neutral-200 rounded-tl-sm shadow-sm space-y-2.5'
                          }`}
                        >
                          <ReactMarkdown 
                            remarkPlugins={[remarkGfm, remarkMath]} 
                            rehypePlugins={[rehypeKatex]}
                            components={{
                              p: ({ node, ...props }: any) => (
                                <p 
                                  className={`mb-2.5 last:mb-0 leading-relaxed ${
                                    msg.role === 'user' ? 'text-black font-medium' : 'text-neutral-200'
                                  }`} 
                                  {...props} 
                                />
                              ),
                              strong: ({ node, ...props }: any) => (
                                <strong className={`font-semibold ${msg.role === 'user' ? 'text-black' : 'text-white'}`} {...props} />
                              ),
                              ul: ({ node, ...props }: any) => <ul className="list-disc pl-4 my-2 space-y-1.5 text-neutral-300" {...props} />,
                              ol: ({ node, ...props }: any) => <ol className="list-decimal pl-4 my-2 space-y-1.5 text-neutral-300" {...props} />,
                              li: ({ node, ...props }: any) => <li className="leading-relaxed" {...props} />,
                              code: ({ node, className, children, ...props }: any) => {
                                const isInline = !className;
                                return isInline ? (
                                  <code className={`px-1.5 py-0.5 rounded font-mono text-[11.5px] ${
                                    msg.role === 'user' ? 'bg-black/15 text-black' : 'bg-white/10 text-neutral-200'
                                  }`} {...props}>
                                    {children}
                                  </code>
                                ) : (
                                  <div className="rounded-xl my-2 border border-white/10 bg-[#040507] p-3 font-mono text-xs text-neutral-200 overflow-x-auto">
                                    <code {...props}>{children}</code>
                                  </div>
                                );
                              }
                            }}
                          >
                            {cleanMentorContent(msg.content)}
                          </ReactMarkdown>
                        </div>
                      </div>
                    ))
                  )}

                  {isMentorThinking && (
                    <div className="flex items-center gap-2.5 p-3 rounded-2xl bg-white/[0.02] border border-white/[0.06] text-xs text-neutral-400 font-mono w-fit animate-pulse">
                      <div className="w-3 h-3 border-2 border-neutral-400 border-t-white rounded-full animate-spin" />
                      <span>Formulating intuitive breakthrough...</span>
                    </div>
                  )}
                </div>

                <form onSubmit={handleSendMentorQuery} className="p-3.5 border-t border-white/[0.08] flex items-center gap-2 bg-[#040507] shrink-0">
                  <input
                    type="text"
                    value={mentorInput}
                    onChange={(e) => setMentorInput(e.target.value)}
                    placeholder="Ask a doubt or discuss concepts..."
                    className="flex-1 h-10 px-4 rounded-xl bg-white/[0.04] border border-white/10 text-xs text-white placeholder-neutral-500 outline-none focus:border-white/40 transition-all font-sans"
                  />
                  <button
                    type="submit"
                    disabled={!mentorInput.trim() || isMentorThinking}
                    className="h-10 px-5 rounded-xl bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all disabled:opacity-30 cursor-pointer shrink-0 shadow-md"
                  >
                    Send
                  </button>
                </form>
              </div>
            )}

            <button
              type="button"
              onClick={() => setIsMentorOpen(prev => !prev)}
              className={`group relative h-12 px-5 rounded-full bg-white text-black hover:bg-neutral-100 text-xs font-semibold shadow-[0_10px_30px_rgba(255,255,255,0.2)] transition-all duration-200 flex items-center gap-2.5 cursor-pointer pointer-events-auto active:scale-95 ${
                isMentorOpen ? 'ring-2 ring-white/80 scale-105' : 'hover:scale-[1.03]'
              }`}
              title="Open Ubair Mentor"
            >
              <div className="absolute -inset-0.5 rounded-full bg-gradient-to-r from-white via-cyan-200 to-white opacity-30 blur-sm group-hover:opacity-60 transition-opacity pointer-events-none" />
              <span className="relative z-10 text-[14px] text-black">✦</span>
              <span className="relative z-10 tracking-tight font-sans text-[13px]">Ubair Mentor</span>
            </button>
          </div>
        </div>
      )}

      {/* ----------------- STAGE 5: ELEGANT FINISHED STATE ----------------- */}
      {phase === 'completed' && book && (
        <div className="flex-1 overflow-y-auto px-6 py-12 flex flex-col items-center justify-center">
          <div className="max-w-md w-full text-center space-y-7 animate-in fade-in duration-200">
            <div className="w-14 h-14 rounded-2xl bg-cyan-500/[0.08] border border-cyan-500/20 flex items-center justify-center mx-auto shadow-[0_0_24px_rgba(6,182,212,0.2)]">
              <span className="text-2xl">🎓</span>
            </div>

            <div className="space-y-2">
              <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-widest">
                Session Finished
              </span>
              <h3 className="text-xl sm:text-2xl font-semibold text-white tracking-tight">
                {book.book_title}
              </h3>
              <p className="text-xs text-neutral-400 max-w-sm mx-auto leading-relaxed">
                You've completed all {book.chapters.length} synthesized chapters. You can export this book as a complete PDF or drill scenarios in the Arena.
              </p>
            </div>

            <div className="p-4 rounded-2xl bg-white/[0.02] border border-white/[0.08] text-left space-y-2 text-xs">
              <div className="flex items-center justify-between text-neutral-400 font-mono text-[11px]">
                <span>Scope</span>
                <span className="text-white">{book.target_horizon}</span>
              </div>
              <div className="flex items-center justify-between text-neutral-400 font-mono text-[11px]">
                <span>Language</span>
                <span className="text-white">{book.language}</span>
              </div>
              <div className="flex items-center justify-between text-neutral-400 font-mono text-[11px]">
                <span>Total Chapters</span>
                <span className="text-white">{book.chapters.length}</span>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
              <button
                type="button"
                onClick={handlePrintPDF}
                className="w-full sm:w-auto h-10 px-5 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 text-xs font-semibold text-white transition-all cursor-pointer"
              >
                Save as PDF
              </button>

              <button
                type="button"
                onClick={handleTransitionToArena}
                className="w-full sm:w-auto h-10 px-5 rounded-full bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all cursor-pointer shadow-md"
              >
                Practice in Arena →
              </button>
            </div>

            <div className="pt-2">
              <button
                type="button"
                onClick={() => setPhase('reader')}
                className="text-xs font-mono text-neutral-500 hover:text-white transition-colors cursor-pointer"
              >
                ← Return to Reading View
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- CLEAN MULTI-CHAPTER PRINT VAULT ----------------- */}
      {book && (
        <div id="codex-print-vault">
          <div className="codex-cover-page">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '2px solid #111827', paddingBottom: '8px', marginBottom: '20px' }}>
              <span style={{ fontSize: '10pt', fontWeight: '700', letterSpacing: '2px', textTransform: 'uppercase', color: '#111827' }}>
                Ubair OS · Adaptive Codex
              </span>
              <span style={{ fontSize: '8.5pt', color: '#6b7280', fontFamily: 'monospace' }}>
                EPHEMERAL KNOWLEDGE WORKSPACE
              </span>
            </div>

            <div style={{ marginBottom: '18px' }}>
              <span style={{ fontSize: '8.5pt', fontFamily: 'monospace', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7280', display: 'block', marginBottom: '6px' }}>
                {book.target_horizon} · {book.language}
              </span>
              <h1 style={{ fontSize: '22pt', lineHeight: '1.25', fontWeight: '800', margin: '0 0 8px 0', color: '#000000' }}>
                {book.book_title}
              </h1>
              <p style={{ fontSize: '11pt', lineHeight: '1.4', color: '#4b5563', margin: 0 }}>
                {book.subtitle}
              </p>
            </div>

            <div style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderLeft: '4px solid #111827', padding: '12px 16px', marginBottom: '20px' }}>
              <strong style={{ display: 'block', fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '1px', marginBottom: '4px', color: '#111827' }}>
                Executive Summary
              </strong>
              <p style={{ fontSize: '9.5pt', lineHeight: '1.5', color: '#374151', margin: 0 }}>
                {book.executive_summary}
              </p>
            </div>

            <div style={{ borderTop: '1px solid #e5e7eb', paddingTop: '14px', marginBottom: '16px' }}>
              <strong style={{ display: 'block', fontSize: '8.5pt', textTransform: 'uppercase', letterSpacing: '1px', color: '#6b7280', marginBottom: '8px' }}>
                Index of Chapters ({book.chapters.length})
              </strong>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
                {book.chapters.map((ch, idx) => (
                  <div key={ch.chapter_id} style={{ display: 'flex', justifyContent: 'space-between', fontSize: '9pt', color: '#1f2937' }}>
                    <span><strong>Chapter {idx + 1}:</strong> {ch.title}</span>
                    <span style={{ color: '#9ca3af', fontFamily: 'monospace' }}>Section {idx + 1}.0</span>
                  </div>
                ))}
              </div>
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '8pt', color: '#9ca3af', borderTop: '1px solid #e5e7eb', paddingTop: '8px', marginTop: '16px' }}>
              <span>Compiled via Ubair Neural Synthesis</span>
              <span>Est. Reading Time: ~{book.reading_time_minutes} min</span>
            </div>
          </div>

          {book.chapters.map((ch, idx) => (
            <div key={ch.chapter_id} className="codex-chapter-page">
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', borderBottom: '1px solid #e5e7eb', paddingBottom: '6px', marginBottom: '16px' }}>
                <span style={{ fontSize: '8.5pt', fontFamily: 'monospace', textTransform: 'uppercase', color: '#6b7280', letterSpacing: '1px' }}>
                  Chapter {idx + 1} of {book.chapters.length}
                </span>
                <span style={{ fontSize: '8.5pt', color: '#9ca3af' }}>
                  {book.book_title}
                </span>
              </div>

              <h2 style={{ fontSize: '18pt', lineHeight: '1.25', fontWeight: '700', marginBottom: '14px', color: '#000000' }}>
                {ch.title}
              </h2>

              {ch.analogies?.length > 0 && (
                <div className="codex-no-split" style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '12px 16px', marginBottom: '18px' }}>
                  <strong style={{ display: 'block', fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#374151', marginBottom: '6px' }}>
                    Mental Model & Intuition
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: '#4b5563' }}>
                    {ch.analogies.map((a, i) => (
                      <li key={i} style={{ fontSize: '9.5pt', marginBottom: '3px' }}>{a}</li>
                    ))}
                  </ul>
                </div>
              )}

              <div style={{ fontSize: '10pt', lineHeight: '1.6', marginBottom: '18px' }}>
                <ReactMarkdown 
                  remarkPlugins={[remarkGfm, remarkMath]} 
                  rehypePlugins={[rehypeKatex]}
                >
                  {ch.core_theory_markdown}
                </ReactMarkdown>
              </div>

              {ch.diagram_ascii && (
                <div className="codex-no-split" style={{ marginBottom: '18px' }}>
                  <div style={{ fontSize: '8pt', fontFamily: 'monospace', textTransform: 'uppercase', color: '#6b7280', marginBottom: '4px' }}>
                    Process & Logic Flow
                  </div>
                  <pre>
                    {normalizeAscii(ch.diagram_ascii)}
                  </pre>
                </div>
              )}

              {ch.exam_pitfalls?.length > 0 && (
                <div className="codex-no-split" style={{ background: '#ffffff', border: '1px solid #e5e7eb', borderLeft: '3px solid #374151', padding: '12px 16px', marginBottom: '18px' }}>
                  <strong style={{ display: 'block', fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#111827', marginBottom: '6px' }}>
                    Critical Exam & Practical Pitfalls
                  </strong>
                  <ul style={{ margin: 0, paddingLeft: '18px', color: '#374151' }}>
                    {ch.exam_pitfalls.map((p, i) => (
                      <li key={i} style={{ fontSize: '9.5pt', marginBottom: '3px' }}>
                        <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{p}</ReactMarkdown>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {ch.interactive_checkpoint && (
                <div className="codex-no-split" style={{ background: '#f9fafb', border: '1px solid #e5e7eb', borderRadius: '4px', padding: '12px 16px', marginBottom: '18px' }}>
                  <strong style={{ display: 'block', fontSize: '9pt', textTransform: 'uppercase', letterSpacing: '0.5px', color: '#111827', marginBottom: '4px' }}>
                    Checkpoint Problem
                  </strong>
                  <div style={{ fontSize: '9.5pt', fontWeight: '500', color: '#111827', marginBottom: '6px' }}>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{ch.interactive_checkpoint.question}</ReactMarkdown>
                  </div>
                  <div style={{ fontSize: '9pt', color: '#4b5563', borderTop: '1px dashed #d1d5db', paddingTop: '6px' }}>
                    <strong>Verified Solution: </strong>
                    <ReactMarkdown remarkPlugins={[remarkGfm, remarkMath]} rehypePlugins={[rehypeKatex]}>{ch.interactive_checkpoint.solution}</ReactMarkdown>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ----------------- DEDICATED QUOTA EXCEEDED MODAL ----------------- */}
      {quotaExceededModal?.isOpen && (
        <div 
          className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150"
          onClick={() => setQuotaExceededModal(null)}
        >
          <div 
            className="max-w-sm w-full bg-[#08090d] border border-white/[0.08] p-7 rounded-3xl space-y-5 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <span className="text-[10.5px] font-mono text-neutral-500 uppercase tracking-wider">Codex Allocation</span>
              <h4 className="text-base font-semibold text-white tracking-tight font-sans">
                Daily Limit Reached
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed font-sans pt-1">
                {quotaExceededModal.message}
              </p>
            </div>

            <button
              type="button"
              onClick={() => setQuotaExceededModal(null)}
              className="w-full h-10 rounded-full bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all cursor-pointer shadow-md active:scale-95"
            >
              Acknowledge & Continue
            </button>
          </div>
        </div>
      )}

      {/* ----------------- EXIT CONFIRMATION MODAL ----------------- */}
      {showExitModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="max-w-sm w-full bg-[#08090d] border border-white/[0.08] p-7 rounded-3xl text-center space-y-6 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto">
              <span className="text-xl">⚠️</span>
            </div>

            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-white tracking-tight font-sans">
                {phase === 'loading' ? 'Abort Compilation?' : 'Close Adaptive Codex?'}
              </h4>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-[270px] mx-auto font-sans">
                {phase === 'loading'
                  ? 'Textbook synthesis is actively compiling. Exiting will cancel generation and discard current input.'
                  : 'This textbook is compiled in volatile ephemeral memory. Closing now will discard current book data.'}
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="flex-1 h-10 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white transition-all cursor-pointer active:scale-95"
              >
                {phase === 'loading' ? 'Keep Compiling' : 'Resume Reading'}
              </button>
              <button
                type="button"
                onClick={handleCloseCodex}
                className="flex-1 h-10 rounded-full bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all cursor-pointer shadow-md active:scale-95"
              >
                {phase === 'loading' ? 'Cancel Compilation' : 'Discard & Exit'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- ARENA REDIRECT CONFIRMATION MODAL ----------------- */}
      {showArenaConfirmModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="max-w-sm w-full bg-[#08090d] border border-white/[0.08] p-7 rounded-3xl text-center space-y-6 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-cyan-500/[0.08] border border-cyan-500/20 flex items-center justify-center mx-auto shadow-[0_0_20px_rgba(6,182,212,0.2)]">
              <span className="text-xl">⚔️</span>
            </div>

            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-white tracking-tight">Enter Ubair Arena?</h4>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-[260px] mx-auto">
                Ready to drill these concepts? This will transition your focus directly to interactive scenario questions.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowArenaConfirmModal(false)}
                className="flex-1 h-10 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white transition-all cursor-pointer active:scale-95"
              >
                Stay in Codex
              </button>
              <button
                type="button"
                onClick={handleTransitionToArena}
                className="flex-1 h-10 rounded-full bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all cursor-pointer shadow-md active:scale-95"
              >
                Launch Arena →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ----------------- NEW TOPIC CONFIRMATION MODAL ----------------- */}
      {showNewTopicModal && (
        <div className="fixed inset-0 z-60 bg-black/85 backdrop-blur-md flex items-center justify-center p-6 animate-in fade-in duration-150">
          <div className="max-w-sm w-full bg-[#08090d] border border-white/[0.08] p-7 rounded-3xl text-center space-y-6 shadow-2xl">
            <div className="w-12 h-12 rounded-2xl bg-white/[0.04] border border-white/[0.08] flex items-center justify-center mx-auto">
              <span className="text-xl">🔄</span>
            </div>

            <div className="space-y-2">
              <h4 className="text-lg font-semibold text-white tracking-tight">Start a New Topic?</h4>
              <p className="text-xs text-neutral-400 leading-relaxed max-w-[260px] mx-auto">
                Your current active book and reading progress will be discarded from volatile memory.
              </p>
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setShowNewTopicModal(false)}
                className="flex-1 h-10 rounded-full bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.08] text-xs font-semibold text-white transition-all cursor-pointer active:scale-95"
              >
                Resume Reading
              </button>
              <button
                type="button"
                onClick={handleConfirmNewTopic}
                className="flex-1 h-10 rounded-full bg-white text-black hover:bg-neutral-200 text-xs font-semibold transition-all cursor-pointer shadow-md active:scale-95"
              >
                Confirm New Topic
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}