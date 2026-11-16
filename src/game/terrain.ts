import { ISLAND_POIS, WORLD_RADIUS } from './constants';

export const WATER_LEVEL = 0.0;

export interface BoxCollider {
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  minZ: number;
  maxZ: number;
  isCover?: boolean;
}

export interface CylinderCollider {
  x: number;
  z: number;
  radius: number;
  minY: number;
  maxY: number;
}

export interface WorldColliders {
  boxes: BoxCollider[];
  cylinders: CylinderCollider[];
}

function hash2(x: number, z: number): number {
  const n = Math.sin(x * 127.1 + z * 311.7) * 43758.5453123;
  return n - Math.floor(n);
}

function smoothNoise(x: number, z: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const ux = fx * fx * (3 - 2 * fx);
  const uz = fz * fz * (3 - 2 * fz);

  const a = hash2(ix, iz);
  const b = hash2(ix + 1, iz);
  const c = hash2(ix, iz + 1);
  const d = hash2(ix + 1, iz + 1);

  return a + (b - a) * ux + (c - a) * uz + (a - b - c + d) * ux * uz;
}

function fbm(x: number, z: number): number {
  let v = 0;
  let amp = 0.5;
  let freq = 1;
  for (let i = 0; i < 4; i++) {
    v += amp * (smoothNoise(x * freq, z * freq) * 2 - 1);
    freq *= 2.04;
    amp *= 0.48;
  }
  return v;
}

export function isOnBridge(x: number, z: number): boolean {
  // Alamo Basin bridge crossing central lake along X-axis or Z-axis
  return Math.abs(x) < 6.5 && z > -62 && z < 44;
}

export function bridgeSurfaceY(z: number): number {
  // Gentle arch bridge over Alamo Lake
  const t = (z + 62) / 106; // 0..1
  const arch = Math.sin(Math.max(0, Math.min(1, t)) * Math.PI) * 5.2;
  return 2.2 + arch;
}

/**
 * Deterministic heightfield for the entire Vorqen Island.
 * Used by terrain geometry, buildings, foliage, physics, and satellite minimap.
 */
export function groundHeightAt(x: number, z: number): number {
  const distFromCenter = Math.hypot(x, z);
  // Organic coastline modulation
  const angle = Math.atan2(z, x);
  const coastWarp =
    Math.sin(angle * 3 + 0.6) * 22 +
    Math.cos(angle * 5 - 1.1) * 14 +
    fbm(x * 0.008, z * 0.008) * 26;
  const effectiveRadius = WORLD_RADIUS - 28 + coastWarp;

  // Base island falloff
  const edgeT = (distFromCenter - (effectiveRadius - 48)) / 60;
  const islandMask = 1 - Math.max(0, Math.min(1, edgeT));
  const smoothMask = islandMask * islandMask * (3 - 2 * islandMask);

  if (smoothMask <= 0.001) {
    return -5.5;
  }

  // Rolling terrain base
  let h = 3.2 + fbm(x * 0.011 + 4.1, z * 0.011 - 2.3) * 7.5;
  h += fbm(x * 0.03, z * 0.03) * 1.8;

  // Northern Mountain Ridge (Mt. Vorqen Peak around 5, -235)
  const mtDist = Math.hypot((x - 5) * 0.72, z + 235);
  if (mtDist < 125) {
    const mtFactor = Math.cos((mtDist / 125) * (Math.PI * 0.5));
    const ridgeNoise = Math.abs(fbm(x * 0.025, z * 0.025)) * 11;
    h += Math.pow(mtFactor, 1.65) * 44 + mtFactor * ridgeNoise;
  }

  // Secondary western ridge
  const westRidge = Math.hypot(x + 215, (z + 85) * 0.8);
  if (westRidge < 85) {
    const wf = Math.cos((westRidge / 85) * (Math.PI * 0.5));
    h += Math.pow(wf, 1.8) * 19;
  }

  // Alamo Basin (Central Lake at 0, -10)
  const lakeDist = Math.hypot(x * 0.85, (z + 10) * 1.18);
  if (lakeDist < 56) {
    const lf = 1 - lakeDist / 56;
    h -= lf * lf * 10.5;
  }

  // River winding from Alamo Lake to East and West coasts
  const riverZ = -10 + Math.sin(x * 0.024) * 22;
  const riverDist = Math.abs(z - riverZ);
  if (riverDist < 14 && distFromCenter < effectiveRadius - 10) {
    const rf = 1 - riverDist / 14;
    h -= rf * rf * 5.8;
  }

  // Flatten POI zones for clean building foundations
  const flattenZone = (px: number, pz: number, flatR: number, targetH: number, blendR: number) => {
    const d = Math.hypot(x - px, z - pz);
    if (d < flatR + blendR) {
      const t = d <= flatR ? 1 : 1 - (d - flatR) / blendR;
      const st = t * t * (3 - 2 * t);
      h = h * (1 - st) + targetH * st;
    }
  };

  flattenZone(0, 185, 58, 3.6, 26); // Metropolis Core
  flattenZone(-185, 20, 44, 4.4, 20); // Fort Vorqen
  flattenZone(-145, -165, 36, 9.2, 22); // Midnight Stronghold
  flattenZone(165, -120, 50, 4.8, 22); // Redrock Airfield
  flattenZone(155, 120, 38, 4.0, 20); // Timberline Village

  const finalH = -5.5 + (h + 5.5) * smoothMask;
  return finalH;
}

export function walkableHeightAt(x: number, z: number): number {
  const terrainH = groundHeightAt(x, z);
  if (isOnBridge(x, z)) {
    return Math.max(terrainH, bridgeSurfaceY(z));
  }
  return terrainH;
}

export function getBiomeAt(x: number, z: number): 'ocean' | 'sand' | 'city' | 'desert' | 'snow' | 'stone' | 'forest' {
  const h = groundHeightAt(x, z);
  if (h < -0.25) return 'ocean';
  if (h < 1.15) return 'sand';
  if (Math.hypot(x, z - 185) < 72) return 'city';
  if (Math.hypot(x + 145, z + 165) < 52) return 'stone';
  if (x > 65 && z < -25) return 'desert';
  if (h > 25) return 'snow';
  if (h > 16) return 'stone';
  return 'forest';
}

export function getNearestPoiName(x: number, z: number): string {
  let best = 'VORQEN ISLAND';
  let bestD = Infinity;
  for (const poi of ISLAND_POIS) {
    const d = Math.hypot(x - poi.x, z - poi.z);
    if (d < poi.radius * 1.15 && d < bestD) {
      bestD = d;
      best = poi.name;
    }
  }
  return best;
}

/**
 * Push a circle (player/bot) out of static BoxColliders and CylinderColliders.
 */
export function resolveEntityCollisions(
  pos: { x: number; y: number; z: number },
  radius: number,
  height: number,
  colliders: WorldColliders
) {
  for (let i = 0; i < colliders.boxes.length; i++) {
    const b = colliders.boxes[i];
    if (pos.y + height <= b.minY + 0.1 || pos.y >= b.maxY - 0.15) continue;
    const closestX = Math.max(b.minX, Math.min(pos.x, b.maxX));
    const closestZ = Math.max(b.minZ, Math.min(pos.z, b.maxZ));
    const dx = pos.x - closestX;
    const dz = pos.z - closestZ;
    const distSq = dx * dx + dz * dz;
    if (distSq < radius * radius) {
      const dist = Math.sqrt(distSq);
      if (dist > 0.0001) {
        const push = radius - dist;
        pos.x += (dx / dist) * push;
        pos.z += (dz / dist) * push;
      } else {
        // Inside box: push out nearest edge
        const left = Math.abs(pos.x - b.minX);
        const right = Math.abs(b.maxX - pos.x);
        const top = Math.abs(pos.z - b.minZ);
        const bottom = Math.abs(b.maxZ - pos.z);
        const m = Math.min(left, right, top, bottom);
        if (m === left) pos.x = b.minX - radius;
        else if (m === right) pos.x = b.maxX + radius;
        else if (m === top) pos.z = b.minZ - radius;
        else pos.z = b.maxZ + radius;
      }
    }
  }

  for (let i = 0; i < colliders.cylinders.length; i++) {
    const c = colliders.cylinders[i];
    if (pos.y + height <= c.minY || pos.y >= c.maxY) continue;
    const dx = pos.x - c.x;
    const dz = pos.z - c.z;
    const minDist = radius + c.radius;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist && distSq > 0.00001) {
      const dist = Math.sqrt(distSq);
      const push = minDist - dist;
      pos.x += (dx / dist) * push;
      pos.z += (dz / dist) * push;
    }
  }
}

export function rayIntersectsBoxes(
  ox: number,
  oy: number,
  oz: number,
  dx: number,
  dy: number,
  dz: number,
  maxDist: number,
  colliders: WorldColliders
): number | null {
  let closest = maxDist;
  let hit = false;

  for (let i = 0; i < colliders.boxes.length; i++) {
    const b = colliders.boxes[i];
    const invX = dx !== 0 ? 1 / dx : 1e9;
    const invY = dy !== 0 ? 1 / dy : 1e9;
    const invZ = dz !== 0 ? 1 / dz : 1e9;

    const t1 = (b.minX - ox) * invX;
    const t2 = (b.maxX - ox) * invX;
    const t3 = (b.minY - oy) * invY;
    const t4 = (b.maxY - oy) * invY;
    const t5 = (b.minZ - oz) * invZ;
    const t6 = (b.maxZ - oz) * invZ;

    const tmin = Math.max(Math.min(t1, t2), Math.min(t3, t4), Math.min(t5, t6));
    const tmax = Math.min(Math.max(t1, t2), Math.max(t3, t4), Math.max(t5, t6));

    if (tmax >= 0 && tmin <= tmax && tmin >= 0 && tmin < closest) {
      closest = tmin;
      hit = true;
    }
  }

  return hit ? closest : null;
}
