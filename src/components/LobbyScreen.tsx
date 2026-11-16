import React, { useRef, useState } from 'react';
import {
  Crosshair,
  Maximize2,
  Play,
  Settings,
  Shield,
  Sparkles,
  User,
  Users,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { OPERATORS, OUTFIT_SKINS, WEAPONS } from '../game/constants';
import { audioEngine } from '../game/audio';
import { GameMode, GameSettings } from '../types/game';
import { VorqenLogo } from './VorqenLogo';

interface LobbyScreenProps {
  selectedMode: GameMode;
  onSelectMode: (m: GameMode) => void;
  selectedOperatorId: string;
  selectedSkinId: string;
  onSelectCharacter: (opId: string, skinId: string) => void;
  onRotateCharacter: (deltaX: number) => void;
  onDeploy: () => void;
  onOpenSettings: () => void;
  settings: GameSettings;
  onToggleSound: () => void;
}

const MODES: { id: GameMode; label: string; sub: string; icon: React.ReactNode }[] = [
  { id: 'solo', label: 'SOLO', sub: '50P Royale', icon: <User className="w-3.5 h-3.5" /> },
  { id: 'duo', label: 'DUO', sub: '25 Teams', icon: <Users className="w-3.5 h-3.5" /> },
  { id: 'squad', label: 'SQUAD', sub: '4-Man Team', icon: <Shield className="w-3.5 h-3.5" /> },
  { id: 'training', label: 'TRAINING', sub: 'Range & Gear', icon: <Crosshair className="w-3.5 h-3.5" /> },
  { id: 'practice', label: 'PRACTICE', sub: '18P Skirmish', icon: <Sparkles className="w-3.5 h-3.5" /> },
];

export const LobbyScreen: React.FC<LobbyScreenProps> = ({
  selectedMode,
  onSelectMode,
  selectedOperatorId,
  selectedSkinId,
  onSelectCharacter,
  onRotateCharacter,
  onDeploy,
  onOpenSettings,
  settings,
  onToggleSound,
}) => {
  const [activeTab, setActiveTab] = useState<'none' | 'operators' | 'armory'>('none');
  const [matchmaking, setMatchmaking] = useState(false);
  const [matchTimer, setMatchTimer] = useState(3);
  const dragRef = useRef<{ active: boolean; lastX: number }>({ active: false, lastX: 0 });

  const currentOp = OPERATORS.find((o) => o.id === selectedOperatorId) || OPERATORS[0];

  const handlePointerDown = (e: React.PointerEvent) => {
    audioEngine.unlock();
    audioEngine.startLobbyMusic();
    dragRef.current = { active: true, lastX: e.clientX };
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!dragRef.current.active) return;
    const dx = e.clientX - dragRef.current.lastX;
    dragRef.current.lastX = e.clientX;
    onRotateCharacter(dx);
  };

  const handlePointerUp = () => {
    dragRef.current.active = false;
  };

  const startMatchmaking = () => {
    audioEngine.unlock();
    audioEngine.playUiClick(820);
    if (selectedMode === 'training' || selectedMode === 'practice') {
      onDeploy();
      return;
    }
    setMatchmaking(true);
    setMatchTimer(2);
    let count = 2;
    const id = window.setInterval(() => {
      count--;
      if (count <= 0) {
        clearInterval(id);
        setMatchmaking(false);
        onDeploy();
      } else {
        setMatchTimer(count);
      }
    }, 650);
  };

  const requestLandscape = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      const orient = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
      if (orient?.lock) {
        await orient.lock('landscape').catch(() => {});
      }
    } catch {
      // Ignore browser gesture restrictions
    }
  };

  return (
    <div className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between">
      {/* Center 360-degree Drag Zone */}
      <div
        className="absolute inset-0 pointer-events-auto cursor-grab active:cursor-grabbing"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between px-4 sm:px-7 pt-3 sm:pt-5 pointer-events-none">
        <div className="pointer-events-auto">
          <VorqenLogo size="md" />
        </div>

        <div className="flex items-center gap-2 pointer-events-auto">
          <div className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900/90 border border-slate-700 text-xs">
            <span className="text-slate-400 font-semibold">OPERATOR:</span>
            <span className="font-black text-amber-400">{currentOp.name}</span>
            <span className="text-slate-600">|</span>
            <span className="text-sky-400 font-bold uppercase">{settings.graphics}</span>
          </div>

          <button
            onClick={() => {
              audioEngine.playUiClick();
              onToggleSound();
            }}
            className="p-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
            aria-label="Toggle Sound"
          >
            {settings.soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4 text-slate-500" />}
          </button>

          <button
            onClick={requestLandscape}
            className="p-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-slate-200 cursor-pointer"
            title="Fullscreen Landscape"
            aria-label="Fullscreen Landscape"
          >
            <Maximize2 className="w-4 h-4 text-sky-400" />
          </button>

          <button
            onClick={() => {
              audioEngine.playUiClick();
              onOpenSettings();
            }}
            className="px-3 py-2 rounded-lg bg-slate-900/90 hover:bg-slate-800 border border-slate-700 text-xs font-bold text-slate-200 flex items-center gap-1.5 cursor-pointer"
          >
            <Settings className="w-4 h-4 text-amber-400" />
            <span className="hidden sm:inline">SETTINGS</span>
          </button>
        </div>
      </header>

      {/* Expandable Bottom Drawer for Operators or Armory (slides up above bottom dock) */}
      {activeTab !== 'none' && (
        <div className="relative z-10 mx-auto w-[94vw] max-w-4xl mb-2 pointer-events-auto bg-slate-950/92 border border-slate-700 rounded-xl p-3.5 sm:p-4 shadow-2xl">
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-black uppercase tracking-widest text-amber-400">
              {activeTab === 'operators' ? 'SELECT 3D OPERATOR & OUTFIT SKIN' : 'TACTICAL ARMORY & BALLISTICS'}
            </div>
            <button
              onClick={() => setActiveTab('none')}
              className="p-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {activeTab === 'operators' ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {OPERATORS.map((op) => {
                  const selected = op.id === selectedOperatorId;
                  return (
                    <button
                      key={op.id}
                      onClick={() => {
                        audioEngine.playUiClick(740);
                        onSelectCharacter(op.id, selectedSkinId);
                      }}
                      className={`p-2.5 rounded-lg border text-left transition cursor-pointer ${
                        selected
                          ? 'bg-amber-500/20 border-amber-400'
                          : 'bg-slate-900 border-slate-800 hover:border-slate-600'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-black text-white">{op.name}</span>
                        <span
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: op.accentHex }}
                        />
                      </div>
                      <div className="text-[10px] text-slate-400 mt-0.5">{op.role}</div>
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <span className="text-[11px] font-bold uppercase text-slate-400 mr-1">OUTFIT:</span>
                {OUTFIT_SKINS.map((sk) => (
                  <button
                    key={sk.id}
                    onClick={() => {
                      audioEngine.playUiClick(660);
                      onSelectCharacter(selectedOperatorId, sk.id);
                    }}
                    className={`px-2.5 py-1 rounded text-[11px] font-bold border flex items-center gap-1.5 cursor-pointer ${
                      sk.id === selectedSkinId
                        ? 'bg-slate-800 border-amber-400 text-white'
                        : 'bg-slate-900 border-slate-800 text-slate-400 hover:text-white'
                    }`}
                  >
                    <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: sk.swatch }} />
                    {sk.name}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-3 lg:grid-cols-5 gap-2">
              {Object.values(WEAPONS).map((w) => (
                <div key={w.id} className="bg-slate-900 border border-slate-800 rounded-lg p-2.5">
                  <div className="text-xs font-black text-white">{w.name}</div>
                  <div className="text-[10px] font-bold uppercase mb-1.5" style={{ color: w.color }}>
                    {w.category}
                  </div>
                  <div className="text-[10px] text-slate-400 space-y-0.5 tabular-nums">
                    <div>Damage: {w.damage} (x{w.headshotMult} HS)</div>
                    <div>Mag: {w.magSize} · Rate: {w.fireRate}/s</div>
                    <div>Range: {w.range}m</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Bottom Dock */}
      <footer className="relative z-10 pb-3 sm:pb-5 px-3 flex flex-col items-center gap-2 pointer-events-none">
        <div className="text-[11px] font-medium text-slate-400 tracking-wide">
          Drag center to spin 3D Operator 360° · Mobile Touch & Desktop WASD Ready
        </div>

        <div className="pointer-events-auto w-full max-w-[940px] bg-slate-950/92 border border-slate-700/90 rounded-xl p-2 sm:p-2.5 shadow-2xl flex flex-wrap items-center justify-between gap-2">
          {/* Game Modes */}
          <div className="flex items-center gap-1 overflow-x-auto">
            {MODES.map((m) => {
              const active = selectedMode === m.id;
              return (
                <button
                  key={m.id}
                  onClick={() => {
                    audioEngine.playUiClick(680);
                    onSelectMode(m.id);
                  }}
                  className={`px-2.5 py-1.5 rounded-lg border text-left transition shrink-0 cursor-pointer ${
                    active
                      ? 'bg-amber-500/20 border-amber-400 text-white'
                      : 'bg-slate-900/90 border-slate-800 text-slate-400 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-1 text-[11px] font-black tracking-wide">
                    {m.icon} {m.label}
                  </div>
                  <div className="text-[9px] text-slate-400">{m.sub}</div>
                </button>
              );
            })}
          </div>

          {/* Character / Armory + Deploy CTA */}
          <div className="flex items-center gap-2 ml-auto">
            <button
              onClick={() => {
                audioEngine.playUiClick(600);
                setActiveTab(activeTab === 'operators' ? 'none' : 'operators');
              }}
              className={`px-3 py-2 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                activeTab === 'operators'
                  ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                  : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500'
              }`}
            >
              Characters
            </button>

            <button
              onClick={() => {
                audioEngine.playUiClick(600);
                setActiveTab(activeTab === 'armory' ? 'none' : 'armory');
              }}
              className={`px-3 py-2 rounded-lg border text-xs font-bold uppercase cursor-pointer ${
                activeTab === 'armory'
                  ? 'bg-sky-500/20 border-sky-400 text-sky-300'
                  : 'bg-slate-900 border-slate-700 text-slate-200 hover:border-slate-500'
              }`}
            >
              Armory
            </button>

            <button
              onClick={startMatchmaking}
              disabled={matchmaking}
              className="px-5 sm:px-7 py-2.5 rounded-lg bg-gradient-to-r from-amber-500 to-yellow-400 hover:from-amber-400 hover:to-yellow-300 text-slate-950 font-black text-sm uppercase tracking-wider flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <Play className="w-4 h-4 fill-current" />
              {matchmaking ? `DEPLOYING ${matchTimer}s` : 'DEPLOY'}
            </button>
          </div>
        </div>
      </footer>

      {/* Matchmaking Modal Overlay */}
      {matchmaking && (
        <div className="fixed inset-0 z-30 bg-slate-950/85 flex items-center justify-center pointer-events-auto">
          <div className="bg-slate-900 border border-amber-500/50 rounded-xl px-8 py-6 text-center space-y-2 shadow-2xl">
            <div className="text-xs font-bold tracking-[0.25em] text-amber-400 uppercase">
              MATCHMAKING · {selectedMode.toUpperCase()}
            </div>
            <div className="text-2xl font-black text-white">ASSEMBLING 50 COMBATANTS</div>
            <div className="text-sm text-slate-300 tabular-nums">
              Boarding Vorqen Cargo Jet in {matchTimer}...
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
