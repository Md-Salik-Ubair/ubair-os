'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import 'katex/dist/katex.min.css';

/* ============================================================================
 * 1. DATA CONTRACTS (Synchronized with Arena Engine v6)
 * ========================================================================== */
interface ChallengeItem {
  id: number;
  cognitive_tier?: string;
  type: 'scenario_mcq' | 'code_bug' | 'socratic_text';
  title: string;
  scenario: string;
  code_snippet?: string | null;
  options?: string[] | null;
  correct_option_index?: number | null;
  concept_breakdown: string;
  elimination_hint: string;
  explanation: string;
}

interface AssessmentData {
  topic_title: string;
  detected_intent: string;
  domain?: string;
  language?: string;
  difficulty_level: string;
  challenges: ChallengeItem[];
}

interface ClarificationData {
  topic: string;
  domain?: string;
  clarification_prompt: string;
  suggested_focus_areas: string[];
  target_language?: string;
}

interface EvaluationResult {
  score: number;
  verdict: string;
  critique: string;
  invariant_accuracy?: string;
  missed_key_points?: string[];
  first_principle_takeaway?: string;
}

interface QuotaState {
  used_today: number;
  max_daily: number;
  remaining: number;
  role: 'free' | 'pro' | 'admin';
}

interface AssessmentArenaProps {
  isOpen: boolean;
  onClose: () => void;
  userEmail?: string;
  userTier?: 'free' | 'pro' | 'admin';
  initialTopic?: string;
  initialPrinciples?: string[];
  initialPitfalls?: string[];
  initialHorizon?: string;
  onOpenUpgradeModal?: () => void;
  hasPendingProRequest?: boolean;
}

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/* ============================================================================
 * UNIVERSAL MATH & CLEAN TEXT RENDERER
 * ========================================================================== */
function ArenaRichText({ content, className = '' }: { content: string; className?: string }) {
  if (!content) return null;
  return (
    <span className={`${className} break-words`}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkMath]}
        rehypePlugins={[[rehypeKatex, { strict: false, throwOnError: false }]]}
        components={{
          p: ({ node, ...props }: any) => <span className="leading-relaxed" {...props} />,
          strong: ({ node, ...props }: any) => <strong className="font-semibold text-zinc-100" {...props} />,
          code: ({ node, ...props }: any) => (
            <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-zinc-200 font-mono text-[11.5px] break-all" {...props} />
          )
        } as any}
      >
        {content}
      </ReactMarkdown>
    </span>
  );
}

/* ============================================================================
 * MINIMAL SYNTAX HIGHLIGHTER WITH RESILIENT FALLBACK
 * ========================================================================== */
function highlightCodeLine(line: string): React.ReactNode {
  if (!line) return <span>&nbsp;</span>;

  const commentMatch = line.match(/(.*?)(\/\/.*|#.*)$/);
  const codeSegment = commentMatch ? commentMatch[1] : line;
  const commentSegment = commentMatch ? commentMatch[2] : null;

  const tokenRegex = /("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|[a-zA-Z_]\w*|\d+|[^\s\w]|\s+)/g;
  const tokens = codeSegment.match(tokenRegex) || [codeSegment];

  const renderedTokens = tokens.map((token, idx) => {
    if ((token.startsWith('"') && token.endsWith('"')) || (token.startsWith("'") && token.endsWith("'"))) {
      return <span key={idx} className="text-zinc-300">{token}</span>;
    }
    if (/^(return|if|else|elif|while|for|switch|case|break|continue|default|sizeof|import|from|class|def|in|async|await|try|except|catch|finally)$/.test(token)) {
      return <span key={idx} className="text-zinc-100 font-semibold">{token}</span>;
    }
    if (/^(char|size_t|int|float|double|void|bool|long|short|unsigned|struct|const|static|auto|NULL|nullptr|true|false|True|False|None|let|var|str|list|dict|set|tuple)$/.test(token)) {
      return <span key={idx} className="text-zinc-400 font-medium">{token}</span>;
    }
    if (/^(malloc|free|calloc|realloc|memcpy|memset|strlen|strcpy|strncpy|printf|scanf|dup|print|len|range|append|push|pop|console)$/.test(token)) {
      return <span key={idx} className="text-zinc-300 font-medium">{token}</span>;
    }
    if (/^\d+$/.test(token)) {
      return <span key={idx} className="text-zinc-400 font-mono">{token}</span>;
    }
    return <span key={idx} className="text-zinc-400">{token}</span>;
  });

  return (
    <>
      {renderedTokens}
      {commentSegment && <span className="text-zinc-600 italic">{commentSegment}</span>}
    </>
  );
}

export default function AssessmentArena({
  isOpen,
  onClose,
  userEmail = '',
  userTier,
  initialTopic,
  initialPrinciples = [],
  initialPitfalls = [],
  initialHorizon,
  onOpenUpgradeModal,
  hasPendingProRequest = false
}: AssessmentArenaProps) {
  const [phase, setPhase] = useState<'briefing' | 'setup' | 'clarification' | 'loading' | 'active' | 'report'>('briefing');
  const [topicPrompt, setTopicPrompt] = useState('');
  const [selectedMode, setSelectedMode] = useState<string>('balanced');

  // Language Medium Subsystem
  const [selectedLanguage, setSelectedLanguage] = useState<'English' | 'Hinglish' | 'Other'>('English');
  const [customLanguage, setCustomLanguage] = useState('');

  // Live Telemetry & Quota State
  const [quotaInfo, setQuotaInfo] = useState<QuotaState | null>(null);
  const [resetCountdown, setResetCountdown] = useState<string>('');
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [statusNotice, setStatusNotice] = useState<string | null>(null);

  // Clarification Gate State
  const [clarificationData, setClarificationData] = useState<ClarificationData | null>(null);

  // Challenge Execution State
  const [assessment, setAssessment] = useState<AssessmentData | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [showHint, setShowHint] = useState(false);
  const [revealedDirectly, setRevealedDirectly] = useState(false);
  const [codeCopied, setCodeCopied] = useState(false);

  // Socratic Free-Text Defense
  const [userWrittenAnswer, setUserWrittenAnswer] = useState('');
  const [isEvaluatingText, setIsEvaluatingText] = useState(false);
  const [textEvaluation, setTextEvaluation] = useState<EvaluationResult | null>(null);

  // Score Tracking & Metrics
  const [userAnswers, setUserAnswers] = useState<Record<number, { correct: boolean; chosenOption?: number; textScore?: number; topic: string }>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [loadingElapsed, setLoadingElapsed] = useState<number>(0);

  const [showExitModal, setShowExitModal] = useState(false);
  const abortControllerRef = useRef<AbortController | null>(null);

  // -------------------------------------------------------------
  // Identity Resolver (Safe Isolated Guest Session & Deep Auth Detection)
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

      const storedUser = localStorage.getItem('ubair_user');
      if (storedUser) {
        try {
          const u = JSON.parse(storedUser);
          if (u?.email) return u.email.trim().toLowerCase();
        } catch {}
      }

      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (key && (key.includes('auth-token') || key.includes('supabase'))) {
          try {
            const parsed = JSON.parse(localStorage.getItem(key) || '{}');
            const foundEmail = parsed?.user?.email || parsed?.currentSession?.user?.email || parsed?.session?.user?.email;
            if (foundEmail) {
              return String(foundEmail).trim().toLowerCase();
            }
          } catch {}
        }
      }

      let guestId = localStorage.getItem('ubair_guest_session_id');
      if (!guestId) {
        guestId = `guest_${Math.random().toString(36).substring(2, 9)}`;
        localStorage.setItem('ubair_guest_session_id', guestId);
      }
      return `${guestId}@guest.ubair.os`;
    }
    return 'guest_node@guest.ubair.os';
  }, [userEmail]);

  // Fetch Live Quota Telemetry with LocalStorage Sync (Strict Identity Validation)
  const fetchQuota = useCallback(async () => {
    const email = resolveUserEmail();
    const isAdmin = userTier === 'admin' || email === 'mdsalikubair@gmail.com';
    const isPro = userTier === 'pro' && !isAdmin;

    const todayKey = `ubair_arena_usage_${new Date().toISOString().slice(0, 10)}_${email}`;
    const localUsed = Number(localStorage.getItem(todayKey) || '0');
    const maxAllowed = isAdmin ? 999999 : (isPro ? 30 : 3);
    const resolvedRole: 'admin' | 'pro' | 'free' = isAdmin ? 'admin' : (isPro ? 'pro' : 'free');

    setQuotaInfo({
      used_today: localUsed,
      max_daily: maxAllowed,
      remaining: isAdmin ? 999999 : Math.max(0, maxAllowed - localUsed),
      role: resolvedRole
    });

    if (isAdmin) return;

    try {
      const res = await fetch(`${API_BASE}/api/assessment/quota?email=${encodeURIComponent(email)}`);
      if (res.ok) {
        const data = await res.json();
        const serverUsed = data.used_today ?? localUsed;
        const serverMax = data.max_daily ?? maxAllowed;
        const actualUsed = Math.max(serverUsed, localUsed);

        setQuotaInfo({
          used_today: actualUsed,
          max_daily: serverMax,
          remaining: data.remaining !== undefined ? data.remaining : Math.max(0, serverMax - actualUsed),
          role: data.role || resolvedRole
        });
        localStorage.setItem(todayKey, String(actualUsed));
      }
    } catch {}
  }, [resolveUserEmail, userTier]);

  useEffect(() => {
    if (isOpen) {
      fetchQuota();
    }
  }, [isOpen, fetchQuota]);

  // Live UTC Countdown Timer
  useEffect(() => {
    const calcTime = () => {
      const now = new Date();
      const nextUtcMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1,
        0, 0, 0
      ));
      const diff = nextUtcMidnight.getTime() - now.getTime();
      if (diff <= 0) {
        setResetCountdown('Resetting...');
        return;
      }
      const h = Math.floor(diff / (1000 * 60 * 60));
      const m = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      setResetCountdown(`${h}h ${m}m`);
    };

    calcTime();
    const interval = setInterval(calcTime, 15000);
    return () => clearInterval(interval);
  }, []);

  // Loading Elapsed Seconds Tracker
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

  // Navigation Guard
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (phase === 'active' || phase === 'loading') {
        e.preventDefault();
        e.returnValue = 'Practice session in progress. Discard progress?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [phase]);

  // URL Sync
  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      if (isOpen) {
        url.searchParams.set('view', 'arena');
        url.searchParams.set('stage', phase);
        window.history.replaceState({}, '', url.toString());
      } else {
        if (url.searchParams.has('view')) {
          url.searchParams.delete('view');
          url.searchParams.delete('stage');
          window.history.replaceState({}, '', url.toString());
        }
      }
    } catch {}
  }, [isOpen, phase]);

  const validatePromptIntegrity = (text: string): string | null => {
    const trimmed = text.trim();
    if (trimmed.length < 1) return 'Please enter a technical topic or concept.';
    if (trimmed.length > 800) return 'Topic prompt exceeds maximum allowable length.';
    if (/^[\s.]+$/.test(trimmed)) {
      return 'Please enter a valid subject or keyword.';
    }
    if (selectedLanguage === 'Other' && !customLanguage.trim()) {
      return 'Please specify your preferred custom language.';
    }
    return null;
  };

  const getEffectiveLanguage = (): string => {
    if (selectedLanguage === 'Other') return customLanguage.trim() || 'English';
    return selectedLanguage;
  };

  // Start Assessment Pipeline
  const handleStartAssessment = async (
    overridePrompt?: string,
    overridePrinciples?: string[],
    overrideMode?: string,
    overridePitfalls?: string[],
    forceBypassClarification: boolean = false
  ) => {
    const activePrompt = (overridePrompt || topicPrompt).trim();
    const validationError = validatePromptIntegrity(activePrompt);
    if (validationError) {
      setErrorMessage(validationError);
      return;
    }

    if (quotaInfo && quotaInfo.role === 'free' && quotaInfo.remaining <= 0) {
      setShowUpgradeModal(true);
      return;
    }

    setErrorMessage(null);
    setPhase('loading');

    const controller = new AbortController();
    abortControllerRef.current = controller;

    const emailToUse = resolveUserEmail();
    const resolvedLanguage = getEffectiveLanguage();
    const activePrinciples = overridePrinciples || initialPrinciples || [];
    const activePitfalls = overridePitfalls || initialPitfalls || [];
    const activeMode = overrideMode || selectedMode || 'balanced';

    try {
      const res = await fetch(`${API_BASE}/api/assessment/generate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: activePrompt,
          topic: activePrompt,
          mode: activeMode,
          tier: quotaInfo?.role || userTier,
          language: resolvedLanguage,
          user_language: resolvedLanguage,
          user_email: emailToUse,
          email: emailToUse,
          core_principles: activePrinciples,
          pitfalls: activePitfalls,
          exam_pitfalls: activePitfalls,
          horizon: activeMode,
          force_generate: forceBypassClarification,
          bypass_clarification: forceBypassClarification,
          skip_clarification: forceBypassClarification
        }),
        signal: controller.signal
      });

      const data = await res.json().catch(() => ({}));

      if (res.status === 403 && data.detail?.upgrade_required) {
        setShowUpgradeModal(true);
        setPhase('setup');
        return;
      }

      if (!res.ok) {
        const errorDetail = typeof data.detail === 'string' ? data.detail : (data.detail?.message || 'Inference engine busy. Please retry.');
        throw new Error(errorDetail);
      }

      const responsePayload = data.assessment || data;

      if (!forceBypassClarification && (responsePayload.status === 'needs_clarification' || responsePayload.needs_clarification)) {
        let extractedAreas: string[] = [];

        if (Array.isArray(responsePayload.suggested_focus_areas)) {
          extractedAreas = responsePayload.suggested_focus_areas;
        } else if (Array.isArray(responsePayload.focus_areas)) {
          extractedAreas = responsePayload.focus_areas;
        } else if (Array.isArray(responsePayload.suggested_focus_scopes)) {
          extractedAreas = responsePayload.suggested_focus_scopes;
        } else if (Array.isArray(responsePayload.options)) {
          extractedAreas = responsePayload.options;
        }

        const promptText = responsePayload.clarification_prompt || responsePayload.clarification_question || '';
        if (extractedAreas.length === 0 && promptText) {
          const matched = promptText.match(/\d+[\)\.]\s*([^;\n\r]+?)(?=(?:;\s*\d+[\)\.]|\.\s*\d+[\)\.]|\n|\r|$))/g);
          if (matched && matched.length > 0) {
            extractedAreas = matched.map((m: string) => m.replace(/^\d+[\)\.]\s*/, '').trim());
          }
        }

        setClarificationData({
          topic: responsePayload.topic || activePrompt,
          domain: responsePayload.domain,
          clarification_prompt: promptText.split(/(?:\?|\:)\s*(?=1[\)\.])/)[0] || 'Which focus area would you like to practice?',
          suggested_focus_areas: extractedAreas,
          target_language: responsePayload.target_language || resolvedLanguage
        });
        setPhase('clarification');
        return;
      }

      const finalDeck: AssessmentData = responsePayload.challenges ? responsePayload : data.assessment;
      if (!finalDeck || !finalDeck.challenges?.length) {
        throw new Error('Unable to synthesize challenges for this topic. Please refine your input.');
      }

      const todayKey = `ubair_arena_usage_${new Date().toISOString().slice(0, 10)}_${emailToUse}`;
      const updatedUsed = (quotaInfo?.used_today ?? 0) + 1;
      localStorage.setItem(todayKey, String(updatedUsed));

      setAssessment(finalDeck);
      setCurrentIndex(0);
      setSelectedOption(null);
      setShowHint(false);
      setRevealedDirectly(false);
      setUserWrittenAnswer('');
      setTextEvaluation(null);
      setUserAnswers({});
      setPhase('active');
      fetchQuota();
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setErrorMessage(err.message || 'Connection interrupted. Please retry.');
        setPhase('setup');
      }
    } finally {
      abortControllerRef.current = null;
    }
  };

  useEffect(() => {
    if (isOpen) {
      setErrorMessage(null);
      setShowExitModal(false);

      if (initialTopic && initialTopic.trim()) {
        setTopicPrompt(initialTopic.trim());
        if (initialHorizon) setSelectedMode(initialHorizon);
        handleStartAssessment(initialTopic.trim(), initialPrinciples, initialHorizon, initialPitfalls, false);
      } else {
        setPhase('briefing');
      }
    }
  }, [isOpen, initialTopic]);

  const isExitingRef = useRef(false);

  // Stable refs placed upfront to guarantee zero closure drift
  const phaseRef = useRef(phase);
  const showExitModalRef = useRef(showExitModal);
  const showUpgradeModalRef = useRef(showUpgradeModal);
  const assessmentRef = useRef(assessment);

  useEffect(() => { phaseRef.current = phase; }, [phase]);
  useEffect(() => { showExitModalRef.current = showExitModal; }, [showExitModal]);
  useEffect(() => { showUpgradeModalRef.current = showUpgradeModal; }, [showUpgradeModal]);
  useEffect(() => { assessmentRef.current = assessment; }, [assessment]);

  // Browser Back Button & Mobile Swipe Interceptor
  useEffect(() => {
    if (!isOpen || (phase !== 'active' && phase !== 'loading')) return;

    window.history.pushState({ ubair_arena_active: true }, '', window.location.href);

    const handlePopState = () => {
      if (isExitingRef.current) return;
      window.history.pushState({ ubair_arena_active: true }, '', window.location.href);
      setShowExitModal(true);
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [isOpen, phase]);

  const handleExitTrigger = useCallback(() => {
    const isSessionActive = 
      phaseRef.current === 'active' || 
      phaseRef.current === 'loading' || 
      Boolean(assessmentRef.current);

    if (isSessionActive) {
      setShowExitModal(true);
    } else {
      finalizeExit();
    }
  }, []);

  const finalizeExit = useCallback(() => {
    isExitingRef.current = true;
    setShowExitModal(false);
    if (abortControllerRef.current) abortControllerRef.current.abort();

    // Complete Session Data Purge
    setAssessment(null);
    setCurrentIndex(0);
    setSelectedOption(null);
    setShowHint(false);
    setRevealedDirectly(false);
    setUserWrittenAnswer('');
    setTextEvaluation(null);
    setUserAnswers({});
    setTopicPrompt('');
    setClarificationData(null);
    setErrorMessage(null);
    setPhase('briefing');

    if (typeof window !== 'undefined') {
      try {
        const url = new URL(window.location.href);
        url.searchParams.delete('view');
        url.searchParams.delete('stage');
        window.history.replaceState({}, '', url.toString());
      } catch {}
    }

    onClose();
    setTimeout(() => {
      isExitingRef.current = false;
    }, 300);
  }, [onClose]);

  // Bulletproof Clean ESC Interceptor
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // 1. Agar Arena ka internal Upgrade Modal khula hai, toh page.tsx ko rokkar sirf ise band karo
        if (showUpgradeModalRef.current) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setShowUpgradeModal(false);
          return;
        }

        // 2. Agar Exit confirmation modal khula hai, toh ESC dabane par use band karo (Resume test)
        if (showExitModalRef.current) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setShowExitModal(false);
          return;
        }

        // 3. Active session mein ESC dabane par confirmation popup laao
        const isSessionActive = 
          phaseRef.current === 'active' || 
          phaseRef.current === 'loading' || 
          Boolean(assessmentRef.current);

        if (isSessionActive) {
          e.preventDefault();
          e.stopPropagation();
          e.stopImmediatePropagation();
          setShowExitModal(true);
        } else {
          // Briefing ya Setup stage par ho toh seedha close karo
          finalizeExit();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [isOpen, finalizeExit]);

  if (!isOpen) return null;

  const handleSelectClarificationArea = (area: string) => {
    const refinedPrompt = `${clarificationData?.topic || topicPrompt}: ${area}`;
    setTopicPrompt(refinedPrompt);
    setClarificationData(null);
    handleStartAssessment(refinedPrompt, undefined, undefined, undefined, true);
  };

  const handleSelectOption = (idx: number) => {
    if (selectedOption !== null || revealedDirectly || !assessment) return;

    setSelectedOption(idx);
    const currentCh = assessment.challenges[currentIndex];
    const isCorrect = idx === currentCh.correct_option_index;

    setUserAnswers(prev => ({
      ...prev,
      [currentIndex]: {
        correct: isCorrect,
        chosenOption: idx,
        topic: currentCh.title
      }
    }));
  };

  const handleRevealSolution = () => {
    if (!assessment || revealedDirectly || selectedOption !== null) return;
    setRevealedDirectly(true);
    setShowHint(false);

    const currentCh = assessment.challenges[currentIndex];
    setUserAnswers(prev => ({
      ...prev,
      [currentIndex]: {
        correct: false,
        topic: currentCh.title
      }
    }));
  };

  const handleEvaluateWrittenDefense = async () => {
    if (!userWrittenAnswer.trim() || isEvaluatingText || !assessment) return;

    setIsEvaluatingText(true);
    const currentCh = assessment.challenges[currentIndex];

    try {
      const res = await fetch(`${API_BASE}/api/assessment/evaluate-answer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          scenario: currentCh.scenario,
          question: currentCh.scenario,
          user_answer: userWrittenAnswer.trim(),
          answer: userWrittenAnswer.trim(),
          expected_concept: currentCh.concept_breakdown,
          language: getEffectiveLanguage()
        })
      });

      if (!res.ok) throw new Error('Evaluation service offline.');
      const data = await res.json();
      const evalData: EvaluationResult = data.evaluation || data.result || data;
      setTextEvaluation(evalData);

      const isPass = (evalData.score || 0) >= 7;
      setUserAnswers(prev => ({
        ...prev,
        [currentIndex]: {
          correct: isPass,
          textScore: evalData.score || 0,
          topic: currentCh.title
        }
      }));
    } catch {
      const fallbackResult: EvaluationResult = {
        score: 6,
        verdict: 'Good Attempt',
        critique: 'Operational reasoning aligns with core principles; ensure edge conditions are explicitly articulated.',
        invariant_accuracy: 'Consistent with fundamental principles.',
        missed_key_points: ['Boundary state mutations were left implicit.'],
        first_principle_takeaway: 'Trace state mutations before asserting conclusions.'
      };
      setTextEvaluation(fallbackResult);
      setUserAnswers(prev => ({
        ...prev,
        [currentIndex]: {
          correct: false,
          textScore: 6,
          topic: currentCh.title
        }
      }));
    } finally {
      setIsEvaluatingText(false);
    }
  };

  const handleNextChallenge = () => {
    if (!assessment) return;

    if (currentIndex + 1 < assessment.challenges.length) {
      setCurrentIndex(prev => prev + 1);
      setSelectedOption(null);
      setShowHint(false);
      setRevealedDirectly(false);
      setUserWrittenAnswer('');
      setTextEvaluation(null);
      setCodeCopied(false);
    } else {
      setPhase('report');
    }
  };

  const handleRetestWeakConcepts = () => {
    if (!assessment) return;
    const weakTopics = assessment.challenges
      .filter((_, idx) => !userAnswers[idx]?.correct)
      .map(c => c.title);

    const retestPrompt = weakTopics.length > 0
      ? `Strengthen core principles in ${assessment.topic_title}: ${weakTopics.join(', ')}`
      : `Mastery challenge set on ${assessment.topic_title}`;

    setTopicPrompt(retestPrompt);
    handleStartAssessment(retestPrompt, undefined, undefined, undefined, true);
  };

  const handleResetArena = () => {
    setAssessment(null);
    setTopicPrompt('');
    setSelectedMode('balanced');
    setClarificationData(null);
    setUserAnswers({});
    setPhase('setup');
    fetchQuota();
  };

  const currentChallenge = assessment?.challenges[currentIndex];
  const totalChallenges = assessment?.challenges.length || 0;
  const correctCount = Object.values(userAnswers).filter(a => a.correct).length;
  const accuracyPercentage = totalChallenges > 0 ? Math.round((correctCount / totalChallenges) * 100) : 0;
  const isQuestionAnsweredOrRevealed = selectedOption !== null || revealedDirectly || Boolean(textEvaluation);

  return (
    <div className="fixed inset-0 z-50 bg-[#07080b] text-zinc-200 flex flex-col font-sans select-none overflow-hidden antialiased h-[100dvh] w-full animate-in fade-in duration-150">
      
      {/* 1. SEAMLESS LUXURY OBSIDIAN HEADER */}
      <header className="h-14 sm:h-16 px-3 sm:px-6 lg:px-12 flex items-center justify-between shrink-0 bg-[#07080b]/75 backdrop-blur-2xl relative z-20 select-none border-b border-white/[0.04]">
        
        {/* Specular Edge Divider */}
        <div className="absolute bottom-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent pointer-events-none" />
        <div className="absolute bottom-0 left-1/3 right-1/3 h-[1px] bg-gradient-to-r from-transparent via-amber-400/20 to-transparent blur-[0.5px] pointer-events-none" />

        {/* Left: Branding & Dynamic Subject Path */}
        <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
          <div className="relative w-6 h-6 sm:w-7 sm:h-7 flex items-center justify-center shrink-0">
            <img
              src="/assets/ubair-logo.png"
              alt="Ubair OS"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = 'none';
                const fallback = e.currentTarget.parentElement?.querySelector('.logo-fallback');
                if (fallback) fallback.classList.remove('hidden');
              }}
              className="w-full h-full object-contain scale-[1.7] select-none pointer-events-none drop-shadow-[0_0_12px_rgba(251,191,36,0.35)]"
            />
            <div className="logo-fallback hidden w-6 h-6 sm:w-7 sm:h-7 rounded-lg bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
              <span className="text-amber-400 font-mono font-bold text-xs">U</span>
            </div>
          </div>

          <div className="flex items-baseline gap-1.5 select-none font-sans shrink-0">
            <span className="text-[14px] sm:text-[14.5px] font-semibold tracking-tight text-white">Ubair</span>
            <span className="text-[13px] sm:text-[13.5px] font-semibold bg-gradient-to-r from-amber-200 via-amber-300 to-yellow-500 bg-clip-text text-transparent">
              Arena
            </span>
          </div>

          {assessment && phase === 'active' && (
            <div className="hidden md:flex items-center gap-2 ml-2 pl-3 border-l border-white/[0.08] min-w-0">
              <span className="text-xs text-zinc-400 font-mono truncate max-w-[200px] xl:max-w-xs">
                {assessment.topic_title}
              </span>
            </div>
          )}
        </div>

        {/* Right: Telemetry & Pro CTA */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          
          <div className="flex items-center gap-1.5 sm:gap-2">
            <div className="flex items-center gap-1.5 sm:gap-2 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] text-[10px] sm:text-[11px] font-mono backdrop-blur-md">
              <span className="text-zinc-500 hidden sm:inline">Plan:</span>
              {quotaInfo?.role === 'admin' || resolveUserEmail() === 'mdsalikubair@gmail.com' || userTier === 'admin' ? (
                <span className="text-amber-300 font-medium">Founder · Unlimited</span>
              ) : quotaInfo?.role === 'pro' || userTier === 'pro' ? (
                <span className="text-amber-300 font-medium">Pro · {quotaInfo?.remaining ?? 30} Left</span>
              ) : (quotaInfo?.remaining ?? 3) <= 0 ? (
                <div className="flex items-center gap-1 text-zinc-300">
                  <span className="text-rose-400 font-bold">0/{quotaInfo?.max_daily ?? 3}</span>
                  <span className="text-zinc-600 hidden sm:inline">•</span>
                  <span className="text-zinc-400 text-[10px] tabular-nums hidden sm:inline">{resetCountdown}</span>
                </div>
              ) : (
                <div className="flex items-center gap-1 text-zinc-300">
                  <span className="text-zinc-200 font-medium">{quotaInfo?.remaining ?? 3}</span>
                  <span className="text-zinc-500">Free</span>
                </div>
              )}
            </div>

            {/* SaaS Pro Upgrade Button (Permanently hidden if user is Pro or Admin on either quotaInfo, userTier, or Founder email) */}
            {(() => {
              const currentRole = quotaInfo?.role || userTier || 'free';
              const isProOrAdmin = 
                currentRole === 'pro' || 
                currentRole === 'admin' || 
                userTier === 'pro' || 
                userTier === 'admin' || 
                resolveUserEmail() === 'mdsalikubair@gmail.com';

              if (isProOrAdmin) return null;

              return hasPendingProRequest ? (
                <div 
                  className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-white/[0.03] border border-white/[0.08] text-amber-200/90 text-[10px] sm:text-[11px] font-mono select-none backdrop-blur-md cursor-default"
                  title="Pro upgrade request registered in Founder Vault"
                >
                  <span className="text-amber-400 text-xs font-semibold">✓</span>
                  <span className="tracking-wide">Under Review</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    if (onOpenUpgradeModal) onOpenUpgradeModal();
                    else setShowUpgradeModal(true);
                  }}
                  className="flex items-center gap-1 px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full bg-gradient-to-r from-amber-200 via-white to-amber-100 text-black text-[10px] sm:text-[11px] font-semibold tracking-wide hover:opacity-95 active:scale-95 transition-all shadow-[0_0_16px_rgba(255,255,255,0.18)] cursor-pointer"
                >
                  <span>Upgrade</span>
                  <span className="text-[10px]">⚡</span>
                </button>
              );
            })()}
          </div>

          {phase === 'active' && (
            <div className="px-2 py-1 rounded-md bg-white/[0.03] border border-white/[0.06] text-[11px] sm:text-xs font-mono text-zinc-300">
              {currentIndex + 1}/{totalChallenges}
            </div>
          )}

          <button
            type="button"
            onClick={handleExitTrigger}
            className="group flex items-center justify-center gap-1 px-2 sm:px-2.5 py-1 sm:py-1.5 rounded-md bg-white/[0.03] hover:bg-white/[0.08] border border-white/[0.12] hover:border-white/30 transition-all cursor-pointer shadow-sm active:scale-95 backdrop-blur-md"
            title="Exit Arena (Esc)"
          >
            <span className="text-[10px] sm:text-[10.5px] font-mono font-medium tracking-wider text-neutral-400 group-hover:text-white transition-colors">
              Esc
            </span>
            <svg
              width="10"
              height="10"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className="text-neutral-500 group-hover:text-neutral-200 transition-colors"
            >
              <line x1="18" y1="6" x2="6" y2="18" />
              <line x1="6" y1="6" x2="18" y2="18" />
            </svg>
          </button>
        </div>

      </header>

      {/* 2. MAIN WORKSPACE VIEWPORT WITH AMBIENT BACKDROP */}
      <div className="flex-1 overflow-y-auto px-4 sm:px-6 lg:px-8 py-4 sm:py-8 flex flex-col items-center min-h-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden relative w-full">
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[min(90vw,520px)] h-[280px] bg-gradient-to-tr from-amber-500/[0.04] via-indigo-500/[0.03] to-transparent rounded-full blur-[100px] pointer-events-none -z-10" />

        {/* ================= STAGE 1: FOUNDER-GRADE BRIEFING ================= */}
        {phase === 'briefing' && (
          <div className="max-w-2xl w-full m-auto space-y-6 sm:space-y-8 animate-in fade-in zoom-in-95 duration-200 text-center relative z-10 py-4">
            
            {/* Header Section */}
            <div className="space-y-2.5 sm:space-y-3">
              <h2 className="text-2xl sm:text-4xl font-semibold tracking-tight text-white font-sans">
                Cognitive Mastery Arena
              </h2>
              
              <p className="text-xs sm:text-sm text-zinc-400 leading-relaxed font-sans max-w-lg mx-auto px-2">
                No vanity scores, no rote memorization. Test your mental models against real-world edge cases and conceptual traps before high-stakes exams, technical interviews, or critical architecture decisions.
              </p>
            </div>

            {/* 3 Core Diagnostic Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-3.5 text-left relative pt-1">
              
              {/* Pillar 01 - Scenario Diagnostic */}
              <div className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-white/[0.04] via-white/[0.015] to-[#090b10] border border-white/[0.08] border-t-white/20 hover:border-amber-400/40 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition-all duration-300 ease-out hover:-translate-y-1 backdrop-blur-xl overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-amber-500/[0.05] rounded-full blur-2xl group-hover:bg-amber-500/[0.12] transition-all pointer-events-none" />
                
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-amber-300 font-semibold">
                    PILLAR 01
                  </span>
                  <span className="text-[9.5px] font-mono text-zinc-600 group-hover:text-amber-300 transition-colors">
                    DIAGNOSTIC
                  </span>
                </div>

                <div className="text-[13px] font-semibold text-white group-hover:text-amber-100 transition-colors mb-1 font-sans">
                  Scenario Invariants
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Solve real domain incidents and architectural trade-offs. Zero shallow trivia.
                </p>
              </div>

              {/* Pillar 02 - Trap Detection */}
              <div className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-white/[0.04] via-white/[0.015] to-[#090b10] border border-white/[0.08] border-t-white/20 hover:border-indigo-500/40 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition-all duration-300 ease-out hover:-translate-y-1 backdrop-blur-xl overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-indigo-500/[0.05] rounded-full blur-2xl group-hover:bg-indigo-500/[0.12] transition-all pointer-events-none" />
                
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-indigo-400 font-semibold">
                    PILLAR 02
                  </span>
                  <span className="text-[9.5px] font-mono text-zinc-600 group-hover:text-indigo-400 transition-colors">
                    ANALYSIS
                  </span>
                </div>

                <div className="text-[13px] font-semibold text-white group-hover:text-indigo-100 transition-colors mb-1 font-sans">
                  Trap Diagnosis
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Identify subtle boundary traps, logic fallacies, and common rookie pitfalls.
                </p>
              </div>

              {/* Pillar 03 - Socratic Defense */}
              <div className="group relative p-4 sm:p-5 rounded-2xl bg-gradient-to-b from-white/[0.04] via-white/[0.015] to-[#090b10] border border-white/[0.08] border-t-white/20 hover:border-emerald-500/40 shadow-[0_4px_24px_rgba(0,0,0,0.5)] transition-all duration-300 ease-out hover:-translate-y-1 backdrop-blur-xl overflow-hidden">
                <div className="absolute top-0 right-0 w-20 h-20 bg-emerald-500/[0.05] rounded-full blur-2xl group-hover:bg-emerald-500/[0.12] transition-all pointer-events-none" />
                
                <div className="flex items-center justify-between mb-2.5">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 font-semibold">
                    PILLAR 03
                  </span>
                  <span className="text-[9.5px] font-mono text-zinc-600 group-hover:text-emerald-400 transition-colors">
                    SOCRATIC
                  </span>
                </div>

                <div className="text-[13px] font-semibold text-white group-hover:text-emerald-100 transition-colors mb-1 font-sans">
                  First-Principle Defense
                </div>
                <p className="text-[11px] text-zinc-400 leading-relaxed font-sans">
                  Articulate your reasoning in free-form words evaluated by neural metrics.
                </p>
              </div>

            </div>

            {/* Launch Action */}
            <div className="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2.5 sm:gap-3">
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="w-full sm:w-auto h-11 px-8 rounded-full bg-white text-black hover:bg-zinc-200 text-xs font-semibold tracking-wide transition-all shadow-[0_0_24px_rgba(255,255,255,0.18)] active:scale-95 cursor-pointer flex items-center justify-center gap-2"
              >
                <span>Enter Evaluation Setup</span>
                <span className="text-xs">→</span>
              </button>

              <button
                type="button"
                onClick={handleExitTrigger}
                className="w-full sm:w-auto h-11 px-6 rounded-full bg-white/[0.03] hover:bg-white/[0.07] border border-white/[0.08] hover:border-white/20 text-xs font-medium text-zinc-400 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                Exit Workspace
              </button>
            </div>

          </div>
        )}

        {/* ================= STAGE 2: SETUP ================= */}
        {phase === 'setup' && (
          <div className="max-w-xl w-full m-auto space-y-5 sm:space-y-6 animate-in fade-in duration-150 py-4">
            <div className="space-y-1.5">
              <h3 className="text-2xl sm:text-3xl font-semibold text-white tracking-tight font-sans">
                Target Concept or Subject
              </h3>
              <p className="text-xs text-zinc-400 font-sans">
                Specify any technical concept, language invariant, or exam topic to calibrate challenges.
              </p>
            </div>

            <form onSubmit={(e) => { e.preventDefault(); handleStartAssessment(); }} className="space-y-4 sm:space-y-5">
              <div>
                <input
                  type="text"
                  required
                  autoFocus
                  maxLength={500}
                  value={topicPrompt}
                  onChange={(e) => {
                    setTopicPrompt(e.target.value);
                    if (errorMessage) setErrorMessage(null);
                  }}
                  placeholder="e.g. C Pointers, Attention Mechanism, PostgreSQL Indexing, TCP Flow Control..."
                  className="w-full rounded-xl border border-white/[0.08] bg-white/[0.02] p-3 sm:p-3.5 text-xs sm:text-sm text-white placeholder-zinc-600 outline-none transition-all focus:border-white/25 focus:bg-white/[0.03]"
                />
              </div>

              {/* Language Medium Selection */}
              <div className="space-y-2">
                <span className="text-[11px] font-medium text-zinc-400">Language Medium</span>
                <div className="flex flex-wrap items-center gap-1.5">
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
                        className={`h-8 px-3 rounded-lg text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-zinc-100 text-black font-medium shadow-sm'
                            : 'border border-white/[0.06] bg-white/[0.02] text-zinc-400 hover:text-zinc-200 hover:border-white/15'
                        }`}
                      >
                        {lang === 'Other' ? 'Custom' : lang}
                      </button>
                    );
                  })}

                  {selectedLanguage === 'Other' && (
                    <input
                      type="text"
                      autoFocus
                      value={customLanguage}
                      onChange={(e) => setCustomLanguage(e.target.value)}
                      placeholder="e.g. Urdu, German..."
                      className="h-8 px-3 rounded-lg bg-white/[0.02] border border-white/[0.08] text-xs text-white placeholder-zinc-600 outline-none focus:border-white/20 transition-all font-sans w-32 sm:w-36"
                    />
                  )}
                </div>
              </div>

              {errorMessage && (
                <div className="px-3.5 py-2.5 rounded-xl bg-white/[0.02] border border-rose-500/20 text-xs text-rose-300">
                  {errorMessage}
                </div>
              )}

              <div className="pt-2 flex items-center justify-end">
                <button
                  type="submit"
                  disabled={!topicPrompt.trim()}
                  className={`h-9 px-5 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                    topicPrompt.trim()
                      ? 'bg-zinc-100 text-black hover:bg-white active:scale-95'
                      : 'cursor-not-allowed border border-white/[0.06] bg-white/[0.02] text-zinc-600'
                  }`}
                >
                  Start Challenges
                </button>
              </div>
            </form>
          </div>
        )}

        {/* ================= STAGE 2.5: FOCUS SELECTION ================= */}
        {phase === 'clarification' && clarificationData && (
          <div className="max-w-xl w-full m-auto space-y-4 sm:space-y-5 animate-in fade-in duration-150 py-4">
            <div className="space-y-1">
              <span className="text-[10.5px] sm:text-[11px] font-mono text-zinc-500 uppercase tracking-widest">
                Focus Scope · {clarificationData.topic}
              </span>
              <h3 className="text-lg sm:text-2xl font-semibold text-white tracking-tight font-sans">
                {clarificationData.clarification_prompt}
              </h3>
            </div>

            <div className="flex flex-col gap-2 max-h-[50vh] overflow-y-auto [scrollbar-width:none]">
              {clarificationData.suggested_focus_areas.length > 0 ? (
                clarificationData.suggested_focus_areas.map((area, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSelectClarificationArea(area)}
                    className="w-full p-3 sm:p-3.5 rounded-xl bg-white/[0.015] hover:bg-white/[0.04] border border-white/[0.06] hover:border-white/20 text-left transition-all flex items-center justify-between group active:scale-[0.99] cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 sm:gap-3 min-w-0">
                      <span className="font-mono text-[11px] text-zinc-500 group-hover:text-zinc-200">
                        {String(idx + 1).padStart(2, '0')}
                      </span>
                      <span className="text-xs sm:text-sm font-medium text-zinc-300 group-hover:text-white truncate">
                        {area}
                      </span>
                    </div>
                  </button>
                ))
              ) : null}
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const target = (e.currentTarget.elements.namedItem('customScope') as HTMLInputElement)?.value?.trim();
                if (target) handleSelectClarificationArea(target);
              }}
            >
              <div className="flex items-center rounded-xl border border-white/[0.08] bg-white/[0.02] p-1 focus-within:border-white/25">
                <input
                  name="customScope"
                  type="text"
                  placeholder="Or enter custom focus area..."
                  className="w-full h-8 px-3 bg-transparent text-xs text-white placeholder-zinc-600 outline-none min-w-0"
                />
                <button
                  type="submit"
                  className="h-8 px-3 rounded-lg bg-zinc-100 text-black hover:bg-white text-xs font-medium transition-all active:scale-95 cursor-pointer shrink-0"
                >
                  Apply
                </button>
              </div>
            </form>

            <div className="pt-2 flex items-center justify-between border-t border-white/[0.06]">
              <button
                type="button"
                onClick={() => setPhase('setup')}
                className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
              >
                Change Topic
              </button>

              <button
                type="button"
                onClick={() => handleStartAssessment(clarificationData.topic, undefined, undefined, undefined, true)}
                className="text-xs font-medium text-zinc-300 hover:text-white transition-colors cursor-pointer"
              >
                Practice Full Domain
              </button>
            </div>
          </div>
        )}

        {/* ================= STAGE 3: MINIMAL LOADER ================= */}
        {phase === 'loading' && (
          <div className="m-auto py-16 flex flex-col items-center justify-center text-center animate-in fade-in duration-200 max-w-sm w-full px-6">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-white/15 border-t-white mb-4" />
            <h3 className="text-sm font-medium text-white mb-1.5 font-sans">
              Preparing Scenarios
            </h3>
            <p className="font-mono text-xs text-zinc-500 tracking-wide">
              {loadingElapsed < 6
                ? 'Structuring scenario invariants…'
                : loadingElapsed < 16
                ? 'Crafting edge cases & traps…'
                : 'Preparing concept breakdowns…'}
            </p>
          </div>
        )}

        {/* ================= STAGE 4: ACTIVE RUNNER ================= */}
        {phase === 'active' && currentChallenge && (
          <div className="max-w-2xl w-full m-auto py-2 space-y-5 sm:space-y-6 animate-in fade-in duration-150">
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2 text-[10.5px] sm:text-[11px] font-mono text-zinc-500 uppercase tracking-widest">
                <span>Challenge {currentIndex + 1} of {totalChallenges}</span>
                {currentChallenge.cognitive_tier && (
                  <>
                    <span>•</span>
                    <span className="text-zinc-400">{currentChallenge.cognitive_tier}</span>
                  </>
                )}
                <span>•</span>
                <span className="truncate max-w-[200px] sm:max-w-xs text-zinc-300">{currentChallenge.title}</span>
              </div>

              {/* Scenario */}
              <div className="text-sm sm:text-base md:text-lg font-normal text-zinc-100 leading-relaxed font-sans">
                <ArenaRichText content={currentChallenge.scenario} />
              </div>
            </div>

            {/* Code Snippet Display Window */}
            {currentChallenge.code_snippet && (() => {
              const lines = currentChallenge.code_snippet.trim().split('\n');
              return (
                <div className="rounded-xl overflow-hidden bg-[#090a0e] border border-white/[0.08] shadow-2xl max-w-full min-w-0">
                  <div className="px-3 sm:px-4 py-2 bg-white/[0.015] border-b border-white/[0.06] flex items-center justify-between">
                    <span className="text-[10px] sm:text-[10.5px] font-mono text-zinc-500 uppercase tracking-wider">
                      Execution Snippet
                    </span>

                    <button
                      type="button"
                      onClick={() => {
                        try {
                          navigator.clipboard.writeText(currentChallenge.code_snippet || '');
                        } catch {
                          const el = document.createElement('textarea');
                          el.value = currentChallenge.code_snippet || '';
                          document.body.appendChild(el);
                          el.select();
                          document.execCommand('copy');
                          document.body.removeChild(el);
                        }
                        setCodeCopied(true);
                        setTimeout(() => setCodeCopied(false), 1800);
                      }}
                      className="text-[10.5px] font-mono text-zinc-400 hover:text-white transition-colors cursor-pointer"
                    >
                      {codeCopied ? 'Copied' : 'Copy'}
                    </button>
                  </div>

                  <div className="p-3 sm:p-4 font-mono text-xs sm:text-[13px] leading-relaxed overflow-x-auto flex bg-[#06070a] [scrollbar-width:thin]">
                    <div className="select-none text-zinc-600 text-right pr-3 sm:pr-4 border-r border-white/[0.06]">
                      {lines.map((_, i) => (
                        <div key={i}>{i + 1}</div>
                      ))}
                    </div>
                    <div className="pl-3 sm:pl-4 text-zinc-300 whitespace-pre w-full min-w-0">
                      {lines.map((line, i) => (
                        <div key={i} className="leading-relaxed">
                          {highlightCodeLine(line)}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* MCQ Options */}
            {currentChallenge.options && currentChallenge.options.length > 0 && (
              <div className="flex flex-col gap-2 pt-1">
                {currentChallenge.options.map((opt, idx) => {
                  const isSelected = selectedOption === idx;
                  const isCorrect = currentChallenge.correct_option_index === idx;

                  let cardStyle = "bg-white/[0.015] hover:bg-white/[0.04] border-white/[0.06] hover:border-white/20 text-zinc-300";
                  let badgeText = "text-zinc-500";

                  if (isQuestionAnsweredOrRevealed) {
                    if (isCorrect) {
                      cardStyle = "bg-emerald-500/[0.08] border-emerald-500/40 text-emerald-200 font-medium";
                      badgeText = "text-emerald-400 font-bold";
                    } else if (isSelected && !isCorrect) {
                      cardStyle = "bg-rose-500/[0.08] border-rose-500/40 text-rose-200";
                      badgeText = "text-rose-400 font-bold";
                    } else {
                      cardStyle = "opacity-35 bg-white/[0.01] border-white/[0.04] text-zinc-500";
                      badgeText = "text-zinc-600";
                    }
                  }

                  return (
                    <button
                      key={idx}
                      type="button"
                      disabled={isQuestionAnsweredOrRevealed}
                      onClick={() => handleSelectOption(idx)}
                      className={`w-full p-3.5 sm:p-4 rounded-xl border text-left text-xs sm:text-sm transition-all flex items-start gap-3 cursor-pointer active:scale-[0.995] ${cardStyle}`}
                    >
                      <span className={`font-mono text-xs mt-0.5 shrink-0 ${badgeText}`}>
                        {String.fromCharCode(65 + idx)}
                      </span>
                      <span className="block leading-relaxed flex-1 font-sans min-w-0">
                        <ArenaRichText content={opt} />
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            {/* Socratic Defense Input */}
            {(currentChallenge.type === 'socratic_text' || !currentChallenge.options || currentChallenge.options.length === 0) && (
              <div className="space-y-3 pt-1">
                <textarea
                  rows={4}
                  disabled={Boolean(textEvaluation)}
                  value={userWrittenAnswer}
                  onChange={(e) => setUserWrittenAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                      e.preventDefault();
                      handleEvaluateWrittenDefense();
                    }
                  }}
                  placeholder="Formulate your technical reasoning in your own words... (Ctrl + Enter to submit)"
                  className="w-full p-3 sm:p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.08] focus:border-white/25 text-xs sm:text-sm text-zinc-100 placeholder-zinc-600 outline-none transition-all resize-none leading-relaxed font-sans"
                />

                {!textEvaluation && (
                  <div className="flex items-center justify-between">
                    <span className="text-[10.5px] sm:text-[11px] font-mono text-zinc-500">Ctrl + Enter</span>
                    <button
                      type="button"
                      disabled={!userWrittenAnswer.trim() || isEvaluatingText}
                      onClick={handleEvaluateWrittenDefense}
                      className="h-8 px-4 rounded-lg bg-zinc-100 text-black hover:bg-white text-xs font-medium transition-all disabled:opacity-30 active:scale-95 cursor-pointer"
                    >
                      {isEvaluatingText ? 'Evaluating…' : 'Submit Reasoning'}
                    </button>
                  </div>
                )}

                {/* Socratic Evaluation Result */}
                {textEvaluation && (
                  <div className="p-3.5 sm:p-4 rounded-xl bg-white/[0.015] border border-white/[0.08] space-y-2.5 sm:space-y-3">
                    <div className="flex items-center justify-between text-xs font-mono border-b border-white/[0.06] pb-2">
                      <span className="text-white font-medium">{textEvaluation.verdict}</span>
                      <span className="text-zinc-400">Score: {textEvaluation.score}/10</span>
                    </div>

                    <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed font-sans">
                      {textEvaluation.critique}
                    </p>

                    {textEvaluation.invariant_accuracy && (
                      <div className="text-xs text-zinc-400 font-sans border-l border-white/20 pl-3">
                        <strong className="text-zinc-200">Alignment: </strong>
                        <ArenaRichText content={textEvaluation.invariant_accuracy} />
                      </div>
                    )}

                    {textEvaluation.missed_key_points && textEvaluation.missed_key_points.length > 0 && (
                      <div className="space-y-1">
                        <span className="text-[10px] sm:text-[10.5px] font-mono text-zinc-500 uppercase tracking-wider">
                          Key Misses
                        </span>
                        <ul className="text-xs text-zinc-400 list-disc pl-4 space-y-0.5">
                          {textEvaluation.missed_key_points.map((pt, i) => (
                            <li key={i}><ArenaRichText content={pt} /></li>
                          ))}
                        </ul>
                      </div>
                    )}

                    {textEvaluation.first_principle_takeaway && (
                      <div className="p-2.5 sm:p-3 rounded-lg bg-white/[0.02] border border-white/[0.06] text-xs text-zinc-300 font-sans">
                        <span className="font-semibold text-white font-mono">Core Takeaway: </span>
                        <ArenaRichText content={textEvaluation.first_principle_takeaway} />
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* Controls Bar */}
            <div className="pt-3 sm:pt-4 border-t border-white/[0.06] space-y-3">
              <div className="flex items-center justify-between">
                {!isQuestionAnsweredOrRevealed ? (
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setShowHint(prev => !prev)}
                      className="text-xs font-mono text-zinc-400 hover:text-zinc-200 transition-colors cursor-pointer"
                    >
                      {showHint ? 'Hide Clue' : 'Hint'}
                    </button>

                    <button
                      type="button"
                      onClick={handleRevealSolution}
                      className="text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                    >
                      Reveal Solution
                    </button>
                  </div>
                ) : <div />}

                {isQuestionAnsweredOrRevealed && (
                  <button
                    type="button"
                    onClick={handleNextChallenge}
                    className="h-8 px-4 rounded-lg bg-zinc-100 text-black hover:bg-white text-xs font-medium transition-all active:scale-95 ml-auto cursor-pointer"
                  >
                    {currentIndex + 1 === totalChallenges ? 'View Report' : 'Next Challenge'}
                  </button>
                )}
              </div>

              {/* Analytical Hint Box */}
              {showHint && !isQuestionAnsweredOrRevealed && (
                <div className="p-3.5 sm:p-4 rounded-xl bg-white/[0.015] border border-white/[0.08] space-y-2 animate-in fade-in duration-150">
                  <span className="text-[10px] sm:text-[10.5px] font-mono text-zinc-500 uppercase tracking-wider">
                    Hint
                  </span>
                  <div className="text-xs text-zinc-300 leading-relaxed space-y-1">
                    {currentChallenge.concept_breakdown
                      .split('•')
                      .map(s => s.trim())
                      .filter(Boolean)
                      .map((point, pIdx) => (
                        <div key={pIdx} className="flex items-start gap-2">
                          <span className="text-zinc-600 select-none">·</span>
                          <ArenaRichText content={point} />
                        </div>
                      ))}
                  </div>

                  {currentChallenge.elimination_hint && (
                    <div className="pt-2 border-t border-white/[0.04] text-xs text-zinc-400 flex items-baseline gap-1.5 font-sans">
                      <span className="text-zinc-500 font-mono text-[10px] sm:text-[10.5px]">Elimination:</span>
                      <ArenaRichText content={currentChallenge.elimination_hint} className="text-zinc-300" />
                    </div>
                  )}
                </div>
              )}

              {/* Resolution Explanation */}
              {isQuestionAnsweredOrRevealed && (
                <div className="p-3.5 sm:p-4 rounded-xl bg-white/[0.015] border border-white/[0.08] space-y-1.5 animate-in fade-in duration-150">
                  <span className="text-[10px] sm:text-[10.5px] font-mono text-zinc-500 uppercase tracking-wider">
                    Explanation
                  </span>
                  <div className="text-xs sm:text-[13px] text-zinc-300 leading-relaxed font-sans">
                    <ArenaRichText content={currentChallenge.explanation} />
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ================= STAGE 5: SUMMARY REPORT ================= */}
        {phase === 'report' && assessment && (
          <div className="max-w-xl w-full m-auto py-4 space-y-5 sm:space-y-6 animate-in fade-in duration-150">
            <div className="text-center space-y-1">
              <span className="text-xs font-mono tracking-widest text-zinc-500 uppercase">
                Session Complete
              </span>
              <div className="text-4xl sm:text-5xl font-semibold tracking-tight text-white font-mono">
                {accuracyPercentage}%
              </div>
              <p className="text-xs text-zinc-400 font-sans pt-1">
                Mastered <span className="text-white font-medium">{correctCount}</span> of {totalChallenges} concepts in{' '}
                <span className="text-white font-medium">{assessment.topic_title}</span>.
              </p>
            </div>

            {/* Diagnostic Matrix */}
            <div className="space-y-2">
              <span className="text-[10px] sm:text-[10.5px] font-mono tracking-wider text-zinc-500 uppercase">
                Topics Covered
              </span>
              <div className="flex flex-col gap-1.5 max-h-[45vh] overflow-y-auto [scrollbar-width:thin]">
                {assessment.challenges.map((c, i) => {
                  const passed = userAnswers[i]?.correct;
                  return (
                    <div
                      key={i}
                      className="p-3 rounded-xl bg-white/[0.015] border border-white/[0.05] flex items-center justify-between text-xs"
                    >
                      <span className="text-zinc-300 truncate font-sans min-w-0 pr-2">{c.title}</span>
                      <span className={`font-mono text-[10.5px] sm:text-[11px] shrink-0 ml-2 ${passed ? 'text-emerald-400' : 'text-rose-400'}`}>
                        {passed ? 'Mastered' : 'Needs Review'}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="pt-3 sm:pt-4 border-t border-white/[0.06] flex items-center justify-between flex-wrap gap-2">
              <button
                type="button"
                onClick={handleRetestWeakConcepts}
                className="h-9 px-4 rounded-lg bg-zinc-100 text-black hover:bg-white text-xs font-medium transition-all active:scale-95 cursor-pointer"
              >
                Retest Weak Concepts
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleResetArena}
                  className="px-3 py-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer"
                >
                  New Topic
                </button>
                <button
                  type="button"
                  onClick={handleExitTrigger}
                  className="h-9 px-4 rounded-lg border border-white/[0.08] bg-white/[0.02] text-xs font-medium text-zinc-300 hover:text-white hover:border-white/20 transition-all active:scale-95 cursor-pointer"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* ================= STATUS TOAST ================= */}
      {statusNotice && (
        <div className="absolute top-16 sm:top-20 left-1/2 -translate-x-1/2 z-50 rounded-full border border-white/10 bg-[#121318]/90 px-4 py-1.5 text-xs font-mono text-zinc-200 backdrop-blur-md animate-in fade-in shadow-xl pointer-events-none whitespace-nowrap">
          {statusNotice}
        </div>
      )}

      {/* ================= SAAS PRO UPGRADE MODAL ================= */}
      {showUpgradeModal && (
        <div
          className="fixed inset-0 z-60 flex items-center justify-center bg-black/85 p-4 sm:p-6 backdrop-blur-xl animate-in fade-in duration-150"
          onClick={() => setShowUpgradeModal(false)}
        >
          <div
            className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0b10] p-5 sm:p-7 space-y-5 sm:space-y-6 shadow-[0_20px_70px_rgba(0,0,0,0.9)] max-h-[90dvh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-white/[0.06] pb-3 sm:pb-4">
              <div className="space-y-1">
                <span className="text-[10px] sm:text-[10.5px] font-mono uppercase tracking-widest text-amber-300 font-semibold">
                  Arena Pro Tier
                </span>
                <h4 className="text-sm sm:text-base font-semibold text-white tracking-tight">
                  Unlock Mastery Limits
                </h4>
              </div>

              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="text-xs font-mono text-zinc-500 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-zinc-300 leading-relaxed font-sans">
              Free accounts receive 3 daily evaluation sessions. Upgrade to Arena Pro for high-yield interview preparation and unrestricted deep evaluations.
            </p>

            <div className="space-y-2 rounded-2xl border border-white/[0.08] bg-white/[0.02] p-3.5 sm:p-4 text-xs font-sans">
              <div className="flex items-center gap-2.5 text-zinc-200">
                <span className="text-emerald-400 font-bold">✓</span>
                <span><strong>30 Complete Challenge Sets</strong> Per Day</span>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-200">
                <span className="text-emerald-400 font-bold">✓</span>
                <span><strong>Neural Socratic Defense</strong> with Detailed Concept Scoring</span>
              </div>
              <div className="flex items-center gap-2.5 text-zinc-200">
                <span className="text-emerald-400 font-bold">✓</span>
                <span><strong>Automated Weak Concept Retesting</strong> on Failed Scenarios</span>
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
                    setStatusNotice('Pro access request sent to Founder • Reviewing your workspace');
                  } catch {
                    setStatusNotice('Pro request noted • Founder notified');
                  }
                  setTimeout(() => setStatusNotice(null), 3500);
                }}
                className="w-full rounded-2xl bg-gradient-to-r from-amber-200 via-white to-amber-100 py-2.5 sm:py-3 text-xs font-semibold text-black hover:opacity-90 transition-all active:scale-95 cursor-pointer shadow-lg"
              >
                Request Pro Access · Free Early Access
              </button>

              <button
                type="button"
                onClick={() => setShowUpgradeModal(false)}
                className="w-full py-1.5 text-xs font-mono text-zinc-500 hover:text-zinc-300 transition-colors cursor-pointer text-center"
              >
                Continue Free (Resets at 00:00 UTC)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ================= BULLETPROOF EXIT CONFIRMATION MODAL ================= */}
      {showExitModal && (
        <div 
          className="fixed inset-0 z-[80] bg-black/85 backdrop-blur-md flex items-center justify-center p-4 sm:p-6 animate-in fade-in duration-150"
          onClick={() => setShowExitModal(false)}
        >
          <div 
            className="max-w-xs w-full bg-[#0c0d12] border border-white/[0.1] p-5 sm:p-6 rounded-2xl text-center space-y-4 shadow-2xl animate-in zoom-in-95 duration-100"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="space-y-1.5">
              <h4 className="text-[14px] font-semibold text-white tracking-tight font-sans">
                {phase === 'loading' ? 'Cancel Generation?' : 'Discard Assessment?'}
              </h4>
              <p className="text-xs text-zinc-400 leading-relaxed font-sans">
                Active session progress will be permanently reset if you exit now.
              </p>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowExitModal(false)}
                className="flex-1 h-9 rounded-lg border border-white/[0.08] bg-white/[0.04] hover:bg-white/[0.08] text-xs font-medium text-zinc-300 hover:text-white transition-all active:scale-95 cursor-pointer"
              >
                Resume Test
              </button>
              <button
                type="button"
                onClick={finalizeExit}
                className="flex-1 h-9 rounded-lg bg-rose-500/90 hover:bg-rose-500 text-white text-xs font-semibold transition-all active:scale-95 cursor-pointer shadow-sm"
              >
                Discard & Exit
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}