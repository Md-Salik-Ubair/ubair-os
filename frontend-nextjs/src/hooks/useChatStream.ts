'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { Message, TelemetryData } from '../types/chat';

const RAW_API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const API_BASE = RAW_API_BASE.endsWith('/api/chat') 
  ? RAW_API_BASE 
  : `${RAW_API_BASE.replace(/\/+$/, '')}/api/chat`;

interface SendMessageOptions {
  files?: File[];
  userEmail?: string;
  mode?: 'workspace' | 'temp';
  engineMode?: 'fast' | 'forge' | 'auto';
  token?: string;
}

export interface CooldownState {
  isActive: boolean;
  remainingSeconds: number;
  cooldownUntil: string;
  feature: string;
}

export function useChatStream(sessionId: string = 'quick_1') {
  const [messages, setMessages] = useState<Message[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [activeTelemetry, setActiveTelemetry] = useState<TelemetryData | null>(null);
  const [cooldown, setCooldown] = useState<CooldownState | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Abort active stream cleanly if session switches
  useEffect(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, [sessionId]);

  const loadMessages = useCallback((hydratedMessages: Message[]) => {
    setMessages(hydratedMessages);
    setActiveTelemetry(null);
  }, []);

  const clearMessages = useCallback(() => {
    setMessages([]);
    setActiveTelemetry(null);
  }, []);

  const stopStream = useCallback(() => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      setIsLoading(false);
    }
  }, []);

  const sendMessage = useCallback(
    async (content: string, options?: SendMessageOptions) => {
      const trimmedContent = content.trim();
      const files = options?.files || [];
      const userEmail = options?.userEmail || 'anonymous';
      const mode = options?.mode || (sessionId.startsWith('ws_') ? 'workspace' : 'temp');

      if ((!trimmedContent && files.length === 0) || isLoading) return;

      const userMessageId = `msg_${Date.now()}`;
      const assistantMessageId = `msg_${Date.now() + 1}`;

      const displayContent = trimmedContent || (files.length === 1 ? `[Attached: ${files[0].name}]` : `[Attached ${files.length} files]`);

      const userMessage: Message = {
        id: userMessageId,
        role: 'user',
        content: displayContent,
        timestamp: new Date().toISOString(),
      };

      const initialAssistantMessage: Message = {
        id: assistantMessageId,
        role: 'assistant',
        content: '',
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, userMessage, initialAssistantMessage]);
      setIsLoading(true);
      setActiveTelemetry(null);

      const controller = new AbortController();
      abortControllerRef.current = controller;
      let accumulatedReply = '';
      let extractedCardData: any = null;

      try {
        const formData = new FormData();
        formData.append('message', trimmedContent);
        formData.append('user_id', userEmail);
        formData.append('user_email', userEmail);
        formData.append('mode', mode);
        formData.append('session_id', sessionId);
        formData.append('engine_mode', options?.engineMode || 'fast');

        files.forEach((file) => {
          formData.append('files', file);
        });

        const headers: Record<string, string> = {};
        if (options?.token) {
          headers['Authorization'] = `Bearer ${options.token}`;
        }

        const response = await fetch(API_BASE, {
          method: 'POST',
          headers,
          body: formData,
          signal: controller.signal,
        });

        // 1. Handle 429 Cooldown Trigger from security.py
        if (response.status === 429) {
          const errorData = await response.json().catch(() => null);
          const detail = errorData?.detail;

          if (detail && typeof detail === 'object' && detail.cooldown_active) {
            setCooldown({
              isActive: true,
              remainingSeconds: detail.remaining_seconds || 10800,
              cooldownUntil: detail.cooldown_until || '',
              feature: 'chat'
            });

            const cooldownMsg = `⚠️ **Resource Cooldown Active**\n\n${detail.message || 'Daily limit reached.'}\n\n*Cooldown expires in: ~${Math.ceil((detail.remaining_seconds || 10800) / 60)} minutes.*`;
            
            setMessages((prev) =>
              prev.map((msg) =>
                msg.id === assistantMessageId
                  ? { ...msg, content: cooldownMsg }
                  : msg
              )
            );
            return;
          }
        }

        if (!response.ok || !response.body) {
          const errText = await response.text().catch(() => '');
          throw new Error(errText || `Server returned status ${response.status}`);
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder('utf-8');
        let sseBuffer = '';

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          const rawChunk = decoder.decode(value, { stream: true });

          // SSE Envelope Fallback
          if (rawChunk.includes('data: ') || sseBuffer) {
            sseBuffer += rawChunk;
            const lines = sseBuffer.split('\n');
            sseBuffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed.startsWith('data: ')) {
                // Ignore SSE comments, event names and empty keepalive lines
                if (trimmed && !trimmed.startsWith(':') && !trimmed.startsWith('event:')) {
                  accumulatedReply += trimmed;
                }
                continue;
              }

              const payloadStr = trimmed.slice(6).trim();
              if (payloadStr === '[DONE]') break;

              try {
                const parsed = JSON.parse(payloadStr);

                if (parsed.event === 'telemetry') {
                  const telemetry: TelemetryData = parsed.data;
                  setActiveTelemetry(telemetry);
                  setMessages((prev) =>
                    prev.map((msg) =>
                      msg.id === assistantMessageId ? { ...msg, telemetry } : msg
                    )
                  );
                } else if (parsed.event === 'token') {
                  accumulatedReply += parsed.data;
                } else if (parsed.event === 'clarification' || parsed.event === 'card') {
                  extractedCardData = parsed.data;
                }
              } catch {
                accumulatedReply += payloadStr;
              }
            }
          } else {
            // Direct Fastpath Raw Stream
            accumulatedReply += rawChunk;
          }

          // 2. Intercept and parse __ACTION_CARD__ injected by Smart Director
          if (accumulatedReply.includes('__ACTION_CARD__')) {
            const cardMatch = accumulatedReply.match(/__ACTION_CARD__(\{[\s\S]*?\})\n\n/);
            if (cardMatch) {
              try {
                extractedCardData = JSON.parse(cardMatch[1]);
              } catch (e) {
                console.error('Failed to parse injected action card payload:', e);
              }
              // Cleanly strip the action card JSON protocol out of visible text bubble
              accumulatedReply = accumulatedReply.replace(cardMatch[0], '');
            }
          }

          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? ({ 
                    ...msg, 
                    content: accumulatedReply,
                    ...(extractedCardData ? { cardData: extractedCardData } : {})
                  } as Message)
                : msg
            )
          );
        }
      } catch (error: any) {
        if (error.name !== 'AbortError') {
          console.error('Streaming connection error:', error);
          setMessages((prev) =>
            prev.map((msg) =>
              msg.id === assistantMessageId
                ? { 
                    ...msg, 
                    content: accumulatedReply 
                      ? `${accumulatedReply}\n\n*(Connection interrupted)*` 
                      : 'Connection fault with Neural Engine. Please retry.' 
                  }
                : msg
            )
          );
        }
      } finally {
        setIsLoading(false);
        abortControllerRef.current = null;
      }
    },
    [sessionId, isLoading]
  );

  return {
    messages,
    isLoading,
    activeTelemetry,
    cooldown,
    sendMessage,
    stopStream,
    loadMessages,
    clearMessages,
  };
}