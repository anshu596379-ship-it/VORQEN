import React, { useEffect, useRef } from 'react';
import {
  Award,
  Crosshair,
  HeartPulse,
  MapPin,
  Maximize2,
  RotateCcw,
  Settings,
  Shield,
  Sliders,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ISLAND_POIS, WEAPONS, WORLD_RADIUS } from '../game/constants';
import {
  GameSettings,
  GraphicsQuality,
  HudSnapshot,
  MatchResult,
  TimeOfDay,
} from '../types/game';

interface TacticalMapModalProps {
  hud: HudSnapshot;
  satelliteCanvas: HTMLCanvasElement | null;
  onClose: () => void;
}

export const TacticalMapModal: React.FC<TacticalMapModalProps> = ({
  hud,
  satelliteCanvas,
  onClose,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !satelliteCanvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 512;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(satelliteCanvas, 0, 0, size, size);

    const span = WORLD_RADIUS * 2.15;
    const toMap = (wx: number, wz: number): [number, number] => [
      ((wx / span) + 0.5) * size,
      ((wz / span) + 0.5) * size,
    ];
    const scaleR = size / span;

    // Flight path line during plane/early phase
    const [p1x, p1y] = toMap(hud.planeStartX, hud.planeStartZ);
    const [p2x, p2y] = toMap(hud.planeEndX, hud.planeEndZ);
    ctx.save();
    ctx.setLineDash([7, 5]);
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p1x, p1y);
    ctx.lineTo(p2x, p2y);
    ctx.stroke();
    ctx.restore();

    // Current Safe Zone Ring (White)
    const [zx, zy] = toMap(hud.zoneCenterX, hud.zoneCenterZ);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(zx, zy, hud.zoneRadius * scaleR, 0, Math.PI * 2);
    ctx.stroke();

    // Next Safe Zone Ring (Cyan/Blue)
    const [nx, ny] = toMap(hud.nextZoneCenterX, hud.nextZoneCenterZ);
    ctx.strokeStyle = '#38bdf8';
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    ctx.arc(nx, ny, hud.nextZoneRadius * scaleR, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // POI Labels (GTA V / BGMI style)
    ctx.font = 'bold 11px Inter, sans-serif';
    ctx.textAlign = 'center';
    ISLAND_POIS.forEach((poi) => {
      const [px, py] = toMap(poi.x, poi.z);
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillText(poi.name, px + 1, py + 1);
      ctx.fillStyle = '#f8fafc';
      ctx.fillText(poi.name, px, py);
    });

    // Supply Drop icons
    hud.minimapBlips.forEach((b) => {
      if (b.kind === 'supply') {
        const [bx, by] = toMap(b.x, b.z);
        ctx.fillStyle = '#ef4444';
        ctx.fillRect(bx - 5, by - 5, 10, 10);
        ctx.strokeStyle = '#fde047';
        ctx.lineWidth = 1.5;
        ctx.strokeRect(bx - 5, by - 5, 10, 10);
      }
    });

    // Player Marker + Vision Cone
    const [plx, ply] = toMap(hud.playerX, hud.playerZ);
    const rad = (hud.headingDeg * Math.PI) / 180;
    ctx.save();
    ctx.translate(plx, ply);
    ctx.rotate(rad);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 26, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    ctx.fill();
    // Arrow
    ctx.fillStyle = '#fde047';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, -9);
    ctx.lineTo(6, 7);
    ctx.lineTo(0, 3);
    ctx.lineTo(-6, 7);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }, [hud, satelliteCanvas]);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/92 flex items-center justify-center p-3 sm:p-6">
      <div className="relative bg-slate-900 border border-slate-700 rounded-xl p-4 sm:p-5 max-w-2xl w-full flex flex-col gap-3 shadow-2xl max-h-[94vh]">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-amber-400" />
            <div>
              <h3 className="text-sm sm:text-base font-black uppercase tracking-wider text-white">
                VORQEN ISLAND — TACTICAL SATELLITE MAP
              </h3>
              <p className="text-[11px] text-slate-400">
                Zone Phase {hud.zonePhase} · {hud.zoneShrinking ? 'Storm Closing' : `Next Shrink: ${hud.zoneTimer}s`}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 cursor-pointer"
            aria-label="Close Map"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="relative mx-auto w-full max-w-[440px] aspect-square rounded-lg overflow-hidden border-2 border-slate-700 bg-slate-950">
          <canvas ref={canvasRef} width={512} height={512} className="w-full h-full object-contain" />
        </div>

        <div className="flex flex-wrap items-center justify-center gap-4 text-[11px] text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-white inline-block" /> Safe Zone
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-full border-2 border-sky-400 border-dashed inline-block" /> Next Zone
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-yellow-400 inline-block rotate-45" /> Your Position
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 bg-red-500 border border-yellow-300 inline-block" /> Supply Crate
          </span>
        </div>
      </div>
    </div>
  );
};

interface BackpackModalProps {
  hud: HudSnapshot;
  onUseMedkit: () => void;
  onUseShield: () => void;
  onSwitchSlot: (slot: 0 | 1 | 2) => void;
  onClose: () => void;
}

export const BackpackModal: React.FC<BackpackModalProps> = ({
  hud,
  onUseMedkit,
  onUseShield,
  onSwitchSlot,
  onClose,
}) => {
  return (
    <div className="fixed inset-0 z-50 bg-slate-950/90 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-xl p-5 shadow-2xl">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-black uppercase tracking-wider text-white">
            TACTICAL BACKPACK & LOADOUT
          </h3>
          <button onClick={onClose} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          {/* Weapons */}
          <div className="space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Equipped Weapons
            </div>
            {([0, 1, 2] as const).map((slot) => {
              const w = hud.weapons[slot];
              const spec = w ? WEAPONS[w.specId] : null;
              const active = hud.activeSlot === slot;
              return (
                <button
                  key={slot}
                  disabled={!w}
                  onClick={() => {
                    if (w) {
                      onSwitchSlot(slot);
                      onClose();
                    }
                  }}
                  className={`w-full text-left p-2.5 rounded-lg border transition cursor-pointer ${
                    active
                      ? 'bg-amber-500/15 border-amber-400'
                      : w
                      ? 'bg-slate-800/80 border-slate-700 hover:border-slate-500'
                      : 'bg-slate-950/60 border-slate-800 opacity-50 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">
                      {slot === 2 ? 'SIDEARM: ' : `SLOT ${slot + 1}: `}
                      {spec ? spec.name : 'Empty'}
                    </span>
                    {w && (
                      <span className="text-xs font-mono tabular-nums text-amber-400">
                        {w.ammoInMag}/{w.reserveAmmo}
                      </span>
                    )}
                  </div>
                  {spec && (
                    <div className="text-[10px] text-slate-400 mt-0.5">
                      {spec.category} · DMG {spec.damage} · Range {spec.range}m
                    </div>
                  )}
                </button>
              );
            })}
          </div>

          {/* Gear & Consumables */}
          <div className="space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400">
              Armor & Consumables
            </div>
            <div className="bg-slate-800/75 border border-slate-700 rounded-lg p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Shield className="w-5 h-5 text-purple-400" />
                <div>
                  <div className="text-xs font-bold text-white">
                    Apex Armor Vest Lv.{hud.armorLevel}
                  </div>
                  <div className="text-[11px] text-slate-400">
                    Shield: {Math.round(hud.shield)} / {hud.maxShield}
                  </div>
                </div>
              </div>
            </div>

            <button
              onClick={onUseMedkit}
              disabled={hud.medkits <= 0 || hud.hp >= 100}
              className="w-full bg-emerald-950/60 hover:bg-emerald-900/60 disabled:opacity-45 border border-emerald-500/40 rounded-lg p-3 flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2.5 text-left">
                <HeartPulse className="w-5 h-5 text-emerald-400" />
                <div>
                  <div className="text-xs font-bold text-white">Tactical Medkit (x{hud.medkits})</div>
                  <div className="text-[10px] text-emerald-300">Tap to restore +55 HP</div>
                </div>
              </div>
              <span className="text-xs font-bold text-emerald-400">USE</span>
            </button>

            <button
              onClick={onUseShield}
              disabled={hud.shieldCells <= 0 || hud.shield >= 100}
              className="w-full bg-sky-950/60 hover:bg-sky-900/60 disabled:opacity-45 border border-sky-500/40 rounded-lg p-3 flex items-center justify-between cursor-pointer"
            >
              <div className="flex items-center gap-2.5 text-left">
                <Shield className="w-5 h-5 text-sky-400" />
                <div>
                  <div className="text-xs font-bold text-white">Energy Shield Cell (x{hud.shieldCells})</div>
                  <div className="text-[10px] text-sky-300">Tap to recharge +45 Shield</div>
                </div>
              </div>
              <span className="text-xs font-bold text-sky-400">USE</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

interface SettingsModalProps {
  settings: GameSettings;
  onChange: (next: GameSettings) => void;
  onEnterHudEditor?: () => void;
  onClose: () => void;
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  settings,
  onChange,
  onEnterHudEditor,
  onClose,
}) => {
  const graphicsOptions: GraphicsQuality[] = ['low', 'medium', 'high', 'ultra'];
  const timeOptions: { id: TimeOfDay; label: string }[] = [
    { id: 'day', label: 'Daylight' },
    { id: 'sunset', label: 'Sunset' },
    { id: 'night', label: 'Midnight' },
    { id: 'storm', label: 'Storm' },
  ];

  const requestLandscapeFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      const orient = screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
      if (orient?.lock) {
        await orient.lock('landscape').catch(() => {});
      }
    } catch {
      // Ignore if blocked by browser policy
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/92 flex items-center justify-center p-3 sm:p-6">
      <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto p-5 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-400" />
            <h3 className="text-base font-black uppercase tracking-wider text-white">
              SYSTEM, GRAPHICS & MOBILE CONTROLS
            </h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded bg-slate-800 hover:bg-slate-700 cursor-pointer">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Graphics Quality */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            3D Graphics Quality (Mobile & Desktop Optimization)
          </label>
          <div className="grid grid-cols-4 gap-2">
            {graphicsOptions.map((q) => (
              <button
                key={q}
                onClick={() => onChange({ ...settings, graphics: q })}
                className={`py-2 rounded-lg text-xs font-bold uppercase border cursor-pointer ${
                  settings.graphics === q
                    ? 'bg-amber-500 text-slate-950 border-amber-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                {q}
              </button>
            ))}
          </div>
        </div>

        {/* Time of Day / Weather */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">
            Island Atmosphere & Weather
          </label>
          <div className="grid grid-cols-4 gap-2">
            {timeOptions.map((t) => (
              <button
                key={t.id}
                onClick={() => onChange({ ...settings, timeOfDay: t.id })}
                className={`py-2 rounded-lg text-xs font-bold uppercase border cursor-pointer ${
                  settings.timeOfDay === t.id
                    ? 'bg-sky-500 text-slate-950 border-sky-400'
                    : 'bg-slate-800 text-slate-300 border-slate-700 hover:border-slate-500'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Sensitivity Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span>Camera Look Sensitivity</span>
              <span className="font-mono text-amber-400">{settings.sensitivity.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.3"
              max="2.5"
              step="0.05"
              value={settings.sensitivity}
              onChange={(e) => onChange({ ...settings, sensitivity: parseFloat(e.target.value) })}
              className="w-full accent-amber-500"
            />
          </div>

          <div className="bg-slate-950/70 border border-slate-800 rounded-lg p-3">
            <div className="flex justify-between text-xs font-semibold mb-1.5">
              <span>ADS Scope Sensitivity</span>
              <span className="font-mono text-sky-400">{settings.adsSensitivity.toFixed(2)}x</span>
            </div>
            <input
              type="range"
              min="0.2"
              max="1.8"
              step="0.05"
              value={settings.adsSensitivity}
              onChange={(e) => onChange({ ...settings, adsSensitivity: parseFloat(e.target.value) })}
              className="w-full accent-sky-500"
            />
          </div>
        </div>

        {/* Toggles */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs">
          <button
            onClick={() => onChange({ ...settings, gyroEnabled: !settings.gyroEnabled })}
            className="flex items-center justify-between p-3 bg-slate-800/80 border border-slate-700 rounded-lg cursor-pointer"
          >
            <span className="font-bold">Gyroscope Camera Aim (Mobile)</span>
            <span className={settings.gyroEnabled ? 'text-emerald-400 font-black' : 'text-slate-500'}>
              {settings.gyroEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            onClick={() => onChange({ ...settings, showLeftFireBtn: !settings.showLeftFireBtn })}
            className="flex items-center justify-between p-3 bg-slate-800/80 border border-slate-700 rounded-lg cursor-pointer"
          >
            <span className="font-bold">Left-Thumb Fire Trigger</span>
            <span className={settings.showLeftFireBtn ? 'text-emerald-400 font-black' : 'text-slate-500'}>
              {settings.showLeftFireBtn ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            onClick={() => onChange({ ...settings, soundEnabled: !settings.soundEnabled })}
            className="flex items-center justify-between p-3 bg-slate-800/80 border border-slate-700 rounded-lg cursor-pointer"
          >
            <span className="font-bold flex items-center gap-2">
              {settings.soundEnabled ? <Volume2 className="w-4 h-4 text-amber-400" /> : <VolumeX className="w-4 h-4" />}
              Sound Effects
            </span>
            <span className={settings.soundEnabled ? 'text-emerald-400 font-black' : 'text-slate-500'}>
              {settings.soundEnabled ? 'ON' : 'OFF'}
            </span>
          </button>

          <button
            onClick={() => onChange({ ...settings, musicEnabled: !settings.musicEnabled })}
            className="flex items-center justify-between p-3 bg-slate-800/80 border border-slate-700 rounded-lg cursor-pointer"
          >
            <span className="font-bold">Cinematic Lobby Music</span>
            <span className={settings.musicEnabled ? 'text-emerald-400 font-black' : 'text-slate-500'}>
              {settings.musicEnabled ? 'ON' : 'OFF'}
            </span>
          </button>
        </div>

        {/* Action Footer */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-800">
          <div className="flex flex-wrap gap-2">
            <button
              onClick={requestLandscapeFullscreen}
              className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
            >
              <Maximize2 className="w-4 h-4 text-sky-400" /> Fullscreen Landscape
            </button>
            {onEnterHudEditor && (
              <button
                onClick={() => {
                  onClose();
                  onEnterHudEditor();
                }}
                className="px-3 py-2 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/50 text-amber-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Sliders className="w-4 h-4" /> Customize Touch Layout
              </button>
            )}
          </div>
          <button
            onClick={onClose}
            className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-black uppercase cursor-pointer"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};

interface PauseModalProps {
  onResume: () => void;
  onOpenSettings: () => void;
  onExitLobby: () => void;
}

export const PauseModal: React.FC<PauseModalProps> = ({
  onResume,
  onOpenSettings,
  onExitLobby,
}) => (
  <div className="fixed inset-0 z-50 bg-slate-950/88 flex items-center justify-center p-4">
    <div className="bg-slate-900 border border-slate-700 rounded-xl w-full max-w-sm p-6 text-center space-y-4 shadow-2xl">
      <div className="text-xs font-bold tracking-[0.25em] text-amber-400 uppercase">MATCH PAUSED</div>
      <h2 className="text-2xl font-black uppercase text-white">TACTICAL MENU</h2>
      <div className="space-y-2.5 pt-2">
        <button
          onClick={onResume}
          className="w-full py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-wider cursor-pointer"
        >
          Resume Combat
        </button>
        <button
          onClick={onOpenSettings}
          className="w-full py-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold uppercase text-sm cursor-pointer"
        >
          Graphics & Controls
        </button>
        <button
          onClick={onExitLobby}
          className="w-full py-2.5 rounded-lg bg-rose-950/70 hover:bg-rose-900/80 border border-rose-500/40 text-rose-200 font-bold uppercase text-sm cursor-pointer"
        >
          Retreat to Lobby
        </button>
      </div>
    </div>
  </div>
);

interface ResultsModalProps {
  result: MatchResult;
  onPlayAgain: () => void;
  onReturnLobby: () => void;
}

export const ResultsModal: React.FC<ResultsModalProps> = ({
  result,
  onPlayAgain,
  onReturnLobby,
}) => {
  const mins = Math.floor(result.survivalTime / 60);
  const secs = Math.floor(result.survivalTime % 60);

  return (
    <div className="fixed inset-0 z-50 bg-slate-950/92 flex items-center justify-center p-4">
      <div className="bg-slate-900 border border-slate-700 rounded-2xl w-full max-w-lg p-6 sm:p-8 shadow-2xl text-center space-y-5">
        <div className="inline-flex items-center gap-2 px-4 py-1 rounded-full bg-slate-800 border border-slate-700 text-xs font-bold uppercase tracking-widest text-slate-300">
          {result.victory ? (
            <>
              <Trophy className="w-4 h-4 text-amber-400" /> APEX CHAMPION
            </>
          ) : (
            <>
              <Award className="w-4 h-4 text-rose-400" /> ELIMINATED
            </>
          )}
        </div>

        <div>
          <h1
            className={`text-3xl sm:text-4xl font-black italic uppercase tracking-tight ${
              result.victory ? 'text-amber-400' : 'text-white'
            }`}
          >
            {result.victory ? 'WINNER WINNER — #1' : `RANK #${result.rank} / ${result.totalPlayers}`}
          </h1>
          <p className="text-xs text-slate-400 uppercase tracking-widest mt-1">
            VORQEN: ULTIMATE BATTLE ARENA · {result.mode.toUpperCase()} MODE
          </p>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-left">
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Eliminations</div>
            <div className="text-2xl font-black tabular-nums text-amber-400">{result.kills}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Damage Dealt</div>
            <div className="text-2xl font-black tabular-nums text-white">{result.damageDealt}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Survival Time</div>
            <div className="text-2xl font-black tabular-nums text-sky-400">
              {mins}:{secs.toString().padStart(2, '0')}
            </div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Accuracy</div>
            <div className="text-xl font-black tabular-nums text-emerald-400">{result.accuracy}%</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Headshots</div>
            <div className="text-xl font-black tabular-nums text-rose-400">{result.headshots}</div>
          </div>
          <div className="bg-slate-950 border border-slate-800 rounded-lg p-3">
            <div className="text-[10px] uppercase text-slate-400 font-bold">Final Rank</div>
            <div className="text-xl font-black tabular-nums text-amber-300">#{result.rank}</div>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row gap-3 pt-2">
          <button
            onClick={onPlayAgain}
            className="flex-1 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
          >
            <RotateCcw className="w-4 h-4" /> Deploy Again
          </button>
          <button
            onClick={onReturnLobby}
            className="flex-1 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-600 text-white font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer"
          >
            <Crosshair className="w-4 h-4" /> Return to Lobby
          </button>
        </div>
      </div>
    </div>
  );
};
