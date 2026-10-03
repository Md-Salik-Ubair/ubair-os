'use client';

import React, { useState } from 'react';
import Image from 'next/image';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { Message, ActionCardData, ActionCardOption } from '../../types/chat';

interface MessageBubbleProps {
  message: Message;
  onPlayAudio?: (id: string, text: string) => void;
  isPlayingAudio?: boolean;
  isLoadingAudio?: boolean;
  onCardAction?: (option: ActionCardOption) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({ 
  message, 
  onPlayAudio,
  isPlayingAudio = false,
  isLoadingAudio = false,
  onCardAction
}) => {
  const isUser = message.role === 'user';

  const formatTime = (timestamp?: string | number) => {
    if (!timestamp) return '';
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  return (
    <div className={`flex flex-col w-full ${isUser ? 'items-end' : 'items-start'} animate-in fade-in duration-150`}>
      
      {/* Sender Header & Telemetry */}
      <div className={`flex items-center gap-2.5 mb-2 px-1 ${isUser ? 'flex-row-reverse' : 'flex-row'}`}>
        {!isUser ? (
          <div className="flex items-center gap-2">
            <div className="relative w-4 h-4 flex items-center justify-center shrink-0">
              <Image
                src="/assets/ubair-logo.png"
                alt="Ubair OS"
                width={16}
                height={16}
                className="object-contain scale-125 opacity-90"
              />
            </div>
            <span className="text-[11px] font-bold tracking-widest uppercase text-white font-mono">
              Ubair OS Core
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-mono uppercase tracking-widest text-neutral-500">
            Operator
          </span>
        )}

        {/* Realtime Telemetry Indicator */}
        {message.telemetry && (
          <span className="text-[9px] font-mono px-2 py-0.5 rounded-full border border-white/10 text-neutral-400 bg-white/[0.02] flex items-center gap-1.5">
            <span className="text-emerald-400 font-semibold">{message.telemetry.provider}</span>
            <span className="w-1 h-1 bg-neutral-600 rounded-full" />
            <span>{message.telemetry.ttft_ms}ms</span>
          </span>
        )}
      </div>

      {/* Bubble Container */}
      <div className={`max-w-[92%] sm:max-w-[85%] text-[14px] sm:text-[15px] leading-relaxed ${
        isUser
          ? 'flex flex-col items-end'
          : 'text-neutral-200 w-full pl-0 sm:pl-1'
      }`}>
        
        {/* User Attached Files Chips */}
        {isUser && message.attachments && message.attachments.length > 0 && (
          <div className="flex flex-wrap justify-end gap-1.5 mb-2">
            {message.attachments.map((att, idx) => (
              <span key={idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-white/[0.05] border border-white/10 rounded-xl text-[11px] font-mono text-neutral-300">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-70">
                  <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                  <polyline points="14 2 14 8 20 8" />
                </svg>
                <span className="truncate max-w-[140px]">{att.name}</span>
              </span>
            ))}
          </div>
        )}

        {/* User Content Box */}
        {isUser ? (
          <div className="px-4 py-2.5 sm:px-5 sm:py-3 rounded-2xl rounded-tr-sm bg-[#161618] border border-white/[0.06] text-white whitespace-pre-wrap break-words shadow-sm">
            {message.content}
          </div>
        ) : (
          /* Assistant Dynamic Markdown Viewport */
          <div className="w-full overflow-hidden space-y-3 min-w-0">
            {message.content === '' && !message.cardData ? (
              <div className="mt-1 flex items-center h-6">
                <span className="inline-block w-2.5 h-4 bg-white/40 animate-pulse rounded-sm" />
              </div>
            ) : (
              <div className="break-words max-w-full">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm]}
                  components={{
                    p: ({ node, ...props }: any) => <div className="mb-4 last:mb-0 leading-relaxed text-[14.5px] sm:text-[15px]" {...props} />,
                    strong: ({ node, ...props }: any) => <strong className="font-semibold text-white" {...props} />,
                    a: ({ node, ...props }: any) => <a className="text-cyan-400 hover:text-cyan-300 underline underline-offset-2 transition-colors break-words" target="_blank" rel="noopener noreferrer" {...props} />,
                    ul: ({ node, ...props }: any) => <ul className="list-disc pl-5 mb-4 space-y-1 text-neutral-300" {...props} />,
                    ol: ({ node, ...props }: any) => <ol className="list-decimal pl-5 mb-4 space-y-1 text-neutral-300" {...props} />,
                    h1: ({ node, ...props }: any) => <h1 className="text-xl sm:text-2xl font-bold text-white mb-4 mt-6" {...props} />,
                    h2: ({ node, ...props }: any) => <h2 className="text-lg sm:text-xl font-bold text-white mb-3 mt-5" {...props} />,
                    h3: ({ node, ...props }: any) => <h3 className="text-base sm:text-lg font-semibold text-white mb-2 mt-4" {...props} />,
                    table: ({ node, ...props }: any) => <div className="overflow-x-auto my-4 border border-white/10 rounded-xl max-w-full"><table className="w-full text-left text-xs sm:text-sm" {...props} /></div>,
                    thead: ({ node, ...props }: any) => <thead className="bg-white/5 text-neutral-300 border-b border-white/10" {...props} />,
                    th: ({ node, ...props }: any) => <th className="px-3 sm:px-4 py-2 sm:py-2.5 font-semibold" {...props} />,
                    td: ({ node, ...props }: any) => <td className="px-3 sm:px-4 py-2 border-b border-white/5 last:border-0" {...props} />,
                    code: ({ node, className, children, ...props }: any) => {
                      const match = /language-(\w+)/.exec(className || '');
                      const lang = match ? match[1] : '';
                      const isInline = !match && !className;
                      const codeString = String(children).replace(/\n$/, '');

                      return isInline ? (
                        <code className="bg-white/10 px-1.5 py-0.5 rounded text-neutral-200 font-mono text-[12px] sm:text-[13px] break-words" {...props}>
                          {children}
                        </code>
                      ) : (
                        <CodeBlockHighlight language={lang || 'code'} code={codeString} />
                      );
                    }
                  }}
                >
                  {message.content}
                </ReactMarkdown>
              </div>
            )}

            {/* Claude-Style Clarification & Capability Action Cards */}
            {message.cardData && (
              <InteractiveActionCard 
                cardData={message.cardData} 
                onCardAction={onCardAction}
              />
            )}
          </div>
        )}

        {/* Footer: Timestamp & Audio TTS Controls */}
        <div className="flex items-center gap-3 pt-2">
          {message.timestamp && (
            <span className="text-[9.5px] sm:text-[10px] text-neutral-500 font-mono tracking-tight select-none">
              {formatTime(message.timestamp)}
            </span>
          )}

          {!isUser && message.content && onPlayAudio && (
            <button
              type="button"
              onClick={() => onPlayAudio(message.id, message.content)}
              className={`h-6 px-2.5 rounded-full text-[11px] font-sans font-medium flex items-center gap-1.5 transition-all duration-200 select-none active:scale-95 ${
                isPlayingAudio
                  ? 'bg-white text-black font-semibold'
                  : isLoadingAudio
                  ? 'bg-white/10 text-neutral-300 border border-white/20 animate-pulse'
                  : 'bg-white/[0.03] hover:bg-white/[0.08] text-neutral-400 hover:text-white border border-white/[0.08] hover:border-white/20'
              }`}
              title={isPlayingAudio ? 'Stop voice playback' : 'Listen to message'}
            >
              {isLoadingAudio ? (
                <>
                  <div className="w-2.5 h-2.5 border-[1.5px] border-neutral-400 border-t-white rounded-full animate-spin" />
                  <span className="text-[10.5px]">Buffering...</span>
                </>
              ) : isPlayingAudio ? (
                <>
                  <div className="flex items-center gap-0.5 h-2.5">
                    <span className="w-0.5 h-2 bg-black rounded-full animate-bounce" style={{ animationDuration: '0.6s' }} />
                    <span className="w-0.5 h-3 bg-black rounded-full animate-bounce" style={{ animationDuration: '0.4s', animationDelay: '0.15s' }} />
                    <span className="w-0.5 h-1.5 bg-black rounded-full animate-bounce" style={{ animationDuration: '0.7s', animationDelay: '0.3s' }} />
                  </div>
                  <span className="font-semibold text-black">Stop</span>
                </>
              ) : (
                <>
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-75">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                  </svg>
                  <span>Listen</span>
                </>
              )}
            </button>
          )}
        </div>

      </div>
    </div>
  );
};

/* -------------------------------------------------------------
   Interactive Action Card (Claude Clarification & Capability Router)
-------------------------------------------------------------- */
function InteractiveActionCard({ 
  cardData, 
  onCardAction 
}: { 
  cardData: ActionCardData; 
  onCardAction?: (option: ActionCardOption) => void;
}) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const getModuleTitle = (mod?: string) => {
    if (mod === 'image_studio') return 'Ubair Image Studio';
    if (mod === 'assessment_arena') return 'Ubair Arena';
    if (mod === 'forge_studio') return 'Ubair Forge Sandbox';
    return 'Dedicated Workspace';
  };

  const handleSelect = (opt: ActionCardOption) => {
    setSelectedId(opt.id);
    if (onCardAction) {
      onCardAction(opt);
    }
  };

  const resolvedOptions: ActionCardOption[] = (cardData.options && cardData.options.length > 0)
    ? cardData.options
    : cardData.type === 'module_redirect'
    ? [
        {
          id: 'redirect_yes',
          label: `Yes, Open in ${getModuleTitle(cardData.target_module)}`,
          action: 'redirect',
          target_module: cardData.target_module
        },
        {
          id: 'redirect_no',
          label: 'No, Continue in Quick Chat',
          action: 'reply',
          payload: 'No, let us continue here.'
        }
      ]
    : [];

  return (
    <div className="mt-3 p-4 rounded-2xl bg-[#0e1117] border border-cyan-500/20 shadow-xl max-w-full animate-in fade-in slide-in-from-bottom-2 duration-200">
      
      {/* Card Header & Icon */}
      <div className="flex items-center gap-2.5 mb-2.5">
        <span className="w-2 h-2 rounded-full bg-cyan-400 animate-ping" />
        <span className="text-[11px] font-mono font-bold uppercase tracking-wider text-cyan-400">
          {cardData.title || (cardData.type === 'module_redirect' ? 'Capability Routing' : 'Clarification Required')}
        </span>
      </div>

      {/* Card Description */}
      {(cardData.clarification_prompt || cardData.message) && (
        <p className="text-[13.5px] text-neutral-200 font-sans leading-relaxed mb-3">
          {cardData.clarification_prompt || cardData.message}
        </p>
      )}

      {/* Interactive Options Grid */}
      {resolvedOptions.length > 0 && (
        <div className="flex flex-col sm:flex-row flex-wrap gap-2 pt-1">
          {resolvedOptions.map((opt) => {
            const isChosen = selectedId === opt.id;
            const isRedirect = opt.action === 'redirect' || opt.id === 'redirect_yes';

            return (
              <button
                key={opt.id}
                type="button"
                onClick={() => handleSelect(opt)}
                className={`px-3.5 py-2 rounded-xl text-[12.5px] font-medium transition-all duration-150 flex items-center justify-between sm:justify-start gap-2 text-left border active:scale-95 ${
                  isChosen
                    ? 'bg-cyan-500 text-black border-cyan-400 font-semibold shadow-md'
                    : isRedirect
                    ? 'bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-200 border-cyan-500/30'
                    : 'bg-white/[0.04] hover:bg-white/[0.08] text-neutral-200 border-white/10 hover:border-white/20'
                }`}
              >
                <span>{opt.label}</span>
                <span className="text-[10px] opacity-60 font-mono">↵</span>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* -------------------------------------------------------------
   Code Block with Syntax Highlighting & Copy
-------------------------------------------------------------- */
function CodeBlockHighlight({ language, code }: { language: string; code: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(code);
      } else {
        const textArea = document.createElement('textarea');
        textArea.value = code;
        document.body.appendChild(textArea);
        textArea.select();
        document.execCommand('copy');
        document.body.removeChild(textArea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy code:', err);
    }
  };

  return (
    <div className="relative rounded-2xl overflow-hidden my-5 border border-white/10 bg-[#0d1117] max-w-full shadow-2xl">
      <div className="bg-white/[0.03] text-[11px] text-neutral-400 px-4 py-2.5 border-b border-white/[0.08] flex items-center justify-between font-mono">
        <span className="text-neutral-400 font-medium tracking-wider uppercase text-[10.5px]">
          {language || 'code'}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className="text-[10.5px] text-neutral-400 hover:text-white bg-white/[0.04] hover:bg-white/[0.08] border border-white/10 px-2.5 py-1 rounded-lg transition-all active:scale-95 flex items-center gap-1.5 font-sans"
          title="Copy code"
        >
          {copied ? (
            <span className="text-emerald-400 font-medium">✓ Copied</span>
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
      <div className="text-[12.5px] sm:text-[13.5px] font-mono leading-relaxed overflow-x-auto">
        <SyntaxHighlighter
          style={vscDarkPlus}
          language={language || 'text'}
          PreTag="div"
          customStyle={{
            margin: 0,
            padding: '1rem 1.25rem',
            background: 'transparent',
            fontSize: 'inherit',
            lineHeight: 'inherit',
          }}
          codeTagProps={{
            style: { fontFamily: 'inherit' }
          }}
        >
          {code}
        </SyntaxHighlighter>
      </div>
    </div>
  );
}

export default MessageBubble;