import * as THREE from 'three';
import { PlayerColor } from './ludoRules';

export type WoodFinishId = 'mahogany' | 'walnut' | 'teak';

export interface WoodFinishSpec {
  id: WoodFinishId;
  label: string;
  baseHex: string;
  grainHex: string;
  trimHex: string;
  tableHex: string;
}

export const WOOD_FINISHES: Record<WoodFinishId, WoodFinishSpec> = {
  mahogany: {
    id: 'mahogany',
    label: 'Royal Mahogany',
    baseHex: '#4a1c14',
    grainHex: '#2b0d08',
    trimHex: '#d4af37',
    tableHex: '#1b110c',
  },
  walnut: {
    id: 'walnut',
    label: 'Obsidian Walnut',
    baseHex: '#2f241f',
    grainHex: '#18110e',
    trimHex: '#c5a059',
    tableHex: '#120e0c',
  },
  teak: {
    id: 'teak',
    label: 'Imperial Teak',
    baseHex: '#6e4726',
    grainHex: '#3f2510',
    trimHex: '#e5c158',
    tableHex: '#1e150f',
  },
};

export const PLAYER_PBR_COLORS: Record<
  PlayerColor,
  { main: number; emissive: number; trim: number; lightHex: string }
> = {
  [PlayerColor.RED]: {
    main: 0xd92626,
    emissive: 0x3b0808,
    trim: 0xfbbf24,
    lightHex: '#ef4444',
  },
  [PlayerColor.GREEN]: {
    main: 0x16a34a,
    emissive: 0x052e16,
    trim: 0xfbbf24,
    lightHex: '#22c55e',
  },
  [PlayerColor.YELLOW]: {
    main: 0xd97706,
    emissive: 0x451a03,
    trim: 0xfef08a,
    lightHex: '#f59e0b',
  },
  [PlayerColor.BLUE]: {
    main: 0x2563eb,
    emissive: 0x0f172a,
    trim: 0xfbbf24,
    lightHex: '#3b82f6',
  },
};

/**
 * Generates a seamless procedural wood grain albedo + bump texture pair.
 */
export function createWoodTextures(
  finish: WoodFinishSpec,
  maxAnisotropy: number
): { map: THREE.CanvasTexture; bumpMap: THREE.CanvasTexture } {
  const size = 512;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const ctx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  ctx.fillStyle = finish.baseHex;
  ctx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  // Draw organic wood fibers & subtle cathedral rings
  for (let i = 0; i < 240; i++) {
    const y = (i / 240) * size;
    const alpha = 0.06 + (Math.sin(i * 0.37) * 0.5 + 0.5) * 0.14;
    ctx.strokeStyle = finish.grainHex;
    ctx.globalAlpha = alpha;
    ctx.lineWidth = 1 + (i % 3);
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) {
      const wave = Math.sin(x * 0.02 + i * 0.15) * 4;
      ctx.lineTo(x, y + wave);
    }
    ctx.stroke();

    bCtx.strokeStyle = i % 2 === 0 ? '#989898' : '#686868';
    bCtx.globalAlpha = 0.22;
    bCtx.lineWidth = 1.2;
    bCtx.beginPath();
    bCtx.moveTo(0, y);
    for (let x = 0; x <= size; x += 32) {
      const wave = Math.sin(x * 0.02 + i * 0.15) * 4;
      bCtx.lineTo(x, y + wave);
    }
    bCtx.stroke();
  }
  ctx.globalAlpha = 1;
  bCtx.globalAlpha = 1;

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = maxAnisotropy;

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = maxAnisotropy;

  return { map, bumpMap };
}

/**
 * Generates an inlaid Star Safe Tile texture (gold 8-point compass rose on ivory/colored marble).
 */
export function createStarTileTexture(
  bgColorHex: string,
  starColorHex: string,
  maxAnisotropy: number
): THREE.CanvasTexture {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  ctx.fillStyle = bgColorHex;
  ctx.fillRect(0, 0, size, size);

  // Subtle inner border
  ctx.strokeStyle = 'rgba(212, 175, 55, 0.55)';
  ctx.lineWidth = 8;
  ctx.strokeRect(12, 12, size - 24, size - 24);

  // 8-point compass star
  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.34;
  const innerR = size * 0.14;
  ctx.fillStyle = starColorHex;
  ctx.beginPath();
  for (let i = 0; i < 16; i++) {
    const r = i % 2 === 0 ? outerR : innerR;
    const angle = (i * Math.PI) / 8 - Math.PI / 2;
    const x = cx + Math.cos(angle) * r;
    const y = cy + Math.sin(angle) * r;
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.fill();

  // Center jewel dot
  ctx.fillStyle = bgColorHex;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.06, 0, Math.PI * 2);
  ctx.fill();

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/**
 * Generates the 6 face textures for the 3D physical die (1..6 pips with gold rim and crimson 6-pip).
 */
export function createDiceFaceMaterials(maxAnisotropy: number): THREE.MeshStandardMaterial[] {
  // Standard Three.js BoxGeometry material order:
  // 0: +X (right), 1: -X (left), 2: +Y (top), 3: -Y (bottom), 4: +Z (front), 5: -Z (back)
  // Let's map face values: +X=2, -X=5, +Y=1, -Y=6, +Z=3, -Z=4 (opposite faces sum to 7)
  const faceValues = [2, 5, 1, 6, 3, 4];

  return faceValues.map((val) => {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;

    // Warm ivory face with subtle radial vignette
    const grad = ctx.createRadialGradient(size / 2, size / 2, 20, size / 2, size / 2, size * 0.7);
    grad.addColorStop(0, '#fffdf7');
    grad.addColorStop(1, '#e6dcc8');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);

    // Subtle brass bevel border
    ctx.strokeStyle = '#c5a059';
    ctx.lineWidth = 10;
    ctx.strokeRect(8, 8, size - 16, size - 16);

    const pipPositions: Record<number, [number, number][]> = {
      1: [[0.5, 0.5]],
      2: [
        [0.28, 0.28],
        [0.72, 0.72],
      ],
      3: [
        [0.26, 0.26],
        [0.5, 0.5],
        [0.74, 0.74],
      ],
      4: [
        [0.28, 0.28],
        [0.72, 0.28],
        [0.28, 0.72],
        [0.72, 0.72],
      ],
      5: [
        [0.26, 0.26],
        [0.74, 0.26],
        [0.5, 0.5],
        [0.26, 0.74],
        [0.74, 0.74],
      ],
      6: [
        [0.28, 0.24],
        [0.72, 0.24],
        [0.28, 0.5],
        [0.72, 0.5],
        [0.28, 0.76],
        [0.72, 0.76],
      ],
    };

    const pips = pipPositions[val] || [];
    for (const [nx, ny] of pips) {
      const px = nx * size;
      const py = ny * size;
      const r = val === 1 ? size * 0.11 : val === 6 ? size * 0.085 : size * 0.082;

      // Gold outer ring on 1 and 6
      if (val === 1 || val === 6) {
        ctx.fillStyle = '#d4af37';
        ctx.beginPath();
        ctx.arc(px, py, r + 4, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.fillStyle = val === 1 || val === 6 ? '#b91c1c' : '#1c1917';
      ctx.beginPath();
      ctx.arc(px, py, r, 0, Math.PI * 2);
      ctx.fill();
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    tex.anisotropy = maxAnisotropy;

    return new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: tex,
      roughness: 0.22,
      metalness: 0.08,
    });
  });
}

/**
 * Returns the target Euler rotation (x, y, z) on the 3D cube so that `diceValue` (1..6) faces straight up (+Y).
 * Recall face order: 0:+X=2, 1:-X=5, 2:+Y=1, 3:-Y=6, 4:+Z=3, 5:-Z=4
 */
export function getDiceTargetRotation(diceValue: number): THREE.Euler {
  switch (diceValue) {
    case 1:
      // +Y is already up
      return new THREE.Euler(0, 0, 0);
    case 6:
      // -Y is up -> rotate X by PI
      return new THREE.Euler(Math.PI, 0, 0);
    case 2:
      // +X is up -> rotate Z by +PI/2
      return new THREE.Euler(0, 0, Math.PI / 2);
    case 5:
      // -X is up -> rotate Z by -PI/2
      return new THREE.Euler(0, 0, -Math.PI / 2);
    case 3:
      // +Z is up -> rotate X by -PI/2
      return new THREE.Euler(-Math.PI / 2, 0, 0);
    case 4:
      // -Z is up -> rotate X by +PI/2
      return new THREE.Euler(Math.PI / 2, 0, 0);
    default:
      return new THREE.Euler(0, 0, 0);
  }
}

/**
 * Generates a soft radial contact shadow texture so pieces & dice feel grounded on the board.
 */
export function createContactShadowTexture(): THREE.CanvasTexture {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;

  const grad = ctx.createRadialGradient(size / 2, size / 2, 4, size / 2, size / 2, size / 2);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.65)');
  grad.addColorStop(0.55, 'rgba(0, 0, 0, 0.28)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');

  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}
