import React, { useEffect, useState } from 'react';
import { ShieldAlert, Crosshair, Compass } from 'lucide-react';
import { GameMode } from '../types/game';
import { VorqenLogo } from './VorqenLogo';

interface LoadingScreenProps {
  mode: GameMode;
  onComplete: () => void;
}

const TIPS = [
  'Drop into Midnight Stronghold or Fort Vorqen for high-tier Apex Armor & Marksman rifles.',
  'Use the Alamo Basin Steel Bridge to cross the central river—watch for snipers on the pylons.',
  'Stay inside the shrinking Energy Storm ring; outer-zone damage escalates every phase.',
  'Headshots deal up to 2.25x damage. Use ADS Scope for razor-sharp long-range accuracy.',
  'On Android mobile, drag anywhere on the right half of the screen to aim and track rivals.',
];

export const LoadingScreen: React.FC<LoadingScreenProps> = ({ mode, onComplete }) => {
  const [progress, setProgress] = useState(8);
  const [tipIdx] = useState(() => Math.floor(Math.random() * TIPS.length));

  useEffect(() => {
    const start = performance.now();
    const duration = 1250;
    let raf = 0;
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      setProgress(Math.round(8 + t * 92));
      if (t < 1) {
        raf = requestAnimationFrame(step);
      } else {
        onComplete();
      }
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [onComplete]);

  return (
    <div className="fixed inset-0 z-50 bg-[#070a10] flex flex-col justify-between p-6 sm:p-10">
      {/* Subtle tactical grid background */}
      <div
        className="absolute inset-0 opacity-15 pointer-events-none"
        style={{
          backgroundImage:
            'radial-gradient(circle at 70% 35%, rgba(245,158,11,0.32), transparent 55%), linear-gradient(rgba(148,163,184,0.12) 1px, transparent 1px), linear-gradient(90deg, rgba(148,163,184,0.12) 1px, transparent 1px)',
          backgroundSize: '100% 100%, 40px 40px, 40px 40px',
        }}
      />

      <div className="relative flex items-center justify-between">
        <VorqenLogo size="md" />
        <div className="px-3 py-1.5 bg-slate-900 border border-amber-500/40 rounded text-xs font-bold tracking-widest uppercase text-amber-400">
          MODE: {mode.toUpperCase()} · VORQEN ISLAND
        </div>
      </div>

      {/* Center Tactical Drop Card */}
      <div className="relative max-w-2xl mx-auto w-full bg-slate-900/95 border border-slate-700/80 rounded-lg p-5 sm:p-7 shadow-2xl">
        <div className="text-xs font-bold tracking-[0.22em] text-amber-400 uppercase mb-2">
          MISSION BRIEFING — 50-COMBATANT DROP
        </div>
        <h2 className="text-2xl sm:text-3xl font-black tracking-tight uppercase text-white mb-4">
          INSERTION: VORQEN ARCHIPELAGO
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
          <div className="bg-slate-950/90 border border-slate-800 rounded p-3 flex items-start gap-2.5">
            <Compass className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white uppercase">7 Biomes & POIs</div>
              <div className="text-slate-400 mt-0.5">Metropolis, Fort Vorqen, Stronghold & Airfield</div>
            </div>
          </div>
          <div className="bg-slate-950/90 border border-slate-800 rounded p-3 flex items-start gap-2.5">
            <Crosshair className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white uppercase">Ballistic Loadouts</div>
              <div className="text-slate-400 mt-0.5">Loot ARs, SMGs, Marksman Rifles & Supply Crates</div>
            </div>
          </div>
          <div className="bg-slate-950/90 border border-slate-800 rounded p-3 flex items-start gap-2.5">
            <ShieldAlert className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <div>
              <div className="font-bold text-white uppercase">Shrinking Storm</div>
              <div className="text-slate-400 mt-0.5">Outlast all rivals to claim #1 Apex Champion</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom Progress Bar */}
      <div className="relative max-w-3xl mx-auto w-full space-y-2.5">
        <div className="flex items-center justify-between text-xs font-semibold text-slate-300">
          <span className="truncate pr-4 text-amber-300/90">TIP: {TIPS[tipIdx]}</span>
          <span className="tabular-nums font-mono text-white shrink-0">{progress}%</span>
        </div>
        <div className="h-2 w-full bg-slate-800 rounded-full overflow-hidden border border-slate-700">
          <div
            className="h-full bg-gradient-to-r from-amber-500 via-yellow-400 to-emerald-400 transition-all duration-75"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
};
