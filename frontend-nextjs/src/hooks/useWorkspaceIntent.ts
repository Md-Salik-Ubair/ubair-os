'use client';

import { useState, useEffect, useRef, useMemo } from 'react';
import { Message } from '../types/chat';

interface WorkspaceIntent {
  shouldPrompt: boolean;
  suggestedTitle: string;
  suggestedCategory: 'code' | 'research' | 'creative' | 'general';
}

const CODE_PATTERNS = /(function|def |class |const |import |from |curl |SELECT |CREATE TABLE|<html>|export |interface |npm |pip |git )/i;
const RESEARCH_PATTERNS = /(analyze|compare|research|investigate|study|deep dive|explain the architecture|benchmark)/i;
const CREATIVE_PATTERNS = /(write a script|generate a story|branding|design system|campaign|copywriting|narrative)/i;

export function useWorkspaceIntent(messages: Message[], activeWorkspaceId: string | null = null) {
  const [intent, setIntent] = useState<WorkspaceIntent>({
    shouldPrompt: false,
    suggestedTitle: 'New Workspace Project',
    suggestedCategory: 'general',
  });

  const hasPromptedRef = useRef(false);

  // Filter only user messages to prevent running regex on every streamed assistant token
  const userMessages = useMemo(
    () => messages.filter((m) => m.role === 'user'),
    [messages.length] // Evaluates strictly on message count change, not token updates
  );

  useEffect(() => {
    // 1. If messages are cleared/purged, unlock the prompt trigger for the next session
    if (messages.length === 0) {
      hasPromptedRef.current = false;
      setIntent((prev) => (prev.shouldPrompt ? { ...prev, shouldPrompt: false } : prev));
      return;
    }

    // 2. Do not prompt if already prompted or if already inside an active workspace
    if (hasPromptedRef.current || activeWorkspaceId !== null || userMessages.length === 0) {
      return;
    }

    const lastUserMessage = userMessages[userMessages.length - 1]?.content || '';
    if (!lastUserMessage.trim()) return;

    let detectedCategory: WorkspaceIntent['suggestedCategory'] | null = null;
    let titleCandidate = 'Active Project Workspace';

    // Heuristic 1: Code / Technical Intent
    if (CODE_PATTERNS.test(lastUserMessage) || lastUserMessage.includes('```')) {
      detectedCategory = 'code';
      titleCandidate = generateTitleSnippet(lastUserMessage, 'Code Architecture');
    }
    // Heuristic 2: Research / Analytical Intent
    else if (RESEARCH_PATTERNS.test(lastUserMessage)) {
      detectedCategory = 'research';
      titleCandidate = generateTitleSnippet(lastUserMessage, 'Research Study');
    }
    // Heuristic 3: Creative / Media Intent
    else if (CREATIVE_PATTERNS.test(lastUserMessage)) {
      detectedCategory = 'creative';
      titleCandidate = generateTitleSnippet(lastUserMessage, 'Creative Blueprint');
    }
    // Heuristic 4: Conversation Depth (>= 3 user prompts in Quick Chat)
    else if (userMessages.length >= 3) {
      detectedCategory = 'general';
      titleCandidate = generateTitleSnippet(userMessages[0]?.content || '', 'Project Session');
    }

    if (detectedCategory) {
      hasPromptedRef.current = true;
      setIntent({
        shouldPrompt: true,
        suggestedTitle: titleCandidate,
        suggestedCategory: detectedCategory,
      });
    }
  }, [userMessages, activeWorkspaceId, messages.length]);

  const dismissPrompt = () => {
    setIntent((prev) => ({ ...prev, shouldPrompt: false }));
  };

  return {
    shouldPrompt: intent.shouldPrompt,
    suggestedTitle: intent.suggestedTitle,
    suggestedCategory: intent.suggestedCategory,
    dismissPrompt,
  };
}

function generateTitleSnippet(rawText: string, fallback: string): string {
  // Strip code markers, markdown, line breaks, and excessive punctuation
  const cleaned = rawText
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[\n\r#*`"']/g, ' ')
    .replace(/[:?,.-]+$/g, '')
    .trim();

  if (!cleaned) return fallback;

  // Split safely by any whitespace
  const words = cleaned.split(/\s+/).slice(0, 5).join(' ');
  const sanitized = words.replace(/[:?,.-]+$/g, '').trim();

  return sanitized.length > 32 ? `${sanitized.slice(0, 29)}...` : sanitized;
}