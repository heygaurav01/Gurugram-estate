/**
 * Homepage 3D scene: a procedural night skyline, a glass tower with a gold
 * crown, and a lobby the camera flies into as the visitor scrolls.
 *
 * Everything is generated in code (no image files), so nothing here needs an
 * assets.yaml entry. Loaded with a dynamic import after `load`, and only when
 * WebGL works and the visitor has not asked for reduced motion.
 */
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

export type TowerScene = {
  /** Scroll progress through the intro, 0 to 1. Smoothed internally. */
  setProgress: (p: number) => void;
  /** Pointer position, -1 to 1 on both axes, for a little parallax. */
  setPointer: (x: number, y: number) => void;
  /** Pause rendering while the intro is off screen. */
  setActive: (on: boolean) => void;
  dispose: () => void;
};

const GOLD = 0xe4cfa8;
const WARM = 0xffc98a;
const NIGHT = 0x0b0a09;

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

/** Mulberry32: a tiny seeded random, so the skyline is the same on every visit. */
function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Facade texture: dark glass with a grid of windows, some lit warm. */
function windowTexture(rand: () => number, litShare: number, warm: string) {
  const c = document.createElement("canvas");
  c.width = 128;
  c.height = 256;
  const g = c.getContext("2d")!;
  g.fillStyle = "#07090c";
  g.fillRect(0, 0, c.width, c.height);
  const cols = 8;
  const rows = 32;
  const cw = c.width / cols;
  const rh = c.height / rows;
  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < cols; x++) {
      const lit = rand() < litShare;
      const a = lit ? 0.6 + rand() * 0.4 : 0.06 + rand() * 0.08;
      g.fillStyle = lit ? warm : "#7f9ab8";
      g.globalAlpha = a;
      g.fillRect(x * cw + 2, y * rh + 2, cw - 4, rh - 3);
    }
  }
  g.globalAlpha = 1;
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.anisotropy = 4;
  return tex;
}

/** The "GE" emblem on the lobby's back wall. */
function emblemTexture() {
  const c = document.createElement("canvas");
  c.width = 1024;
  c.height = 512;
  const g = c.getContext("2d")!;
  g.fillStyle = "#14110d";
  g.fillRect(0, 0, c.width, c.height);
  g.strokeStyle = "rgba(228,207,168,0.55)";
  g.lineWidth = 3;
  g.strokeRect(40, 40, c.width - 80, c.height - 80);
  g.fillStyle = "#e4cfa8";
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = "600 210px 'Cormorant Garamond Variable', Georgia, serif";
  g.fillText("GE", c.width / 2, c.height / 2 - 40);
  g.font = "600 34px 'Manrope Variable', system-ui, sans-serif";
  g.fillText("G U R U G R A M   E S T A T E", c.width / 2, c.height / 2 + 110);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Soft round sprite for dust, stars and street lamps. */
function dotTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 64;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grad.addColorStop(0, "rgba(255,255,255,1)");
  grad.addColorStop(0.35, "rgba(255,255,255,0.45)");
  grad.addColorStop(1, "rgba(255,255,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createTowerScene(
  canvas: HTMLCanvasElement,
  opts: { lowPower: boolean },
): TowerScene {
  const { lowPower } = opts;
  const rand = rng(86);

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: !lowPower,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, lowPower ? 1.25 : 1.75));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.3;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(NIGHT);
  const fog = new THREE.FogExp2(0x1a130d, 0.0085);
  scene.fog = fog;
  // Soft studio reflections so glass and gold read as glass and gold.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = env;
  scene.environmentIntensity = 0.32;

  // Sky dome: warm city glow at the horizon, deep blue-black overhead.
  const sky = new THREE.Mesh(
    new THREE.SphereGeometry(520, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      uniforms: {
        top: { value: new THREE.Color(0x03040a) },
        mid: { value: new THREE.Color(0x141019) },
        horizon: { value: new THREE.Color(0x4a2f17) },
      },
      vertexShader: /* glsl */ `
        varying float vH;
        void main() {
          vH = normalize(position).y;
          gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 top; uniform vec3 mid; uniform vec3 horizon;
        varying float vH;
        void main() {
          float h = clamp(vH, 0.0, 1.0);
          vec3 c = mix(horizon, mid, smoothstep(0.0, 0.18, h));
          c = mix(c, top, smoothstep(0.18, 0.7, h));
          gl_FragColor = vec4(c, 1.0);
        }`,
    }),
  );
  scene.add(sky);

  const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 600);

  // Light: cool moonlight on the skyline, warm light pooling in the lobby.
  scene.add(new THREE.HemisphereLight(0x8090b0, 0x0b0a09, 0.55));
  const moon = new THREE.DirectionalLight(0xb8c8ff, 0.7);
  moon.position.set(-60, 120, 40);
  scene.add(moon);
  const lobbyLights: THREE.PointLight[] = [];
  for (const [x, z] of [
    [-3.5, 2],
    [3.5, 2],
    [0, -3.5],
  ] as const) {
    const l = new THREE.PointLight(WARM, 0, 16, 1.6);
    l.position.set(x, 7.2, z);
    scene.add(l);
    lobbyLights.push(l);
  }
  const entryLight = new THREE.PointLight(WARM, 18, 22, 1.8);
  entryLight.position.set(0, 8.6, 9);
  scene.add(entryLight);

  const disposables: Array<{ dispose: () => void }> = [pmrem, env, sky.geometry, sky.material];
  const keep = <T extends { dispose: () => void }>(x: T) => (disposables.push(x), x);

  // --- ground and roads --------------------------------------------------------
  const ground = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(900, 900)),
    keep(new THREE.MeshStandardMaterial({ color: 0x15120e, roughness: 0.55, metalness: 0.45 })),
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const plaza = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(34, 30)),
    keep(new THREE.MeshStandardMaterial({ color: 0x1a1714, roughness: 0.35, metalness: 0.5 })),
  );
  plaza.rotation.x = -Math.PI / 2;
  plaza.position.set(0, 0.02, 10);
  scene.add(plaza);
  // Paving lines and lamp posts leading to the door.
  const paveMat = keep(new THREE.MeshBasicMaterial({ color: 0x6b5332 }));
  for (const x of [-12, -6, 6, 12]) {
    const line = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.08, 26)), paveMat);
    line.rotation.x = -Math.PI / 2;
    line.position.set(x, 0.04, 12);
    scene.add(line);
  }
  const bulbMat = keep(new THREE.MeshBasicMaterial({ color: 0xffe0b0 }));
  const postMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x2a241c, metalness: 0.8, roughness: 0.4 }),
  );
  for (const x of [-9, 9]) {
    for (const z of [12, 17, 22]) {
      const post = new THREE.Mesh(keep(new THREE.CylinderGeometry(0.06, 0.08, 3.2, 8)), postMat);
      post.position.set(x, 1.6, z);
      scene.add(post);
      const bulb = new THREE.Mesh(keep(new THREE.SphereGeometry(0.22, 12, 12)), bulbMat);
      bulb.position.set(x, 3.3, z);
      scene.add(bulb);
    }
  }

  const roadMat = keep(new THREE.MeshBasicMaterial({ color: 0x3a3226 }));
  for (const z of [26, -40]) {
    const road = new THREE.Mesh(keep(new THREE.PlaneGeometry(900, 0.25)), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(0, 0.03, z);
    scene.add(road);
  }
  for (const x of [-30, 30]) {
    const road = new THREE.Mesh(keep(new THREE.PlaneGeometry(0.25, 900)), roadMat);
    road.rotation.x = -Math.PI / 2;
    road.position.set(x, 0.03, 0);
    scene.add(road);
  }

  // --- skyline -----------------------------------------------------------------
  // A handful of shared materials with different window repeats, so tall and
  // short towers keep similar window proportions without a material each.
  const cityTex = [0.22, 0.3, 0.38].map((share) => keep(windowTexture(rand, share, "#ffd7a1")));
  const buckets = [1, 2, 3, 4, 6].map((rows) =>
    cityTex.map((tex) => {
      const t = keep(tex.clone());
      t.repeat.set(1, rows);
      t.needsUpdate = true;
      return keep(
        new THREE.MeshStandardMaterial({
          color: 0x26303d,
          map: t,
          emissiveMap: t,
          emissive: 0xffffff,
          emissiveIntensity: 1.1,
          roughness: 0.25,
          metalness: 0.8,
        }),
      );
    }),
  );
  const box = keep(new THREE.BoxGeometry(1, 1, 1).translate(0, 0.5, 0));
  const count = lowPower ? 70 : 150;
  for (let i = 0; i < count; i++) {
    const angle = rand() * Math.PI * 2;
    const dist = 38 + rand() * (lowPower ? 140 : 210);
    const x = Math.cos(angle) * dist;
    const z = Math.sin(angle) * dist - 20;
    // Keep the camera's approach corridor clear.
    if (z > 0 && Math.abs(x) < 40) continue;
    if (Math.hypot(x - 60, z - 105) < 55) continue;
    const w = 7 + rand() * 9;
    const d = 7 + rand() * 9;
    const h = 14 + Math.pow(rand(), 1.6) * 80;
    const rows = Math.min(4, Math.round(h / 22));
    const mat = buckets[rows]![Math.floor(rand() * 3)]!;
    const m = new THREE.Mesh(box, mat);
    m.scale.set(w, h, d);
    m.position.set(x, 0, z);
    m.rotation.y = Math.round(rand() * 3) * (Math.PI / 2) + (rand() - 0.5) * 0.3;
    scene.add(m);
    // Rooftop warning lamp on the tall ones.
    if (h > 60 && rand() > 0.4) {
      const lamp = new THREE.Mesh(
        keep(new THREE.SphereGeometry(0.35, 8, 8)),
        keep(new THREE.MeshBasicMaterial({ color: 0xff4a3a })),
      );
      lamp.position.set(x, h + 0.6, z);
      scene.add(lamp);
    }
  }

  // --- the hero tower ------------------------------------------------------------
  const tower = new THREE.Group();
  scene.add(tower);
  const LOBBY_H = 9;
  const TOWER_H = 96;

  const heroTex = keep(windowTexture(rng(43), 0.55, "#ffe2b0"));
  heroTex.repeat.set(2, 5);
  const shaftMat = keep(
    new THREE.MeshStandardMaterial({
      color: 0x202833,
      map: heroTex,
      emissiveMap: heroTex,
      emissive: 0xffffff,
      emissiveIntensity: 1.05,
      roughness: 0.18,
      metalness: 0.85,
    }),
  );
  // Tapering stack of glass volumes.
  const stack = [
    { w: 15, d: 15, from: LOBBY_H, to: 58 },
    { w: 13, d: 13, from: 58, to: 82 },
    { w: 10.5, d: 10.5, from: 82, to: TOWER_H },
  ];
  for (const s of stack) {
    const m = new THREE.Mesh(box, shaftMat);
    m.scale.set(s.w, s.to - s.from, s.d);
    m.position.y = s.from;
    tower.add(m);
    // Gold ledge where each volume steps back.
    const ledge = new THREE.Mesh(
      box,
      keep(new THREE.MeshStandardMaterial({ color: GOLD, emissive: GOLD, emissiveIntensity: 0.6 })),
    );
    ledge.scale.set(s.w + 0.6, 0.35, s.d + 0.6);
    ledge.position.y = s.to - 0.2;
    tower.add(ledge);
  }
  // Vertical light fins: on every corner and down the middle of each face.
  const finMat = keep(new THREE.MeshBasicMaterial({ color: GOLD }));
  for (const s of stack) {
    const h = s.to - s.from;
    const e = s.w / 2 + 0.06;
    const spots: Array<[number, number]> = [
      [-e, -e],
      [e, -e],
      [-e, e],
      [e, e],
      [0, e],
      [0, -e],
      [e, 0],
      [-e, 0],
    ];
    for (const [x, z] of spots) {
      const fin = new THREE.Mesh(box, finMat);
      const mid = x === 0 || z === 0;
      fin.scale.set(mid ? 0.1 : 0.2, h, mid ? 0.1 : 0.2);
      fin.position.set(x, s.from, z);
      tower.add(fin);
    }
  }
  // Warm uplight washing the front of the tower.
  const wash = new THREE.SpotLight(WARM, 900, 120, 0.32, 0.6, 1.4);
  wash.position.set(0, 0.5, 26);
  wash.target.position.set(0, 45, 0);
  scene.add(wash, wash.target);
  // Crown: a glowing frame and a slim spire with a beacon.
  const crown = new THREE.Mesh(
    keep(new THREE.TorusGeometry(6.2, 0.18, 8, 4)),
    keep(new THREE.MeshBasicMaterial({ color: GOLD })),
  );
  crown.rotation.set(Math.PI / 2, 0, Math.PI / 4);
  crown.position.y = TOWER_H + 1.2;
  tower.add(crown);
  const spire = new THREE.Mesh(
    keep(new THREE.CylinderGeometry(0.08, 0.35, 14, 8)),
    keep(new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.25 })),
  );
  spire.position.y = TOWER_H + 7;
  tower.add(spire);
  const beacon = new THREE.Mesh(
    keep(new THREE.SphereGeometry(0.45, 12, 12)),
    keep(new THREE.MeshBasicMaterial({ color: 0xfff1d6 })),
  );
  beacon.position.y = TOWER_H + 14.2;
  tower.add(beacon);

  // --- the lobby (podium) --------------------------------------------------------
  const stone = keep(
    new THREE.MeshStandardMaterial({
      color: 0x1c1813,
      roughness: 0.55,
      metalness: 0.25,
      side: THREE.DoubleSide,
    }),
  );
  const goldMetal = keep(
    new THREE.MeshStandardMaterial({ color: GOLD, metalness: 1, roughness: 0.22 }),
  );
  const floor = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(16, 16)),
    keep(new THREE.MeshStandardMaterial({ color: 0x120f0c, roughness: 0.08, metalness: 0.9 })),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = 0.04;
  tower.add(floor);
  const ceiling = new THREE.Mesh(keep(new THREE.PlaneGeometry(16, 16)), stone);
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = LOBBY_H;
  tower.add(ceiling);
  // Ceiling light coves.
  const coveMat = keep(new THREE.MeshBasicMaterial({ color: 0xffdcae }));
  for (const z of [-4.5, -1.5, 1.5, 4.5]) {
    const cove = new THREE.Mesh(box, coveMat);
    cove.scale.set(11, 0.06, 0.18);
    cove.position.set(0, LOBBY_H - 0.1, z);
    tower.add(cove);
  }
  // Walls: back, left, right.
  const wallGeo = keep(new THREE.PlaneGeometry(16, LOBBY_H));
  const back = new THREE.Mesh(wallGeo, stone);
  back.position.set(0, LOBBY_H / 2, -7.5);
  tower.add(back);
  for (const sx of [-1, 1]) {
    const side = new THREE.Mesh(wallGeo, stone);
    side.rotation.y = Math.PI / 2;
    side.position.set(sx * 7.5, LOBBY_H / 2, 0);
    tower.add(side);
  }
  // Emblem above the reception desk.
  const emblemTex = keep(emblemTexture());
  const emblem = new THREE.Mesh(
    keep(new THREE.PlaneGeometry(6.4, 3.2)),
    keep(
      new THREE.MeshStandardMaterial({
        map: emblemTex,
        emissiveMap: emblemTex,
        emissive: 0xffffff,
        emissiveIntensity: 0.7,
        roughness: 0.6,
      }),
    ),
  );
  emblem.position.set(-3.2, 5.6, -7.45);
  tower.add(emblem);
  // Reception desk with a glowing edge.
  const desk = new THREE.Mesh(box, stone);
  desk.scale.set(4.4, 1.15, 1.2);
  desk.position.set(-3.2, 0, -4.6);
  tower.add(desk);
  const deskEdge = new THREE.Mesh(box, coveMat);
  deskEdge.scale.set(4.5, 0.05, 1.25);
  deskEdge.position.set(-3.2, 1.15, -4.6);
  tower.add(deskEdge);
  // Columns.
  const colGeo = keep(new THREE.CylinderGeometry(0.32, 0.32, LOBBY_H, 24));
  for (const [x, z] of [
    [-5, 3.5],
    [5, 3.5],
    [-5, -1.5],
    [5, -1.5],
  ] as const) {
    const col = new THREE.Mesh(colGeo, goldMetal);
    col.position.set(x, LOBBY_H / 2, z);
    tower.add(col);
  }
  // Elevator on the back wall: frame plus two doors that part at the end.
  const liftFrame = new THREE.Mesh(box, goldMetal);
  liftFrame.scale.set(3.4, 4.6, 0.12);
  liftFrame.position.set(3.2, 0, -7.42);
  tower.add(liftFrame);
  const liftGlow = new THREE.Mesh(box, coveMat);
  liftGlow.scale.set(3, 4.3, 0.05);
  liftGlow.position.set(3.2, 0, -7.4);
  tower.add(liftGlow);
  const liftDoorMat = keep(
    new THREE.MeshStandardMaterial({ color: 0x6d5a3e, metalness: 1, roughness: 0.3 }),
  );
  const liftDoors = [-1, 1].map((sx) => {
    const door = new THREE.Mesh(box, liftDoorMat);
    door.scale.set(1.5, 4.3, 0.08);
    door.position.set(3.2 + sx * 0.75, 0, -7.32);
    tower.add(door);
    return { door, sx };
  });

  // Front glass facade with a sliding door pair in the middle.
  const glass = keep(
    new THREE.MeshStandardMaterial({
      color: 0x8fa6bd,
      metalness: 0.9,
      roughness: 0.05,
      transparent: true,
      opacity: 0.22,
      side: THREE.DoubleSide,
      depthWrite: false,
    }),
  );
  for (const sx of [-1, 1]) {
    const pane = new THREE.Mesh(keep(new THREE.PlaneGeometry(5.5, LOBBY_H)), glass);
    pane.position.set(sx * 4.75, LOBBY_H / 2, 7.5);
    tower.add(pane);
  }
  const transom = new THREE.Mesh(keep(new THREE.PlaneGeometry(4, LOBBY_H - 5.2)), glass);
  transom.position.set(0, 5.2 + (LOBBY_H - 5.2) / 2, 7.5);
  tower.add(transom);
  const doorFrame = new THREE.Mesh(box, goldMetal);
  doorFrame.scale.set(4.3, 0.18, 0.2);
  doorFrame.position.set(0, 5.1, 7.5);
  tower.add(doorFrame);
  const doors = [-1, 1].map((sx) => {
    const door = new THREE.Mesh(keep(new THREE.PlaneGeometry(2, 5.1)), glass);
    door.position.set(sx, 2.55, 7.52);
    tower.add(door);
    const edge = new THREE.Mesh(box, goldMetal);
    edge.scale.set(0.06, 5.1, 0.06);
    edge.position.set(sx * 0.03, 0, 7.55);
    tower.add(edge);
    return { door, edge, sx };
  });
  // Canopy over the entrance, lit from below.
  const canopy = new THREE.Mesh(box, stone);
  canopy.scale.set(9, 0.4, 5);
  canopy.position.set(0, 8.4, 10);
  tower.add(canopy);
  const canopyGlow = new THREE.Mesh(box, coveMat);
  canopyGlow.scale.set(8.4, 0.04, 4.4);
  canopyGlow.position.set(0, 8.36, 10);
  tower.add(canopyGlow);

  // --- moving light trails on the roads (VFX) ------------------------------------
  const trailGeo = keep(new THREE.BoxGeometry(2.2, 0.08, 0.12));
  const trails: Array<{ mesh: THREE.Mesh; speed: number; axis: "x" | "z"; lane: number }> = [];
  const head = keep(new THREE.MeshBasicMaterial({ color: 0xfff1d6 }));
  const tail = keep(new THREE.MeshBasicMaterial({ color: 0xff5a4a }));
  for (let i = 0; i < (lowPower ? 14 : 30); i++) {
    const axis = i % 2 ? "x" : "z";
    const mesh = new THREE.Mesh(trailGeo, i % 3 ? head : tail);
    const lane = axis === "x" ? [26, -40][i % 2]! : [-30, 30][i % 2]!;
    if (axis === "z") mesh.rotation.y = Math.PI / 2;
    mesh.position.y = 0.15;
    scene.add(mesh);
    trails.push({ mesh, speed: (8 + rand() * 10) * (rand() > 0.5 ? 1 : -1), axis, lane });
    mesh.position[axis] = (rand() - 0.5) * 400;
    mesh.position[axis === "x" ? "z" : "x"] = lane + (rand() - 0.5) * 0.6;
  }

  // --- gold dust and stars ----------------------------------------------------------
  const dot = keep(dotTexture());
  const dustN = lowPower ? 500 : 1400;
  const dustPos = new Float32Array(dustN * 3);
  for (let i = 0; i < dustN; i++) {
    dustPos[i * 3] = (rand() - 0.5) * 60;
    dustPos[i * 3 + 1] = rand() * 40;
    dustPos[i * 3 + 2] = (rand() - 0.5) * 60 + 4;
  }
  const dustGeo = keep(new THREE.BufferGeometry());
  dustGeo.setAttribute("position", new THREE.BufferAttribute(dustPos, 3));
  const dust = new THREE.Points(
    dustGeo,
    keep(
      new THREE.PointsMaterial({
        color: GOLD,
        size: 0.22,
        map: dot,
        transparent: true,
        opacity: 0.75,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      }),
    ),
  );
  scene.add(dust);

  const starN = 900;
  const starPos = new Float32Array(starN * 3);
  for (let i = 0; i < starN; i++) {
    const th = rand() * Math.PI * 2;
    const ph = rand() * Math.PI * 0.42;
    const r = 420;
    starPos[i * 3] = Math.cos(th) * Math.sin(ph) * r;
    starPos[i * 3 + 1] = Math.cos(ph) * r * 0.6 + 60;
    starPos[i * 3 + 2] = Math.sin(th) * Math.sin(ph) * r;
  }
  const starGeo = keep(new THREE.BufferGeometry());
  starGeo.setAttribute("position", new THREE.BufferAttribute(starPos, 3));
  scene.add(
    new THREE.Points(
      starGeo,
      keep(
        new THREE.PointsMaterial({
          color: 0xdfe6ff,
          size: 1.6,
          map: dot,
          transparent: true,
          opacity: 0.8,
          depthWrite: false,
          fog: false,
        }),
      ),
    ),
  );

  // --- camera path ---------------------------------------------------------------------
  const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
  const path = new THREE.CatmullRomCurve3(
    [
      v(78, 52, 132),
      v(46, 30, 86),
      v(18, 11, 44),
      v(0, 3.6, 19),
      v(0, 3.2, 8.5),
      v(0, 3.1, 2),
      v(1.8, 2.9, -3.6),
    ],
    false,
    "centripetal",
  );
  const look = new THREE.CatmullRomCurve3(
    [
      v(0, 42, 0),
      v(0, 26, 0),
      v(0, 9, 4),
      v(0, 3.8, 7.5),
      v(0, 3.3, 0),
      v(0, 3.4, -7.5),
      v(3.2, 2.4, -7.5),
    ],
    false,
    "centripetal",
  );

  // --- post processing ---------------------------------------------------------------------
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const BLOOM = lowPower ? 0.7 : 1.05;
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM, 0.6, 0.55);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  // --- loop -------------------------------------------------------------------------------
  let target = 0;
  let progress = 0;
  let px = 0;
  let py = 0;
  let spx = 0;
  let spy = 0;
  let active = true;
  let raf = 0;
  let last = performance.now();
  let t = 0;
  const tmpPos = new THREE.Vector3();
  const tmpLook = new THREE.Vector3();

  const resize = () => {
    const w = canvas.clientWidth || window.innerWidth;
    const h = canvas.clientHeight || window.innerHeight;
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.setSize(w, h);
    camera.aspect = w / h;
    // Narrow screens need a wider lens to keep the tower in frame.
    camera.fov = camera.aspect < 0.8 ? 62 : 45;
    camera.updateProjectionMatrix();
  };
  resize();
  window.addEventListener("resize", resize);

  const frame = () => {
    raf = active ? requestAnimationFrame(frame) : 0;
    const now = performance.now();
    const dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    t += dt;

    progress += (target - progress) * Math.min(1, dt * 4.5);
    spx += (px - spx) * Math.min(1, dt * 3);
    spy += (py - spy) * Math.min(1, dt * 3);

    const p = progress;
    path.getPointAt(p, tmpPos);
    look.getPointAt(p, tmpLook);
    // Slow drift before the visitor scrolls, fading out as they move in.
    const drift = 1 - smooth(0, 0.25, p);
    tmpPos.x += Math.sin(t * 0.12) * 10 * drift + spx * (2.4 - p * 1.8);
    tmpPos.y += Math.cos(t * 0.1) * 3 * drift - spy * (1.4 - p);
    camera.position.copy(tmpPos);
    camera.lookAt(tmpLook);

    // Entrance doors slide open as the camera arrives.
    const open = smooth(0.44, 0.58, p);
    for (const d of doors) {
      d.door.position.x = d.sx * (1 + open * 1.95);
      d.edge.position.x = d.sx * (0.03 + open * 1.95);
    }
    // Lift doors part at the very end.
    const lift = smooth(0.9, 0.99, p);
    for (const d of liftDoors) d.door.position.x = 3.2 + d.sx * (0.75 + lift * 1.45);
    // The lobby warms up as you step in.
    const inside = smooth(0.5, 0.7, p);
    for (const l of lobbyLights) l.intensity = 10 + inside * 22;
    entryLight.intensity = 26 - inside * 12;
    bloom.strength = BLOOM - inside * 0.25;
    fog.density = 0.0085 + inside * 0.012;

    crown.rotation.z = Math.PI / 4 + t * 0.15;
    (beacon.material as THREE.MeshBasicMaterial).color.setScalar(
      0.6 + 0.4 * Math.abs(Math.sin(t * 1.6)),
    );
    dust.rotation.y = t * 0.02;
    dust.position.y = Math.sin(t * 0.3) * 0.4;
    for (const tr of trails) {
      tr.mesh.position[tr.axis] += tr.speed * dt;
      if (tr.mesh.position[tr.axis] > 220) tr.mesh.position[tr.axis] = -220;
      if (tr.mesh.position[tr.axis] < -220) tr.mesh.position[tr.axis] = 220;
    }

    composer.render();
  };
  raf = requestAnimationFrame(frame);

  return {
    setProgress: (p) => {
      target = Math.min(1, Math.max(0, p));
    },
    setPointer: (x, y) => {
      px = x;
      py = y;
    },
    setActive: (on) => {
      if (on === active) return;
      active = on;
      if (on) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      } else if (raf) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    },
    dispose: () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", resize);
      for (const d of disposables) d.dispose();
      composer.dispose();
      renderer.dispose();
    },
  };
}
