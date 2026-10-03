import React from 'react';
import Image from 'next/image';

interface BrandLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showWordmark?: boolean;
  priority?: boolean;
  className?: string;
}

const SIZE_MAP = {
  sm: {
    logo: 24,
    wordmarkWidth: 72,
    wordmarkHeight: 15,
    gap: 'gap-2',
    scale: 'scale-[1.6]',
  },
  md: {
    logo: 32,
    wordmarkWidth: 88,
    wordmarkHeight: 18,
    gap: 'gap-2.5',
    scale: 'scale-[1.85]',
  },
  lg: {
    logo: 40,
    wordmarkWidth: 116,
    wordmarkHeight: 24,
    gap: 'gap-3',
    scale: 'scale-[2.1]',
  },
};

export function BrandLogo({
  size = 'md',
  showWordmark = true,
  priority = true,
  className = '',
}: BrandLogoProps) {
  const current = SIZE_MAP[size] || SIZE_MAP.md;

  return (
    <div className={`inline-flex items-center select-none ${current.gap} ${className}`}>
      {/* Neural Emblem (Optically Balanced against Wordmark) */}
      <div 
        className="relative flex items-center justify-center shrink-0"
        style={{ width: current.logo, height: current.logo }}
      >
        <Image 
          src="/assets/ubair-logo.png" 
          alt="Ubair OS Emblem" 
          width={current.logo} 
          height={current.logo} 
          priority={priority}
          className={`object-contain ${current.scale} drop-shadow-[0_0_12px_rgba(6,182,212,0.45)] brightness-110`} 
        />
      </div>

      {/* Official Typography Wordmark */}
      {showWordmark && (
        <Image 
          src="/assets/ubair-wordmark.png" 
          alt="Ubair OS" 
          width={current.wordmarkWidth} 
          height={current.wordmarkHeight} 
          priority={priority}
          className="object-contain opacity-95" 
        />
      )}
    </div>
  );
}

export default BrandLogo;