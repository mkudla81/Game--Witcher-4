/* ============================================================
   GWENT: HOMEBREW RULES EDITION
   The card game so good the rest of this demo is optional.
   Best of 3 rounds. Play cards, out-score the bard, or PASS
   and pray. Spies (purple) join the ENEMY side but draw you
   two cards, which is either genius or treason.
   ============================================================ */

'use strict';

const GW_POOL = [
  { name: 'Gerald in a Bathtub', power: 10, em: '🛁', hero: true },
  { name: 'Yenncifer, Mildly Annoyed', power: 9, em: '🧝‍♀️', hero: true },
  { name: 'Trish in a Tavern', power: 8, em: '👩‍🦰', hero: true },
  { name: 'Lute Solo (Suggestive)', power: 7, em: '🎵' },
  { name: 'Igni (Indoor Use Prohibited)', power: 7, em: '🔥' },
  { name: 'Cheese Wheel of Destiny', power: 6, em: '🧀' },
  { name: 'Unicorn Figurine (Embarrassed)', power: 5, em: '🦄' },
  { name: "The Bartender's Free Ale", power: 5, em: '🍺' },
  { name: 'Ghoul (In Therapy)', power: 4, em: '👻' },
  { name: 'Quen Bubble', power: 4, em: '🟡' },
  { name: "Village Elder's Niece", power: 3, em: '👧' },
  { name: 'Drowner (Moist)', power: 3, em: '🐸' },
  { name: 'Nekker (Rude)', power: 2, em: '👺' },
  { name: 'Suspicious Stew', power: 2, em: '🍲' },
  { name: "Drowner's Gym Bag", power: 2, em: '🎒' },
  { name: "Witcher's Studded Belt", power: 1, em: '🪢' },
  { name: 'Receipt of Deductions', power: 1, em: '🧾' },
  { name: 'Roach (On a Roof)', power: 1, em: '🐴' },
  { name: 'Bard with a Restraining Order', power: 4, em: '🪕', spy: true },
  { name: 'Tax Auditor Intern', power: 6, em: '🕴️', spy: true },
];

const gw = {
  active: false, over: false, turn: 'p', round: 1,
  pHand: [], aHand: [], pDeck: [], aDeck: [],
  pBoard: [], aBoard: [],
  passed: { p: false, a: false },
  crowns: { p: 0, a: 0 },
  wager: false, onDone: null, aiTimer: null,
};

function gwShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function gwStart(opts, onDone) {
  gw.active = true; gw.over = false; gw.turn = 'p'; gw.round = 1;
  gw.passed = { p: false, a: false };
  gw.crowns = { p: 0, a: 0 };
  gw.pBoard = []; gw.aBoard = [];
  gw.wager = !!(opts && opts.wager);
  gw.onDone = onDone || null;
  const pPool = gwShuffle(GW_POOL);
  const aPool = gwShuffle(GW_POOL);
  gw.pHand = pPool.slice(0, 10); gw.pDeck = pPool.slice(10);
  gw.aHand = aPool.slice(0, 10); gw.aDeck = aPool.slice(10);
  clearTimeout(gw.aiTimer);
  $('gw-modal').classList.remove('visible');
  $('gwent').classList.add('visible');
  gwStatus('Round 1. Your move — click a card, or PASS if you enjoy losing.');
  gwRender();
}

function gwTotal(board) { return board.reduce((s, c) => s + c.power, 0); }

function gwCardEl(card, mini) {
  const d = document.createElement('div');
  d.className = 'gw-card' + (card.spy ? ' spy' : '') + (card.hero ? ' hero' : '');
  if (mini) { d.style.width = '54px'; d.style.height = '72px'; }
  d.innerHTML = '<span class="pw">' + card.power + '</span><span class="em">' + card.em + '</span>'
    + card.name + (card.spy ? '<br><b>SPY</b>' : '');
  return d;
}

function gwRender() {
  const pb = $('gw-p-board'), ab = $('gw-ai-board'), hr = $('gw-hand-row');
  pb.innerHTML = ''; ab.innerHTML = ''; hr.innerHTML = '';
  for (const c of gw.pBoard) pb.appendChild(gwCardEl(c, true));
  for (const c of gw.aBoard) ab.appendChild(gwCardEl(c, true));
  gw.pHand.forEach((c, i) => {
    const el = gwCardEl(c, false);
    if (gw.turn !== 'p' || gw.over || gw.passed.p) el.classList.add('disabled');
    else el.onclick = () => gwPlayerPlay(i);
    hr.appendChild(el);
  });
  $('gw-p-total').textContent = gwTotal(gw.pBoard);
  $('gw-ai-total').textContent = gwTotal(gw.aBoard);
  $('gw-ai-cards').textContent = gw.aHand.length;
  $('gw-p-crowns').textContent = '👑'.repeat(gw.crowns.p);
  $('gw-ai-crowns').textContent = '👑'.repeat(gw.crowns.a);
  $('gw-mid').textContent = 'ROUND ' + gw.round + ' OF 3 — ' + (gw.passed.a
    ? 'the bard has passed and is now "tuning his lute" nervously'
    : 'closest thing the Continent has to therapy');
  $('gw-pass').disabled = gw.turn !== 'p' || gw.over || gw.passed.p;
}

function gwStatus(msg) { $('gw-status').textContent = msg; }

// spies land on the enemy board and draw their owner 2 cards
function gwPlace(card, owner) {
  if (card.spy) {
    (owner === 'p' ? gw.aBoard : gw.pBoard).push(card);
    const deck = owner === 'p' ? gw.pDeck : gw.aDeck;
    const hand = owner === 'p' ? gw.pHand : gw.aHand;
    for (let i = 0; i < 2 && deck.length; i++) hand.push(deck.shift());
    if (owner === 'p') gwStatus('Your spy defects beautifully. You draw 2 cards. The bard looks betrayed.');
  } else {
    (owner === 'p' ? gw.pBoard : gw.aBoard).push(card);
  }
}

function gwPlayerPlay(i) {
  if (gw.turn !== 'p' || gw.over || gw.passed.p) return;
  const card = gw.pHand.splice(i, 1)[0];
  gwPlace(card, 'p');
  sfx.ui();
  if (gw.passed.a) {
    // bard already passed — keep playing or pass
    gwRender();
    if (gw.pHand.length === 0) return gwPass();
    return;
  }
  gw.turn = 'a';
  gwRender();
  gwStatus('The bard strokes his chin like he understands strategy…');
  gw.aiTimer = setTimeout(gwAiMove, 750);
}

function gwPass() {
  if (gw.turn !== 'p' || gw.over || gw.passed.p) return;
  gw.passed.p = true;
  sfx.ui();
  gwStatus('You pass. Bold. Possibly stupid. The table holds its breath.');
  if (gw.passed.a) return gwEndRound();
  gw.turn = 'a';
  gwRender();
  gw.aiTimer = setTimeout(gwAiMove, 750);
}

function gwAiMove() {
  if (gw.over) return;
  const my = gwTotal(gw.aBoard), op = gwTotal(gw.pBoard);
  const hand = gw.aHand;
  let action = null; // index to play, or 'pass'

  if (hand.length === 0) action = 'pass';
  else if (gw.passed.p) {
    if (my > op) action = 'pass';
    else {
      // cheapest non-spy card that takes the lead
      let best = -1;
      hand.forEach((c, i) => {
        if (!c.spy && my + c.power > op && (best < 0 || c.power < hand[best].power)) best = i;
      });
      action = best >= 0 ? best : 'pass'; // can't win — concede, save cards
    }
  } else {
    const spy = hand.findIndex((c) => c.spy);
    if (spy >= 0) action = spy;
    else if (my - op > 25) action = 'pass'; // comfortably ahead, banks the lead
    else {
      // plays from the cheaper half of his hand, like a coward
      const sorted = hand.map((c, i) => i).sort((a, b) => hand[a].power - hand[b].power);
      action = sorted[Math.floor(Math.random() * Math.ceil(sorted.length / 2))];
    }
  }

  if (action === 'pass') {
    gw.passed.a = true;
    if (gw.passed.p) return gwEndRound();
    gw.turn = 'p';
    gwStatus('The bard passes and begins composing his excuse ballad. Your move.');
    gwRender();
    return;
  }

  const card = hand.splice(action, 1)[0];
  gwPlace(card, 'a');
  sfx.swing();
  if (card.spy) gwStatus('The bard plays a SPY on your side: "' + card.name + '". He draws 2. Outrageous.');
  else gwStatus('The bard plays "' + card.name + '" and looks unbearably smug.');

  if (gw.passed.p) {
    gwRender();
    gw.aiTimer = setTimeout(gwAiMove, 750); // he keeps going until satisfied
  } else {
    gw.turn = 'p';
    gwRender();
  }
}

function gwEndRound() {
  const p = gwTotal(gw.pBoard), a = gwTotal(gw.aBoard);
  let msg;
  if (p > a) { gw.crowns.p++; msg = 'Round ' + gw.round + ' — YOU WIN IT, ' + p + ' to ' + a + '. The bard mutters about "card luck."'; }
  else if (a > p) { gw.crowns.a++; msg = 'Round ' + gw.round + ' — the bard takes it, ' + a + ' to ' + p + '. He will never let you forget this.'; }
  else { gw.crowns.p++; gw.crowns.a++; msg = 'Round ' + gw.round + ' — a TIE at ' + p + '. Everyone gets a crown. Nobody is happy.'; }
  toast(msg, 3000);
  sfx.coin();

  gw.pBoard = []; gw.aBoard = [];
  gw.passed = { p: false, a: false };
  gw.round++;

  const pWon = gw.crowns.p >= 2, aWon = gw.crowns.a >= 2;
  if (pWon || aWon || gw.round > 3) {
    const result = pWon && aWon ? 'draw' : pWon ? 'win' : aWon ? 'lose' : (gw.crowns.p > gw.crowns.a ? 'win' : gw.crowns.p < gw.crowns.a ? 'lose' : 'draw');
    return gwEndGame(result);
  }
  gw.turn = 'p';
  gwStatus('Round ' + gw.round + '. Your cards do not replenish. Yes, that is the game. Yes, it hurts.');
  gwRender();
}

function gwEndGame(result) {
  gw.over = true;
  gwRender();
  const title = { win: '👑 VICTORY 👑', lose: '💀 DEFEAT 💀', draw: '🤝 A DRAW 🤝' }[result];
  let text = {
    win: 'You crush the bard at his own game. He pays up, weeping into his lute. "This will make a TERRIBLE song," he sniffles.',
    lose: 'The bard sweeps the table and bows to the room. Somewhere a lute riff plays. It is mocking you specifically.',
    draw: 'A draw. You and the bard stare at each other with grudging respect and zero coins exchanged.',
  }[result];
  if (gw.wager) {
    if (result === 'win') { S.coins += 15; text += ' (+15 🪙)'; }
    if (result === 'lose') { const loss = Math.min(10, S.coins); S.coins -= loss; text += ' (−' + loss + ' 🪙)'; }
    if (result === 'win') S.charm += 1;
    updateHud();
  }
  $('gw-modal-title').textContent = title;
  $('gw-modal-text').textContent = text;
  $('gw-modal').classList.add('visible');
  $('gw-modal-btn').onclick = () => {
    sfx.ui();
    $('gw-modal').classList.remove('visible');
    $('gwent').classList.remove('visible');
    gw.active = false;
    const cb = gw.onDone; gw.onDone = null;
    if (cb) cb(result);
  };
  if (result === 'win') sfx.smooch(); else sfx.hurt();
}

$('gw-pass').onclick = gwPass;

// title & end-screen shortcuts — for people who know what a card game demo is really about
$('gwent-btn').onclick = () => {
  sfx.ui();
  $('title-screen').classList.remove('visible');
  gwStart({ wager: false }, () => $('title-screen').classList.add('visible'));
};
$('gwent-again-btn').onclick = () => {
  sfx.ui();
  $('end-screen').classList.remove('visible');
  gwStart({ wager: false }, () => $('end-screen').classList.add('visible'));
};
