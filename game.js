/* ============================================================
   THE WATCHER 4 — A Totally Legally Distinct Parody Demo
   Gerald of Riviera: professional monster slayer, amateur
   bath-taker, reluctant tax payer.
   ============================================================ */

'use strict';

const W = 960, H = 540;
const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');

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
  mouse: { x: W / 2, y: H / 2, down: false },
  shake: 0,
  time: 0,
  coins: 0,
  kills: 0,
  charm: 0,
  romanced: null,
  bossDefeated: false,
  wave: 0,
  waveBanner: '',
  bannerTimer: 0,
};

const player = {
  x: W / 2, y: H / 2, r: 16, hp: 6, maxHp: 6,
  speed: 3.1, facing: 0,
  swing: 0,            // >0 while sword arc is active
  swingCd: 0,
  igniCd: 0, quenCd: 0, quen: 0,
  hurtFlash: 0, dead: false,
  roachCd: 0, moving: false,
};

let enemies = [];
let particles = [];
let floaters = [];
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
  drowner: { r: 15, hp: 2, speed: 1.1, color: '#4a7a4a', dmgCd: 60 },
  nekker:  { r: 11, hp: 1, speed: 2.3, color: '#9a7a4a', dmgCd: 50 },
  ghoul:   { r: 17, hp: 3, speed: 1.5, color: '#7a5a6a', dmgCd: 55 },
  boss:    { r: 42, hp: 40, speed: 0.85, color: '#3a3a4e', dmgCd: 70 },
};

function spawnWave(idx) {
  S.wave = idx;
  S.waveBanner = WAVES[idx].name;
  S.bannerTimer = 180;
  for (const [type, count] of WAVES[idx].spawn) {
    for (let i = 0; i < count; i++) spawnEnemy(type);
  }
  updateHud();
}

function spawnEnemy(type) {
  const t = ENEMY_TYPES[type];
  // spawn at the edges, away from the player
  let x, y;
  do {
    const side = Math.floor(Math.random() * 4);
    x = side === 0 ? -30 : side === 1 ? W + 30 : Math.random() * W;
    y = side === 2 ? -30 : side === 3 ? H + 30 : Math.random() * H;
  } while (Math.hypot(x - player.x, y - player.y) < 200);
  enemies.push({
    type, x, y, r: t.r, hp: t.hp, maxHp: t.hp, speed: t.speed,
    color: t.color, hitFlash: 0, dmgTimer: 0, wob: Math.random() * 99,
    lungeTimer: 0, vx: 0, vy: 0, attackTimer: 0,
  });
}

function spawnBoss() {
  const t = ENEMY_TYPES.boss;
  enemies.push({
    type: 'boss', x: W / 2, y: -80, r: t.r, hp: t.hp, maxHp: t.hp,
    speed: t.speed, color: t.color, hitFlash: 0, dmgTimer: 0,
    wob: 0, lungeTimer: 0, vx: 0, vy: 0, attackTimer: 90,
  });
  S.waveBanner = '⚖ THE TAX COLLECTOR OF NOVIGRAD — LEVEL ??? — WEAKNESS: RECEIPTS ⚖';
  S.bannerTimer = 240;
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

// ---------- input ----------
window.addEventListener('keydown', (e) => {
  S.keys[e.key.toLowerCase()] = true;
  if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(e.key.toLowerCase())) e.preventDefault();
});
window.addEventListener('keyup', (e) => { S.keys[e.key.toLowerCase()] = false; });
cvs.addEventListener('mousemove', (e) => {
  const rect = cvs.getBoundingClientRect();
  S.mouse.x = (e.clientX - rect.left) * (W / rect.width);
  S.mouse.y = (e.clientY - rect.top) * (H / rect.height);
});
cvs.addEventListener('mousedown', () => { S.mouse.down = true; });
window.addEventListener('mouseup', () => { S.mouse.down = false; });

// ---------- combat ----------
function tryAttack() {
  if (player.swingCd > 0 || player.dead) return;
  player.swingCd = 22;
  player.swing = 12;
  player.facing = Math.atan2(S.mouse.y - player.y, S.mouse.x - player.x);
  sfx.swing();
  const reach = 58, arc = 1.5;
  for (const e of enemies) {
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < reach + e.r) {
      const ang = Math.atan2(e.y - player.y, e.x - player.x);
      let diff = Math.abs(ang - player.facing);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < arc) hitEnemy(e, 1, ang);
    }
  }
}

function castIgni() {
  if (player.igniCd > 0 || player.dead) return;
  player.igniCd = 240;
  player.facing = Math.atan2(S.mouse.y - player.y, S.mouse.x - player.x);
  sfx.igni();
  S.shake = 6;
  addScorch(player.x + Math.cos(player.facing) * 90, player.y + Math.sin(player.facing) * 90);
  for (let i = 0; i < 40; i++) {
    const a = player.facing + (Math.random() - 0.5) * 0.9;
    const sp = 3 + Math.random() * 5;
    particles.push({
      x: player.x + Math.cos(player.facing) * 20,
      y: player.y + Math.sin(player.facing) * 20,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 30 + Math.random() * 20, maxLife: 50,
      color: ['#ff6a00', '#ffaa00', '#ffe066'][Math.floor(Math.random() * 3)],
      size: 4 + Math.random() * 5, glow: true,
    });
  }
  for (const e of enemies) {
    const d = Math.hypot(e.x - player.x, e.y - player.y);
    if (d < 190) {
      const ang = Math.atan2(e.y - player.y, e.x - player.x);
      let diff = Math.abs(ang - player.facing);
      if (diff > Math.PI) diff = 2 * Math.PI - diff;
      if (diff < 0.8) hitEnemy(e, 2, ang, true);
    }
  }
  floaters.push({ x: player.x, y: player.y - 40, text: 'IGNI', life: 50, color: '#ffaa00' });
}

function castQuen() {
  if (player.quenCd > 0 || player.dead) return;
  player.quenCd = 360;
  player.quen = 240;
  sfx.quen();
  floaters.push({ x: player.x, y: player.y - 40, text: 'QUEN', life: 50, color: '#ffd700' });
}

function summonRoach() {
  if (player.roachCd > 0) return;
  player.roachCd = 300;
  sfx.neigh();
  roach = { x: Math.random() * (W - 200) + 100, y: Math.random() * (H - 200) + 100, life: 220, tilt: (Math.random() - 0.5) * 0.8 };
  toast(ROACH_QUIPS[Math.floor(Math.random() * ROACH_QUIPS.length)]);
}

function hitEnemy(e, dmg, knockAng, burn) {
  e.hp -= dmg;
  e.hitFlash = 8;
  e.x += Math.cos(knockAng) * (e.type === 'boss' ? 4 : 18);
  e.y += Math.sin(knockAng) * (e.type === 'boss' ? 4 : 18);
  sfx.hit();
  S.shake = Math.max(S.shake, 3);
  for (let i = 0; i < 8; i++) {
    particles.push({
      x: e.x, y: e.y,
      vx: (Math.random() - 0.5) * 6, vy: (Math.random() - 0.5) * 6 - 1,
      life: 20, maxLife: 20,
      color: burn ? '#ff8800' : '#aa2222', size: 3, glow: burn,
    });
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  enemies = enemies.filter((x) => x !== e);
  S.kills++;
  addBlood(e.x, e.y, e.r);
  const coinCount = e.type === 'boss' ? 25 : 1 + Math.floor(Math.random() * 2);
  for (let i = 0; i < coinCount; i++) {
    pickups.push({
      x: e.x + (Math.random() - 0.5) * 30, y: e.y + (Math.random() - 0.5) * 30,
      vy: -2 - Math.random() * 2, bob: Math.random() * 99,
    });
  }
  for (let i = 0; i < 16; i++) {
    particles.push({
      x: e.x, y: e.y,
      vx: (Math.random() - 0.5) * 8, vy: (Math.random() - 0.5) * 8,
      life: 30, maxLife: 30, color: e.color, size: 4,
    });
  }
  if (e.type === 'boss') {
    S.bossDefeated = true;
    S.shake = 14;
    floaters.push({ x: e.x, y: e.y, text: 'AUDIT CANCELLED', life: 90, color: '#ffd700' });
    toast('The Tax Collector dissolves into a pile of crumpled receipts. You owe nothing. Today.');
    setTimeout(() => startEnding(), 2600);
  } else if (Math.random() < 0.4) {
    toast(KILL_QUIPS[Math.floor(Math.random() * KILL_QUIPS.length)], 1800);
  }
  // wave cleared?
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
    floaters.push({ x: player.x, y: player.y - 30, text: 'QUEN ABSORBED IT', life: 40, color: '#ffd700' });
    sfx.quen();
    return;
  }
  player.hp -= dmg;
  player.hurtFlash = 50;
  S.shake = 8;
  sfx.hurt();
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
  enemies = enemies.filter(e => e.type === 'boss');  // mercy: trash mobs respect death
  if (S.bossPhase && enemies.length === 0) spawnBoss();
  else if (!S.bossPhase && enemies.length === 0) spawnWave(S.wave);
  toast('A passing herbalist revives you. She charges 5 coins and your dignity.');
  S.coins = Math.max(0, S.coins - 5);
  updateHud();
}

// ---------- update loop ----------
function updateCombat() {
  // movement
  player.moving = false;
  if (!player.dead) {
    let dx = 0, dy = 0;
    if (S.keys['w'] || S.keys['arrowup']) dy -= 1;
    if (S.keys['s'] || S.keys['arrowdown']) dy += 1;
    if (S.keys['a'] || S.keys['arrowleft']) dx -= 1;
    if (S.keys['d'] || S.keys['arrowright']) dx += 1;
    if (dx || dy) {
      player.moving = true;
      const m = Math.hypot(dx, dy);
      player.x += (dx / m) * player.speed;
      player.y += (dy / m) * player.speed;
      player.x = Math.max(20, Math.min(W - 20, player.x));
      player.y = Math.max(20, Math.min(H - 20, player.y));
    }
    if (S.keys[' '] || S.mouse.down) tryAttack();
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
      // zigzag gremlin
      const zig = Math.sin(e.wob * 2) * 1.4;
      e.x += (dx / d) * e.speed + (-dy / d) * zig;
      e.y += (dy / d) * e.speed + (dx / d) * zig;
    } else if (e.type === 'ghoul') {
      // lunges
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
        // throws a fan of tax forms
        for (let i = -2; i <= 2; i++) {
          const a = Math.atan2(dy, dx) + i * 0.22;
          projectiles.push({ x: e.x, y: e.y, vx: Math.cos(a) * 3.4, vy: Math.sin(a) * 3.4, life: 200, spin: 0 });
        }
        floaters.push({ x: e.x, y: e.y - 60, text: ['"FORM 1099-MONSTER!"', '"YOU OWE BACK-TAXES!"', '"ITEMIZE THIS!"', '"AUDIT BEAM!"'][Math.floor(Math.random() * 4)], life: 60, color: '#ccccff' });
      }
    } else {
      e.x += (dx / d) * e.speed;
      e.y += (dy / d) * e.speed;
    }

    // touch damage
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
      floaters.push({ x: player.x, y: player.y - 30, text: 'PAPERWORK DAMAGE', life: 40, color: '#ccccff' });
    }
  }
  projectiles = projectiles.filter((p) => p.life > 0);

  // pickups
  for (const c of pickups) {
    c.vy += 0.15; c.y += c.vy;
    if (c.vy > 0 && c.y > 0) c.vy = 0;
    c.bob += 0.15;
    const d = Math.hypot(c.x - player.x, c.y - player.y);
    if (d < 60) { c.x += (player.x - c.x) * 0.2; c.y += (player.y - c.y) * 0.2; }
    if (d < 22) { c.dead = true; S.coins++; sfx.coin(); updateHud(); }
  }
  pickups = pickups.filter((c) => !c.dead);

  if (roach) { roach.life--; if (roach.life <= 0) roach = null; }
}

function updateParticles() {
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.06; p.life--; }
  particles = particles.filter((p) => p.life > 0);
  for (const f of floaters) { f.y -= 0.7; f.life--; }
  floaters = floaters.filter((f) => f.life > 0);
  if (S.bannerTimer > 0) S.bannerTimer--;
  if (S.shake > 0) S.shake *= 0.88;
}

/* ============================================================
   RENDERING — the part that makes the swamp look expensive
   ============================================================ */

function makeGlow(r, g, b, size) {
  const c = document.createElement('canvas');
  c.width = c.height = size;
  const x = c.getContext('2d');
  const gr = x.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gr.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  gr.addColorStop(0.35, `rgba(${r},${g},${b},0.32)`);
  gr.addColorStop(1, `rgba(${r},${g},${b},0)`);
  x.fillStyle = gr;
  x.fillRect(0, 0, size, size);
  return c;
}
const fireflyGlow = makeGlow(185, 235, 110, 36);
const warmGlow = makeGlow(255, 195, 110, 256);
const coinGlow = makeGlow(255, 210, 90, 28);
const fireGlow = makeGlow(255, 140, 40, 48);

const fogTex = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  for (let i = 0; i < 7; i++) {
    const px = 60 + Math.random() * 136, py = 60 + Math.random() * 136, pr = 50 + Math.random() * 70;
    const gr = x.createRadialGradient(px, py, 0, px, py, pr);
    gr.addColorStop(0, 'rgba(190,205,180,0.16)');
    gr.addColorStop(1, 'rgba(190,205,180,0)');
    x.fillStyle = gr;
    x.fillRect(0, 0, 256, 256);
  }
  return c;
})();
const fogBanks = Array.from({ length: 4 }, (_, i) => ({
  x: Math.random() * W, y: Math.random() * H,
  sp: 0.12 + Math.random() * 0.18, scale: 2.2 + Math.random() * 1.6, phase: i * 1.7,
}));

const fireflies = Array.from({ length: 14 }, () => ({
  x: Math.random() * W, y: Math.random() * H,
  a: Math.random() * 7, phase: Math.random() * 7,
}));

// persistent gore & scorch marks live here, like memories
const decals = document.createElement('canvas');
decals.width = W; decals.height = H;
function addBlood(x, y, r) {
  const d = decals.getContext('2d');
  for (let i = 0; i < 7; i++) {
    d.fillStyle = `rgba(${70 + Math.random() * 40 | 0},10,12,${0.18 + Math.random() * 0.22})`;
    d.beginPath();
    d.ellipse(
      x + (Math.random() - 0.5) * r * 2.4, y + (Math.random() - 0.5) * r * 2.4,
      2 + Math.random() * r * 0.5, 1.5 + Math.random() * r * 0.35,
      Math.random() * 3, 0, 7);
    d.fill();
  }
}
function addScorch(x, y) {
  const d = decals.getContext('2d');
  for (let i = 0; i < 5; i++) {
    d.fillStyle = `rgba(16,11,7,${0.12 + Math.random() * 0.14})`;
    d.beginPath();
    d.ellipse(x + (Math.random() - 0.5) * 60, y + (Math.random() - 0.5) * 36, 14 + Math.random() * 22, 8 + Math.random() * 12, Math.random() * 3, 0, 7);
    d.fill();
  }
}

// pre-render the swamp so it doesn't shimmer
const floor = document.createElement('canvas');
floor.width = W; floor.height = H;
(function paintFloor() {
  const f = floor.getContext('2d');
  // base ground with cold moonlit center
  let g = f.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#1d2418');
  g.addColorStop(0.55, '#242e1d');
  g.addColorStop(1, '#151b10');
  f.fillStyle = g;
  f.fillRect(0, 0, W, H);
  g = f.createRadialGradient(W / 2, H / 2 - 30, 60, W / 2, H / 2, 620);
  g.addColorStop(0, 'rgba(150,170,120,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  f.fillStyle = g;
  f.fillRect(0, 0, W, H);

  // mud patches
  for (let i = 0; i < 50; i++) {
    f.fillStyle = `rgba(${28 + Math.random() * 26 | 0},${34 + Math.random() * 18 | 0},${20 + Math.random() * 12 | 0},.55)`;
    f.beginPath();
    f.ellipse(Math.random() * W, Math.random() * H, 24 + Math.random() * 60, 12 + Math.random() * 28, Math.random() * 3, 0, 7);
    f.fill();
  }

  // water pools with rim light and reflections
  const pools = [[150, 430, 110, 38], [820, 120, 95, 32], [690, 460, 130, 42], [110, 90, 80, 26]];
  for (const [px, py, prx, pry] of pools) {
    const pg = f.createRadialGradient(px, py, 4, px, py, prx);
    pg.addColorStop(0, '#22343a');
    pg.addColorStop(0.8, '#18262b');
    pg.addColorStop(1, '#131e1f');
    f.fillStyle = pg;
    f.beginPath(); f.ellipse(px, py, prx, pry, 0, 0, 7); f.fill();
    f.strokeStyle = 'rgba(140,170,150,.18)';
    f.lineWidth = 1.5;
    f.beginPath(); f.ellipse(px, py, prx, pry, 0, 0, 7); f.stroke();
    f.strokeStyle = 'rgba(170,200,190,.13)';
    f.lineWidth = 1;
    for (let i = 0; i < 5; i++) {
      const ry = py - pry * 0.5 + Math.random() * pry;
      const rl = 10 + Math.random() * prx * 0.7;
      f.beginPath();
      f.moveTo(px - rl / 2 + (Math.random() - 0.5) * 20, ry);
      f.lineTo(px + rl / 2 + (Math.random() - 0.5) * 20, ry);
      f.stroke();
    }
    // lily pads
    for (let i = 0; i < 3; i++) {
      f.fillStyle = 'rgba(60,90,50,.7)';
      f.beginPath();
      f.ellipse(px + (Math.random() - 0.5) * prx, py + (Math.random() - 0.5) * pry, 4 + Math.random() * 4, 2.5 + Math.random() * 2.5, Math.random(), 0, 7);
      f.fill();
    }
  }

  // gnarled roots
  f.strokeStyle = 'rgba(40,30,18,.6)';
  f.lineWidth = 3;
  for (let i = 0; i < 14; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    f.beginPath();
    f.moveTo(x, y);
    f.bezierCurveTo(x + 20 - Math.random() * 40, y + 10, x + 40 - Math.random() * 80, y - 8, x + 60 - Math.random() * 120, y + 14 - Math.random() * 28);
    f.stroke();
  }
  f.lineWidth = 1;

  // stones with light and shade
  for (let i = 0; i < 34; i++) {
    const x = Math.random() * W, y = Math.random() * H, r = 2.5 + Math.random() * 5;
    f.fillStyle = 'rgba(20,18,14,.5)';
    f.beginPath(); f.ellipse(x + 1.5, y + 1.8, r, r * 0.7, 0, 0, 7); f.fill();
    const sg = f.createRadialGradient(x - r * 0.35, y - r * 0.4, 0.5, x, y, r);
    sg.addColorStop(0, '#8d8d80');
    sg.addColorStop(1, '#4c4c44');
    f.fillStyle = sg;
    f.beginPath(); f.ellipse(x, y, r, r * 0.75, 0, 0, 7); f.fill();
  }

  // grass tufts (fanned blades, two greens)
  for (let i = 0; i < 130; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    for (let b = 0; b < 3; b++) {
      f.strokeStyle = b ? 'rgba(86,120,58,.55)' : 'rgba(60,92,42,.6)';
      f.beginPath();
      f.moveTo(x, y);
      f.quadraticCurveTo(x + (b - 1) * 3, y - 5, x + (b - 1) * 5 + (Math.random() - 0.5) * 3, y - 8 - Math.random() * 6);
      f.stroke();
    }
  }

  // the occasional bone, because swamp
  f.strokeStyle = 'rgba(200,195,175,.35)';
  f.lineWidth = 2;
  for (let i = 0; i < 6; i++) {
    const x = Math.random() * W, y = Math.random() * H, a = Math.random() * 3;
    f.beginPath();
    f.moveTo(x, y);
    f.lineTo(x + Math.cos(a) * 11, y + Math.sin(a) * 11);
    f.stroke();
  }
  f.lineWidth = 1;

  // glowing mushrooms
  for (let i = 0; i < 9; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const mg = f.createRadialGradient(x, y, 0, x, y, 9);
    mg.addColorStop(0, 'rgba(140,220,170,.25)');
    mg.addColorStop(1, 'rgba(140,220,170,0)');
    f.fillStyle = mg;
    f.beginPath(); f.arc(x, y, 9, 0, 7); f.fill();
    f.fillStyle = '#7ec898';
    f.beginPath(); f.ellipse(x, y, 2.4, 1.7, 0, 0, 7); f.fill();
  }

  // looming tree silhouettes framing the arena
  f.fillStyle = 'rgba(9,11,7,.88)';
  const trees = [[40, 30], [930, 60], [890, 510], [60, 500], [480, 18], [500, 528]];
  for (const [tx, ty] of trees) {
    f.beginPath();
    f.ellipse(tx, ty, 46 + Math.random() * 26, 36 + Math.random() * 18, Math.random(), 0, 7);
    f.fill();
    f.fillRect(tx - 5, ty, 10, 36);
    for (let b = 0; b < 3; b++) {
      f.save();
      f.translate(tx, ty + 8);
      f.rotate((Math.random() - 0.5) * 2.4);
      f.fillRect(0, -2, 30 + Math.random() * 22, 4);
      f.restore();
    }
  }

  // darken the edges
  g = f.createRadialGradient(W / 2, H / 2, 220, W / 2, H / 2, 640);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,.62)');
  f.fillStyle = g;
  f.fillRect(0, 0, W, H);
})();

function draw() {
  ctx.save();
  if (S.shake > 0.5) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  ctx.drawImage(floor, 0, 0);
  ctx.drawImage(decals, 0, 0);

  if (S.scene === 'combat' || S.scene === 'dialogue' || S.scene === 'ending') {
    // pickups
    for (const c of pickups) {
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(c.bob) * 3);
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.5;
      ctx.drawImage(coinGlow, -14, -14);
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      const cg = ctx.createRadialGradient(-2, -2, 0.5, 0, 0, 6);
      cg.addColorStop(0, '#ffe9a8');
      cg.addColorStop(1, '#b8902e');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 6 * Math.abs(Math.sin(c.bob * 0.7)) + 1.5, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#6e561c';
      ctx.stroke();
      ctx.restore();
    }

    drawRoach();
    for (const e of enemies) drawEnemy(e);
    drawProjectiles();
    if (!player.dead || player.hurtFlash % 8 < 4) drawPlayer();
    drawParticles();

    // warm pool of light around the witcher
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.16;
    ctx.drawImage(warmGlow, player.x - 128, player.y - 128);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';

    drawFog();
    drawFireflies();

    // cold swamp grade
    ctx.fillStyle = 'rgba(26,52,40,.09)';
    ctx.fillRect(0, 0, W, H);

    drawFloaters();
    drawBanner();
    drawBossBar();
  } else {
    drawFog();
    drawFireflies();
  }
  ctx.restore();
}

function drawFog() {
  for (const fb of fogBanks) {
    fb.x += fb.sp;
    if (fb.x - 128 * fb.scale > W) fb.x = -128 * fb.scale;
    const wob = Math.sin(S.time * 0.004 + fb.phase) * 14;
    ctx.globalAlpha = 0.30 + Math.sin(S.time * 0.006 + fb.phase) * 0.10;
    ctx.drawImage(fogTex, fb.x - 128 * fb.scale, fb.y + wob - 128 * fb.scale, 256 * fb.scale, 256 * fb.scale);
  }
  ctx.globalAlpha = 1;
}

function drawFireflies() {
  ctx.globalCompositeOperation = 'lighter';
  for (const ff of fireflies) {
    ff.a += (Math.random() - 0.5) * 0.3;
    ff.x += Math.cos(ff.a) * 0.4;
    ff.y += Math.sin(ff.a) * 0.4;
    if (ff.x < 0) ff.x = W; if (ff.x > W) ff.x = 0;
    if (ff.y < 0) ff.y = H; if (ff.y > H) ff.y = 0;
    const pulse = 0.35 + Math.sin(S.time * 0.08 + ff.phase) * 0.3;
    ctx.globalAlpha = Math.max(0.05, pulse);
    ctx.drawImage(fireflyGlow, ff.x - 18, ff.y - 18);
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
}

function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.hurtFlash > 0 && p.hurtFlash % 8 < 4) ctx.globalAlpha = 0.4;

  // quen shield — golden ward with rotating sigil arcs
  if (p.quen > 0) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const qa = 0.35 + Math.sin(S.time * 0.2) * 0.15;
    ctx.strokeStyle = `rgba(255,212,90,${qa})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(0, 0, 27, 0, 7); ctx.stroke();
    ctx.rotate(S.time * 0.03);
    ctx.strokeStyle = `rgba(255,232,150,${qa + 0.18})`;
    ctx.lineWidth = 3.5;
    for (let i = 0; i < 3; i++) {
      ctx.beginPath();
      ctx.arc(0, 0, 27, i * 2.1, i * 2.1 + 0.9);
      ctx.stroke();
    }
    ctx.restore();
  }

  const bob = p.moving ? Math.sin(S.time * 0.25) * 1.5 : Math.sin(S.time * 0.07) * 0.6;

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(0, 15, 13, 5, 0, 0, 7); ctx.fill();

  ctx.translate(0, bob);

  // two swords on the back — silver for monsters, steel for ex-lovers
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#6c6c78';
  ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-14, -23); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(14, -23); ctx.stroke();
  ctx.lineWidth = 1.2;
  ctx.strokeStyle = '#c9cdd8';
  ctx.beginPath(); ctx.moveTo(-7, -8); ctx.lineTo(-13.5, -22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(7, -8); ctx.lineTo(13.5, -22); ctx.stroke();
  ctx.fillStyle = '#8d6b2c';
  ctx.beginPath(); ctx.arc(-14, -23, 1.8, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(14, -23, 1.8, 0, 7); ctx.fill();

  // armored body
  let bg = ctx.createLinearGradient(0, -12, 0, 16);
  bg.addColorStop(0, '#4a4138');
  bg.addColorStop(0.6, '#2c2620');
  bg.addColorStop(1, '#191512');
  ctx.fillStyle = bg;
  ctx.beginPath(); ctx.ellipse(0, 2, 11, 14, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#0d0b09';
  ctx.stroke();
  // chest strap
  ctx.strokeStyle = '#1a140d';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(-8, -7); ctx.lineTo(9, 5); ctx.stroke();
  ctx.lineWidth = 1;
  // shoulder plates with studs
  for (const sx of [-9, 9]) {
    ctx.fillStyle = '#33291d';
    ctx.beginPath(); ctx.ellipse(sx, -5, 5, 4, sx > 0 ? 0.5 : -0.5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#0d0b09'; ctx.stroke();
    ctx.fillStyle = '#a8893f';
    ctx.beginPath(); ctx.arc(sx, -5.5, 1.1, 0, 7); ctx.fill();
  }
  // belt + buckle (very important to the lore)
  ctx.fillStyle = '#4a3318';
  ctx.fillRect(-10, 5, 20, 4);
  ctx.fillStyle = '#b89545';
  ctx.fillRect(-2, 5, 4, 4);

  // wolf medallion
  ctx.fillStyle = '#caa64a';
  ctx.beginPath(); ctx.arc(0, -4, 1.6, 0, 7); ctx.fill();

  // head
  let hg = ctx.createRadialGradient(-2, -14, 1, 0, -12, 8);
  hg.addColorStop(0, '#dbb491');
  hg.addColorStop(1, '#a8825f');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(0, -12, 7, 0, 7); ctx.fill();

  // the iconic white hair (the real protagonist)
  let wg = ctx.createLinearGradient(0, -21, 0, -2);
  wg.addColorStop(0, '#f4f2ea');
  wg.addColorStop(1, '#b6b1a2');
  ctx.fillStyle = wg;
  ctx.beginPath();
  ctx.arc(0, -14, 7, Math.PI, 2 * Math.PI);
  ctx.quadraticCurveTo(9, -6, 7, 0);
  ctx.lineTo(5, -8); ctx.lineTo(-5, -8); ctx.lineTo(-7, 0);
  ctx.quadraticCurveTo(-9, -6, -7, -14);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,255,255,.5)';
  ctx.beginPath(); ctx.arc(0, -14, 6, Math.PI * 1.15, Math.PI * 1.6); ctx.stroke();
  // ponytail
  ctx.strokeStyle = '#ddd8cb';
  ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(-3, 0, -2, 9); ctx.stroke();
  ctx.lineWidth = 1;
  // scar over the eye, for gravitas
  ctx.strokeStyle = 'rgba(140,60,50,.8)';
  ctx.beginPath(); ctx.moveTo(2, -16); ctx.lineTo(4, -10); ctx.stroke();

  // sword swing — glowing arc + blade
  if (p.swing > 0) {
    const prog = 1 - p.swing / 12;
    const a = p.facing - 0.9 + prog * 1.8;
    ctx.save();
    ctx.translate(0, -bob);
    ctx.globalCompositeOperation = 'lighter';
    ctx.strokeStyle = `rgba(190,210,255,${(1 - prog) * 0.9})`;
    ctx.lineWidth = 5;
    ctx.beginPath(); ctx.arc(0, 0, 44, p.facing - 0.9, a); ctx.stroke();
    ctx.strokeStyle = `rgba(255,255,255,${(1 - prog) * 0.5})`;
    ctx.lineWidth = 9;
    ctx.beginPath(); ctx.arc(0, 0, 44, Math.max(p.facing - 0.9, a - 0.45), a); ctx.stroke();
    ctx.globalCompositeOperation = 'source-over';
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#e8ecf8';
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
    ctx.lineTo(Math.cos(a) * 56, Math.sin(a) * 56);
    ctx.stroke();
    ctx.lineWidth = 1;
    ctx.restore();
  }
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y + Math.sin(e.wob) * 2);

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.beginPath(); ctx.ellipse(0, e.r * 0.85, e.r * 0.85, e.r * 0.3, 0, 0, 7); ctx.fill();

  if (e.type === 'boss') drawBoss(e);
  else if (e.type === 'drowner') drawDrowner(e);
  else if (e.type === 'nekker') drawNekker(e);
  else drawGhoul(e);

  // hit flash
  if (e.hitFlash > 0) {
    ctx.fillStyle = `rgba(255,255,255,${e.hitFlash / 12})`;
    ctx.beginPath(); ctx.ellipse(0, 0, e.r + 2, e.r * 1.12 + 2, 0, 0, 7); ctx.fill();
  }

  // hp pips for tougher trash
  if (e.maxHp > 1 && e.hp < e.maxHp && e.type !== 'boss') {
    ctx.fillStyle = 'rgba(0,0,0,.7)';
    ctx.fillRect(-e.r, -e.r - 9, e.r * 2, 4);
    ctx.fillStyle = '#a4232d';
    ctx.fillRect(-e.r, -e.r - 9, e.r * 2 * (e.hp / e.maxHp), 4);
    ctx.strokeStyle = 'rgba(200,163,90,.5)';
    ctx.strokeRect(-e.r - 0.5, -e.r - 9.5, e.r * 2 + 1, 5);
  }
  ctx.restore();
}

function drawDrowner(e) {
  const r = e.r;
  // slick amphibian body
  let g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r * 1.2);
  g.addColorStop(0, '#79a86c');
  g.addColorStop(0.6, '#4c7a44');
  g.addColorStop(1, '#2e4d2a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.1, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#1c2e18'; ctx.stroke();
  // pale belly
  ctx.fillStyle = 'rgba(190,210,160,.30)';
  ctx.beginPath(); ctx.ellipse(0, r * 0.35, r * 0.55, r * 0.45, 0, 0, 7); ctx.fill();
  // back fin spikes
  ctx.fillStyle = '#27411f';
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(i * 6 - 3, -r * 0.7);
    ctx.lineTo(i * 6, -r * 1.25 - (i === 0 ? 3 : 0));
    ctx.lineTo(i * 6 + 3, -r * 0.7);
    ctx.fill();
  }
  // webbed claws
  ctx.strokeStyle = '#3a5c33';
  ctx.lineWidth = 3;
  const wave = Math.sin(e.wob * 2) * 4;
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r - 8, wave); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(r + 8, -wave); ctx.stroke();
  ctx.lineWidth = 1;
  // glowing eyes
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.7;
  ctx.drawImage(fireflyGlow, -r * 0.35 - 9, -r * 0.35 - 9, 18, 18);
  ctx.drawImage(fireflyGlow, r * 0.35 - 9, -r * 0.35 - 9, 18, 18);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#f4ff7a';
  ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.35, 2.2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.35, 2.2, 0, 7); ctx.fill();
  // needle teeth
  ctx.strokeStyle = '#0e1a0c';
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, r * 0.18);
  for (let i = 0; i <= 4; i++) ctx.lineTo(-r * 0.4 + (r * 0.8 / 4) * i, r * 0.18 + (i % 2 ? 4.5 : 0));
  ctx.stroke();
}

function drawNekker(e) {
  const r = e.r;
  let g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r * 1.2);
  g.addColorStop(0, '#c3a06a');
  g.addColorStop(0.6, '#94744a');
  g.addColorStop(1, '#5c4628');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.1, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#33250f'; ctx.stroke();
  // big rude ears
  ctx.fillStyle = '#7a5c34';
  ctx.beginPath(); ctx.moveTo(-r * 0.6, -r * 0.6); ctx.lineTo(-r * 1.3, -r * 1.5); ctx.lineTo(-r * 0.1, -r * 0.95); ctx.fill();
  ctx.beginPath(); ctx.moveTo(r * 0.6, -r * 0.6); ctx.lineTo(r * 1.3, -r * 1.5); ctx.lineTo(r * 0.1, -r * 0.95); ctx.fill();
  // beady orange eyes
  ctx.fillStyle = '#ffb347';
  ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.3, 2, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.3, 2, 0, 7); ctx.fill();
  // snaggle grin
  ctx.strokeStyle = '#1c1206';
  ctx.beginPath();
  ctx.moveTo(-r * 0.45, r * 0.25);
  for (let i = 0; i <= 3; i++) ctx.lineTo(-r * 0.45 + (r * 0.9 / 3) * i, r * 0.25 + (i % 2 ? 3.5 : 0));
  ctx.stroke();
  // scrabbly claws
  ctx.strokeStyle = '#5c4628';
  ctx.lineWidth = 2.5;
  const wave = Math.sin(e.wob * 3) * 4;
  ctx.beginPath(); ctx.moveTo(-r, 2); ctx.lineTo(-r - 6, 2 + wave); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r, 2); ctx.lineTo(r + 6, 2 - wave); ctx.stroke();
  ctx.lineWidth = 1;
}

function drawGhoul(e) {
  const r = e.r;
  const lunging = Math.hypot(e.vx, e.vy) > 1.5;
  ctx.save();
  if (lunging) ctx.scale(1.15, 0.92);
  let g = ctx.createRadialGradient(-r * 0.3, -r * 0.4, 1, 0, 0, r * 1.2);
  g.addColorStop(0, '#a98599');
  g.addColorStop(0.6, '#735266');
  g.addColorStop(1, '#43283a');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.1, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#241221'; ctx.stroke();
  // exposed ribs, because it's going through something
  ctx.strokeStyle = 'rgba(220,205,190,.5)';
  ctx.lineWidth = 1.5;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.arc(0, r * 0.1 + i * 4, r * 0.55, 0.3, Math.PI - 0.3);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // burning red eyes
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = 0.8;
  ctx.drawImage(fireGlow, -r * 0.35 - 9, -r * 0.4 - 9, 18, 18);
  ctx.drawImage(fireGlow, r * 0.35 - 9, -r * 0.4 - 9, 18, 18);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.fillStyle = '#ff5040';
  ctx.beginPath(); ctx.arc(-r * 0.35, -r * 0.4, 2.4, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(r * 0.35, -r * 0.4, 2.4, 0, 7); ctx.fill();
  // wide jagged maw
  ctx.strokeStyle = '#160a14';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(-r * 0.55, r * 0.3);
  for (let i = 0; i <= 5; i++) ctx.lineTo(-r * 0.55 + (r * 1.1 / 5) * i, r * 0.3 + (i % 2 ? 5 : 0));
  ctx.stroke();
  ctx.lineWidth = 1;
  // long raking claws
  ctx.strokeStyle = '#43283a';
  ctx.lineWidth = 3;
  const wave = Math.sin(e.wob * 2) * 5;
  ctx.beginPath(); ctx.moveTo(-r, 0); ctx.lineTo(-r - 10, wave); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(r, 0); ctx.lineTo(r + 10, -wave); ctx.stroke();
  ctx.lineWidth = 1;
  ctx.restore();
}

function drawBoss(e) {
  const r = e.r;
  // orbiting paperwork of doom
  for (let i = 0; i < 3; i++) {
    const oa = S.time * 0.04 + i * 2.1;
    ctx.save();
    ctx.translate(Math.cos(oa) * (r + 22), Math.sin(oa) * (r + 22) * 0.5 - 10);
    ctx.rotate(oa);
    ctx.fillStyle = 'rgba(232,228,212,.85)';
    ctx.fillRect(-5, -7, 10, 14);
    ctx.strokeStyle = 'rgba(120,120,120,.7)';
    ctx.beginPath(); ctx.moveTo(-3, -3); ctx.lineTo(3, -3); ctx.moveTo(-3, 1); ctx.lineTo(3, 1); ctx.stroke();
    ctx.restore();
  }
  // robed bulk
  let g = ctx.createLinearGradient(0, -r, 0, r * 1.15);
  g.addColorStop(0, '#565672');
  g.addColorStop(0.55, '#3a3a50');
  g.addColorStop(1, '#23232f');
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.ellipse(0, 0, r, r * 1.15, 0, 0, 7); ctx.fill();
  ctx.strokeStyle = '#121218'; ctx.stroke();
  // robe folds
  ctx.strokeStyle = 'rgba(10,10,16,.55)';
  ctx.lineWidth = 2;
  for (const fx of [-r * 0.45, 0, r * 0.45]) {
    ctx.beginPath();
    ctx.moveTo(fx, -r * 0.1);
    ctx.quadraticCurveTo(fx * 1.15, r * 0.5, fx * 1.05, r * 1.05);
    ctx.stroke();
  }
  ctx.lineWidth = 1;
  // starched collar
  ctx.fillStyle = '#d8d2c2';
  ctx.beginPath();
  ctx.moveTo(-r * 0.4, -r * 0.32);
  ctx.lineTo(0, -r * 0.14);
  ctx.lineTo(r * 0.4, -r * 0.32);
  ctx.lineTo(0, -r * 0.42);
  ctx.fill();
  // pallid bureaucratic face
  let fg = ctx.createRadialGradient(-4, -r * 0.62, 2, 0, -r * 0.55, r * 0.45);
  fg.addColorStop(0, '#ddd6c4');
  fg.addColorStop(1, '#a89f8a');
  ctx.fillStyle = fg;
  ctx.beginPath(); ctx.arc(0, -r * 0.55, r * 0.42, 0, 7); ctx.fill();
  // pince-nez of doom, with glint
  ctx.strokeStyle = '#15151a';
  ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.arc(-7, -r * 0.58, 6, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.arc(7, -r * 0.58, 6, 0, 7); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(-1, -r * 0.58); ctx.lineTo(1, -r * 0.58); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,.85)';
  ctx.beginPath(); ctx.arc(-7, -r * 0.58, 4.2, Math.PI * 1.1, Math.PI * 1.5); ctx.stroke();
  ctx.lineWidth = 1;
  // the eternal disapproval
  ctx.strokeStyle = '#26262e';
  ctx.lineWidth = 1.6;
  ctx.beginPath(); ctx.moveTo(-8, -r * 0.38); ctx.lineTo(8, -r * 0.40); ctx.stroke();
  ctx.lineWidth = 1;
  // the ledger
  ctx.save();
  ctx.translate(r * 0.55, 2);
  ctx.rotate(0.08);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.fillRect(2, 3, 24, 30);
  let lg = ctx.createLinearGradient(0, -12, 0, 18);
  lg.addColorStop(0, '#efe3c2');
  lg.addColorStop(1, '#cdb88a');
  ctx.fillStyle = lg;
  ctx.fillRect(0, -12, 24, 30);
  ctx.strokeStyle = '#6e5424';
  ctx.strokeRect(0, -12, 24, 30);
  ctx.strokeStyle = '#9a8a70';
  for (let i = 0; i < 4; i++) {
    ctx.beginPath();
    ctx.moveTo(3, -7 + i * 6); ctx.lineTo(21, -7 + i * 6);
    ctx.stroke();
  }
  ctx.fillStyle = '#a4232d';
  ctx.font = '700 7px Cinzel, Georgia';
  ctx.textAlign = 'center';
  ctx.fillText('DEBT', 12, 16);
  ctx.restore();
}

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(-6, -8, 14, 18);
    ctx.fillStyle = '#ece8d8';
    ctx.fillRect(-7, -9, 14, 18);
    ctx.strokeStyle = '#9a9688';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-5, -5 + i * 5); ctx.lineTo(5, -5 + i * 5); ctx.stroke();
    }
    ctx.strokeStyle = '#a4232d';
    ctx.lineWidth = 1.4;
    ctx.beginPath(); ctx.arc(0, 4, 4.5, 0, 7); ctx.stroke();
    ctx.lineWidth = 1;
    ctx.fillStyle = '#a4232d';
    ctx.font = 'bold 6.5px Cinzel, Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('TAX', 0, 6.5);
    ctx.restore();
  }
}

function drawRoach() {
  if (!roach) return;
  ctx.save();
  ctx.translate(roach.x, roach.y);
  ctx.rotate(roach.tilt);
  ctx.globalAlpha = Math.min(1, roach.life / 40);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(0, 8, 26, 7, 0, 0, 7); ctx.fill();
  ctx.font = '54px serif';
  ctx.textAlign = 'center';
  ctx.fillText('🐴', 0, 0);
  ctx.font = 'italic 12px "EB Garamond", Georgia';
  ctx.fillStyle = '#d9cbab';
  ctx.fillText('*judging you*', 0, 20);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    if (p.glow) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(fireGlow, p.x - p.size * 1.6, p.y - p.size * 1.6, p.size * 3.2, p.size * 3.2);
      ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life / 20);
    ctx.font = '700 14px Cinzel, Georgia';
    ctx.fillStyle = '#000';
    ctx.fillText(f.text, f.x + 1, f.y + 1);
    ctx.fillStyle = f.color;
    ctx.fillText(f.text, f.x, f.y);
  }
  ctx.globalAlpha = 1;
}

function drawBanner() {
  if (S.bannerTimer <= 0 || !S.waveBanner) return;
  ctx.globalAlpha = Math.min(1, S.bannerTimer / 40);
  ctx.textAlign = 'center';
  ctx.font = '700 19px Cinzel, Georgia';
  const tw = ctx.measureText(S.waveBanner).width;
  // flanking rules + diamonds, like a quest title
  ctx.strokeStyle = 'rgba(200,163,90,.55)';
  ctx.beginPath();
  ctx.moveTo(W / 2 - tw / 2 - 70, 76); ctx.lineTo(W / 2 - tw / 2 - 18, 76);
  ctx.moveTo(W / 2 + tw / 2 + 18, 76); ctx.lineTo(W / 2 + tw / 2 + 70, 76);
  ctx.stroke();
  ctx.fillStyle = '#a4232d';
  ctx.font = '10px Georgia';
  ctx.fillText('◆', W / 2 - tw / 2 - 12, 79);
  ctx.fillText('◆', W / 2 + tw / 2 + 12, 79);
  ctx.font = '700 19px Cinzel, Georgia';
  ctx.fillStyle = '#000';
  ctx.fillText(S.waveBanner, W / 2 + 2, 82 + 2);
  ctx.fillStyle = '#d8b964';
  ctx.fillText(S.waveBanner, W / 2, 82);
  ctx.globalAlpha = 1;
}

function drawBossBar() {
  const boss = enemies.find((e) => e.type === 'boss');
  if (!boss) return;
  const bw = 480, bx = W / 2 - bw / 2, by = H - 42;
  ctx.font = '700 13px Cinzel, Georgia';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText('THE TAX COLLECTOR', W / 2 + 1, by - 8 + 1);
  ctx.fillStyle = '#d8b964';
  ctx.fillText('THE TAX COLLECTOR', W / 2, by - 8);
  ctx.font = 'italic 11px "EB Garamond", Georgia';
  ctx.fillStyle = '#b3a17c';
  ctx.fillText('"Everything is deductible. Especially your health."', W / 2, by + 32);
  // frame
  ctx.fillStyle = 'rgba(5,4,3,.85)';
  ctx.fillRect(bx - 4, by, bw + 8, 16);
  // fill
  const fillW = bw * (boss.hp / boss.maxHp);
  const fg = ctx.createLinearGradient(0, by, 0, by + 16);
  fg.addColorStop(0, '#c8454a');
  fg.addColorStop(0.5, '#8e1c20');
  fg.addColorStop(1, '#5e1013');
  ctx.fillStyle = fg;
  ctx.fillRect(bx, by + 2, fillW, 12);
  // segment ticks
  ctx.fillStyle = 'rgba(0,0,0,.5)';
  for (let i = 1; i < 10; i++) ctx.fillRect(bx + (bw / 10) * i, by + 2, 1, 12);
  // gold trim + diamond finials
  ctx.strokeStyle = '#7a6334';
  ctx.strokeRect(bx - 4.5, by - 0.5, bw + 9, 17);
  ctx.strokeStyle = 'rgba(200,163,90,.45)';
  ctx.strokeRect(bx - 2.5, by + 1.5, bw + 5, 13);
  ctx.fillStyle = '#c8a35a';
  ctx.font = '12px Georgia';
  ctx.fillText('◆', bx - 12, by + 12);
  ctx.fillText('◆', bx + bw + 12, by + 12);
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
    { speaker: 'Narrator', portrait: '📜', text: 'And so the Watcher walks the Path. The Path is muddy and full of things that want to chew on him. ▸ WASD to move, CLICK or SPACE to swing, Q for Igni, E for Quen. Good luck. Try not to die before the sexy part.' },
  ], () => startCombat());
}

function startCombat() {
  S.scene = 'combat';
  S.bossPhase = false;
  $('hud').classList.add('visible');
  player.x = W / 2; player.y = H / 2;
  player.hp = player.maxHp;
  enemies = []; projectiles = []; pickups = [];
  spawnWave(0);
  updateHud();
}

function startTavern() {
  S.scene = 'dialogue';
  $('hud').classList.remove('visible');
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
  $('hud').classList.add('visible');
  player.x = W / 2; player.y = H - 80;
  player.hp = player.maxHp;
  enemies = []; projectiles = []; pickups = [];
  spawnBoss();
  updateHud();
}

function startEnding() {
  S.scene = 'dialogue';
  $('hud').classList.remove('visible');
  const romanceLine = {
    yenn: 'Yenncifer portals in, hands you a towel, and says "Don\'t read into this" in a way that means you should absolutely read into this. 💜',
    trish: 'Trish toasts you from the bar: "To Gerald — flammable, taxable, and surprisingly lovable!" 🧡',
    bartender: 'The bartender slides you one more free ale and a napkin with… a drawing of a sword on it? It\'s the thought that counts. 🍺',
    bath: 'The bathtub awaits your return. It has missed you. You have missed it. This is the purest romance in the entire saga. 🛁',
  }[S.romanced] || 'You romanced no one, which honestly is the most realistic witcher experience available.';
  showDialogue([
    { speaker: 'Narrator', portrait: '🏆', text: 'The Tax Collector is vanquished, his ledger scattered to the winds. The village cheers. The bard immediately begins composing "The Ballad of the Deductible Witcher."' },
    { speaker: 'Narrator', portrait: '💘', text: romanceLine },
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
  enemies = []; particles = []; floaters = []; projectiles = []; pickups = [];
  decals.getContext('2d').clearRect(0, 0, W, H);
  startIntro();
};

// responsive scale
function fitStage() {
  const stage = document.getElementById('stage');
  const scale = Math.min(window.innerWidth / W, window.innerHeight / H, 1.4);
  stage.style.transform = 'translateY(-50%) scale(' + scale + ')';
}
window.addEventListener('resize', fitStage);
fitStage();

// ---------- main loop ----------
function loop() {
  S.time++;
  if (S.scene === 'combat') updateCombat();
  updateParticles();
  draw();
  requestAnimationFrame(loop);
}
loop();
