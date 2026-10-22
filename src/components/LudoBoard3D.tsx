import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
  GridCoord,
  HOME_STRETCH_COORDS,
  LudoMatchState,
  MAIN_TRACK_COORDS,
  MoveOption,
  PLAYER_ORDER,
  PlayerColor,
  SAFE_TRACK_INDICES,
  START_TRACK_INDEX,
  TurnPhase,
  YARD_TOKEN_COORDS,
  getTokenGridCoord,
} from '../game/ludoRules';
import {
  PLAYER_PBR_COLORS,
  WOOD_FINISHES,
  WoodFinishId,
  createContactShadowTexture,
  createDiceFaceMaterials,
  createStarTileTexture,
  createWoodTextures,
  getDiceTargetRotation,
} from '../game/proceduralMaterials';
import { soundEngine } from '../game/soundEffects';

export type CameraPreset = 'isometric' | 'overhead' | 'pov';

export interface CelebrationTrigger {
  id: number;
  kind: 'kill' | 'six' | 'crown' | 'win' | 'party';
  color: PlayerColor;
  victimColor?: PlayerColor;
  targetCoord?: GridCoord;
}

interface LudoBoard3DProps {
  gameState: 'title' | 'playing' | 'paused' | 'gameover';
  matchState: LudoMatchState;
  legalMoves: MoveOption[];
  selectedMoveTokenIndex: number | null;
  hoveredTokenIndex: number | null;
  cameraPreset: CameraPreset;
  woodFinish: WoodFinishId;
  activeAnimationMove: {
    color: PlayerColor;
    move: MoveOption;
    onComplete: () => void;
  } | null;
  diceRollTrigger: {
    rollId: number;
    value: number;
    onSettled: () => void;
  } | null;
  celebrationTrigger: CelebrationTrigger | null;
  onSelectTokenMove: (tokenIndex: number) => void;
  onTriggerRollDice: () => void;
  onTriggerCelebrationEvent: (
    kind: 'kill' | 'six' | 'crown' | 'win' | 'party',
    color: PlayerColor,
    headline: string,
    subtext: string
  ) => void;
}

// Pre-allocated module-scope scratch objects for zero-GC render loop
const _vec3A = new THREE.Vector3();
const _vec3B = new THREE.Vector3();
const _vec3C = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scaleVec = new THREE.Vector3();
const _euler = new THREE.Euler();
const _color = new THREE.Color();

const TILE_SIZE = 1.0;
const BOARD_HALF = 7.0;

function gridToWorld(coord: GridCoord, target: THREE.Vector3, y: number = 0): THREE.Vector3 {
  return target.set((coord.col - BOARD_HALF) * TILE_SIZE, y, (coord.row - BOARD_HALF) * TILE_SIZE);
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  age: number;
  maxAge: number;
  scale: number;
  colorHex: number;
}

interface PawnVisual {
  id: string;
  color: PlayerColor;
  tokenIndex: number;
  root: THREE.Group;
  bodyMesh: THREE.Mesh;
  bodyMat: THREE.MeshStandardMaterial;
  highlightRing: THREE.Mesh;
  ringMat: THREE.MeshBasicMaterial;
  hitProxy: THREE.Mesh;
  currentWorldPos: THREE.Vector3;
  targetWorldPos: THREE.Vector3;
  squashY: number;
  flashTimer: number;
  knockbackTimer: number;
  knockbackFrom: THREE.Vector3;
}

interface DancerVisual {
  color: PlayerColor;
  root: THREE.Group;
  bodyGroup: THREE.Group;
  headGroup: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  stageRingMat: THREE.MeshBasicMaterial;
  happyHaloMesh: THREE.Mesh;
  sadCloudGroup: THREE.Group;
  mood: 'idle' | 'dancing' | 'sad';
  moodTimer: number;
  basePos: THREE.Vector3;
  baseRotY: number;
}

const CONFETTI_PALETTE = [0xef4444, 0x22c55e, 0xf59e0b, 0x3b82f6, 0xfef08a, 0xec4899, 0xa855f7];

export const LudoBoard3D: React.FC<LudoBoard3DProps> = ({
  gameState,
  matchState,
  legalMoves,
  selectedMoveTokenIndex,
  hoveredTokenIndex,
  cameraPreset,
  woodFinish,
  activeAnimationMove,
  diceRollTrigger,
  celebrationTrigger,
  onSelectTokenMove,
  onTriggerRollDice,
  onTriggerCelebrationEvent,
}) => {
  const mountRef = useRef<HTMLDivElement | null>(null);

  // Store latest props in refs so the 60fps loop reads them without re-mounting WebGL
  const propsRef = useRef({
    gameState,
    matchState,
    legalMoves,
    selectedMoveTokenIndex,
    hoveredTokenIndex,
    cameraPreset,
    woodFinish,
    activeAnimationMove,
    diceRollTrigger,
    celebrationTrigger,
    onSelectTokenMove,
    onTriggerRollDice,
    onTriggerCelebrationEvent,
  });
  propsRef.current = {
    gameState,
    matchState,
    legalMoves,
    selectedMoveTokenIndex,
    hoveredTokenIndex,
    cameraPreset,
    woodFinish,
    activeAnimationMove,
    diceRollTrigger,
    celebrationTrigger,
    onSelectTokenMove,
    onTriggerRollDice,
    onTriggerCelebrationEvent,
  };

  const woodFinishMaterialRef = useRef<{
    frameMat: THREE.MeshStandardMaterial | null;
    tableMat: THREE.MeshStandardMaterial | null;
    maxAnisotropy: number;
  }>({
    frameMat: null,
    tableMat: null,
    maxAnisotropy: 1,
  });

  // Update wood finish dynamically when prop changes
  useEffect(() => {
    const { frameMat, tableMat, maxAnisotropy } = woodFinishMaterialRef.current;
    if (!frameMat || !tableMat) return;
    const spec = WOOD_FINISHES[woodFinish] || WOOD_FINISHES.mahogany;
    const { map, bumpMap } = createWoodTextures(spec, maxAnisotropy);
    if (frameMat.map) frameMat.map.dispose();
    if (frameMat.bumpMap) frameMat.bumpMap.dispose();
    frameMat.map = map;
    frameMat.bumpMap = bumpMap;
    frameMat.needsUpdate = true;
    tableMat.color.set(spec.tableHex);
  }, [woodFinish]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    // 1. Software WebGL detection per threejs skill
    const isSoftwareGl = (() => {
      const probeCanvas = document.createElement('canvas');
      const gl = probeCanvas.getContext('webgl2');
      if (!gl) return true;
      const ext = gl.getExtension('WEBGL_debug_renderer_info');
      const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
      const gpu = String(gl.getParameter(param));
      gl.getExtension('WEBGL_lose_context')?.loseContext();
      return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    })();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    const renderer = new THREE.WebGLRenderer({
      antialias: !isSoftwareGl,
      powerPreference: 'high-performance',
    });
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.12;
    renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = !isSoftwareGl;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.domElement.dataset.testid = 'ludo-3d-canvas';

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const maxAnisotropy = renderer.capabilities.getMaxAnisotropy();
    woodFinishMaterialRef.current.maxAnisotropy = maxAnisotropy;

    // 2. Scene, Fog & Studio Environment Reflection
    const scene = new THREE.Scene();
    const bgHex = 0x140e0b;
    scene.background = new THREE.Color(bgHex);
    scene.fog = new THREE.FogExp2(bgHex, 0.016);

    const pmremGenerator = new THREE.PMREMGenerator(renderer);
    scene.environment = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    pmremGenerator.dispose();

    // 3. Camera & OrbitControls
    const camera = new THREE.PerspectiveCamera(44, width / height, 0.1, 120);
    camera.position.set(0, 17.2, 15.2);
    camera.lookAt(0, 0, 0);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 8.5;
    controls.maxDistance = 30;
    controls.maxPolarAngle = Math.PI / 2.15;
    controls.minPolarAngle = 0.12;
    controls.target.set(0, 0.2, 0);

    let userInteractingWithCamera = false;
    controls.addEventListener('start', () => {
      userInteractingWithCamera = true;
    });

    // 4. Balanced 3-Point Warm/Cool Studio Lighting Rig
    const hemiLight = new THREE.HemisphereLight(0xffe8c2, 0x252c42, 0.85);
    hemiLight.position.set(0, 20, 0);
    scene.add(hemiLight);

    const keyLight = new THREE.DirectionalLight(0xfff1d6, 1.9);
    keyLight.position.set(9, 18, 11);
    keyLight.castShadow = !isSoftwareGl;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 2;
    keyLight.shadow.camera.far = 42;
    const d = 11.5;
    keyLight.shadow.camera.left = -d;
    keyLight.shadow.camera.right = d;
    keyLight.shadow.camera.top = d;
    keyLight.shadow.camera.bottom = -d;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
    scene.add(keyLight);

    const rimLight = new THREE.DirectionalLight(0x93c5fd, 0.65);
    rimLight.position.set(-11, 12, -10);
    scene.add(rimLight);

    // 5. Build the Parlor Table & Heirloom Ludo Board
    const boardGroup = new THREE.Group();
    scene.add(boardGroup);

    const initialFinish = WOOD_FINISHES[propsRef.current.woodFinish] || WOOD_FINISHES.mahogany;
    const { map: woodMap, bumpMap: woodBump } = createWoodTextures(initialFinish, maxAnisotropy);

    const tableMat = new THREE.MeshStandardMaterial({
      color: initialFinish.tableHex,
      roughness: 0.72,
      metalness: 0.05,
    });
    woodFinishMaterialRef.current.tableMat = tableMat;

    // Surrounding Parlor Table Pedestal
    const tableMesh = new THREE.Mesh(new THREE.CylinderGeometry(24, 26, 0.8, 48), tableMat);
    tableMesh.position.set(0, -0.72, 0);
    tableMesh.receiveShadow = !isSoftwareGl;
    boardGroup.add(tableMesh);

    const frameMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: woodMap,
      bumpMap: woodBump,
      bumpScale: 0.03,
      roughness: 0.36,
      metalness: 0.1,
    });
    woodFinishMaterialRef.current.frameMat = frameMat;

    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      roughness: 0.24,
      metalness: 0.88,
    });

    const darkObsidianMat = new THREE.MeshStandardMaterial({
      color: 0x181311,
      roughness: 0.3,
      metalness: 0.65,
    });

    const ivoryBoardMat = new THREE.MeshStandardMaterial({
      color: 0xf6efe2,
      roughness: 0.45,
      metalness: 0.04,
    });

    // Main recessed board slab (15x15 units)
    const slabGeo = new THREE.BoxGeometry(15.2, 0.4, 15.2);
    const slabMesh = new THREE.Mesh(slabGeo, ivoryBoardMat);
    slabMesh.position.set(0, -0.2, 0);
    slabMesh.receiveShadow = !isSoftwareGl;
    boardGroup.add(slabMesh);

    // 4 Beveled Wooden Cabinet Border Rails + Brass Corner Caps
    const railLength = 16.4;
    const railThick = 0.65;
    const railHeight = 0.56;
    const railPositions: [number, number, number, number, number][] = [
      [0, -0.08, -7.9, railLength, railThick],
      [0, -0.08, 7.9, railLength, railThick],
      [-7.9, -0.08, 0, railThick, railLength - railThick * 2],
      [7.9, -0.08, 0, railThick, railLength - railThick * 2],
    ];
    for (const [rx, ry, rz, rw, rd] of railPositions) {
      const rail = new THREE.Mesh(new THREE.BoxGeometry(rw, railHeight, rd), frameMat);
      rail.position.set(rx, ry, rz);
      rail.castShadow = !isSoftwareGl;
      rail.receiveShadow = !isSoftwareGl;
      boardGroup.add(rail);
    }

    // 4 Brass Corner Escutcheons + Confetti Cannon Nozzles
    const cornerCoords: [number, number][] = [
      [-7.9, -7.9],
      [7.9, -7.9],
      [-7.9, 7.9],
      [7.9, 7.9],
    ];
    for (const [cx, cz] of cornerCoords) {
      const cap = new THREE.Mesh(new THREE.BoxGeometry(0.76, 0.6, 0.76), brassMat);
      cap.position.set(cx, -0.06, cz);
      boardGroup.add(cap);

      // Corner Confetti Cannon Mortar
      const cannonBarrel = new THREE.Mesh(
        new THREE.CylinderGeometry(0.22, 0.28, 0.55, 16),
        brassMat
      );
      cannonBarrel.position.set(cx, 0.42, cz);
      cannonBarrel.lookAt(0, 4.5, 0);
      boardGroup.add(cannonBarrel);
    }

    // 6. Construct the 4 Player Starting Yards (6x6 corners)
    const yardCenters: Record<PlayerColor, { col: number; row: number }> = {
      [PlayerColor.RED]: { col: 2.5, row: 2.5 },
      [PlayerColor.GREEN]: { col: 11.5, row: 2.5 },
      [PlayerColor.YELLOW]: { col: 11.5, row: 11.5 },
      [PlayerColor.BLUE]: { col: 2.5, row: 11.5 },
    };

    const socketGeo = new THREE.CylinderGeometry(0.42, 0.46, 0.08, 24);
    const socketRingGeo = new THREE.RingGeometry(0.36, 0.45, 24);
    socketRingGeo.rotateX(-Math.PI / 2);

    for (const color of PLAYER_ORDER) {
      const pbr = PLAYER_PBR_COLORS[color];
      const yardMat = new THREE.MeshStandardMaterial({
        color: pbr.main,
        roughness: 0.42,
        metalness: 0.08,
      });

      const yc = yardCenters[color];
      gridToWorld(yc, _vec3A, 0.03);

      const yardOuter = new THREE.Mesh(new THREE.BoxGeometry(5.82, 0.06, 5.82), yardMat);
      yardOuter.position.copy(_vec3A);
      yardOuter.receiveShadow = !isSoftwareGl;
      boardGroup.add(yardOuter);

      const yardInner = new THREE.Mesh(new THREE.BoxGeometry(4.0, 0.08, 4.0), ivoryBoardMat);
      yardInner.position.set(_vec3A.x, 0.05, _vec3A.z);
      yardInner.receiveShadow = !isSoftwareGl;
      boardGroup.add(yardInner);

      const trimRing = new THREE.Mesh(new THREE.BoxGeometry(4.18, 0.065, 4.18), brassMat);
      trimRing.position.set(_vec3A.x, 0.042, _vec3A.z);
      boardGroup.add(trimRing);

      for (const yardTokenCoord of YARD_TOKEN_COORDS[color]) {
        gridToWorld(yardTokenCoord, _vec3B, 0.08);
        const pad = new THREE.Mesh(socketGeo, yardMat);
        pad.position.copy(_vec3B);
        pad.receiveShadow = !isSoftwareGl;
        boardGroup.add(pad);

        const brassRim = new THREE.Mesh(socketRingGeo, brassMat);
        brassRim.position.set(_vec3B.x, 0.125, _vec3B.z);
        boardGroup.add(brassRim);
      }
    }

    // 7. Construct the 52 Main Track Tiles + 20 Home Stretch Tiles
    const tileGeo = new THREE.BoxGeometry(0.92, 0.05, 0.92);
    const tileBorderGeo = new THREE.BoxGeometry(0.97, 0.03, 0.97);
    const tileBorderMat = new THREE.MeshStandardMaterial({
      color: 0xc8b99e,
      roughness: 0.55,
      metalness: 0.2,
    });

    const neutralTileMat = new THREE.MeshStandardMaterial({
      color: 0xfbf7ef,
      roughness: 0.38,
      metalness: 0.05,
    });

    const starSafeTex = createStarTileTexture('#fbf7ef', '#d4af37', maxAnisotropy);
    const starSafeMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      map: starSafeTex,
      roughness: 0.32,
      metalness: 0.15,
    });

    const coloredStartStarMats: Record<PlayerColor, THREE.MeshStandardMaterial> = {
      [PlayerColor.RED]: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: createStarTileTexture('#dc2626', '#fef08a', maxAnisotropy),
        roughness: 0.32,
        metalness: 0.12,
      }),
      [PlayerColor.GREEN]: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: createStarTileTexture('#16a34a', '#fef08a', maxAnisotropy),
        roughness: 0.32,
        metalness: 0.12,
      }),
      [PlayerColor.YELLOW]: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: createStarTileTexture('#d97706', '#fef08a', maxAnisotropy),
        roughness: 0.32,
        metalness: 0.12,
      }),
      [PlayerColor.BLUE]: new THREE.MeshStandardMaterial({
        color: 0xffffff,
        map: createStarTileTexture('#2563eb', '#fef08a', maxAnisotropy),
        roughness: 0.32,
        metalness: 0.12,
      }),
    };

    const coloredTileMats: Record<PlayerColor, THREE.MeshStandardMaterial> = {
      [PlayerColor.RED]: new THREE.MeshStandardMaterial({
        color: PLAYER_PBR_COLORS.RED.main,
        roughness: 0.36,
        metalness: 0.08,
      }),
      [PlayerColor.GREEN]: new THREE.MeshStandardMaterial({
        color: PLAYER_PBR_COLORS.GREEN.main,
        roughness: 0.36,
        metalness: 0.08,
      }),
      [PlayerColor.YELLOW]: new THREE.MeshStandardMaterial({
        color: PLAYER_PBR_COLORS.YELLOW.main,
        roughness: 0.36,
        metalness: 0.08,
      }),
      [PlayerColor.BLUE]: new THREE.MeshStandardMaterial({
        color: PLAYER_PBR_COLORS.BLUE.main,
        roughness: 0.36,
        metalness: 0.08,
      }),
    };

    MAIN_TRACK_COORDS.forEach((coord, trackIdx) => {
      gridToWorld(coord, _vec3A, 0.025);

      const border = new THREE.Mesh(tileBorderGeo, tileBorderMat);
      border.position.set(_vec3A.x, 0.015, _vec3A.z);
      boardGroup.add(border);

      let mat = neutralTileMat;
      if (trackIdx === START_TRACK_INDEX.RED) mat = coloredStartStarMats.RED;
      else if (trackIdx === START_TRACK_INDEX.GREEN) mat = coloredStartStarMats.GREEN;
      else if (trackIdx === START_TRACK_INDEX.YELLOW) mat = coloredStartStarMats.YELLOW;
      else if (trackIdx === START_TRACK_INDEX.BLUE) mat = coloredStartStarMats.BLUE;
      else if (SAFE_TRACK_INDICES.has(trackIdx)) mat = starSafeMat;

      const tile = new THREE.Mesh(tileGeo, mat);
      tile.position.copy(_vec3A);
      tile.receiveShadow = !isSoftwareGl;
      boardGroup.add(tile);
    });

    for (const color of PLAYER_ORDER) {
      for (const coord of HOME_STRETCH_COORDS[color]) {
        gridToWorld(coord, _vec3A, 0.03);
        const border = new THREE.Mesh(tileBorderGeo, brassMat);
        border.position.set(_vec3A.x, 0.018, _vec3A.z);
        boardGroup.add(border);

        const tile = new THREE.Mesh(tileGeo, coloredTileMats[color]);
        tile.position.copy(_vec3A);
        tile.receiveShadow = !isSoftwareGl;
        boardGroup.add(tile);
      }
    }

    // 8. Construct the Center 3x3 Imperial Crown Sanctuary
    const crownGroup = new THREE.Group();
    crownGroup.position.set(0, 0.02, 0);
    boardGroup.add(crownGroup);

    const wedgeConfigs: { color: PlayerColor; rotY: number }[] = [
      { color: PlayerColor.RED, rotY: Math.PI },
      { color: PlayerColor.GREEN, rotY: Math.PI / 2 },
      { color: PlayerColor.YELLOW, rotY: 0 },
      { color: PlayerColor.BLUE, rotY: -Math.PI / 2 },
    ];

    for (const { color, rotY } of wedgeConfigs) {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.lineTo(1.46, -1.46);
      shape.lineTo(1.46, 1.46);
      shape.closePath();

      const extrudeGeo = new THREE.ExtrudeGeometry(shape, {
        depth: 0.08,
        bevelEnabled: true,
        bevelSegments: 2,
        steps: 1,
        bevelSize: 0.02,
        bevelThickness: 0.02,
      });
      extrudeGeo.rotateX(Math.PI / 2);
      const wedgeMesh = new THREE.Mesh(extrudeGeo, coloredTileMats[color]);
      wedgeMesh.rotation.y = rotY;
      wedgeMesh.position.y = 0.09;
      wedgeMesh.receiveShadow = !isSoftwareGl;
      crownGroup.add(wedgeMesh);
    }

    const plinth = new THREE.Mesh(new THREE.CylinderGeometry(0.52, 0.62, 0.16, 32), brassMat);
    plinth.position.y = 0.14;
    crownGroup.add(plinth);

    const crownRing = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.055, 16, 32), brassMat);
    crownRing.rotation.x = Math.PI / 2;
    crownRing.position.y = 0.24;
    crownGroup.add(crownRing);

    const jewelMat = new THREE.MeshPhysicalMaterial({
      color: 0xfef08a,
      roughness: 0.12,
      metalness: 0.2,
      clearcoat: 1.0,
    });
    const centerOrb = new THREE.Mesh(new THREE.OctahedronGeometry(0.24, 1), jewelMat);
    centerOrb.position.y = 0.42;
    crownGroup.add(centerOrb);

    // 8B. Construct 4 Articulated 3D House Mascot Dancers & 2 Parlor Boombox Speakers around the Board!
    const dancers: DancerVisual[] = [];
    const dancerCornerConfigs: {
      color: PlayerColor;
      x: number;
      z: number;
      rotY: number;
    }[] = [
      { color: PlayerColor.RED, x: -10.2, z: -4.2, rotY: Math.PI / 5 },
      { color: PlayerColor.GREEN, x: 10.2, z: -4.2, rotY: -Math.PI / 5 },
      { color: PlayerColor.YELLOW, x: 10.2, z: 4.2, rotY: -Math.PI / 6 },
      { color: PlayerColor.BLUE, x: -10.2, z: 4.2, rotY: Math.PI / 6 },
    ];

    const dancerStageGeo = new THREE.CylinderGeometry(0.95, 1.12, 0.24, 24);
    const dancerStageRingGeo = new THREE.RingGeometry(0.88, 1.04, 28);
    dancerStageRingGeo.rotateX(-Math.PI / 2);
    const dancerTorsoGeo = new THREE.CylinderGeometry(0.28, 0.36, 0.72, 18);
    const dancerHeadGeo = new THREE.SphereGeometry(0.29, 20, 16);
    const dancerVisorGeo = new THREE.BoxGeometry(0.46, 0.13, 0.24);
    const dancerCrownGeo = new THREE.ConeGeometry(0.22, 0.28, 8);
    const dancerLimbGeo = new THREE.CapsuleGeometry(0.09, 0.38, 8, 12);

    for (const cfg of dancerCornerConfigs) {
      const pbr = PLAYER_PBR_COLORS[cfg.color];
      const dancerMat = new THREE.MeshStandardMaterial({
        color: pbr.main,
        emissive: pbr.emissive,
        emissiveIntensity: 0.22,
        roughness: 0.25,
        metalness: 0.18,
      });

      const root = new THREE.Group();
      root.position.set(cfg.x, -0.32, cfg.z);
      root.rotation.y = cfg.rotY;
      root.scale.setScalar(1.22);
      scene.add(root);

      // Part 1: Stage Pedestal & Glowing Party Ring
      const stagePedestal = new THREE.Mesh(dancerStageGeo, darkObsidianMat);
      stagePedestal.position.y = 0.12;
      root.add(stagePedestal);

      const stageRingMat = new THREE.MeshBasicMaterial({
        color: pbr.main,
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.85,
      });
      const stageRing = new THREE.Mesh(dancerStageRingGeo, stageRingMat);
      stageRing.position.y = 0.25;
      root.add(stageRing);

      // Articulated Body Root
      const bodyGroup = new THREE.Group();
      bodyGroup.position.y = 0.26;
      root.add(bodyGroup);

      // Part 2 & 3: Left & Right Legs
      const leftLeg = new THREE.Group();
      leftLeg.position.set(-0.16, 0.32, 0);
      const leftLegMesh = new THREE.Mesh(dancerLimbGeo, brassMat);
      leftLegMesh.position.y = -0.14;
      leftLeg.add(leftLegMesh);
      bodyGroup.add(leftLeg);

      const rightLeg = new THREE.Group();
      rightLeg.position.set(0.16, 0.32, 0);
      const rightLegMesh = new THREE.Mesh(dancerLimbGeo, brassMat);
      rightLegMesh.position.y = -0.14;
      rightLeg.add(rightLegMesh);
      bodyGroup.add(rightLeg);

      // Part 4: Torso + Gold Belt
      const torsoMesh = new THREE.Mesh(dancerTorsoGeo, dancerMat);
      torsoMesh.position.y = 0.72;
      torsoMesh.castShadow = !isSoftwareGl;
      bodyGroup.add(torsoMesh);

      const beltMesh = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.045, 10, 20), brassMat);
      beltMesh.rotation.x = Math.PI / 2;
      beltMesh.position.y = 0.52;
      bodyGroup.add(beltMesh);

      // Part 5 & 6: Articulated Left & Right Dancing Arms
      const leftArm = new THREE.Group();
      leftArm.position.set(-0.36, 0.96, 0);
      const leftArmMesh = new THREE.Mesh(dancerLimbGeo, dancerMat);
      leftArmMesh.position.y = -0.18;
      const leftGlove = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), brassMat);
      leftGlove.position.y = -0.4;
      leftArm.add(leftArmMesh, leftGlove);
      bodyGroup.add(leftArm);

      const rightArm = new THREE.Group();
      rightArm.position.set(0.36, 0.96, 0);
      const rightArmMesh = new THREE.Mesh(dancerLimbGeo, dancerMat);
      rightArmMesh.position.y = -0.18;
      const rightGlove = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 12), brassMat);
      rightGlove.position.y = -0.4;
      rightArm.add(rightArmMesh, rightGlove);
      bodyGroup.add(rightArm);

      // Part 7, 8, 9: Head + Cool Sunglasses Visor + Golden Party Crown
      const headGroup = new THREE.Group();
      headGroup.position.y = 1.28;
      const headMesh = new THREE.Mesh(dancerHeadGeo, dancerMat);
      const visorMesh = new THREE.Mesh(dancerVisorGeo, darkObsidianMat);
      visorMesh.position.set(0, 0.04, 0.2);
      const crownHat = new THREE.Mesh(dancerCrownGeo, brassMat);
      crownHat.position.set(0, 0.34, 0);
      headGroup.add(headMesh, visorMesh, crownHat);
      bodyGroup.add(headGroup);

      // Happy Victory Halo (visible only when this player rolls 6, kills a goti, or wins center)
      const happyHaloMesh = new THREE.Mesh(
        new THREE.TorusGeometry(0.42, 0.045, 12, 24),
        new THREE.MeshBasicMaterial({ color: 0xfef08a })
      );
      happyHaloMesh.rotation.x = Math.PI / 2;
      happyHaloMesh.position.set(0, 2.02, 0);
      happyHaloMesh.visible = false;
      bodyGroup.add(happyHaloMesh);

      // Upset / Not Happy Storm Cloud & Teardrops (visible when this player's goti gets killed!)
      const sadCloudGroup = new THREE.Group();
      sadCloudGroup.position.set(0, 2.15, 0);
      sadCloudGroup.visible = false;
      const stormMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        roughness: 0.7,
        metalness: 0.1,
      });
      const tearMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
      const puffCenter = new THREE.Mesh(new THREE.SphereGeometry(0.26, 14, 12), stormMat);
      const puffLeft = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), stormMat);
      puffLeft.position.set(-0.22, -0.04, 0);
      const puffRight = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), stormMat);
      puffRight.position.set(0.22, -0.04, 0);
      const tear1 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), tearMat);
      tear1.position.set(-0.14, -0.34, 0.08);
      const tear2 = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.18, 8), tearMat);
      tear2.position.set(0.14, -0.42, 0.08);
      sadCloudGroup.add(puffCenter, puffLeft, puffRight, tear1, tear2);
      root.add(sadCloudGroup);

      dancers.push({
        color: cfg.color,
        root,
        bodyGroup,
        headGroup,
        leftArm,
        rightArm,
        leftLeg,
        rightLeg,
        stageRingMat,
        happyHaloMesh,
        sadCloudGroup,
        mood: 'idle',
        moodTimer: 0,
        basePos: new THREE.Vector3(cfg.x, -0.32, cfg.z),
        baseRotY: cfg.rotY,
      });
    }

    // 2 Parlor Boombox Speaker Towers on West & East Flanks
    const speakerCones: THREE.Mesh[] = [];
    for (const sx of [-10.1, 10.1]) {
      const boombox = new THREE.Group();
      boombox.position.set(sx, 0.35, 0);
      boombox.rotation.y = sx < 0 ? Math.PI / 2 : -Math.PI / 2;

      const cabinet = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1.35, 0.95), darkObsidianMat);
      const goldTrim = new THREE.Mesh(new THREE.BoxGeometry(2.26, 0.08, 1.0), brassMat);
      goldTrim.position.y = 0.66;
      const handle = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.18, 0.16), brassMat);
      handle.position.y = 0.82;
      boombox.add(cabinet, goldTrim, handle);

      for (const wx of [-0.62, 0.62]) {
        const rim = new THREE.Mesh(new THREE.TorusGeometry(0.38, 0.05, 12, 24), brassMat);
        rim.position.set(wx, -0.04, 0.49);
        const cone = new THREE.Mesh(
          new THREE.CylinderGeometry(0.35, 0.15, 0.12, 20).rotateX(Math.PI / 2),
          jewelMat
        );
        cone.position.set(wx, -0.04, 0.46);
        speakerCones.push(cone);
        boombox.add(rim, cone);
      }

      boardGroup.add(boombox);
    }

    // 8C. Giant 3D "GOTI SMASH" Golden Toy Mallet (swoops in on captures & smash previews!)
    const smashHammerGroup = new THREE.Group();
    smashHammerGroup.visible = false;
    const hammerHandle = new THREE.Mesh(
      new THREE.CylinderGeometry(0.11, 0.14, 2.6, 16),
      frameMat
    );
    hammerHandle.position.y = 1.3;
    const hammerHead = new THREE.Mesh(
      new THREE.CylinderGeometry(0.58, 0.58, 1.35, 24).rotateZ(Math.PI / 2),
      brassMat
    );
    hammerHead.position.y = 2.55;
    const hammerCapL = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.12, 24).rotateZ(Math.PI / 2),
      coloredTileMats.RED
    );
    hammerCapL.position.set(-0.68, 2.55, 0);
    const hammerCapR = new THREE.Mesh(
      new THREE.CylinderGeometry(0.62, 0.62, 0.12, 24).rotateZ(Math.PI / 2),
      coloredTileMats.RED
    );
    hammerCapR.position.set(0.68, 2.55, 0);
    smashHammerGroup.add(hammerHandle, hammerHead, hammerCapL, hammerCapR);
    scene.add(smashHammerGroup);

    // Shockwave Ring on the board for Goti Kills
    const shockwaveMat = new THREE.MeshBasicMaterial({
      color: 0xfef08a,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0,
      depthWrite: false,
    });
    const shockwaveMesh = new THREE.Mesh(
      new THREE.RingGeometry(0.4, 0.68, 32).rotateX(-Math.PI / 2),
      shockwaveMat
    );
    shockwaveMesh.position.y = 0.09;
    scene.add(shockwaveMesh);

    // 9. Build the 16 Composite 6-Part Lathe-Crafted Pawns + Contact Shadows
    const contactShadowTex = createContactShadowTexture();
    const shadowMat = new THREE.MeshBasicMaterial({
      map: contactShadowTex,
      transparent: true,
      opacity: 0.48,
      depthWrite: false,
    });
    const shadowGeo = new THREE.CircleGeometry(0.38, 24);
    shadowGeo.rotateX(-Math.PI / 2);

    const lathePoints: THREE.Vector2[] = [
      new THREE.Vector2(0.0, 0.0),
      new THREE.Vector2(0.31, 0.0),
      new THREE.Vector2(0.33, 0.06),
      new THREE.Vector2(0.27, 0.14),
      new THREE.Vector2(0.21, 0.28),
      new THREE.Vector2(0.15, 0.52),
      new THREE.Vector2(0.22, 0.62),
      new THREE.Vector2(0.14, 0.68),
      new THREE.Vector2(0.0, 0.72),
    ];
    const pawnLatheGeo = new THREE.LatheGeometry(lathePoints, 24);
    const pawnBaseBandGeo = new THREE.CylinderGeometry(0.325, 0.335, 0.055, 24);
    const pawnCollarGeo = new THREE.TorusGeometry(0.18, 0.032, 12, 24);
    pawnCollarGeo.rotateX(Math.PI / 2);
    const pawnHeadGeo = new THREE.SphereGeometry(0.19, 24, 18);
    const pawnFinialGeo = new THREE.ConeGeometry(0.065, 0.14, 16);
    const highlightRingGeo = new THREE.RingGeometry(0.36, 0.47, 28);
    highlightRingGeo.rotateX(-Math.PI / 2);
    const hitProxyGeo = new THREE.CylinderGeometry(0.4, 0.4, 1.15, 12);

    const pawnVisuals: PawnVisual[] = [];
    const interactableMeshes: THREE.Object3D[] = [];

    for (const color of PLAYER_ORDER) {
      const pbr = PLAYER_PBR_COLORS[color];
      for (let idx = 0; idx < 4; idx++) {
        const root = new THREE.Group();
        const id = `${color}-${idx}`;

        const bodyMat = new THREE.MeshStandardMaterial({
          color: pbr.main,
          emissive: pbr.emissive,
          emissiveIntensity: 0.15,
          roughness: 0.2,
          metalness: 0.15,
        });

        const bodyMesh = new THREE.Mesh(pawnLatheGeo, bodyMat);
        bodyMesh.castShadow = !isSoftwareGl;
        bodyMesh.receiveShadow = !isSoftwareGl;
        root.add(bodyMesh);

        const headMesh = new THREE.Mesh(pawnHeadGeo, bodyMat);
        headMesh.position.y = 0.82;
        headMesh.castShadow = !isSoftwareGl;
        root.add(headMesh);

        const baseBand = new THREE.Mesh(pawnBaseBandGeo, brassMat);
        baseBand.position.y = 0.035;
        root.add(baseBand);

        const collar = new THREE.Mesh(pawnCollarGeo, brassMat);
        collar.position.y = 0.63;
        root.add(collar);

        const finial = new THREE.Mesh(pawnFinialGeo, brassMat);
        finial.position.y = 1.04;
        root.add(finial);

        const contactShadow = new THREE.Mesh(shadowGeo, shadowMat);
        contactShadow.position.y = 0.015;
        root.add(contactShadow);

        const ringMat = new THREE.MeshBasicMaterial({
          color: 0xfef08a,
          side: THREE.DoubleSide,
          transparent: true,
          opacity: 0.0,
          depthWrite: false,
        });
        const highlightRing = new THREE.Mesh(highlightRingGeo, ringMat);
        highlightRing.position.y = 0.025;
        root.add(highlightRing);

        const hitProxy = new THREE.Mesh(
          hitProxyGeo,
          new THREE.MeshBasicMaterial({ visible: false })
        );
        hitProxy.position.y = 0.55;
        hitProxy.userData = { type: 'pawn', color, tokenIndex: idx, id };
        root.add(hitProxy);
        interactableMeshes.push(hitProxy);

        const initialCoord = getTokenGridCoord(color, idx, -1);
        const currentWorldPos = new THREE.Vector3();
        gridToWorld(initialCoord, currentWorldPos, 0.08);
        root.position.copy(currentWorldPos);

        scene.add(root);

        pawnVisuals.push({
          id,
          color,
          tokenIndex: idx,
          root,
          bodyMesh,
          bodyMat,
          highlightRing,
          ringMat,
          hitProxy,
          currentWorldPos,
          targetWorldPos: currentWorldPos.clone(),
          squashY: 1,
          flashTimer: 0,
          knockbackTimer: 0,
          knockbackFrom: currentWorldPos.clone(),
        });
      }
    }

    // 10. Build the 3D Physical Die (6 Pip Textures with Gold Bevel Borders + Grounded Contact Shadow)
    const diceGroup = new THREE.Group();
    const diceMaterials = createDiceFaceMaterials(maxAnisotropy);
    const diceCubeGeo = new THREE.BoxGeometry(0.88, 0.88, 0.88);
    const diceCubeMesh = new THREE.Mesh(diceCubeGeo, diceMaterials);
    diceCubeMesh.castShadow = !isSoftwareGl;
    diceCubeMesh.receiveShadow = !isSoftwareGl;
    diceCubeMesh.userData = { type: 'dice' };
    diceGroup.add(diceCubeMesh);
    interactableMeshes.push(diceCubeMesh);

    const diceShadowMesh = new THREE.Mesh(
      new THREE.CircleGeometry(0.55, 24).rotateX(-Math.PI / 2),
      shadowMat
    );
    diceShadowMesh.position.set(0, 0.14, 0);
    scene.add(diceShadowMesh);

    diceGroup.position.set(0, 0.92, 0);
    scene.add(diceGroup);

    // 11. Zero-GC Pooled Particle Ring Buffer (`THREE.InstancedMesh` of 112 rainbow confetti + sparks)
    const PARTICLE_CAP = 112;
    const particleGeo = new THREE.OctahedronGeometry(0.11, 0);
    const particleMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const particleInstanced = new THREE.InstancedMesh(particleGeo, particleMat, PARTICLE_CAP);
    particleInstanced.frustumCulled = false;
    scene.add(particleInstanced);

    const particlePool: ParticleSlot[] = Array.from({ length: PARTICLE_CAP }, () => ({
      active: false,
      x: 0,
      y: -10,
      z: 0,
      vx: 0,
      vy: 0,
      vz: 0,
      age: 0,
      maxAge: 0.6,
      scale: 1,
      colorHex: 0xfef08a,
    }));
    let particleCursor = 0;

    function spawnParticleBurst(
      wx: number,
      wy: number,
      wz: number,
      count: number,
      colorHex: number | 'rainbow',
      speedScale: number = 1
    ) {
      for (let i = 0; i < count; i++) {
        const slot = particlePool[particleCursor];
        particleCursor = (particleCursor + 1) % PARTICLE_CAP;
        const angle = (Math.PI * 2 * i) / count + Math.random() * 0.4;
        const spd = (1.8 + Math.random() * 3.2) * speedScale;
        slot.active = true;
        slot.x = wx;
        slot.y = wy + 0.15;
        slot.z = wz;
        slot.vx = Math.cos(angle) * spd;
        slot.vy = (2.8 + Math.random() * 3.6) * speedScale;
        slot.vz = Math.sin(angle) * spd;
        slot.age = 0;
        slot.maxAge = 0.55 + Math.random() * 0.45;
        slot.scale = 0.85 + Math.random() * 0.85;
        slot.colorHex =
          colorHex === 'rainbow'
            ? CONFETTI_PALETTE[i % CONFETTI_PALETTE.length]
            : colorHex;
      }
    }

    function fireCornerConfettiCannons() {
      for (const [cx, cz] of cornerCoords) {
        spawnParticleBurst(cx * 0.85, 0.8, cz * 0.85, 14, 'rainbow', 1.45);
      }
    }

    // Initialize offscreen matrices
    for (let i = 0; i < PARTICLE_CAP; i++) {
      _mat4.makeScale(0, 0, 0);
      particleInstanced.setMatrixAt(i, _mat4);
      particleInstanced.setColorAt(i, _color.setHex(0xfef08a));
    }
    particleInstanced.instanceMatrix.needsUpdate = true;
    if (particleInstanced.instanceColor) particleInstanced.instanceColor.needsUpdate = true;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // 12. Raycasting & Pointer Interaction
    const raycaster = new THREE.Raycaster();
    const pointerNdc = new THREE.Vector2();
    let lastHoverTime = 0;

    function getCanvasMouseNdc(clientX: number, clientY: number) {
      const rect = renderer.domElement.getBoundingClientRect();
      pointerNdc.x = ((clientX - rect.left) / Math.max(1, rect.width)) * 2 - 1;
      pointerNdc.y = -((clientY - rect.top) / Math.max(1, rect.height)) * 2 + 1;
    }

    function onPointerDown(e: PointerEvent) {
      if (propsRef.current.gameState !== 'playing') return;
      getCanvasMouseNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(interactableMeshes, false);
      if (hits.length === 0) return;

      const hitData = hits[0].object.userData;
      const { matchState: ms, legalMoves: moves } = propsRef.current;

      if (hitData.type === 'dice' && ms.turnPhase === TurnPhase.WAITING_FOR_ROLL) {
        propsRef.current.onTriggerRollDice();
        return;
      }

      if (
        hitData.type === 'pawn' &&
        ms.turnPhase === TurnPhase.SELECTING_MOVE &&
        hitData.color === ms.currentTurnColor
      ) {
        const isLegal = moves.some((m) => m.tokenIndex === hitData.tokenIndex);
        if (isLegal) {
          propsRef.current.onSelectTokenMove(hitData.tokenIndex);
        }
      }
    }

    function onPointerMove(e: PointerEvent) {
      const now = performance.now();
      if (now - lastHoverTime < 45) return;
      lastHoverTime = now;

      if (propsRef.current.gameState !== 'playing') {
        renderer.domElement.style.cursor = 'default';
        return;
      }
      getCanvasMouseNdc(e.clientX, e.clientY);
      raycaster.setFromCamera(pointerNdc, camera);
      const hits = raycaster.intersectObjects(interactableMeshes, false);
      if (hits.length > 0) {
        const hitData = hits[0].object.userData;
        const { matchState: ms, legalMoves: moves } = propsRef.current;
        if (
          (hitData.type === 'dice' && ms.turnPhase === TurnPhase.WAITING_FOR_ROLL) ||
          (hitData.type === 'pawn' &&
            ms.turnPhase === TurnPhase.SELECTING_MOVE &&
            hitData.color === ms.currentTurnColor &&
            moves.some((m) => m.tokenIndex === hitData.tokenIndex))
        ) {
          renderer.domElement.style.cursor = 'pointer';
          return;
        }
      }
      renderer.domElement.style.cursor = 'grab';
    }

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    // 13. ResizeObserver for Responsive Viewport
    const resizeObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const w = Math.max(1, entry.contentRect.width);
        const h = Math.max(1, entry.contentRect.height);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
        renderer.setSize(w, h);
      }
    });
    resizeObserver.observe(container);

    // 14. Animation State Machine (Dice Tumble, Hopping Pawn Arc, Dancers, Smash Hammer, Confetti)
    let activeRollId = -1;
    let diceAnimTime = 0;
    let diceIsRolling = false;
    let diceTargetEuler = new THREE.Euler(0, 0, 0);

    let activeMoveKey = '';
    let moveHopStepIndex = 0;
    let moveHopProgress = 0;
    let moveFromVec = new THREE.Vector3();
    let moveToVec = new THREE.Vector3();

    let hitstopTimer = 0;
    let cameraTrauma = 0;
    let celebrationTimer = 0;
    let smashAnimTimer = 0;
    const smashTargetWorld = new THREE.Vector3(0, 0.1, 0);
    let lastCelebrationId = -1;

    let lastCameraPreset: CameraPreset | null = null;
    let lastGameState: string = propsRef.current.gameState;

    const clock = new THREE.Clock();
    let frameId = 0;
    let disposed = false;

    function setDancerMood(
      targetColor: PlayerColor,
      mood: 'idle' | 'dancing' | 'sad',
      duration: number
    ) {
      const d = dancers.find((item) => item.color === targetColor);
      if (d) {
        d.mood = mood;
        d.moodTimer = Math.max(d.moodTimer, duration);
      }
    }

    function triggerSmashVisualAt(wx: number, wz: number) {
      smashTargetWorld.set(wx, 0.1, wz);
      smashAnimTimer = 0.68;
      celebrationTimer = 2.6;
      cameraTrauma = 0.9;
      spawnParticleBurst(wx, 0.25, wz, 36, 'rainbow', 1.5);
      fireCornerConfettiCannons();
    }

    let diceLaunchFromX = 0;
    let diceLaunchFromZ = 0;

    function afterDraw(cb: () => void) {
      const gl = renderer.getContext() as WebGL2RenderingContext;
      const sync = gl.fenceSync ? gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0) : null;
      gl.flush();
      const poll = () => {
        if (disposed) return;
        const state = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
        if (state === gl.UNSIGNALED) {
          frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          frameId = window.setTimeout(cb, 80);
        }
      };
      frameId = window.setTimeout(poll, 5);
    }

    function tick() {
      if (disposed) return;
      const rawDt = clock.getDelta();
      const dt = Math.min(rawDt, isSoftwareGl ? 0.25 : 0.05);
      const elapsed = clock.getElapsedTime();

      const {
        gameState: gs,
        matchState: ms,
        legalMoves: moves,
        hoveredTokenIndex: hoveredIdx,
        cameraPreset: camPreset,
        activeAnimationMove: animMove,
        diceRollTrigger: rollTrig,
        celebrationTrigger: celebTrig,
      } = propsRef.current;

      // Check external Celebration / Smash / Six / Crown triggers
      if (celebTrig && celebTrig.id !== lastCelebrationId) {
        lastCelebrationId = celebTrig.id;
        celebrationTimer = 2.8;

        if (celebTrig.kind === 'party' || celebTrig.kind === 'win') {
          fireCornerConfettiCannons();
          setDancerMood(celebTrig.color, 'dancing', 4.0);
        } else if (celebTrig.kind === 'six' || celebTrig.kind === 'crown') {
          // Only this player's mascot dances when they get a 6 or crown a goti in the center!
          setDancerMood(celebTrig.color, 'dancing', 3.6);
          if (celebTrig.kind === 'crown') {
            fireCornerConfettiCannons();
          }
        } else if (celebTrig.kind === 'kill') {
          // Killer dances joyfully, while Victim mascot reacts Not Happy / Upset!
          setDancerMood(celebTrig.color, 'dancing', 4.2);
          if (celebTrig.victimColor && celebTrig.victimColor !== celebTrig.color) {
            setDancerMood(celebTrig.victimColor, 'sad', 4.6);
          }
          if (celebTrig.targetCoord) {
            gridToWorld(celebTrig.targetCoord, _vec3A, 0.1);
            triggerSmashVisualAt(_vec3A.x, _vec3A.z);
          } else {
            triggerSmashVisualAt(-2.0, -1.0);
          }
        }
      }

      if (celebrationTimer > 0) {
        celebrationTimer = Math.max(0, celebrationTimer - dt);
      }

      // Animate 3D Giant Golden Smash Mallet & Shockwave Ring
      if (smashAnimTimer > 0) {
        smashAnimTimer = Math.max(0, smashAnimTimer - dt);
        const progress = 1 - smashAnimTimer / 0.68;
        smashHammerGroup.visible = true;
        smashHammerGroup.position.set(smashTargetWorld.x, 0.1, smashTargetWorld.z - 1.2);
        const swingAngle =
          progress < 0.35
            ? THREE.MathUtils.lerp(-Math.PI * 0.55, Math.PI * 0.42, progress / 0.35)
            : THREE.MathUtils.lerp(Math.PI * 0.42, -Math.PI * 0.2, (progress - 0.35) / 0.65);
        smashHammerGroup.rotation.x = swingAngle;

        shockwaveMesh.position.set(smashTargetWorld.x, 0.12, smashTargetWorld.z);
        const ringScale = 0.6 + progress * 3.8;
        shockwaveMesh.scale.set(ringScale, ringScale, 1);
        shockwaveMat.opacity = Math.max(0, (1 - progress) * 0.9);
      } else {
        smashHammerGroup.visible = false;
        shockwaveMat.opacity = 0;
      }

      // Check if any dancer is actively celebrating
      const anyDancerCelebrating = dancers.some((d) => d.mood === 'dancing' && d.moodTimer > 0);
      const beatFreq = anyDancerCelebrating ? 14.0 : 4.5;
      const beatWave = Math.sin(elapsed * beatFreq);

      for (const cone of speakerCones) {
        const thump = 1 + Math.abs(beatWave) * (anyDancerCelebrating ? 0.36 : 0.04);
        cone.scale.set(thump, thump, thump);
      }

      // Animate the 4 3D House Mascot Characters according to their individual mood:
      // - 'dancing': ONLY when their player rolled a 6, killed an opponent goti, or crowned a goti in the center!
      // - 'sad': when their goti was killed by another player (slumped posture, hands on head, shaking head No, storm cloud & tears)!
      // - 'idle': calm standing posture watching the board (does NOT dance during normal turns).
      dancers.forEach((dancer, idx) => {
        if (dancer.moodTimer > 0) {
          dancer.moodTimer = Math.max(0, dancer.moodTimer - dt);
          if (dancer.moodTimer === 0) {
            dancer.mood = 'idle';
          }
        }

        const isCurrentHouseTurn = ms.currentTurnColor === dancer.color;

        if (dancer.mood === 'dancing') {
          const phase = elapsed * 13.0 + idx * 1.1;
          const jumpHeight = Math.abs(Math.sin(phase)) * 0.68;

          dancer.bodyGroup.position.y = 0.26 + jumpHeight;
          dancer.bodyGroup.rotation.x = 0;
          dancer.bodyGroup.rotation.z = Math.cos(phase * 0.5) * 0.26;
          dancer.bodyGroup.rotation.y = elapsed * 6.0;

          dancer.headGroup.rotation.x = Math.sin(phase) * 0.25;
          dancer.headGroup.rotation.y = Math.cos(phase * 0.5) * 0.35;

          dancer.leftArm.rotation.x = 0;
          dancer.rightArm.rotation.x = 0;
          dancer.leftArm.rotation.z = 2.45 + Math.sin(phase) * 0.55;
          dancer.rightArm.rotation.z = -2.45 - Math.cos(phase) * 0.55;

          dancer.leftLeg.rotation.x = Math.sin(phase) * 0.68;
          dancer.rightLeg.rotation.x = -Math.sin(phase) * 0.68;

          dancer.happyHaloMesh.visible = true;
          dancer.happyHaloMesh.rotation.z = elapsed * 4.0;
          dancer.sadCloudGroup.visible = false;

          const paletteHex =
            CONFETTI_PALETTE[Math.floor(elapsed * 10 + idx) % CONFETTI_PALETTE.length];
          dancer.stageRingMat.color.setHex(paletteHex);
        } else if (dancer.mood === 'sad') {
          // Victim Reaction: Not Happy! Slumped down, hands clutching head, shaking head side-to-side, storm cloud overhead
          const shakePhase = elapsed * 18.0;
          dancer.bodyGroup.position.y = 0.16 + Math.sin(elapsed * 6.0) * 0.02;
          dancer.bodyGroup.rotation.x = 0.38; // Slumped forward in sorrow
          dancer.bodyGroup.rotation.z = Math.sin(shakePhase * 0.5) * 0.12;
          dancer.bodyGroup.rotation.y = 0;

          dancer.headGroup.rotation.x = 0.42; // Looking down
          dancer.headGroup.rotation.y = Math.sin(shakePhase) * 0.55; // Shaking head "NOOO!"

          // Both hands clutching the sides of the head in disbelief
          dancer.leftArm.rotation.z = 2.65;
          dancer.leftArm.rotation.x = -0.35;
          dancer.rightArm.rotation.z = -2.65;
          dancer.rightArm.rotation.x = -0.35;

          dancer.leftLeg.rotation.x = 0.15;
          dancer.rightLeg.rotation.x = 0.15;

          dancer.happyHaloMesh.visible = false;
          dancer.sadCloudGroup.visible = true;
          dancer.sadCloudGroup.position.y = 2.15 + Math.sin(elapsed * 5.0) * 0.08;
          dancer.stageRingMat.color.setHex(0x38bdf8);
        } else {
          // Calm Idle Standing Posture (does NOT dance unless 6, kill, or center crown!)
          const breath = Math.sin(elapsed * 2.2 + idx) * 0.015;
          dancer.bodyGroup.position.y = 0.26 + breath;
          dancer.bodyGroup.rotation.x = 0;
          dancer.bodyGroup.rotation.z = 0;
          dancer.bodyGroup.rotation.y = 0;

          dancer.headGroup.rotation.x = 0;
          dancer.headGroup.rotation.y = isCurrentHouseTurn
            ? Math.sin(elapsed * 1.8) * 0.12
            : 0;

          dancer.leftArm.rotation.x = 0;
          dancer.rightArm.rotation.x = 0;
          dancer.leftArm.rotation.z = 0.22;
          dancer.rightArm.rotation.z = -0.22;

          dancer.leftLeg.rotation.x = 0;
          dancer.rightLeg.rotation.x = 0;

          dancer.happyHaloMesh.visible = false;
          dancer.sadCloudGroup.visible = false;
          dancer.stageRingMat.color.setHex(
            isCurrentHouseTurn ? 0xfef08a : PLAYER_PBR_COLORS[dancer.color].main
          );
        }
      });

      // Rotate center crown jewel gently
      centerOrb.rotation.y = elapsed * (anyDancerCelebrating ? 4.5 : 0.9);
      centerOrb.position.y = 0.42 + Math.sin(elapsed * 2.2) * 0.03;

      // Camera Choreography: Title Screen turntable vs Playing presets
      if (gs !== lastGameState) {
        if (gs === 'playing') {
          userInteractingWithCamera = false;
          lastCameraPreset = null;
        }
        lastGameState = gs;
      }

      if (gs === 'title') {
        const orbitAngle = elapsed * 0.22;
        camera.position.set(
          Math.sin(orbitAngle) * 17.5,
          13.6 + Math.sin(elapsed * 0.45) * 1.1,
          Math.cos(orbitAngle) * 17.5
        );
        camera.lookAt(0, 0.2, 0);
      } else {
        if (camPreset !== lastCameraPreset) {
          userInteractingWithCamera = false;
          lastCameraPreset = camPreset;
        }
        if (!userInteractingWithCamera) {
          const portraitZoomFactor =
            camera.aspect < 1.0 ? Math.min(2.2, 1.08 / Math.max(0.42, camera.aspect)) : 1.0;
          if (camPreset === 'overhead') {
            _vec3A.set(0, 22.5 * portraitZoomFactor, 0.8 * portraitZoomFactor);
          } else if (camPreset === 'pov') {
            const turnAngles: Record<PlayerColor, [number, number]> = {
              [PlayerColor.RED]: [-13.2, -13.2],
              [PlayerColor.GREEN]: [13.2, -13.2],
              [PlayerColor.YELLOW]: [13.2, 13.2],
              [PlayerColor.BLUE]: [-13.2, 13.2],
            };
            const [tx, tz] = turnAngles[ms.currentTurnColor] || [0, 15];
            _vec3A.set(
              tx * portraitZoomFactor,
              13.4 * portraitZoomFactor,
              tz * portraitZoomFactor
            );
          } else {
            _vec3A.set(0, 16.6 * portraitZoomFactor, 15.2 * portraitZoomFactor);
          }
          const dampAlpha = 1 - Math.exp(-4.5 * dt);
          camera.position.lerp(_vec3A, dampAlpha);
          controls.target.lerp(_vec3B.set(0, 0.15, 0), dampAlpha);
        }
        controls.update();
      }

      // Apply decaying trauma * trauma camera shake on heavy capture hits
      if (cameraTrauma > 0) {
        const shake = cameraTrauma * cameraTrauma * 0.35;
        camera.position.x += (Math.random() - 0.5) * shake;
        camera.position.y += (Math.random() - 0.5) * shake;
        cameraTrauma = Math.max(0, cameraTrauma - dt * 2.6);
      }

      // Sim-level hitstop freeze timer
      const simDt = hitstopTimer > 0 ? 0 : dt;
      if (hitstopTimer > 0) {
        hitstopTimer = Math.max(0, hitstopTimer - dt);
      }

      // Check Dice Roll Trigger — Smooth multi-bounce 3D trajectory from active player's corner!
      if (rollTrig && rollTrig.rollId !== activeRollId) {
        activeRollId = rollTrig.rollId;
        diceIsRolling = true;
        diceAnimTime = 0;
        diceTargetEuler = getDiceTargetRotation(rollTrig.value);
        const cornerOffsets: Record<PlayerColor, [number, number]> = {
          [PlayerColor.RED]: [-1.85, -1.85],
          [PlayerColor.GREEN]: [1.85, -1.85],
          [PlayerColor.YELLOW]: [1.85, 1.85],
          [PlayerColor.BLUE]: [-1.85, 1.85],
        };
        const [lx, lz] = cornerOffsets[ms.currentTurnColor] || [-1.5, -1.5];
        diceLaunchFromX = lx;
        diceLaunchFromZ = lz;
        soundEngine.playDiceTumble();
      }

      if (diceIsRolling) {
        diceAnimTime += dt;
        const duration = isSoftwareGl ? 0.38 : 0.62;
        const t = Math.min(1, diceAnimTime / duration);
        const easeOut = 1 - Math.pow(1 - t, 3);

        // 3 damped physical bounces across the center board plinth
        const bounceWave = Math.abs(Math.sin(t * Math.PI * 3.0));
        const bounceHeight = bounceWave * Math.pow(1 - t, 1.15) * 2.45;

        const curX = THREE.MathUtils.lerp(diceLaunchFromX, 0, easeOut);
        const curZ = THREE.MathUtils.lerp(diceLaunchFromZ, 0, easeOut);
        diceGroup.position.set(curX, 0.62 + bounceHeight, curZ);

        // Subtle squash-and-stretch on bounce contact
        const impactProximity = 1 - bounceWave;
        const squash = t < 0.9 ? 1 - impactProximity * (1 - t) * 0.14 : 1;
        diceGroup.scale.set(1 / Math.sqrt(squash), squash, 1 / Math.sqrt(squash));

        diceShadowMesh.position.set(curX, 0.14, curZ);
        const shadowScale = THREE.MathUtils.clamp(1 - bounceHeight * 0.22, 0.42, 1.05);
        diceShadowMesh.scale.set(shadowScale, shadowScale, 1);

        // Smooth cubic-damped 3-axis tumble settling cleanly onto diceTargetEuler
        const spinDecay = Math.pow(1 - t, 2.3);
        diceGroup.rotation.set(
          diceTargetEuler.x + spinDecay * Math.PI * 8,
          diceTargetEuler.y + spinDecay * Math.PI * 6,
          diceTargetEuler.z + spinDecay * Math.PI * 6
        );

        if (t >= 1) {
          diceIsRolling = false;
          diceGroup.position.set(0, 0.62, 0);
          diceGroup.scale.set(1, 1, 1);
          diceGroup.rotation.copy(diceTargetEuler);
          spawnParticleBurst(0, 0.5, 0, 14, rollTrig?.value === 6 ? 'rainbow' : 0xfef08a, 0.95);
          if (rollTrig?.value === 6) {
            celebrationTimer = Math.max(celebrationTimer, 2.2);
            setDancerMood(ms.currentTurnColor, 'dancing', 3.6);
          }
          rollTrig?.onSettled();
        }
      } else {
        diceGroup.scale.set(1, 1, 1);
        if (ms.turnPhase === TurnPhase.WAITING_FOR_ROLL && gs === 'playing') {
          diceGroup.position.y = 0.68 + Math.sin(elapsed * 3.2) * 0.08;
          diceGroup.rotation.y += dt * 0.8;
        } else {
          diceGroup.position.y = THREE.MathUtils.damp(diceGroup.position.y, 0.62, 8, dt);
        }
        diceShadowMesh.position.set(diceGroup.position.x, 0.14, diceGroup.position.z);
      }

      // Compute multi-pawn stacking offsets per tile
      const coordBuckets = new Map<string, PawnVisual[]>();
      for (const pv of pawnVisuals) {
        const tokenState = ms.tokens[pv.color].find((t) => t.tokenIndex === pv.tokenIndex);
        const step = tokenState ? tokenState.step : -1;
        const coord = getTokenGridCoord(pv.color, pv.tokenIndex, step);
        const key = `${coord.col.toFixed(2)},${coord.row.toFixed(2)}`;
        const list = coordBuckets.get(key) || [];
        list.push(pv);
        coordBuckets.set(key, list);
      }

      for (const [, bucket] of coordBuckets) {
        const count = bucket.length;
        bucket.forEach((pv, i) => {
          const tokenState = ms.tokens[pv.color].find((t) => t.tokenIndex === pv.tokenIndex);
          const step = tokenState ? tokenState.step : -1;
          const baseCoord = getTokenGridCoord(pv.color, pv.tokenIndex, step);
          const baseY = step === -1 ? 0.08 : step === 56 ? 0.11 : 0.05;
          gridToWorld(baseCoord, pv.targetWorldPos, baseY);

          if (count > 1 && step >= 0 && step <= 55) {
            const angle = (i * Math.PI * 2) / count + Math.PI / 4;
            const radius = 0.22;
            pv.targetWorldPos.x += Math.cos(angle) * radius;
            pv.targetWorldPos.z += Math.sin(angle) * radius;
          }
        });
      }

      // Handle Active Pawn Hopping Animation (`activeAnimationMove`)
      if (animMove) {
        const key = `${animMove.color}-${animMove.move.tokenIndex}-${animMove.move.fromStep}-${animMove.move.toStep}`;
        const activePv = pawnVisuals.find(
          (p) => p.color === animMove.color && p.tokenIndex === animMove.move.tokenIndex
        );

        if (activePv) {
          if (key !== activeMoveKey) {
            activeMoveKey = key;
            moveHopStepIndex = 0;
            moveHopProgress = 0;
            moveFromVec.copy(activePv.root.position);
            const firstCoord = animMove.move.pathCoords[0];
            gridToWorld(firstCoord, moveToVec, 0.05);
            soundEngine.playPawnHop(0);
          }

          if (simDt > 0) {
            const hopSpeed = 8.5;
            moveHopProgress += simDt * hopSpeed;

            if (moveHopProgress >= 1) {
              activePv.root.position.copy(moveToVec);
              activePv.squashY = 0.74;
              spawnParticleBurst(
                moveToVec.x,
                moveToVec.y,
                moveToVec.z,
                5,
                PLAYER_PBR_COLORS[animMove.color].main,
                0.65
              );

              moveHopStepIndex++;
              moveHopProgress = 0;

              if (moveHopStepIndex < animMove.move.pathCoords.length) {
                moveFromVec.copy(moveToVec);
                const nextCoord = animMove.move.pathCoords[moveHopStepIndex];
                gridToWorld(
                  nextCoord,
                  moveToVec,
                  animMove.move.toStep === 56 &&
                    moveHopStepIndex === animMove.move.pathCoords.length - 1
                    ? 0.11
                    : 0.05
                );
                soundEngine.playPawnHop(moveHopStepIndex);
              } else {
                // Completed all hops! Check for capture or safe star or crown home juice
                if (animMove.move.capturesTokenIds.length > 0) {
                  hitstopTimer = 0.075;
                  soundEngine.playCaptureHit();
                  triggerSmashVisualAt(moveToVec.x, moveToVec.z);

                  // Killer mascot dances!
                  setDancerMood(animMove.color, 'dancing', 4.2);

                  let victimColorName = 'Opponent';
                  for (const capId of animMove.move.capturesTokenIds) {
                    const victimPv = pawnVisuals.find((p) => p.id === capId);
                    if (victimPv) {
                      victimPv.flashTimer = 0.35;
                      victimPv.knockbackTimer = 0.55;
                      victimPv.knockbackFrom.copy(moveToVec);
                      // Victim mascot reacts NOT HAPPY / UPSET!
                      setDancerMood(victimPv.color, 'sad', 4.6);
                      victimColorName = ms.players[victimPv.color].name;
                    }
                  }

                  propsRef.current.onTriggerCelebrationEvent(
                    'kill',
                    animMove.color,
                    `${ms.players[animMove.color].name} SMASHED ${victimColorName.toUpperCase()}!`,
                    `${ms.players[animMove.color].name} dances while ${victimColorName} is upset!`
                  );
                } else if (animMove.move.reachesHome) {
                  soundEngine.playCrownFanfare();
                  celebrationTimer = 2.8;
                  setDancerMood(animMove.color, 'dancing', 4.0);
                  fireCornerConfettiCannons();
                  spawnParticleBurst(moveToVec.x, moveToVec.y + 0.3, moveToVec.z, 36, 'rainbow', 1.5);
                  propsRef.current.onTriggerCelebrationEvent(
                    'crown',
                    animMove.color,
                    'CENTER HOME CROWNED!',
                    `${ms.players[animMove.color].name} crowned Goti #${animMove.move.tokenIndex + 1} in the center & dances!`
                  );
                } else if (animMove.move.landsOnSafeTile) {
                  soundEngine.playSafeStarChime();
                  spawnParticleBurst(moveToVec.x, moveToVec.y + 0.15, moveToVec.z, 14, 0xfef08a, 0.95);
                }

                animMove.onComplete();
              }
            } else {
              activePv.root.position.lerpVectors(moveFromVec, moveToVec, moveHopProgress);
              const arcHeight = animMove.move.exitsYard ? 1.15 : 0.72;
              activePv.root.position.y += Math.sin(moveHopProgress * Math.PI) * arcHeight;
              activePv.squashY = 1 + Math.sin(moveHopProgress * Math.PI) * 0.24;
            }
          }
        }
      } else {
        activeMoveKey = '';
      }

      // Update all 16 Pawn Visuals (including sky-high ragdoll knockback arc when captured!)
      for (const pv of pawnVisuals) {
        const isAnimatingThisPawn =
          animMove &&
          animMove.color === pv.color &&
          animMove.move.tokenIndex === pv.tokenIndex;

        if (pv.knockbackTimer > 0) {
          pv.knockbackTimer = Math.max(0, pv.knockbackTimer - dt);
          const kt = 1 - pv.knockbackTimer / 0.55;
          pv.root.position.lerpVectors(pv.knockbackFrom, pv.targetWorldPos, kt);
          pv.root.position.y += Math.sin(kt * Math.PI) * 3.6;
          pv.root.rotation.x = kt * Math.PI * 4;
          pv.root.rotation.z = kt * Math.PI * 2;
          if (pv.knockbackTimer === 0) {
            pv.root.rotation.set(0, 0, 0);
          }
        } else if (!isAnimatingThisPawn) {
          const dampFactor = 1 - Math.exp(-10 * dt);
          pv.root.position.lerp(pv.targetWorldPos, dampFactor);
          pv.root.rotation.set(0, 0, 0);
        }

        pv.squashY = THREE.MathUtils.damp(pv.squashY, 1.0, 14, dt);
        const xzScale = 1 / Math.sqrt(Math.max(0.5, pv.squashY));

        const isLegalSelectable =
          gs === 'playing' &&
          ms.turnPhase === TurnPhase.SELECTING_MOVE &&
          pv.color === ms.currentTurnColor &&
          moves.some((m) => m.tokenIndex === pv.tokenIndex);

        const isHovered = isLegalSelectable && hoveredIdx === pv.tokenIndex;
        const baseScale = isHovered ? 1.14 : isLegalSelectable ? 1.06 : 1.0;

        pv.root.scale.set(xzScale * baseScale, pv.squashY * baseScale, xzScale * baseScale);

        if (isLegalSelectable) {
          pv.ringMat.opacity = isHovered ? 0.95 : 0.72;
          pv.ringMat.color.setHex(isHovered ? 0xffffff : 0xfef08a);
          pv.highlightRing.rotation.z = elapsed * 2.4;
        } else {
          pv.ringMat.opacity = 0.0;
        }

        if (pv.flashTimer > 0) {
          pv.flashTimer = Math.max(0, pv.flashTimer - dt);
          pv.bodyMat.emissive.setHex(0xffffff);
          pv.bodyMat.emissiveIntensity = 0.95;
        } else {
          pv.bodyMat.emissive.setHex(PLAYER_PBR_COLORS[pv.color].emissive);
          pv.bodyMat.emissiveIntensity = isLegalSelectable ? 0.45 : 0.15;
        }
      }

      // Update Pooled Particle Ring Buffer in-place (Zero GC)
      let anyParticleUpdated = false;
      for (let i = 0; i < PARTICLE_CAP; i++) {
        const p = particlePool[i];
        if (!p.active) continue;
        anyParticleUpdated = true;
        p.age += dt;
        if (p.age >= p.maxAge) {
          p.active = false;
          _mat4.makeScale(0, 0, 0);
          particleInstanced.setMatrixAt(i, _mat4);
          continue;
        }
        p.vy -= 9.2 * dt;
        p.x += p.vx * dt;
        p.y = Math.max(0.06, p.y + p.vy * dt);
        p.z += p.vz * dt;

        const lifeRatio = 1 - p.age / p.maxAge;
        const s = p.scale * lifeRatio;
        _vec3C.set(p.x, p.y, p.z);
        _euler.set(p.age * 10, p.age * 8, p.age * 4);
        _quat.setFromEuler(_euler);
        _scaleVec.set(s, s, s);
        _mat4.compose(_vec3C, _quat, _scaleVec);
        particleInstanced.setMatrixAt(i, _mat4);
        particleInstanced.setColorAt(i, _color.setHex(p.colorHex));
      }
      if (anyParticleUpdated) {
        particleInstanced.instanceMatrix.needsUpdate = true;
        if (particleInstanced.instanceColor) particleInstanced.instanceColor.needsUpdate = true;
      }

      renderer.render(scene, camera);

      if (isSoftwareGl) {
        afterDraw(tick);
      } else {
        frameId = requestAnimationFrame(tick);
      }
    }

    frameId = requestAnimationFrame(tick);

    return () => {
      disposed = true;
      cancelAnimationFrame(frameId);
      clearTimeout(frameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div
      ref={mountRef}
      className="fixed inset-0 w-full h-full overflow-hidden"
      aria-label="3D Royal Ludo Board Viewport"
    />
  );
};
