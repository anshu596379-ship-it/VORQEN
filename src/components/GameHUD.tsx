import React, { useEffect, useRef, useState } from 'react';
import {
  Backpack,
  Crosshair,
  HeartPulse,
  Map as MapIcon,
  Pause,
  RotateCw,
  Settings,
  Shield,
  Sliders,
  Smile,
  Zap,
} from 'lucide-react';
import { EMOTES, WEAPONS, WORLD_RADIUS } from '../game/constants';
import { VorqenEngine } from '../game/engine';
import { EmoteId, GameSettings, HudSnapshot } from '../types/game';

interface GameHUDProps {
  hud: HudSnapshot;
  engineRef: React.MutableRefObject<VorqenEngine | null>;
  settings: GameSettings;
  onUpdateSettings: (s: GameSettings) => void;
  onPause: () => void;
  onOpenMap: () => void;
  onOpenBackpack: () => void;
  onOpenSettings: () => void;
  hudEditing: boolean;
  onCloseHudEditor: () => void;
}

const COMPASS_MARKS: { deg: number; label: string }[] = [
  { deg: 0, label: 'N' },
  { deg: 45, label: 'NE' },
  { deg: 90, label: 'E' },
  { deg: 135, label: 'SE' },
  { deg: 180, label: 'S' },
  { deg: 225, label: 'SW' },
  { deg: 270, label: 'W' },
  { deg: 315, label: 'NW' },
];

export const GameHUD: React.FC<GameHUDProps> = ({
  hud,
  engineRef,
  settings,
  onUpdateSettings,
  onPause,
  onOpenMap,
  onOpenBackpack,
  onOpenSettings,
  hudEditing,
  onCloseHudEditor,
}) => {
  const minimapRef = useRef<HTMLCanvasElement | null>(null);
  const joyBaseRef = useRef<HTMLDivElement | null>(null);
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0, active: false });
  const joyTouchIdRef = useRef<number | null>(null);
  const lookTouchRef = useRef<{ id: number | null; x: number; y: number }>({ id: null, x: 0, y: 0 });
  const mouseDragRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });

  // Emote Wheel State (hold button or hold 'T' key)
  const [emoteWheelOpen, setEmoteWheelOpen] = useState(false);
  const [selectedEmoteIdx, setSelectedEmoteIdx] = useState<number | null>(null);
  const [emoteDragVec, setEmoteDragVec] = useState<{ dx: number; dy: number }>({ dx: 0, dy: 0 });
  const emoteOriginRef = useRef<{ x: number; y: number; active: boolean; pointerId: number | null }>({
    x: 0,
    y: 0,
    active: false,
    pointerId: null,
  });
  const selectedEmoteIdxRef = useRef<number | null>(null);
  selectedEmoteIdxRef.current = selectedEmoteIdx;

  // Draw live tactical radar minimap
  useEffect(() => {
    const canvas = minimapRef.current;
    const sat = engineRef.current?.getSatelliteMapCanvas();
    if (!canvas || !sat) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const size = 144;
    const satSize = 512;
    const span = WORLD_RADIUS * 2.15;
    const pxOnSat = ((hud.playerX / span) + 0.5) * satSize;
    const pyOnSat = ((hud.playerZ / span) + 0.5) * satSize;
    const viewHalfSat = 86;

    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = '#0b2239';
    ctx.fillRect(0, 0, size, size);

    ctx.drawImage(
      sat,
      pxOnSat - viewHalfSat,
      pyOnSat - viewHalfSat,
      viewHalfSat * 2,
      viewHalfSat * 2,
      0,
      0,
      size,
      size
    );

    const worldToMini = (wx: number, wz: number): [number, number] => {
      const sx = ((wx / span) + 0.5) * satSize - (pxOnSat - viewHalfSat);
      const sy = ((wz / span) + 0.5) * satSize - (pyOnSat - viewHalfSat);
      return [(sx / (viewHalfSat * 2)) * size, (sy / (viewHalfSat * 2)) * size];
    };
    const scaleMini = (satSize / span) * (size / (viewHalfSat * 2));

    // Current Safe Zone (white)
    const [zx, zy] = worldToMini(hud.zoneCenterX, hud.zoneCenterZ);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.arc(zx, zy, hud.zoneRadius * scaleMini, 0, Math.PI * 2);
    ctx.stroke();

    // Next Zone (blue dashed)
    const [nx, ny] = worldToMini(hud.nextZoneCenterX, hud.nextZoneCenterZ);
    ctx.strokeStyle = 'rgba(56,189,248,0.85)';
    ctx.lineWidth = 1.4;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(nx, ny, hud.nextZoneRadius * scaleMini, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // Blips (gunfire, allies, supply drops)
    hud.minimapBlips.forEach((b) => {
      const [bx, by] = worldToMini(b.x, b.z);
      if (bx < 0 || bx > size || by < 0 || by > size) return;
      if (b.kind === 'enemy_fire') {
        ctx.fillStyle = '#ef4444';
        ctx.beginPath();
        ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'ally') {
        ctx.fillStyle = '#38bdf8';
        ctx.beginPath();
        ctx.arc(bx, by, 3.5, 0, Math.PI * 2);
        ctx.fill();
      } else if (b.kind === 'supply') {
        ctx.fillStyle = '#f59e0b';
        ctx.fillRect(bx - 3, by - 3, 6, 6);
      }
    });

    // Center Player Cone & Arrow
    ctx.save();
    ctx.translate(size / 2, size / 2);
    ctx.rotate((hud.headingDeg * Math.PI) / 180);
    ctx.fillStyle = 'rgba(250, 204, 21, 0.25)';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.arc(0, 0, 22, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = '#fde047';
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(0, 2.5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }, [hud, engineRef]);

  // Gyroscope camera support
  useEffect(() => {
    if (!settings.gyroEnabled || hudEditing) return;
    let lastBeta: number | null = null;
    let lastGamma: number | null = null;
    const onOrient = (e: DeviceOrientationEvent) => {
      if (e.beta == null || e.gamma == null) return;
      if (lastBeta !== null && lastGamma !== null) {
        const dGamma = e.gamma - lastGamma;
        const dBeta = e.beta - lastBeta;
        if (Math.abs(dGamma) < 15 && Math.abs(dBeta) < 15) {
          engineRef.current?.addCameraLookDelta(dGamma * 2.4, -dBeta * 2.0);
        }
      }
      lastBeta = e.beta;
      lastGamma = e.gamma;
    };
    window.addEventListener('deviceorientation', onOrient);
    return () => window.removeEventListener('deviceorientation', onOrient);
  }, [settings.gyroEnabled, hudEditing, engineRef]);

  // Hold-to-open Emote Wheel global pointer tracking & 'T' key support
  useEffect(() => {
    const computeSliceFromDelta = (dx: number, dy: number) => {
      const dist = Math.hypot(dx, dy);
      setEmoteDragVec({
        dx: dist > 48 ? (dx / dist) * 48 : dx,
        dy: dist > 48 ? (dy / dist) * 48 : dy,
      });
      if (dist < 18) {
        setSelectedEmoteIdx(null);
        return;
      }
      // Angle starting from top (-PI/2) clockwise
      let ang = Math.atan2(dy, dx) + Math.PI / 2;
      if (ang < 0) ang += Math.PI * 2;
      const sliceSize = (Math.PI * 2) / EMOTES.length;
      const idx = Math.floor(((ang + sliceSize / 2) % (Math.PI * 2)) / sliceSize);
      setSelectedEmoteIdx(idx);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!emoteOriginRef.current.active) return;
      if (emoteOriginRef.current.pointerId !== null && e.pointerId !== emoteOriginRef.current.pointerId) return;
      const dx = e.clientX - emoteOriginRef.current.x;
      const dy = e.clientY - emoteOriginRef.current.y;
      computeSliceFromDelta(dx, dy);
    };

    const finishEmoteHold = (e?: PointerEvent) => {
      if (!emoteOriginRef.current.active) return;
      if (e && emoteOriginRef.current.pointerId !== null && e.pointerId !== emoteOriginRef.current.pointerId) return;
      emoteOriginRef.current.active = false;
      emoteOriginRef.current.pointerId = null;
      const idx = selectedEmoteIdxRef.current;
      setEmoteWheelOpen(false);
      setSelectedEmoteIdx(null);
      setEmoteDragVec({ dx: 0, dy: 0 });
      if (idx !== null && EMOTES[idx]) {
        engineRef.current?.playEmote(EMOTES[idx].id);
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' && !e.repeat && hud.phase === 'combat' && !hudEditing) {
        emoteOriginRef.current = {
          x: window.innerWidth / 2,
          y: window.innerHeight / 2,
          active: true,
          pointerId: null,
        };
        setEmoteWheelOpen(true);
        setSelectedEmoteIdx(null);
        setEmoteDragVec({ dx: 0, dy: 0 });
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'KeyT' && emoteOriginRef.current.active && emoteOriginRef.current.pointerId === null) {
        finishEmoteHold();
      }
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', finishEmoteHold);
    window.addEventListener('pointercancel', finishEmoteHold);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', finishEmoteHold);
      window.removeEventListener('pointercancel', finishEmoteHold);
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, [engineRef, hud.phase, hudEditing]);

  const startEmoteHold = (e: React.PointerEvent) => {
    if (hudEditing || hud.phase !== 'combat') return;
    e.stopPropagation();
    e.preventDefault();
    emoteOriginRef.current = {
      x: e.clientX,
      y: e.clientY,
      active: true,
      pointerId: e.pointerId,
    };
    setEmoteWheelOpen(true);
    setSelectedEmoteIdx(null);
    setEmoteDragVec({ dx: 0, dy: 0 });
  };

  const triggerEmoteDirect = (id: EmoteId) => {
    emoteOriginRef.current.active = false;
    setEmoteWheelOpen(false);
    setSelectedEmoteIdx(null);
    setEmoteDragVec({ dx: 0, dy: 0 });
    engineRef.current?.playEmote(id);
  };

  // Virtual Joystick Touch Handlers
  const updateJoystickFromPoint = (clientX: number, clientY: number) => {
    const el = joyBaseRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const maxR = rect.width * 0.42;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const dist = Math.hypot(dx, dy);
    if (dist > maxR) {
      dx = (dx / dist) * maxR;
      dy = (dy / dist) * maxR;
    }
    setJoyKnob({ x: dx, y: dy, active: true });
    // Normalize (-1..1), +Y is forward
    engineRef.current?.setJoystickVector(dx / maxR, -dy / maxR);
  };

  const onJoyTouchStart = (e: React.TouchEvent) => {
    if (hudEditing) return;
    const t = e.changedTouches[0];
    joyTouchIdRef.current = t.identifier;
    updateJoystickFromPoint(t.clientX, t.clientY);
  };

  const onJoyTouchMove = (e: React.TouchEvent) => {
    if (hudEditing) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === joyTouchIdRef.current) {
        updateJoystickFromPoint(t.clientX, t.clientY);
        break;
      }
    }
  };

  const onJoyTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === joyTouchIdRef.current) {
        joyTouchIdRef.current = null;
        setJoyKnob({ x: 0, y: 0, active: false });
        engineRef.current?.setJoystickVector(0, 0);
        break;
      }
    }
  };

  // Camera Look Pad (Touch & Desktop Mouse Drag / Pointer Lock)
  const onLookTouchStart = (e: React.TouchEvent) => {
    if (hudEditing) return;
    if (lookTouchRef.current.id === null) {
      const t = e.changedTouches[0];
      lookTouchRef.current = { id: t.identifier, x: t.clientX, y: t.clientY };
    }
  };

  const onLookTouchMove = (e: React.TouchEvent) => {
    if (hudEditing) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === lookTouchRef.current.id) {
        const dx = t.clientX - lookTouchRef.current.x;
        const dy = t.clientY - lookTouchRef.current.y;
        lookTouchRef.current.x = t.clientX;
        lookTouchRef.current.y = t.clientY;
        engineRef.current?.addCameraLookDelta(dx * 1.4, dy * 1.4);
        break;
      }
    }
  };

  const onLookTouchEnd = (e: React.TouchEvent) => {
    for (let i = 0; i < e.changedTouches.length; i++) {
      if (e.changedTouches[i].identifier === lookTouchRef.current.id) {
        lookTouchRef.current.id = null;
        break;
      }
    }
  };

  // Desktop Mouse Look + Fire
  const onLookMouseDown = (e: React.MouseEvent) => {
    if (hudEditing) return;
    if (e.button === 2) {
      engineRef.current?.toggleAim();
      return;
    }
    if (e.button === 0) {
      mouseDragRef.current = { active: true, x: e.clientX, y: e.clientY };
      if (document.pointerLockElement === e.currentTarget) {
        engineRef.current?.setTouchFire(true);
      }
    }
  };

  const onLookMouseMove = (e: React.MouseEvent) => {
    if (hudEditing) return;
    if (document.pointerLockElement === e.currentTarget) {
      engineRef.current?.addCameraLookDelta(e.movementX, e.movementY);
    } else if (mouseDragRef.current.active) {
      const dx = e.clientX - mouseDragRef.current.x;
      const dy = e.clientY - mouseDragRef.current.y;
      mouseDragRef.current.x = e.clientX;
      mouseDragRef.current.y = e.clientY;
      engineRef.current?.addCameraLookDelta(dx * 1.2, dy * 1.2);
    }
  };

  const onLookMouseUp = () => {
    mouseDragRef.current.active = false;
    engineRef.current?.setTouchFire(false);
  };

  // Helper for HUD Layout Editor Dragging
  const makeDraggableProps = (
    key: 'fireBtnOffset' | 'aimBtnOffset' | 'jumpBtnOffset' | 'crouchBtnOffset' | 'reloadBtnOffset'
  ) => {
    const offset = settings.controlOffsets[key];
    return {
      style: {
        transform: `translate(${offset.x}px, ${offset.y}px) scale(${settings.controlOffsets.buttonsScale})`,
      },
      onPointerDown: (e: React.PointerEvent) => {
        if (!hudEditing) return;
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const origX = offset.x;
        const origY = offset.y;
        const onMove = (mv: PointerEvent) => {
          onUpdateSettings({
            ...settings,
            controlOffsets: {
              ...settings.controlOffsets,
              [key]: { x: origX + (mv.clientX - startX), y: origY + (mv.clientY - startY) },
            },
          });
        };
        const onUp = () => {
          window.removeEventListener('pointermove', onMove);
          window.removeEventListener('pointerup', onUp);
        };
        window.addEventListener('pointermove', onMove);
        window.addEventListener('pointerup', onUp);
      },
    };
  };

  const activeWeapon = hud.weapons[hud.activeSlot];
  const activeSpec = activeWeapon ? WEAPONS[activeWeapon.specId] : null;

  return (
    <div className="fixed inset-0 z-20 pointer-events-none select-none overflow-hidden">
      {/* Camera Look Touch/Mouse Capture Layer */}
      <div
        className="absolute inset-0 pointer-events-auto"
        onContextMenu={(e) => e.preventDefault()}
        onTouchStart={onLookTouchStart}
        onTouchMove={onLookTouchMove}
        onTouchEnd={onLookTouchEnd}
        onTouchCancel={onLookTouchEnd}
        onMouseDown={onLookMouseDown}
        onMouseMove={onLookMouseMove}
        onMouseUp={onLookMouseUp}
        onDoubleClick={(e) => {
          if (!hudEditing && !('ontouchstart' in window)) {
            (e.currentTarget as HTMLElement).requestPointerLock?.();
          }
        }}
      />

      {/* Storm Vignette Warning when outside safe zone */}
      {hud.outsideZone && hud.phase === 'combat' && (
        <div
          className="absolute inset-0 pointer-events-none border-4 border-sky-500/70"
          style={{ boxShadow: 'inset 0 0 60px rgba(56, 189, 248, 0.35)' }}
        />
      )}

      {/* TOP BAR: Alive/Kills (Left) | Compass (Center) | Minimap (Right) */}
      <div className="relative z-10 flex items-start justify-between px-2.5 sm:px-4 pt-2 sm:pt-3 pointer-events-none">
        {/* Top-Left: Alive + Finished + Ally Squad + Kill Feed */}
        <div className="flex flex-col gap-1.5 pointer-events-auto">
          <div className="flex items-center gap-1.5">
            <div className="flex items-center bg-slate-950/88 border border-slate-700 rounded overflow-hidden text-xs shadow">
              <div className="px-2.5 py-1 bg-slate-800/90 text-slate-300 font-bold uppercase text-[10px]">
                Alive
              </div>
              <div className="px-2.5 py-1 font-black tabular-nums text-white">{hud.aliveCount}</div>
              <div className="px-2 py-1 bg-slate-800/90 text-slate-300 font-bold uppercase text-[10px] border-l border-slate-700">
                Kills
              </div>
              <div className="px-2.5 py-1 font-black tabular-nums text-amber-400">{hud.kills}</div>
            </div>

            <button
              onClick={onPause}
              className="p-1.5 rounded bg-slate-950/88 border border-slate-700 hover:bg-slate-800 text-slate-200 cursor-pointer"
              aria-label="Pause"
            >
              <Pause className="w-4 h-4" />
            </button>
            <button
              onClick={onOpenSettings}
              className="p-1.5 rounded bg-slate-950/88 border border-slate-700 hover:bg-slate-800 text-slate-200 cursor-pointer"
              aria-label="Settings"
            >
              <Settings className="w-4 h-4" />
            </button>
          </div>

          {/* Squad Allies HP (Duo/Squad) */}
          {hud.allyHpList.length > 0 && (
            <div className="space-y-1">
              {hud.allyHpList.map((a, idx) => (
                <div
                  key={idx}
                  className="bg-slate-950/85 border border-slate-800 rounded px-2 py-0.5 w-36 flex items-center justify-between gap-2"
                >
                  <span className="text-[10px] font-bold text-sky-300 truncate">{a.name}</span>
                  <div className="w-14 h-1.5 bg-slate-800 rounded overflow-hidden">
                    <div
                      className="h-full bg-emerald-400"
                      style={{ width: `${Math.max(0, a.hp)}%` }}
                    />
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Live Kill Feed */}
          <div className="space-y-1 pointer-events-none">
            {hud.killFeed.map((kf) => (
              <div
                key={kf.id}
                className="px-2 py-0.5 rounded bg-slate-950/80 border-l-2 border-amber-400 text-[10px] font-semibold text-slate-200 flex items-center gap-1"
              >
                <span className={kf.isPlayerKiller ? 'text-amber-400 font-black' : 'text-white'}>
                  {kf.killer}
                </span>
                <span className="text-slate-400">[{kf.weapon}]</span>
                <span className="text-rose-400">{kf.victim}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Top-Center: Sliding Tactical Compass & Zone Timer */}
        <div className="flex flex-col items-center gap-1">
          <div className="w-48 sm:w-72 h-7 bg-slate-950/82 border border-slate-700/80 rounded-md relative overflow-hidden flex items-center justify-center">
            <div className="absolute top-0 bottom-0 w-0.5 bg-amber-400 z-10" />
            {COMPASS_MARKS.map((m) => {
              let diff = ((m.deg - hud.headingDeg + 540) % 360) - 180;
              if (Math.abs(diff) > 85) return null;
              const xPct = 50 + (diff / 85) * 50;
              return (
                <span
                  key={m.label}
                  className={`absolute text-[10px] font-black ${
                    m.label === 'N' ? 'text-amber-400' : 'text-slate-200'
                  }`}
                  style={{ left: `${xPct}%`, transform: 'translateX(-50%)' }}
                >
                  {m.label}
                </span>
              );
            })}
            <span className="absolute bottom-0.5 right-1.5 text-[9px] font-mono tabular-nums text-slate-400">
              {hud.headingDeg}°
            </span>
          </div>

          {hud.mode !== 'training' && (
            <div
              className={`px-2.5 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider border tabular-nums ${
                hud.outsideZone
                  ? 'bg-rose-950/90 border-rose-500 text-rose-200'
                  : hud.zoneShrinking
                  ? 'bg-sky-950/90 border-sky-400 text-sky-200'
                  : 'bg-slate-950/82 border-slate-700 text-slate-300'
              }`}
            >
              {hud.outsideZone
                ? 'OUTSIDE SAFE ZONE!'
                : hud.zoneShrinking
                ? `ZONE ${hud.zonePhase} CLOSING · ${hud.zoneTimer}s`
                : `SAFE ZONE ${hud.zonePhase} · ${hud.zoneTimer}s`}
            </div>
          )}
        </div>

        {/* Top-Right: Live Satellite Radar Minimap */}
        <div className="flex flex-col items-end gap-1 pointer-events-auto">
          <button
            onClick={onOpenMap}
            className="relative w-24 h-24 sm:w-32 sm:h-32 rounded-lg overflow-hidden border-2 border-slate-600 hover:border-amber-400 bg-slate-950 shadow-xl cursor-pointer"
            title="Expand Island Map (M)"
          >
            <canvas ref={minimapRef} width={144} height={144} className="w-full h-full block" />
            <div className="absolute bottom-1 right-1 px-1 py-0.5 bg-slate-950/85 rounded text-[9px] font-bold text-amber-400 flex items-center gap-0.5">
              <MapIcon className="w-2.5 h-2.5" /> MAP
            </div>
          </button>
          <div className="text-[10px] font-mono tabular-nums text-slate-300 bg-slate-950/80 px-2 py-0.5 rounded border border-slate-800">
            {Math.floor(hud.matchTime / 60)}:
            {Math.floor(hud.matchTime % 60)
              .toString()
              .padStart(2, '0')}
          </div>
        </div>
      </div>

      {/* CENTER BANNER + CROSSHAIR + PLANE/PARACHUTE PROMPTS */}
      {hud.bannerText && (
        <div className="absolute top-20 left-1/2 -translate-x-1/2 z-20 px-4 py-1.5 rounded bg-slate-950/90 border border-amber-500/60 text-xs font-black tracking-widest uppercase text-amber-300 shadow-lg text-center whitespace-nowrap">
          {hud.bannerText}
        </div>
      )}

      {/* Crosshair (Combat Phase) */}
      {hud.phase === 'combat' && !hudEditing && (
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 pointer-events-none">
          <div className={`relative transition-transform duration-75 ${hud.isAiming ? 'scale-75' : 'scale-100'}`}>
            <div className="w-1 h-1 rounded-full bg-amber-400" />
            <div className="absolute -top-3 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white/90" />
            <div className="absolute -bottom-3 left-1/2 -translate-x-1/2 w-0.5 h-2 bg-white/90" />
            <div className="absolute -left-3 top-1/2 -translate-y-1/2 w-2 h-0.5 bg-white/90" />
            <div className="absolute -right-3 top-1/2 -translate-y-1/2 w-2 h-0.5 bg-white/90" />
          </div>

          {/* Hitmarker X */}
          {hud.hitmarkerTimer > 0 && (
            <div
              className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-6 h-6 pointer-events-none ${
                hud.hitmarkerKill ? 'text-rose-500' : 'text-white'
              }`}
            >
              <svg viewBox="0 0 24 24" className="w-full h-full stroke-current" strokeWidth="2.5">
                <line x1="4" y1="4" x2="9" y2="9" />
                <line x1="20" y1="4" x2="15" y2="9" />
                <line x1="4" y1="20" x2="9" y2="15" />
                <line x1="20" y1="20" x2="15" y2="15" />
              </svg>
            </div>
          )}

          {/* Directional Damage Arc */}
          {hud.damageIndicatorTimer > 0 && hud.damageIndicatorAngle !== null && (
            <div
              className="absolute top-1/2 left-1/2 w-28 h-28 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
              style={{ transform: `translate(-50%, -50%) rotate(${hud.damageIndicatorAngle}rad)` }}
            >
              <div className="w-10 h-2 bg-rose-500/90 mx-auto rounded-full" />
            </div>
          )}
        </div>
      )}

      {/* Plane Drop & Parachute Controls */}
      {hud.phase === 'plane' && (
        <div className="absolute bottom-28 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex flex-col items-center gap-2">
          <div className="px-4 py-1.5 rounded bg-slate-950/90 border border-slate-700 text-xs font-bold text-slate-200">
            CARGO JET FLIGHT · TAP DROP TO PARACHUTE
          </div>
          <button
            onClick={() => engineRef.current?.dropFromPlane()}
            className="px-8 py-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-black uppercase tracking-wider shadow-xl cursor-pointer"
          >
            EJECT / PARACHUTE DROP (SPACE)
          </button>
        </div>
      )}

      {hud.phase === 'parachute' && (
        <div className="absolute top-28 right-4 sm:right-8 z-20 pointer-events-auto flex flex-col items-end gap-2">
          <div className="bg-slate-950/88 border border-slate-700 rounded-lg px-3 py-2 text-right">
            <div className="text-[10px] font-bold uppercase text-slate-400">ALTITUDE</div>
            <div className="text-xl font-black tabular-nums text-sky-400">{hud.altitude}m</div>
          </div>
          <button
            onClick={() => engineRef.current?.deployParachuteEarly()}
            className="px-4 py-2 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 text-xs font-black uppercase cursor-pointer"
          >
            OPEN CHUTE (SPACE)
          </button>
        </div>
      )}

      {/* Nearby Loot Pickup Cards */}
      {hud.phase === 'combat' && hud.nearbyLoot.length > 0 && (
        <div className="absolute bottom-28 sm:bottom-32 left-1/2 -translate-x-1/2 z-20 flex flex-wrap justify-center gap-2 pointer-events-auto">
          {hud.nearbyLoot.map((item) => (
            <button
              key={item.id}
              onClick={() => engineRef.current?.pickupLootById(item.id)}
              className="px-3 py-1.5 rounded-lg bg-slate-950/92 hover:bg-slate-800 border border-amber-400/70 text-xs font-bold text-white flex items-center gap-2 shadow-lg cursor-pointer"
            >
              <span className="px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[10px] font-black">
                F
              </span>
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      )}

      {/* BOTTOM CONTROLS: Left Joystick | Center HP & Weapon Cards | Right Action Cluster */}
      <div className="absolute bottom-0 inset-x-0 px-3 sm:px-5 pb-2.5 sm:pb-4 flex items-end justify-between pointer-events-none">
        {/* Bottom-Left: Virtual Joystick + Bag + Medkit/Shield + Optional Left Fire */}
        <div className="flex items-end gap-2.5 pointer-events-auto">
          <div className="flex flex-col items-center gap-2">
            {settings.showLeftFireBtn && hud.phase === 'combat' && (
              <button
                onTouchStart={(e) => {
                  e.preventDefault();
                  engineRef.current?.setTouchFire(true);
                }}
                onTouchEnd={() => engineRef.current?.setTouchFire(false)}
                onMouseDown={() => engineRef.current?.setTouchFire(true)}
                onMouseUp={() => engineRef.current?.setTouchFire(false)}
                className="w-12 h-12 rounded-full bg-amber-500/85 active:bg-amber-400 border-2 border-white/80 text-slate-950 flex items-center justify-center shadow-lg cursor-pointer"
                aria-label="Left Fire"
              >
                <Crosshair className="w-5 h-5" />
              </button>
            )}

            {/* Virtual Joystick */}
            <div
              ref={joyBaseRef}
              onTouchStart={onJoyTouchStart}
              onTouchMove={onJoyTouchMove}
              onTouchEnd={onJoyTouchEnd}
              onTouchCancel={onJoyTouchEnd}
              style={{ transform: `scale(${settings.controlOffsets.joystickScale})` }}
              className="relative w-24 h-24 sm:w-28 sm:h-28 rounded-full bg-slate-950/65 border-2 border-slate-500/60 flex items-center justify-center touch-none"
            >
              <div className="w-10 h-10 rounded-full border border-slate-400/40 pointer-events-none" />
              <div
                className="absolute w-10 h-10 sm:w-11 sm:h-11 rounded-full bg-amber-400/90 border-2 border-white shadow-lg pointer-events-none"
                style={{
                  transform: `translate(${joyKnob.x}px, ${joyKnob.y}px)`,
                }}
              />
            </div>
          </div>

          {/* Bag + Quick Heal */}
          <div className="flex flex-col gap-1.5 mb-1">
            <button
              onClick={onOpenBackpack}
              className="w-10 h-10 rounded-lg bg-slate-950/85 border border-slate-600 flex items-center justify-center text-slate-200 hover:border-amber-400 cursor-pointer"
              title="Backpack"
            >
              <Backpack className="w-4 h-4" />
            </button>
            <button
              onClick={() => engineRef.current?.useMedkit()}
              className="px-2 py-1 rounded-lg bg-emerald-950/85 border border-emerald-500/50 text-[10px] font-bold text-emerald-300 flex items-center gap-1 cursor-pointer"
              title="Use Medkit (Q)"
            >
              <HeartPulse className="w-3.5 h-3.5" /> {hud.medkits}
            </button>
            <button
              onClick={() => engineRef.current?.useShieldCell()}
              className="px-2 py-1 rounded-lg bg-sky-950/85 border border-sky-500/50 text-[10px] font-bold text-sky-300 flex items-center gap-1 cursor-pointer"
              title="Use Shield (V)"
            >
              <Shield className="w-3.5 h-3.5" /> {hud.shieldCells}
            </button>
          </div>
        </div>

        {/* Bottom-Center: Health, Shield & Dual Weapon Slots */}
        <div className="hidden sm:flex flex-col items-center gap-1.5 pointer-events-auto mb-0.5">
          {hud.isReloading && (
            <div className="w-44 bg-slate-950/90 border border-amber-400/60 rounded px-2 py-1">
              <div className="text-[10px] font-bold text-amber-300 uppercase text-center mb-0.5">
                RELOADING...
              </div>
              <div className="h-1 bg-slate-800 rounded overflow-hidden">
                <div
                  className="h-full bg-amber-400"
                  style={{ width: `${Math.min(100, Math.round(hud.reloadProgress * 100))}%` }}
                />
              </div>
            </div>
          )}

          {/* Shield & HP Bars */}
          <div className="w-64 md:w-80 bg-slate-950/85 border border-slate-700 rounded-lg px-2.5 py-1.5 space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-sky-400 w-9 tabular-nums">
                SH {Math.round(hud.shield)}
              </span>
              <div className="flex-1 h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-sky-400 transition-all duration-75"
                  style={{ width: `${Math.max(0, Math.min(100, hud.shield))}%` }}
                />
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black text-emerald-400 w-9 tabular-nums">
                HP {Math.round(hud.hp)}
              </span>
              <div className="flex-1 h-2 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className={`h-full transition-all duration-75 ${
                    hud.hp < 30 ? 'bg-rose-500' : 'bg-emerald-400'
                  }`}
                  style={{ width: `${Math.max(0, Math.min(100, hud.hp))}%` }}
                />
              </div>
            </div>
          </div>

          {/* Weapon Slots */}
          <div className="flex items-center gap-1.5">
            {([0, 1, 2] as const).map((slot) => {
              const w = hud.weapons[slot];
              const spec = w ? WEAPONS[w.specId] : null;
              const active = hud.activeSlot === slot;
              return (
                <button
                  key={slot}
                  disabled={!w}
                  onClick={() => engineRef.current?.switchWeaponSlot(slot)}
                  className={`px-2.5 py-1.5 rounded-lg border text-left min-w-[96px] cursor-pointer ${
                    active
                      ? 'bg-amber-500/20 border-amber-400'
                      : w
                      ? 'bg-slate-950/85 border-slate-700 hover:border-slate-500'
                      : 'bg-slate-950/50 border-slate-800 opacity-45 cursor-not-allowed'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2 text-[10px] font-bold">
                    <span className="text-slate-300 truncate">{spec ? spec.name : `Slot ${slot + 1}`}</span>
                    <span className="text-slate-500">{slot + 1}</span>
                  </div>
                  <div className="text-xs font-black font-mono tabular-nums text-white mt-0.5">
                    {w ? `${w.ammoInMag} / ${w.reserveAmmo}` : '--'}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Mobile Compact HP/Ammo Strip for very narrow screens */}
        <div className="flex sm:hidden flex-col items-center gap-1 pointer-events-auto mb-1">
          <div className="bg-slate-950/88 border border-slate-700 rounded px-2 py-1 text-[10px] font-black tabular-nums flex items-center gap-2">
            <span className="text-emerald-400">HP {Math.round(hud.hp)}</span>
            <span className="text-sky-400">SH {Math.round(hud.shield)}</span>
          </div>
          {activeWeapon && activeSpec && (
            <button
              onClick={() => {
                const next: 0 | 1 | 2 = hud.activeSlot === 0 ? 1 : hud.activeSlot === 1 ? 2 : 0;
                if (hud.weapons[next]) engineRef.current?.switchWeaponSlot(next);
              }}
              className="bg-slate-950/90 border border-amber-400/70 rounded px-2.5 py-1 text-[10px] font-black text-white tabular-nums cursor-pointer"
            >
              {activeSpec.name.split(' ')[0]} · {activeWeapon.ammoInMag}/{activeWeapon.reserveAmmo}
            </button>
          )}
        </div>

        {/* Bottom-Right: Mobile Shooter Action Cluster */}
        <div className="relative flex items-end gap-2 pointer-events-auto">
          <div className="flex flex-col items-end gap-2">
            {/* Top Utility Row: Emote (Hold) + Sprint + Reload + ADS */}
            <div className="flex items-center gap-2">
              {hud.phase === 'combat' && (
                <button
                  onPointerDown={startEmoteHold}
                  className={`w-10 h-10 rounded-full border flex flex-col items-center justify-center cursor-pointer touch-none ${
                    emoteWheelOpen || hud.activeEmote
                      ? 'bg-amber-500 text-slate-950 border-white'
                      : 'bg-slate-950/85 text-amber-300 border-amber-500/60 hover:border-amber-400'
                  }`}
                  title="Hold for Emote Wheel (T)"
                  aria-label="Hold for Emote Wheel"
                >
                  <Smile className="w-4 h-4" />
                  <span className="text-[7px] font-black leading-none mt-0.5">EMOTE</span>
                </button>
              )}

              <button
                onClick={() => engineRef.current?.toggleSprint()}
                className={`w-10 h-10 rounded-full border flex items-center justify-center cursor-pointer ${
                  hud.isSprinting
                    ? 'bg-amber-500 text-slate-950 border-white'
                    : 'bg-slate-950/80 text-slate-200 border-slate-600'
                }`}
                title="Sprint Toggle"
              >
                <Zap className="w-4 h-4" />
              </button>

              <button
                {...makeDraggableProps('reloadBtnOffset')}
                onClick={() => !hudEditing && engineRef.current?.triggerReload()}
                className="w-11 h-11 rounded-full bg-slate-950/85 active:bg-slate-800 border border-slate-500 text-white flex items-center justify-center cursor-pointer"
                title="Reload (R)"
              >
                <RotateCw className="w-4 h-4" />
              </button>

              <button
                {...makeDraggableProps('aimBtnOffset')}
                onClick={() => !hudEditing && engineRef.current?.toggleAim()}
                className={`w-12 h-12 rounded-full border-2 flex items-center justify-center font-black text-[10px] cursor-pointer ${
                  hud.isAiming
                    ? 'bg-sky-500 text-slate-950 border-white'
                    : 'bg-slate-950/85 text-sky-300 border-sky-400/70'
                }`}
                title="ADS Scope"
              >
                ADS
              </button>
            </div>

            {/* Bottom Row: Crouch + Jump + Primary FIRE */}
            <div className="flex items-center gap-2.5">
              <button
                {...makeDraggableProps('crouchBtnOffset')}
                onClick={() => !hudEditing && engineRef.current?.toggleCrouch()}
                className={`w-11 h-11 rounded-full border flex items-center justify-center text-[10px] font-black cursor-pointer ${
                  hud.isCrouching
                    ? 'bg-amber-500 text-slate-950 border-white'
                    : 'bg-slate-950/85 text-slate-200 border-slate-500'
                }`}
                title="Crouch (C)"
              >
                CRCH
              </button>

              <button
                {...makeDraggableProps('jumpBtnOffset')}
                onClick={() => !hudEditing && engineRef.current?.triggerJump()}
                className="w-12 h-12 rounded-full bg-slate-950/85 active:bg-slate-700 border border-slate-400 text-white text-[10px] font-black flex items-center justify-center cursor-pointer"
                title="Jump (Space)"
              >
                JUMP
              </button>

              <button
                {...makeDraggableProps('fireBtnOffset')}
                onTouchStart={(e) => {
                  if (hudEditing) return;
                  e.preventDefault();
                  engineRef.current?.setTouchFire(true);
                }}
                onTouchEnd={() => !hudEditing && engineRef.current?.setTouchFire(false)}
                onMouseDown={() => !hudEditing && engineRef.current?.setTouchFire(true)}
                onMouseUp={() => !hudEditing && engineRef.current?.setTouchFire(false)}
                className="w-16 h-16 sm:w-20 sm:h-20 rounded-full bg-gradient-to-br from-amber-500 to-rose-600 active:scale-95 border-2 border-white text-white font-black text-xs flex flex-col items-center justify-center shadow-2xl cursor-pointer"
                title="Fire"
              >
                <Crosshair className="w-6 h-6" />
                <span className="text-[9px] tracking-widest mt-0.5">FIRE</span>
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* RADIAL EMOTE WHEEL OVERLAY (Appears while holding Emote button or 'T') */}
      {emoteWheelOpen && (
        <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
          <div className="relative w-72 h-72 sm:w-80 sm:h-80 pointer-events-auto">
            <svg viewBox="-150 -150 300 300" className="w-full h-full drop-shadow-2xl">
              {/* Outer ring */}
              <circle cx="0" cy="0" r="142" fill="rgba(9, 13, 22, 0.9)" stroke="#334155" strokeWidth="2" />

              {EMOTES.map((em, idx) => {
                const count = EMOTES.length;
                const slice = (Math.PI * 2) / count;
                const startAng = -Math.PI / 2 + idx * slice - slice / 2;
                const endAng = startAng + slice;
                const midAng = (startAng + endAng) / 2;
                const isSelected = selectedEmoteIdx === idx;
                const rInner = 46;
                const rOuter = isSelected ? 138 : 132;

                const x1 = Math.cos(startAng) * rInner;
                const y1 = Math.sin(startAng) * rInner;
                const x2 = Math.cos(startAng) * rOuter;
                const y2 = Math.sin(startAng) * rOuter;
                const x3 = Math.cos(endAng) * rOuter;
                const y3 = Math.sin(endAng) * rOuter;
                const x4 = Math.cos(endAng) * rInner;
                const y4 = Math.sin(endAng) * rInner;

                const d = `M ${x1} ${y1} L ${x2} ${y2} A ${rOuter} ${rOuter} 0 0 1 ${x3} ${y3} L ${x4} ${y4} A ${rInner} ${rInner} 0 0 0 ${x1} ${y1} Z`;

                const labelR = 92;
                const lx = Math.cos(midAng) * labelR;
                const ly = Math.sin(midAng) * labelR;

                return (
                  <g
                    key={em.id}
                    onPointerEnter={() => setSelectedEmoteIdx(idx)}
                    onClick={() => triggerEmoteDirect(em.id)}
                    className="cursor-pointer"
                  >
                    <path
                      d={d}
                      fill={isSelected ? em.accent : 'rgba(30, 41, 59, 0.9)'}
                      fillOpacity={isSelected ? 0.34 : 0.95}
                      stroke={isSelected ? em.accent : '#475569'}
                      strokeWidth={isSelected ? 3 : 1.5}
                    />
                    <circle
                      cx={lx}
                      cy={ly - 11}
                      r="5"
                      fill={em.accent}
                    />
                    <text
                      x={lx}
                      y={ly + 6}
                      textAnchor="middle"
                      fill={isSelected ? '#ffffff' : '#cbd5e1'}
                      fontSize="10.5"
                      fontWeight="900"
                      letterSpacing="0.8"
                    >
                      {em.shortLabel}
                    </text>
                  </g>
                );
              })}

              {/* Center Hub */}
              <circle cx="0" cy="0" r="44" fill="#090d16" stroke="#f59e0b" strokeWidth="2.5" />
              {/* Live drag direction indicator dot */}
              <circle
                cx={emoteDragVec.dx * 0.65}
                cy={emoteDragVec.dy * 0.65}
                r="6"
                fill="#f59e0b"
              />
              <text
                x="0"
                y="-4"
                textAnchor="middle"
                fill="#f8fafc"
                fontSize="10"
                fontWeight="900"
                letterSpacing="1"
              >
                {selectedEmoteIdx !== null ? EMOTES[selectedEmoteIdx].shortLabel : 'EMOTES'}
              </text>
              <text
                x="0"
                y="11"
                textAnchor="middle"
                fill="#94a3b8"
                fontSize="7.5"
                fontWeight="700"
              >
                {selectedEmoteIdx !== null ? 'RELEASE TO PLAY' : 'DRAG & RELEASE'}
              </text>
            </svg>
          </div>
        </div>
      )}

      {/* HUD Layout Customizer Bar */}
      {hudEditing && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-40 bg-slate-950/95 border border-amber-400 rounded-xl px-4 py-3 flex flex-wrap items-center gap-3 pointer-events-auto shadow-2xl">
          <div className="flex items-center gap-1.5 text-xs font-black text-amber-400">
            <Sliders className="w-4 h-4" /> DRAG RIGHT BUTTONS TO REPOSITION
          </div>
          <label className="text-[11px] flex items-center gap-1.5">
            Scale:
            <input
              type="range"
              min="0.75"
              max="1.35"
              step="0.05"
              value={settings.controlOffsets.buttonsScale}
              onChange={(e) =>
                onUpdateSettings({
                  ...settings,
                  controlOffsets: {
                    ...settings.controlOffsets,
                    buttonsScale: parseFloat(e.target.value),
                    joystickScale: parseFloat(e.target.value),
                  },
                })
              }
              className="w-20 accent-amber-500"
            />
          </label>
          <button
            onClick={() =>
              onUpdateSettings({
                ...settings,
                controlOffsets: {
                  joystickScale: 1,
                  buttonsScale: 1,
                  fireBtnOffset: { x: 0, y: 0 },
                  aimBtnOffset: { x: 0, y: 0 },
                  jumpBtnOffset: { x: 0, y: 0 },
                  crouchBtnOffset: { x: 0, y: 0 },
                  reloadBtnOffset: { x: 0, y: 0 },
                },
              })
            }
            className="px-2.5 py-1 rounded bg-slate-800 text-[11px] font-bold cursor-pointer"
          >
            Reset
          </button>
          <button
            onClick={onCloseHudEditor}
            className="px-3 py-1 rounded bg-amber-500 text-slate-950 text-[11px] font-black uppercase cursor-pointer"
          >
            Save Layout
          </button>
        </div>
      )}
    </div>
  );
};
