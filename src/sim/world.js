// World state: plain data plus the functions that create and mutate it.
// No DOM, no wall clock, no Math.random — safe to run on a server.

import { WORLD, UNITS, BUILDINGS, CARAVAN } from './config.js';
import { rand, randRange } from './rng.js';

export function createWorld({ seed = 1, size = WORLD.size, cheats = false } = {}) {
  const world = {
    seed,
    cheats, // local play only; a server leaves this off
    rngState: seed | 0,
    tick: 0,
    time: 0,
    size,
    nextId: 1,
    players: [],
    units: [],
    buildings: [],
    crystals: [],
    events: [],
    crystalTimer: 0,
    // King-of-the-hill objective: stand on it alone with your king to claim it.
    botOrder: null, // admin order for all bots: { order, target, by }
    leader: -1,     // who wears the crown (highest score), see updateCrown()
    caravan: null,  // the gold caravan while one is on the map (see caravan.js)
    caravanTimer: CARAVAN.first,
    shrine: { x: size / 2, y: size / 2, r: WORLD.shrineRadius, owner: -1, contender: -1, progress: 0 },
  };
  for (let i = 0; i < WORLD.crystalCount; i++) spawnCrystal(world);
  return world;
}

export function spawnCrystal(world) {
  const s = world.size, m = 120;
  // Averaging two samples biases crystals toward the centre, where players meet.
  const pick = () => (rand(world) < 0.55 ? (rand(world) + rand(world)) / 2 : rand(world));
  const c = {
    id: world.nextId++,
    x: m + pick() * (s - 2 * m),
    y: m + pick() * (s - 2 * m),
    value: WORLD.crystalValue,
  };
  world.crystals.push(c);
  return c;
}

export function addPlayer(world, { name = 'Speler', isBot = false, difficulty = 'normal' } = {}) {
  // A seat left by someone who disconnected is reused, so ids stay small and stable.
  let seat = world.players.findIndex((p) => p.left);
  if (seat < 0) seat = world.players.length;
  const player = {
    id: seat,
    name,
    isBot,
    difficulty,
    alive: false,
    lastScore: 0,     // score of the previous life: the inheritance is based on it
    inherited: 0,     // extra gold this life started with
    lastKiller: -1,   // who flattened our castle last time
    revenge: -1,      // a player we swore revenge on this life (-1 = none)
    life: null,       // counters for the summary screen, see newLife()
    army: 'follow',  // 'follow' the king, 'hold' at the castle, or 'attack' armyTarget's castle
    armyTarget: -1,
    boost: false, // admin: king walks WORLD.boost times as fast
    left: false,
    admin: false,
    gold: 0,
    score: 0,
    kills: 0,
    lives: 0,
    input: { mx: 0, my: 0 },
    facing: { x: 0, y: 1 },
    commands: [],
    queue: [],
    commanderId: 0,
    hqId: 0,
    respawnIn: 0,
    commanderRespawn: 0,
    hqHitAt: -999,
    spawnedAt: 0,
    shieldUntil: 0,
    notice: null,
    bot: isBot ? { think: 0, goal: 'gather', tx: 0, ty: 0, targetPlayer: -1 } : null,
  };
  world.players[seat] = player;
  resetPlayer(world, player);
  return player;
}

// Fresh start: new spot far from everyone else, starting gold, HQ, commander, a few soldiers.
export function resetPlayer(world, player) {
  const spot = findSpawn(world);
  player.alive = true;
  player.inherited = Math.min(WORLD.inheritMax, Math.floor(player.lastScore * WORLD.inheritShare));
  player.gold = WORLD.startGold + player.inherited;
  player.life = { kills: 0, buildings: 0, caravans: 0, crystals: 0, peakArmy: 0 };
  player.revenge = -1;
  player.score = 0;
  player.kills = 0;
  player.lives += 1;
  player.spawnedAt = world.time;
  player.shieldUntil = world.time + WORLD.spawnGrace;
  player.input.mx = 0;
  player.input.my = 0;
  player.commands.length = 0;
  player.queue.length = 0;
  player.respawnIn = 0;
  player.commanderRespawn = 0;
  player.hqHitAt = -999;
  player.notice = null;
  player.army = 'follow';
  player.armyTarget = -1;
  if (player.bot) player.bot = { think: 0, goal: 'gather', tx: spot.x, ty: spot.y, targetPlayer: -1 };
  const hq = spawnBuilding(world, player.id, 'hq', spot.x, spot.y);
  player.hqId = hq.id;
  spawnBuilding(world, player.id, 'mine', spot.x - 100, spot.y - 20); // free first mine
  const cmd = spawnUnit(world, player.id, 'commander', spot.x, spot.y + 90);
  player.commanderId = cmd.id;
  for (let i = 0; i < WORLD.startSoldiers; i++) {
    const a = (i / WORLD.startSoldiers) * Math.PI * 2;
    spawnUnit(world, player.id, 'soldier', spot.x + Math.cos(a) * 80, spot.y + 90 + Math.sin(a) * 40);
  }
  return player;
}

function findSpawn(world) {
  const m = 450, s = world.size;
  let best = null, bestD = -1;
  for (let i = 0; i < 40; i++) {
    const x = randRange(world, m, s - m), y = randRange(world, m, s - m);
    let d = Math.hypot(s / 2 - x, s / 2 - y) - 500; // not on top of the Kristalhart either
    for (const b of world.buildings) {
      const dd = Math.hypot(b.x - x, b.y - y);
      if (dd < d) d = dd;
    }
    if (d > bestD) { bestD = d; best = { x, y }; }
  }
  return best;
}

// Someone disconnected (or a bot is retired): everything they own disappears.
export function removePlayer(world, playerId) {
  const p = world.players[playerId];
  if (!p || p.left) return;
  p.left = true;
  p.alive = false;
  if (world.shrine.owner === playerId) world.shrine.owner = -1;
  // an order from an admin who left, or aimed at someone who left, stops with them
  const ord = world.botOrder;
  if (ord && (ord.by === playerId || ord.target === playerId)) world.botOrder = null;
  p.commanderId = 0;
  p.commands.length = 0;
  p.queue.length = 0;
  for (const u of world.units) if (u.owner === playerId) u.hp = 0;
  for (const b of world.buildings) if (b.owner === playerId) b.hp = 0;
}

// Buildings are solid: move (x, y) out of any building a body of radius r overlaps.
// Shared by the simulation and by the online client's prediction of its own king,
// so both agree exactly on where the walls are. Writes the result into `out`.
export function pushOutOfBuildings(buildings, x, y, r, out) {
  for (let j = 0; j < buildings.length; j++) {
    const b = buildings[j];
    const minD = BUILDINGS[b.kind].radius + r;
    let dx = x - b.x, dy = y - b.y;
    if (dx > minD || dx < -minD || dy > minD || dy < -minD) continue;
    let d = Math.hypot(dx, dy);
    if (d >= minD) continue;
    if (d < 0.01) { dx = 0; dy = 1; d = 1; }
    x = b.x + (dx / d) * minD;
    y = b.y + (dy / d) * minD;
  }
  out.x = x;
  out.y = y;
  return out;
}

// One step of king movement. Used by the simulation and, unchanged, by the online client
// to predict its own king — any difference between the two shows up as rubber banding.
// The king is deliberately not shoved by other units, so this is all there is to it.
export function moveKing(pos, mx, my, mult, dt, buildings, size) {
  const r = UNITS.commander.radius;
  const speed = UNITS.commander.speed * mult;
  pushOutOfBuildings(buildings, pos.x + mx * speed * dt, pos.y + my * speed * dt, r, pos);
  const max = size - r;
  pos.x = pos.x < r ? r : pos.x > max ? max : pos.x;
  pos.y = pos.y < r ? r : pos.y > max ? max : pos.y;
  return pos;
}

export function spawnUnit(world, owner, kind, x, y) {
  const def = UNITS[kind];
  const u = {
    id: world.nextId++,
    owner, kind, x, y, px: x, py: y,
    hp: def.hp, maxHp: def.hp,
    cd: 0, targetId: 0, fx: 0, fy: 1, hitAt: -999, atkAt: -999,
  };
  world.units.push(u);
  return u;
}

export function spawnBuilding(world, owner, kind, x, y) {
  const def = BUILDINGS[kind];
  const b = {
    id: world.nextId++,
    owner, kind, x, y,
    hp: def.hp, maxHp: def.hp,
    cd: 0, train: null, hitAt: -999,
  };
  world.buildings.push(b);
  return b;
}

export function queueCommand(world, playerId, cmd) {
  const p = world.players[playerId];
  if (p && cmd && typeof cmd.type === 'string' && p.commands.length < 64) p.commands.push(cmd);
}

export function setInput(world, playerId, mx, my) {
  const p = world.players[playerId];
  if (!p) return;
  const len = Math.hypot(mx, my);
  if (!(len > 0.001)) { p.input.mx = 0; p.input.my = 0; return; }
  const k = len > 1 ? 1 / len : 1;
  p.input.mx = mx * k;
  p.input.my = my * k;
}

export function playerStats(world, playerId) {
  const st = { supply: 0, cap: WORLD.baseSupply, income: 0, army: 0, power: 0, mines: 0, barracks: 0, towers: 0, academy: 0 };
  for (const b of world.buildings) {
    if (b.owner !== playerId) continue;
    const def = BUILDINGS[b.kind];
    st.income += def.income || 0;
    st.cap += def.supply || 0;
    if (b.kind === 'mine') st.mines++;
    else if (b.kind === 'barracks') st.barracks++;
    else if (b.kind === 'tower') st.towers++;
    else if (b.kind === 'academy') st.academy++;
    if (b.train) st.supply += UNITS[b.train.kind].supply;
  }
  for (const u of world.units) {
    if (u.owner !== playerId) continue;
    const def = UNITS[u.kind];
    st.supply += def.supply;
    if (u.kind !== 'commander') st.army++;
    st.power += u.kind === 'commander' ? 90 * (u.hp / u.maxHp) : def.cost * (0.5 + 0.5 * u.hp / u.maxHp);
  }
  const p = world.players[playerId];
  if (p) for (const k of p.queue) st.supply += UNITS[k].supply;
  if (st.cap > WORLD.maxSupply) st.cap = WORLD.maxSupply;
  return st;
}

export function buildingCost(kind, stats) {
  const def = BUILDINGS[kind];
  return def.cost + (kind === 'mine' ? (def.costStep || 0) * stats.mines : 0);
}

export function findById(list, id) {
  for (let i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
  return null;
}
