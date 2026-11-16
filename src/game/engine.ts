import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  BOT_NAMES,
  EMOTES,
  ISLAND_POIS,
  OPERATORS,
  OUTFIT_SKINS,
  WEAPONS,
  WORLD_RADIUS,
} from './constants';
import { audioEngine } from './audio';
import {
  CharacterRig,
  buildCharacterModel,
  buildDropPlane,
  buildIslandEnvironment,
  buildWeaponMesh,
} from './models';
import {
  WATER_LEVEL,
  WorldColliders,
  groundHeightAt,
  rayIntersectsBoxes,
  resolveEntityCollisions,
  walkableHeightAt,
} from './terrain';
import { ProceduralTextureSet, createProceduralTextures } from './textures';
import {
  EmoteId,
  GameMode,
  GameSettings,
  GraphicsQuality,
  HudSnapshot,
  KillFeedEntry,
  MatchPhase,
  MatchResult,
  MinimapBlip,
  TimeOfDay,
  WeaponId,
  WeaponInstance,
  WorldLoot,
} from '../types/game';

// Pre-allocated math helpers (zero GC in render loop)
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _camDir = new THREE.Vector3();
const _quat = new THREE.Quaternion();

interface Combatant {
  id: number;
  name: string;
  isPlayer: boolean;
  isAlly: boolean;
  alive: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  yaw: number;
  hp: number;
  maxHp: number;
  shield: number;
  maxShield: number;
  armorLevel: number;
  rig: CharacterRig;
  weaponId: WeaponId;
  fireCooldown: number;
  hitFlashTimer: number;
  walkPhase: number;
  crouching: boolean;
  sprinting: boolean;
  grounded: boolean;
  parachuteOpen: boolean;
  skydiving: boolean;
  dropDelay: number;
  aiTargetX: number;
  aiTargetZ: number;
  aiDecisionTimer: number;
  aiStrafeDir: number;
  lastFiredTimer: number;
  respawnTimer: number;
  activeEmote: EmoteId | null;
  emoteElapsed: number;
  emoteDuration: number;
}

interface TracerBolt {
  mesh: THREE.Mesh;
  x: number;
  y: number;
  z: number;
  dx: number;
  dy: number;
  dz: number;
  speed: number;
  distanceTraveled: number;
  maxDist: number;
  damage: number;
  headshotMult: number;
  ownerId: number;
  active: boolean;
}

interface ParticleBurst {
  mesh: THREE.Mesh;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  active: boolean;
}

export class VorqenEngine {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private isSoftwareGl: boolean;
  private textures: ProceduralTextureSet;

  private sunLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;

  private frameId = 0;
  private disposed = false;
  private lastTime = performance.now();
  private hitstopTimer = 0;
  private cameraShake = 0;

  // Mode state: 'lobby' | 'match'
  private sceneMode: 'lobby' | 'match' = 'lobby';
  private paused = false;

  // Lobby 3D Showcase
  private lobbyGroup = new THREE.Group();
  private lobbyRig: CharacterRig | null = null;
  private lobbyYaw = 0.35;
  private lobbyTargetYaw = 0.35;
  private lobbyAnimTime = 0;

  // Match World
  private matchGroup = new THREE.Group();
  private colliders: WorldColliders = { boxes: [], cylinders: [] };
  private waterMesh: THREE.Mesh | null = null;
  private braziers: THREE.PointLight[] = [];
  private stormCylinder: THREE.Mesh | null = null;
  private weatherPoints: THREE.Points | null = null;
  private dropPlane: THREE.Group | null = null;

  // Match State
  private mode: GameMode = 'solo';
  private phase: MatchPhase = 'plane';
  private matchTime = 0;
  private combatants: Combatant[] = [];
  private player: Combatant | null = null;
  private worldLoot: WorldLoot[] = [];
  private lootMeshes = new Map<string, THREE.Group>();
  private tracers: TracerBolt[] = [];
  private particles: ParticleBurst[] = [];
  private killFeed: KillFeedEntry[] = [];
  private killFeedSeq = 1;

  // Player Inventory & Combat State
  private weapons: [WeaponInstance | null, WeaponInstance | null, WeaponInstance | null] = [
    null,
    null,
    { specId: 'arcpistol', ammoInMag: 15, reserveAmmo: 45 },
  ];
  private activeSlot: 0 | 1 | 2 = 2;
  private medkits = 1;
  private shieldCells = 1;
  private stamina = 100;
  private isReloading = false;
  private reloadTimer = 0;
  private isAiming = false;
  private playerKills = 0;
  private playerDamage = 0;
  private playerHeadshots = 0;
  private shotsFired = 0;
  private shotsHit = 0;
  private hitmarkerTimer = 0;
  private hitmarkerKill = false;
  private damageIndicatorAngle: number | null = null;
  private damageIndicatorTimer = 0;
  private bannerText: string | null = null;
  private bannerTimer = 0;

  // Safe Zone State
  private zoneCenterX = 0;
  private zoneCenterZ = 0;
  private zoneRadius = 390;
  private nextZoneCenterX = 0;
  private nextZoneCenterZ = 0;
  private nextZoneRadius = 240;
  private zonePhase = 1;
  private zoneTimer = 28;
  private zoneShrinking = false;
  private stormTickTimer = 0;

  // Plane Flight Path
  private planeStartX = -320;
  private planeStartZ = 280;
  private planeEndX = 320;
  private planeEndZ = -280;
  private planeProgress = 0;

  // Camera & Input State
  private camYaw = 0;
  private camPitch = 0.22;
  private camCurrentPos = new THREE.Vector3(0, 10, 20);
  private camCurrentLook = new THREE.Vector3(0, 2, 0);
  private currentFov = 64;

  // Input flags
  private keys: Record<string, boolean> = {};
  private joyX = 0;
  private joyY = 0;
  private touchFireHeld = false;
  private stepSoundTimer = 0;
  private hudSyncTimer = 0;
  private matchEnded = false;

  // Settings & Callbacks
  private settings: GameSettings;
  private selectedOpId = 'vortex';
  private selectedSkinId = 'default';
  private onHudUpdate: (hud: HudSnapshot) => void;
  private onMatchEnd: (res: MatchResult) => void;

  // Shared Geometries for Tracers & Particles
  private tracerGeo = new THREE.BoxGeometry(0.08, 0.08, 2.2);
  private tracerMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
  private sparkGeo = new THREE.BoxGeometry(0.14, 0.14, 0.14);

  constructor(
    container: HTMLElement,
    initialSettings: GameSettings,
    onHudUpdate: (hud: HudSnapshot) => void,
    onMatchEnd: (res: MatchResult) => void
  ) {
    this.container = container;
    this.settings = initialSettings;
    this.onHudUpdate = onHudUpdate;
    this.onMatchEnd = onMatchEnd;

    // 1. Software WebGL probe
    this.isSoftwareGl = (() => {
      const gl = document.createElement('canvas').getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    // 2. Renderer
    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.12;
    this.renderer.setSize(container.clientWidth || window.innerWidth, container.clientHeight || window.innerHeight);
    this.applyGraphicsQuality(initialSettings.graphics);

    container.appendChild(this.renderer.domElement);

    // 3. Scene & Camera
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(
      64,
      (container.clientWidth || window.innerWidth) / (container.clientHeight || window.innerHeight),
      0.2,
      1150
    );

    // 4. Studio Environment Reflections
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    // 5. Warm/Cool 3-Point Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(0x93c5fd, 0x334155, 0.75);
    this.scene.add(this.hemiLight);

    this.sunLight = new THREE.DirectionalLight(0xfff4d6, 1.85);
    this.sunLight.position.set(120, 180, 90);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    const d = 110;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 420;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.03;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    this.rimLight = new THREE.DirectionalLight(0x38bdf8, 0.75);
    this.rimLight.position.set(-90, 80, -110);
    this.scene.add(this.rimLight);

    // 6. Procedural Textures
    this.textures = createProceduralTextures(this.renderer);

    // 7. Build Lobby + Match Environment
    this.buildLobbyScene();
    this.scene.add(this.lobbyGroup);
    this.scene.add(this.matchGroup);
    this.matchGroup.visible = false;

    const env = buildIslandEnvironment(this.matchGroup, this.textures, !this.isSoftwareGl);
    this.colliders = env.colliders;
    this.waterMesh = env.waterMesh;
    this.braziers = env.braziers;

    // Storm Barrier Cylinder
    const stormGeo = new THREE.CylinderGeometry(1, 1, 240, 48, 1, true);
    const stormMat = new THREE.MeshBasicMaterial({
      color: 0x3b82f6,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide,
      depthWrite: false,
    });
    this.stormCylinder = new THREE.Mesh(stormGeo, stormMat);
    this.stormCylinder.position.y = 85;
    this.matchGroup.add(this.stormCylinder);

    // Drop Plane
    this.dropPlane = buildDropPlane();
    this.dropPlane.visible = false;
    this.matchGroup.add(this.dropPlane);

    // Weather Particle System (Storm rain / Atmospheric motes)
    this.buildWeatherSystem();

    // Apply initial Time of Day
    this.applyTimeOfDay(initialSettings.timeOfDay);

    // Pre-warm shaders on GPU
    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    // Bind Resize & Keyboard Listeners
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('keydown', this.handleKeyDown);
    window.addEventListener('keyup', this.handleKeyUp);
    window.addEventListener('blur', this.handleBlur);

    this.startLoop();
  }

  public getSatelliteMapCanvas(): HTMLCanvasElement {
    return this.textures.satelliteMapCanvas;
  }

  private buildLobbyScene() {
    this.lobbyGroup.clear();

    // Tactical Hangar Pedestal (Multi-part)
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.8 });
    const trimMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      roughness: 0.25,
      metalness: 0.75,
      emissive: 0xf59e0b,
      emissiveIntensity: 0.35,
    });
    const floorMat = new THREE.MeshStandardMaterial({ color: 0x161e2e, roughness: 0.75, metalness: 0.3 });

    const floor = new THREE.Mesh(new THREE.CircleGeometry(28, 36), floorMat);
    floor.rotation.x = -Math.PI / 2;
    floor.receiveShadow = !this.isSoftwareGl;
    this.lobbyGroup.add(floor);

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(1.65, 1.95, 0.26, 24), baseMat);
    plinth.position.y = 0.13;
    plinth.receiveShadow = !this.isSoftwareGl;
    this.lobbyGroup.add(plinth);

    const holoRing = new THREE.Mesh(new THREE.TorusGeometry(1.85, 0.04, 8, 48), trimMat);
    holoRing.rotation.x = Math.PI / 2;
    holoRing.position.y = 0.26;
    this.lobbyGroup.add(holoRing);

    // Hangar Backdrop Pillars
    const pillarMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.55, metalness: 0.65 });
    for (let i = 0; i < 6; i++) {
      const ang = (i / 6) * Math.PI * 2 + 0.4;
      const px = Math.cos(ang) * 9.5;
      const pz = Math.sin(ang) * 9.5;
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.9, 8.5, 1.4), pillarMat);
      p.position.set(px, 4.25, pz);
      p.lookAt(0, 4.25, 0);
      this.lobbyGroup.add(p);
    }

    this.refreshLobbyCharacter();
  }

  public setSelectedCharacter(operatorId: string, skinId: string) {
    this.selectedOpId = operatorId;
    this.selectedSkinId = skinId;
    this.refreshLobbyCharacter();
  }

  private refreshLobbyCharacter() {
    if (this.lobbyRig) {
      this.lobbyGroup.remove(this.lobbyRig.root);
    }
    const op = OPERATORS.find((o) => o.id === this.selectedOpId) || OPERATORS[0];
    const skin = OUTFIT_SKINS.find((s) => s.id === this.selectedSkinId) || OUTFIT_SKINS[0];
    const rig = buildCharacterModel(op, skin);
    rig.root.position.set(0, 0.26, 0);
    rig.weaponMount.add(buildWeaponMesh('vq47'));
    rig.rightArm.rotation.x = -0.75;
    rig.leftArm.rotation.x = -0.35;
    rig.leftArm.rotation.z = -0.15;
    this.lobbyGroup.add(rig.root);
    this.lobbyRig = rig;
  }

  public rotateLobbyCharacter(deltaX: number) {
    this.lobbyTargetYaw += deltaX * 0.01;
  }

  private buildWeatherSystem() {
    const count = 750;
    const pos = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      pos[i * 3] = (Math.random() - 0.5) * 140;
      pos[i * 3 + 1] = Math.random() * 48;
      pos[i * 3 + 2] = (Math.random() - 0.5) * 140;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xcbd5e1,
      size: 0.24,
      transparent: true,
      opacity: 0.55,
    });
    this.weatherPoints = new THREE.Points(geo, mat);
    this.weatherPoints.visible = false;
    this.matchGroup.add(this.weatherPoints);
  }

  public updateSettings(newSettings: GameSettings) {
    const prevGraphics = this.settings.graphics;
    const prevTime = this.settings.timeOfDay;
    this.settings = newSettings;
    audioEngine.setConfig(newSettings.soundEnabled, newSettings.musicEnabled);
    if (prevGraphics !== newSettings.graphics) {
      this.applyGraphicsQuality(newSettings.graphics);
    }
    if (prevTime !== newSettings.timeOfDay) {
      this.applyTimeOfDay(newSettings.timeOfDay);
    }
  }

  private applyGraphicsQuality(q: GraphicsQuality) {
    if (this.isSoftwareGl) {
      this.renderer.setPixelRatio(1);
      this.renderer.shadowMap.enabled = false;
      return;
    }
    const dpr = window.devicePixelRatio || 1;
    if (q === 'low') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.0));
      this.renderer.shadowMap.enabled = false;
    } else if (q === 'medium') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.25));
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(512, 512);
    } else if (q === 'high') {
      this.renderer.setPixelRatio(Math.min(dpr, 1.65));
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(1024, 1024);
    } else {
      this.renderer.setPixelRatio(Math.min(dpr, 2.0));
      this.renderer.shadowMap.enabled = true;
      this.sunLight.shadow.mapSize.set(2048, 2048);
    }
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.renderer.shadowMap.needsUpdate = true;
  }

  private applyTimeOfDay(tod: TimeOfDay) {
    if (tod === 'day') {
      this.scene.background = new THREE.Color(0x6fb1e8);
      this.scene.fog = new THREE.FogExp2(0x7cb7e8, 0.0021);
      this.sunLight.color.setHex(0xfff5dc);
      this.sunLight.intensity = 1.95;
      this.sunLight.position.set(140, 190, 95);
      this.hemiLight.color.setHex(0xbae6fd);
      this.hemiLight.groundColor.setHex(0x3f4d36);
      this.hemiLight.intensity = 0.8;
      if (this.weatherPoints) this.weatherPoints.visible = false;
    } else if (tod === 'sunset') {
      this.scene.background = new THREE.Color(0xd97757);
      this.scene.fog = new THREE.FogExp2(0xc46b54, 0.0026);
      this.sunLight.color.setHex(0xff9e5e);
      this.sunLight.intensity = 1.7;
      this.sunLight.position.set(-180, 75, 110);
      this.hemiLight.color.setHex(0xfdba74);
      this.hemiLight.groundColor.setHex(0x272030);
      this.hemiLight.intensity = 0.68;
      if (this.weatherPoints) this.weatherPoints.visible = false;
    } else if (tod === 'night') {
      this.scene.background = new THREE.Color(0x090f1d);
      this.scene.fog = new THREE.FogExp2(0x0b1224, 0.0036);
      this.sunLight.color.setHex(0x93c5fd);
      this.sunLight.intensity = 0.85;
      this.sunLight.position.set(-100, 160, -120);
      this.hemiLight.color.setHex(0x334155);
      this.hemiLight.groundColor.setHex(0x0f172a);
      this.hemiLight.intensity = 0.65;
      if (this.weatherPoints) this.weatherPoints.visible = false;
    } else {
      // Storm
      this.scene.background = new THREE.Color(0x1f2937);
      this.scene.fog = new THREE.FogExp2(0x263142, 0.0042);
      this.sunLight.color.setHex(0x94a3b8);
      this.sunLight.intensity = 1.05;
      this.sunLight.position.set(90, 140, 60);
      this.hemiLight.color.setHex(0x64748b);
      this.hemiLight.groundColor.setHex(0x1e293b);
      this.hemiLight.intensity = 0.72;
      if (this.weatherPoints) this.weatherPoints.visible = true;
    }
    this.braziers.forEach((b) => {
      b.intensity = tod === 'night' || tod === 'storm' ? 32 : 14;
    });
  }

  public enterLobby() {
    this.sceneMode = 'lobby';
    this.paused = false;
    this.lobbyGroup.visible = true;
    this.matchGroup.visible = false;
    this.cleanupMatchActors();
    this.scene.background = new THREE.Color(0x090d16);
    this.scene.fog = new THREE.FogExp2(0x090d16, 0.025);
    this.sunLight.intensity = 1.65;
    this.sunLight.position.set(4, 7, 5);
    this.sunLight.target.position.set(0, 1.2, 0);
    audioEngine.startLobbyMusic();
  }

  public setPaused(p: boolean) {
    this.paused = p;
    if (p) this.keys = {};
  }

  private cleanupMatchActors() {
    for (const c of this.combatants) {
      this.matchGroup.remove(c.rig.root);
    }
    this.combatants = [];
    this.player = null;

    this.lootMeshes.forEach((m) => this.matchGroup.remove(m));
    this.lootMeshes.clear();
    this.worldLoot = [];

    this.tracers.forEach((t) => this.matchGroup.remove(t.mesh));
    this.tracers = [];

    this.particles.forEach((p) => this.matchGroup.remove(p.mesh));
    this.particles = [];
  }

  public startMatch(mode: GameMode) {
    this.cleanupMatchActors();
    this.mode = mode;
    this.sceneMode = 'match';
    this.paused = false;
    this.matchEnded = false;
    this.lobbyGroup.visible = false;
    this.matchGroup.visible = true;
    this.applyTimeOfDay(this.settings.timeOfDay);
    audioEngine.stopLobbyMusic();

    this.matchTime = 0;
    this.playerKills = 0;
    this.playerDamage = 0;
    this.playerHeadshots = 0;
    this.shotsFired = 0;
    this.shotsHit = 0;
    this.killFeed = [];
    this.isReloading = false;
    this.reloadTimer = 0;
    this.isAiming = false;
    this.stamina = 100;
    this.medkits = mode === 'training' ? 5 : 1;
    this.shieldCells = mode === 'training' ? 5 : 1;

    // Reset Safe Zone
    this.zoneCenterX = (Math.random() - 0.5) * 60;
    this.zoneCenterZ = (Math.random() - 0.5) * 60;
    this.zoneRadius = 390;
    this.nextZoneCenterX = this.zoneCenterX + (Math.random() - 0.5) * 90;
    this.nextZoneCenterZ = this.zoneCenterZ + (Math.random() - 0.5) * 90;
    this.nextZoneRadius = 230;
    this.zonePhase = 1;
    this.zoneTimer = 32;
    this.zoneShrinking = false;

    // Spawn Loot across all POIs + random island spots
    this.spawnInitialLoot();

    // Setup Flight Path
    const angle = Math.random() * Math.PI * 2;
    this.planeStartX = Math.cos(angle) * -350;
    this.planeStartZ = Math.sin(angle) * -350;
    this.planeEndX = Math.cos(angle) * 350;
    this.planeEndZ = Math.sin(angle) * 350;
    this.planeProgress = 0.08;

    const totalCombatants = mode === 'training' ? 12 : mode === 'practice' ? 18 : 50;
    const allyCount = mode === 'duo' ? 1 : mode === 'squad' ? 3 : 0;

    // Create Player
    const op = OPERATORS.find((o) => o.id === this.selectedOpId) || OPERATORS[0];
    const skin = OUTFIT_SKINS.find((s) => s.id === this.selectedSkinId) || OUTFIT_SKINS[0];
    const playerRig = buildCharacterModel(op, skin);
    this.matchGroup.add(playerRig.root);

    const startWeapon: WeaponId = mode === 'training' ? 'vq47' : 'arcpistol';
    this.weapons = [
      mode === 'training' ? { specId: 'vq47', ammoInMag: 30, reserveAmmo: 180 } : null,
      mode === 'training' ? { specId: 'm240', ammoInMag: 8, reserveAmmo: 48 } : null,
      { specId: 'arcpistol', ammoInMag: 15, reserveAmmo: 45 },
    ];
    this.activeSlot = mode === 'training' ? 0 : 2;
    this.attachWeaponToRig(playerRig, startWeapon);

    const spawnX = mode === 'training' ? 0 : this.planeStartX;
    const spawnZ = mode === 'training' ? 170 : this.planeStartZ;
    const spawnY = mode === 'training' ? walkableHeightAt(spawnX, spawnZ) : 145;

    const playerObj: Combatant = {
      id: 0,
      name: 'YOU',
      isPlayer: true,
      isAlly: true,
      alive: true,
      x: spawnX,
      y: spawnY,
      z: spawnZ,
      vx: 0,
      vy: 0,
      vz: 0,
      yaw: Math.atan2(this.planeEndX - this.planeStartX, this.planeEndZ - this.planeStartZ),
      hp: 100,
      maxHp: 100,
      shield: mode === 'training' ? 100 : 25,
      maxShield: 100,
      armorLevel: mode === 'training' ? 2 : 0,
      rig: playerRig,
      weaponId: startWeapon,
      fireCooldown: 0,
      hitFlashTimer: 0,
      walkPhase: 0,
      crouching: false,
      sprinting: false,
      grounded: mode === 'training',
      parachuteOpen: false,
      skydiving: false,
      dropDelay: 0,
      aiTargetX: 0,
      aiTargetZ: 0,
      aiDecisionTimer: 0,
      aiStrafeDir: 1,
      lastFiredTimer: 0,
      respawnTimer: 0,
      activeEmote: null,
      emoteElapsed: 0,
      emoteDuration: 0,
    };
    this.player = playerObj;
    this.combatants.push(playerObj);
    this.camYaw = playerObj.yaw;
    this.camPitch = 0.25;

    // Create AI Bots + Allies
    const botWeapons: WeaponId[] = ['vq47', 'xr9', 'sg12', 'm240', 'arcpistol'];
    for (let i = 1; i < totalCombatants; i++) {
      const isAlly = i <= allyCount;
      const botOp = OPERATORS[i % OPERATORS.length];
      const botSkin = isAlly ? skin : OUTFIT_SKINS[(i % (OUTFIT_SKINS.length - 1)) + 1];
      const rig = buildCharacterModel(botOp, botSkin, { isBot: true, isAlly });
      this.matchGroup.add(rig.root);

      const wId = botWeapons[i % botWeapons.length];
      this.attachWeaponToRig(rig, wId);

      // Pick target POI for bot
      const poi = ISLAND_POIS[i % ISLAND_POIS.length];
      const angleP = Math.random() * Math.PI * 2;
      const radP = 12 + Math.random() * (poi.radius * 0.85);
      const bx = mode === 'training' ? (Math.random() - 0.5) * 55 : poi.x + Math.cos(angleP) * radP;
      const bz = mode === 'training' ? 130 + (Math.random() - 0.5) * 35 : poi.z + Math.sin(angleP) * radP;
      const by = mode === 'training' ? walkableHeightAt(bx, bz) : 145;

      this.combatants.push({
        id: i,
        name: isAlly ? `ALLY-${botOp.name}` : BOT_NAMES[i % BOT_NAMES.length],
        isPlayer: false,
        isAlly,
        alive: true,
        x: bx,
        y: by,
        z: bz,
        vx: 0,
        vy: 0,
        vz: 0,
        yaw: Math.random() * Math.PI * 2,
        hp: 100,
        maxHp: 100,
        shield: mode === 'training' ? 50 : 25,
        maxShield: 100,
        armorLevel: 1,
        rig,
        weaponId: wId,
        fireCooldown: 0.4 + Math.random() * 0.8,
        hitFlashTimer: 0,
        walkPhase: Math.random() * 6,
        crouching: false,
        sprinting: false,
        grounded: mode === 'training',
        parachuteOpen: false,
        skydiving: false,
        dropDelay: mode === 'training' ? 0 : 1 + Math.random() * 8,
        aiTargetX: bx,
        aiTargetZ: bz,
        aiDecisionTimer: 1 + Math.random() * 2,
        aiStrafeDir: Math.random() > 0.5 ? 1 : -1,
        lastFiredTimer: 0,
        respawnTimer: 0,
        activeEmote: null,
        emoteElapsed: 0,
        emoteDuration: 0,
      });
    }

    if (mode === 'training') {
      this.phase = 'combat';
      if (this.dropPlane) this.dropPlane.visible = false;
      this.showBanner('TRAINING GROUND — TEST ALL WEAPONS');
    } else {
      this.phase = 'plane';
      playerObj.rig.root.visible = false;
      if (this.dropPlane) this.dropPlane.visible = true;
      this.showBanner('INBOUND TO VORQEN ISLAND — READY TO DROP');
    }

    this.syncHud();
  }

  private attachWeaponToRig(rig: CharacterRig, weaponId: WeaponId) {
    while (rig.weaponMount.children.length > 1) {
      const child = rig.weaponMount.children[rig.weaponMount.children.length - 1];
      if (child !== rig.muzzlePoint) {
        rig.weaponMount.remove(child);
      } else {
        break;
      }
    }
    const wMesh = buildWeaponMesh(weaponId);
    rig.weaponMount.add(wMesh);
  }

  private spawnInitialLoot() {
    const weaponPool: WeaponId[] = ['vq47', 'xr9', 'm240', 'sg12'];
    let lootId = 1;

    // High-density POI loot
    ISLAND_POIS.forEach((poi) => {
      const count = 11;
      for (let i = 0; i < count; i++) {
        const ang = (i / count) * Math.PI * 2 + Math.random() * 0.5;
        const r = 6 + Math.random() * (poi.radius * 0.72);
        const lx = poi.x + Math.cos(ang) * r;
        const lz = poi.z + Math.sin(ang) * r;
        const ly = walkableHeightAt(lx, lz);
        if (ly < 0.6) continue;

        const roll = Math.random();
        if (roll < 0.45) {
          const wId = weaponPool[Math.floor(Math.random() * weaponPool.length)];
          this.addWorldLoot({
            id: `loot_${lootId++}`,
            type: 'weapon',
            weaponId: wId,
            amount: WEAPONS[wId].magSize * 2,
            label: WEAPONS[wId].name,
            x: lx,
            y: ly,
            z: lz,
            picked: false,
          });
        } else if (roll < 0.65) {
          this.addWorldLoot({
            id: `loot_${lootId++}`,
            type: 'medkit',
            amount: 1,
            label: 'Tactical Medkit',
            x: lx,
            y: ly,
            z: lz,
            picked: false,
          });
        } else if (roll < 0.85) {
          this.addWorldLoot({
            id: `loot_${lootId++}`,
            type: 'shield',
            amount: 1,
            label: 'Energy Shield Cell',
            x: lx,
            y: ly,
            z: lz,
            picked: false,
          });
        } else {
          const lv = Math.random() > 0.65 ? 3 : 2;
          this.addWorldLoot({
            id: `loot_${lootId++}`,
            type: 'armor',
            amount: lv * 35,
            armorLevel: lv,
            label: `Apex Armor Lv.${lv}`,
            x: lx,
            y: ly,
            z: lz,
            picked: false,
          });
        }
      }
    });

    // Special Training Range Weapons right in front of spawn (0, 160)
    if (this.mode === 'training') {
      weaponPool.forEach((wId, idx) => {
        const lx = -6 + idx * 4;
        const lz = 163;
        this.addWorldLoot({
          id: `loot_${lootId++}`,
          type: 'weapon',
          weaponId: wId,
          amount: 120,
          label: WEAPONS[wId].name,
          x: lx,
          y: walkableHeightAt(lx, lz),
          z: lz,
          picked: false,
        });
      });
    }
  }

  private addWorldLoot(item: WorldLoot) {
    this.worldLoot.push(item);
    const group = new THREE.Group();
    group.position.set(item.x, item.y + 0.35, item.z);

    let color = 0xf59e0b;
    if (item.type === 'medkit') color = 0x22c55e;
    else if (item.type === 'shield') color = 0x38bdf8;
    else if (item.type === 'armor') color = 0xa855f7;
    else if (item.weaponId) color = WEAPONS[item.weaponId].accentHex;

    if (item.isSupplyDrop) {
      const crate = new THREE.Mesh(
        new THREE.BoxGeometry(1.5, 1.3, 1.5),
        new THREE.MeshStandardMaterial({ map: this.textures.crateHazard, roughness: 0.4, metalness: 0.5 })
      );
      crate.position.y = 0.3;
      const beacon = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 26, 8),
        new THREE.MeshBasicMaterial({ color: 0xef4444, transparent: true, opacity: 0.35 })
      );
      beacon.position.y = 13;
      group.add(crate, beacon);
    } else {
      const core = new THREE.Mesh(
        item.type === 'weapon'
          ? new THREE.BoxGeometry(0.75, 0.24, 0.22)
          : new THREE.OctahedronGeometry(0.32, 0),
        new THREE.MeshStandardMaterial({
          color,
          emissive: color,
          emissiveIntensity: 0.55,
          roughness: 0.25,
          metalness: 0.7,
        })
      );
      const ring = new THREE.Mesh(
        new THREE.RingGeometry(0.45, 0.56, 16),
        new THREE.MeshBasicMaterial({ color, side: THREE.DoubleSide, transparent: true, opacity: 0.65 })
      );
      ring.rotation.x = -Math.PI / 2;
      ring.position.y = -0.3;
      group.add(core, ring);
    }

    this.matchGroup.add(group);
    this.lootMeshes.set(item.id, group);
  }

  private spawnSupplyDrop() {
    const ang = Math.random() * Math.PI * 2;
    const r = Math.random() * Math.max(30, this.zoneRadius * 0.55);
    const sx = this.zoneCenterX + Math.cos(ang) * r;
    const sz = this.zoneCenterZ + Math.sin(ang) * r;
    const sy = groundHeightAt(sx, sz);
    if (sy < 0.8) return;
    this.addWorldLoot({
      id: `drop_${Date.now()}_${Math.random()}`,
      type: 'weapon',
      weaponId: Math.random() > 0.4 ? 'm240' : 'vq47',
      amount: 120,
      label: 'SUPPLY CRATE (APEX)',
      x: sx,
      y: sy,
      z: sz,
      isSupplyDrop: true,
      picked: false,
    });
    this.showBanner('AIRDROP SUPPLY CRATE DEPLOYED IN SAFE ZONE');
  }

  public dropFromPlane() {
    if (this.phase !== 'plane' || !this.player) return;
    this.phase = 'parachute';
    this.player.rig.root.visible = true;
    this.player.skydiving = true;
    this.player.parachuteOpen = false;
    this.player.vy = -12;
    audioEngine.playParachuteOpen();
    this.showBanner('FREEFALL — STEER TOWARD TARGET ZONE');
  }

  public deployParachuteEarly() {
    if (this.phase !== 'parachute' || !this.player) return;
    if (!this.player.parachuteOpen) {
      this.player.parachuteOpen = true;
      this.player.rig.parachuteGroup.visible = true;
      audioEngine.playParachuteOpen();
    }
  }

  // Controls API for Touch + Desktop UI
  public setJoystickVector(x: number, y: number) {
    this.joyX = Math.max(-1, Math.min(1, x));
    this.joyY = Math.max(-1, Math.min(1, y));
  }

  public addCameraLookDelta(dx: number, dy: number) {
    const sens = (this.isAiming ? this.settings.adsSensitivity : this.settings.sensitivity) * 0.0042;
    const ySign = this.settings.invertY ? -1 : 1;
    this.camYaw -= dx * sens;
    this.camPitch = Math.max(-0.55, Math.min(1.05, this.camPitch + dy * sens * ySign));
  }

  public setTouchFire(held: boolean) {
    this.touchFireHeld = held;
    if (held && this.player && this.phase === 'combat') {
      const w = this.weapons[this.activeSlot];
      if (w && !WEAPONS[w.specId].auto) {
        this.tryFirePlayer();
      }
    }
  }

  public toggleAim() {
    if (this.phase === 'combat') {
      this.isAiming = !this.isAiming;
      audioEngine.playUiClick(880);
    }
  }

  public setAim(aiming: boolean) {
    this.isAiming = aiming;
  }

  public triggerJump() {
    if (this.phase === 'plane') {
      this.dropFromPlane();
      return;
    }
    if (this.phase === 'parachute') {
      this.deployParachuteEarly();
      return;
    }
    if (this.player && this.player.alive && this.player.grounded) {
      this.player.activeEmote = null;
      this.player.vy = 9.2;
      this.player.grounded = false;
      this.player.crouching = false;
      audioEngine.playUiClick(440);
    }
  }

  public playEmote(emoteId: EmoteId) {
    if (!this.player || !this.player.alive || this.phase !== 'combat' || !this.player.grounded) return;
    const spec = EMOTES.find((e) => e.id === emoteId);
    if (!spec) return;
    this.isAiming = false;
    this.player.crouching = false;
    this.player.sprinting = false;
    this.player.activeEmote = emoteId;
    this.player.emoteElapsed = 0;
    this.player.emoteDuration = spec.duration;
    audioEngine.playEmote(emoteId);
    this.showBanner(`EMOTE: ${spec.name.toUpperCase()}`);
    this.syncHud();
  }

  public toggleCrouch() {
    if (this.player && this.phase === 'combat') {
      this.player.activeEmote = null;
      this.player.crouching = !this.player.crouching;
      audioEngine.playUiClick(520);
    }
  }

  public toggleSprint() {
    if (this.player && this.phase === 'combat') {
      this.player.activeEmote = null;
      this.player.sprinting = !this.player.sprinting;
      if (this.player.sprinting) this.player.crouching = false;
    }
  }

  public triggerReload() {
    if (!this.player || !this.player.alive || this.phase !== 'combat' || this.isReloading) return;
    const w = this.weapons[this.activeSlot];
    if (!w) return;
    const spec = WEAPONS[w.specId];
    if (w.ammoInMag >= spec.magSize || w.reserveAmmo <= 0) return;
    this.isReloading = true;
    this.reloadTimer = spec.reloadTime;
    audioEngine.playReload();
  }

  public switchWeaponSlot(slot: 0 | 1 | 2) {
    if (!this.player || !this.weapons[slot]) return;
    this.activeSlot = slot;
    this.isReloading = false;
    this.reloadTimer = 0;
    const w = this.weapons[slot]!;
    this.player.weaponId = w.specId;
    this.attachWeaponToRig(this.player.rig, w.specId);
    audioEngine.playUiClick(640);
  }

  public useMedkit() {
    if (!this.player || !this.player.alive || this.medkits <= 0 || this.player.hp >= 100) return;
    this.medkits--;
    this.player.hp = Math.min(100, this.player.hp + 55);
    audioEngine.playPickup();
    this.showBanner('+55 HP RESTORED');
  }

  public useShieldCell() {
    if (!this.player || !this.player.alive || this.shieldCells <= 0 || this.player.shield >= 100) return;
    this.shieldCells--;
    this.player.shield = Math.min(100, this.player.shield + 45);
    audioEngine.playPickup();
    this.showBanner('+45 ENERGY SHIELD');
  }

  public pickupLootById(lootId: string) {
    if (!this.player || !this.player.alive) return;
    const item = this.worldLoot.find((l) => l.id === lootId && !l.picked);
    if (!item) return;

    item.picked = true;
    const mesh = this.lootMeshes.get(item.id);
    if (mesh) {
      this.matchGroup.remove(mesh);
      this.lootMeshes.delete(item.id);
    }

    if (item.type === 'medkit') {
      this.medkits += item.amount;
    } else if (item.type === 'shield') {
      this.shieldCells += item.amount;
    } else if (item.type === 'armor') {
      const lv = item.armorLevel || 1;
      if (lv >= this.player.armorLevel) {
        this.player.armorLevel = lv;
        this.player.shield = Math.min(100, Math.max(this.player.shield, lv * 33));
      }
    } else if (item.type === 'weapon' && item.weaponId) {
      const spec = WEAPONS[item.weaponId];
      const newWep: WeaponInstance = {
        specId: item.weaponId,
        ammoInMag: spec.magSize,
        reserveAmmo: item.amount,
      };
      // Put in empty primary/secondary or replace current primary slot
      if (!this.weapons[0]) {
        this.weapons[0] = newWep;
        this.switchWeaponSlot(0);
      } else if (!this.weapons[1]) {
        this.weapons[1] = newWep;
        this.switchWeaponSlot(1);
      } else {
        const targetSlot = this.activeSlot === 2 ? 0 : this.activeSlot;
        this.weapons[targetSlot] = newWep;
        this.switchWeaponSlot(targetSlot);
      }
      if (item.isSupplyDrop) {
        this.medkits += 2;
        this.shieldCells += 2;
        this.player.armorLevel = 3;
        this.player.shield = 100;
      }
    }
    audioEngine.playPickup();
    this.showBanner(`EQUIPPED ${item.label.toUpperCase()}`);
  }

  public pickupNearestLoot() {
    if (!this.player) return;
    let best: WorldLoot | null = null;
    let bestD = 4.2;
    for (const l of this.worldLoot) {
      if (l.picked) continue;
      const d = Math.hypot(l.x - this.player.x, l.z - this.player.z);
      if (d < bestD) {
        bestD = d;
        best = l;
      }
    }
    if (best) this.pickupLootById(best.id);
  }

  private showBanner(text: string) {
    this.bannerText = text;
    this.bannerTimer = 2.6;
  }

  private handleResize = () => {
    const w = this.container.clientWidth || window.innerWidth;
    const h = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
  };

  private handleKeyDown = (e: KeyboardEvent) => {
    this.keys[e.code] = true;
    if (this.sceneMode !== 'match' || this.paused) return;

    if (e.code === 'Space') {
      e.preventDefault();
      this.triggerJump();
    } else if (e.code === 'KeyC') {
      this.toggleCrouch();
    } else if (e.code === 'KeyR') {
      this.triggerReload();
    } else if (e.code === 'KeyF' || e.code === 'KeyE') {
      this.pickupNearestLoot();
    } else if (e.code === 'Digit1') {
      this.switchWeaponSlot(0);
    } else if (e.code === 'Digit2') {
      this.switchWeaponSlot(1);
    } else if (e.code === 'Digit3') {
      this.switchWeaponSlot(2);
    } else if (e.code === 'KeyQ') {
      this.useMedkit();
    } else if (e.code === 'KeyV') {
      this.useShieldCell();
    }
  };

  private handleKeyUp = (e: KeyboardEvent) => {
    this.keys[e.code] = false;
  };

  private handleBlur = () => {
    this.keys = {};
    this.touchFireHeld = false;
  };

  private startLoop() {
    const tick = () => {
      if (this.disposed) return;
      const now = performance.now();
      const rawDt = (now - this.lastTime) / 1000;
      this.lastTime = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      if (this.sceneMode === 'lobby') {
        this.updateLobby(dt);
      } else if (!this.paused) {
        if (this.hitstopTimer > 0) {
          this.hitstopTimer -= dt;
        } else {
          this.updateMatch(dt);
        }
      }

      this.renderer.render(this.scene, this.camera);

      if (this.isSoftwareGl) {
        this.afterDraw(tick);
      } else {
        this.frameId = requestAnimationFrame(tick);
      }
    };

    if (this.isSoftwareGl) {
      this.afterDraw(tick);
    } else {
      this.frameId = requestAnimationFrame(tick);
    }
  }

  private afterDraw(cb: () => void) {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private updateLobby(dt: number) {
    this.lobbyAnimTime += dt;
    this.lobbyYaw = THREE.MathUtils.damp(this.lobbyYaw, this.lobbyTargetYaw, 8, dt);

    if (this.lobbyRig) {
      this.lobbyRig.root.rotation.y = this.lobbyYaw;
      this.lobbyRig.torso.position.y = 0.1 + Math.sin(this.lobbyAnimTime * 2.1) * 0.014;
      this.lobbyRig.headGroup.rotation.y = Math.sin(this.lobbyAnimTime * 0.9) * 0.14;
    }

    // Smooth cinematic framing leaving center-bottom clear for dock
    this.camera.fov = THREE.MathUtils.damp(this.camera.fov, 46, 6, dt);
    this.camera.updateProjectionMatrix();
    this.camera.position.set(0, 1.72, 4.35);
    this.camera.lookAt(0, 1.12, 0);
  }

  private updateMatch(dt: number) {
    this.matchTime += dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerText = null;
    }
    if (this.hitmarkerTimer > 0) this.hitmarkerTimer -= dt;
    if (this.damageIndicatorTimer > 0) this.damageIndicatorTimer -= dt;
    this.cameraShake = Math.max(0, this.cameraShake - dt * 2.8);

    // Animate water & weather
    if (this.waterMesh) {
      this.textures.waterRipple.offset.x = (this.matchTime * 0.025) % 1;
      this.textures.waterRipple.offset.y = (this.matchTime * 0.018) % 1;
    }
    if (this.weatherPoints && this.weatherPoints.visible && this.player) {
      const posAttr = this.weatherPoints.geometry.attributes.position as THREE.BufferAttribute;
      for (let i = 0; i < posAttr.count; i++) {
        let y = posAttr.getY(i) - dt * 32;
        if (y < 0) y = 46;
        posAttr.setY(i, y);
      }
      posAttr.needsUpdate = true;
      this.weatherPoints.position.set(this.player.x, 0, this.player.z);
    }

    // Rotate loot items gently
    this.lootMeshes.forEach((m, id) => {
      if (!id.startsWith('drop_')) {
        m.rotation.y += dt * 1.8;
      }
    });

    // 1. Update Plane Phase
    if (this.phase === 'plane' || this.planeProgress < 1.15) {
      this.planeProgress += dt * 0.042;
      const px = THREE.MathUtils.lerp(this.planeStartX, this.planeEndX, this.planeProgress);
      const pz = THREE.MathUtils.lerp(this.planeStartZ, this.planeEndZ, this.planeProgress);
      if (this.dropPlane) {
        this.dropPlane.position.set(px, 145, pz);
        this.dropPlane.lookAt(this.planeEndX, 145, this.planeEndZ);
        if (this.planeProgress > 1.05) this.dropPlane.visible = false;
      }
      if (this.phase === 'plane' && this.player) {
        this.player.x = px;
        this.player.y = 145;
        this.player.z = pz;
        if (this.planeProgress >= 0.92) {
          this.dropFromPlane();
        }
      }
    }

    // 2. Safe Zone Shrink Simulation
    if (this.mode !== 'training' && this.phase === 'combat') {
      this.zoneTimer -= dt;
      if (this.zoneTimer <= 0) {
        if (!this.zoneShrinking) {
          this.zoneShrinking = true;
          this.zoneTimer = 26;
          this.showBanner(`STORM ZONE PHASE ${this.zonePhase} CLOSING`);
          if (this.zonePhase <= 3) this.spawnSupplyDrop();
        } else {
          this.zoneShrinking = false;
          this.zonePhase++;
          this.zoneTimer = 24;
          this.nextZoneRadius = Math.max(18, this.zoneRadius * 0.52);
          const ang = Math.random() * Math.PI * 2;
          const shift = Math.max(0, this.zoneRadius - this.nextZoneRadius) * 0.4;
          this.nextZoneCenterX = this.zoneCenterX + Math.cos(ang) * shift;
          this.nextZoneCenterZ = this.zoneCenterZ + Math.sin(ang) * shift;
        }
      }
      if (this.zoneShrinking) {
        const shrinkSpeed = 1 / 26;
        this.zoneRadius = THREE.MathUtils.lerp(this.zoneRadius, this.nextZoneRadius, dt * shrinkSpeed * 2.2);
        this.zoneCenterX = THREE.MathUtils.lerp(this.zoneCenterX, this.nextZoneCenterX, dt * shrinkSpeed * 2.2);
        this.zoneCenterZ = THREE.MathUtils.lerp(this.zoneCenterZ, this.nextZoneCenterZ, dt * shrinkSpeed * 2.2);
      }
    }
    if (this.stormCylinder) {
      this.stormCylinder.position.x = this.zoneCenterX;
      this.stormCylinder.position.z = this.zoneCenterZ;
      this.stormCylinder.scale.set(this.zoneRadius, 1, this.zoneRadius);
    }

    // 3. Update Player
    if (this.player && this.player.alive) {
      this.updatePlayer(dt);
    }

    // 4. Update AI Combatants
    for (let i = 1; i < this.combatants.length; i++) {
      this.updateBot(this.combatants[i], dt);
    }

    // 5. Storm Damage Tick (every 1s)
    this.stormTickTimer += dt;
    if (this.stormTickTimer >= 1.0 && this.mode !== 'training') {
      this.stormTickTimer = 0;
      const stormDmg = 2 + this.zonePhase * 2;
      for (const c of this.combatants) {
        if (!c.alive || c.skydiving || this.phase === 'plane') continue;
        const d = Math.hypot(c.x - this.zoneCenterX, c.z - this.zoneCenterZ);
        if (d > this.zoneRadius) {
          this.applyDamage(c, stormDmg, false, -1, 'STORM ZONE');
        }
      }
    }

    // 6. Update Tracers & Particles
    this.updateTracers(dt);
    this.updateParticles(dt);

    // 7. Update Third-Person Camera
    this.updateMatchCamera(dt);

    // 8. Check Victory / Defeat Conditions
    this.checkMatchStatus();

    // 9. Throttled React HUD Snapshot (~18Hz)
    this.hudSyncTimer += dt;
    if (this.hudSyncTimer >= 0.055) {
      this.hudSyncTimer = 0;
      this.syncHud();
    }
  }

  private updatePlayer(dt: number) {
    const p = this.player!;
    if (p.fireCooldown > 0) p.fireCooldown -= dt;
    if (p.lastFiredTimer > 0) p.lastFiredTimer -= dt;
    if (p.hitFlashTimer > 0) {
      p.hitFlashTimer -= dt;
      p.rig.hitFlashMaterials.forEach((m) => m.emissive.setHex(p.hitFlashTimer > 0 ? 0xff2222 : 0x000000));
    }

    if (this.phase === 'plane') return;

    // Input direction from Keyboard + Touch Joystick
    let moveRight = (this.keys['KeyD'] || this.keys['ArrowRight'] ? 1 : 0) - (this.keys['KeyA'] || this.keys['ArrowLeft'] ? 1 : 0);
    let moveFwd = (this.keys['KeyW'] || this.keys['ArrowUp'] ? 1 : 0) - (this.keys['KeyS'] || this.keys['ArrowDown'] ? 1 : 0);
    moveRight += this.joyX;
    moveFwd += this.joyY;
    const inputMag = Math.hypot(moveRight, moveFwd);
    if (inputMag > 1) {
      moveRight /= inputMag;
      moveFwd /= inputMag;
    }

    const fwdX = -Math.sin(this.camYaw);
    const fwdZ = -Math.cos(this.camYaw);
    const rightX = Math.cos(this.camYaw);
    const rightZ = -Math.sin(this.camYaw);

    const worldMoveX = fwdX * moveFwd + rightX * moveRight;
    const worldMoveZ = fwdZ * moveFwd + rightZ * moveRight;

    // Parachute / Skydiving physics
    if (this.phase === 'parachute') {
      const groundY = walkableHeightAt(p.x, p.z);
      const agl = p.y - groundY;

      if (!p.parachuteOpen && agl < 52) {
        p.parachuteOpen = true;
        p.rig.parachuteGroup.visible = true;
        audioEngine.playParachuteOpen();
      }

      const fallSpeed = p.parachuteOpen ? -13.5 : -34;
      const glideSpeed = p.parachuteOpen ? 24 : 18;
      p.vy = THREE.MathUtils.damp(p.vy, fallSpeed, 5, dt);
      p.x += (worldMoveX * glideSpeed + fwdX * (p.parachuteOpen ? 8 : 4)) * dt;
      p.z += (worldMoveZ * glideSpeed + fwdZ * (p.parachuteOpen ? 8 : 4)) * dt;
      p.y += p.vy * dt;
      p.yaw = this.camYaw + Math.PI;

      if (p.y <= groundY + 0.1) {
        p.y = groundY;
        p.vy = 0;
        p.grounded = true;
        p.skydiving = false;
        p.parachuteOpen = false;
        p.rig.parachuteGroup.visible = false;
        this.phase = 'combat';
        this.showBanner('TOUCHDOWN — LOOT WEAPONS & ELIMINATE RIVALS');
      }
      this.animateRig(p, dt, inputMag);
      return;
    }

    // Combat Movement
    const shiftHeld = !!this.keys['ShiftLeft'] || !!this.keys['ShiftRight'] || p.sprinting;
    const wantsSprint = shiftHeld && inputMag > 0.25 && !p.crouching && !this.isAiming && this.stamina > 5;
    if (wantsSprint) {
      this.stamina = Math.max(0, this.stamina - dt * 18);
    } else {
      this.stamina = Math.min(100, this.stamina + dt * 14);
    }

    const groundY = walkableHeightAt(p.x, p.z);
    const inWater = groundY < WATER_LEVEL - 0.35 && p.y <= WATER_LEVEL + 0.3;
    const baseSpeed = p.crouching ? 4.4 : wantsSprint ? 11.4 : this.isAiming ? 5.2 : 7.8;
    const moveSpeed = inWater ? baseSpeed * 0.62 : baseSpeed;

    p.x += worldMoveX * moveSpeed * dt;
    p.z += worldMoveZ * moveSpeed * dt;

    // World bounds clamp
    const r = Math.hypot(p.x, p.z);
    if (r > WORLD_RADIUS + 20) {
      p.x *= (WORLD_RADIUS + 20) / r;
      p.z *= (WORLD_RADIUS + 20) / r;
    }

    // Gravity & Grounding
    p.vy -= 24 * dt;
    p.y += p.vy * dt;
    const newGroundY = Math.max(WATER_LEVEL - 0.65, walkableHeightAt(p.x, p.z));
    if (p.y <= newGroundY) {
      p.y = newGroundY;
      p.vy = 0;
      p.grounded = true;
    } else if (p.y > newGroundY + 0.35) {
      p.grounded = false;
    }

    resolveEntityCollisions(p, 0.48, p.crouching ? 1.25 : 1.75, this.colliders);

    // Cancel active emote if player moves or fires; otherwise advance emote timer
    if (p.activeEmote) {
      if (inputMag > 0.2 || this.touchFireHeld || this.keys['Mouse0'] || this.isAiming) {
        p.activeEmote = null;
      } else {
        p.emoteElapsed += dt;
        if (p.emoteElapsed >= p.emoteDuration) {
          p.activeEmote = null;
        }
      }
    }

    // Character faces camera front during emote so player sees the animation, or faces look dir otherwise
    p.yaw = p.activeEmote ? this.camYaw : this.camYaw + Math.PI;

    // Footstep Audio
    if (p.grounded && inputMag > 0.2) {
      this.stepSoundTimer -= dt;
      if (this.stepSoundTimer <= 0) {
        this.stepSoundTimer = wantsSprint ? 0.27 : 0.39;
        audioEngine.playFootstep(inWater, wantsSprint);
      }
    }

    // Reload Progress
    if (this.isReloading) {
      this.reloadTimer -= dt;
      if (this.reloadTimer <= 0) {
        this.completeReload();
      }
    }

    // Auto-pickup ammo/meds nearby
    for (const item of this.worldLoot) {
      if (item.picked || item.type === 'weapon' || item.isSupplyDrop) continue;
      if (Math.hypot(item.x - p.x, item.z - p.z) < 2.1) {
        this.pickupLootById(item.id);
      }
    }

    // Continuous Fire (Auto weapons)
    const activeWep = this.weapons[this.activeSlot];
    if (activeWep && WEAPONS[activeWep.specId].auto && (this.touchFireHeld || this.keys['Mouse0'])) {
      this.tryFirePlayer();
    }

    this.animateRig(p, dt, inputMag);
  }

  private completeReload() {
    this.isReloading = false;
    const w = this.weapons[this.activeSlot];
    if (!w) return;
    const spec = WEAPONS[w.specId];
    const needed = spec.magSize - w.ammoInMag;
    const transfer = Math.min(needed, w.reserveAmmo);
    w.ammoInMag += transfer;
    w.reserveAmmo -= transfer;
  }

  public tryFirePlayer() {
    if (!this.player || !this.player.alive || this.phase !== 'combat' || this.paused) return;
    this.player.activeEmote = null;
    if (this.isReloading || this.player.fireCooldown > 0) return;

    const w = this.weapons[this.activeSlot];
    if (!w) return;
    const spec = WEAPONS[w.specId];

    if (w.ammoInMag <= 0) {
      this.triggerReload();
      return;
    }

    w.ammoInMag--;
    this.shotsFired++;
    this.player.fireCooldown = 1 / spec.fireRate;
    this.player.lastFiredTimer = 0.6;
    this.cameraShake = Math.min(0.45, this.cameraShake + (spec.id === 'm240' ? 0.24 : 0.08));
    this.camPitch = Math.min(1.05, this.camPitch - (spec.id === 'm240' ? 0.025 : 0.006));
    audioEngine.playWeaponFire(spec.id, 1);

    // Determine exact aim point from camera center ray
    _camDir.set(0, 0, -1).applyQuaternion(this.camera.quaternion).normalize();
    const camOrigin = this.camera.position;
    const targetPoint = _v1.copy(camOrigin).addScaledVector(_camDir, 180);

    // Check closer raycast hit against terrain/boxes/enemies for parallax-free aiming
    let closestT = 180;
    const boxT = rayIntersectsBoxes(camOrigin.x, camOrigin.y, camOrigin.z, _camDir.x, _camDir.y, _camDir.z, 180, this.colliders);
    if (boxT !== null) closestT = boxT;

    for (const c of this.combatants) {
      if (!c.alive || c.id === 0 || c.isAlly) continue;
      // Simple sphere/cylinder test along cam ray
      const ex = c.x - camOrigin.x;
      const ey = (c.y + 1.15) - camOrigin.y;
      const ez = c.z - camOrigin.z;
      const proj = ex * _camDir.x + ey * _camDir.y + ez * _camDir.z;
      if (proj > 2 && proj < closestT) {
        const perpSq = ex * ex + ey * ey + ez * ez - proj * proj;
        if (perpSq < 0.72) {
          closestT = proj;
        }
      }
    }
    targetPoint.copy(camOrigin).addScaledVector(_camDir, closestT);

    // Muzzle origin in world space
    const muzzlePos = _v2;
    this.player.rig.muzzlePoint.getWorldPosition(muzzlePos);
    const shootDir = _v3.subVectors(targetPoint, muzzlePos).normalize();

    const spread = this.isAiming ? spec.adsSpread : spec.spread;
    for (let i = 0; i < spec.pellets; i++) {
      const sx = shootDir.x + (Math.random() - 0.5) * spread;
      const sy = shootDir.y + (Math.random() - 0.5) * spread;
      const sz = shootDir.z + (Math.random() - 0.5) * spread;
      const len = Math.hypot(sx, sy, sz) || 1;
      this.spawnTracer(
        muzzlePos.x,
        muzzlePos.y,
        muzzlePos.z,
        sx / len,
        sy / len,
        sz / len,
        spec.projectileSpeed,
        spec.range,
        spec.damage,
        spec.headshotMult,
        0
      );
    }

    // Muzzle flash particle
    this.spawnParticles(muzzlePos.x, muzzlePos.y, muzzlePos.z, 0xfef08a, 3, 0.14);

    if (w.ammoInMag === 0 && w.reserveAmmo > 0) {
      this.triggerReload();
    }
  }

  private updateBot(bot: Combatant, dt: number) {
    if (!bot.alive) {
      if (this.mode === 'training') {
        bot.respawnTimer -= dt;
        if (bot.respawnTimer <= 0) {
          bot.alive = true;
          bot.hp = 100;
          bot.shield = 50;
          bot.rig.root.visible = true;
          bot.x = (Math.random() - 0.5) * 55;
          bot.z = 125 + (Math.random() - 0.5) * 35;
          bot.y = walkableHeightAt(bot.x, bot.z);
        }
      }
      return;
    }

    if (bot.fireCooldown > 0) bot.fireCooldown -= dt;
    if (bot.lastFiredTimer > 0) bot.lastFiredTimer -= dt;
    if (bot.hitFlashTimer > 0) {
      bot.hitFlashTimer -= dt;
      bot.rig.hitFlashMaterials.forEach((m) => m.emissive.setHex(bot.hitFlashTimer > 0 ? 0xff2222 : 0x000000));
    }

    // Bot parachute drop
    if (bot.dropDelay > 0) {
      bot.dropDelay -= dt;
      bot.rig.root.visible = false;
      return;
    }
    bot.rig.root.visible = true;
    const gY = Math.max(WATER_LEVEL - 0.4, walkableHeightAt(bot.x, bot.z));

    if (!bot.grounded && bot.y > gY + 0.5) {
      bot.skydiving = true;
      bot.parachuteOpen = bot.y - gY < 50;
      bot.rig.parachuteGroup.visible = bot.parachuteOpen;
      bot.y -= (bot.parachuteOpen ? 14 : 32) * dt;
      if (bot.y <= gY) {
        bot.y = gY;
        bot.grounded = true;
        bot.skydiving = false;
        bot.parachuteOpen = false;
        bot.rig.parachuteGroup.visible = false;
      }
      this.animateRig(bot, dt, 0.2);
      return;
    }

    // Find nearest enemy target
    let nearestEnemy: Combatant | null = null;
    let nearestDist = 92;
    for (let i = 0; i < this.combatants.length; i++) {
      const other = this.combatants[i];
      if (!other.alive || other.id === bot.id || other.skydiving) continue;
      if (bot.isAlly && other.isAlly) continue;
      if (!bot.isAlly && !other.isAlly && other.id !== 0 && this.mode === 'training') continue;
      const d = Math.hypot(other.x - bot.x, other.z - bot.z);
      if (d < nearestDist) {
        nearestDist = d;
        nearestEnemy = other;
      }
    }

    let moveMag = 0;
    if (nearestEnemy && this.mode !== 'training') {
      // Face target and strafe/engage
      const dx = nearestEnemy.x - bot.x;
      const dz = nearestEnemy.z - bot.z;
      bot.yaw = Math.atan2(dx, dz);

      if (nearestDist > 26) {
        const s = 5.8 * dt;
        bot.x += (dx / nearestDist) * s;
        bot.z += (dz / nearestDist) * s;
        moveMag = 0.85;
      } else {
        // Strafe
        const perpX = -dz / nearestDist;
        const perpZ = dx / nearestDist;
        bot.x += perpX * bot.aiStrafeDir * 3.8 * dt;
        bot.z += perpZ * bot.aiStrafeDir * 3.8 * dt;
        moveMag = 0.55;
      }

      // Fire at target
      if (bot.fireCooldown <= 0 && nearestDist < 85) {
        const spec = WEAPONS[bot.weaponId];
        bot.fireCooldown = (1 / spec.fireRate) * (2.6 + Math.random() * 2.2);
        bot.lastFiredTimer = 0.7;

        const aimSpread = 0.085;
        const aimY = (nearestEnemy.y + 1.15) - (bot.y + 1.3);
        const len = Math.hypot(dx, aimY, dz) || 1;
        this.spawnTracer(
          bot.x,
          bot.y + 1.32,
          bot.z,
          dx / len + (Math.random() - 0.5) * aimSpread,
          aimY / len + (Math.random() - 0.5) * aimSpread,
          dz / len + (Math.random() - 0.5) * aimSpread,
          spec.projectileSpeed * 0.78,
          spec.range,
          Math.round(spec.damage * 0.52),
          1.35,
          bot.id
        );

        if (this.player && Math.hypot(bot.x - this.player.x, bot.z - this.player.z) < 95) {
          const distScale = 1 - Math.hypot(bot.x - this.player.x, bot.z - this.player.z) / 95;
          audioEngine.playWeaponFire(bot.weaponId, distScale * 0.55);
        }
      }
    } else {
      // Roam toward safe zone or ally follow
      bot.aiDecisionTimer -= dt;
      if (bot.aiDecisionTimer <= 0) {
        bot.aiDecisionTimer = 3 + Math.random() * 4;
        bot.aiStrafeDir = Math.random() > 0.5 ? 1 : -1;
        if (bot.isAlly && this.player && this.player.alive) {
          bot.aiTargetX = this.player.x + (Math.random() - 0.5) * 16;
          bot.aiTargetZ = this.player.z + (Math.random() - 0.5) * 16;
        } else {
          const ang = Math.random() * Math.PI * 2;
          const rad = Math.random() * Math.min(this.zoneRadius * 0.8, 220);
          bot.aiTargetX = this.zoneCenterX + Math.cos(ang) * rad;
          bot.aiTargetZ = this.zoneCenterZ + Math.sin(ang) * rad;
        }
      }

      const dx = bot.aiTargetX - bot.x;
      const dz = bot.aiTargetZ - bot.z;
      const d = Math.hypot(dx, dz);
      if (d > 4 && this.mode !== 'training') {
        bot.yaw = Math.atan2(dx, dz);
        bot.x += (dx / d) * 5.6 * dt;
        bot.z += (dz / d) * 5.6 * dt;
        moveMag = 0.75;
      }
    }

    bot.y = Math.max(WATER_LEVEL - 0.5, walkableHeightAt(bot.x, bot.z));
    resolveEntityCollisions(bot, 0.45, 1.75, this.colliders);
    this.animateRig(bot, dt, moveMag);
  }

  private animateRig(c: Combatant, dt: number, moveMag: number) {
    const rig = c.rig;
    rig.root.position.set(c.x, c.y, c.z);
    rig.root.rotation.y = c.yaw;

    // Ground contact shadow alignment
    const gY = walkableHeightAt(c.x, c.z);
    rig.contactShadow.position.y = Math.max(0.03, gY - c.y + 0.03);
    rig.contactShadow.visible = c.y - gY < 8;

    if (c.skydiving) {
      rig.hips.position.y = 0.92;
      rig.torso.rotation.x = c.parachuteOpen ? 0.1 : 0.75;
      rig.leftLeg.rotation.x = 0.25;
      rig.rightLeg.rotation.x = -0.2;
      rig.leftArm.rotation.x = c.parachuteOpen ? -2.4 : -1.2;
      rig.rightArm.rotation.x = c.parachuteOpen ? -2.4 : -1.2;
      return;
    }

    // Crouch vs Stand
    const targetHipY = c.crouching ? 0.62 : 0.92;
    rig.hips.position.y = THREE.MathUtils.damp(rig.hips.position.y, targetHipY, 14, dt);
    rig.torso.rotation.x = c.crouching ? 0.28 : 0.05;

    if (!c.grounded) {
      rig.leftLeg.rotation.x = 0.45;
      rig.rightLeg.rotation.x = -0.35;
      rig.leftArm.rotation.x = -0.7;
      rig.rightArm.rotation.x = -1.2;
      return;
    }

    // Reset emote transforms cleanly when not emoting
    if (!c.activeEmote) {
      rig.hips.rotation.set(0, 0, 0);
      rig.torso.rotation.y = 0;
      rig.torso.rotation.z = 0;
      rig.headGroup.rotation.set(0, 0, 0);
      rig.leftArm.rotation.z = 0;
      rig.rightArm.rotation.z = 0;
      rig.leftLeg.rotation.z = 0;
      rig.rightLeg.rotation.z = 0;
    } else {
      const t = c.emoteElapsed;
      const pNorm = Math.min(1, t / Math.max(0.1, c.emoteDuration));
      rig.hips.rotation.set(0, 0, 0);
      rig.torso.rotation.set(0, 0, 0);
      rig.headGroup.rotation.set(0, 0, 0);
      rig.leftArm.rotation.set(0, 0, 0);
      rig.rightArm.rotation.set(0, 0, 0);
      rig.leftLeg.rotation.set(0, 0, 0);
      rig.rightLeg.rotation.set(0, 0, 0);

      if (c.activeEmote === 'salute') {
        rig.hips.position.y = 0.92;
        rig.rightArm.rotation.x = -2.35;
        rig.rightArm.rotation.z = 0.35;
        rig.leftArm.rotation.x = 0.08;
        rig.headGroup.rotation.x = -0.06;
      } else if (c.activeEmote === 'victory_pump') {
        const hop = Math.abs(Math.sin(t * 7.5)) * 0.28;
        rig.hips.position.y = 0.92 + hop;
        const pump = Math.sin(t * 10) * 0.45;
        rig.leftArm.rotation.x = -2.55 + pump;
        rig.rightArm.rotation.x = -2.55 - pump;
        rig.leftArm.rotation.z = -0.35;
        rig.rightArm.rotation.z = 0.35;
        rig.leftLeg.rotation.x = hop * 0.8;
        rig.rightLeg.rotation.x = -hop * 0.8;
      } else if (c.activeEmote === 'groove') {
        const beat = Math.sin(t * 8);
        rig.hips.position.y = 0.88 + Math.abs(beat) * 0.08;
        rig.hips.rotation.z = beat * 0.14;
        rig.torso.rotation.y = Math.sin(t * 4) * 0.25;
        rig.torso.rotation.z = -beat * 0.1;
        rig.leftArm.rotation.x = -1.2 + Math.sin(t * 8) * 0.7;
        rig.rightArm.rotation.x = -1.2 - Math.sin(t * 8) * 0.7;
        rig.leftArm.rotation.z = -0.45;
        rig.rightArm.rotation.z = 0.45;
        rig.leftLeg.rotation.x = Math.sin(t * 4) * 0.22;
        rig.rightLeg.rotation.x = -Math.sin(t * 4) * 0.22;
        rig.headGroup.rotation.z = beat * 0.15;
      } else if (c.activeEmote === 'backflip') {
        const arc = Math.sin(pNorm * Math.PI);
        rig.hips.position.y = 0.92 + arc * 1.45;
        rig.hips.rotation.x = -pNorm * Math.PI * 2;
        rig.leftLeg.rotation.x = arc * 1.1;
        rig.rightLeg.rotation.x = arc * 1.1;
        rig.leftArm.rotation.x = -2.1;
        rig.rightArm.rotation.x = -2.1;
      } else if (c.activeEmote === 'taunt_wave') {
        rig.hips.position.y = 0.92;
        rig.leftArm.rotation.x = -2.75;
        rig.leftArm.rotation.z = -0.35 + Math.sin(t * 11) * 0.42;
        rig.rightArm.rotation.x = -0.35;
        rig.torso.rotation.z = 0.08;
        rig.headGroup.rotation.y = Math.sin(t * 5) * 0.22;
      } else if (c.activeEmote === 'squat_flex') {
        const sq = (1 - Math.cos(t * 5.2)) * 0.5;
        rig.hips.position.y = 0.92 - sq * 0.26;
        rig.leftLeg.rotation.x = -sq * 0.55;
        rig.rightLeg.rotation.x = -sq * 0.55;
        rig.leftLeg.rotation.z = -0.18;
        rig.rightLeg.rotation.z = 0.18;
        rig.leftArm.rotation.x = -1.55;
        rig.rightArm.rotation.x = -1.55;
        rig.leftArm.rotation.z = -0.85;
        rig.rightArm.rotation.z = 0.85;
        rig.headGroup.rotation.x = sq * 0.18;
      }
      return;
    }

    if (moveMag > 0.1) {
      const speedMult = c.sprinting ? 14 : 9.5;
      c.walkPhase += dt * speedMult;
      const swing = Math.sin(c.walkPhase) * (c.sprinting ? 0.78 : 0.52);
      rig.leftLeg.rotation.x = swing;
      rig.rightLeg.rotation.x = -swing;
      rig.leftArm.rotation.x = -swing * 0.6 - 0.35;
      rig.rightArm.rotation.x = -1.28 + Math.cos(c.walkPhase) * 0.08;
    } else {
      rig.leftLeg.rotation.x = THREE.MathUtils.damp(rig.leftLeg.rotation.x, 0, 12, dt);
      rig.rightLeg.rotation.x = THREE.MathUtils.damp(rig.rightLeg.rotation.x, 0, 12, dt);
      rig.leftArm.rotation.x = THREE.MathUtils.damp(rig.leftArm.rotation.x, -0.45, 12, dt);
      rig.rightArm.rotation.x = THREE.MathUtils.damp(rig.rightArm.rotation.x, -1.35, 12, dt);
    }
  }

  private spawnTracer(
    x: number,
    y: number,
    z: number,
    dx: number,
    dy: number,
    dz: number,
    speed: number,
    maxDist: number,
    damage: number,
    headshotMult: number,
    ownerId: number
  ) {
    let bolt = this.tracers.find((t) => !t.active);
    if (!bolt) {
      const mesh = new THREE.Mesh(this.tracerGeo, this.tracerMat);
      this.matchGroup.add(mesh);
      bolt = {
        mesh,
        x: 0,
        y: 0,
        z: 0,
        dx: 0,
        dy: 0,
        dz: 1,
        speed: 200,
        distanceTraveled: 0,
        maxDist: 200,
        damage: 20,
        headshotMult: 1.5,
        ownerId: 0,
        active: false,
      };
      this.tracers.push(bolt);
    }

    bolt.x = x;
    bolt.y = y;
    bolt.z = z;
    bolt.dx = dx;
    bolt.dy = dy;
    bolt.dz = dz;
    bolt.speed = speed;
    bolt.distanceTraveled = 0;
    bolt.maxDist = maxDist;
    bolt.damage = damage;
    bolt.headshotMult = headshotMult;
    bolt.ownerId = ownerId;
    bolt.active = true;
    bolt.mesh.visible = true;
    bolt.mesh.position.set(x, y, z);
    _v1.set(x + dx, y + dy, z + dz);
    bolt.mesh.lookAt(_v1);
  }

  private updateTracers(dt: number) {
    for (let i = 0; i < this.tracers.length; i++) {
      const b = this.tracers[i];
      if (!b.active) continue;

      const step = b.speed * dt;
      const nx = b.x + b.dx * step;
      const ny = b.y + b.dy * step;
      const nz = b.z + b.dz * step;

      // 1. Check wall/building collision
      const boxHit = rayIntersectsBoxes(b.x, b.y, b.z, b.dx, b.dy, b.dz, step, this.colliders);
      if (boxHit !== null) {
        this.spawnParticles(b.x + b.dx * boxHit, b.y + b.dy * boxHit, b.z + b.dz * boxHit, 0xfbbf24, 4, 0.25);
        b.active = false;
        b.mesh.visible = false;
        continue;
      }

      // 2. Check terrain collision
      const terrH = groundHeightAt(nx, nz);
      if (ny <= terrH) {
        this.spawnParticles(nx, terrH + 0.1, nz, 0xa8a29e, 3, 0.22);
        b.active = false;
        b.mesh.visible = false;
        continue;
      }

      // 3. Check combatant hit
      let hitCombatant: Combatant | null = null;
      let isHeadshot = false;
      for (let j = 0; j < this.combatants.length; j++) {
        const c = this.combatants[j];
        if (!c.alive || c.id === b.ownerId || c.skydiving) continue;
        // Skip friendly fire
        const owner = this.combatants[b.ownerId];
        if (owner && owner.isAlly && c.isAlly) continue;

        const cHeight = c.crouching ? 1.25 : 1.78;
        if (ny < c.y - 0.1 || ny > c.y + cHeight + 0.18) continue;

        // Closest point on segment to combatant center XZ
        const distXZ = Math.hypot(nx - c.x, nz - c.z);
        if (distXZ < 0.62) {
          hitCombatant = c;
          isHeadshot = ny > c.y + cHeight - 0.34;
          break;
        }
      }

      if (hitCombatant) {
        const dmg = Math.round(b.damage * (isHeadshot ? b.headshotMult : 1));
        const attackerName = this.combatants[b.ownerId]?.name || 'RIVAL';
        const wepName = WEAPONS[this.combatants[b.ownerId]?.weaponId || 'vq47'].name;
        this.applyDamage(hitCombatant, dmg, isHeadshot, b.ownerId, wepName, attackerName);
        this.spawnParticles(nx, ny, nz, isHeadshot ? 0xfacc15 : 0xef4444, 6, 0.32);
        b.active = false;
        b.mesh.visible = false;
        continue;
      }

      b.x = nx;
      b.y = ny;
      b.z = nz;
      b.distanceTraveled += step;
      b.mesh.position.set(nx, ny, nz);

      if (b.distanceTraveled >= b.maxDist) {
        b.active = false;
        b.mesh.visible = false;
      }
    }
  }

  private applyDamage(
    victim: Combatant,
    amount: number,
    headshot: boolean,
    attackerId: number,
    weaponName: string,
    attackerName?: string
  ) {
    if (!victim.alive) return;
    victim.hitFlashTimer = 0.12;

    // Armor mitigation
    const dmgScale = victim.armorLevel === 3 ? 0.72 : victim.armorLevel === 2 ? 0.82 : victim.armorLevel === 1 ? 0.9 : 1;
    let remaining = Math.max(1, Math.round(amount * dmgScale));

    if (victim.shield > 0) {
      const absorbed = Math.min(victim.shield, remaining);
      victim.shield -= absorbed;
      remaining -= absorbed;
    }
    victim.hp = Math.max(0, victim.hp - remaining);

    if (attackerId === 0) {
      this.shotsHit++;
      this.playerDamage += amount;
      if (headshot) this.playerHeadshots++;
      this.hitmarkerTimer = 0.18;
      this.hitmarkerKill = victim.hp <= 0;
      audioEngine.playHitmarker(headshot, victim.hp <= 0);
      if (victim.hp <= 0) {
        this.hitstopTimer = 0.045;
      }
    }

    if (victim.isPlayer && attackerId >= 0) {
      const attacker = this.combatants[attackerId];
      if (attacker) {
        const ang = Math.atan2(attacker.x - victim.x, attacker.z - victim.z) - this.camYaw;
        this.damageIndicatorAngle = ang;
        this.damageIndicatorTimer = 0.9;
      }
      this.cameraShake = Math.min(0.42, this.cameraShake + 0.16);
    }

    if (victim.hp <= 0) {
      victim.alive = false;
      victim.rig.root.visible = false;
      victim.respawnTimer = 4.0;
      this.spawnParticles(victim.x, victim.y + 1, victim.z, 0xf97316, 12, 0.55);

      if (attackerId === 0) {
        this.playerKills++;
        this.showBanner(`ELIMINATED ${victim.name} ${headshot ? '(HEADSHOT)' : ''}`);
      }

      // Drop loot box on death
      if (this.mode !== 'training') {
        this.addWorldLoot({
          id: `death_${victim.id}_${Date.now()}`,
          type: 'medkit',
          amount: 1,
          label: `${victim.name} Crate (Medkit)`,
          x: victim.x,
          y: walkableHeightAt(victim.x, victim.z),
          z: victim.z,
          picked: false,
        });
      }

      this.killFeed.unshift({
        id: this.killFeedSeq++,
        killer: attackerName || (attackerId === 0 ? 'YOU' : 'STORM'),
        victim: victim.name,
        weapon: weaponName,
        isPlayerKiller: attackerId === 0,
        isPlayerVictim: victim.isPlayer,
        headshot,
        timestamp: this.matchTime,
      });
      if (this.killFeed.length > 4) this.killFeed.length = 4;
    }
  }

  private spawnParticles(x: number, y: number, z: number, colorHex: number, count: number, life: number) {
    for (let i = 0; i < count; i++) {
      let p = this.particles.find((pt) => !pt.active);
      if (!p) {
        if (this.particles.length >= 90) break;
        const mat = new THREE.MeshBasicMaterial({ color: colorHex });
        const mesh = new THREE.Mesh(this.sparkGeo, mat);
        this.matchGroup.add(mesh);
        p = { mesh, vx: 0, vy: 0, vz: 0, life: 0, maxLife: life, active: false };
        this.particles.push(p);
      }
      (p.mesh.material as THREE.MeshBasicMaterial).color.setHex(colorHex);
      p.mesh.position.set(x, y, z);
      p.mesh.scale.setScalar(1);
      p.mesh.visible = true;
      p.vx = (Math.random() - 0.5) * 9;
      p.vy = Math.random() * 6 + 1.5;
      p.vz = (Math.random() - 0.5) * 9;
      p.life = life;
      p.maxLife = life;
      p.active = true;
    }
  }

  private updateParticles(dt: number) {
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }
      p.vy -= 14 * dt;
      p.mesh.position.x += p.vx * dt;
      p.mesh.position.y += p.vy * dt;
      p.mesh.position.z += p.vz * dt;
      p.mesh.scale.setScalar(Math.max(0.1, p.life / p.maxLife));
    }
  }

  private updateMatchCamera(dt: number) {
    if (!this.player) return;
    const p = this.player;

    if (this.phase === 'plane') {
      const px = p.x;
      const pz = p.z;
      const targetPos = _v1.set(
        px + Math.sin(this.camYaw) * 28,
        154 + Math.sin(this.camPitch) * 14,
        pz + Math.cos(this.camYaw) * 28
      );
      this.camCurrentPos.lerp(targetPos, 1 - Math.exp(-8 * dt));
      this.camCurrentLook.set(px, 145, pz);
      this.camera.position.copy(this.camCurrentPos);
      this.camera.lookAt(this.camCurrentLook);
      return;
    }

    const isParachuting = this.phase === 'parachute';
    const isEmoting = !!p.activeEmote;
    const dist = isParachuting ? 9.5 : isEmoting ? 4.8 : this.isAiming ? 2.6 : 4.6;
    const heightOffset = isParachuting ? 2.6 : isEmoting ? 1.28 : p.crouching ? 1.25 : 1.68;
    const shoulderOffset = isParachuting || isEmoting ? 0 : this.isAiming ? 0.62 : 0.72;

    const targetFov = isParachuting ? 74 : this.isAiming ? 42 : p.sprinting ? 69 : 63;
    this.currentFov = THREE.MathUtils.damp(this.currentFov, targetFov, 12, dt);
    if (Math.abs(this.camera.fov - this.currentFov) > 0.05) {
      this.camera.fov = this.currentFov;
      this.camera.updateProjectionMatrix();
    }

    // Over-the-shoulder offset
    const sinY = Math.sin(this.camYaw);
    const cosY = Math.cos(this.camYaw);
    const cosP = Math.cos(this.camPitch);
    const sinP = Math.sin(this.camPitch);

    const lookX = p.x + cosY * shoulderOffset;
    const lookY = p.y + heightOffset;
    const lookZ = p.z - sinY * shoulderOffset;

    let camX = lookX + sinY * dist * cosP;
    let camY = lookY + dist * sinP;
    let camZ = lookZ + cosY * dist * cosP;

    // Prevent camera from clipping below terrain
    const camGround = walkableHeightAt(camX, camZ) + 0.55;
    if (camY < camGround) camY = camGround;

    // Camera shake
    if (this.cameraShake > 0.001) {
      camX += (Math.random() - 0.5) * this.cameraShake * 0.5;
      camY += (Math.random() - 0.5) * this.cameraShake * 0.5;
    }

    const dampFactor = 1 - Math.exp(-22 * dt);
    this.camCurrentPos.lerp(_v1.set(camX, camY, camZ), dampFactor);
    this.camCurrentLook.set(lookX - sinY * 14, lookY - sinP * 14, lookZ - cosY * 14);

    this.camera.position.copy(this.camCurrentPos);
    this.camera.lookAt(this.camCurrentLook);

    // Move directional shadow frustum to follow player smoothly
    this.sunLight.position.set(p.x + 110, p.y + 165, p.z + 85);
    this.sunLight.target.position.set(p.x, p.y, p.z);
  }

  private checkMatchStatus() {
    if (this.matchEnded || this.mode === 'training' || !this.player) return;

    const aliveEnemies = this.combatants.filter((c) => c.alive && !c.isAlly).length;
    const aliveAll = this.combatants.filter((c) => c.alive).length;

    if (!this.player.alive) {
      this.matchEnded = true;
      const acc = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
      this.onMatchEnd({
        victory: false,
        rank: aliveAll + 1,
        totalPlayers: this.combatants.length,
        kills: this.playerKills,
        damageDealt: this.playerDamage,
        survivalTime: this.matchTime,
        accuracy: acc,
        headshots: this.playerHeadshots,
        mode: this.mode,
      });
    } else if (aliveEnemies === 0) {
      this.matchEnded = true;
      audioEngine.playVictoryFanfare();
      const acc = this.shotsFired > 0 ? Math.round((this.shotsHit / this.shotsFired) * 100) : 0;
      this.onMatchEnd({
        victory: true,
        rank: 1,
        totalPlayers: this.combatants.length,
        kills: this.playerKills,
        damageDealt: this.playerDamage,
        survivalTime: this.matchTime,
        accuracy: acc,
        headshots: this.playerHeadshots,
        mode: this.mode,
      });
    }
  }

  public syncHud() {
    if (!this.player) return;
    const p = this.player;
    const aliveList = this.combatants.filter((c) => c.alive);
    const nearbyLoot: WorldLoot[] = [];
    const blips: MinimapBlip[] = [];

    for (const l of this.worldLoot) {
      if (l.picked) continue;
      const d = Math.hypot(l.x - p.x, l.z - p.z);
      if (d < 4.5 && (l.type === 'weapon' || l.isSupplyDrop || nearbyLoot.length < 3)) {
        nearbyLoot.push(l);
      }
      if (l.isSupplyDrop) {
        blips.push({ x: l.x, z: l.z, kind: 'supply' });
      }
    }

    const allies: { name: string; hp: number; alive: boolean }[] = [];
    for (const c of this.combatants) {
      if (c.id === 0) continue;
      if (c.isAlly) {
        allies.push({ name: c.name, hp: c.hp, alive: c.alive });
        if (c.alive) blips.push({ x: c.x, z: c.z, kind: 'ally' });
      } else if (c.alive && c.lastFiredTimer > 0) {
        blips.push({ x: c.x, z: c.z, kind: 'enemy_fire' });
      }
    }

    const headingRad = (-this.camYaw % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
    const headingDeg = Math.round((headingRad * 180) / Math.PI) % 360;
    const groundY = walkableHeightAt(p.x, p.z);

    this.onHudUpdate({
      phase: this.phase,
      mode: this.mode,
      matchTime: this.matchTime,
      aliveCount: aliveList.length,
      totalCount: this.combatants.length,
      kills: this.playerKills,
      damageDealt: this.playerDamage,
      headshots: this.playerHeadshots,
      shotsFired: this.shotsFired,
      shotsHit: this.shotsHit,
      hp: p.hp,
      maxHp: p.maxHp,
      shield: p.shield,
      maxShield: p.maxShield,
      armorLevel: p.armorLevel,
      stamina: this.stamina,
      medkits: this.medkits,
      shieldCells: this.shieldCells,
      isSprinting: p.sprinting,
      isCrouching: p.crouching,
      isGrounded: p.grounded,
      isAiming: this.isAiming,
      isReloading: this.isReloading,
      reloadProgress: this.isReloading && this.weapons[this.activeSlot]
        ? 1 - this.reloadTimer / WEAPONS[this.weapons[this.activeSlot]!.specId].reloadTime
        : 0,
      altitude: Math.max(0, Math.round(p.y - groundY)),
      speed: Math.round(Math.hypot(p.vx, p.vz)),
      headingDeg,
      playerX: p.x,
      playerZ: p.z,
      activeSlot: this.activeSlot,
      weapons: [
        this.weapons[0] ? { ...this.weapons[0] } : null,
        this.weapons[1] ? { ...this.weapons[1] } : null,
        this.weapons[2] ? { ...this.weapons[2] } : null,
      ],
      zoneCenterX: this.zoneCenterX,
      zoneCenterZ: this.zoneCenterZ,
      zoneRadius: this.zoneRadius,
      nextZoneCenterX: this.nextZoneCenterX,
      nextZoneCenterZ: this.nextZoneCenterZ,
      nextZoneRadius: this.nextZoneRadius,
      zonePhase: this.zonePhase,
      zoneTimer: Math.max(0, Math.ceil(this.zoneTimer)),
      zoneShrinking: this.zoneShrinking,
      outsideZone: Math.hypot(p.x - this.zoneCenterX, p.z - this.zoneCenterZ) > this.zoneRadius,
      nearbyLoot: nearbyLoot.slice(0, 3),
      minimapBlips: blips,
      killFeed: [...this.killFeed],
      planeProgress: this.planeProgress,
      planeStartX: this.planeStartX,
      planeStartZ: this.planeStartZ,
      planeEndX: this.planeEndX,
      planeEndZ: this.planeEndZ,
      planeX: this.dropPlane?.position.x ?? 0,
      planeZ: this.dropPlane?.position.z ?? 0,
      hitmarkerTimer: this.hitmarkerTimer,
      hitmarkerKill: this.hitmarkerKill,
      damageIndicatorAngle: this.damageIndicatorAngle,
      damageIndicatorTimer: this.damageIndicatorTimer,
      bannerText: this.bannerText,
      activeEmote: p.activeEmote,
      allyHpList: allies,
    });
  }

  public dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('keydown', this.handleKeyDown);
    window.removeEventListener('keyup', this.handleKeyUp);
    window.removeEventListener('blur', this.handleBlur);
    audioEngine.stopLobbyMusic();
    this.renderer.dispose();
    if (this.renderer.domElement.parentNode) {
      this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
    }
  }
}
