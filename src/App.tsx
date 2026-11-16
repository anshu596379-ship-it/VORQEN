import { useCallback, useEffect, useRef, useState } from 'react';
import { Maximize2, Smartphone } from 'lucide-react';
import { GameHUD } from './components/GameHUD';
import { LoadingScreen } from './components/LoadingScreen';
import { LobbyScreen } from './components/LobbyScreen';
import {
  BackpackModal,
  PauseModal,
  ResultsModal,
  SettingsModal,
  TacticalMapModal,
} from './components/Modals';
import { DEFAULT_SETTINGS } from './game/constants';
import { VorqenEngine } from './game/engine';
import {
  GameMode,
  GameScreen,
  GameSettings,
  HudSnapshot,
  MatchResult,
} from './types/game';

export default function App() {
  const canvasMountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<VorqenEngine | null>(null);

  const [screen, setScreen] = useState<GameScreen>('lobby');
  const [selectedMode, setSelectedMode] = useState<GameMode>('solo');
  const [selectedOperatorId, setSelectedOperatorId] = useState('vortex');
  const [selectedSkinId, setSelectedSkinId] = useState('default');
  const [settings, setSettings] = useState<GameSettings>(() => {
    try {
      const saved = localStorage.getItem('vorqen_settings_v1');
      if (saved) return { ...DEFAULT_SETTINGS, ...JSON.parse(saved) };
    } catch {
      // ignore storage errors
    }
    return DEFAULT_SETTINGS;
  });

  const [hud, setHud] = useState<HudSnapshot | null>(null);
  const [matchResult, setMatchResult] = useState<MatchResult | null>(null);
  const [showSettings, setShowSettings] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [showBackpack, setShowBackpack] = useState(false);
  const [hudEditing, setHudEditing] = useState(false);
  const [isMobilePortrait, setIsMobilePortrait] = useState(false);
  const [dismissPortraitHint, setDismissPortraitHint] = useState(false);

  // Detect touch device in portrait orientation to prompt Android landscape lock
  useEffect(() => {
    const checkOrient = () => {
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      setIsMobilePortrait(hasTouch && window.innerHeight > window.innerWidth);
    };
    checkOrient();
    window.addEventListener('resize', checkOrient);
    return () => window.removeEventListener('resize', checkOrient);
  }, []);

  // Persist settings
  const handleUpdateSettings = useCallback((next: GameSettings) => {
    setSettings(next);
    engineRef.current?.updateSettings(next);
    try {
      localStorage.setItem('vorqen_settings_v1', JSON.stringify(next));
    } catch {
      // ignore storage errors
    }
  }, []);

  // Mount Three.js engine once in isolated container
  useEffect(() => {
    if (!canvasMountRef.current) return;
    const engine = new VorqenEngine(
      canvasMountRef.current,
      settings,
      (snapshot) => setHud(snapshot),
      (result) => {
        setMatchResult(result);
        setScreen('results');
      }
    );
    engineRef.current = engine;
    engine.enterLobby();

    return () => {
      engine.dispose();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Global keyboard shortcuts during match
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (screen !== 'playing' && screen !== 'paused') return;
      if (e.code === 'Escape') {
        if (showMap) {
          setShowMap(false);
        } else if (showBackpack) {
          setShowBackpack(false);
        } else if (showSettings) {
          setShowSettings(false);
        } else if (screen === 'playing') {
          engineRef.current?.setPaused(true);
          setScreen('paused');
        } else if (screen === 'paused') {
          engineRef.current?.setPaused(false);
          setScreen('playing');
        }
      } else if (e.code === 'KeyM' && screen === 'playing') {
        setShowMap((v) => !v);
      } else if (e.code === 'KeyB' && screen === 'playing') {
        setShowBackpack((v) => !v);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [screen, showMap, showBackpack, showSettings]);

  const handleSelectCharacter = useCallback((opId: string, skinId: string) => {
    setSelectedOperatorId(opId);
    setSelectedSkinId(skinId);
    engineRef.current?.setSelectedCharacter(opId, skinId);
  }, []);

  const handleDeploy = useCallback(() => {
    setMatchResult(null);
    setShowMap(false);
    setShowBackpack(false);
    setScreen('loading');
  }, []);

  const handleLoadingComplete = useCallback(() => {
    engineRef.current?.startMatch(selectedMode);
    setScreen('playing');
  }, [selectedMode]);

  const handleExitLobby = useCallback(() => {
    setShowSettings(false);
    setShowMap(false);
    setShowBackpack(false);
    setHudEditing(false);
    engineRef.current?.enterLobby();
    setScreen('lobby');
  }, []);

  const enterLandscapeFullscreen = async () => {
    try {
      if (!document.fullscreenElement) {
        await document.documentElement.requestFullscreen();
      }
      const orient = window.screen.orientation as unknown as { lock?: (o: string) => Promise<void> };
      if (orient?.lock) {
        await orient.lock('landscape').catch(() => {});
      }
    } catch {
      // Ignore browser restrictions
    }
    setDismissPortraitHint(true);
  };

  return (
    <div className="relative w-full h-full overflow-hidden bg-[#090c12]">
      {/* Isolated WebGL Viewport Container */}
      <div ref={canvasMountRef} className="fixed inset-0 w-full h-full" />

      {/* Lobby UI */}
      {screen === 'lobby' && (
        <LobbyScreen
          selectedMode={selectedMode}
          onSelectMode={setSelectedMode}
          selectedOperatorId={selectedOperatorId}
          selectedSkinId={selectedSkinId}
          onSelectCharacter={handleSelectCharacter}
          onRotateCharacter={(dx) => engineRef.current?.rotateLobbyCharacter(dx)}
          onDeploy={handleDeploy}
          onOpenSettings={() => setShowSettings(true)}
          settings={settings}
          onToggleSound={() =>
            handleUpdateSettings({ ...settings, soundEnabled: !settings.soundEnabled })
          }
        />
      )}

      {/* Cinematic Loading Screen */}
      {screen === 'loading' && (
        <LoadingScreen mode={selectedMode} onComplete={handleLoadingComplete} />
      )}

      {/* In-Game HUD */}
      {(screen === 'playing' || screen === 'paused') && hud && (
        <GameHUD
          hud={hud}
          engineRef={engineRef}
          settings={settings}
          onUpdateSettings={handleUpdateSettings}
          onPause={() => {
            engineRef.current?.setPaused(true);
            setScreen('paused');
          }}
          onOpenMap={() => setShowMap(true)}
          onOpenBackpack={() => setShowBackpack(true)}
          onOpenSettings={() => setShowSettings(true)}
          hudEditing={hudEditing}
          onCloseHudEditor={() => setHudEditing(false)}
        />
      )}

      {/* Tactical Satellite Map Modal */}
      {showMap && hud && (
        <TacticalMapModal
          hud={hud}
          satelliteCanvas={engineRef.current?.getSatelliteMapCanvas() || null}
          onClose={() => setShowMap(false)}
        />
      )}

      {/* Backpack & Loadout Modal */}
      {showBackpack && hud && (
        <BackpackModal
          hud={hud}
          onUseMedkit={() => engineRef.current?.useMedkit()}
          onUseShield={() => engineRef.current?.useShieldCell()}
          onSwitchSlot={(slot) => engineRef.current?.switchWeaponSlot(slot)}
          onClose={() => setShowBackpack(false)}
        />
      )}

      {/* Pause Menu */}
      {screen === 'paused' && !showSettings && (
        <PauseModal
          onResume={() => {
            engineRef.current?.setPaused(false);
            setScreen('playing');
          }}
          onOpenSettings={() => setShowSettings(true)}
          onExitLobby={handleExitLobby}
        />
      )}

      {/* Settings Modal */}
      {showSettings && (
        <SettingsModal
          settings={settings}
          onChange={handleUpdateSettings}
          onEnterHudEditor={
            screen === 'playing' || screen === 'paused'
              ? () => {
                  engineRef.current?.setPaused(false);
                  setScreen('playing');
                  setHudEditing(true);
                }
              : undefined
          }
          onClose={() => setShowSettings(false)}
        />
      )}

      {/* Match Victory / Elimination Results */}
      {screen === 'results' && matchResult && (
        <ResultsModal
          result={matchResult}
          onPlayAgain={handleDeploy}
          onReturnLobby={handleExitLobby}
        />
      )}

      {/* Android Mobile Portrait Rotation Hint */}
      {isMobilePortrait && !dismissPortraitHint && (
        <div className="fixed top-14 left-1/2 -translate-x-1/2 z-50 w-[92vw] max-w-md bg-slate-950/95 border border-amber-500/70 rounded-xl px-3.5 py-2.5 flex items-center justify-between gap-3 shadow-2xl">
          <div className="flex items-center gap-2.5 text-xs">
            <Smartphone className="w-5 h-5 text-amber-400 rotate-90 shrink-0" />
            <div>
              <div className="font-black text-white uppercase">Rotate to Landscape</div>
              <div className="text-[11px] text-slate-400">Best experienced in full-screen horizontal mode</div>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              onClick={enterLandscapeFullscreen}
              className="px-2.5 py-1.5 rounded bg-amber-500 text-slate-950 text-[11px] font-black uppercase flex items-center gap-1 cursor-pointer"
            >
              <Maximize2 className="w-3 h-3" /> Lock
            </button>
            <button
              onClick={() => setDismissPortraitHint(true)}
              className="px-2 py-1.5 rounded bg-slate-800 text-slate-300 text-[11px] font-bold cursor-pointer"
            >
              Hide
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
