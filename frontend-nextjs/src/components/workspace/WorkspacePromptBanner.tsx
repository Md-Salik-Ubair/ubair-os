'use client';

import React, { useState } from 'react';
import { createWorkspace, saveMessageToWorkspace } from '../../lib/db';
import { Message } from '../../types/chat';

interface WorkspacePromptBannerProps {
  isOpen: boolean;
  suggestedTitle: string;
  suggestedCategory?: 'code' | 'research' | 'creative' | 'general';
  currentMessages: Message[];
  userEmail?: string;
  userRole?: 'free' | 'pro' | 'admin';
  onWorkspaceCreated: (workspaceId: string) => void;
  onDismiss: () => void;
}

export const WorkspacePromptBanner: React.FC<WorkspacePromptBannerProps> = ({
  isOpen,
  suggestedTitle,
  suggestedCategory = 'general',
  currentMessages,
  userEmail = '',
  userRole = 'free',
  onWorkspaceCreated,
  onDismiss,
}) => {
  const [isCreating, setIsCreating] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
  const isAdmin = userRole === 'admin';

  if (!isOpen) return null;

  const handleAllocate = async () => {
    const finalTitle = suggestedTitle.trim() || 'Untitled Workspace';

    try {
      setIsCreating(true);
      setErrorMsg(null);

      const newWsId = `ws_${Date.now()}`;

      // 1. Dual-Sync: Cloud Backend & Supabase
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
          console.warn('Cloud sync standby, proceeding with local vault:', cloudErr);
        }
      }

      // 2. Persist to Local IndexedDB Vault
      try {
        const newWs = await createWorkspace(finalTitle);
        const resolvedId = newWs?.id || newWsId;

        // 3. Migrate active chat context with strict type-safety
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
          setErrorMsg('Limit reached (Max 3). Upgrade to Pro.');
          return;
        }
        // If local IndexedDB fails but cloud succeeded, proceed to workspace
        onWorkspaceCreated(newWsId);
      }
    } catch (err: any) {
      console.error('Workspace allocation failed:', err);
      setErrorMsg('Allocation failed. Please retry.');
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-40 w-[92%] max-w-xl animate-in fade-in slide-in-from-bottom-4 duration-300 font-sans select-none">
      <div className="bg-[#0c0d10]/95 border border-white/[0.12] hover:border-white/20 backdrop-blur-2xl rounded-2xl p-4 shadow-[0_10px_40px_rgba(0,0,0,0.9)] flex flex-col sm:flex-row items-center justify-between gap-4">
        
        {/* Context & Tag */}
        <div className="flex items-center gap-3 w-full sm:w-auto">
          <div className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse shrink-0" />
          <div className="space-y-0.5 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[9px] font-mono font-bold tracking-widest text-cyan-400 uppercase">
                {suggestedCategory} WORKFLOW DETECTED
              </span>
            </div>
            <p className="text-xs text-neutral-200 font-medium truncate max-w-[280px]">
              Scaffold &quot;{suggestedTitle}&quot; to isolated workspace?
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 w-full sm:w-auto justify-end shrink-0">
          {errorMsg && (
            <span className="text-[10px] font-mono text-rose-400">{errorMsg}</span>
          )}

          <button
            type="button"
            onClick={onDismiss}
            disabled={isCreating}
            className="px-3 py-1.5 rounded-xl border border-white/10 hover:border-white/20 text-neutral-400 hover:text-white text-xs font-mono transition-all"
          >
            Ignore
          </button>

          <button
            type="button"
            onClick={handleAllocate}
            disabled={isCreating}
            className="px-4 py-1.5 rounded-xl bg-white text-black hover:bg-neutral-200 disabled:opacity-30 text-xs font-mono font-bold uppercase tracking-wider transition-all shadow-md flex items-center gap-1.5"
          >
            {isCreating && <div className="w-3 h-3 border-2 border-black/30 border-t-black rounded-full animate-spin" />}
            <span>{isCreating ? 'Scaffolding...' : 'Save Workspace'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};

export default WorkspacePromptBanner;