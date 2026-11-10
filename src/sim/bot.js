// Bot brain. Plays through the same commands and input a human uses.
//
// Two layers:
//   think()  a few times per second: economy, and which goal to pursue (with commitment,
//            so a bot does not flip between attacking and fleeing every half second)
//   steer()  every tick: turns the goal into a stick direction — curved turns, walking
//            around buildings and enemy towers, keeping distance and circling in a fight

import { DIFFICULTY, UNITS, BUILDINGS, WORLD } from './config.js';
import { rand, randRange } from './rng.js';
import { playerStats, buildingCost, queueCommand, setInput, findById } from './world.js';

// Each bot gets a temperament for life; it colours every decision a little.
const PERSONAS = {
  aggressor: { aggression: 0.85, towers: 1, mines: -1, opportunism: 1, roam: 0.2, mix: { knight: 2, giant: 1.8, soldier: 1.3 } },
  turtle: { aggression: 1.3, towers: 4, mines: 1, opportunism: 0.6, roam: 0.5, mix: { archer: 1.6, mage: 1.5, healer: 1.5 } },
  collector: { aggression: 1.1, towers: 2, mines: 0, opportunism: 0.8, roam: 0.05, mix: { knight: 1.6, archer: 1.2 } },
  opportunist: { aggression: 1.0, towers: 2, mines: 0, opportunism: 2.2, roam: 0.25, mix: { dragon: 1.8, mage: 1.3, knight: 1.3 } },
};
const PERSONA_NAMES = Object.keys(PERSONAS);
const MIX = [['soldier', 3], ['archer', 3], ['knight', 2], ['giant', 1], ['mage', 2.5], ['healer', 1], ['dragon', 1]];

const valueOf = (u) => (u.kind === 'commander' ? 90 : UNITS[u.kind].cost) * (0.5 + 0.5 * u.hp / u.maxHp);

function ensure(world, p) {
  const b = p.bot;
  if (b.ready) return b;
  if (!p.persona) p.persona = PERSONA_NAMES[Math.floor(rand(world) * PERSONA_NAMES.length)];
  Object.assign(b, {
    ready: true,
    vx: 0, vy: 0,               // smoothed stick
    phase: rand(world) * 6.28,  // makes every bot weave differently
    strafe: rand(world) < 0.5 ? 1 : -1,
    strafeFlip: 0,
    commitUntil: 0,
    crystalId: 0,
    build: null,                // { kind, x, y } we are walking to
    buildTries: 0,
    lastCount: -1,
    grudge: -1,
    slow: false,
    foe: null,                  // { x, y, d } nearest enemy unit, refreshed every tick
  });
  return b;
}

export function updateBot(world, p, dt, st) {
  const bot = ensure(world, p);
  const diff = DIFFICULTY[p.difficulty] || DIFFICULTY.normal;
  const king = p.commanderId ? findById(world.units, p.commanderId) : null;
  const hq = findById(world.buildings, p.hqId);
  if (!hq) return;

  bot.think -= dt;
  if (bot.think <= 0) {
    bot.think = diff.thinkEvery * randRange(world, 0.75, 1.25);
    think(world, p, st, diff, king, hq);
  }
  if (king) steer(world, p, bot, diff, king, dt);
}

// ---------------------------------------------------------------- steering

function steer(world, p, bot, diff, king, dt) {
  const micro = diff.micro ?? 0.6;
  let dx = bot.tx - king.x, dy = bot.ty - king.y;
  const d = Math.hypot(dx, dy) || 0.001;
  const stop = bot.goal === 'attack' ? 170 : bot.goal === 'gather' ? 4 : bot.goal === 'build' ? 30 : bot.goal === 'capture' ? 60 : 45;
  let mx = 0, my = 0;
  if (d > stop) {
    const ease = Math.min(1, (d - stop) / 70 + 0.25); // ease in to a halt instead of stopping dead
    mx = (dx / d) * ease;
    my = (dy / d) * ease;
    // a lazy weave on long walks, so paths are not ruler-straight
    if (d > 260) {
      const w = Math.sin(world.time * 0.9 + bot.phase) * 0.2;
      mx += (-dy / d) * w;
      my += (dx / d) * w;
    }
    if (bot.slow) { mx *= 0.4; my *= 0.4; } // waiting for stragglers
  }

  // --- fighting: keep the king at a sensible distance and never stand still ---
  let foe = null, foeD = 330;
  for (const u of world.units) {
    if (u.owner === p.id) continue;
    const ud = Math.hypot(u.x - king.x, u.y - king.y);
    if (ud < foeD) { foeD = ud; foe = u; }
  }
  bot.foe = foe ? { x: foe.x, y: foe.y, d: foeD } : null;
  if (foe && micro > 0 && bot.goal !== 'retreat') {
    const hurt = king.hp / king.maxHp;
    const keep = hurt < 0.5 ? 235 : 135; // wounded kings hang back and let the army work
    const ex = (foe.x - king.x) / foeD, ey = (foe.y - king.y) / foeD;
    const radial = Math.max(-1, Math.min(1, (foeD - keep) / 55));
    bot.strafeFlip -= dt;
    if (bot.strafeFlip <= 0) { bot.strafeFlip = randRange(world, 1.2, 3.2); if (rand(world) < 0.5) bot.strafe = -bot.strafe; }
    const side = 0.5 * micro * bot.strafe;
    const fx = ex * radial - ey * side, fy = ey * radial + ex * side;
    // blend: the closer the enemy, the more the fight decides where we go
    const k = Math.min(1, (330 - foeD) / 150) * micro;
    mx = mx * (1 - k) + fx * k;
    my = my * (1 - k) + fy * k;
  }

  // --- walk around buildings, stay out of enemy fire unless we came to fight it ---
  for (const b of world.buildings) {
    const def = BUILDINGS[b.kind];
    const bx = king.x - b.x, by = king.y - b.y;
    const bd = Math.hypot(bx, by) || 0.001;
    let reach = def.radius + UNITS.commander.radius + 55;
    const hostile = b.owner !== p.id && def.dmg && !(bot.goal === 'attack' && b.owner === bot.targetPlayer);
    if (hostile) reach = def.range + 70;
    if (bd > reach) continue;
    const push = (1 - bd / reach) * (hostile ? 1.6 : 1.1);
    // push away, and slide past on whichever side we are already heading
    const tx = -by / bd, ty = bx / bd;
    const side = mx * tx + my * ty >= 0 ? 1 : -1;
    mx += (bx / bd) * push + tx * side * push * 0.8;
    my += (by / bd) * push + ty * side * push * 0.8;
  }

  // --- arena edge ---
  const m = 110, s = world.size;
  if (king.x < m) mx += (m - king.x) / m;
  if (king.y < m) my += (m - king.y) / m;
  if (king.x > s - m) mx -= (king.x - (s - m)) / m;
  if (king.y > s - m) my -= (king.y - (s - m)) / m;

  const len = Math.hypot(mx, my);
  if (len > 1) { mx /= len; my /= len; }
  // turn like a hand on a stick, not like a compass needle
  const turn = Math.min(1, (diff.turn ?? 7) * dt);
  bot.vx += (mx - bot.vx) * turn;
  bot.vy += (my - bot.vy) * turn;
  if (Math.hypot(bot.vx, bot.vy) < 0.06) setInput(world, p.id, 0, 0);
  else setInput(world, p.id, bot.vx, bot.vy);
}

// ---------------------------------------------------------------- economy

function pickUnit(world, st, persona, army) {
  const weights = [];
  let total = 0;
  for (const [kind, base] of MIX) {
    const need = UNITS[kind].needs;
    if (need && !st[need]) continue;
    let w = base * (persona.mix[kind] || 1);
    // one healer per eight fighters is plenty; none are useless
    if (kind === 'healer') w = army.healers * 8 < army.count ? base * 2.5 : 0.05;
    if (kind === 'mage' && army.mages * 4 > army.count) w *= 0.3;
    weights.push([kind, w]);
    total += w;
  }
  let r = rand(world) * total;
  for (const [kind, w] of weights) { r -= w; if (r <= 0) return kind; }
  return 'soldier';
}

function wantedBuilding(p, st, diff, persona) {
  const maxMines = Math.max(1, diff.maxMines + persona.mines);
  if (st.mines < 1) return 'mine';
  if (st.barracks < 1) return 'barracks';
  if (st.mines < 2 && maxMines >= 2) return 'mine';
  if (st.towers < 1 && persona.towers >= 1 && p.difficulty !== 'easy' && p.difficulty !== 'novice') return 'tower';
  if (st.academy < 1 && st.mines >= 2 && st.army >= 10 && p.difficulty !== 'novice') return 'academy';
  if (st.mines < maxMines && st.army >= st.mines * 5) return 'mine'; // army first, greed second
  const nearCap = st.supply >= st.cap * diff.armyTarget - 2;
  if (st.barracks < 2 && nearCap) return 'barracks';
  if (st.barracks < 5 && nearCap && p.gold > 350 && p.difficulty !== 'easy') return 'barracks';
  if (st.towers < persona.towers && p.gold > 420) return 'tower';
  return null;
}

// Lay the base out on purpose: towers face the middle of the map (where trouble comes
// from), mines sit behind the castle, production to the sides.
function buildSpot(world, hq, kind, tries) {
  const toCentre = Math.atan2(world.size / 2 - hq.y, world.size / 2 - hq.x);
  const n = tries;
  let a, r;
  if (kind === 'tower') { a = toCentre + (n % 2 ? 1 : -1) * (0.45 + 0.5 * Math.floor(n / 2)); r = 190 + 25 * (n % 3); }
  else if (kind === 'mine') { a = toCentre + Math.PI + (n % 2 ? 1 : -1) * 0.5 * Math.ceil(n / 2); r = 135 + 45 * Math.floor(n / 4); }
  else { a = toCentre + (n % 2 ? 1 : -1) * (1.45 + 0.35 * Math.floor(n / 2)); r = 150 + 40 * (n % 3); }
  const m = BUILDINGS[kind].radius + 30;
  return {
    kind,
    x: Math.min(world.size - m, Math.max(m, hq.x + Math.cos(a) * r)),
    y: Math.min(world.size - m, Math.max(m, hq.y + Math.sin(a) * r)),
  };
}

// ---------------------------------------------------------------- thinking

function think(world, p, st, diff, king, hq) {
  const bot = p.bot;
  const persona = PERSONAS[p.persona];
  const homeX = hq.x, homeY = hq.y + 130;
  const time = world.time;

  // --- what is around me? one pass over the units ---
  let ownNear = 0, ownAll = 0, foeNear = 0, healers = 0, mages = 0, count = 0, close = 0;
  let foeX = 0, foeY = 0, foeW = 0;
  const kx = king ? king.x : hq.x, ky = king ? king.y : hq.y;
  for (const u of world.units) {
    const d = Math.hypot(u.x - kx, u.y - ky);
    if (u.owner === p.id) {
      const v = valueOf(u);
      ownAll += v;
      if (d < 520) ownNear += v;
      if (u.kind !== 'commander') { count++; if (d < 300) close++; if (u.kind === 'healer') healers++; if (u.kind === 'mage') mages++; }
    } else if (d < 760) {
      const v = valueOf(u);
      foeNear += v; foeX += u.x * v; foeY += u.y * v; foeW += v;
    }
  }
  for (const b of world.buildings) {
    const def = BUILDINGS[b.kind];
    if (b.owner === p.id || !def.dmg) continue;
    if (Math.hypot(b.x - kx, b.y - ky) < def.range + 120) foeNear += b.kind === 'hq' ? 260 : 130;
  }
  const ratio = ownNear / (foeNear + 1);

  // --- economy ---
  const want = wantedBuilding(p, st, diff, persona);
  const wantCost = want ? buildingCost(want, st) : 0;
  const countNow = st.mines + st.barracks + st.towers + st.academy;
  if (bot.build && countNow > bot.lastCount) { bot.build = null; bot.buildTries = 0; }   // it went up
  if (bot.build && (!want || bot.build.kind !== want)) bot.build = null;
  bot.lastCount = countNow;
  if (want && p.gold >= wantCost && king && !bot.build) bot.build = buildSpot(world, hq, want, bot.buildTries);
  if (bot.build && king && Math.hypot(king.x - bot.build.x, king.y - bot.build.y) < 150) {
    queueCommand(world, p.id, { type: 'build', kind: bot.build.kind, x: bot.build.x, y: bot.build.y });
    bot.buildTries++;                       // if it is refused, the next think picks another spot
    bot.build = p.gold >= wantCost ? buildSpot(world, hq, want, bot.buildTries) : null;
  }

  const saving = want && st.army >= 5 + 4 * st.mines && p.gold < wantCost + 60;
  if (!saving) {
    let gold = p.gold - (want && p.gold >= wantCost ? wantCost : 0);
    let supply = st.supply;
    const target = st.cap * diff.armyTarget;
    const army = { count, healers, mages };
    for (let i = 0; i < 3; i++) {
      let kind = pickUnit(world, st, persona, army);
      if (gold < UNITS[kind].cost && gold >= UNITS.soldier.cost && rand(world) < 0.5) kind = 'soldier';
      const def = UNITS[kind];
      if (gold < def.cost || supply + def.supply > target) break;
      queueCommand(world, p.id, { type: 'train', kind });
      gold -= def.cost;
      supply += def.supply;
      army.count++;
      if (kind === 'healer') army.healers++;
      if (kind === 'mage') army.mages++;
    }
  }

  // --- where to go ---
  bot.slow = false;
  if (!king) return setGoal(bot, 'home', homeX, homeY, -1);
  const hp = king.hp / king.maxHp;
  const distHome = Math.hypot(king.x - hq.x, king.y - hq.y);

  // Remember who hurt us.
  if (time - p.hqHitAt < 1 && hq.hitBy !== undefined && hq.hitBy !== p.id) bot.grudge = hq.hitBy;

  // 1. Running away is a commitment: keep running until it is actually safe.
  const outmatched = foeNear > 140 && ratio < (diff.micro ? 0.62 : 0.5);
  if (bot.goal === 'retreat') {
    const safe = foeNear < 60 && (hp > 0.6 || distHome < 260);
    if (!safe || time < bot.commitUntil) return setGoal(bot, 'retreat', homeX, homeY, -1);
  } else if (hp < 0.33 || outmatched) {
    bot.commitUntil = time + 2.5;
    return setGoal(bot, 'retreat', homeX, homeY, -1);
  }

  // 2. The castle is under attack: go home — unless we are about to win where we are.
  if (time - p.hqHitAt < 5 && !(bot.goal === 'attack' && ratio > 2 && distHome > 1500)) {
    return setGoal(bot, 'defend', homeX, homeY, -1);
  }

  // 3. Pick a fight?
  const myPower = st.power;
  const aggression = diff.aggression * persona.aggression;
  let best = null, bestScore = 0, topScore = 1;
  for (const e of world.players) if (e.id !== p.id && e.alive && e.score > topScore) topScore = e.score;
  for (const e of world.players) {
    if (e.id === p.id || !e.alive) continue;
    const eh = findById(world.buildings, e.hqId);
    if (!eh) continue;
    const es = playerStats(world, e.id);
    const ec = e.commanderId ? findById(world.units, e.commanderId) : null;
    const fresh = time < e.shieldUntil; // no spawn camping
    const settled = time - e.spawnedAt > WORLD.botMercy;
    // Aim at whoever is ahead, not at whoever is weakest; then season to taste.
    let lure = 0.4 + 1.6 * (e.score / topScore);
    if (e.id === bot.targetPlayer) lure *= 1.45;          // finish what you started
    if (e.id === bot.grudge) lure *= 1.4;                 // revenge
    const busy = time - e.hqHitAt < 6 || !ec;             // already in trouble, or king is dead
    if (busy) lure *= 1 + 0.5 * persona.opportunism;
    if (eh.hp < eh.maxHp * 0.5) lure *= 1 + 0.4 * persona.opportunism;

    if (ec && !fresh) {
      const dc = Math.hypot(ec.x - king.x, ec.y - king.y);
      // Catch an army in the open, away from its towers.
      const awayFromHome = Math.hypot(ec.x - eh.x, ec.y - eh.y) > 420;
      if (dc < 950 && awayFromHome && myPower > es.power * aggression) {
        const s = lure * 1.5 / (1 + dc / 1200);
        if (s > bestScore) { bestScore = s; best = { id: e.id, x: ec.x, y: ec.y }; }
      }
    }
    const basePower = es.power * (ec ? 1 : 0.7) + 320 + es.towers * 130;
    const keepGoing = e.id === bot.targetPlayer && bot.goal === 'attack' ? 0.8 : 1; // don't lose heart at the gates
    // No honour in flattening someone far weaker who is not even in the race — unless they started it.
    const bullying = es.power < myPower * 0.35 && e.score < topScore * 0.8 && e.id !== bot.grudge;
    if (!fresh && settled && !bullying && myPower >= 420 && myPower > basePower * aggression * keepGoing) {
      const dh = Math.hypot(eh.x - king.x, eh.y - king.y);
      const s = lure / (1 + dh / 1800);
      if (s > bestScore) { bestScore = s; best = { id: e.id, x: eh.x, y: eh.y }; }
    }
  }

  if (best) {
    // An army strung out across the map loses: let the stragglers catch up first.
    if (diff.micro && count >= 6 && close < count * 0.55 && !bot.foe) bot.slow = true;
    return setGoal(bot, 'attack', best.x, best.y, best.id);
  }

  // 4. Something to build: walk to the chosen spot.
  if (bot.build) return setGoal(bot, 'build', bot.build.x, bot.build.y, -1);

  // 4b. The Kristalhart pays well; go and take it when we are strong enough to hold it.
  const sh = world.shrine;
  if (sh.owner !== p.id && myPower >= 420 * persona.aggression) {
    const dsh = Math.hypot(sh.x - king.x, sh.y - king.y);
    const holder = world.players[sh.owner];
    const holderPower = holder && holder.alive ? playerStats(world, holder.id).power : 0;
    if ((dsh < 2400 || myPower >= 700) && myPower > holderPower * 0.8) return setGoal(bot, 'capture', sh.x, sh.y, -1);
  }

  // 5. Gather. Stick with the crystal we chose; pick new ones by how rich and how safe the area is.
  let target = bot.crystalId ? findById(world.crystals, bot.crystalId) : null;
  if (!target) {
    const homeBias = myPower < 300 ? 0.7 : persona.roam;
    let bestC = -Infinity;
    for (const c of world.crystals) {
      const d = Math.hypot(c.x - king.x, c.y - king.y);
      if (d > 2600) continue;
      let friends = 0;
      for (const o of world.crystals) if (o !== c && Math.abs(o.x - c.x) < 260 && Math.abs(o.y - c.y) < 260) friends++;
      let s = (1 + 0.45 * friends) / (160 + d + homeBias * Math.hypot(c.x - hq.x, c.y - hq.y));
      // not under someone else's towers, and not into a stronger army
      for (const b of world.buildings) {
        if (b.owner !== p.id && BUILDINGS[b.kind].dmg && Math.hypot(b.x - c.x, b.y - c.y) < BUILDINGS[b.kind].range + 60) { s *= 0.15; break; }
      }
      if (foeW > 0 && foeNear > ownNear * 0.9 && Math.hypot(foeX / foeW - c.x, foeY / foeW - c.y) < 420) s *= 0.25;
      s *= 0.85 + 0.3 * rand(world); // two bots side by side should not pick the same one forever
      if (s > bestC) { bestC = s; target = c; }
    }
    bot.crystalId = target ? target.id : 0;
  }
  if (target) return setGoal(bot, 'gather', target.x, target.y, -1);

  // 6. Nothing to do: patrol around the castle rather than stand like a statue.
  const a = time * 0.25 + bot.phase;
  return setGoal(bot, 'home', hq.x + Math.cos(a) * 230, hq.y + Math.sin(a) * 230, -1);
}

function setGoal(bot, goal, x, y, targetPlayer) {
  bot.goal = goal;
  bot.tx = x;
  bot.ty = y;
  bot.targetPlayer = targetPlayer;
}
