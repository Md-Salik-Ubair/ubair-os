'use client';

import React, { useState, useRef, useEffect } from 'react';
import Image from 'next/image';
import { deleteWorkspace as deleteLocalWorkspace } from '../../lib/db';

export interface WorkspaceItem {
  id: string;
  name: string;
  createdAt: string;
}

interface WorkspaceDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  workspaces: WorkspaceItem[];
  activeWorkspaceId: string | null;
  userEmail?: string;
  onSelectWorkspace: (id: string | null) => void;
  onCreateWorkspace: (name: string) => void;
  onDeleteWorkspace: (id: string) => void;
  userRole?: 'free' | 'pro' | 'admin';
  maxWorkspaces?: number;
  maxFilesPerWorkspace?: number;
  maxFileSizeMb?: number;
  onOpenUpgradeModal?: () => void;
  onOpenWorkstation?: (target: 'studio' | 'arena' | 'codex' | 'slate' | 'forge' | 'chat') => void;
}

export default function WorkspaceDrawer({
  isOpen,
  onClose,
  workspaces,
  activeWorkspaceId,
  userEmail = '',
  onSelectWorkspace,
  onCreateWorkspace,
  onDeleteWorkspace,
  userRole = 'free',
  maxWorkspaces = 3,
  maxFilesPerWorkspace = 3,
  maxFileSizeMb = 10,
  onOpenUpgradeModal,
  onOpenWorkstation,
}: WorkspaceDrawerProps) {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWorkspaceName, setNewWorkspaceName] = useState('');
  
  // Workspace Options State
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [workspaceToDelete, setWorkspaceToDelete] = useState<WorkspaceItem | null>(null);
  const [isDeletingWs, setIsDeletingWs] = useState(false);

  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

  const isAdmin = userRole === 'admin';
  const isLimitReached = !isAdmin && workspaces.length >= maxWorkspaces;

  // Focus input when modal opens
  useEffect(() => {
    if (isCreateModalOpen) {
      setTimeout(() => inputRef.current?.focus(), 80);
    }
  }, [isCreateModalOpen]);

  // Keyboard Navigation (Escape key)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (workspaceToDelete) {
          setWorkspaceToDelete(null);
        } else if (isCreateModalOpen) {
          setIsCreateModalOpen(false);
        } else if (menuOpenId) {
          setMenuOpenId(null);
        } else if (isOpen) {
          onClose();
        }
      }
    };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
    }
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isCreateModalOpen, workspaceToDelete, menuOpenId, onClose]);

  // Close 3-dots popover on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    }
    if (menuOpenId) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [menuOpenId]);

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = newWorkspaceName.trim();
    if (!cleanName) return;

    if (isLimitReached) {
      setIsCreateModalOpen(false);
      if (onOpenUpgradeModal) onOpenUpgradeModal();
      return;
    }

    onCreateWorkspace(cleanName);
    setNewWorkspaceName('');
    setIsCreateModalOpen(false);
  };

  const confirmDeleteWorkspace = async () => {
    if (!workspaceToDelete || isDeletingWs) return;
    setIsDeletingWs(true);

    // 1. Dual-Sync: Delete on Cloud API
    try {
      await fetch(`${API_BASE}/api/workspace/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_email: userEmail || 'anonymous',
          user_id: userEmail || 'anonymous',
          workspace_id: workspaceToDelete.id
        })
      });
    } catch (err) {
      console.warn('Cloud workspace cleanup notice:', err);
    }

    // 2. Clean Local IndexedDB Vault (prevent storage leaks)
    try {
      await deleteLocalWorkspace(workspaceToDelete.id);
    } catch (dbErr) {
      console.warn('Local indexedDB delete bypass:', dbErr);
    }

    // 3. Update React State & Modals
    onDeleteWorkspace(workspaceToDelete.id);
    setWorkspaceToDelete(null);
    setIsDeletingWs(false);
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200"
        onClick={onClose}
      />

      {/* Drawer Container */}
      <aside className="fixed top-0 left-0 h-full w-[280px] bg-[#090a0c] border-r border-white/[0.08] z-50 shadow-2xl animate-in slide-in-from-left duration-200 flex flex-col font-sans select-none">
        
        {/* Top Header */}
        <div className="h-16 flex items-center justify-between px-5 border-b border-white/[0.06] shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="relative w-8 h-8 flex items-center justify-center shrink-0">
              <Image 
                src="/assets/ubair-logo.png" 
                alt="Ubair Logo" 
                width={32} 
                height={32} 
                priority
                className="object-contain scale-[1.75] drop-shadow-[0_0_12px_rgba(56,189,248,0.4)] brightness-110" 
              />
            </div>
            <Image 
              src="/assets/ubair-wordmark.png" 
              alt="Ubair OS" 
              width={85} 
              height={18} 
              priority
              className="hidden sm:block object-contain opacity-95" 
            />
          </div>

          <button 
            type="button"
            onClick={onClose}
            className="w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white rounded-lg hover:bg-white/[0.06] transition-colors"
            title="Collapse sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
              <rect width="18" height="18" x="3" y="3" rx="2" />
              <path d="M9 3v18" />
              <path d="m16 15-3-3 3-3" />
            </svg>
          </button>
        </div>

        {/* Navigation Sections */}
        <div className="p-3 space-y-4 flex-1 overflow-y-auto [&::-webkit-scrollbar]:w-1 [&::-webkit-scrollbar-thumb]:bg-white/10 [&::-webkit-scrollbar-track]:bg-transparent [scrollbar-width:thin]">
          
          {/* Quick Chat Switcher */}
          <div>
            <button 
              type="button"
              onClick={() => {
                if (onOpenWorkstation) onOpenWorkstation('chat');
                onSelectWorkspace(null);
                onClose();
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                activeWorkspaceId === null 
                  ? 'bg-white text-black font-semibold shadow-md' 
                  : 'bg-white/[0.03] hover:bg-white/[0.08] text-neutral-300 hover:text-white'
              }`}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
              </svg>
              <span>Quick Chat</span>
            </button>
          </div>

          {/* Flagship Workstations Section (Mobile & Zoom Unified Access) */}
          <div className="space-y-1 pt-1 border-t border-white/[0.05]">
            <div className="px-3 pt-2 pb-1">
              <span className="text-[10.5px] font-mono text-neutral-500 uppercase tracking-wider">Workstations</span>
            </div>

            {/* Ubair Studio Trigger */}
            <button
              type="button"
              onClick={() => {
                if (onOpenWorkstation) onOpenWorkstation('studio');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer group"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover:text-amber-300 transition-colors shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <span>Ubair Studio</span>
            </button>

            {/* Ubair Arena Trigger */}
            <button
              type="button"
              onClick={() => {
                if (onOpenWorkstation) onOpenWorkstation('arena');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer group"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover:text-amber-300 transition-colors shrink-0">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
              <span>Ubair Arena</span>
            </button>

            {/* Ubair Slate Trigger */}
            <button
              type="button"
              onClick={() => {
                if (onOpenWorkstation) onOpenWorkstation('slate');
                onClose();
              }}
              className="w-full flex items-center gap-3 px-3 py-2 rounded-xl text-[13px] font-medium text-neutral-300 hover:text-white hover:bg-white/[0.05] transition-all cursor-pointer group"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" className="text-neutral-400 group-hover:text-amber-300 transition-colors shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <line x1="8" y1="9" x2="16" y2="9" />
                <line x1="8" y1="13" x2="14" y2="13" />
                <line x1="8" y1="17" x2="11" y2="17" />
              </svg>
              <span>Ubair Slate</span>
            </button>
          </div>

          {/* Workspaces Section */}
          <div className="space-y-2">
            <div className="flex items-center justify-between px-3">
              <span className="text-[11px] font-mono text-neutral-500 uppercase tracking-wider">Workspaces</span>
              <span className="text-[11px] font-mono text-neutral-400">
                {isAdmin ? `${workspaces.length} / ∞` : `${workspaces.length} / ${maxWorkspaces}`}
              </span>
            </div>

            {/* Workspaces List */}
            <div className="space-y-1">
              {workspaces.map((ws) => (
                <div
                  key={ws.id}
                  className={`relative group flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-all ${
                    activeWorkspaceId === ws.id
                      ? 'bg-white/[0.08] text-white border border-white/10 shadow-sm'
                      : 'hover:bg-white/[0.04] text-neutral-400 hover:text-white border border-transparent'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => {
                      onSelectWorkspace(ws.id);
                      onClose();
                    }}
                    className="flex items-center gap-2.5 flex-1 text-left truncate py-0.5"
                  >
                    <span className={`w-1.5 h-1.5 rounded-full shrink-0 transition-all ${
                      activeWorkspaceId === ws.id 
                        ? 'bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]' 
                        : 'bg-neutral-600'
                    }`} />
                    <span className="truncate text-[13px] font-medium">{ws.name}</span>
                  </button>

                  {/* Options Trigger */}
                  <div className="relative shrink-0">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === ws.id ? null : ws.id);
                      }}
                      className={`w-7 h-7 flex items-center justify-center text-neutral-400 hover:text-white transition-all rounded-lg hover:bg-white/[0.08] ${
                        menuOpenId === ws.id ? 'opacity-100 text-white bg-white/[0.08]' : 'opacity-0 group-hover:opacity-100'
                      }`}
                      title="Workspace options"
                    >
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                        <circle cx="5" cy="12" r="1.75" />
                        <circle cx="12" cy="12" r="1.75" />
                        <circle cx="19" cy="12" r="1.75" />
                      </svg>
                    </button>

                    {/* Dropdown Menu */}
                    {menuOpenId === ws.id && (
                      <div 
                        ref={menuRef}
                        onClick={(e) => e.stopPropagation()}
                        className="absolute right-0 top-full mt-1 w-44 bg-[#131418] border border-white/[0.12] rounded-xl shadow-2xl overflow-hidden py-1.5 z-50 animate-in fade-in zoom-in-95 duration-100"
                      >
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setMenuOpenId(null);
                            setWorkspaceToDelete(ws);
                          }}
                          className="w-full flex items-center gap-2.5 px-3 py-2 text-xs text-rose-400 hover:text-rose-300 hover:bg-rose-500/10 transition-colors"
                        >
                          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                          </svg>
                          <span>Delete Workspace</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Create Workspace Button */}
            <button 
              type="button"
              onClick={() => {
                if (isLimitReached) {
                  if (onOpenUpgradeModal) onOpenUpgradeModal();
                } else {
                  setIsCreateModalOpen(true);
                }
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl border border-dashed text-sm transition-all ${
                isLimitReached 
                  ? 'border-cyan-500/20 bg-cyan-500/[0.03] text-neutral-400 hover:text-white hover:border-cyan-500/40' 
                  : 'border-white/[0.12] hover:border-white/30 text-neutral-400 hover:text-white group'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={!isLimitReached ? "group-hover:rotate-90 transition-transform" : ""}>
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>{isLimitReached ? `Upgrade for More (${workspaces.length}/${maxWorkspaces})` : 'Create Workspace'}</span>
            </button>
          </div>
        </div>

        
      </aside>

      {/* 1. Create Workspace Modal */}
      {isCreateModalOpen && (
        <div 
          className="fixed inset-0 z-[60] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-150 font-sans"
          onClick={() => setIsCreateModalOpen(false)}
        >
          <div 
            className="w-full max-w-[360px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.12] rounded-3xl p-5 sm:p-6 shadow-2xl space-y-4 [scrollbar-width:none]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-white/[0.06]">
              <span className="text-sm font-semibold text-white">New Workspace</span>
              <span className="text-[10px] font-mono text-neutral-400 uppercase tracking-wide">
                {isAdmin ? `${workspaces.length} / ∞` : `${workspaces.length}/${maxWorkspaces} Active`}
              </span>
            </div>

            <form onSubmit={handleCreateSubmit} className="space-y-4">
              <div>
                <label className="text-[10px] font-mono text-neutral-400 block mb-1.5 uppercase tracking-wider">Workspace Name</label>
                <input
                  ref={inputRef}
                  type="text"
                  required
                  maxLength={40}
                  value={newWorkspaceName}
                  onChange={(e) => setNewWorkspaceName(e.target.value)}
                  placeholder="e.g. System Core, Vision Research..."
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2.5 text-xs text-white placeholder-neutral-600 outline-none focus:border-white/30 transition-all"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-white/[0.04]">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-neutral-400 hover:text-white rounded-lg transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={!newWorkspaceName.trim()}
                  className="px-5 py-1.5 text-xs font-medium bg-white text-black rounded-xl hover:bg-neutral-200 transition-all active:scale-95 disabled:opacity-40"
                >
                  Create
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 2. Permanent Delete Confirmation Modal */}
      {workspaceToDelete && (
        <div 
          className="fixed inset-0 z-[70] flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-xl animate-in fade-in duration-150 font-sans"
          onClick={() => setWorkspaceToDelete(null)}
        >
          <div 
            className="w-full max-w-[400px] max-h-[90dvh] overflow-y-auto bg-[#0c0d10] border border-white/[0.12] rounded-3xl p-5 sm:p-7 shadow-2xl [scrollbar-width:none]"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start gap-3.5">
              <div className="text-rose-400 shrink-0 mt-0.5">
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" />
                  <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                  <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  <line x1="10" y1="11" x2="10" y2="17" />
                  <line x1="14" y1="11" x2="14" y2="17" />
                </svg>
              </div>
              <div>
                <h3 className="text-[15px] font-semibold text-white tracking-tight">Delete Workspace?</h3>
                <p className="text-[12px] text-neutral-400 mt-1.5 leading-relaxed">
                  This action cannot be undone. <span className="text-white font-medium">&quot;{workspaceToDelete.name}&quot;</span> and its local indexed records will be permanently erased.
                </p>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-6 mt-2 border-t border-white/[0.06]">
              <button
                type="button"
                disabled={isDeletingWs}
                onClick={() => setWorkspaceToDelete(null)}
                className="px-4 py-2 text-[12px] font-medium text-neutral-400 hover:text-white transition-colors disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isDeletingWs}
                onClick={confirmDeleteWorkspace}
                className="px-5 py-2 text-[12px] font-semibold bg-rose-500 hover:bg-rose-600 text-white rounded-xl transition-all shadow-md active:scale-95 disabled:opacity-50 flex items-center gap-1.5"
              >
                {isDeletingWs && <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                <span>{isDeletingWs ? 'Deleting...' : 'Delete Permanently'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}