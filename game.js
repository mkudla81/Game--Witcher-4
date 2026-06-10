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
  roachCd: 0,
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
  $('hearts').textContent = '❤️'.repeat(Math.max(0, player.hp)) + '🖤'.repeat(player.maxHp - Math.max(0, player.hp));
  $('coins').textContent = '🪙 ' + S.coins;
  $('wave-label').textContent = S.scene === 'combat'
    ? (S.bossPhase ? 'BOSS FIGHT' : 'WAVE ' + (S.wave + 1) + ' / ' + WAVES.length) : '';
  $('cd-igni').className = 'sign-cd' + (player.igniCd <= 0 ? ' ready' : '');
  $('cd-quen').className = 'sign-cd' + (player.quenCd <= 0 ? ' ready' : '');
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
  for (let i = 0; i < 40; i++) {
    const a = player.facing + (Math.random() - 0.5) * 0.9;
    const sp = 3 + Math.random() * 5;
    particles.push({
      x: player.x + Math.cos(player.facing) * 20,
      y: player.y + Math.sin(player.facing) * 20,
      vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 30 + Math.random() * 20, maxLife: 50,
      color: ['#ff6a00', '#ffaa00', '#ffe066'][Math.floor(Math.random() * 3)], size: 4 + Math.random() * 5,
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
  floaters.push({ x: player.x, y: player.y - 40, text: 'IGNI!', life: 50, color: '#ffaa00' });
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
      color: burn ? '#ff8800' : '#aa2222', size: 3,
    });
  }
  if (e.hp <= 0) killEnemy(e);
}

function killEnemy(e) {
  enemies = enemies.filter((x) => x !== e);
  S.kills++;
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
  if (!player.dead) {
    let dx = 0, dy = 0;
    if (S.keys['w'] || S.keys['arrowup']) dy -= 1;
    if (S.keys['s'] || S.keys['arrowdown']) dy += 1;
    if (S.keys['a'] || S.keys['arrowleft']) dx -= 1;
    if (S.keys['d'] || S.keys['arrowright']) dx += 1;
    if (dx || dy) {
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
  if (player.igniCd > 0) { player.igniCd--; if (player.igniCd === 0) updateHud(); }
  if (player.quenCd > 0) { player.quenCd--; if (player.quenCd === 0) updateHud(); }
  if (player.quen > 0) player.quen--;
  if (player.hurtFlash > 0) player.hurtFlash--;
  if (player.roachCd > 0) player.roachCd--;

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

// ---------- rendering ----------
// pre-render the swamp floor so it doesn't shimmer
const floor = document.createElement('canvas');
floor.width = W; floor.height = H;
(function paintFloor() {
  const f = floor.getContext('2d');
  const grad = f.createRadialGradient(W / 2, H / 2, 100, W / 2, H / 2, 600);
  grad.addColorStop(0, '#2a3324');
  grad.addColorStop(1, '#161c12');
  f.fillStyle = grad;
  f.fillRect(0, 0, W, H);
  // mud patches & stones
  for (let i = 0; i < 60; i++) {
    f.fillStyle = `rgba(${30 + Math.random() * 30 | 0},${38 + Math.random() * 20 | 0},${24 + Math.random() * 12 | 0},.5)`;
    f.beginPath();
    f.ellipse(Math.random() * W, Math.random() * H, 20 + Math.random() * 50, 10 + Math.random() * 25, Math.random() * 3, 0, 7);
    f.fill();
  }
  for (let i = 0; i < 40; i++) {
    f.fillStyle = 'rgba(90,90,85,.35)';
    f.beginPath();
    f.arc(Math.random() * W, Math.random() * H, 2 + Math.random() * 4, 0, 7);
    f.fill();
  }
  // grass tufts
  f.strokeStyle = 'rgba(70,100,50,.5)';
  for (let i = 0; i < 150; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    f.beginPath();
    f.moveTo(x, y);
    f.lineTo(x + (Math.random() - 0.5) * 6, y - 5 - Math.random() * 6);
    f.stroke();
  }
})();

function draw() {
  ctx.save();
  if (S.shake > 0.5) ctx.translate((Math.random() - 0.5) * S.shake, (Math.random() - 0.5) * S.shake);
  ctx.drawImage(floor, 0, 0);

  if (S.scene === 'combat' || S.scene === 'dialogue' || S.scene === 'ending') {
    // pickups
    for (const c of pickups) {
      ctx.save();
      ctx.translate(c.x, c.y + Math.sin(c.bob) * 3);
      ctx.fillStyle = '#d4af37';
      ctx.beginPath();
      ctx.ellipse(0, 0, 6, 6 * Math.abs(Math.sin(c.bob * 0.7)) + 1.5, 0, 0, 7);
      ctx.fill();
      ctx.strokeStyle = '#8a6d1f';
      ctx.stroke();
      ctx.restore();
    }

    drawRoach();
    for (const e of enemies) drawEnemy(e);
    drawProjectiles();
    if (!player.dead || player.hurtFlash % 8 < 4) drawPlayer();
    drawParticles();
    drawFloaters();
    drawBanner();
    drawBossBar();
  }
  ctx.restore();
}

function drawPlayer() {
  const p = player;
  ctx.save();
  ctx.translate(p.x, p.y);
  if (p.hurtFlash > 0 && p.hurtFlash % 8 < 4) ctx.globalAlpha = 0.4;

  // quen shield
  if (p.quen > 0) {
    ctx.strokeStyle = `rgba(255,215,0,${0.4 + Math.sin(S.time * 0.2) * 0.2})`;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, 26, 0, 7);
    ctx.stroke();
    ctx.lineWidth = 1;
  }

  // shadow
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(0, 14, 13, 5, 0, 0, 7); ctx.fill();

  // body (armor)
  ctx.fillStyle = '#2e2a26';
  ctx.beginPath(); ctx.ellipse(0, 2, 11, 14, 0, 0, 7); ctx.fill();
  // studded belt — very important to the lore
  ctx.fillStyle = '#5a4426';
  ctx.fillRect(-10, 4, 20, 4);

  // head + iconic white hair (the real protagonist)
  ctx.fillStyle = '#caa182';
  ctx.beginPath(); ctx.arc(0, -12, 7, 0, 7); ctx.fill();
  ctx.fillStyle = '#e8e8e0';
  ctx.beginPath();
  ctx.arc(0, -14, 7, Math.PI, 2 * Math.PI);
  ctx.quadraticCurveTo(9, -6, 7, 0);
  ctx.lineTo(5, -8); ctx.lineTo(-5, -8); ctx.lineTo(-7, 0);
  ctx.quadraticCurveTo(-9, -6, -7, -14);
  ctx.fill();
  // ponytail
  ctx.strokeStyle = '#e8e8e0'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(0, -8); ctx.quadraticCurveTo(-3, 0, -2, 8); ctx.stroke();
  ctx.lineWidth = 1;

  // two swords on the back (silver for monsters, steel for ex-lovers)
  ctx.strokeStyle = '#aab';
  ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(-6, -6); ctx.lineTo(-14, -22); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(6, -6); ctx.lineTo(14, -22); ctx.stroke();
  ctx.lineWidth = 1;

  // sword swing arc
  if (p.swing > 0) {
    const prog = 1 - p.swing / 12;
    const a = p.facing - 0.9 + prog * 1.8;
    ctx.strokeStyle = `rgba(220,230,255,${1 - prog})`;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(0, 0, 44, p.facing - 0.9, a);
    ctx.stroke();
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(a) * 14, Math.sin(a) * 14);
    ctx.lineTo(Math.cos(a) * 56, Math.sin(a) * 56);
    ctx.strokeStyle = '#dde';
    ctx.stroke();
    ctx.lineWidth = 1;
  }
  ctx.restore();
}

function drawEnemy(e) {
  ctx.save();
  ctx.translate(e.x, e.y + Math.sin(e.wob) * 2);
  ctx.fillStyle = 'rgba(0,0,0,.4)';
  ctx.beginPath(); ctx.ellipse(0, e.r * 0.8, e.r * 0.8, e.r * 0.3, 0, 0, 7); ctx.fill();

  const c = e.hitFlash > 0 ? '#ffffff' : e.color;
  if (e.type === 'boss') {
    // The Tax Collector: a looming bureaucrat in a dark robe
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r * 1.15, 0, 0, 7); ctx.fill();
    // pale severe face
    ctx.fillStyle = e.hitFlash > 0 ? '#fff' : '#cfc8b8';
    ctx.beginPath(); ctx.arc(0, -e.r * 0.55, e.r * 0.42, 0, 7); ctx.fill();
    // pince-nez of doom
    ctx.strokeStyle = '#222';
    ctx.beginPath(); ctx.arc(-7, -e.r * 0.58, 6, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.arc(7, -e.r * 0.58, 6, 0, 7); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(-1, -e.r * 0.58); ctx.lineTo(1, -e.r * 0.58); ctx.stroke();
    // disapproving mouth
    ctx.beginPath(); ctx.moveTo(-8, -e.r * 0.38); ctx.lineTo(8, -e.r * 0.40); ctx.stroke();
    // ledger
    ctx.fillStyle = '#e8d9b5';
    ctx.fillRect(e.r * 0.4, -10, 22, 28);
    ctx.strokeStyle = '#8a6d1f';
    ctx.strokeRect(e.r * 0.4, -10, 22, 28);
    ctx.strokeStyle = '#999';
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(e.r * 0.4 + 3, -5 + i * 6); ctx.lineTo(e.r * 0.4 + 19, -5 + i * 6);
      ctx.stroke();
    }
  } else {
    ctx.fillStyle = c;
    ctx.beginPath(); ctx.ellipse(0, 0, e.r, e.r * 1.1, 0, 0, 7); ctx.fill();
    // eyes — glowing and full of bad intentions
    ctx.fillStyle = e.type === 'ghoul' ? '#ff4444' : '#ffee44';
    const ey = -e.r * 0.3;
    ctx.beginPath(); ctx.arc(-e.r * 0.35, ey, 2.5, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(e.r * 0.35, ey, 2.5, 0, 7); ctx.fill();
    // toothy grin
    ctx.strokeStyle = '#111';
    ctx.beginPath(); ctx.moveTo(-e.r * 0.4, e.r * 0.25);
    for (let i = 0; i <= 4; i++) ctx.lineTo(-e.r * 0.4 + (e.r * 0.8 / 4) * i, e.r * 0.25 + (i % 2 ? 4 : 0));
    ctx.stroke();
    // little claws
    ctx.strokeStyle = c;
    ctx.lineWidth = 3;
    const wave = Math.sin(e.wob * 2) * 4;
    ctx.beginPath(); ctx.moveTo(-e.r, 0); ctx.lineTo(-e.r - 7, wave); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(e.r, 0); ctx.lineTo(e.r + 7, -wave); ctx.stroke();
    ctx.lineWidth = 1;
  }
  // hp pips for tougher enemies
  if (e.maxHp > 1 && e.hp < e.maxHp && e.type !== 'boss') {
    ctx.fillStyle = '#000a';
    ctx.fillRect(-e.r, -e.r - 8, e.r * 2, 4);
    ctx.fillStyle = '#c33';
    ctx.fillRect(-e.r, -e.r - 8, e.r * 2 * (e.hp / e.maxHp), 4);
  }
  ctx.restore();
}

function drawProjectiles() {
  for (const p of projectiles) {
    ctx.save();
    ctx.translate(p.x, p.y);
    ctx.rotate(p.spin);
    ctx.fillStyle = '#e8e4d4';
    ctx.fillRect(-7, -9, 14, 18);
    ctx.strokeStyle = '#888';
    for (let i = 0; i < 3; i++) {
      ctx.beginPath(); ctx.moveTo(-5, -5 + i * 5); ctx.lineTo(5, -5 + i * 5); ctx.stroke();
    }
    ctx.fillStyle = '#a33';
    ctx.font = 'bold 7px Georgia';
    ctx.textAlign = 'center';
    ctx.fillText('TAX', 0, 8);
    ctx.restore();
  }
}

function drawRoach() {
  if (!roach) return;
  ctx.save();
  ctx.translate(roach.x, roach.y);
  ctx.rotate(roach.tilt);
  ctx.globalAlpha = Math.min(1, roach.life / 40);
  ctx.font = '54px serif';
  ctx.textAlign = 'center';
  ctx.fillText('🐴', 0, 0);
  ctx.font = '12px Georgia';
  ctx.fillStyle = '#e8d9b5';
  ctx.fillText('*judging you*', 0, 18);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = p.life / p.maxLife;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function drawFloaters() {
  ctx.textAlign = 'center';
  for (const f of floaters) {
    ctx.globalAlpha = Math.min(1, f.life / 20);
    ctx.font = 'bold 15px Georgia';
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
  ctx.font = 'bold 21px Georgia';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#000';
  ctx.fillText(S.waveBanner, W / 2 + 2, 80 + 2);
  ctx.fillStyle = '#d4af37';
  ctx.fillText(S.waveBanner, W / 2, 80);
  ctx.globalAlpha = 1;
}

function drawBossBar() {
  const boss = enemies.find((e) => e.type === 'boss');
  if (!boss) return;
  const bw = 500;
  ctx.fillStyle = '#000c';
  ctx.fillRect(W / 2 - bw / 2 - 3, H - 40, bw + 6, 20);
  ctx.fillStyle = '#5a5a7e';
  ctx.fillRect(W / 2 - bw / 2, H - 37, bw * (boss.hp / boss.maxHp), 14);
  ctx.strokeStyle = '#d4af37';
  ctx.strokeRect(W / 2 - bw / 2 - 3, H - 40, bw + 6, 20);
  ctx.font = '12px Georgia';
  ctx.textAlign = 'center';
  ctx.fillStyle = '#e8d9b5';
  ctx.fillText('THE TAX COLLECTOR — "Everything is deductible. Especially your health."', W / 2, H - 45);
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
  $('line').innerHTML = dlg.fullLine + ' <span class="blink" style="color:#d4af37">▸</span>';
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
    { speaker: 'Narrator', portrait: '🌙', text: 'What follows is tasteful, candle-lit, and entirely off-screen. The camera pans to the fireplace. The lute music gets… suggestive. A unicorn figurine on the mantel tips over by itself.' },
    { speaker: 'Narrator', portrait: '🌅', text: 'LATER. Gerald stands, refreshed, hair magnificent, smelling 40% less like swamp. But the night is not over — a cold wind slams the tavern door open…' },
    { speaker: '???', portrait: '🕴️', text: '"GERALD OF RIVIERA. Slayer of twelve monsters this evening. By decree of the Novigrad Revenue Service… you have UNDECLARED INCOME."' },
    { speaker: 'Gerald', portrait: '🧔🏻‍♂️', text: 'I\'ve fought striga, leshens, and the king of the Wild Hunt. But this… this is the one that scares me. Damn.' },
  ], () => startBossFight());
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
  $('end-subtitle').textContent = 'Demo complete. The Path is long, but the bath is warm.';
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
  S.bossDefeated = false; S.bossPhase = false;
  player.hp = player.maxHp; player.dead = false;
  enemies = []; particles = []; floaters = []; projectiles = []; pickups = [];
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
