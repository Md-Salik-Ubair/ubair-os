'use client';

import React, { useState, useEffect } from 'react';
import { createWorkspace, saveMessageToWorkspace } from '../../lib/db';
import { Message } from '../../types/chat';

interface WorkspaceSlidebarProps {
  isOpen: boolean;
  suggestedTitle: string;
  suggestedCategory?: 'code' | 'research' | 'creative' | 'general';
  currentMessages: Message[];
  userEmail?: string;
  userRole?: 'free' | 'pro' | 'admin';
  onWorkspaceCreated: (workspaceId: string) => void;
  onDismiss: () => void;
}

export const WorkspaceSlidebar: React.FC<WorkspaceSlidebarProps> = ({
  isOpen,
  suggestedTitle,
  suggestedCategory = 'general',
  currentMessages,
  userEmail = '',
  userRole = 'free',
  onWorkspaceCreated,
  onDismiss,
}) => {
  const [title, setTitle] = useState(suggestedTitle);
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const isAdmin = userRole === 'admin';

  // Sync title dynamically whenever AI detects a new topic
  useEffect(() => {
    setTitle(suggestedTitle);
  }, [suggestedTitle]);

  // Global Keyboard Listener (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        onDismiss();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onDismiss]);

  if (!isOpen) return null;

  const handleConfirm = async () => {
    const finalTitle = title.trim() || suggestedTitle || 'Untitled Project';

    try {
      setIsCreating(true);
      setErrorMsg(null);

      const newWsId = `ws_${Date.now()}`;

      // 1. Dual-Sync: Persist to Cloud Backend & Supabase
      if (userEmail) {
        try {
          await fetch(`${API_BASE}/api/workspaces/create`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              user_email: userEmail,
              user_id: userEmail,
              name: finalTitle,
              workspace_id: newWsId,
            }),
          });
        } catch (cloudErr) {
          console.warn('Cloud sync standby, proceeding to local vault:', cloudErr);
        }
      }

      // 2. Persist to Local IndexedDB Vault via db.ts
      try {
        const newWs = await createWorkspace(finalTitle);
        const resolvedId = newWs?.id || newWsId;
        
        // 3. Migrate active chat context with strict type alignment
        if (currentMessages.length > 0) {
          for (const msg of currentMessages) {
            const numericTimestamp = typeof msg.timestamp === 'number'
              ? msg.timestamp
              : (Date.parse(String(msg.timestamp)) || Date.now());

            await saveMessageToWorkspace(resolvedId, {
              id: msg.id,
              role: (msg.role === 'assistant' ? 'assistant' : 'user') as 'user' | 'assistant',
              content: msg.content,
              timestamp: numericTimestamp,
            });
          }
        }

        onWorkspaceCreated(resolvedId);
      } catch (localErr: any) {
        if (localErr?.message === 'FREE_TIER_LIMIT_REACHED' && !isAdmin) {
          setErrorMsg('Free tier workspace limit reached. Upgrade to Pro for 25 persistent workspaces.');
          return;
        }
        // If local IndexedDB fails but cloud succeeded, still allow navigation
        onWorkspaceCreated(newWsId);
      }
    } catch (err: any) {
      console.error('Workspace scaffolding error:', err);
      setErrorMsg('Failed to scaffold workspace. Please retry.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      {/* Backdrop for click-outside dismissal */}
      <div 
        className="fixed inset-0 z-40 bg-black/60 backdrop-blur-xs animate-in fade-in duration-200"
        onClick={onDismiss}
      />

      {/* Slidebar Panel */}
      <aside className="fixed inset-y-0 right-0 z-50 w-full max-w-[380px] sm:max-w-md bg-[#0c0d10] border-l border-white/[0.1] p-6 flex flex-col justify-between shadow-2xl animate-in slide-in-from-right duration-300 font-sans select-none">
        
        {/* Top Header */}
        <div className="space-y-6">
          <div className="flex items-center justify-between border-b border-white/[0.08] pb-4">
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse" />
              <span className="text-xs font-mono tracking-widest text-neutral-400 uppercase">
                Neural Workspace Scaffolder
              </span>
            </div>
            <button
              type="button"
              onClick={onDismiss}
              className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
              title="Close panel (Esc)"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </button>
          </div>

          {/* Suggestion Text */}
          <div className="space-y-2">
            <h3 className="text-base sm:text-lg font-semibold tracking-tight text-white">
              Dedicated Workflow Detected
            </h3>
            <p className="text-xs text-neutral-400 leading-relaxed">
              Ubair OS identified a specialized context in your current conversation. Scaffolding a workspace will preserve these messages and enable isolated RAG document memory.
            </p>
          </div>

          {/* Editable Title Input */}
          <div className="space-y-2">
            <label className="text-[10px] font-mono tracking-wider text-neutral-500 uppercase block">
              Workspace Identifier
            </label>
            <input
              type="text"
              value={title}
              maxLength={40}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={suggestedTitle || 'Project Title...'}
              className="w-full bg-white/[0.03] border border-white/10 focus:border-white/30 rounded-xl px-3.5 py-2.5 text-xs sm:text-sm text-white outline-none transition-all"
            />
          </div>

          {/* Error Notification */}
          {errorMsg && (
            <div className="p-3 rounded-xl border border-rose-500/30 bg-rose-500/10 text-rose-300 text-xs font-mono leading-relaxed">
              {errorMsg}
            </div>
          )}

          {/* Storage Details Card */}
          <div className="p-3.5 rounded-2xl border border-white/[0.06] bg-white/[0.02] space-y-2 text-[11px] font-mono text-neutral-400">
            <div className="flex justify-between items-center">
              <span>Sync Architecture:</span>
              <span className="text-white font-medium">Dual Cloud & Local Vault</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Vector Ingestion:</span>
              <span className="text-cyan-400 font-medium">Auto-Enabled</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Context Preserved:</span>
              <span className="text-neutral-300">{currentMessages.length} message(s)</span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3 pt-6 border-t border-white/[0.08]">
          <button
            type="button"
            onClick={onDismiss}
            disabled={isCreating}
            className="flex-1 py-2.5 border border-white/10 text-neutral-300 hover:text-white hover:bg-white/[0.04] rounded-xl text-xs font-semibold tracking-wide transition-all"
          >
            Keep Quick Chat
          </button>

          <button
            type="button"
            onClick={handleConfirm}
            disabled={isCreating || !title.trim()}
            className="flex-1 py-2.5 bg-white text-black hover:bg-neutral-200 disabled:opacity-40 rounded-xl text-xs font-semibold tracking-wide transition-all shadow-md active:scale-95 flex items-center justify-center gap-1.5"
          >
            {isCreating && <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
            <span>{isCreating ? 'Scaffolding...' : 'Create Workspace'}</span>
          </button>
        </div>
      </aside>
    </>
  );
};

export default WorkspaceSlidebar;