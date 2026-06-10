/* ============================================================
   THE WATCHER 4 — A Totally Legally Distinct Parody Demo
   3D, second person, and now with PBR materials, filmic tone
   mapping, HDR bloom, and characters that walk, blink, and
   regret. The swamp has never looked this expensive.
   ============================================================ */

'use strict';

const W = 960, H = 540;
const ARENA = { minX: 20, maxX: W - 20, minZ: 20, maxZ: H - 20 };

// ---------- tiny synth so the swamp has ambiance ----------
let audioCtx = null;
function beep(freq, dur, type, vol) {
  try {
    audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)();
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type || 'square';
    o.frequency.value = freq;
    g.gain.setValueAtTime(vol || 0.06, audioCtx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + dur);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + dur);
  } catch (e) { /* the bard is on break */ }
}
const sfx = {
  swing: () => beep(180, 0.08, 'sawtooth', 0.05),
  hit:   () => beep(120, 0.12, 'square', 0.07),
  hurt:  () => beep(70, 0.25, 'sawtooth', 0.09),
  coin:  () => { beep(880, 0.07, 'sine', 0.06); setTimeout(() => beep(1320, 0.1, 'sine', 0.05), 60); },
  igni:  () => beep(60, 0.4, 'sawtooth', 0.08),
  quen:  () => beep(440, 0.3, 'sine', 0.05),
  ui:    () => beep(660, 0.05, 'sine', 0.04),
  smooch:() => { beep(523, 0.1, 'sine', 0.05); setTimeout(() => beep(659, 0.15, 'sine', 0.05), 90); },
  neigh: () => { beep(700, 0.1, 'sawtooth', 0.05); setTimeout(() => beep(500, 0.2, 'sawtooth', 0.05), 100); },
};

// ---------- state ----------
const S = {
  scene: 'title',
  keys: {},
  aim: { x: W / 2, y: H / 2 },
  mouseNdc: { x: 0, y: 0 },
  mouseDown: false,
  shake: 0,
  time: 0,
  coins: 0,
  kills: 0,
  charm: 0,
  romanced: null,
  bossDefeated: false,
  wave: 0,
  cam: '2nd',              // '2nd' (you are the monster) | '1st' (you are, regrettably, yourself)
};

const player = {
  x: W / 2, y: H / 2, r: 16, hp: 6, maxHp: 6,
  speed: 3.1, facing: 0,
  swing: 0, swingCd: 0,
  igniCd: 0, quenCd: 0, quen: 0,
  hurtFlash: 0, dead: false,
  roachCd: 0, moving: false,
  moveDir: { x: 0, z: 1 },
};

let enemies = [];
let projectiles = [];
let pickups = [];
let roach = null;

// ---------- flavor text ----------
const KILL_QUIPS = [
  'Drowner drowned. Ironic.',
  '"Hmm." — Gerald, eloquently',
  'That one had a family. A terrible, bitey family.',
  'Another satisfied customer.',
  'It died as it lived: moist and furious.',
  'Wind\'s howling. So was he, briefly.',
  'Contract fulfilled. Invoice pending.',
  'He just wanted a hug. With his teeth.',
  'Evil is evil. Smaller, greater… still flammable.',
  'Toss a coin to your watcher!',
];
const ROACH_QUIPS = [
  'Roach arrives… on the roof of a hut. Majestic. Useless.',
  'Roach materializes inside a tree. She seems fine with it.',
  'Roach gallops in, knocks over a barrel, leaves immediately.',
  'Roach is here! She is standing on a fence at a 45° angle.',
  'Roach appears, gives you a judgmental look about your life choices.',
];

// ---------- waves ----------
const WAVES = [
  { name: 'WAVE 1 — DROWNERS (they have a very moist personality)', spawn: [['drowner', 5]] },
  { name: 'WAVE 2 — NEKKERS (rude little gremlins)', spawn: [['drowner', 3], ['nekker', 4]] },
  { name: 'WAVE 3 — GHOULS (they\'re going through something)', spawn: [['nekker', 3], ['ghoul', 4]] },
];

const ENEMY_TYPES = {
  drowner: { r: 15, hp: 2, speed: 1.1, color: 0x4c7a44, dmgCd: 60 },
  nekker:  { r: 11, hp: 1, speed: 2.3, color: 0x94744a, dmgCd: 50 },
  ghoul:   { r: 17, hp: 3, speed: 1.5, color: 0x735266, dmgCd: 55 },
  boss:    { r: 42, hp: 40, speed: 0.85, color: 0x3a3a50, dmgCd: 70 },
};

/* ============================================================
   RENDERER — ACES filmic tone mapping + HDR bloom
   ============================================================ */

const cvs = document.getElementById('game');
let renderer = null, scene = null, camera = null, composer = null;
let webglOK = true;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true });
  const PR = Math.min(window.devicePixelRatio || 1, 1.6);
  renderer.setPixelRatio(PR);
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
} catch (e) {
  webglOK = false;
  console.error('WebGL unavailable:', e);
}

scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f0e);
scene.fog = new THREE.FogExp2(0x0a100d, 0.0011);

camera = new THREE.PerspectiveCamera(55, W / H, 1, 6000);
camera.position.set(W / 2, 110, H / 2 + 220);
camera.lookAt(W / 2, 20, H / 2);

if (webglOK && window.THREE.EffectComposer) {
  composer = new THREE.EffectComposer(renderer);
  composer.addPass(new THREE.RenderPass(scene, camera));
  const bloom = new THREE.UnrealBloomPass(new THREE.Vector2(W, H), 0.7, 0.45, 0.7);
  composer.addPass(bloom);
  const gamma = new THREE.ShaderPass(THREE.GammaCorrectionShader);
  composer.addPass(gamma);
}

// --- lights ---
scene.add(new THREE.AmbientLight(0x3c4a40, 0.55));
scene.add(new THREE.HemisphereLight(0x52606e, 0x1c150c, 0.6));
const moon = new THREE.DirectionalLight(0xaec3dc, 1.25);
moon.position.set(W / 2 - 420, 600, H / 2 - 320);
moon.target.position.set(W / 2, 0, H / 2);
moon.castShadow = true;
moon.shadow.mapSize.set(2048, 2048);
moon.shadow.camera.left = -700; moon.shadow.camera.right = 700;
moon.shadow.camera.top = 700; moon.shadow.camera.bottom = -700;
moon.shadow.camera.far = 1800;
moon.shadow.bias = -0.0004;
scene.add(moon, moon.target);
const torch = new THREE.PointLight(0xffb070, 1.1, 280, 1.8);
torch.position.set(W / 2, 46, H / 2);
scene.add(torch);

/* ---------- procedural texture kitchen ---------- */
function canvasOf(size, painter) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  painter(c.getContext('2d'), size);
  return c;
}

const groundTex = new THREE.CanvasTexture(canvasOf(1024, (f, sz) => {
  let g = f.createRadialGradient(sz / 2, sz / 2, 80, sz / 2, sz / 2, sz * 0.74);
  g.addColorStop(0, '#2b3823');
  g.addColorStop(0.65, '#202b19');
  g.addColorStop(1, '#141b0f');
  f.fillStyle = g; f.fillRect(0, 0, sz, sz);
  for (let i = 0; i < 110; i++) {
    f.fillStyle = `rgba(${24 + Math.random() * 30 | 0},${30 + Math.random() * 20 | 0},${16 + Math.random() * 12 | 0},.6)`;
    f.beginPath();
    f.ellipse(Math.random() * sz, Math.random() * sz, 22 + Math.random() * 70, 12 + Math.random() * 32, Math.random() * 3, 0, 7);
    f.fill();
  }
  for (let i = 0; i < 360; i++) {
    const x = Math.random() * sz, y = Math.random() * sz;
    for (let b = 0; b < 3; b++) {
      f.strokeStyle = b ? 'rgba(92,128,58,.5)' : 'rgba(60,96,40,.55)';
      f.beginPath();
      f.moveTo(x, y);
      f.quadraticCurveTo(x + (b - 1) * 3, y - 6, x + (b - 1) * 5, y - 10 - Math.random() * 6);
      f.stroke();
    }
  }
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * sz, y = Math.random() * sz, r = 2 + Math.random() * 5;
    f.fillStyle = 'rgba(112,112,100,.5)';
    f.beginPath(); f.ellipse(x, y, r, r * 0.7, 0, 0, 7); f.fill();
  }
}));
groundTex.encoding = THREE.sRGBEncoding;

const groundBump = new THREE.CanvasTexture(canvasOf(256, (f, sz) => {
  f.fillStyle = '#808080'; f.fillRect(0, 0, sz, sz);
  for (let i = 0; i < 900; i++) {
    const v = 90 + Math.random() * 80 | 0;
    f.fillStyle = `rgb(${v},${v},${v})`;
    f.beginPath();
    f.arc(Math.random() * sz, Math.random() * sz, 1 + Math.random() * 5, 0, 7);
    f.fill();
  }
}));
groundBump.wrapS = groundBump.wrapT = THREE.RepeatWrapping;
groundBump.repeat.set(6, 6);

const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2600, 2000),
  new THREE.MeshStandardMaterial({ map: groundTex, bumpMap: groundBump, bumpScale: 0.9, roughness: 0.95, metalness: 0.0 })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(W / 2, 0, H / 2);
ground.receiveShadow = true;
scene.add(ground);

// --- standing water: glossy, moonlit, ominous ---
const waterMat = new THREE.MeshStandardMaterial({ color: 0x101e24, roughness: 0.08, metalness: 0.92 });
for (const [px, pz, rx, rz] of [[170, 430, 95, 42], [820, 110, 80, 36], [680, 470, 110, 48], [110, 90, 65, 30]]) {
  const pool = new THREE.Mesh(new THREE.CircleGeometry(1, 26), waterMat);
  pool.rotation.x = -Math.PI / 2;
  pool.scale.set(rx, rz, 1);
  pool.position.set(px, 0.35, pz);
  scene.add(pool);
}

// --- grass, hundreds of actual blades ---
(function plantGrass() {
  const tex = new THREE.CanvasTexture(canvasOf(64, (f) => {
    for (let i = 0; i < 7; i++) {
      const x = 6 + i * 8 + Math.random() * 4;
      const g = f.createLinearGradient(0, 64, 0, 12);
      g.addColorStop(0, '#2c4220');
      g.addColorStop(1, '#5e7e38');
      f.strokeStyle = g;
      f.lineWidth = 2.5;
      f.beginPath();
      f.moveTo(x, 64);
      f.quadraticCurveTo(x + (Math.random() - 0.5) * 10, 34, x + (Math.random() - 0.5) * 16, 10 + Math.random() * 8);
      f.stroke();
    }
  }));
  tex.encoding = THREE.sRGBEncoding;
  const mat = new THREE.MeshStandardMaterial({ map: tex, alphaTest: 0.4, side: THREE.DoubleSide, roughness: 1 });
  const inst = new THREE.InstancedMesh(new THREE.PlaneGeometry(8, 9), mat, 850);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), e = new THREE.Euler(), v = new THREE.Vector3(), sv = new THREE.Vector3();
  for (let i = 0; i < 850; i++) {
    const ring = Math.random() < 0.62;
    let x, z;
    if (ring) {
      const a = Math.random() * Math.PI * 2, rad = 280 + Math.random() * 580;
      x = W / 2 + Math.cos(a) * rad; z = H / 2 + Math.sin(a) * rad * 0.7;
    } else {
      x = Math.random() * W; z = Math.random() * H;
    }
    const s = 0.7 + Math.random() * 0.9;
    e.set((Math.random() - 0.5) * 0.22, Math.random() * Math.PI, 0);
    q.setFromEuler(e);
    v.set(x, 4 * s, z);
    sv.set(s, s, s);
    m4.compose(v, q, sv);
    inst.setMatrixAt(i, m4);
  }
  scene.add(inst);
})();

// --- forest: pines and broadleaf silhouettes ---
(function plantForest() {
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x2a2014, roughness: 0.9 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x16241a, roughness: 0.95 });
  const pineMat = new THREE.MeshStandardMaterial({ color: 0x12200f, roughness: 0.95 });
  for (let i = 0; i < 30; i++) {
    const a = (i / 30) * Math.PI * 2 + Math.random() * 0.4;
    const rad = 470 + Math.random() * 360;
    const tx = W / 2 + Math.cos(a) * rad;
    const tz = H / 2 + Math.sin(a) * rad * 0.72;
    if (Math.random() < 0.5) {
      // pine
      const h = 120 + Math.random() * 120;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(3, 6, h * 0.4, 6), trunkMat);
      trunk.position.set(tx, h * 0.2, tz);
      trunk.castShadow = true;
      scene.add(trunk);
      for (let t = 0; t < 3; t++) {
        const cw = 36 - t * 9 + Math.random() * 6;
        const cone = new THREE.Mesh(new THREE.ConeGeometry(cw, h * 0.32, 7), pineMat);
        cone.position.set(tx, h * (0.32 + t * 0.22), tz);
        cone.castShadow = true;
        scene.add(cone);
      }
    } else {
      const h = 65 + Math.random() * 55;
      const trunk = new THREE.Mesh(new THREE.CylinderGeometry(4 + Math.random() * 3, 8 + Math.random() * 4, h, 7), trunkMat);
      trunk.position.set(tx, h / 2, tz);
      trunk.rotation.z = (Math.random() - 0.5) * 0.14;
      trunk.castShadow = true;
      const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(34 + Math.random() * 22, 1), leafMat);
      crown.position.set(tx + (Math.random() - 0.5) * 10, h + 14, tz + (Math.random() - 0.5) * 10);
      crown.scale.y = 0.78 + Math.random() * 0.35;
      crown.castShadow = true;
      scene.add(trunk, crown);
    }
  }
  const rockMat = new THREE.MeshStandardMaterial({ color: 0x37372f, roughness: 0.88, metalness: 0.05 });
  for (let i = 0; i < 16; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + Math.random() * 6, 0), rockMat);
    rock.position.set(60 + Math.random() * (W - 120), 2 + Math.random() * 2, 60 + Math.random() * (H - 120));
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true;
    scene.add(rock);
  }
  for (let i = 0; i < 5; i++) {
    const mx = 80 + Math.random() * (W - 160), mz = 80 + Math.random() * (H - 160);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x5a9a72, emissive: 0x2f8a54, emissiveIntensity: 0.7, roughness: 0.5 })
    );
    cap.position.set(mx, 2, mz);
    const glow = new THREE.PointLight(0x5fc98a, 0.5, 95, 2);
    glow.position.set(mx, 8, mz);
    scene.add(cap, glow);
  }
})();

// --- the moon itself, fat and judgmental ---
(function hangMoon() {
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvasOf(128, (f, sz) => {
      const g = f.createRadialGradient(sz / 2, sz / 2, 4, sz / 2, sz / 2, sz / 2);
      g.addColorStop(0, 'rgba(205,225,255,.9)');
      g.addColorStop(0.25, 'rgba(160,190,235,.25)');
      g.addColorStop(1, 'rgba(160,190,235,0)');
      f.fillStyle = g; f.fillRect(0, 0, sz, sz);
    })),
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, fog: false,
  }));
  halo.scale.set(620, 620, 1);
  halo.position.set(W / 2 - 1250, 820, H / 2 - 950);
  const disc = new THREE.Sprite(new THREE.SpriteMaterial({
    map: new THREE.CanvasTexture(canvasOf(128, (f, sz) => {
      f.fillStyle = '#dfe9f8';
      f.beginPath(); f.arc(sz / 2, sz / 2, sz * 0.42, 0, 7); f.fill();
      for (let i = 0; i < 9; i++) {
        f.fillStyle = 'rgba(170,190,215,.5)';
        f.beginPath();
        f.arc(sz * (0.3 + Math.random() * 0.4), sz * (0.3 + Math.random() * 0.4), 3 + Math.random() * 9, 0, 7);
        f.fill();
      }
    })),
    transparent: true, depthWrite: false, fog: false,
  }));
  disc.scale.set(150, 150, 1);
  disc.position.copy(halo.position);
  scene.add(halo, disc);
})();

// --- stars ---
(function stars() {
  const geo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * Math.PI * 2, r = 900 + Math.random() * 1100;
    pts.push(W / 2 + Math.cos(a) * r, 380 + Math.random() * 800, H / 2 + Math.sin(a) * r);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xcdd8ea, size: 2.2, sizeAttenuation: false, fog: false })));
})();

// --- sprite helpers ---
function makeGlowTexture(r, g, b) {
  return new THREE.CanvasTexture(canvasOf(64, (x, sz) => {
    const gr = x.createRadialGradient(sz / 2, sz / 2, 0, sz / 2, sz / 2, sz / 2);
    gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
    gr.addColorStop(0.35, `rgba(${r},${g},${b},.35)`);
    gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
    x.fillStyle = gr; x.fillRect(0, 0, sz, sz);
  }));
}
const texFirefly = makeGlowTexture(185, 235, 110);
const texFire = makeGlowTexture(255, 150, 50);
const texSoft = makeGlowTexture(200, 215, 195);

// --- drifting fog ---
const fogSprites = [];
for (let i = 0; i < 8; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texSoft, transparent: true, opacity: 0.09, depthWrite: false,
  }));
  sp.scale.set(420 + Math.random() * 280, 120 + Math.random() * 60, 1);
  sp.position.set(Math.random() * W, 14 + Math.random() * 18, Math.random() * H);
  sp.userData = { sp: 0.12 + Math.random() * 0.2, phase: Math.random() * 7 };
  scene.add(sp);
  fogSprites.push(sp);
}

// --- fireflies ---
const fireflies = [];
for (let i = 0; i < 16; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texFirefly, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  sp.scale.set(8, 8, 1);
  sp.position.set(Math.random() * W, 14 + Math.random() * 30, Math.random() * H);
  sp.userData = { a: Math.random() * 7, phase: Math.random() * 7 };
  scene.add(sp);
  fireflies.push(sp);
}

/* ============================================================
   CHARACTERS — articulated, animated, emotionally complicated
   ============================================================ */

function std(color, opts) {
  return new THREE.MeshStandardMaterial(Object.assign({ color, roughness: 0.8, metalness: 0.05 }, opts || {}));
}

function limb(parent, x, y, z, len, rTop, rBot, mat) {
  const pivot = new THREE.Group();
  pivot.position.set(x, y, z);
  const seg = new THREE.Mesh(new THREE.CylinderGeometry(rTop, rBot, len, 7), mat);
  seg.position.y = -len / 2;
  seg.castShadow = true;
  pivot.add(seg);
  parent.add(pivot);
  return pivot;
}

/* ----- GERALD, built from scratch, faces +z ----- */
function makeGerald() {
  const g = new THREE.Group();
  const armor = std(0x2e2620, { roughness: 0.72, metalness: 0.18 });
  const armorDark = std(0x1c1712, { roughness: 0.8, metalness: 0.12 });
  const leather = std(0x4a3318, { roughness: 0.85 });
  const skin = std(0xc69b76, { roughness: 0.62 });
  const stubble = std(0x8d745c, { roughness: 0.7 });
  const hairMat = std(0xe9e5d8, { roughness: 0.55 });
  const steel = std(0xb8c0cc, { roughness: 0.28, metalness: 0.95 });
  const gold = std(0xc8a35a, { roughness: 0.35, metalness: 0.9, emissive: 0x2a1c04, emissiveIntensity: 0.6 });

  // legs
  const hipL = limb(g, -3.6, 13, 0, 12, 2.4, 1.7, armorDark);
  const hipR = limb(g, 3.6, 13, 0, 12, 2.4, 1.7, armorDark);
  for (const hip of [hipL, hipR]) {
    const boot = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.2, 5.6), leather);
    boot.position.set(0, -12.2, 1.2);
    boot.castShadow = true;
    hip.add(boot);
  }
  // torso
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(5.6, 7.2, 13, 9), armor);
  torso.position.y = 20;
  torso.castShadow = true;
  // chest straps
  const strap = new THREE.Mesh(new THREE.BoxGeometry(1.6, 13.5, 0.6), leather);
  strap.position.set(-2, 20, 6.2);
  strap.rotation.z = 0.22;
  // belt + buckle (very important to the lore)
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(7.4, 7.4, 2.2, 9), leather);
  belt.position.y = 13.6;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(3, 2.2, 1), gold);
  buckle.position.set(0, 13.6, 7);
  // shoulders
  for (const sx of [-7.4, 7.4]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(4.2, 8, 6), armorDark);
    pad.position.set(sx, 26, 0);
    pad.scale.y = 0.75;
    pad.castShadow = true;
    const stud = new THREE.Mesh(new THREE.SphereGeometry(0.9, 6, 6), gold);
    stud.position.set(sx, 27.4, 1.4);
    g.add(pad, stud);
  }
  // arms
  const shL = limb(g, -8.2, 25, 0, 12, 2.0, 1.5, armor);
  const shR = limb(g, 8.2, 25, 0, 12, 2.0, 1.5, armor);
  for (const sh of [shL, shR]) {
    const hand = new THREE.Mesh(new THREE.SphereGeometry(1.7, 7, 6), skin);
    hand.position.y = -12.4;
    sh.add(hand);
  }
  // silver sword, carried in the right hand like a professional
  const sword = new THREE.Group();
  const blade = new THREE.Mesh(new THREE.BoxGeometry(1.1, 27, 2.6), steel);
  blade.position.y = -16;
  blade.castShadow = true;
  const tip = new THREE.Mesh(new THREE.ConeGeometry(1.3, 4, 4), steel);
  tip.position.y = -31; tip.rotation.x = Math.PI;
  const guard = new THREE.Mesh(new THREE.BoxGeometry(6, 1.2, 1.6), gold);
  guard.position.y = -2.4;
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 4.6, 6), leather);
  sword.add(blade, tip, guard, grip);
  sword.position.set(0, -12.4, 0);
  sword.rotation.x = Math.PI;          // resting: point down
  shR.add(sword);
  // steel sword on the back, for ex-lovers
  const backBlade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 24, 2.4), steel);
  backBlade.position.set(-2.4, 27, -5.6);
  backBlade.rotation.z = 0.3;
  const backPommel = new THREE.Mesh(new THREE.SphereGeometry(1.3, 6, 6), gold);
  backPommel.position.set(-2.4 - Math.sin(0.3) * 12.6, 27 + Math.cos(0.3) * 12.6, -5.6);
  // head
  const head = new THREE.Group();
  head.position.y = 31.5;
  const skull = new THREE.Mesh(new THREE.SphereGeometry(5.1, 12, 10), skin);
  skull.castShadow = true;
  // witcher eyes: amber, slit, judging you
  for (const ex of [-2, 2]) {
    const white = new THREE.Mesh(new THREE.SphereGeometry(1.1, 8, 6), std(0xd8d4c8, { roughness: 0.3 }));
    white.position.set(ex, 0.7, 4.2);
    const iris = new THREE.Mesh(new THREE.SphereGeometry(0.62, 8, 6),
      std(0xffb838, { emissive: 0xcf7d10, emissiveIntensity: 1.7, roughness: 0.2 }));
    iris.position.set(ex, 0.7, 5.0);
    const brow = new THREE.Mesh(new THREE.BoxGeometry(2.3, 0.55, 0.7), hairMat);
    brow.position.set(ex, 2.2, 4.5);
    brow.rotation.z = ex < 0 ? -0.18 : 0.18;
    head.add(white, iris, brow);
    head.userData.irisL = head.userData.irisL || iris;
  }
  // nose, scar, stubble — the gravitas package
  const nose = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.0, 1.4), skin);
  nose.position.set(0, -0.2, 4.9);
  const scar = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3.0, 0.25), std(0x8d4438, { roughness: 0.6 }));
  scar.position.set(2.1, 1.1, 4.75);
  scar.rotation.z = 0.22;
  const jaw = new THREE.Mesh(new THREE.SphereGeometry(3.6, 10, 8), stubble);
  jaw.position.set(0, -2.6, 1.2);
  jaw.scale.set(1.18, 0.78, 1.12);
  // the iconic white hair
  const hairCap = new THREE.Mesh(new THREE.SphereGeometry(5.5, 12, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hairMat);
  hairCap.position.y = 0.8;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 0.6, 9, 6), hairMat);
  tail.position.set(0, -2.5, -5.2);
  tail.rotation.x = 0.45;
  head.add(skull, nose, scar, jaw, hairCap, tail);
  // wolf medallion
  const medallion = new THREE.Mesh(new THREE.CylinderGeometry(1.5, 1.5, 0.6, 8), gold);
  medallion.rotation.x = Math.PI / 2;
  medallion.position.set(0, 25, 6.6);

  // quen ward
  const quen = new THREE.Mesh(
    new THREE.SphereGeometry(24, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.14, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  quen.position.y = 18;
  quen.visible = false;

  g.add(torso, strap, belt, buckle, shL, shR, backBlade, backPommel, head, medallion, quen);
  g.userData = { hipL, hipR, shL, shR, head, sword, quen };
  return g;
}
const playerMesh = makeGerald();
scene.add(playerMesh);

function glowEye(color, x, y, z, size, intensity) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(size || 1.4, 7, 6),
    std(color, { emissive: color, emissiveIntensity: intensity || 1.5, roughness: 0.3 })
  );
}

/* ----- monsters, each a small tragedy, facing +z ----- */
function makeEnemyMesh(type, r) {
  const g = new THREE.Group();
  const flashMats = [];
  const reg = (m) => { m.userData.baseEm = m.emissive.getHex(); flashMats.push(m); return m; };

  if (type === 'boss') {
    const robeMat = reg(std(0x262640, { roughness: 0.72 }));
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(13, 35, 74, 12), robeMat);
    robe.position.y = 37; robe.castShadow = true;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(11, 16, 6, 12), std(0xd8d2c2, { roughness: 0.6 }));
    collar.position.y = 72;
    const headM = reg(std(0xc8c0aa, { roughness: 0.6 }));
    const head = new THREE.Mesh(new THREE.SphereGeometry(11, 14, 12), headM);
    head.position.y = 84; head.castShadow = true;
    // the hat of fiscal authority
    const hat = new THREE.Mesh(new THREE.CylinderGeometry(7.5, 8.5, 13, 10), std(0x14141a, { roughness: 0.5 }));
    hat.position.y = 97;
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(13, 13, 1.2, 12), std(0x14141a, { roughness: 0.5 }));
    brim.position.y = 91;
    // pince-nez of doom
    for (const ex of [-4, 4]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.5, 6, 12),
        std(0xd0d8e8, { metalness: 0.9, roughness: 0.25, emissive: 0x303a48, emissiveIntensity: 0.8 }));
      lens.position.set(ex, 86, 10);
      g.add(lens);
    }
    // arms: ledger in the left, scribbling quill in the right
    const armL = limb(g, -28, 58, 6, 22, 4, 3, robeMat);
    armL.rotation.z = -0.5;
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(15, 21, 3.2), std(0xe8dcbb, { roughness: 0.8 }));
    ledger.position.set(0, -24, 2);
    ledger.rotation.y = 0.3;
    armL.add(ledger);
    const armR = limb(g, 28, 58, 6, 22, 4, 3, robeMat);
    armR.rotation.z = 0.5;
    const quill = new THREE.Mesh(new THREE.ConeGeometry(0.9, 12, 5), std(0xe8e8e0, { roughness: 0.5 }));
    quill.position.set(0, -25, 2);
    quill.rotation.x = 0.7;
    armR.add(quill);
    // glowing rune of compound interest
    const rune = new THREE.Mesh(
      new THREE.RingGeometry(34, 40, 28),
      new THREE.MeshBasicMaterial({ color: 0x8a55cc, transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, depthWrite: false })
    );
    rune.rotation.x = -Math.PI / 2;
    rune.position.y = 0.6;
    // orbiting paperwork of doom
    const papers = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), std(0xe8e4d4, { side: THREE.DoubleSide, roughness: 0.9 }));
      p.userData.phase = i * 1.6;
      papers.add(p);
    }
    papers.position.y = 60;
    g.add(robe, collar, head, hat, brim, armL, armR, rune, papers);
    g.userData = { flashMats, papers, armR, rune, head };
    return g;
  }

  const c = ENEMY_TYPES[type].color;
  const bodyMat = reg(std(c, { roughness: 0.62 }));

  if (type === 'drowner') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), bodyMat);
    body.position.y = r * 0.95; body.scale.y = 1.12; body.castShadow = true;
    const belly = new THREE.Mesh(new THREE.SphereGeometry(r * 0.72, 10, 8), reg(std(0x9ab47e, { roughness: 0.5 })));
    belly.position.set(0, r * 0.8, r * 0.42);
    // snout + animated lower jaw full of needles
    const snout = new THREE.Mesh(new THREE.SphereGeometry(r * 0.5, 9, 7), bodyMat);
    snout.position.set(0, r * 1.45, r * 0.62);
    snout.scale.set(0.9, 0.7, 1.15);
    const jaw = new THREE.Group();
    jaw.position.set(0, r * 1.25, r * 0.5);
    const jawMesh = new THREE.Mesh(new THREE.BoxGeometry(r * 0.72, r * 0.22, r * 0.8), reg(std(0x32511f, { roughness: 0.6 })));
    jawMesh.position.set(0, -r * 0.12, r * 0.34);
    jaw.add(jawMesh);
    for (let t = 0; t < 4; t++) {
      const tooth = new THREE.Mesh(new THREE.ConeGeometry(0.55, 2.2, 4), std(0xd8d8c0, { roughness: 0.4 }));
      tooth.position.set((t - 1.5) * 2.2, -r * 0.02, r * 0.62);
      jaw.add(tooth);
    }
    // fins down the back
    for (let i = 0; i < 3; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(2.4, 8, 5), reg(std(0x27411f, { roughness: 0.7 })));
      fin.position.set(0, r * (1.9 - i * 0.42), -r * (0.3 + i * 0.18));
      fin.rotation.x = -0.4;
      g.add(fin);
    }
    // webbed arms with claws
    const armL = limb(g, -r * 0.9, r * 1.1, 2, r * 0.95, 2, 1.3, bodyMat);
    const armR = limb(g, r * 0.9, r * 1.1, 2, r * 0.95, 2, 1.3, bodyMat);
    for (const arm of [armL, armR]) {
      for (let cl = 0; cl < 3; cl++) {
        const claw = new THREE.Mesh(new THREE.ConeGeometry(0.5, 3, 4), std(0xcfcab0, { roughness: 0.45 }));
        claw.position.set((cl - 1) * 1.3, -r * 0.95 - 1.4, 0.6);
        claw.rotation.x = Math.PI * 0.92;
        arm.add(claw);
      }
    }
    const eL = glowEye(0xd6ff4e, -r * 0.34, r * 1.62, r * 0.78, 1.6, 1.8);
    const eR = glowEye(0xd6ff4e, r * 0.34, r * 1.62, r * 0.78, 1.6, 1.8);
    g.add(body, belly, snout, jaw, armL, armR, eL, eR);
    g.userData = { flashMats, jaw, armL, armR };
    return g;
  }

  if (type === 'nekker') {
    const body = new THREE.Mesh(new THREE.SphereGeometry(r, 11, 9), bodyMat);
    body.position.y = r; body.scale.y = 1.15; body.castShadow = true;
    for (const ex of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(2.6, 10, 5), reg(std(0x7a5c34, { roughness: 0.7 })));
      ear.position.set(ex * r * 0.66, r * 2.15, 0);
      ear.rotation.z = -ex * 0.55;
      g.add(ear);
    }
    const armL = limb(g, -r * 0.92, r * 1.15, 1, r * 1.3, 1.6, 1.0, bodyMat);
    const armR = limb(g, r * 0.92, r * 1.15, 1, r * 1.3, 1.6, 1.0, bodyMat);
    const eL = glowEye(0xffb347, -r * 0.4, r * 1.35, r * 0.78, 1.2, 1.7);
    const eR = glowEye(0xffb347, r * 0.4, r * 1.35, r * 0.78, 1.2, 1.7);
    // permanent tiny grin of pure malice
    const grin = new THREE.Mesh(new THREE.BoxGeometry(r * 0.7, 0.6, 0.5), std(0x1c1206, { roughness: 0.8 }));
    grin.position.set(0, r * 0.85, r * 0.92);
    g.add(body, armL, armR, eL, eR, grin);
    g.userData = { flashMats, armL, armR, body };
    return g;
  }

  // ghoul — hunched, ribby, going through something
  const lower = new THREE.Mesh(new THREE.SphereGeometry(r, 12, 10), bodyMat);
  lower.position.y = r * 0.9; lower.castShadow = true;
  const upper = new THREE.Mesh(new THREE.SphereGeometry(r * 0.7, 10, 8), bodyMat);
  upper.position.set(0, r * 1.75, r * 0.34); upper.castShadow = true;
  for (let i = 0; i < 3; i++) {
    const spike = new THREE.Mesh(new THREE.ConeGeometry(1.8, 7, 4), reg(std(0x55384a, { roughness: 0.7 })));
    spike.position.set(0, r * (1.95 - i * 0.4), -r * (0.35 + i * 0.15));
    spike.rotation.x = -0.55;
    g.add(spike);
  }
  for (let i = 0; i < 3; i++) {
    const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.7, 5, 10, Math.PI),
      std(0xcdbdb0, { roughness: 0.55 }));
    rib.position.y = r * 0.7 + i * 4;
    rib.rotation.x = Math.PI / 2.4;
    g.add(rib);
  }
  const armL = limb(g, -r * 0.85, r * 1.5, 4, r * 1.45, 2, 1.1, bodyMat);
  const armR = limb(g, r * 0.85, r * 1.5, 4, r * 1.45, 2, 1.1, bodyMat);
  for (const arm of [armL, armR]) {
    for (let cl = 0; cl < 3; cl++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.5, 4, 4), std(0xd8cfc2, { roughness: 0.4 }));
      claw.position.set((cl - 1) * 1.4, -r * 1.45 - 1.8, 0.5);
      claw.rotation.x = Math.PI * 0.92;
      arm.add(claw);
    }
  }
  const eL = glowEye(0xff4838, -r * 0.3, r * 1.92, r * 0.8, 1.7, 2.0);
  const eR = glowEye(0xff4838, r * 0.3, r * 1.92, r * 0.8, 1.7, 2.0);
  g.add(lower, upper, armL, armR, eL, eR);
  g.userData = { flashMats, armL, armR };
  return g;
}

function animateEnemy(e) {
  const u = e.mesh.userData;
  const t = e.wob;
  if (e.type === 'drowner') {
    if (u.jaw) u.jaw.rotation.x = 0.18 + Math.max(0, Math.sin(t * 1.6)) * 0.4;
    if (u.armL) { u.armL.rotation.x = Math.sin(t * 2) * 0.5 - 0.4; u.armR.rotation.x = -Math.sin(t * 2) * 0.5 - 0.4; }
  } else if (e.type === 'nekker') {
    if (u.body) { const s = 1 + Math.sin(t * 3) * 0.09; u.body.scale.set(1, 1.15 * s, 1); }
    if (u.armL) { u.armL.rotation.x = Math.sin(t * 3) * 0.7 - 0.5; u.armR.rotation.x = -Math.sin(t * 3) * 0.7 - 0.5; }
  } else if (e.type === 'ghoul') {
    const lunging = Math.hypot(e.vx, e.vy) > 1.5;
    if (u.armL) {
      const reach = lunging ? -2.2 : Math.sin(t * 2) * 0.4 - 0.5;
      u.armL.rotation.x = reach; u.armR.rotation.x = lunging ? -2.2 : -Math.sin(t * 2) * 0.4 - 0.5;
    }
    e.mesh.scale.x = e.mesh.scale.z = lunging ? 1.08 : 1;
  } else if (e.type === 'boss') {
    if (u.papers) {
      u.papers.children.forEach((p) => {
        const a = S.time * 0.035 + p.userData.phase;
        p.position.set(Math.cos(a) * 58, Math.sin(a * 1.7) * 10, Math.sin(a) * 58);
        p.rotation.set(a, a * 1.3, 0);
      });
    }
    if (u.armR) u.armR.rotation.x = Math.sin(S.time * 0.3) * 0.16;   // eternal scribbling
    if (u.rune) u.rune.rotation.z = S.time * 0.01;
    if (u.head) u.head.position.y = 84 + Math.sin(S.time * 0.05) * 1.2;
  }
  // hit flash
  const flashing = e.hitFlash > 0 && e.hitFlash % 4 < 2;
  if (u.flashMats && u.wasFlashing !== flashing) {
    for (const m of u.flashMats) {
      m.emissive.setHex(flashing ? 0xa03030 : m.userData.baseEm);
      m.emissiveIntensity = flashing ? 1.2 : 1;
    }
    u.wasFlashing = flashing;
  }
}

function makeCoinMesh() {
  const m = new THREE.Mesh(
    new THREE.CylinderGeometry(3.2, 3.2, 1, 14),
    std(0xd8b042, { metalness: 0.95, roughness: 0.25, emissive: 0x6a4c10, emissiveIntensity: 0.7 })
  );
  m.rotation.x = Math.PI / 2;
  return m;
}

function makePaperMesh() {
  return new THREE.Mesh(new THREE.PlaneGeometry(9, 12), std(0xe8e4d4, { side: THREE.DoubleSide, roughness: 0.9 }));
}

function makeRoachSprite() {
  const c = canvasOf(128, (x) => {
    x.font = '96px serif';
    x.textAlign = 'center';
    x.textBaseline = 'middle';
    x.fillText('🐴', 64, 58);
    x.font = 'italic 14px Georgia';
    x.fillStyle = '#d9cbab';
    x.fillText('*judging you*', 64, 116);
  });
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.scale.set(52, 52, 1);
  return sp;
}

/* ---------- transient effects ---------- */
let effects = [];
let particles = [];

function spawnEffect(mesh, life, update) {
  scene.add(mesh);
  effects.push({ mesh, life, maxLife: life, update });
}
function killEffectMesh(mesh) {
  scene.remove(mesh);
  if (mesh.geometry) mesh.geometry.dispose();
}

const particleMatCache = {};
function particleMat(color, additive) {
  const key = color + '|' + !!additive;
  if (!particleMatCache[key]) {
    particleMatCache[key] = new THREE.SpriteMaterial({
      map: additive ? texFire : texSoft,
      color, transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
  }
  return particleMatCache[key];
}
function burst(x, z, opts) {
  const n = opts.count || 10;
  for (let i = 0; i < n; i++) {
    const sp = new THREE.Sprite(particleMat(opts.color, opts.glow).clone());
    const s = (opts.size || 5) * (0.7 + Math.random() * 0.7);
    sp.scale.set(s, s, 1);
    sp.position.set(x, (opts.y || 14) + (Math.random() - 0.5) * 8, z);
    scene.add(sp);
    const a = opts.dir != null ? opts.dir + (Math.random() - 0.5) * (opts.spread || 0.9) : Math.random() * Math.PI * 2;
    const sp2 = (opts.speed || 2.2) * (0.5 + Math.random());
    particles.push({
      sprite: sp,
      vx: Math.cos(a) * sp2, vz: Math.sin(a) * sp2,
      vy: (opts.up != null ? opts.up : 1.2) * (0.4 + Math.random()),
      life: (opts.life || 26) * (0.7 + Math.random() * 0.6),
      maxLife: opts.life || 26,
    });
  }
}

const decalMatBlood = new THREE.MeshBasicMaterial({ color: 0x4a0a0c, transparent: true, opacity: 0.55, depthWrite: false });
const decalMatScorch = new THREE.MeshBasicMaterial({ color: 0x0c0805, transparent: true, opacity: 0.5, depthWrite: false });
let decalsList = [];
function addDecal(x, z, r, mat) {
  const m = new THREE.Mesh(new THREE.CircleGeometry(r, 10), mat);
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, 0.25 + decalsList.length * 0.002, z);
  scene.add(m);
  decalsList.push(m);
  if (decalsList.length > 40) killEffectMesh(decalsList.shift());
}
function addBlood(x, z, r) {
  for (let i = 0; i < 4; i++) addDecal(x + (Math.random() - 0.5) * r * 2, z + (Math.random() - 0.5) * r * 2, 2 + Math.random() * r * 0.45, decalMatBlood);
}
function addScorch(x, z) {
  for (let i = 0; i < 3; i++) addDecal(x + (Math.random() - 0.5) * 50, z + (Math.random() - 0.5) * 30, 9 + Math.random() * 13, decalMatScorch);
}

/* ---------- DOM floaters (projected from world space) ---------- */
const stage = document.getElementById('stage');
let floaters = [];
function addFloater(x, z, text, color, y) {
  const el = document.createElement('div');
  el.className = 'floater';
  el.textContent = text;
  el.style.color = color;
  stage.appendChild(el);
  floaters.push({ el, x, z, y: y == null ? 44 : y, life: 55, maxLife: 55 });
}
const projV = new THREE.Vector3();
function updateFloaters() {
  for (const f of floaters) {
    f.life--; f.y += 0.55;
    projV.set(f.x, f.y, f.z).project(camera);
    if (f.life <= 0 || projV.z > 1) {
      f.el.style.display = 'none';
      continue;
    }
    f.el.style.display = 'block';
    f.el.style.left = ((projV.x * 0.5 + 0.5) * 100) + '%';
    f.el.style.top = ((-projV.y * 0.5 + 0.5) * 100) + '%';
    f.el.style.opacity = Math.min(1, f.life / 18);
  }
  floaters = floaters.filter((f) => {
    if (f.life <= 0) { f.el.remove(); return false; }
    return true;
  });
}

/* ============================================================
   GAME LOGIC (positions are x/z on the ground plane)
   ============================================================ */

function spawnWave(idx) {
  S.wave = idx;
  showBanner(WAVES[idx].name);
  for (const [type, count] of WAVES[idx].spawn) {
    for (let i = 0; i < count; i++) spawnEnemy(type);
  }
  updateHud();
}

function spawnEnemy(type) {
  const t = ENEMY_TYPES[type];
  let x, y;
  do {
    const side = Math.floor(Math.random() * 4);
    x = side === 0 ? -30 : side === 1 ? W + 30 : Math.random() * W;
    y = side === 2 ? -30 : side === 3 ? H + 30 : Math.random() * H;
  } while (Math.hypot(x - player.x, y - player.y) < 200);
  const e = {
    type, x, y, r: t.r, hp: t.hp, maxHp: t.hp, speed: t.speed,
    hitFlash: 0, dmgTimer: 0, wob: Math.random() * 99,
    lungeTimer: 0, vx: 0, vy: 0, attackTimer: 0,
    mesh: makeEnemyMesh(type, t.r),
  };
  scene.add(e.mesh);
  enemies.push(e);
}

function spawnBoss() {
  const t = ENEMY_TYPES.boss;
  const e = {
    type: 'boss', x: W / 2, y: -80, r: t.r, hp: t.hp, maxHp: t.hp,
    speed: t.speed, hitFlash: 0, dmgTimer: 0,
    wob: 0, lungeTimer: 0, vx: 0, vy: 0, attackTimer: 90,
    mesh: makeEnemyMesh('boss', t.r),
  };
  scene.add(e.mesh);
  enemies.push(e);
  showBanner('⚖ THE TAX COLLECTOR OF NOVIGRAD — WEAKNESS: RECEIPTS ⚖');
  $('boss-bar').classList.add('visible');
  toast('He has come for the 2% monster-slaying levy. Show him your deductions.');
}

// ---------- UI helpers ----------
const $ = (id) => document.getElementById(id);
let toastTimer = null;
function toast(msg, ms) {
  const t = $('toast');
  t.textContent = msg;
  t.style.opacity = 1;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => { t.style.opacity = 0; }, ms || 2600);
}
let bannerTimer = null;
function showBanner(text) {
  const b = $('banner');
  b.textContent = text;
  b.style.opacity = 1;
  clearTimeout(bannerTimer);
  bannerTimer = setTimeout(() => { b.style.opacity = 0; }, 3400);
}

function updateHud() {
  $('hp-fill').style.width = (Math.max(0, player.hp) / player.maxHp * 100) + '%';
  $('coins').textContent = '🪙 ' + S.coins;
  $('wave-label').textContent = S.scene === 'combat'
    ? (S.bossPhase ? 'BOSS FIGHT' : 'WAVE ' + (S.wave + 1) + ' / ' + WAVES.length) : '';
}
function setSignCd(id, frac) {
  const el = $(id);
  el.style.setProperty('--p', Math.max(0, Math.min(1, frac)));
  el.classList.toggle('ready', frac <= 0);
}
function updateSignCds() {
  setSignCd('sign-igni', player.igniCd / 240);
  setSignCd('sign-quen', player.quenCd / 360);
  setSignCd('sign-roach', player.roachCd / 300);
  $('sign-quen').classList.toggle('active', player.quen > 0);
}
function updateCamLabel() {
  $('cam-label').textContent = S.cam === '2nd'
    ? '📷 2ND PERSON — YOU ARE THE MONSTER · [C] FOR 1ST PERSON'
    : '📷 1ST PERSON — REGRETTABLY YOURSELF · [C] TO BECOME THE MONSTER';
}

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  const k = e.key.toLowerCase();
  S.keys[k] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
  if (k === 'c' && !e.repeat && S.scene === 'combat') {
    S.cam = S.cam === '2nd' ? '1st' : '2nd';
    sfx.ui();
    updateCamLabel();
    toast(S.cam === '2nd' ? 'You are the monster again. It feels right.' : 'First person. You are now trapped inside the witcher. The monsters miss you.');
  }
});
window.addEventListener('keyup', (e) => { S.keys[e.key.toLowerCase()] = false; });
cvs.addEventListener('mousemove', (e) => {
  const rect = cvs.getBoundingClientRect();
  S.mouseNdc.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
  S.mouseNdc.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;
});
cvs.addEventListener('mousedown', () => { S.mouseDown = true; });
window.addEventListener('mouseup', () => { S.mouseDown = false; });

const raycaster = new THREE.Raycaster();
const groundPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const rayHit = new THREE.Vector3();
function updateAim() {
  raycaster.setFromCamera(S.mouseNdc, camera);
  if (raycaster.ray.intersectPlane(groundPlane, rayHit)) {
    S.aim.x = rayHit.x;
    S.aim.y = rayHit.z;
  }
}

// ---------- combat ----------
function tryAttack() {
  if (player.swingCd > 0 || player.dead) return;
  player.swingCd = 22;
  player.swing = 12;
  player.facing = Math.atan2(S.aim.y - player.y, S.aim.x - player.x);
  sfx.swing();
  const arcGeo = new THREE.RingGeometry(34, 52, 18, 1, -player.facing - 0.9, 1.8);
  const arc = new THREE.Mesh(arcGeo, new THREE.MeshBasicMaterial({
    color: 0xcfe0ff, transparent: true, opacity: 0.8, side: THREE.DoubleSide,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }));
  arc.rotation.x = -Math.PI / 2;
  arc.position.set(player.x, 6, player.y);
  spawnEffect(arc, 12, (fx) => { fx.mesh.material.opacity = 0.8 * (fx.life / fx.maxLife); });

  const reach = 58, arcW = 1.5;
  for (const e of enemies) {
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < reach + e.r) {
      const ang = Math.atan2(e.y - player.y, e.x - player.x);
      let diff = Math.abs(ang - player.facing);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < arcW) hitEnemy(e, 1, ang);
    }
  }
}

function castIgni() {
  if (player.igniCd > 0 || player.dead) return;
  player.igniCd = 240;
  player.facing = Math.atan2(S.aim.y - player.y, S.aim.x - player.x);
  sfx.igni();
  S.shake = 6;
  addScorch(player.x + Math.cos(player.facing) * 90, player.y + Math.sin(player.facing) * 90);
  burst(player.x + Math.cos(player.facing) * 24, player.y + Math.sin(player.facing) * 24, {
    count: 36, color: 0xff8830, glow: true, size: 9, speed: 4.2,
    dir: player.facing, spread: 0.9, up: 0.9, life: 32, y: 18,
  });
  const flash = new THREE.PointLight(0xff7722, 2.6, 340, 1.6);
  flash.position.set(player.x + Math.cos(player.facing) * 60, 30, player.y + Math.sin(player.facing) * 60);
  spawnEffect(flash, 22, (fx) => { fx.mesh.intensity = 2.6 * (fx.life / fx.maxLife); });
  for (const e of enemies) {
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < 190) {
      const ang = Math.atan2(e.y - player.y, e.x - player.x);
      let diff = Math.abs(ang - player.facing);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < 0.8) hitEnemy(e, 2, ang, true);
    }
  }
  addFloater(player.x, player.y, 'IGNI', '#ffaa00');
}

function castQuen() {
  if (player.quenCd > 0 || player.dead) return;
  player.quenCd = 360;
  player.quen = 240;
  sfx.quen();
  addFloater(player.x, player.y, 'QUEN', '#ffd700');
}

function summonRoach() {
  if (player.roachCd > 0) return;
  player.roachCd = 300;
  sfx.neigh();
  if (roach) scene.remove(roach.sprite);
  const sprite = makeRoachSprite();
  sprite.position.set(
    Math.random() * (W - 200) + 100,
    24 + Math.random() * 40,   // altitude: incorrect. on brand.
    Math.random() * (H - 200) + 100
  );
  sprite.material.rotation = (Math.random() - 0.5) * 0.8;
  scene.add(sprite);
  roach = { sprite, life: 220 };
  toast(ROACH_QUIPS[Math.floor(Math.random() * ROACH_QUIPS.length)]);
}

function hitEnemy(e, dmg, knockAng, burn) {
  e.hp -= dmg;
  e.hitFlash = 8;
  e.x += Math.cos(knockAng) * (e.type === 'boss' ? 4 : 18);
  e.y += Math.sin(knockAng) * (e.type === 'boss' ? 4 : 18);
  sfx.hit();
  S.shake = Math.max(S.shake, 3);
  burst(e.x, e.y, { count: 7, color: burn ? 0xff8830 : 0xaa2222, glow: burn, size: 5, speed: 2.6, y: e.r, life: 18 });
  if (e.type === 'boss') $('bb-fill').style.width = Math.max(0, e.hp / e.maxHp * 100) + '%';
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  enemies = enemies.filter((x) => x !== e);
  scene.remove(e.mesh);
  S.kills++;
  addBlood(e.x, e.y, e.r);
  burst(e.x, e.y, { count: 14, color: ENEMY_TYPES[e.type].color, size: 6, speed: 3.2, y: e.r, life: 26 });
  const coinCount = e.type === 'boss' ? 25 : 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < coinCount; i++) {
    const mesh = makeCoinMesh();
    scene.add(mesh);
    pickups.push({
      x: e.x + (Math.random() - 0.5) * 30, y: e.y + (Math.random() - 0.5) * 30,
      h: 14 + Math.random() * 10, vh: 1.2, bob: Math.random() * 99, mesh,
    });
  }
  if (e.type === 'boss') {
    S.bossDefeated = true;
    S.shake = 14;
    $('boss-bar').classList.remove('visible');
    addFloater(e.x, e.y, 'AUDIT CANCELLED', '#ffd700', 70);
    toast('The Tax Collector dissolves into a pile of crumpled receipts. You owe nothing. Today.');
    setTimeout(() => startEnding(), 2600);
  } else if (Math.random() < 0.4) {
    toast(KILL_QUIPS[Math.floor(Math.random() * KILL_QUIPS.length)], 1800);
  }
  if (!S.bossPhase && enemies.length === 0 && S.scene === 'combat') {
    if (S.wave < WAVES.length - 1) {
      setTimeout(() => { if (S.scene === 'combat') spawnWave(S.wave + 1); }, 1200);
    } else {
      setTimeout(() => startTavern(), 1200);
    }
  }
}

function hurtPlayer(dmg) {
  if (player.hurtFlash > 0 || player.dead) return;
  if (player.quen > 0) {
    player.quen = 0;
    addFloater(player.x, player.y, 'QUEN ABSORBED IT', '#ffd700');
    sfx.quen();
    return;
  }
  player.hp -= dmg;
  player.hurtFlash = 50;
  S.shake = 8;
  sfx.hurt();
  const hf = $('hurt-flash');
  hf.style.opacity = 1;
  setTimeout(() => { hf.style.opacity = 0; }, 180);
  updateHud();
  if (player.hp <= 0) {
    player.dead = true;
    toast('You died. The bard is already writing an unflattering song about it.');
    setTimeout(() => respawn(), 2400);
  }
}

function respawn() {
  player.hp = player.maxHp;
  player.dead = false;
  player.x = W / 2; player.y = H / 2;
  player.hurtFlash = 90;
  for (const e of enemies) if (e.type !== 'boss') scene.remove(e.mesh);
  enemies = enemies.filter(e => e.type === 'boss');
  if (S.bossPhase && enemies.length === 0) spawnBoss();
  else if (!S.bossPhase && enemies.length === 0) spawnWave(S.wave);
  toast('A passing herbalist revives you. She charges 5 coins and your dignity.');
  S.coins = Math.max(0, S.coins - 5);
  updateHud();
}

// ---------- update ----------
const camFwd = new THREE.Vector3();
const camRight = new THREE.Vector3();
const UP = new THREE.Vector3(0, 1, 0);

function updateCombat() {
  updateAim();
  player.moving = false;
  if (!player.dead && S.cam === '1st') {
    // in first person the mouse steers the witcher's gaze
    const ta = Math.atan2(S.aim.y - player.y, S.aim.x - player.x);
    let dAng = ta - player.facing;
    while (dAng > Math.PI) dAng -= 2 * Math.PI;
    while (dAng < -Math.PI) dAng += 2 * Math.PI;
    player.facing += dAng * 0.12;
  }
  if (!player.dead) {
    camera.getWorldDirection(camFwd);
    camFwd.y = 0;
    if (camFwd.lengthSq() < 0.001) camFwd.set(0, 0, -1);
    camFwd.normalize();
    camRight.crossVectors(camFwd, UP).negate();
    const f = (S.keys['w'] || S.keys['arrowup'] ? 1 : 0) - (S.keys['s'] || S.keys['arrowdown'] ? 1 : 0);
    const r = (S.keys['d'] || S.keys['arrowright'] ? 1 : 0) - (S.keys['a'] || S.keys['arrowleft'] ? 1 : 0);
    const mx = camFwd.x * f - camRight.x * r;
    const mz = camFwd.z * f - camRight.z * r;
    const m = Math.hypot(mx, mz);
    if (m > 0.01) {
      player.moving = true;
      player.moveDir.x = mx / m; player.moveDir.z = mz / m;
      player.x += (mx / m) * player.speed;
      player.y += (mz / m) * player.speed;
      player.x = Math.max(ARENA.minX, Math.min(ARENA.maxX, player.x));
      player.y = Math.max(ARENA.minZ, Math.min(ARENA.maxZ, player.y));
      if (S.cam !== '1st') player.facing = Math.atan2(player.moveDir.z, player.moveDir.x);
    }
    if (S.keys[' '] || S.mouseDown) tryAttack();
    if (S.keys['q']) castIgni();
    if (S.keys['e']) castQuen();
    if (S.keys['r']) summonRoach();
  }
  if (player.swingCd > 0) player.swingCd--;
  if (player.swing > 0) player.swing--;
  if (player.igniCd > 0) player.igniCd--;
  if (player.quenCd > 0) player.quenCd--;
  if (player.quen > 0) player.quen--;
  if (player.hurtFlash > 0) player.hurtFlash--;
  if (player.roachCd > 0) player.roachCd--;
  updateSignCds();

  for (const e of enemies) {
    e.wob += 0.1;
    if (e.hitFlash > 0) e.hitFlash--;
    if (e.dmgTimer > 0) e.dmgTimer--;
    const dx = player.x - e.x, dy = player.y - e.y;
    const d = Math.hypot(dx, dy) || 1;

    if (e.type === 'nekker') {
      const zig = Math.sin(e.wob * 2) * 1.4;
      e.x += (dx / d) * e.speed + (-dy / d) * zig;
      e.y += (dy / d) * e.speed + (dx / d) * zig;
    } else if (e.type === 'ghoul') {
      e.lungeTimer--;
      if (e.lungeTimer <= 0 && d < 160) {
        e.vx = (dx / d) * 6; e.vy = (dy / d) * 6;
        e.lungeTimer = 80;
      }
      e.vx *= 0.92; e.vy *= 0.92;
      e.x += (dx / d) * e.speed * 0.5 + e.vx;
      e.y += (dy / d) * e.speed * 0.5 + e.vy;
    } else if (e.type === 'boss') {
      e.x += (dx / d) * e.speed;
      e.y += (dy / d) * e.speed;
      e.attackTimer--;
      if (e.attackTimer <= 0) {
        e.attackTimer = 100;
        for (let i = -2; i <= 2; i++) {
          const a = Math.atan2(dy, dx) + i * 0.22;
          const mesh = makePaperMesh();
          scene.add(mesh);
          projectiles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4, life: 200, spin: 0, mesh });
        }
        addFloater(e.x, e.y, ['"FORM 1099-MONSTER!"', '"YOU OWE BACK-TAXES!"', '"ITEMIZE THIS!"', '"AUDIT BEAM!"'][Math.floor(Math.random() * 4)], '#ccccff', 95);
      }
    } else {
      e.x += (dx / d) * e.speed;
      e.y += (dy / d) * e.speed;
    }

    if (d < e.r + player.r && e.dmgTimer <= 0 && !player.dead) {
      e.dmgTimer = ENEMY_TYPES[e.type].dmgCd;
      hurtPlayer(1);
    }
  }

  for (const p of projectiles) {
    p.x += p.vx; p.y += p.vy; p.life--; p.spin += 0.2;
    if (Math.hypot(p.x - player.x, p.y - player.y) < player.r + 8 && !player.dead) {
      p.life = 0;
      hurtPlayer(1);
      addFloater(player.x, player.y, 'PAPERWORK DAMAGE', '#ccccff');
    }
  }
  projectiles = projectiles.filter((p) => {
    if (p.life <= 0) { scene.remove(p.mesh); return false; }
    return true;
  });

  for (const c of pickups) {
    c.vh -= 0.12; c.h += c.vh;
    if (c.h < 5) { c.h = 5; c.vh = 0; }
    c.bob += 0.15;
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d < 60) { c.x += (player.x - c.x) * 0.2; c.y += (player.y - c.y) * 0.2; }
    if (d < 22) { c.dead = true; S.coins++; sfx.coin(); updateHud(); }
  }
  pickups = pickups.filter((c) => {
    if (c.dead) { scene.remove(c.mesh); return false; }
    return true;
  });

  if (roach) {
    roach.life--;
    if (roach.life <= 0) { scene.remove(roach.sprite); roach = null; }
    else roach.sprite.material.opacity = Math.min(1, roach.life / 40);
  }
}

function angleDelta(a, b) {
  let d = a - b;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return d;
}

function updateWorld() {
  const u = playerMesh.userData;
  playerMesh.position.set(player.x, 0, player.y);
  playerMesh.rotation.y = -player.facing + Math.PI / 2;
  playerMesh.visible = S.scene !== 'title'
    && !(S.scene === 'combat' && S.cam === '1st')
    && (!player.dead || player.hurtFlash % 8 < 4);

  // gait: walk cycle / idle breathing
  const wt = S.time * 0.28;
  if (player.moving) {
    u.hipL.rotation.x = Math.sin(wt) * 0.55;
    u.hipR.rotation.x = -Math.sin(wt) * 0.55;
    u.shL.rotation.x = -Math.sin(wt) * 0.4;
    if (player.swing <= 0) u.shR.rotation.x = Math.sin(wt) * 0.4;
    playerMesh.position.y = Math.abs(Math.sin(wt)) * 1.3;
  } else {
    u.hipL.rotation.x *= 0.8; u.hipR.rotation.x *= 0.8;
    u.shL.rotation.x = Math.sin(S.time * 0.04) * 0.05;
    if (player.swing <= 0) u.shR.rotation.x = Math.sin(S.time * 0.04 + 1) * 0.05;
    playerMesh.position.y = Math.sin(S.time * 0.05) * 0.4;
  }
  // sword swing: arm sweeps across, blade follows
  if (player.swing > 0) {
    const prog = 1 - player.swing / 12;
    u.shR.rotation.x = -2.4 + prog * 2.8;
    u.shR.rotation.z = 0.6 - prog * 1.0;
    u.sword.rotation.x = Math.PI - 0.6;
  } else {
    u.shR.rotation.z *= 0.8;
    u.sword.rotation.x += (Math.PI - u.sword.rotation.x) * 0.2;
  }
  // head tracks the aim, blinks occasionally
  if (S.scene === 'combat' && S.cam !== '1st') {
    const rel = angleDelta(Math.atan2(S.aim.y - player.y, S.aim.x - player.x), player.facing);
    u.head.rotation.y += (Math.max(-0.6, Math.min(0.6, rel)) - u.head.rotation.y) * 0.15;
  } else {
    u.head.rotation.y *= 0.9;
  }
  // quen ward shimmer
  u.quen.visible = player.quen > 0;
  if (u.quen.visible) u.quen.material.opacity = 0.09 + Math.sin(S.time * 0.2) * 0.05;
  // torch follows the witcher
  torch.position.set(player.x, 46, player.y);
  torch.intensity = 1.0 + Math.sin(S.time * 0.11) * 0.14;

  for (const e of enemies) {
    e.mesh.position.set(e.x, Math.sin(e.wob) * 1.4, e.y);
    e.mesh.rotation.y = -Math.atan2(player.y - e.y, player.x - e.x) + Math.PI / 2;
    animateEnemy(e);
  }

  for (const p of projectiles) {
    p.mesh.position.set(p.x, 22 + Math.sin(p.spin * 2) * 3, p.y);
    p.mesh.rotation.set(p.spin, p.spin * 1.4, 0);
  }

  for (const c of pickups) {
    c.mesh.position.set(c.x, c.h + Math.sin(c.bob) * 2.5, c.y);
    c.mesh.rotation.z = c.bob * 0.8;
  }

  for (const p of particles) {
    p.sprite.position.x += p.vx;
    p.sprite.position.y += p.vy;
    p.sprite.position.z += p.vz;
    p.vy -= 0.08;
    if (p.sprite.position.y < 2) { p.sprite.position.y = 2; p.vy = 0; }
    p.life--;
    p.sprite.material.opacity = Math.max(0, p.life / p.maxLife);
  }
  particles = particles.filter((p) => {
    if (p.life <= 0) { scene.remove(p.sprite); return false; }
    return true;
  });

  for (const fx of effects) {
    fx.life--;
    if (fx.update) fx.update(fx);
  }
  effects = effects.filter((fx) => {
    if (fx.life <= 0) { killEffectMesh(fx.mesh); return false; }
    return true;
  });

  for (const sp of fogSprites) {
    sp.position.x += sp.userData.sp;
    if (sp.position.x - sp.scale.x > W + 200) sp.position.x = -sp.scale.x - 200;
    sp.material.opacity = 0.075 + Math.sin(S.time * 0.006 + sp.userData.phase) * 0.03;
  }
  for (const ff of fireflies) {
    ff.userData.a += (Math.random() - 0.5) * 0.3;
    ff.position.x += Math.cos(ff.userData.a) * 0.4;
    ff.position.z += Math.sin(ff.userData.a) * 0.4;
    ff.position.y = 16 + Math.sin(S.time * 0.03 + ff.userData.phase) * 10;
    if (ff.position.x < 0) ff.position.x = W; if (ff.position.x > W) ff.position.x = 0;
    if (ff.position.z < 0) ff.position.z = H; if (ff.position.z > H) ff.position.z = 0;
    ff.material.opacity = 0.45 + Math.sin(S.time * 0.08 + ff.userData.phase) * 0.35;
  }

  updateFloaters();
  if (S.shake > 0) S.shake *= 0.88;
}

/* ---------- THE CAMERA: second person, as threatened ---------- */
let camHost = null;
const camPos = new THREE.Vector3(W / 2, 110, H / 2 + 220);
const camLook = new THREE.Vector3(W / 2, 20, H / 2);
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();

function updateCamera() {
  const px = player.x, pz = player.y;

  if (S.scene !== 'combat') {
    const a = S.time * 0.0035;
    desiredPos.set(px + Math.cos(a) * 190, 95, pz + Math.sin(a) * 190);
    desiredLook.set(px, 22, pz);
  } else if (S.cam === '2nd') {
    if (!camHost || camHost.hp <= 0 || !enemies.includes(camHost)) {
      camHost = null;
      let best = 1e9;
      for (const e of enemies) {
        const d = Math.hypot(e.x - px, e.y - pz);
        if (d < best) { best = d; camHost = e; }
      }
    }
    if (camHost) {
      const e = camHost;
      const headH = e.type === 'boss' ? 90 : e.r * 2.4 + 14;
      const ang = Math.atan2(e.y - pz, e.x - px);
      desiredPos.set(
        e.x + Math.cos(ang) * (e.r + 18),
        headH,
        e.y + Math.sin(ang) * (e.r + 18)
      );
      desiredLook.set(px, 24, pz);
    } else {
      const a = S.time * 0.006;
      desiredPos.set(px + Math.cos(a) * 150, 85, pz + Math.sin(a) * 150);
      desiredLook.set(px, 22, pz);
    }
  } else {
    // 1st person — the witcher's own eyes; mouse steers the gaze
    const fx = Math.cos(player.facing), fz = Math.sin(player.facing);
    desiredPos.set(px + fx * 4, 30, pz + fz * 4);
    desiredLook.set(px + fx * 140, 20, pz + fz * 140);
  }

  for (const e of enemies) e.mesh.visible = !(S.scene === 'combat' && S.cam === '2nd' && e === camHost);

  const snap = (S.scene === 'combat' && S.cam === '1st') ? 0.4 : 0.07;
  camPos.lerp(desiredPos, snap);
  camLook.lerp(desiredLook, Math.max(0.1, snap));
  camera.position.copy(camPos);
  if (S.shake > 0.5) {
    camera.position.x += (Math.random() - 0.5) * S.shake;
    camera.position.y += (Math.random() - 0.5) * S.shake * 0.6;
    camera.position.z += (Math.random() - 0.5) * S.shake;
  }
  camera.lookAt(camLook);
}

// ---------- dialogue engine ----------
const dlg = {
  queue: [], idx: 0, typing: false, fullLine: '', shown: 0, onDone: null,
};

function showDialogue(script, onDone) {
  S.scene = 'dialogue';
  dlg.queue = script;
  dlg.idx = 0;
  dlg.onDone = onDone || null;
  $('dialogue-box').classList.add('visible');
  nextLine();
}

function nextLine() {
  const item = dlg.queue[dlg.idx];
  if (!item) return endDialogue();
  if (item.choices) {
    $('speaker').textContent = item.speaker || '';
    $('line').textContent = item.text || '';
    setPortrait(item.portrait);
    const box = $('choices');
    box.innerHTML = '';
    for (const ch of item.choices) {
      const b = document.createElement('button');
      b.className = 'btn';
      b.textContent = ch.label;
      b.onclick = (ev) => {
        ev.stopPropagation();
        sfx.ui();
        if (ch.charm) { S.charm += ch.charm; }
        if (ch.effect) ch.effect();
        if (ch.respond) {
          dlg.queue.splice(dlg.idx + 1, 0, ...ch.respond);
        }
        box.innerHTML = '';
        dlg.idx++;
        nextLine();
      };
      box.appendChild(b);
    }
  } else {
    $('choices').innerHTML = '';
    $('speaker').textContent = item.speaker || '';
    setPortrait(item.portrait);
    typeLine(item.text);
  }
}

function typeLine(text) {
  dlg.typing = true;
  dlg.fullLine = text;
  dlg.shown = 0;
  $('line').textContent = '';
  const tick = () => {
    if (!dlg.typing) return;
    dlg.shown += 2;
    $('line').textContent = dlg.fullLine.slice(0, dlg.shown);
    if (dlg.shown < dlg.fullLine.length) setTimeout(tick, 16);
    else { dlg.typing = false; showContinueHint(); }
  };
  tick();
}

function showContinueHint() {
  $('line').innerHTML = dlg.fullLine + ' <span class="blink" style="color:#c8a35a">▸</span>';
}

function advanceDialogue() {
  if (!$('dialogue-box').classList.contains('visible')) return;
  const item = dlg.queue[dlg.idx];
  if (item && item.choices) return;
  if (dlg.typing) {
    dlg.typing = false;
    showContinueHint();
    return;
  }
  dlg.idx++;
  sfx.ui();
  nextLine();
}

function endDialogue() {
  $('dialogue-box').classList.remove('visible');
  setPortrait(null);
  const cb = dlg.onDone;
  dlg.onDone = null;
  if (cb) cb();
}

function setPortrait(emoji) {
  const p = $('portrait');
  if (emoji) {
    p.textContent = emoji;
    p.classList.add('visible');
    p.style.transform = 'scale(1.06)';
    setTimeout(() => { p.style.transform = 'scale(1)'; }, 150);
  } else {
    p.classList.remove('visible');
  }
}

window.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && S.scene === 'dialogue') {
    e.preventDefault();
    advanceDialogue();
  }
});
$('dialogue-box').addEventListener('click', advanceDialogue);

// ---------- story content ----------
function startIntro() {
  showDialogue([
    { speaker: 'Narrator', portrait: '📜', text: 'The Continent. A land of war, monsters, and questionable tavern hygiene. You are GERALD OF RIVIERA: professional monster slayer, amateur bath enthusiast, owner of exactly one facial expression.' },
    { speaker: 'Narrator', portrait: '🎥', text: 'A NOTE ON THE CAMERA: this demo is presented in SECOND PERSON. You do not see through Gerald\'s eyes. You see through the eyes of whatever is currently trying to eat him. Our cinematographer has been let go.' },
    { speaker: 'Gerald', portrait: '🧔🏻‍♂️', text: 'Hmm.' },
    { speaker: 'Narrator', portrait: '📜', text: 'Eloquent as ever. A village elder shuffles up, smelling of onions and desperation.' },
    { speaker: 'Village Elder', portrait: '👴', text: 'Watcher! Monsters plague our swamp! Drowners! Nekkers! Ghouls! And worse — something in a SUIT has been asking about our finances!' },
    {
      speaker: 'Gerald', portrait: '🧔🏻‍♂️', text: 'What\'s the pay?',
      choices: [
        { label: '💰 "Payment up front. Monsters don\'t take IOUs and neither do I."', charm: 0, respond: [
          { speaker: 'Village Elder', portrait: '👴', text: 'We can offer 12 coins, a wheel of cheese, and my niece thinks your hair is, quote, "a whole situation."' },
          { speaker: 'Gerald', portrait: '🧔🏻‍♂️', text: '…I\'ll take the cheese.' },
        ]},
        { label: '😏 "For you, grandpa? First monster\'s free. I\'m running a promotion."', charm: 1, respond: [
          { speaker: 'Village Elder', portrait: '👴', text: 'Oh! How charming! The ladies at the tavern were RIGHT about you.' },
          { speaker: 'Gerald', portrait: '🧔🏻‍♂️', text: 'Wait. What are the ladies at the tavern saying about— never mind. Where\'s the swamp.' },
        ]},
        { label: '🗡 (Say nothing. Unsheathe sword. Walk dramatically toward the swamp.)', charm: 1, respond: [
          { speaker: 'Narrator', portrait: '📜', text: 'Devastating. The elder swoons. Two crows nod respectfully. Somewhere, a lute riff plays itself.' },
        ]},
      ],
    },
    { speaker: 'Narrator', portrait: '📜', text: 'And so the Watcher walks the Path. ▸ WASD moves Gerald relative to YOUR eyes — and your eyes belong to a drowner. C switches to boring old first person. CLICK or SPACE swings, Q is Igni, E is Quen. Good luck. Try not to eat yourself.' },
  ], () => startCombat());
}

function startCombat() {
  S.scene = 'combat';
  S.bossPhase = false;
  camHost = null;
  $('hud').classList.add('visible');
  $('cam-label').classList.add('visible');
  updateCamLabel();
  player.x = W / 2; player.y = H / 2;
  player.hp = player.maxHp;
  clearField();
  spawnWave(0);
  updateHud();
}

function clearField() {
  for (const e of enemies) scene.remove(e.mesh);
  for (const p of projectiles) scene.remove(p.mesh);
  for (const c of pickups) scene.remove(c.mesh);
  enemies = []; projectiles = []; pickups = [];
}

function startTavern() {
  S.scene = 'dialogue';
  $('hud').classList.remove('visible');
  $('cam-label').classList.remove('visible');
  toast('Swamp cleared. Time for the REAL endgame content: the tavern.');
  showDialogue([
    { speaker: 'Narrator', portrait: '🍺', text: 'THE SLAUGHTERED LAMB TAVERN. Candlelight. Lute music. The smell of stew and poor decisions. Gerald enters, covered in swamp. Every head turns. One person faints, possibly from the smell.' },
    { speaker: 'Trish Marigold', portrait: '👩‍🦰', text: 'Well, well. Gerald of Riviera. Still alive, still brooding, still dressed like a leather-clad midlife crisis. Buy a sorceress a drink?' },
    { speaker: 'Narrator', portrait: '📜', text: 'Before you can answer, the air crackles with ozone and expensive perfume. YENNCIFER OF VINTAGE-BURG materializes, because doors are for people who lack drama.' },
    { speaker: 'Yenncifer', portrait: '🧝‍♀️', text: 'Gerald. You smell like a drowner\'s gym bag. It\'s… infuriating that it works for you. Sit. We need to talk about us. Again. For the forty-seventh time.' },
    { speaker: 'Trish Marigold', portrait: '👩‍🦰', text: 'Oh good, SHE\'S here. Gerald, darling — choose your next words very carefully. Possibly your last words.' },
    {
      speaker: '', text: 'Two sorceresses. One witcher. Zero good options. The bard in the corner starts taking notes.',
      choices: [
        { label: '💜 [Yenncifer] "You smell of lilac, gooseberries, and unresolved tension. I\'ve missed all three."', charm: 2, effect: () => { S.romanced = 'yenn'; }, respond: [
          { speaker: 'Yenncifer', portrait: '🧝‍♀️', text: '…That was almost poetic. Did you rehearse that in the swamp? You did, didn\'t you. You absolute disaster.' },
          { speaker: 'Yenncifer', portrait: '🧝‍♀️', text: 'Fine. ONE drink. And then you\'re taking a bath, because I am a powerful sorceress, not a miracle worker.' },
          { speaker: 'Narrator', portrait: '🕯️', text: 'She snaps her fingers. The candles dim themselves. The bard switches to a slow jam. Trish rolls her eyes so hard she briefly sees her own brain.' },
        ]},
        { label: '🧡 [Trish] "Trish, you\'re the only person here who hasn\'t tried to kill me. That\'s basically a love language."', charm: 2, effect: () => { S.romanced = 'trish'; }, respond: [
          { speaker: 'Trish Marigold', portrait: '👩‍🦰', text: 'Gerald, that is the saddest, sweetest thing anyone has said to me all war. Bartender! Two ales and a bathtub, we\'re celebrating mediocre emotional growth!' },
          { speaker: 'Yenncifer', portrait: '🧝‍♀️', text: 'Unbelievable. UNBELIEVABLE. I teleported here for THIS?' },
          { speaker: 'Narrator', portrait: '🕯️', text: 'Yenncifer vanishes in a huff of purple smoke, taking two chairs and someone\'s soup with her out of spite.' },
        ]},
        { label: '🍺 [Bartender] Lean over the bar: "And what time do YOU get off, handsome?"', charm: 1, effect: () => { S.romanced = 'bartender'; }, respond: [
          { speaker: 'Bartender', portrait: '🧔', text: 'Sir, I am flattered, genuinely, but I have seen what walks into this tavern at 2 a.m. and I am emotionally unavailable until the war ends.' },
          { speaker: 'Bartender', portrait: '🧔', text: '…Free ale though. For the confidence.' },
          { speaker: 'Narrator', portrait: '📜', text: 'Both sorceresses are now laughing at you. Somehow, this was still your smoothest option.' },
        ]},
        { label: '🛁 "Actually, I just came in here to ask: do you have a bathtub?"', charm: 1, effect: () => { S.romanced = 'bath'; }, respond: [
          { speaker: 'Narrator', portrait: '🛁', text: 'A hush falls. The bartender slowly nods toward the back room. Steam billows from a doorway. Somewhere, a choir hums.' },
          { speaker: 'Gerald', portrait: '🧔🏻‍♂️', text: 'Ladies. The bath and I need some time alone.' },
          { speaker: 'Narrator', portrait: '🛁', text: 'Yenncifer and Trish exchange a look of grudging respect. The man knows what he\'s about.' },
        ]},
      ],
    },
    { speaker: 'The Bard', portrait: '🪕', text: 'HOLD! Before anything tasteful and off-screen occurs — I challenge you, witcher, to a game of GWENT! The cards! The glory! The crippling addiction the whole Continent pretends is fine!' },
    {
      speaker: 'The Bard', portrait: '🪕', text: 'Ten coins says I shuffle you into the dirt. Well? Or are you SCARED of a man with a lute?',
      choices: [
        { label: '🃏 "Deal the cards, music boy. I\'ve slain things scarier than your rhyme schemes."', charm: 1, effect: () => { S.playGwent = true; } },
        { label: '🚪 "Hard pass. Last time I played Gwent I lost my horse, my boots, and a castle I didn\'t own."', charm: 0, effect: () => { S.playGwent = false; }, respond: [
          { speaker: 'The Bard', portrait: '🪕', text: 'COWARD! …Fair, though. That tournament in Novigrad got completely out of hand.' },
        ]},
      ],
    },
  ], () => {
    if (S.playGwent) {
      gwStart({ wager: true }, (result) => tavernAfterGwent(result));
    } else {
      tavernAfterGwent(null);
    }
  });
}

function tavernAfterGwent(result) {
  const gwentLine = {
    win: { speaker: 'Narrator', portrait: '🃏', text: 'You take the bard for 15 coins. He immediately begins composing "The Ballad of the Card Shark Witcher," which is somehow about him being brave.' },
    lose: { speaker: 'Narrator', portrait: '🃏', text: 'The bard wins and will be insufferable about it for the rest of recorded history. The sorceresses pretend not to know you.' },
    draw: { speaker: 'Narrator', portrait: '🃏', text: 'A draw at Gwent. The most erotic possible outcome, according to the bard, who is asked to leave.' },
  }[result];
  const script = [];
  if (gwentLine) script.push(gwentLine);
  script.push(
    { speaker: 'Narrator', portrait: '🌙', text: 'What follows is tasteful, candle-lit, and entirely off-screen. The camera pans to the fireplace. The lute music gets… suggestive. A unicorn figurine on the mantel tips over by itself.' },
    { speaker: 'Narrator', portrait: '🌅', text: 'LATER. Gerald stands, refreshed, hair magnificent, smelling 40% less like swamp. But the night is not over — a cold wind slams the tavern door open…' },
    { speaker: '???', portrait: '🕴️', text: '"GERALD OF RIVIERA. Slayer of twelve monsters this evening. By decree of the Novigrad Revenue Service… you have UNDECLARED INCOME."' },
    { speaker: 'Gerald', portrait: '🧔🏻‍♂️', text: 'I\'ve fought striga, leshens, and the king of the Wild Hunt. But this… this is the one that scares me. Damn.' },
  );
  showDialogue(script, () => startBossFight());
}

function startBossFight() {
  S.scene = 'combat';
  S.bossPhase = true;
  camHost = null;
  $('hud').classList.add('visible');
  $('cam-label').classList.add('visible');
  updateCamLabel();
  player.x = W / 2; player.y = H - 80;
  player.hp = player.maxHp;
  clearField();
  spawnBoss();
  $('bb-fill').style.width = '100%';
  updateHud();
}

function startEnding() {
  S.scene = 'dialogue';
  $('hud').classList.remove('visible');
  $('cam-label').classList.remove('visible');
  const romanceLine = {
    yenn: 'Yenncifer portals in, hands you a towel, and says "Don\'t read into this" in a way that means you should absolutely read into this. 💜',
    trish: 'Trish toasts you from the bar: "To Gerald — flammable, taxable, and surprisingly lovable!" 🧡',
    bartender: 'The bartender slides you one more free ale and a napkin with… a drawing of a sword on it? It\'s the thought that counts. 🍺',
    bath: 'The bathtub awaits your return. It has missed you. You have missed it. This is the purest romance in the entire saga. 🛁',
  }[S.romanced] || 'You romanced no one, which honestly is the most realistic witcher experience available.';
  showDialogue([
    { speaker: 'Narrator', portrait: '🏆', text: 'The Tax Collector is vanquished, his ledger scattered to the winds. The village cheers. The bard immediately begins composing "The Ballad of the Deductible Witcher."' },
    { speaker: 'Narrator', portrait: '💘', text: romanceLine },
    { speaker: 'Narrator', portrait: '🎥', text: 'The camera — freed at last from monster duty — pulls back into the night sky, past the fireflies, past a horse standing on a roof for no reason.' },
    { speaker: 'Gerald', portrait: '🧔🏻‍♂️', text: 'Hmm. Good demo.' },
  ], () => showEndScreen());
}

function showEndScreen() {
  S.scene = 'ending';
  const charm = S.charm;
  const rank = charm >= 4 ? 'CERTIFIED SWAMP CASANOVA 😏' : charm >= 2 ? 'Mildly Charming (for a mutant)' : 'Emotionally Constipated (canon)';
  $('end-subtitle').textContent = 'The Path is long, but the bath is warm.';
  $('end-stats').innerHTML =
    '🗡 Monsters slain: <b>' + S.kills + '</b><br>' +
    '🪙 Coins looted: <b>' + S.coins + '</b><br>' +
    '😏 Charm rating: <b>' + rank + '</b><br>' +
    '🎥 Times the camera was a monster: <b>' + S.kills + '</b> (it never complained)<br>' +
    '⚖ Taxes paid: <b>0</b> (nice)';
  $('end-screen').classList.add('visible');
}

// ---------- scene wiring ----------
$('start-btn').onclick = () => {
  sfx.ui();
  $('title-screen').classList.remove('visible');
  startIntro();
};
$('restart-btn').onclick = () => {
  sfx.ui();
  $('end-screen').classList.remove('visible');
  S.coins = 0; S.kills = 0; S.charm = 0; S.romanced = null;
  S.bossDefeated = false; S.bossPhase = false; S.playGwent = false;
  player.hp = player.maxHp; player.dead = false;
  clearField();
  for (const m of decalsList) killEffectMesh(m);
  decalsList = [];
  startIntro();
};

// responsive scale
function fitStage() {
  const stageEl = document.getElementById('stage');
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H, 1.4);
  stageEl.style.transform = 'translateY(-50%) scale(' + scale + ')';
}
window.addEventListener('resize', fitStage);
fitStage();

// ---------- main loop ----------
function loop() {
  S.time++;
  if (S.scene === 'combat') updateCombat();
  updateWorld();
  updateCamera();
  if (webglOK) {
    if (composer) composer.render();
    else renderer.render(scene, camera);
  }
  requestAnimationFrame(loop);
}
loop();
