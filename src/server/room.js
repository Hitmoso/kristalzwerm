// One shared world. The server is the only authority: clients send input and commands,
// and get back a snapshot of what is near their king.

import {
  createWorld, addPlayer, removePlayer, queueCommand, setInput, playerStats, step, findById,
  DT, UNITS, BOT_NAMES,
} from '../sim/index.js';
import {
  UNIT_KINDS, BUILDING_KINDS, SNAPSHOT_EVERY, MINIMAP_EVERY, VIEW_HALF_W, VIEW_HALF_H,
  F_ATTACK, F_HIT, F_LEFT, F_RIGHT, cleanName,
} from '../net/protocol.js';

const MAX_HUMANS = 10;
const TARGET_PLAYERS = 6;   // bots fill the world up to this many players
const MIN_BOTS = 2;
const BOT_LEVELS = ['normal', 'easy', 'hard', 'normal', 'easy', 'normal'];
const COMMANDS = { build: 1, train: 1, respawn: 1, cheat: 1, stance: 1, boost: 1, order: 1 };
const ORDERS = { center: 1, attack: 1, home: 1, free: 1 };
const INPUT_QUEUE = 6;   // inputs buffered per client; older ones are dropped
const INPUT_GRACE = 8;   // ticks to keep walking when inputs stop arriving (hidden tab, hiccup)
const GLOBAL_EVENTS = { eliminated: 1, spawned: 1, cheat: 1, captured: 1, stance: 1, boost: 1, order: 1 };

export function createRoom({ adminKey = '', code = '', log = () => {} } = {}) {
  const room = { world: null, clients: new Set(), timer: null, snapCount: 0 };

  const humans = () => room.clients.size;
  const bots = () => room.world.players.filter((p) => p.isBot && !p.left);

  function fresh() {
    room.world = createWorld({ seed: (Date.now() & 0x7fffffff) || 1 });
    room.snapCount = 0;
  }

  // Keep the world lively with few people and roomy with many.
  function balanceBots() {
    const want = Math.max(MIN_BOTS, TARGET_PLAYERS - humans());
    let list = bots();
    while (list.length < want) {
      const n = room.world.players.filter((p) => p.isBot).length;
      addPlayer(room.world, { name: BOT_NAMES[n % BOT_NAMES.length], isBot: true, difficulty: BOT_LEVELS[n % BOT_LEVELS.length] });
      list = bots();
    }
    while (list.length > want) {
      list.sort((a, b) => a.score - b.score);
      removePlayer(room.world, list[0].id);
      list = bots();
    }
  }

  function start() {
    if (room.timer) return;
    fresh();
    let last = performance.now(), acc = 0;
    room.timer = setInterval(() => {
      const now = performance.now();
      acc += (now - last) / 1000;
      last = now;
      if (acc > 0.25) acc = 0.25;
      while (acc >= DT) { tick(); acc -= DT; }
    }, 1000 / 60);
    log('wereld gestart');
  }

  function stop() {
    clearInterval(room.timer);
    room.timer = null;
    room.world = null;
    log('niemand meer online: wereld gepauzeerd');
  }

  function tick() {
    const world = room.world;
    // Exactly one input per client per tick: the client predicted it as one tick of
    // movement, so applying it as one tick here keeps both in lockstep.
    for (const c of room.clients) {
      const inp = c.inputs.shift();
      if (inp) {
        setInput(world, c.playerId, inp.x, inp.y);
        c.ack = inp.s;
        c.idle = 0;
      } else if (++c.idle === INPUT_GRACE) {
        setInput(world, c.playerId, 0, 0);
      }
    }
    step(world, DT);
    for (const c of room.clients) {
      for (const e of world.events) {
        if (GLOBAL_EVENTS[e.type] || near(c, e.x ?? e.x1, e.y ?? e.y1, 200)) {
          if (c.events.length < 400) c.events.push(e);
        }
      }
    }
    if (world.tick % SNAPSHOT_EVERY === 0) {
      room.snapCount++;
      const mini = room.snapCount % MINIMAP_EVERY === 0 ? miniDots(world) : null;
      const shared = sharedPart(world);
      for (const c of room.clients) sendSnapshot(c, world, shared, mini);
    }
  }

  function near(c, x, y, margin) {
    return x !== undefined && Math.abs(x - c.vx) < VIEW_HALF_W + margin && Math.abs(y - c.vy) < VIEW_HALF_H + margin;
  }

  // Buildings, crystals and the player list are the same for everyone.
  function sharedPart(world) {
    const b = [];
    for (const x of world.buildings) {
      b.push(x.id, x.owner, BUILDING_KINDS.indexOf(x.kind), Math.round(x.x), Math.round(x.y), Math.ceil(x.hp),
        world.time - x.hitAt < 0.12 ? F_HIT : 0,
        x.train ? UNIT_KINDS.indexOf(x.train.kind) : -1,
        x.train ? Math.round((1 - x.train.left / x.train.total) * 100) : 0);
    }
    const c = [];
    let sig = world.crystals.length;
    for (const x of world.crystals) { c.push(x.id, Math.round(x.x), Math.round(x.y)); sig = (sig * 31 + x.id) | 0; }
    const p = world.players.map((x) => [x.id, x.name, Math.floor(x.score), x.alive ? 1 : 0, +x.shieldUntil.toFixed(2), x.left ? 1 : 0, +x.hqHitAt.toFixed(2), x.commanderId, x.hqId]);
    return { b, c, p, sig };
  }

  function miniDots(world) {
    const m = [];
    for (const u of world.units) if (u.kind !== 'commander') m.push(u.owner, u.x >> 3, u.y >> 3);
    return m;
  }

  function sendSnapshot(c, world, shared, mini) {
    const me = world.players[c.playerId];
    const king = me.commanderId ? findById(world.units, me.commanderId) : null;
    const hq = king ? null : findById(world.buildings, me.hqId);
    if (king) { c.vx = king.x; c.vy = king.y; } else if (hq) { c.vx = hq.x; c.vy = hq.y; }

    const u = [];
    for (const x of world.units) {
      // Every king is always sent (minimap, name tags); other units only when in view.
      if (x.kind !== 'commander' && !near(c, x.x, x.y, 0)) continue;
      let flags = 0;
      if (world.time - x.atkAt < 0.25) flags |= F_ATTACK;
      if (world.time - x.hitAt < 0.12) flags |= F_HIT;
      if (x.fx < -0.15) flags |= F_LEFT; else if (x.fx > 0.15) flags |= F_RIGHT;
      u.push(x.id, x.owner, UNIT_KINDS.indexOf(x.kind), Math.round(x.x * 10) / 10, Math.round(x.y * 10) / 10, Math.ceil(x.hp), flags);
    }
    const st = playerStats(world, me.id);
    const msg = {
      t: 's',
      time: +world.time.toFixed(3),
      you: {
        gold: Math.floor(me.gold), q: me.queue.length, cresp: +me.commanderRespawn.toFixed(1),
        spawned: +me.spawnedAt.toFixed(2), notice: me.notice, st, hold: me.hold ? 1 : 0,
        ack: c.ack, boost: me.boost ? 1 : 0, kx: king ? king.x : 0, ky: king ? king.y : 0,
      },
      p: shared.p, b: shared.b, u,
      sh: [world.shrine.owner, world.shrine.contender, Math.round(world.shrine.progress * 100)],
      bo: world.botOrder ? [world.botOrder.order, world.botOrder.target] : null,
    };
    // Crystals only change when one is picked up or appears: send the list just then.
    if (c.crystalSig !== shared.sig) { c.crystalSig = shared.sig; msg.c = shared.c; }
    if (mini) msg.m = mini;
    if (c.events.length) { msg.e = c.events; c.events = []; }
    c.send(msg);
  }

  // ---- connection handling ----
  function join(send, hello) {
    if (humans() >= MAX_HUMANS) { send({ t: 'full' }); return null; }
    start();
    const name = cleanName(hello?.name);
    const player = addPlayer(room.world, { name });
    player.admin = !!adminKey && hello?.key === adminKey;
    const c = { send, playerId: player.id, events: [], crystalSig: NaN, inputs: [], ack: 0, lastIn: 0, idle: 0, vx: 0, vy: 0, cmdCount: 0, cmdWindow: 0 };
    room.clients.add(c);
    balanceBots();
    send({ t: 'init', room: code, id: player.id, size: room.world.size, snapHz: 30 / SNAPSHOT_EVERY, admin: player.admin });
    log(`${name} doet mee (${humans()} online)`);
    return c;
  }

  function leave(c) {
    if (!room.clients.delete(c)) return;
    const p = room.world.players[c.playerId];
    log(`${p.name} is weg (${humans()} online)`);
    removePlayer(room.world, c.playerId);
    if (humans() === 0) stop();
    else balanceBots();
  }

  // Everything a client sends is checked here; the simulation checks the rest.
  function receive(c, msg) {
    if (!room.world || !msg || typeof msg !== 'object') return;
    if (msg.t === 'in') {
      const x = Number(msg.x), y = Number(msg.y), s = msg.s;
      if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isSafeInteger(s) || s <= c.lastIn) return;
      c.lastIn = s;
      if (c.inputs.length >= INPUT_QUEUE) c.inputs.shift(); // running ahead: drop the oldest
      c.inputs.push({ s, x, y });
    } else if (msg.t === 'cmd') {
      const now = Date.now();
      if (now - c.cmdWindow > 1000) { c.cmdWindow = now; c.cmdCount = 0; }
      if (++c.cmdCount > 40) return; // nobody presses keys this fast
      const type = msg.c?.type, kind = msg.c?.kind;
      if (!COMMANDS[type]) return;
      if (kind !== undefined && typeof kind !== 'string') return;
      if (kind && !UNITS[kind] && !BUILDING_KINDS.includes(kind)) return;
      if (type === 'order') {
        const order = msg.c.order, target = msg.c.target;
        if (!ORDERS[order] || (target !== undefined && !Number.isSafeInteger(target))) return;
        queueCommand(room.world, c.playerId, { type, order, target });
        return;
      }
      queueCommand(room.world, c.playerId, { type, kind });
    }
  }

  return { join, leave, receive, room, humans };
}
