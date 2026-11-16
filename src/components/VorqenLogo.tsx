import React from 'react';

interface VorqenLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showSubtitle?: boolean;
}

export const VorqenLogo: React.FC<VorqenLogoProps> = ({ size = 'md', showSubtitle = true }) => {
  const scaleClass =
    size === 'sm' ? 'h-8' : size === 'lg' ? 'h-16 sm:h-20' : 'h-11 sm:h-12';

  return (
    <div className="inline-flex items-center gap-2.5 select-none">
      {/* Hybrid GTA-V Bevel Shield + Battle Royale Crosshair Crest */}
      <svg
        viewBox="0 0 64 64"
        className={`${scaleClass} w-auto shrink-0 drop-shadow-[0_2px_10px_rgba(245,158,11,0.45)]`}
        aria-label="VORQEN Emblem"
      >
        <defs>
          <linearGradient id="vqGold" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#fde047" />
            <stop offset="50%" stopColor="#f59e0b" />
            <stop offset="100%" stopColor="#b45309" />
          </linearGradient>
          <linearGradient id="vqSteel" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="100%" stopColor="#090d16" />
          </linearGradient>
        </defs>
        {/* Outer octagonal shield */}
        <polygon
          points="32,3 57,13 60,42 32,61 4,42 7,13"
          fill="url(#vqSteel)"
          stroke="url(#vqGold)"
          strokeWidth="3.2"
        />
        {/* Inner tactical emerald/crimson accent stripe */}
        <polygon
          points="32,9 51,17 53,39 32,54 11,39 13,17"
          fill="none"
          stroke="#22c55e"
          strokeWidth="1.2"
          strokeOpacity="0.65"
        />
        {/* V Wing Crest */}
        <polygon
          points="15,19 24,19 32,41 40,19 49,19 35,49 29,49"
          fill="url(#vqGold)"
        />
        {/* Crosshair ring */}
        <circle cx="32" cy="27" r="7" fill="none" stroke="#f8fafc" strokeWidth="1.8" strokeOpacity="0.9" />
        <line x1="32" y1="16" x2="32" y2="22" stroke="#ef4444" strokeWidth="2.2" />
        <line x1="32" y1="32" x2="32" y2="38" stroke="#ef4444" strokeWidth="2.2" />
        {/* 5-star GTA-inspired rank pips */}
        <g fill="#fde047">
          <circle cx="20" cy="51" r="1.6" />
          <circle cx="26" cy="53" r="1.6" />
          <circle cx="32" cy="54.5" r="2" />
          <circle cx="38" cy="53" r="1.6" />
          <circle cx="44" cy="51" r="1.6" />
        </g>
      </svg>

      {/* Bold GTA-V / Tactical Typographic Lockup */}
      <div className="flex flex-col leading-none">
        <div className="flex items-baseline gap-1.5">
          <span
            className={`font-black italic tracking-tighter uppercase ${
              size === 'sm' ? 'text-xl' : size === 'lg' ? 'text-4xl sm:text-5xl' : 'text-2xl sm:text-3xl'
            }`}
            style={{
              backgroundImage: 'linear-gradient(180deg, #ffffff 15%, #fde047 65%, #d97706 100%)',
              WebkitBackgroundClip: 'text',
              color: 'transparent',
              textShadow: '0 2px 12px rgba(245,158,11,0.22)',
            }}
          >
            VORQEN
          </span>
          <span className="px-1.5 py-0.5 text-[9px] font-extrabold tracking-widest uppercase bg-emerald-600 text-white rounded-sm border border-emerald-400/50">
            V·BR
          </span>
        </div>
        {showSubtitle && (
          <span className="text-[10px] sm:text-[11px] font-bold tracking-[0.26em] text-slate-300 uppercase mt-0.5">
            ULTIMATE BATTLE ARENA
          </span>
        )}
      </div>
    </div>
  );
};
