/* ============================================================
   THE WATCHER 4 — A Totally Legally Distinct Parody Demo
   Now in 3D, presented in SECOND PERSON: you do not play the
   witcher. You watch the witcher. Through the monster's eyes.
   You are the swamp. You have always been the swamp.
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
  scene: 'title',          // title | combat | dialogue | ending
  keys: {},
  aim: { x: W / 2, y: H / 2 },   // mouse, raycast onto the ground plane (world x/z)
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
   THREE.JS WORLD
   ============================================================ */

const cvs = document.getElementById('game');
let renderer = null, scene = null, camera = null;
let webglOK = true;
try {
  renderer = new THREE.WebGLRenderer({ canvas: cvs, antialias: true });
  renderer.setSize(W, H, false);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputEncoding = THREE.sRGBEncoding;
} catch (e) {
  webglOK = false;
  console.error('WebGL unavailable:', e);
}

scene = new THREE.Scene();
scene.background = new THREE.Color(0x0a0f0c);
scene.fog = new THREE.FogExp2(0x0d1410, 0.00135);

camera = new THREE.PerspectiveCamera(55, W / H, 1, 5000);
camera.position.set(W / 2, 110, H / 2 + 220);
camera.lookAt(W / 2, 20, H / 2);

// --- lights ---
scene.add(new THREE.AmbientLight(0x3c4a36, 1.0));
const hemi = new THREE.HemisphereLight(0x44525c, 0x1a140c, 0.55);
scene.add(hemi);
const moon = new THREE.DirectionalLight(0x9db4cc, 1.0);
moon.position.set(W / 2 - 420, 600, H / 2 - 320);
moon.target.position.set(W / 2, 0, H / 2);
moon.castShadow = true;
moon.shadow.mapSize.set(1024, 1024);
moon.shadow.camera.left = -700; moon.shadow.camera.right = 700;
moon.shadow.camera.top = 700; moon.shadow.camera.bottom = -700;
moon.shadow.camera.far = 1600;
scene.add(moon, moon.target);
const torch = new THREE.PointLight(0xffb070, 1.0, 260, 1.8);
torch.position.set(W / 2, 46, H / 2);
scene.add(torch);

// --- ground with hand-painted swamp texture ---
const groundTexCanvas = (() => {
  const c = document.createElement('canvas');
  c.width = 1024; c.height = 1024;
  const f = c.getContext('2d');
  let g = f.createRadialGradient(512, 512, 80, 512, 512, 760);
  g.addColorStop(0, '#27331f');
  g.addColorStop(0.65, '#1d2717');
  g.addColorStop(1, '#131a0e');
  f.fillStyle = g; f.fillRect(0, 0, 1024, 1024);
  for (let i = 0; i < 90; i++) {
    f.fillStyle = `rgba(${26 + Math.random() * 26 | 0},${32 + Math.random() * 18 | 0},${18 + Math.random() * 12 | 0},.6)`;
    f.beginPath();
    f.ellipse(Math.random() * 1024, Math.random() * 1024, 26 + Math.random() * 70, 14 + Math.random() * 34, Math.random() * 3, 0, 7);
    f.fill();
  }
  // pools of standing water
  const pools = [[210, 760, 130, 56], [820, 230, 110, 46], [700, 820, 150, 60], [180, 200, 95, 40]];
  for (const [px, py, prx, pry] of pools) {
    const pg = f.createRadialGradient(px, py, 4, px, py, prx);
    pg.addColorStop(0, '#27424a');
    pg.addColorStop(0.8, '#1b2d33');
    pg.addColorStop(1, '#15221f');
    f.fillStyle = pg;
    f.beginPath(); f.ellipse(px, py, prx, pry, 0, 0, 7); f.fill();
    f.strokeStyle = 'rgba(150,185,165,.22)';
    f.beginPath(); f.ellipse(px, py, prx, pry, 0, 0, 7); f.stroke();
  }
  // grass
  for (let i = 0; i < 320; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024;
    for (let b = 0; b < 3; b++) {
      f.strokeStyle = b ? 'rgba(88,122,58,.55)' : 'rgba(58,92,40,.6)';
      f.beginPath();
      f.moveTo(x, y);
      f.quadraticCurveTo(x + (b - 1) * 3, y - 6, x + (b - 1) * 5, y - 10 - Math.random() * 6);
      f.stroke();
    }
  }
  // stones
  for (let i = 0; i < 60; i++) {
    const x = Math.random() * 1024, y = Math.random() * 1024, r = 2 + Math.random() * 5;
    f.fillStyle = 'rgba(110,110,100,.5)';
    f.beginPath(); f.ellipse(x, y, r, r * 0.7, 0, 0, 7); f.fill();
  }
  return c;
})();
const groundTex = new THREE.CanvasTexture(groundTexCanvas);
groundTex.encoding = THREE.sRGBEncoding;
const ground = new THREE.Mesh(
  new THREE.PlaneGeometry(2400, 1800),
  new THREE.MeshLambertMaterial({ map: groundTex })
);
ground.rotation.x = -Math.PI / 2;
ground.position.set(W / 2, 0, H / 2);
ground.receiveShadow = true;
scene.add(ground);

// --- scattered set dressing ---
const setDressing = new THREE.Group();
scene.add(setDressing);
(function plantForest() {
  const trunkMat = new THREE.MeshLambertMaterial({ color: 0x2a2014 });
  const leafMat = new THREE.MeshLambertMaterial({ color: 0x162412 });
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + Math.random() * 0.4;
    const rad = 470 + Math.random() * 320;
    const tx = W / 2 + Math.cos(a) * rad;
    const tz = H / 2 + Math.sin(a) * rad * 0.72;
    const h = 90 + Math.random() * 110;
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(4 + Math.random() * 3, 7 + Math.random() * 4, h, 6), trunkMat);
    trunk.position.set(tx, h / 2, tz);
    trunk.rotation.z = (Math.random() - 0.5) * 0.14;
    trunk.castShadow = true;
    const crown = new THREE.Mesh(new THREE.IcosahedronGeometry(26 + Math.random() * 22, 0), leafMat);
    crown.position.set(tx + (Math.random() - 0.5) * 10, h + 8, tz + (Math.random() - 0.5) * 10);
    crown.scale.y = 0.7 + Math.random() * 0.4;
    crown.castShadow = true;
    setDressing.add(trunk, crown);
  }
  // rocks inside the arena
  const rockMat = new THREE.MeshLambertMaterial({ color: 0x4c4c44 });
  for (let i = 0; i < 16; i++) {
    const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(3 + Math.random() * 6, 0), rockMat);
    rock.position.set(60 + Math.random() * (W - 120), 2 + Math.random() * 2, 60 + Math.random() * (H - 120));
    rock.rotation.set(Math.random() * 3, Math.random() * 3, Math.random() * 3);
    rock.castShadow = true;
    setDressing.add(rock);
  }
  // glowing mushrooms with real light
  for (let i = 0; i < 5; i++) {
    const mx = 80 + Math.random() * (W - 160), mz = 80 + Math.random() * (H - 160);
    const cap = new THREE.Mesh(
      new THREE.SphereGeometry(4, 8, 6, 0, Math.PI * 2, 0, Math.PI / 2),
      new THREE.MeshLambertMaterial({ color: 0x7ec898, emissive: 0x3a8a5c, emissiveIntensity: 0.9 })
    );
    cap.position.set(mx, 2, mz);
    const glow = new THREE.PointLight(0x5fc98a, 0.55, 90, 2);
    glow.position.set(mx, 8, mz);
    setDressing.add(cap, glow);
  }
})();

// --- stars ---
(function stars() {
  const geo = new THREE.BufferGeometry();
  const pts = [];
  for (let i = 0; i < 260; i++) {
    const a = Math.random() * Math.PI * 2, r = 900 + Math.random() * 900;
    pts.push(W / 2 + Math.cos(a) * r, 380 + Math.random() * 700, H / 2 + Math.sin(a) * r);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
  scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xb9c4d8, size: 2.4, sizeAttenuation: false, fog: false })));
})();

// --- sprite helpers ---
function makeGlowTexture(r, g, b) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(32, 32, 0, 32, 32, 32);
  gr.addColorStop(0, `rgba(${r},${g},${b},1)`);
  gr.addColorStop(0.35, `rgba(${r},${g},${b},.35)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr; x.fillRect(0, 0, 64, 64);
  return new THREE.CanvasTexture(c);
}
const texFirefly = makeGlowTexture(185, 235, 110);
const texFire = makeGlowTexture(255, 150, 50);
const texSoft = makeGlowTexture(200, 215, 195);

// --- drifting fog ---
const fogSprites = [];
for (let i = 0; i < 7; i++) {
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({
    map: texSoft, transparent: true, opacity: 0.10, depthWrite: false,
  }));
  sp.scale.set(420 + Math.random() * 260, 130 + Math.random() * 60, 1);
  sp.position.set(Math.random() * W, 16 + Math.random() * 18, Math.random() * H);
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
  sp.scale.set(9, 9, 1);
  sp.position.set(Math.random() * W, 14 + Math.random() * 30, Math.random() * H);
  sp.userData = { a: Math.random() * 7, phase: Math.random() * 7 };
  scene.add(sp);
  fireflies.push(sp);
}

/* ---------- character factories ---------- */

const MAT = {
  armor: new THREE.MeshLambertMaterial({ color: 0x33291d }),
  armorDark: new THREE.MeshLambertMaterial({ color: 0x1d1712 }),
  skin: new THREE.MeshLambertMaterial({ color: 0xc69b76 }),
  hair: new THREE.MeshLambertMaterial({ color: 0xe8e4d8 }),
  steel: new THREE.MeshLambertMaterial({ color: 0xb8bec9 }),
  gold: new THREE.MeshLambertMaterial({ color: 0xc8a35a, emissive: 0x4a3408, emissiveIntensity: 0.5 }),
  leather: new THREE.MeshLambertMaterial({ color: 0x4a3318 }),
  paper: new THREE.MeshLambertMaterial({ color: 0xe8e4d4, side: THREE.DoubleSide }),
};

function makeGerald() {
  const g = new THREE.Group();
  // body — armored coat
  const body = new THREE.Mesh(new THREE.CylinderGeometry(7, 10, 22, 10), MAT.armor);
  body.position.y = 16; body.castShadow = true;
  // shoulder plates
  for (const sx of [-8, 8]) {
    const pad = new THREE.Mesh(new THREE.SphereGeometry(4.6, 8, 6), MAT.armorDark);
    pad.position.set(sx, 25, 0); pad.scale.y = 0.7; pad.castShadow = true;
    g.add(pad);
  }
  // belt + buckle (very important to the lore)
  const belt = new THREE.Mesh(new THREE.CylinderGeometry(8.6, 8.6, 2.4, 10), MAT.leather);
  belt.position.y = 12;
  const buckle = new THREE.Mesh(new THREE.BoxGeometry(3.4, 2.6, 1.4), MAT.gold);
  buckle.position.set(0, 12, 8.4);
  // head + the iconic white hair
  const head = new THREE.Mesh(new THREE.SphereGeometry(5.2, 10, 8), MAT.skin);
  head.position.y = 31; head.castShadow = true;
  const hair = new THREE.Mesh(new THREE.SphereGeometry(5.6, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.62), MAT.hair);
  hair.position.y = 32;
  const tail = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 0.7, 9, 6), MAT.hair);
  tail.position.set(0, 28, -5.5); tail.rotation.x = 0.5;
  // wolf medallion
  const medallion = new THREE.Mesh(new THREE.CylinderGeometry(1.4, 1.4, 0.6, 8), MAT.gold);
  medallion.rotation.x = Math.PI / 2;
  medallion.position.set(0, 24, 7.6);
  // two swords on the back — silver for monsters, steel for ex-lovers
  for (const [sx, rz] of [[-3.4, 0.3], [3.4, -0.3]]) {
    const blade = new THREE.Mesh(new THREE.BoxGeometry(1.2, 26, 2.2), MAT.steel);
    blade.position.set(sx, 28, -6.5);
    blade.rotation.z = rz;
    const pommel = new THREE.Mesh(new THREE.SphereGeometry(1.3, 6, 6), MAT.gold);
    pommel.position.set(sx - Math.sin(rz) * 13.5, 28 + Math.cos(rz) * 13.5, -6.5);
    g.add(blade, pommel);
  }
  // sword in hand (shown while swinging)
  const drawn = new THREE.Group();
  const dBlade = new THREE.Mesh(new THREE.BoxGeometry(34, 1.6, 3.2), MAT.steel);
  dBlade.position.x = 24;
  const dGrip = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 6, 6), MAT.leather);
  dGrip.rotation.z = Math.PI / 2; dGrip.position.x = 4;
  drawn.add(dBlade, dGrip);
  drawn.position.y = 20;
  drawn.visible = false;
  g.userData.drawn = drawn;
  // quen ward
  const quen = new THREE.Mesh(
    new THREE.SphereGeometry(24, 18, 14),
    new THREE.MeshBasicMaterial({ color: 0xffd45a, transparent: true, opacity: 0.16, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide })
  );
  quen.position.y = 18;
  quen.visible = false;
  g.userData.quen = quen;
  g.add(body, belt, buckle, head, hair, tail, medallion, drawn, quen);
  return g;
}
const playerMesh = makeGerald();
scene.add(playerMesh);

function eyeMesh(color, x, y, z, size) {
  const m = new THREE.Mesh(
    new THREE.SphereGeometry(size || 1.4, 6, 6),
    new THREE.MeshBasicMaterial({ color })
  );
  m.position.set(x, y, z);
  return m;
}

function makeEnemyMesh(type, r) {
  const g = new THREE.Group();
  if (type === 'boss') {
    const robe = new THREE.Mesh(new THREE.CylinderGeometry(14, 34, 74, 12),
      new THREE.MeshLambertMaterial({ color: 0x3a3a55 }));
    robe.position.y = 37; robe.castShadow = true;
    const collar = new THREE.Mesh(new THREE.CylinderGeometry(11, 15, 6, 12),
      new THREE.MeshLambertMaterial({ color: 0xd8d2c2 }));
    collar.position.y = 72;
    const head = new THREE.Mesh(new THREE.SphereGeometry(11, 12, 10),
      new THREE.MeshLambertMaterial({ color: 0xc8c0aa }));
    head.position.y = 84; head.castShadow = true;
    // pince-nez of doom
    for (const ex of [-4, 4]) {
      const lens = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.5, 6, 12),
        new THREE.MeshBasicMaterial({ color: 0x15151a }));
      lens.position.set(ex, 86, 10);
      g.add(lens);
    }
    // the ledger
    const ledger = new THREE.Mesh(new THREE.BoxGeometry(14, 20, 3), MAT.paper);
    ledger.position.set(26, 46, 8);
    ledger.rotation.y = -0.4;
    // orbiting paperwork of doom
    const papers = new THREE.Group();
    for (let i = 0; i < 4; i++) {
      const p = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), MAT.paper);
      p.userData.phase = i * 1.6;
      papers.add(p);
    }
    papers.position.y = 60;
    g.userData.papers = papers;
    g.add(robe, collar, head, ledger, papers);
    return g;
  }
  const c = ENEMY_TYPES[type].color;
  const bodyMat = new THREE.MeshLambertMaterial({ color: c });
  const body = new THREE.Mesh(new THREE.SphereGeometry(r, 10, 8), bodyMat);
  body.position.y = r * 0.95;
  body.scale.y = 1.18;
  body.castShadow = true;
  g.add(body);
  g.userData.bodyMat = bodyMat;
  if (type === 'drowner') {
    for (let i = -1; i <= 1; i++) {
      const fin = new THREE.Mesh(new THREE.ConeGeometry(2.6, 8, 5),
        new THREE.MeshLambertMaterial({ color: 0x27411f }));
      fin.position.set(i * 6, r * 1.9, -r * 0.4);
      g.add(fin);
    }
    g.add(eyeMesh(0xf4ff7a, -r * 0.38, r * 1.25, r * 0.8), eyeMesh(0xf4ff7a, r * 0.38, r * 1.25, r * 0.8));
  } else if (type === 'nekker') {
    for (const ex of [-1, 1]) {
      const ear = new THREE.Mesh(new THREE.ConeGeometry(2.4, 9, 5),
        new THREE.MeshLambertMaterial({ color: 0x7a5c34 }));
      ear.position.set(ex * r * 0.7, r * 2.1, 0);
      ear.rotation.z = -ex * 0.5;
      g.add(ear);
    }
    g.add(eyeMesh(0xffb347, -r * 0.4, r * 1.25, r * 0.8, 1.1), eyeMesh(0xffb347, r * 0.4, r * 1.25, r * 0.8, 1.1));
  } else { // ghoul
    for (let i = 0; i < 3; i++) {
      const rib = new THREE.Mesh(new THREE.TorusGeometry(r * 0.62, 0.7, 5, 10, Math.PI),
        new THREE.MeshLambertMaterial({ color: 0xcdbdb0 }));
      rib.position.y = r * 0.85 + i * 4;
      rib.rotation.x = Math.PI / 2.4;
      g.add(rib);
    }
    g.add(eyeMesh(0xff5040, -r * 0.38, r * 1.3, r * 0.78, 1.7), eyeMesh(0xff5040, r * 0.38, r * 1.3, r * 0.78, 1.7));
  }
  return g;
}

function makeCoinMesh() {
  const m = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.2, 1, 12), MAT.gold);
  m.rotation.x = Math.PI / 2;
  return m;
}

function makePaperMesh() {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(9, 12), MAT.paper);
  return m;
}

function makeRoachSprite() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.font = '96px serif';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.fillText('🐴', 64, 58);
  x.font = 'italic 14px Georgia';
  x.fillStyle = '#d9cbab';
  x.fillText('*judging you*', 64, 116);
  const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true }));
  sp.scale.set(52, 52, 1);
  return sp;
}

/* ---------- transient effects ---------- */
let effects = [];   // { mesh, life, maxLife, update? }
let particles = []; // { sprite, vx, vy, vz, life, maxLife }

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

// persistent gore & scorch decals, like memories (capped)
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
  // glowing swing arc on the ground
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
  const flash = new THREE.PointLight(0xff7722, 2.4, 320, 1.6);
  flash.position.set(player.x + Math.cos(player.facing) * 60, 30, player.y + Math.sin(player.facing) * 60);
  spawnEffect(flash, 22, (fx) => { fx.mesh.intensity = 2.4 * (fx.life / fx.maxLife); });
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
  enemies = enemies.filter(e => e.type === 'boss');  // mercy: trash mobs respect death
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
    // movement is camera-relative, which in 2nd person is its own minigame
    camera.getWorldDirection(camFwd);
    camFwd.y = 0;
    if (camFwd.lengthSq() < 0.001) camFwd.set(0, 0, -1);
    camFwd.normalize();
    camRight.crossVectors(camFwd, UP).negate();
    let mx = 0, mz = 0;
    const f = (S.keys['w'] || S.keys['arrowup'] ? 1 : 0) - (S.keys['s'] || S.keys['arrowdown'] ? 1 : 0);
    const r = (S.keys['d'] || S.keys['arrowright'] ? 1 : 0) - (S.keys['a'] || S.keys['arrowleft'] ? 1 : 0);
    mx = camFwd.x * f - camRight.x * r;
    mz = camFwd.z * f - camRight.z * r;
    const m = Math.hypot(mx, mz);
    if (m > 0.01) {
      player.moving = true;
      player.moveDir.x = mx / m; player.moveDir.z = mz / m;
      player.x += (mx / m) * player.speed;
      player.y += (mz / m) * player.speed;
      player.x = Math.max(ARENA.minX, Math.min(ARENA.maxX, player.x));
      player.y = Math.max(ARENA.minZ, Math.min(ARENA.maxZ, player.y));
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

  // enemies
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

  // projectiles (tax forms)
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

  // pickups
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

function updateWorld() {
  // sync player mesh
  playerMesh.position.set(player.x, 0, player.y);
  playerMesh.rotation.y = -player.facing + Math.PI / 2;
  const bob = player.moving ? Math.sin(S.time * 0.25) * 1.4 : Math.sin(S.time * 0.07) * 0.5;
  playerMesh.position.y = bob;
  playerMesh.visible = S.scene !== 'title'
    && !(S.scene === 'combat' && S.cam === '1st')   // don't render the inside of Gerald's head
    && (!player.dead || player.hurtFlash % 8 < 4);
  // drawn sword swing animation
  const drawn = playerMesh.userData.drawn;
  drawn.visible = player.swing > 0;
  if (player.swing > 0) {
    const prog = 1 - player.swing / 12;
    drawn.rotation.y = 1.1 - prog * 2.2;
  }
  // quen ward
  const quen = playerMesh.userData.quen;
  quen.visible = player.quen > 0;
  if (quen.visible) quen.material.opacity = 0.10 + Math.sin(S.time * 0.2) * 0.06;
  // torch follows the witcher
  torch.position.set(player.x, 46, player.y);
  torch.intensity = 0.9 + Math.sin(S.time * 0.11) * 0.12;

  // enemies
  for (const e of enemies) {
    e.mesh.position.set(e.x, Math.sin(e.wob) * 1.6, e.y);
    e.mesh.rotation.y = -Math.atan2(player.y - e.y, player.x - e.x) + Math.PI / 2;
    if (e.userDataFlash !== e.hitFlash) {
      const flashing = e.hitFlash > 0 && e.hitFlash % 4 < 2;
      e.mesh.traverse((o) => {
        if (o.isMesh && o.material && o.material.emissive !== undefined) {
          o.material.emissive = o.material.emissive || new THREE.Color(0);
          o.material.emissiveIntensity = flashing ? 1 : (o.material === MAT.gold ? 0.5 : 0);
          if (flashing) o.material.emissive = new THREE.Color(0x884444);
          else if (o.material !== MAT.gold) o.material.emissive = new THREE.Color(0x000000);
        }
      });
      e.userDataFlash = e.hitFlash;
    }
    if (e.type === 'boss' && e.mesh.userData.papers) {
      e.mesh.userData.papers.children.forEach((p) => {
        const a = S.time * 0.035 + p.userData.phase;
        p.position.set(Math.cos(a) * 58, Math.sin(a * 1.7) * 10, Math.sin(a) * 58);
        p.rotation.set(a, a * 1.3, 0);
      });
    }
  }

  // projectiles
  for (const p of projectiles) {
    p.mesh.position.set(p.x, 22 + Math.sin(p.spin * 2) * 3, p.y);
    p.mesh.rotation.set(p.spin, p.spin * 1.4, 0);
  }

  // pickups
  for (const c of pickups) {
    c.mesh.position.set(c.x, c.h + Math.sin(c.bob) * 2.5, c.y);
    c.mesh.rotation.z = c.bob * 0.8;
  }

  // particles
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

  // timed effects
  for (const fx of effects) {
    fx.life--;
    if (fx.update) fx.update(fx);
  }
  effects = effects.filter((fx) => {
    if (fx.life <= 0) { killEffectMesh(fx.mesh); return false; }
    return true;
  });

  // fog drift
  for (const sp of fogSprites) {
    sp.position.x += sp.userData.sp;
    if (sp.position.x - sp.scale.x > W + 200) sp.position.x = -sp.scale.x - 200;
    sp.material.opacity = 0.08 + Math.sin(S.time * 0.006 + sp.userData.phase) * 0.035;
  }
  // fireflies wander
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
let camHost = null;          // the monster whose eyes you borrow
const camPos = new THREE.Vector3(W / 2, 110, H / 2 + 220);
const camLook = new THREE.Vector3(W / 2, 20, H / 2);
const desiredPos = new THREE.Vector3();
const desiredLook = new THREE.Vector3();

function updateCamera() {
  const px = player.x, pz = player.y;

  if (S.scene !== 'combat') {
    // cinematic crow, slowly circling the witcher
    const a = S.time * 0.0035;
    desiredPos.set(px + Math.cos(a) * 190, 95, pz + Math.sin(a) * 190);
    desiredLook.set(px, 22, pz);
  } else if (S.cam === '2nd') {
    // you are the nearest monster. enjoy.
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
      // sit just behind the monster's head, looking at the witcher
      const ang = Math.atan2(e.y - pz, e.x - px);
      desiredPos.set(
        e.x + Math.cos(ang) * (e.r + 18),
        headH,
        e.y + Math.sin(ang) * (e.r + 18)
      );
      desiredLook.set(px, 24, pz);
    } else {
      // no monsters left: you are a crow now. circle your witcher.
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

  // the host monster shouldn't block its own eyeballs
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
  if (item && item.choices) return; // must click a choice
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
  if (webglOK) renderer.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();
