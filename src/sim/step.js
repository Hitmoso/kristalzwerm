// One fixed simulation tick. Everything that changes the world happens here.

import { DT, WORLD, UNITS, BUILDINGS, CARAVAN, NEUTRAL } from './config.js';
import { buildGrid, queryGrid } from './grid.js';
import {
  playerStats, buildingCost, resetPlayer, spawnUnit, spawnBuilding, spawnCrystal, pushOutOfBuildings, moveKing,
} from './world.js';
import { updateBot } from './bot.js';
import { updateCaravan, spawnCaravan, lootCaravan } from './caravan.js';

const GRID_CELL = 120;
const FOLLOW_SPEED = 215;
const BUILD_KINDS = { mine: 1, barracks: 1, tower: 1, academy: 1 };
const BOT_ORDERS = { center: 1, attack: 1, home: 1, free: 1 };
const ARMY_MODES = { follow: 1, hold: 1, attack: 1 };
const HEALER_SAFE = 175;   // healers step back when an enemy is this close
const HEALER_BEHIND = 95;  // and otherwise stand this far behind the army, away from the fight

export function step(world, dt = DT) {
  world.events.length = 0;
  world.tick++;
  world.time += dt;

  const ctx = {
    world,
    dt,
    byId: new Map(),
    grid: null,
    stats: [],
    centres: [],  // army centre per player, filled on demand
    fronts: [],   // direction to the nearest enemy per player, filled on demand
  };
  for (const u of world.units) ctx.byId.set(u.id, u);
  for (const b of world.buildings) ctx.byId.set(b.id, b);

  for (const p of world.players) {
    if (!p.alive) {
      handleDead(ctx, p, dt);
      ctx.stats[p.id] = null;
      continue;
    }
    const st = (ctx.stats[p.id] = playerStats(world, p.id));
    if (p.life && st.supply > p.life.peakArmy) p.life.peakArmy = st.supply;
    p.gold += st.income * dt;
    if (p.isBot) updateBot(world, p, dt, st);
    for (const cmd of p.commands) applyCommand(ctx, p, st, cmd);
    p.commands.length = 0;
    if (!p.commanderId) {
      p.commanderRespawn -= dt;
      if (p.commanderRespawn <= 0) {
        const hq = ctx.byId.get(p.hqId);
        const c = spawnUnit(world, p.id, 'commander', hq.x, hq.y + BUILDINGS.hq.radius + 40);
        p.commanderId = c.id;
        ctx.byId.set(c.id, c);
      }
    }
  }

  production(ctx);
  ctx.grid = buildGrid(world.units, GRID_CELL);
  updateUnits(ctx);
  updateShrine(ctx);
  updateCaravan(world, dt);
  updateBuildings(ctx);
  collectCrystals(ctx);
  cleanup(ctx);

  // A player's own attack order ends when the target is gone.
  for (const p of world.players) {
    if (p.army !== 'attack') continue;
    const t = world.players[p.armyTarget];
    if (t && t.alive && !t.left) continue;
    p.army = 'follow';
    p.armyTarget = -1;
    world.events.push({ type: 'army', player: p.id, mode: 'follow', target: -1, reason: 'done' });
  }

  // An attack order ends when its target is gone.
  const ord = world.botOrder;
  if (ord && ord.order === 'attack' && !(world.players[ord.target] && world.players[ord.target].alive)) {
    world.botOrder = null;
    world.events.push({ type: 'order', player: ord.by, order: 'free', target: -1, reason: 'done' });
  }

  updateCrown(world);

  if (world.crystals.length < WORLD.crystalCount) {
    world.crystalTimer += dt;
    if (world.crystalTimer >= WORLD.crystalRespawn) {
      world.crystalTimer = 0;
      spawnCrystal(world);
    }
  }
}

function handleDead(ctx, p, dt) {
  const world = ctx.world;
  if (p.left) { p.commands.length = 0; return; }
  let wantsRespawn = false, revenge = false;
  for (const cmd of p.commands) if (cmd.type === 'respawn') { wantsRespawn = true; revenge = cmd.revenge === true; }
  p.commands.length = 0;
  if (p.isBot) {
    p.respawnIn -= dt;
    if (p.respawnIn <= 0) { wantsRespawn = true; revenge = true; } // bots always hold a grudge
  }
  if (wantsRespawn) {
    resetPlayer(world, p);
    const foe = world.players[p.lastKiller];
    if (revenge && foe && foe !== p && foe.alive && !foe.left) {
      p.revenge = foe.id;
      if (p.bot) p.bot.grudge = foe.id;
      world.events.push({ type: 'revenge', phase: 'sworn', player: p.id, target: foe.id });
    }
    for (const u of world.units) if (u.owner === p.id) ctx.byId.set(u.id, u);
    for (const b of world.buildings) if (b.owner === p.id) ctx.byId.set(b.id, b);
    world.events.push({ type: 'spawned', player: p.id });
  }
}

function notice(world, p, code) {
  p.notice = { code, at: world.time };
}

function applyCommand(ctx, p, st, cmd) {
  const world = ctx.world;
  if (cmd.type === 'stance') {
    // Space: follow <-> guard the castle (from an attack, it calls the army back)
    p.army = p.army === 'follow' ? 'hold' : 'follow';
    p.armyTarget = -1;
    world.events.push({ type: 'army', player: p.id, mode: p.army, target: -1 });
    return;
  }
  if (cmd.type === 'army') {
    if (!ARMY_MODES[cmd.mode]) return;
    if (cmd.mode === 'attack') {
      const t = world.players[cmd.target];
      if (!Number.isSafeInteger(cmd.target) || !t || t === p || !t.alive || t.left) return;
      if (t.shieldUntil > world.time) return notice(world, p, 'targetShield');
      p.army = 'attack';
      p.armyTarget = t.id;
    } else {
      p.army = cmd.mode;
      p.armyTarget = -1;
    }
    world.events.push({ type: 'army', player: p.id, mode: p.army, target: p.armyTarget });
    return;
  }
  if (cmd.type === 'boost') {
    if (!world.cheats && !p.admin) return;
    p.boost = !p.boost;
    world.events.push({ type: 'boost', player: p.id, on: p.boost });
    return;
  }
  if (cmd.type === 'order') {
    // Admin: tell every bot what to do. 'free' hands them back their own minds.
    if (!world.cheats && !p.admin) return;
    if (!BOT_ORDERS[cmd.order]) return;
    if (cmd.order === 'free') world.botOrder = null;
    else {
      const t = world.players[cmd.target];
      if (cmd.order === 'attack' && (!t || !t.alive)) return;
      world.botOrder = { order: cmd.order, target: cmd.order === 'attack' ? t.id : -1, by: p.id };
    }
    world.events.push({ type: 'order', player: p.id, order: cmd.order, target: world.botOrder ? world.botOrder.target : -1 });
    return;
  }
  if (cmd.type === 'caravan') {
    // admin: call a caravan right now (if none is on the map)
    if (!world.cheats && !p.admin) return;
    spawnCaravan(world);
    return;
  }
  if (cmd.type === 'cheat') {
    if (!world.cheats && !p.admin) return;
    p.gold += WORLD.cheatGold;
    world.events.push({ type: 'cheat', player: p.id, gold: WORLD.cheatGold });
    return;
  }
  if (cmd.type === 'train') {
    const def = UNITS[cmd.kind];
    if (!def || cmd.kind === 'commander' || def.neutral) return;
    if (def.needs && !st[def.needs]) return notice(world, p, def.needs);
    if (p.gold < def.cost) return notice(world, p, 'gold');
    if (st.supply + def.supply > st.cap) return notice(world, p, 'supply');
    p.gold -= def.cost;
    st.supply += def.supply;
    p.queue.push(cmd.kind);
    return;
  }
  if (cmd.type === 'build') {
    if (!BUILD_KINDS[cmd.kind]) return;
    const def = BUILDINGS[cmd.kind];
    const c = ctx.byId.get(p.commanderId);
    if (!c) return notice(world, p, 'commander');
    const cost = buildingCost(cmd.kind, st);
    if (p.gold < cost) return notice(world, p, 'gold');
    let x, y;
    if (Number.isFinite(cmd.x) && Number.isFinite(cmd.y) && Math.hypot(cmd.x - c.x, cmd.y - c.y) <= 220) {
      x = cmd.x; y = cmd.y;
    } else {
      const reach = UNITS.commander.radius + def.radius + 14;
      x = c.x + p.facing.x * reach;
      y = c.y + p.facing.y * reach;
    }
    const m = def.radius + 20;
    if (x < m || y < m || x > world.size - m || y > world.size - m) return notice(world, p, 'edge');
    for (const b of world.buildings) {
      const d = Math.hypot(b.x - x, b.y - y);
      if (d < BUILDINGS[b.kind].radius + def.radius + 10) return notice(world, p, 'blocked');
      if (b.owner !== p.id && d < WORLD.enemyBuildExclusion) return notice(world, p, 'enemy');
    }
    p.gold -= cost;
    const b = spawnBuilding(world, p.id, cmd.kind, x, y);
    ctx.byId.set(b.id, b);
    if (cmd.kind === 'mine') st.mines++;
    else if (cmd.kind === 'barracks') st.barracks++;
    else if (cmd.kind === 'academy') st.academy++;
    else st.towers++;
    st.cap = Math.min(WORLD.maxSupply, st.cap + (def.supply || 0));
    st.income += def.income || 0;
    world.events.push({ type: 'built', x, y, kind: cmd.kind, owner: p.id });
  }
}

function production(ctx) {
  const world = ctx.world;
  const n = world.buildings.length;
  for (let i = 0; i < n; i++) {
    const b = world.buildings[i];
    if (!BUILDINGS[b.kind].trains) continue;
    const p = world.players[b.owner];
    if (b.train) {
      b.train.left -= ctx.dt;
      if (b.train.left <= 0) {
        const r = BUILDINGS[b.kind].radius + UNITS[b.train.kind].radius + 4;
        const a = (b.id * 2.399 + world.tick * 0.37) % (Math.PI * 2);
        const u = spawnUnit(world, b.owner, b.train.kind, b.x + Math.cos(a) * r, b.y + Math.sin(a) * r);
        ctx.byId.set(u.id, u);
        b.train = null;
      }
    }
    if (!b.train && p.queue.length) {
      const kind = p.queue.shift();
      b.train = { kind, left: UNITS[kind].train, total: UNITS[kind].train };
    }
  }
}

function radiusOf(e) {
  return (UNITS[e.kind] || BUILDINGS[e.kind]).radius;
}

// Nearest enemy (unit or building) whose edge is within `range` of (x, y).
// Melee units cannot reach anything that flies; ranged units, kings, towers and castles can.
export function canHitAir(kind) {
  const def = UNITS[kind] || BUILDINGS[kind];
  return !!def && (def.range > 50 || !!def.flying);
}

function nearestEnemy(ctx, x, y, range, owner, withBuildings, air = true) {
  let best = null, bestD = range;
  queryGrid(ctx.grid, x, y, range + 20, (o) => {
    if (o.owner === owner || o.hp <= 0) return;
    if (!air && UNITS[o.kind].flying) return;
    const d = Math.hypot(o.x - x, o.y - y) - UNITS[o.kind].radius;
    if (d < bestD) { bestD = d; best = o; }
  });
  if (withBuildings) {
    const bs = ctx.world.buildings;
    for (let i = 0; i < bs.length; i++) {
      const b = bs[i];
      if (b.owner === owner || b.hp <= 0) continue;
      if (ctx.world.players[b.owner].shieldUntil > ctx.world.time) continue; // shielded base
      const d = Math.hypot(b.x - x, b.y - y) - BUILDINGS[b.kind].radius;
      if (d < bestD) { bestD = d; best = b; }
    }
  }
  return best;
}

function dealDamage(ctx, attacker, target, amount, quiet) {
  const world = ctx.world;
  if (target.hp <= 0) return;
  if (!UNITS[target.kind]) {
    // Buildings behind a spawn shield take no damage; attacking a base drops your own shield.
    if (world.players[target.owner].shieldUntil > world.time) return;
    const atk = world.players[attacker.owner];
    if (atk && atk.shieldUntil > world.time) atk.shieldUntil = world.time;
  }
  target.hp -= amount;
  target.hitAt = world.time;
  target.hitBy = attacker.owner;
  const isBuilding = !UNITS[target.kind];
  if (isBuilding && target.kind === 'hq') world.players[target.owner].hqHitAt = world.time;
  const ranged = (UNITS[attacker.kind] || BUILDINGS[attacker.kind]).range > 50;
  if (quiet) {
    // splash victim: the splash event already shows it
  } else if (ranged) {
    world.events.push({ type: 'shot', kind: attacker.kind, x1: attacker.x, y1: attacker.y, x2: target.x, y2: target.y, owner: attacker.owner });
  } else {
    world.events.push({ type: 'hit', kind: attacker.kind, x: target.x, y: target.y, owner: attacker.owner });
  }
  if (target.hp <= 0) {
    const killer = world.players[attacker.owner]; // undefined when a caravan guard landed the blow
    if (target.kind === 'caravan') lootCaravan(world, target, killer);
    if (!killer) return;
    if (isBuilding) {
      if (killer.life) killer.life.buildings++;
      killer.score += target.kind === 'hq' ? 500 : BUILDINGS[target.kind].cost;
    } else {
      killer.kills++;
      killer.score += target.kind === 'commander' ? 100 : UNITS[target.kind].cost;
    }
  }
}

// The caravan's cart rolls along its route; its guards keep close and fight off raiders.
function moveNeutral(ctx, u, def) {
  const world = ctx.world, dt = ctx.dt, cv = world.caravan;
  if (!cv) return;
  let nx = u.x, ny = u.y;
  if (u.kind === 'caravan') {
    if (cv.state !== 'rolling') return;
    const dx = cv.ex - u.x, dy = cv.ey - u.y, d = Math.hypot(dx, dy);
    if (d < 40) { cv.arrived = true; return; }
    let mx = dx / d, my = dy / d;
    // something in the way (a castle on the route): veer around it on a fixed side
    const step = def.speed * dt;
    pushOutOfBuildings(world.buildings, u.x + mx * step, u.y + my * step, def.radius, _pos);
    if (Math.hypot(_pos.x - u.x, _pos.y - u.y) < step * 0.6) {
      const s = cv.side;
      mx = mx * 0.35 - my * s; my = my * 0.35 + (dx / d) * s;
      const l = Math.hypot(mx, my); mx /= l; my /= l;
    }
    u.fx = mx; u.fy = my;
    nx = u.x + mx * step;
    ny = u.y + my * step;
  } else {
    const wagon = ctx.byId.get(cv.wagonId);
    const ax = wagon && wagon.hp > 0 ? wagon.x : cv.x, ay = wagon && wagon.hp > 0 ? wagon.y : cv.y;
    const fromCart = Math.hypot(u.x - ax, u.y - ay);
    let target = null;
    if (fromCart < CARAVAN.guardLeash) {
      target = u.targetId ? ctx.byId.get(u.targetId) : null;
      const air = canHitAir(u.kind);
      if (target && (target.hp <= 0 || (!air && UNITS[target.kind] && UNITS[target.kind].flying))) target = null;
      if (!target || (world.tick + u.id) % 4 === 0) target = nearestEnemy(ctx, u.x, u.y, CARAVAN.guardAggro, NEUTRAL, false, air);
    }
    u.targetId = target ? target.id : 0;
    let vx = 0, vy = 0;
    if (target) {
      const dx = target.x - u.x, dy = target.y - u.y, d = Math.hypot(dx, dy) || 0.001;
      u.fx = dx / d; u.fy = dy / d;
      if (d - def.radius - radiusOf(target) <= def.range) { if (u.cd <= 0) attack(ctx, u, def, target); }
      else { vx = (dx / d) * def.speed; vy = (dy / d) * def.speed; }
    } else {
      // escort ring around the cart, front guards ahead of it
      const a = (u.slot / CARAVAN.guards.length) * Math.PI * 2;
      const gx = ax + Math.cos(a) * 62, gy = ay + Math.sin(a) * 52;
      const dx = gx - u.x, dy = gy - u.y, d = Math.hypot(dx, dy);
      if (d > 3) {
        const sp = Math.min(FOLLOW_SPEED, d * 5);
        vx = (dx / d) * sp; vy = (dy / d) * sp;
        u.fx = dx / d; u.fy = dy / d;
      }
    }
    nx = u.x + vx * dt;
    ny = u.y + vy * dt;
  }
  if (!def.flying) {
    pushOutOfBuildings(world.buildings, nx, ny, def.radius, _pos);
    nx = _pos.x; ny = _pos.y;
  }
  const r = def.radius, max = world.size - r;
  u.x = nx < r ? r : nx > max ? max : nx;
  u.y = ny < r ? r : ny > max ? max : ny;
}

// The crown goes to the highest score. A challenger has to clearly beat the holder, so it
// does not flicker back and forth between two players who are neck and neck.
function updateCrown(world) {
  let holder = world.players[world.leader];
  if (holder && (!holder.alive || holder.left || holder.score <= 0)) holder = null;
  let best = holder;
  for (const p of world.players) {
    if (!p.alive || p.left || p.score <= 0 || p === holder) continue;
    const bar = holder ? Math.max(holder.score * (1 + WORLD.crownMargin), holder.score + 50) : 0;
    if (p.score > bar && (!best || p === holder || p.score > best.score)) best = p;
  }
  const id = best ? best.id : -1;
  if (id !== world.leader) {
    world.leader = id;
    if (id >= 0) world.events.push({ type: 'crown', player: id });
  }
}

// The Kristalhart: a king standing on it without rival kings claims it after a few seconds.
function updateShrine(ctx) {
  const world = ctx.world, sh = world.shrine, dt = ctx.dt;
  let present = -1, count = 0;
  for (const p of world.players) {
    if (!p.alive || !p.commanderId) continue;
    const k = ctx.byId.get(p.commanderId);
    if (!k || k.hp <= 0 || Math.hypot(k.x - sh.x, k.y - sh.y) > sh.r) continue;
    present = p.id;
    count++;
  }
  if (count === 1 && present !== sh.owner) {
    if (sh.contender !== present) { sh.contender = present; sh.progress = 0; }
    sh.progress += dt / WORLD.shrineCapture;
    if (sh.progress >= 1) {
      sh.owner = present;
      sh.contender = -1;
      sh.progress = 0;
      world.players[present].score += 150;
      world.events.push({ type: 'captured', player: present, x: sh.x, y: sh.y });
    }
  } else if (count !== 1 || present === sh.owner) {
    // nobody is claiming (or it is contested): the claim fades
    sh.progress = Math.max(0, sh.progress - dt / WORLD.shrineCapture);
    if (sh.progress === 0) sh.contender = -1;
  }
  const owner = world.players[sh.owner];
  if (owner && owner.alive) {
    owner.gold += WORLD.shrineIncome * dt;
    owner.score += WORLD.shrineScore * dt;
  }
}

function attack(ctx, u, def, target) {
  const world = ctx.world;
  u.cd = def.cd;
  let mult = def.buildingMult && !UNITS[target.kind] ? def.buildingMult : 1;
  if (def.airMult && UNITS[target.kind] && UNITS[target.kind].flying) mult *= def.airMult;
  if (def.charge && world.time - u.atkAt > 3) {
    mult *= def.charge;
    world.events.push({ type: 'charge', x: target.x, y: target.y, owner: u.owner });
  }
  u.atkAt = world.time;
  dealDamage(ctx, u, target, def.dmg * mult);
  if (!def.splash) return;
  world.events.push({ type: 'splash', kind: u.kind, x: target.x, y: target.y, r: def.splash, owner: u.owner });
  queryGrid(ctx.grid, target.x, target.y, def.splash + 20, (o) => {
    if (o === target || o.owner === u.owner || o.hp <= 0) return;
    if (Math.hypot(o.x - target.x, o.y - target.y) <= def.splash + UNITS[o.kind].radius) dealDamage(ctx, u, o, def.dmg, true);
  });
}

// Where a healer should stand. Returns false to just keep its formation slot.
//   1. an enemy is close: step away from it, leaning back toward its own army
//   2. a friend is hurt just out of reach: walk up until it is in reach, no closer
//   3. the army is fighting: stand behind its centre, on the side away from the enemy
function healerSpot(ctx, u, def, anchor, idx, out) {
  const centre = armyCentre(ctx, u.owner, anchor);
  const threat = nearestEnemy(ctx, u.x, u.y, HEALER_SAFE, u.owner, false, true);
  if (threat) {
    let ax = u.x - threat.x, ay = u.y - threat.y;
    const ad = Math.hypot(ax, ay) || 1;
    let bx = centre.x - u.x, by = centre.y - u.y;
    const bd = Math.hypot(bx, by) || 1;
    ax /= ad; ay /= ad; bx /= bd; by /= bd;
    const lean = bd > 140 ? 0.8 : 0.3; // far from friends: get back to them first
    out.x = u.x + (ax + bx * lean) * 80;
    out.y = u.y + (ay + by * lean) * 80;
    return true;
  }
  const hurt = woundedNear(ctx, u, 340);
  if (hurt) {
    const dx = u.x - hurt.x, dy = u.y - hurt.y, d = Math.hypot(dx, dy) || 1;
    if (d > def.range * 0.85) {
      out.x = hurt.x + (dx / d) * def.range * 0.7;
      out.y = hurt.y + (dy / d) * def.range * 0.7;
      return true;
    }
  }
  const front = frontOf(ctx, u.owner, centre);
  if (!front) return false;
  const side = ((idx % 5) - 2) * 24;
  out.x = centre.x - front.x * HEALER_BEHIND - front.y * side;
  out.y = centre.y - front.y * HEALER_BEHIND + front.x * side;
  return true;
}

// Centre of a player's fighting units (not king, not healers); cached per tick.
function armyCentre(ctx, owner, fallback) {
  let c = ctx.centres[owner];
  if (c === undefined) {
    let x = 0, y = 0, n = 0;
    for (const o of ctx.world.units) {
      if (o.owner !== owner || o.hp <= 0 || o.kind === 'commander' || UNITS[o.kind].heal) continue;
      x += o.x; y += o.y; n++;
    }
    c = ctx.centres[owner] = n ? { x: x / n, y: y / n } : null;
  }
  return c || fallback;
}

// Unit vector from the army centre toward the nearest enemy (unit or building) within 600.
function frontOf(ctx, owner, centre) {
  if (ctx.fronts[owner] !== undefined) return ctx.fronts[owner];
  const e = nearestEnemy(ctx, centre.x, centre.y, 600, owner, true, true);
  let f = null;
  if (e) {
    const dx = e.x - centre.x, dy = e.y - centre.y, d = Math.hypot(dx, dy) || 1;
    f = { x: dx / d, y: dy / d };
  }
  return (ctx.fronts[owner] = f);
}

function woundedNear(ctx, u, radius) {
  let best = null, most = 4;
  queryGrid(ctx.grid, u.x, u.y, radius, (o) => {
    if (o.owner !== u.owner || o === u || o.hp <= 0) return;
    const missing = o.maxHp - o.hp;
    if (missing > most && Math.hypot(o.x - u.x, o.y - u.y) <= radius) { most = missing; best = o; }
  });
  return best;
}

// Healers mend the most wounded friendly unit in reach.
function heal(ctx, u, def) {
  let best = null, bestMissing = 4;
  queryGrid(ctx.grid, u.x, u.y, def.range, (o) => {
    if (o.owner !== u.owner || o === u || o.hp <= 0) return;
    const missing = o.maxHp - o.hp;
    if (missing > bestMissing && Math.hypot(o.x - u.x, o.y - u.y) <= def.range) { bestMissing = missing; best = o; }
  });
  if (!best) { u.cd = 0.25; return; }
  u.cd = def.cd;
  u.atkAt = ctx.world.time;
  best.hp = Math.min(best.maxHp, best.hp + def.heal);
  ctx.world.events.push({ type: 'heal', x1: u.x, y1: u.y, x: best.x, y: best.y, owner: u.owner });
}

function slotOffset(i, out) {
  let ring = 0, cap = 7, idx = i;
  while (idx >= cap) { idx -= cap; ring++; cap = 7 + ring * 5; }
  const a = (idx / cap) * Math.PI * 2 + ring * 0.4;
  const r = 50 + ring * 30;
  out.x = Math.cos(a) * r;
  out.y = Math.sin(a) * r;
}

const _slot = { x: 0, y: 0 };
const _spot = { x: 0, y: 0 };
const _pos = { x: 0, y: 0 };

function updateUnits(ctx) {
  const world = ctx.world, dt = ctx.dt;
  const units = world.units;
  const slotCount = [];
  const n = units.length;
  for (let i = 0; i < n; i++) {
    const u = units[i];
    if (u.hp <= 0) continue;
    u.px = u.x;
    u.py = u.y;
    u.cd -= dt;
    const def = UNITS[u.kind];
    if (u.owner === NEUTRAL) { moveNeutral(ctx, u, def); continue; }
    const p = world.players[u.owner];
    let vx = 0, vy = 0;

    if (u.kind === 'commander') {
      vx = p.input.mx * def.speed;
      vy = p.input.my * def.speed;
      if (vx !== 0 || vy !== 0) {
        const l = Math.hypot(vx, vy);
        p.facing.x = u.fx = vx / l;
        p.facing.y = u.fy = vy / l;
      }
      const t = nearestEnemy(ctx, u.x, u.y, def.range + def.radius, u.owner, true, true);
      if (t && u.cd <= 0) {
        u.cd = def.cd;
        u.atkAt = world.time;
        dealDamage(ctx, u, t, def.dmg);
      }
      u.targetId = t ? t.id : 0;
      const hq = ctx.byId.get(p.hqId);
      if (hq && u.hp < u.maxHp && world.time - u.hitAt > 3 &&
          Math.hypot(hq.x - u.x, hq.y - u.y) < WORLD.hqRegenRange) {
        u.hp = Math.min(u.maxHp, u.hp + WORLD.hqRegenPerSec * dt);
      }
    } else {
      const idx = slotCount[u.owner] || 0;
      slotCount[u.owner] = idx + 1;
      const cmd = ctx.byId.get(p.commanderId);
      const hq = ctx.byId.get(p.hqId);
      let anchor = cmd && cmd.hp > 0 && p.army === 'follow' ? cmd : hq;
      let spread = anchor === cmd ? 1 : 1.9;
      const attacking = p.army === 'attack';
      if (attacking) {
        const t = world.players[p.armyTarget];
        const enemyHq = t ? ctx.byId.get(t.hqId) : null;
        if (enemyHq) { anchor = enemyHq; spread = 1.7; }
      }
      slotOffset(idx, _slot);
      const sx = anchor.x + _slot.x * spread, sy = anchor.y + _slot.y * spread;
      const anchorDist = Math.hypot(anchor.x - u.x, anchor.y - u.y);

      if (attacking) {
        u.ret = false; // marching out: fight whatever is in the way, then keep going
      } else if (u.ret) {
        if (anchorDist < 180) u.ret = false;
      } else if (anchorDist > WORLD.leashRange) {
        u.ret = true;
        u.targetId = 0;
      }

      let target = null;
      let gx = sx, gy = sy; // where to stand when not fighting
      if (def.heal) {
        if (u.cd <= 0) heal(ctx, u, def);
        if (!u.ret && healerSpot(ctx, u, def, anchor, idx, _spot)) { gx = _spot.x; gy = _spot.y; }
      } else if (!u.ret) {
        const air = canHitAir(u.kind);
        target = u.targetId ? ctx.byId.get(u.targetId) : null;
        if (target && (target.hp <= 0 || (!air && UNITS[target.kind] && UNITS[target.kind].flying))) target = null;
        if (!target || (world.tick + u.id) % 4 === 0) {
          target = nearestEnemy(ctx, u.x, u.y, WORLD.aggroRange, u.owner, true, air);
        }
        u.targetId = target ? target.id : 0;
      }

      if (target) {
        const dx = target.x - u.x, dy = target.y - u.y;
        const d = Math.hypot(dx, dy) || 0.001;
        u.fx = dx / d;
        u.fy = dy / d;
        if (d - def.radius - radiusOf(target) <= def.range) {
          if (u.cd <= 0) attack(ctx, u, def, target);
        } else {
          vx = (dx / d) * def.speed;
          vy = (dy / d) * def.speed;
        }
      } else {
        const dx = gx - u.x, dy = gy - u.y;
        const d = Math.hypot(dx, dy);
        if (d > 3) {
          const sp = Math.min(FOLLOW_SPEED, d * 5);
          vx = (dx / d) * sp;
          vy = (dy / d) * sp;
          u.fx = dx / d;
          u.fy = dy / d;
        }
      }
    }

    if (u.kind === 'commander') {
      // Kings are not shoved by units (they still push others aside), so the client can predict them exactly.
      moveKing(u, p.input.mx, p.input.my, p.boost ? WORLD.boost : 1, dt, world.buildings, world.size);
      continue;
    }

    // Separation: push overlapping units apart.
    let ox = 0, oy = 0;
    const r = def.radius;
    queryGrid(ctx.grid, u.x, u.y, r + 16, (o) => {
      if (o === u || o.hp <= 0) return;
      const minD = r + UNITS[o.kind].radius + 2;
      let dx = u.x - o.x, dy = u.y - o.y;
      let d = Math.hypot(dx, dy);
      if (d >= minD) return;
      if (d < 0.01) {
        const a = (u.id - o.id) * 2.399;
        dx = Math.cos(a); dy = Math.sin(a); d = 1;
      }
      const push = (minD - d) / minD;
      ox += (dx / d) * push;
      oy += (dy / d) * push;
    });
    const sepK = u.kind === 'commander' ? 30 : 150;
    let nx = u.x + (vx + ox * sepK) * dt;
    let ny = u.y + (vy + oy * sepK) * dt;

    // Buildings are solid (unless you fly).
    if (!def.flying) {
      pushOutOfBuildings(world.buildings, nx, ny, r, _pos);
      nx = _pos.x;
      ny = _pos.y;
    }

    const max = world.size - r;
    u.x = nx < r ? r : nx > max ? max : nx;
    u.y = ny < r ? r : ny > max ? max : ny;
  }
}

function updateBuildings(ctx) {
  const world = ctx.world;
  for (const b of world.buildings) {
    const def = BUILDINGS[b.kind];
    if (!def.dmg || b.hp <= 0) continue;
    b.cd -= ctx.dt;
    if (b.cd > 0) continue;
    const t = nearestEnemy(ctx, b.x, b.y, def.range, b.owner, false);
    if (t) {
      b.cd = def.cd;
      dealDamage(ctx, b, t, def.dmg);
    }
  }
}

function collectCrystals(ctx) {
  const world = ctx.world;
  const cs = world.crystals;
  for (let i = cs.length - 1; i >= 0; i--) {
    const c = cs[i];
    let taker = null;
    queryGrid(ctx.grid, c.x, c.y, WORLD.pickupRadius, (u) => {
      if (taker || u.hp <= 0 || u.owner === NEUTRAL) return;
      if (Math.hypot(u.x - c.x, u.y - c.y) <= WORLD.pickupRadius) taker = u;
    });
    if (!taker) continue;
    const p = world.players[taker.owner];
    p.gold += c.value;
    p.score += 10;
    if (p.life) p.life.crystals++;
    world.events.push({ type: 'collect', x: c.x, y: c.y, owner: p.id, value: c.value });
    cs[i] = cs[cs.length - 1];
    cs.pop();
  }
}

function cleanup(ctx) {
  const world = ctx.world;
  // A destroyed HQ takes the whole player down with it.
  for (const b of world.buildings) {
    if (b.kind !== 'hq' || b.hp > 0) continue;
    const loser = world.players[b.owner];
    if (!loser.alive) continue;
    loser.alive = false;
    loser.respawnIn = WORLD.botRespawn;
    loser.queue.length = 0;
    loser.commanderId = 0;
    if (world.shrine.owner === loser.id) world.shrine.owner = -1;
    const winner = world.players[b.hitBy];
    let bounty = 0;
    if (winner && winner !== loser && winner.alive) {
      bounty = WORLD.hqBounty + Math.floor(loser.gold / 2);
      winner.gold += bounty;
    }
    loser.lastScore = loser.score;
    loser.lastKiller = winner && winner !== loser ? winner.id : -1;
    const life = loser.life || {};
    world.events.push({
      type: 'eliminated', player: loser.id, by: winner ? winner.id : -1,
      bounty, score: Math.floor(loser.score), x: b.x, y: b.y,
      // the summary screen: how this life went, and what the next one starts with
      sum: {
        seconds: Math.round(world.time - loser.spawnedAt), kills: loser.kills, buildings: life.buildings || 0,
        caravans: life.caravans || 0, crystals: life.crystals || 0, peakArmy: life.peakArmy || 0,
        inherit: Math.min(WORLD.inheritMax, Math.floor(loser.score * WORLD.inheritShare)),
      },
    });
    // revenge: whoever swore it on the loser
    for (const p of world.players) {
      if (p.revenge !== loser.id) continue;
      if (p === winner) {
        p.gold += WORLD.revengeBonus;
        world.events.push({ type: 'revenge', phase: 'done', player: p.id, target: loser.id, gold: WORLD.revengeBonus });
      } else {
        world.events.push({ type: 'revenge', phase: 'lost', player: p.id, target: loser.id, by: winner ? winner.id : -1 });
      }
      p.revenge = -1;
    }
    if (loser.revenge >= 0) loser.revenge = -1;
    for (const u of world.units) if (u.owner === loser.id) u.hp = 0;
    for (const o of world.buildings) if (o.owner === loser.id) o.hp = 0;
  }

  let w = 0;
  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (u.hp > 0) { world.units[w++] = u; continue; }
    world.events.push({ type: 'death', x: u.x, y: u.y, kind: u.kind, owner: u.owner });
    if (u.kind === 'commander') {
      const p = world.players[u.owner];
      if (p.commanderId === u.id) {
        p.commanderId = 0;
        p.commanderRespawn = WORLD.commanderRespawn;
        p.input.mx = p.input.my = 0;
      }
    }
  }
  world.units.length = w;

  w = 0;
  for (let i = 0; i < world.buildings.length; i++) {
    const b = world.buildings[i];
    if (b.hp > 0) { world.buildings[w++] = b; continue; }
    world.events.push({ type: 'death', x: b.x, y: b.y, kind: b.kind, owner: b.owner });
  }
  world.buildings.length = w;
}
