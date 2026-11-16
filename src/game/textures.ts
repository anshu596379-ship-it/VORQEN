import * as THREE from 'three';
import { WORLD_RADIUS } from './constants';
import { getBiomeAt, groundHeightAt, isOnBridge } from './terrain';

export interface ProceduralTextureSet {
  cityFacade: THREE.CanvasTexture;
  gothicStone: THREE.CanvasTexture;
  militaryMetal: THREE.CanvasTexture;
  asphaltRoad: THREE.CanvasTexture;
  crateHazard: THREE.CanvasTexture;
  waterRipple: THREE.CanvasTexture;
  satelliteMapCanvas: HTMLCanvasElement;
}

function makeCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

function configureTex(tex: THREE.CanvasTexture, maxAniso: number, repeatX = 1, repeatY = 1, srgb = true) {
  tex.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(repeatX, repeatY);
  tex.anisotropy = Math.min(8, maxAniso);
  tex.needsUpdate = true;
  return tex;
}

export function createProceduralTextures(renderer: THREE.WebGLRenderer): ProceduralTextureSet {
  const maxAniso = renderer.capabilities.getMaxAnisotropy();

  // 1. Modern City Curtain-Wall Facade
  const [cityC, cityCtx] = makeCanvas(256, 256);
  cityCtx.fillStyle = '#334155';
  cityCtx.fillRect(0, 0, 256, 256);
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 6; col++) {
      const lit = (row * 7 + col * 13) % 5 === 0;
      cityCtx.fillStyle = lit ? '#bae6fd' : '#0f172a';
      cityCtx.fillRect(col * 42 + 6, row * 32 + 5, 30, 20);
      cityCtx.fillStyle = lit ? 'rgba(255,255,255,0.28)' : 'rgba(56,189,248,0.12)';
      cityCtx.fillRect(col * 42 + 8, row * 32 + 7, 12, 16);
    }
  }
  const cityFacade = configureTex(new THREE.CanvasTexture(cityC), maxAniso, 1, 2, true);

  // 2. Gothic Stronghold Masonry
  const [stoneC, stoneCtx] = makeCanvas(256, 256);
  stoneCtx.fillStyle = '#2e323c';
  stoneCtx.fillRect(0, 0, 256, 256);
  for (let y = 0; y < 256; y += 32) {
    const offset = (y / 32) % 2 === 0 ? 0 : 24;
    for (let x = -24; x < 256; x += 48) {
      const shade = 44 + ((x * 13 + y * 7) & 15);
      stoneCtx.fillStyle = `rgb(${shade}, ${shade + 4}, ${shade + 12})`;
      stoneCtx.fillRect(x + offset + 2, y + 2, 44, 28);
    }
  }
  const gothicStone = configureTex(new THREE.CanvasTexture(stoneC), maxAniso, 2, 2, true);

  // 3. Military Hangar Corrugated Steel
  const [milC, milCtx] = makeCanvas(256, 256);
  milCtx.fillStyle = '#3b4238';
  milCtx.fillRect(0, 0, 256, 256);
  for (let x = 0; x < 256; x += 16) {
    milCtx.fillStyle = x % 32 === 0 ? 'rgba(255,255,255,0.06)' : 'rgba(0,0,0,0.16)';
    milCtx.fillRect(x, 0, 8, 256);
  }
  milCtx.fillStyle = '#eab308';
  for (let x = -32; x < 256; x += 32) {
    milCtx.beginPath();
    milCtx.moveTo(x, 232);
    milCtx.lineTo(x + 16, 232);
    milCtx.lineTo(x + 32, 256);
    milCtx.lineTo(x + 16, 256);
    milCtx.closePath();
    milCtx.fill();
  }
  const militaryMetal = configureTex(new THREE.CanvasTexture(milC), maxAniso, 2, 1, true);

  // 4. Asphalt Highway Texture
  const [roadC, roadCtx] = makeCanvas(256, 256);
  roadCtx.fillStyle = '#20242c';
  roadCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 600; i++) {
    const rx = (i * 73) % 256;
    const ry = (i * 139) % 256;
    roadCtx.fillStyle = i % 2 === 0 ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.15)';
    roadCtx.fillRect(rx, ry, 2, 2);
  }
  roadCtx.fillStyle = '#facc15';
  roadCtx.fillRect(124, 16, 8, 92);
  roadCtx.fillRect(124, 144, 8, 92);
  roadCtx.fillStyle = '#e2e8f0';
  roadCtx.fillRect(8, 0, 6, 256);
  roadCtx.fillRect(242, 0, 6, 256);
  const asphaltRoad = configureTex(new THREE.CanvasTexture(roadC), maxAniso, 1, 14, true);

  // 5. Supply Crate Hazard Texture
  const [crateC, crateCtx] = makeCanvas(128, 128);
  crateCtx.fillStyle = '#1e3a8a';
  crateCtx.fillRect(0, 0, 128, 128);
  crateCtx.strokeStyle = '#f59e0b';
  crateCtx.lineWidth = 8;
  crateCtx.strokeRect(8, 8, 112, 112);
  crateCtx.fillStyle = '#ef4444';
  crateCtx.fillRect(20, 52, 88, 24);
  const crateHazard = configureTex(new THREE.CanvasTexture(crateC), maxAniso, 1, 1, true);

  // 6. Water Ripple Normal/Detail Texture
  const [watC, watCtx] = makeCanvas(256, 256);
  watCtx.fillStyle = '#0e4c6d';
  watCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 90; i++) {
    const x = (i * 53) % 256;
    const y = (i * 97) % 256;
    watCtx.strokeStyle = 'rgba(186, 230, 253, 0.14)';
    watCtx.lineWidth = 2;
    watCtx.beginPath();
    watCtx.ellipse(x, y, 22, 7, 0.2, 0, Math.PI * 2);
    watCtx.stroke();
  }
  const waterRipple = configureTex(new THREE.CanvasTexture(watC), maxAniso, 18, 18, true);

  // 7. GTA-V / BGMI Hybrid Satellite Minimap Canvas (512x512)
  const [mapC, mapCtx] = makeCanvas(512, 512);
  const img = mapCtx.createImageData(512, 512);
  const data = img.data;
  const span = WORLD_RADIUS * 2.15;

  for (let py = 0; py < 512; py++) {
    for (let px = 0; px < 512; px++) {
      const wx = ((px / 511) - 0.5) * span;
      const wz = ((py / 511) - 0.5) * span;
      const h = groundHeightAt(wx, wz);
      const biome = getBiomeAt(wx, wz);
      const hRight = groundHeightAt(wx + 2.5, wz);
      const hDown = groundHeightAt(wx, wz + 2.5);
      // Hillshade relief like GTA V map
      const slope = (h - hRight) * 1.4 + (h - hDown) * 1.4;
      const shade = Math.max(-28, Math.min(28, slope * 6));

      let r = 20;
      let g = 45;
      let b = 78;

      if (biome === 'ocean') {
        const depth = Math.max(0, Math.min(1, -h / 5.5));
        r = 14 - depth * 6;
        g = 58 - depth * 26;
        b = 96 - depth * 32;
      } else if (biome === 'sand') {
        r = 186;
        g = 166;
        b = 122;
      } else if (biome === 'city') {
        r = 95;
        g = 102;
        b = 112;
      } else if (biome === 'desert') {
        r = 168;
        g = 136;
        b = 92;
      } else if (biome === 'snow') {
        r = 218;
        g = 226;
        b = 236;
      } else if (biome === 'stone') {
        r = 94;
        g = 96;
        b = 104;
      } else {
        // Forest green gradient by elevation
        const e = Math.min(1, Math.max(0, h / 18));
        r = 56 + e * 38;
        g = 104 + e * 14;
        b = 58 + e * 18;
      }

      // Bridge highlight
      if (isOnBridge(wx, wz)) {
        r = 185;
        g = 192;
        b = 202;
      }

      const idx = (py * 512 + px) * 4;
      data[idx] = Math.max(0, Math.min(255, r + (biome === 'ocean' ? 0 : shade)));
      data[idx + 1] = Math.max(0, Math.min(255, g + (biome === 'ocean' ? 0 : shade)));
      data[idx + 2] = Math.max(0, Math.min(255, b + (biome === 'ocean' ? 0 : shade)));
      data[idx + 3] = 255;
    }
  }
  mapCtx.putImageData(img, 0, 0);

  // Draw tactical highway network onto satellite map
  const worldToMap = (wx: number, wz: number): [number, number] => [
    ((wx / span) + 0.5) * 512,
    ((wz / span) + 0.5) * 512,
  ];
  mapCtx.strokeStyle = 'rgba(235, 224, 184, 0.72)';
  mapCtx.lineWidth = 3;
  mapCtx.beginPath();
  // Ring highway around island
  const ringPts: [number, number][] = [
    [0, 185], [-125, 130], [-185, 20], [-145, -165], [0, -135], [165, -120], [155, 120], [0, 185],
  ];
  ringPts.forEach(([x, z], i) => {
    const [mx, my] = worldToMap(x, z);
    if (i === 0) mapCtx.moveTo(mx, my);
    else mapCtx.lineTo(mx, my);
  });
  // Central bridge road
  const [bx1, by1] = worldToMap(0, -68);
  const [bx2, by2] = worldToMap(0, 185);
  mapCtx.moveTo(bx1, by1);
  mapCtx.lineTo(bx2, by2);
  mapCtx.stroke();

  // Grid overlay
  mapCtx.strokeStyle = 'rgba(255,255,255,0.09)';
  mapCtx.lineWidth = 1;
  for (let g = 64; g < 512; g += 64) {
    mapCtx.beginPath();
    mapCtx.moveTo(g, 0);
    mapCtx.lineTo(g, 512);
    mapCtx.moveTo(0, g);
    mapCtx.lineTo(512, g);
    mapCtx.stroke();
  }

  return {
    cityFacade,
    gothicStone,
    militaryMetal,
    asphaltRoad,
    crateHazard,
    waterRipple,
    satelliteMapCanvas: mapC,
  };
}
