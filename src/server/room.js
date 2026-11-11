// One shared world. The server is the only authority: clients send input and commands,
// and get back a snapshot of what is near their king.

import {
  createWorld, addPlayer, removePlayer, queueCommand, setInput, playerStats, step, findById, moveKing,
  DT, UNITS, WORLD, BOT_NAMES,
} from '../sim/index.js';
import {
  UNIT_KINDS, BUILDING_KINDS, SNAPSHOT_EVERY, MINIMAP_EVERY, VIEW_HALF_W, VIEW_HALF_H,
  F_ATTACK, F_HIT, F_LEFT, F_RIGHT, cleanName, PROTOCOL,
} from '../net/protocol.js';

const MAX_HUMANS = 10;
const TARGET_PLAYERS = 6;   // bots fill the world up to this many players
const MIN_BOTS = 2;
const BOT_LEVELS = ['normal', 'easy', 'hard', 'normal', 'easy', 'normal'];
const COMMANDS = { build: 1, train: 1, respawn: 1, cheat: 1, stance: 1, army: 1, boost: 1, order: 1, caravan: 1 };
const ARMY_MODES = { follow: 1, hold: 1, attack: 1 };
const ORDERS = { center: 1, attack: 1, home: 1, free: 1 };
const INPUT_QUEUE = 10;  // inputs buffered per client; older ones are dropped
const MAX_DEBT = 8;      // ticks of late input we are willing to catch up on
const GLOBAL_EVENTS = { eliminated: 1, spawned: 1, cheat: 1, captured: 1, army: 1, boost: 1, order: 1, caravan: 1 };

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
    // Late input is never guessed at: the king simply waits that tick, and the missed step
    // is made up later — at most one extra per tick, and only as many as were missed, so
    // sending inputs faster than real time gains nothing.
    for (const c of room.clients) {
      const inp = c.inputs.shift();
      if (!inp) {
        setInput(world, c.playerId, 0, 0);
        if (c.debt < MAX_DEBT) c.debt++;
        continue;
      }
      let last = inp;
      if (c.debt > 0 && c.inputs.length) {
        // catch up: apply this input now, the next one in this tick's step
        const p = world.players[c.playerId];
        const king = p.commanderId ? findById(world.units, p.commanderId) : null;
        if (king) {
          setInput(world, c.playerId, inp.x, inp.y); // same normalising as a regular input
          moveKing(king, p.input.mx, p.input.my, p.boost ? WORLD.boost : 1, DT, world.buildings, world.size);
        }
        last = c.inputs.shift();
        c.debt--;
      }
      setInput(world, c.playerId, last.x, last.y);
      c.ack = last.s;
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
      u.push(x.id, x.owner, UNIT_KINDS.indexOf(x.kind), Math.round(x.x), Math.round(x.y), Math.ceil(x.hp), flags);
    }
    const st = playerStats(world, me.id);
    const msg = {
      t: 's',
      time: +world.time.toFixed(3),
      you: {
        gold: Math.floor(me.gold), q: me.queue.length, cresp: +me.commanderRespawn.toFixed(1),
        spawned: +me.spawnedAt.toFixed(2), notice: me.notice, st, army: [me.army, me.armyTarget], hold: me.army === 'hold' ? 1 : 0,
        ack: c.ack, boost: me.boost ? 1 : 0, kx: king ? king.x : 0, ky: king ? king.y : 0,
      },
      p: shared.p, b: shared.b, u,
      sh: [world.shrine.owner, world.shrine.contender, Math.round(world.shrine.progress * 100)],
      bo: world.botOrder ? [world.botOrder.order, world.botOrder.target] : null,
      // the caravan is on everyone's minimap, wherever it is: x, y, end x, end y, state (1 rolling, 2 looted)
      cv: world.caravan ? [Math.round(world.caravan.x), Math.round(world.caravan.y), Math.round(world.caravan.ex), Math.round(world.caravan.ey), world.caravan.state === 'rolling' ? 1 : 2] : null,
    };
    // Crystals only change when one is picked up or appears: send the list just then.
    if (c.crystalSig !== shared.sig) { c.crystalSig = shared.sig; msg.c = shared.c; }
    if (mini) msg.m = mini;
    if (c.events.length) { msg.e = c.events; c.events = []; }
    c.send(msg);
  }

  // ---- connection handling ----
  function join(send, hello) {
    // A page from before the last deploy would misread what we send: turn it away so it reloads.
    if (hello?.v !== PROTOCOL) { send({ t: 'old', v: PROTOCOL }); return null; }
    if (humans() >= MAX_HUMANS) { send({ t: 'full' }); return null; }
    start();
    const name = cleanName(hello?.name);
    const player = addPlayer(room.world, { name });
    player.admin = !!adminKey && hello?.key === adminKey;
    const c = { send, playerId: player.id, events: [], crystalSig: NaN, inputs: [], ack: 0, lastIn: 0, debt: 0, vx: 0, vy: 0, cmdCount: 0, cmdWindow: 0 };
    room.clients.add(c);
    balanceBots();
    send({ t: 'init', v: PROTOCOL, room: code, id: player.id, size: room.world.size, snapHz: 30 / SNAPSHOT_EVERY, admin: player.admin });
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
      if (type === 'army') {
        const mode = msg.c.mode, target = msg.c.target;
        if (!ARMY_MODES[mode] || (target !== undefined && !Number.isSafeInteger(target))) return;
        queueCommand(room.world, c.playerId, { type, mode, target });
        return;
      }
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
