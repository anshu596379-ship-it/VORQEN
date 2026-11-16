export type GameScreen = 'lobby' | 'loading' | 'playing' | 'paused' | 'results';

export type GameMode = 'solo' | 'duo' | 'squad' | 'training' | 'practice';

export type GraphicsQuality = 'low' | 'medium' | 'high' | 'ultra';

export type TimeOfDay = 'day' | 'sunset' | 'night' | 'storm';

export type MatchPhase = 'plane' | 'parachute' | 'combat';

export type WeaponId = 'vq47' | 'xr9' | 'm240' | 'sg12' | 'arcpistol';

export type EmoteId =
  | 'salute'
  | 'victory_pump'
  | 'groove'
  | 'backflip'
  | 'taunt_wave'
  | 'squat_flex';

export interface EmoteSpec {
  id: EmoteId;
  name: string;
  shortLabel: string;
  duration: number;
  accent: string;
}

export interface WeaponSpec {
  id: WeaponId;
  name: string;
  category: 'Assault' | 'SMG' | 'Marksman' | 'Shotgun' | 'Sidearm';
  damage: number;
  headshotMult: number;
  fireRate: number; // shots per second
  magSize: number;
  reloadTime: number;
  range: number;
  spread: number;
  adsSpread: number;
  pellets: number;
  auto: boolean;
  projectileSpeed: number;
  color: string;
  accentHex: number;
}

export interface WeaponInstance {
  specId: WeaponId;
  ammoInMag: number;
  reserveAmmo: number;
}

export interface OperatorProfile {
  id: string;
  name: string;
  codename: string;
  role: string;
  primaryColor: number;
  secondaryColor: number;
  visorColor: number;
  accentHex: string;
  headgear: 'helmet' | 'hood' | 'visor' | 'beret';
  bonusText: string;
}

export interface OutfitSkin {
  id: string;
  name: string;
  primaryColor: number;
  secondaryColor: number;
  visorColor: number;
  swatch: string;
}

export type LootType = 'weapon' | 'ammo' | 'medkit' | 'shield' | 'armor';

export interface WorldLoot {
  id: string;
  type: LootType;
  weaponId?: WeaponId;
  amount: number;
  armorLevel?: number;
  label: string;
  x: number;
  y: number;
  z: number;
  isSupplyDrop?: boolean;
  picked: boolean;
}

export interface PointOfInterest {
  id: string;
  name: string;
  subtitle: string;
  x: number;
  z: number;
  radius: number;
  color: string;
}

export interface MinimapBlip {
  x: number;
  z: number;
  kind: 'ally' | 'enemy_fire' | 'supply' | 'loot';
}

export interface KillFeedEntry {
  id: number;
  killer: string;
  victim: string;
  weapon: string;
  isPlayerKiller: boolean;
  isPlayerVictim: boolean;
  headshot: boolean;
  timestamp: number;
}

export interface HudSnapshot {
  phase: MatchPhase;
  mode: GameMode;
  matchTime: number;
  aliveCount: number;
  totalCount: number;
  kills: number;
  damageDealt: number;
  headshots: number;
  shotsFired: number;
  shotsHit: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  armorLevel: number;
  stamina: number;
  medkits: number;
  shieldCells: number;
  isSprinting: boolean;
  isCrouching: boolean;
  isGrounded: boolean;
  isAiming: boolean;
  isReloading: boolean;
  reloadProgress: number;
  altitude: number;
  speed: number;
  headingDeg: number;
  playerX: number;
  playerZ: number;
  activeSlot: 0 | 1 | 2;
  weapons: [WeaponInstance | null, WeaponInstance | null, WeaponInstance | null];
  zoneCenterX: number;
  zoneCenterZ: number;
  zoneRadius: number;
  nextZoneCenterX: number;
  nextZoneCenterZ: number;
  nextZoneRadius: number;
  zonePhase: number;
  zoneTimer: number;
  zoneShrinking: boolean;
  outsideZone: boolean;
  nearbyLoot: WorldLoot[];
  minimapBlips: MinimapBlip[];
  killFeed: KillFeedEntry[];
  planeProgress: number;
  planeStartX: number;
  planeStartZ: number;
  planeEndX: number;
  planeEndZ: number;
  planeX: number;
  planeZ: number;
  hitmarkerTimer: number;
  hitmarkerKill: boolean;
  damageIndicatorAngle: number | null;
  damageIndicatorTimer: number;
  bannerText: string | null;
  activeEmote: EmoteId | null;
  allyHpList: { name: string; hp: number; alive: boolean }[];
}

export interface MatchResult {
  victory: boolean;
  rank: number;
  totalPlayers: number;
  kills: number;
  damageDealt: number;
  survivalTime: number;
  accuracy: number;
  headshots: number;
  mode: GameMode;
  eliminatedBy?: string;
}

export interface ControlOffsets {
  joystickScale: number;
  buttonsScale: number;
  fireBtnOffset: { x: number; y: number };
  aimBtnOffset: { x: number; y: number };
  jumpBtnOffset: { x: number; y: number };
  crouchBtnOffset: { x: number; y: number };
  reloadBtnOffset: { x: number; y: number };
}

export interface GameSettings {
  graphics: GraphicsQuality;
  timeOfDay: TimeOfDay;
  sensitivity: number;
  adsSensitivity: number;
  gyroEnabled: boolean;
  invertY: boolean;
  soundEnabled: boolean;
  musicEnabled: boolean;
  autoSprintLock: boolean;
  showLeftFireBtn: boolean;
  controlOffsets: ControlOffsets;
}
