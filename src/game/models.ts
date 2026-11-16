import * as THREE from 'three';
import { OperatorProfile, OutfitSkin, WeaponId } from '../types/game';
import { WEAPONS } from './constants';
import { BoxCollider, CylinderCollider, WorldColliders, bridgeSurfaceY, groundHeightAt } from './terrain';
import { ProceduralTextureSet } from './textures';

export interface CharacterRig {
  root: THREE.Group;
  hips: THREE.Group;
  torso: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  weaponMount: THREE.Group;
  muzzlePoint: THREE.Object3D;
  parachuteGroup: THREE.Group;
  contactShadow: THREE.Mesh;
  hitFlashMaterials: THREE.MeshStandardMaterial[];
}

export function buildWeaponMesh(weaponId: WeaponId): THREE.Group {
  const spec = WEAPONS[weaponId];
  const group = new THREE.Group();

  const receiverMat = new THREE.MeshStandardMaterial({
    color: 0x1e293b,
    roughness: 0.45,
    metalness: 0.85,
  });
  const barrelMat = new THREE.MeshStandardMaterial({
    color: 0x0f172a,
    roughness: 0.25,
    metalness: 0.95,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: spec.accentHex,
    roughness: 0.35,
    metalness: 0.65,
    emissive: spec.accentHex,
    emissiveIntensity: 0.25,
  });
  const gripMat = new THREE.MeshStandardMaterial({
    color: 0x27272a,
    roughness: 0.85,
    metalness: 0.1,
  });

  if (weaponId === 'arcpistol') {
    const slide = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.08, 0.28), receiverMat);
    slide.position.set(0, 0.04, 0.08);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.13, 0.07), gripMat);
    grip.position.set(0, -0.04, -0.02);
    grip.rotation.x = 0.25;
    const sight = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.02, 0.04), accentMat);
    sight.position.set(0, 0.09, 0.16);
    group.add(slide, grip, sight);
    return group;
  }

  const len = weaponId === 'm240' ? 0.78 : weaponId === 'sg12' ? 0.62 : weaponId === 'xr9' ? 0.44 : 0.58;

  // 1. Receiver body
  const receiver = new THREE.Mesh(new THREE.BoxGeometry(0.075, 0.11, len * 0.52), receiverMat);
  receiver.position.set(0, 0.03, len * 0.15);
  group.add(receiver);

  // 2. Barrel + shroud
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.018, 0.022, len * 0.55, 8),
    barrelMat
  );
  barrel.rotation.x = Math.PI / 2;
  barrel.position.set(0, 0.045, len * 0.58);
  group.add(barrel);

  // 3. Magazine
  const mag = new THREE.Mesh(
    new THREE.BoxGeometry(0.045, weaponId === 'xr9' ? 0.22 : 0.16, 0.065),
    accentMat
  );
  mag.position.set(0, -0.08, len * 0.22);
  mag.rotation.x = 0.18;
  group.add(mag);

  // 4. Stock & Grip
  const stock = new THREE.Mesh(new THREE.BoxGeometry(0.055, 0.09, 0.22), gripMat);
  stock.position.set(0, 0.02, -0.14);
  const grip = new THREE.Mesh(new THREE.BoxGeometry(0.048, 0.13, 0.06), gripMat);
  grip.position.set(0, -0.06, 0.02);
  grip.rotation.x = 0.28;
  group.add(stock, grip);

  // 5. Optic / Scope
  const scope = new THREE.Mesh(
    new THREE.CylinderGeometry(0.026, 0.026, weaponId === 'm240' ? 0.22 : 0.11, 8),
    barrelMat
  );
  scope.rotation.x = Math.PI / 2;
  scope.position.set(0, 0.11, len * 0.15);
  const lens = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.01, 8), accentMat);
  lens.rotation.x = Math.PI / 2;
  lens.position.set(0, 0.11, len * 0.15 + (weaponId === 'm240' ? 0.11 : 0.055));
  group.add(scope, lens);

  return group;
}

export function buildCharacterModel(
  operator: OperatorProfile,
  skin: OutfitSkin,
  options?: { isBot?: boolean; isAlly?: boolean }
): CharacterRig {
  const root = new THREE.Group();
  const primaryHex = skin.id === 'default' ? operator.primaryColor : skin.primaryColor;
  const secondaryHex = skin.id === 'default' ? operator.secondaryColor : skin.secondaryColor;
  const visorHex = skin.id === 'default' ? operator.visorColor : skin.visorColor;

  const hitFlashMaterials: THREE.MeshStandardMaterial[] = [];

  const suitMat = new THREE.MeshStandardMaterial({
    color: primaryHex,
    roughness: 0.72,
    metalness: 0.18,
  });
  const armorMat = new THREE.MeshStandardMaterial({
    color: secondaryHex,
    roughness: 0.32,
    metalness: 0.78,
  });
  const darkGearMat = new THREE.MeshStandardMaterial({
    color: 0x111827,
    roughness: 0.85,
    metalness: 0.15,
  });
  const skinMat = new THREE.MeshStandardMaterial({
    color: 0xd4a373,
    roughness: 0.68,
    metalness: 0.05,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: visorHex,
    roughness: 0.15,
    metalness: 0.9,
    emissive: visorHex,
    emissiveIntensity: options?.isBot ? 0.45 : 0.65,
  });
  hitFlashMaterials.push(suitMat, armorMat);

  // Soft contact shadow disc on ground
  const shadowGeo = new THREE.CircleGeometry(0.55, 16);
  shadowGeo.rotateX(-Math.PI / 2);
  const shadowMat = new THREE.MeshBasicMaterial({
    color: 0x000000,
    transparent: true,
    opacity: 0.42,
    depthWrite: false,
  });
  const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
  contactShadow.position.y = 0.03;
  root.add(contactShadow);

  // Hips (root pivot for whole upper & lower body, bottom-center grounded at y=0)
  const hips = new THREE.Group();
  hips.position.y = 0.92;
  root.add(hips);

  const pelvis = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.18, 0.26), darkGearMat);
  pelvis.castShadow = true;
  hips.add(pelvis);

  // Legs (pivoted at hip joint)
  const makeLeg = (xOffset: number) => {
    const legGroup = new THREE.Group();
    legGroup.position.set(xOffset, -0.05, 0);

    const thigh = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.42, 0.19), suitMat);
    thigh.position.y = -0.22;
    thigh.castShadow = true;

    const kneePad = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.1, 0.21), armorMat);
    kneePad.position.set(0, -0.42, 0.02);

    const shin = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.4, 0.16), darkGearMat);
    shin.position.y = -0.62;
    shin.castShadow = true;

    const boot = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.12, 0.25), darkGearMat);
    boot.position.set(0, -0.82, 0.04);
    boot.castShadow = true;

    legGroup.add(thigh, kneePad, shin, boot);
    return legGroup;
  };

  const leftLeg = makeLeg(-0.13);
  const rightLeg = makeLeg(0.13);
  hips.add(leftLeg, rightLeg);

  // Torso
  const torso = new THREE.Group();
  torso.position.y = 0.1;
  hips.add(torso);

  const chestCore = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.52, 0.28), suitMat);
  chestCore.position.y = 0.26;
  chestCore.castShadow = true;
  torso.add(chestCore);

  // Tactical Vest Chest Plate (front + back)
  const vestPlate = new THREE.Mesh(new THREE.BoxGeometry(0.49, 0.38, 0.33), armorMat);
  vestPlate.position.y = 0.3;
  vestPlate.castShadow = true;
  torso.add(vestPlate);

  // Backpack
  const backpack = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.4, 0.18), darkGearMat);
  backpack.position.set(0, 0.28, -0.22);
  backpack.castShadow = true;
  const packStrip = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.19), visorMat);
  packStrip.position.set(0, 0.38, -0.23);
  torso.add(backpack, packStrip);

  // Head + Headgear
  const headGroup = new THREE.Group();
  headGroup.position.y = 0.58;
  torso.add(headGroup);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.09, 0.1, 8), skinMat);
  neck.position.y = 0.03;
  const head = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.26, 0.24), skinMat);
  head.position.y = 0.18;
  head.castShadow = true;
  headGroup.add(neck, head);

  if (operator.headgear === 'helmet' || operator.headgear === 'visor') {
    const helmet = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.18, 0.29), armorMat);
    helmet.position.set(0, 0.25, -0.01);
    helmet.castShadow = true;
    const visor = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.09, 0.08), visorMat);
    visor.position.set(0, 0.19, 0.12);
    headGroup.add(helmet, visor);
  } else if (operator.headgear === 'hood') {
    const hood = new THREE.Mesh(new THREE.BoxGeometry(0.29, 0.29, 0.3), darkGearMat);
    hood.position.set(0, 0.2, -0.02);
    const mask = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.12, 0.12), armorMat);
    mask.position.set(0, 0.13, 0.09);
    const eyes = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.04, 0.04), visorMat);
    eyes.position.set(0, 0.21, 0.13);
    headGroup.add(hood, mask, eyes);
  } else {
    // Beret / commander comms
    const beret = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.14, 0.09, 10), armorMat);
    beret.position.set(0.02, 0.31, 0);
    beret.rotation.z = -0.18;
    const headset = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.07, 0.07), darkGearMat);
    headset.position.set(0, 0.19, 0);
    const monocle = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.05, 0.05), visorMat);
    monocle.position.set(0.06, 0.2, 0.12);
    headGroup.add(beret, headset, monocle);
  }

  // Arms
  const makeArm = (xOffset: number) => {
    const armGroup = new THREE.Group();
    armGroup.position.set(xOffset, 0.46, 0);
    const shoulder = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.16, 0.18), armorMat);
    shoulder.position.y = -0.04;
    const upper = new THREE.Mesh(new THREE.BoxGeometry(0.13, 0.28, 0.14), suitMat);
    upper.position.y = -0.2;
    upper.castShadow = true;
    const forearm = new THREE.Mesh(new THREE.BoxGeometry(0.11, 0.26, 0.12), darkGearMat);
    forearm.position.set(0, -0.44, 0.03);
    forearm.castShadow = true;
    armGroup.add(shoulder, upper, forearm);
    return armGroup;
  };

  const leftArm = makeArm(-0.31);
  const rightArm = makeArm(0.31);
  torso.add(leftArm, rightArm);

  // Weapon mount attached to rightArm
  const weaponMount = new THREE.Group();
  weaponMount.position.set(0, -0.52, 0.16);
  weaponMount.rotation.x = Math.PI / 2;
  rightArm.add(weaponMount);

  const muzzlePoint = new THREE.Object3D();
  muzzlePoint.position.set(0, 0.05, 0.55);
  weaponMount.add(muzzlePoint);

  // Parachute Canopy & Rig (hidden until parachuting)
  const parachuteGroup = new THREE.Group();
  parachuteGroup.position.set(0, 1.5, 0);
  parachuteGroup.visible = false;

  const canopyGeo = new THREE.SphereGeometry(2.2, 14, 8, 0, Math.PI * 2, 0, Math.PI * 0.45);
  canopyGeo.scale(1.35, 0.65, 0.9);
  const canopyMat = new THREE.MeshStandardMaterial({
    color: secondaryHex,
    roughness: 0.65,
    metalness: 0.1,
    side: THREE.DoubleSide,
  });
  const canopy = new THREE.Mesh(canopyGeo, canopyMat);
  canopy.position.y = 1.95;
  parachuteGroup.add(canopy);

  const cordMat = new THREE.LineBasicMaterial({ color: 0xe2e8f0 });
  const cordPts = [
    new THREE.Vector3(-1.8, 2.2, 0), new THREE.Vector3(-0.2, 0, 0),
    new THREE.Vector3(1.8, 2.2, 0), new THREE.Vector3(0.2, 0, 0),
    new THREE.Vector3(0, 2.3, -1.2), new THREE.Vector3(0, 0, -0.15),
    new THREE.Vector3(0, 2.3, 1.2), new THREE.Vector3(0, 0, 0.15),
  ];
  const cordGeo = new THREE.BufferGeometry().setFromPoints(cordPts);
  const cords = new THREE.LineSegments(cordGeo, cordMat);
  parachuteGroup.add(cords);

  // Ally indicator beacon if teammate
  if (options?.isAlly) {
    const marker = new THREE.Mesh(
      new THREE.OctahedronGeometry(0.16, 0),
      new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
    );
    marker.position.y = 2.25;
    root.add(marker);
  }

  root.add(parachuteGroup);

  return {
    root,
    hips,
    torso,
    headGroup,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    weaponMount,
    muzzlePoint,
    parachuteGroup,
    contactShadow,
    hitFlashMaterials,
  };
}

export function buildDropPlane(): THREE.Group {
  const plane = new THREE.Group();
  const hullMat = new THREE.MeshStandardMaterial({ color: 0x475569, roughness: 0.45, metalness: 0.72 });
  const accentMat = new THREE.MeshStandardMaterial({ color: 0xf59e0b, roughness: 0.35, metalness: 0.5 });
  const darkMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, roughness: 0.4, metalness: 0.85 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.4, 15, 12), hullMat);
  fuselage.rotation.x = Math.PI / 2;
  plane.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.4, 3.6, 12), darkMat);
  nose.rotation.x = Math.PI / 2;
  nose.position.z = 9.2;
  plane.add(nose);

  const wings = new THREE.Mesh(new THREE.BoxGeometry(18, 0.35, 3.2), hullMat);
  wings.position.set(0, 0.4, 0.5);
  plane.add(wings);

  const wingTips = new THREE.Mesh(new THREE.BoxGeometry(18.6, 0.42, 1.1), accentMat);
  wingTips.position.set(0, 0.45, 0.5);
  plane.add(wingTips);

  const tailFin = new THREE.Mesh(new THREE.BoxGeometry(0.35, 3.6, 2.4), accentMat);
  tailFin.position.set(0, 2.2, -6.2);
  plane.add(tailFin);

  const hStab = new THREE.Mesh(new THREE.BoxGeometry(6.5, 0.25, 1.6), hullMat);
  hStab.position.set(0, 0.9, -6.4);
  plane.add(hStab);

  return plane;
}

export function buildIslandEnvironment(
  scene: THREE.Object3D,
  textures: ProceduralTextureSet,
  enableShadows: boolean
): { colliders: WorldColliders; waterMesh: THREE.Mesh; braziers: THREE.PointLight[] } {
  const boxes: BoxCollider[] = [];
  const cylinders: CylinderCollider[] = [];
  const braziers: THREE.PointLight[] = [];

  const worldGroup = new THREE.Group();
  scene.add(worldGroup);

  // 1. Multi-biome Vertex-Colored Terrain Mesh
  const segs = 140;
  const size = 840;
  const terrainGeo = new THREE.PlaneGeometry(size, size, segs, segs);
  terrainGeo.rotateX(-Math.PI / 2);
  const posAttr = terrainGeo.attributes.position;
  const colors = new Float32Array(posAttr.count * 3);
  const c = new THREE.Color();

  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vz = posAttr.getZ(i);
    const h = groundHeightAt(vx, vz);
    posAttr.setY(i, h);

    // Biome vertex coloring
    if (h < -0.3) {
      c.setRGB(0.28, 0.26, 0.2);
    } else if (h < 1.25) {
      c.setRGB(0.76, 0.68, 0.48); // Beach sand
    } else if (Math.hypot(vx, vz - 185) < 70) {
      c.setRGB(0.24, 0.26, 0.3); // Urban asphalt district
    } else if (Math.hypot(vx + 145, vz + 165) < 50) {
      c.setRGB(0.26, 0.25, 0.29); // Gothic stronghold stone
    } else if (vx > 65 && vz < -25) {
      c.setRGB(0.68, 0.52, 0.34); // Redrock desert canyon
    } else if (h > 26) {
      c.setRGB(0.86, 0.89, 0.93); // Snow peak
    } else if (h > 16) {
      c.setRGB(0.42, 0.43, 0.46); // Mountain rock
    } else {
      const n = (Math.sin(vx * 0.09) + Math.cos(vz * 0.09)) * 0.04;
      c.setRGB(0.22 + n, 0.42 + n, 0.2 + n * 0.5); // Lush highland grass
    }
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  terrainGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  terrainGeo.computeVertexNormals();

  const terrainMat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    roughness: 0.92,
    metalness: 0.04,
  });
  const terrainMesh = new THREE.Mesh(terrainGeo, terrainMat);
  terrainMesh.receiveShadow = enableShadows;
  worldGroup.add(terrainMesh);

  // 2. Reflective Ocean & Lake Water Surface
  const waterGeo = new THREE.CircleGeometry(780, 48);
  waterGeo.rotateX(-Math.PI / 2);
  const waterMat = new THREE.MeshPhysicalMaterial({
    color: 0x0c4a6e,
    map: textures.waterRipple,
    roughness: 0.16,
    metalness: 0.35,
    clearcoat: 0.85,
    clearcoatRoughness: 0.12,
    transparent: true,
    opacity: 0.88,
  });
  const waterMesh = new THREE.Mesh(waterGeo, waterMat);
  waterMesh.position.y = 0.0;
  waterMesh.receiveShadow = enableShadows;
  worldGroup.add(waterMesh);

  // Shared materials for structures
  const cityMat = new THREE.MeshStandardMaterial({ map: textures.cityFacade, roughness: 0.45, metalness: 0.35 });
  const concreteMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.85, metalness: 0.08 });
  const roofMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, roughness: 0.65, metalness: 0.3 });
  const gothicMat = new THREE.MeshStandardMaterial({ map: textures.gothicStone, roughness: 0.88, metalness: 0.08 });
  const milMat = new THREE.MeshStandardMaterial({ map: textures.militaryMetal, roughness: 0.55, metalness: 0.65 });
  const woodMat = new THREE.MeshStandardMaterial({ color: 0x7c4a2d, roughness: 0.88, metalness: 0.05 });
  const terracottaMat = new THREE.MeshStandardMaterial({ color: 0x9a3412, roughness: 0.78, metalness: 0.08 });
  const steelMat = new THREE.MeshStandardMaterial({ color: 0x334155, roughness: 0.35, metalness: 0.85 });
  const roadMat = new THREE.MeshStandardMaterial({
    map: textures.asphaltRoad,
    roughness: 0.88,
    metalness: 0.06,
    polygonOffset: true,
    polygonOffsetFactor: -1,
    polygonOffsetUnits: -1,
  });

  const addBox = (
    x: number,
    baseY: number,
    z: number,
    w: number,
    h: number,
    d: number,
    mat: THREE.Material,
    collide = true,
    castShadow = true
  ) => {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
    mesh.position.set(x, baseY + h / 2, z);
    mesh.castShadow = enableShadows && castShadow;
    mesh.receiveShadow = enableShadows;
    worldGroup.add(mesh);
    if (collide) {
      boxes.push({
        minX: x - w / 2,
        maxX: x + w / 2,
        minY: baseY,
        maxY: baseY + h,
        minZ: z - d / 2,
        maxZ: z + d / 2,
      });
    }
    return mesh;
  };

  // 3. METROPOLIS CORE (Modern City Skyscrapers & Street Grid at 0, 185)
  const cityY = groundHeightAt(0, 185);
  // Road avenues
  const ave1 = new THREE.Mesh(new THREE.PlaneGeometry(14, 120), roadMat);
  ave1.rotation.x = -Math.PI / 2;
  ave1.position.set(0, cityY + 0.05, 185);
  ave1.receiveShadow = enableShadows;
  worldGroup.add(ave1);

  const ave2 = new THREE.Mesh(new THREE.PlaneGeometry(120, 14), roadMat);
  ave2.rotation.x = -Math.PI / 2;
  ave2.position.set(0, cityY + 0.06, 185);
  ave2.receiveShadow = enableShadows;
  worldGroup.add(ave2);

  const skyConfigs = [
    { x: -24, z: 162, w: 14, h: 28, d: 14 },
    { x: 24, z: 162, w: 16, h: 36, d: 14 },
    { x: -26, z: 208, w: 15, h: 24, d: 15 },
    { x: 26, z: 208, w: 14, h: 32, d: 16 },
    { x: -46, z: 185, w: 12, h: 19, d: 18 },
    { x: 46, z: 185, w: 12, h: 22, d: 18 },
    { x: 0, z: 228, w: 20, h: 42, d: 15 },
    { x: -18, z: 142, w: 12, h: 15, d: 12 },
    { x: 18, z: 142, w: 12, h: 18, d: 12 },
  ];
  skyConfigs.forEach((b) => {
    const by = groundHeightAt(b.x, b.z);
    // 3-part composite building: Concrete plinth + glazed tower + rooftop penthouse/HVAC
    addBox(b.x, by, b.z, b.w + 1.4, 3.2, b.d + 1.4, concreteMat, true, true);
    addBox(b.x, by + 3.2, b.z, b.w, b.h - 3.2, b.d, cityMat, true, true);
    addBox(b.x, by + b.h, b.z, b.w * 0.55, 2.2, b.d * 0.55, roofMat, false, false);
    // Helipad / beacon on tallest tower
    if (b.h > 34) {
      const spire = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.3, 6, 6), steelMat);
      spire.position.set(b.x, by + b.h + 5, b.z);
      worldGroup.add(spire);
    }
  });

  // Urban cover barriers along avenues
  for (let i = -2; i <= 2; i++) {
    if (i === 0) continue;
    addBox(i * 15, cityY, 174, 3.2, 1.35, 0.9, concreteMat, true, true);
    addBox(i * 15, cityY, 196, 3.2, 1.35, 0.9, concreteMat, true, true);
  }

  // 4. ALAMO BASIN ARCH BRIDGE (Z = -62 .. 44, X = 0)
  const bridgeSegs = 14;
  for (let i = 0; i < bridgeSegs; i++) {
    const z1 = -62 + (i / bridgeSegs) * 106;
    const z2 = -62 + ((i + 1) / bridgeSegs) * 106;
    const zMid = (z1 + z2) / 2;
    const y1 = bridgeSurfaceY(z1);
    const y2 = bridgeSurfaceY(z2);
    const yMid = (y1 + y2) / 2;
    const segLen = z2 - z1 + 0.35;
    const tilt = Math.atan2(y2 - y1, z2 - z1);

    const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 0.7, segLen), concreteMat);
    deck.position.set(0, yMid - 0.35, zMid);
    deck.rotation.x = -tilt;
    deck.receiveShadow = enableShadows;
    worldGroup.add(deck);

    // Side guardrails
    [-5.6, 5.6].forEach((rx) => {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.1, segLen), steelMat);
      rail.position.set(rx, yMid + 0.55, zMid);
      rail.rotation.x = -tilt;
      worldGroup.add(rail);
    });
  }
  // Bridge support pylons
  [-28, 12].forEach((pz) => {
    const py = bridgeSurfaceY(pz);
    addBox(-5.5, -5, pz, 1.6, py + 14, 1.6, steelMat, true, true);
    addBox(5.5, -5, pz, 1.6, py + 14, 1.6, steelMat, true, true);
    addBox(0, py + 8.2, pz, 12.6, 1.2, 1.4, steelMat, false, false);
  });

  // 5. FORT VORQEN (Military Compound at -185, 20)
  const fortY = groundHeightAt(-185, 20);
  // 2 Military Hangars (multi-part)
  [-198, -168].forEach((hx) => {
    addBox(hx, fortY, 12, 14, 7.5, 22, milMat, true, true);
    const roofArc = new THREE.Mesh(
      new THREE.CylinderGeometry(7, 7, 22, 12, 1, false, 0, Math.PI),
      steelMat
    );
    roofArc.rotation.z = Math.PI / 2;
    roofArc.rotation.y = Math.PI / 2;
    roofArc.position.set(hx, fortY + 7.5, 12);
    worldGroup.add(roofArc);
  });
  // Radar & Command Tower
  addBox(-185, fortY, 38, 8, 11, 8, concreteMat, true, true);
  const dish = new THREE.Mesh(new THREE.ConeGeometry(3.5, 2.2, 12, 1, true), steelMat);
  dish.position.set(-185, fortY + 13.5, 38);
  dish.rotation.x = -0.7;
  worldGroup.add(dish);
  // Watchtowers at corners
  [[-214, -8], [-156, -8], [-214, 48], [-156, 48]].forEach(([wx, wz]) => {
    addBox(wx, fortY, wz, 4, 9, 4, steelMat, true, true);
    addBox(wx, fortY + 9, wz, 5.4, 2.6, 5.4, milMat, false, true);
  });
  // Perimeter walls with gates
  addBox(-200, fortY, -12, 24, 3.2, 1.4, concreteMat, true, true);
  addBox(-170, fortY, -12, 24, 3.2, 1.4, concreteMat, true, true);
  addBox(-218, fortY, 20, 1.4, 3.2, 56, concreteMat, true, true);

  // 6. MIDNIGHT STRONGHOLD (Gothic Castle POI at -145, -165, inspired by screenshots!)
  const castleY = groundHeightAt(-145, -165);
  // Central Citadel Keep
  addBox(-145, castleY, -165, 18, 14, 18, gothicMat, true, true);
  addBox(-145, castleY + 14, -165, 12, 7, 12, gothicMat, true, true);
  const spire = new THREE.Mesh(new THREE.ConeGeometry(6.5, 9, 4), roofMat);
  spire.rotation.y = Math.PI / 4;
  spire.position.set(-145, castleY + 25.5, -165);
  worldGroup.add(spire);

  // 4 Corner Bastion Towers + Glowing Crimson Braziers
  const brazierMat = new THREE.MeshStandardMaterial({
    color: 0xef4444,
    emissive: 0xdc2626,
    emissiveIntensity: 2.2,
    roughness: 0.3,
  });
  [[-166, -186], [-124, -186], [-166, -144], [-124, -144]].forEach(([tx, tz], idx) => {
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 17, 10), gothicMat);
    tower.position.set(tx, castleY + 8.5, tz);
    tower.castShadow = enableShadows;
    tower.receiveShadow = enableShadows;
    worldGroup.add(tower);
    cylinders.push({ x: tx, z: tz, radius: 4.7, minY: castleY, maxY: castleY + 18 });

    const cap = new THREE.Mesh(new THREE.ConeGeometry(4.8, 5.5, 10), roofMat);
    cap.position.set(tx, castleY + 19.5, tz);
    worldGroup.add(cap);

    // Torch bowl
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.65, 8, 8), brazierMat);
    bowl.position.set(tx + (tx < -145 ? 3.5 : -3.5), castleY + 3.2, tz + (tz < -165 ? 3.5 : -3.5));
    worldGroup.add(bowl);
    if (idx < 2) {
      const pLight = new THREE.PointLight(0xff4422, 16, 36);
      pLight.position.copy(bowl.position);
      worldGroup.add(pLight);
      braziers.push(pLight);
    }
  });
  // Curtain walls
  addBox(-145, castleY, -186, 34, 6.5, 2.2, gothicMat, true, true);
  addBox(-166, castleY, -165, 2.2, 6.5, 34, gothicMat, true, true);
  addBox(-124, castleY, -165, 2.2, 6.5, 34, gothicMat, true, true);

  // 7. REDROCK AIRFIELD & WAREHOUSES (Northeast at 165, -120)
  const airY = groundHeightAt(165, -120);
  const runway = new THREE.Mesh(new THREE.PlaneGeometry(18, 95), roadMat);
  runway.rotation.x = -Math.PI / 2;
  runway.position.set(165, airY + 0.05, -120);
  runway.receiveShadow = enableShadows;
  worldGroup.add(runway);

  // Airfield Warehouses & Control Tower
  addBox(142, airY, -135, 14, 7, 22, milMat, true, true);
  addBox(142, airY, -100, 14, 7, 20, milMat, true, true);
  addBox(186, airY, -125, 7, 15, 7, concreteMat, true, true);
  addBox(186, airY + 15, -125, 9.5, 3.2, 9.5, cityMat, true, true);

  // 8. TIMBERLINE VILLAGE & ABANDONED COTTAGES (Southeast at 155, 120)
  const cottages = [
    [138, 108], [162, 105], [174, 132], [142, 136], [112, 84], [-68, 86], [-96, -84], [78, 36],
  ];
  cottages.forEach(([cx, cz]) => {
    const cy = groundHeightAt(cx, cz);
    if (cy < 1.2) return;
    addBox(cx, cy, cz, 8.5, 4.2, 7.2, woodMat, true, true);
    const roof = new THREE.Mesh(new THREE.ConeGeometry(6.4, 3.2, 4), terracottaMat);
    roof.rotation.y = Math.PI / 4;
    roof.position.set(cx, cy + 5.7, cz);
    roof.castShadow = enableShadows;
    worldGroup.add(roof);
  });

  // 9. INSTANCED PINE FOREST & JAGGED ROCKS
  const treeCount = 260;
  const trunkGeo = new THREE.CylinderGeometry(0.28, 0.42, 3.4, 6);
  trunkGeo.translate(0, 1.7, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x4b3222, roughness: 0.92, metalness: 0.04 });
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, treeCount);
  trunks.castShadow = enableShadows;
  trunks.receiveShadow = enableShadows;

  const crownGeo = new THREE.ConeGeometry(2.3, 6.2, 7);
  crownGeo.translate(0, 5.4, 0);
  const crownMat = new THREE.MeshStandardMaterial({ color: 0x265c2e, roughness: 0.86, metalness: 0.02 });
  const crowns = new THREE.InstancedMesh(crownGeo, crownMat, treeCount);
  crowns.castShadow = enableShadows;
  crowns.receiveShadow = enableShadows;

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  let placedTrees = 0;
  let seed = 1337;
  const nextRand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let attempt = 0; attempt < 950 && placedTrees < treeCount; attempt++) {
    const angle = nextRand() * Math.PI * 2;
    const r = 35 + nextRand() * 310;
    const tx = Math.cos(angle) * r;
    const tz = Math.sin(angle) * r;
    const ty = groundHeightAt(tx, tz);

    if (ty < 1.6 || ty > 22) continue;
    // Skip POI interiors
    if (Math.hypot(tx, tz - 185) < 62) continue;
    if (Math.hypot(tx + 185, tz - 20) < 42) continue;
    if (Math.hypot(tx + 145, tz + 165) < 38) continue;
    if (Math.hypot(tx - 165, tz + 120) < 48) continue;

    const scale = 0.85 + nextRand() * 0.45;
    dummy.position.set(tx, ty - 0.15, tz);
    dummy.rotation.y = nextRand() * Math.PI * 2;
    dummy.scale.set(scale, scale * (0.9 + nextRand() * 0.3), scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(placedTrees, dummy.matrix);
    crowns.setMatrixAt(placedTrees, dummy.matrix);

    tint.setHSL(0.32 + (nextRand() - 0.5) * 0.06, 0.48, 0.24 + nextRand() * 0.12);
    crowns.setColorAt(placedTrees, tint);

    cylinders.push({ x: tx, z: tz, radius: 0.45 * scale, minY: ty, maxY: ty + 6 });
    placedTrees++;
  }
  trunks.count = placedTrees;
  crowns.count = placedTrees;
  trunks.instanceMatrix.needsUpdate = true;
  crowns.instanceMatrix.needsUpdate = true;
  if (crowns.instanceColor) crowns.instanceColor.needsUpdate = true;
  trunks.computeBoundingSphere();
  crowns.computeBoundingSphere();
  worldGroup.add(trunks, crowns);

  // Rocks InstancedMesh
  const rockCount = 120;
  const rockGeo = new THREE.DodecahedronGeometry(1.4, 0);
  rockGeo.translate(0, 0.7, 0);
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x64748b, roughness: 0.9, metalness: 0.08 });
  const rocks = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
  rocks.castShadow = enableShadows;
  rocks.receiveShadow = enableShadows;

  let placedRocks = 0;
  for (let attempt = 0; attempt < 400 && placedRocks < rockCount; attempt++) {
    const angle = nextRand() * Math.PI * 2;
    const r = 25 + nextRand() * 320;
    const rx = Math.cos(angle) * r;
    const rz = Math.sin(angle) * r;
    const ry = groundHeightAt(rx, rz);
    if (ry < 0.8) continue;
    if (Math.hypot(rx, rz - 185) < 50) continue;

    const s = 0.75 + nextRand() * 1.4;
    dummy.position.set(rx, ry - 0.2, rz);
    dummy.rotation.set(nextRand() * 0.5, nextRand() * Math.PI * 2, nextRand() * 0.5);
    dummy.scale.set(s * 1.2, s * 0.8, s);
    dummy.updateMatrix();
    rocks.setMatrixAt(placedRocks, dummy.matrix);

    tint.setScalar(0.75 + nextRand() * 0.35);
    rocks.setColorAt(placedRocks, tint);
    cylinders.push({ x: rx, z: rz, radius: 1.15 * s, minY: ry, maxY: ry + 1.8 * s });
    placedRocks++;
  }
  rocks.count = placedRocks;
  rocks.instanceMatrix.needsUpdate = true;
  if (rocks.instanceColor) rocks.instanceColor.needsUpdate = true;
  rocks.computeBoundingSphere();
  worldGroup.add(rocks);

  return {
    colliders: { boxes, cylinders },
    waterMesh,
    braziers,
  };
}
