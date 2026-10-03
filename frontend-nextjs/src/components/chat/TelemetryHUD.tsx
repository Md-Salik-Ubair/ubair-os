'use client';

import React from 'react';
import { TelemetryData } from '../../types/chat';

interface TelemetryHUDProps {
  telemetry: TelemetryData | null;
  isLoading: boolean;
}

export const TelemetryHUD: React.FC<TelemetryHUDProps> = ({ telemetry, isLoading }) => {
  const getProviderBadgeStyle = (provider?: string) => {
    const key = provider?.toUpperCase();
    switch (key) {
      case 'GROQ':
        return 'border-orange-500/40 bg-orange-500/10 text-orange-400';
      case 'MISTRAL':
        return 'border-amber-500/40 bg-amber-500/10 text-amber-300';
      case 'GEMINI':
        return 'border-cyan-500/40 bg-cyan-500/10 text-cyan-300';
      case 'COHERE':
        return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-400';
      case 'CEREBRAS':
        return 'border-purple-500/40 bg-purple-500/10 text-purple-300';
      default:
        return 'border-white/10 bg-white/[0.04] text-neutral-400';
    }
  };

  return (
    <div className="inline-flex items-center gap-2 sm:gap-2.5 px-3 py-1.5 rounded-xl border border-white/[0.08] bg-[#0c0d10]/90 backdrop-blur-md text-[11px] font-mono select-none shadow-sm max-w-full overflow-hidden">
      {/* Engine Status Indicator */}
      <div className="flex items-center gap-1.5 shrink-0">
        <span
          className={`h-2 w-2 rounded-full transition-all duration-200 ${
            isLoading 
              ? 'bg-cyan-400 shadow-[0_0_8px_rgba(6,182,212,0.8)] animate-pulse' 
              : 'bg-neutral-600'
          }`}
        />
        <span className="text-neutral-400 uppercase text-[10px] tracking-wider">
          {isLoading ? 'Streaming' : 'Engine Ready'}
        </span>
      </div>

      {telemetry && (
        <>
          <span className="text-white/10 shrink-0">|</span>
          
          {/* Provider Pill */}
          <span
            className={`px-2 py-0.5 rounded-lg border text-[9.5px] font-semibold tracking-wider uppercase shrink-0 ${getProviderBadgeStyle(
              telemetry.provider
            )}`}
          >
            {telemetry.provider}
          </span>

          {/* Model Identifier */}
          {telemetry.model_id && (
            <span className="text-neutral-300 truncate max-w-[110px] sm:max-w-[160px]">
              {telemetry.model_id}
            </span>
          )}

          {/* Time to First Token (TTFT) */}
          {typeof telemetry.ttft_ms === 'number' && (
            <span className="text-neutral-500 shrink-0 hidden xs:inline-block">
              TTFT: <span className="text-cyan-400 font-semibold">{telemetry.ttft_ms}ms</span>
            </span>
          )}
        </>
      )}
    </div>
  );
};

export default TelemetryHUD;