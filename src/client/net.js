// Online session: keeps a local mirror of the server's world in the same shape the
// renderer and HUD already understand, and smooths movement between snapshots.
//
// Your own king is predicted, not waited for. Every simulation tick the client turns the
// stick into a numbered input, sends it, and applies it locally with the same moveKing()
// the server uses. The server applies exactly one input per tick and reports the last one
// it used ("ack") plus where the king ended up. On each snapshot we start from that
// position and replay the inputs the server has not used yet. Any leftover difference is
// faded out over ~100 ms instead of snapping, so the king never yanks back.

import { UNITS, BUILDINGS, WORLD, DT, moveKing, SPECS, SPEC_DEFS } from '../sim/index.js';
import {
  UNIT_KINDS, BUILDING_KINDS, UNIT_STRIDE, BUILDING_STRIDE, CRYSTAL_STRIDE,
  F_ATTACK, F_HIT, F_LEFT, F_RIGHT, F_SPEC_A, F_SPEC_B, F_SLOW, F_BURN, PROTOCOL,
} from '../net/protocol.js';

export function connect({ name, key, room, onReady, onClose }) {
  const url = `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
  const ws = new WebSocket(url);
  const world = { size: WORLD.size, time: 0, tick: 0, players: [], units: [], buildings: [], crystals: [], events: [], mini: null,
    shrine: { x: WORLD.size / 2, y: WORLD.size / 2, r: WORLD.shrineRadius, owner: -1, contender: -1, progress: 0 } };
  const units = new Map(), buildings = new Map();
  const net = { world, me: null, ready: false, closed: false, full: false, bytes: 0, snaps: 0 };
  let myId = -1, seq = 0;
  let lastSnapAt = 0, interval = 1 / 15;
  let pending = [];
  const want = { x: 0, y: 0 };
  const pred = { x: 0, y: 0, px: 0, py: 0, valid: false, kingId: 0 }; // current and previous tick
  const offset = { x: 0, y: 0 };    // visual correction still being faded out
  const replay = { x: 0, y: 0 };
  let inputs = [];                  // sent but not yet acknowledged: { s, x, y, m }
  let inSeq = 0, acc = 0;

  const send = (msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

  ws.onopen = () => send({ t: 'join', v: PROTOCOL, name, key, room });
  ws.onclose = () => { net.closed = true; onClose(net.ready ? 'lost' : net.full ? 'full' : 'unreachable'); };
  ws.onerror = () => {};
  ws.onmessage = (ev) => {
    net.bytes += ev.data.length;
    const msg = JSON.parse(ev.data);
    if (msg.t === 's') snapshot(msg);
    else if (msg.t === 'init') { net.room = msg.room; myId = msg.id; world.size = msg.size; interval = 1 / msg.snapHz; net.admin = msg.admin; }
    else if (msg.t === 'full') net.full = true;
    else if (msg.t === 'old') reloadForNewVersion();
  };

  // The server runs a newer version than this page: fetch the new page (once per minute at most,
  // so a half-finished deploy can never cause a reload loop).
  function reloadForNewVersion() {
    let last = 0;
    try { last = Number(sessionStorage.getItem('kz-reloaded')) || 0; } catch { /* private window */ }
    if (Date.now() - last < 60000) return;
    try { sessionStorage.setItem('kz-reloaded', String(Date.now())); } catch { /* private window */ }
    net.reloading = true;
    location.reload();
  }

  function player(id) {
    return world.players[id] || (world.players[id] = {
      id, name: '', score: 0, alive: false, left: true, shieldUntil: 0, hqHitAt: -999, commanderId: 0, hqId: 0,
      gold: 0, queue: [], notice: null, spawnedAt: 0, commanderRespawn: 0, stats: null,
    });
  }

  function snapshot(msg) {
    const now = performance.now();
    const shown = lastSnapAt ? Math.min(1, (now - lastSnapAt) / 1000 / interval) : 1;
    if (lastSnapAt) interval += (Math.min(0.3, Math.max(0.03, (now - lastSnapAt) / 1000)) - interval) * 0.1;
    lastSnapAt = now;
    net.snaps++;
    seq++;
    world.time = msg.time;
    world.tick++;

    for (const row of msg.p) {
      const p = player(row[0]);
      p.name = row[1]; p.score = row[2]; p.alive = !!row[3]; p.shieldUntil = row[4]; p.left = !!row[5];
      p.hqHitAt = row[6]; p.commanderId = row[7]; p.hqId = row[8];
    }
    const me = player(myId);
    me.gold = msg.you.gold;
    me.queue.length = msg.you.q;
    me.commanderRespawn = msg.you.cresp;
    me.spawnedAt = msg.you.spawned;
    me.notice = msg.you.notice;
    me.army = msg.you.army ? msg.you.army[0] : msg.you.hold ? 'hold' : 'follow';
    me.armyTarget = msg.you.army ? msg.you.army[1] : -1;
    me.boost = !!msg.you.boost;
    me.revenge = msg.you.rv ?? -1;
    me.specs = msg.you.sp || {};
    me.inherited = msg.you.inh || 0;
    world.leader = msg.ld ?? -1;
    net.botOrder = world.botOrder = msg.bo ? { order: msg.bo[0], target: msg.bo[1] } : null;
    world.caravan = msg.cv ? { x: msg.cv[0], y: msg.cv[1], ex: msg.cv[2], ey: msg.cv[3], state: msg.cv[4] === 1 ? 'rolling' : 'looted' } : null;
    const sh = world.shrine;
    sh.x = sh.y = world.size / 2;
    sh.owner = msg.sh[0]; sh.contender = msg.sh[1]; sh.progress = msg.sh[2] / 100;
    me.stats = msg.you.st;
    net.me = me;

    // units: glide from where each one is drawn right now to its new position
    const u = msg.u;
    world.units.length = 0;
    for (let i = 0; i < u.length; i += UNIT_STRIDE) {
      const id = u[i], x = u[i + 3], y = u[i + 4], flags = u[i + 6];
      let o = units.get(id);
      if (!o) {
        const kind = UNIT_KINDS[u[i + 2]];
        if (!UNITS[kind]) continue; // a unit this (older) page does not know yet
        o = { id, owner: u[i + 1], kind, x, y, px: x, py: y, sx: x, sy: y, hp: 0, maxHp: UNITS[kind].hp, fx: 1, fy: 0, atkAt: -999, hitAt: -999, seen: 0 };
        units.set(id, o);
      } else if (Math.abs(x - o.x) + Math.abs(y - o.y) > 400) {
        o.px = x; o.py = y;
      } else {
        o.px += (o.x - o.px) * shown;
        o.py += (o.y - o.py) * shown;
      }
      o.x = o.sx = x; o.y = o.sy = y;
      o.hp = u[i + 5];
      if (flags & F_LEFT) o.fx = -1; else if (flags & F_RIGHT) o.fx = 1;
      if (flags & F_ATTACK) { if (world.time - o.atkAt > 0.3) o.atkAt = world.time; }
      if (flags & F_HIT) o.hitAt = world.time;
      // specialisation (look and max health) and lasting effects
      const side = flags & F_SPEC_A ? 'a' : flags & F_SPEC_B ? 'b' : null;
      const spec = side && SPECS[o.kind] ? SPECS[o.kind][side].id : null;
      if (spec !== (o.spec || null)) { o.spec = spec; o.maxHp = spec ? SPEC_DEFS[o.kind][spec].hp : UNITS[o.kind].hp; }
      o.slowUntil = flags & F_SLOW ? world.time + 0.3 : 0;
      o.burnUntil = flags & F_BURN ? world.time + 0.3 : 0;
      o.seen = seq;
      world.units.push(o);
    }
    for (const [id, o] of units) if (o.seen !== seq) units.delete(id);

    const b = msg.b;
    world.buildings.length = 0;
    for (let i = 0; i < b.length; i += BUILDING_STRIDE) {
      const id = b[i];
      let o = buildings.get(id);
      if (!o) {
        const kind = BUILDING_KINDS[b[i + 2]];
        if (!BUILDINGS[kind]) continue;
        o = { id, owner: b[i + 1], kind, x: b[i + 3], y: b[i + 4], hp: 0, maxHp: BUILDINGS[kind].hp, hitAt: -999, train: null, seen: 0 };
        buildings.set(id, o);
      }
      o.hp = b[i + 5];
      if (b[i + 6] & F_HIT) o.hitAt = world.time;
      o.train = b[i + 7] >= 0 ? { kind: UNIT_KINDS[b[i + 7]], left: 1 - b[i + 8] / 100, total: 1 } : null;
      o.seen = seq;
      world.buildings.push(o);
    }
    for (const [id, o] of buildings) if (o.seen !== seq) buildings.delete(id);

    const c = msg.c; // only present when the set of crystals changed
    if (c) {
      world.crystals.length = 0;
      for (let i = 0; i < c.length; i += CRYSTAL_STRIDE) world.crystals.push({ id: c[i], x: c[i + 1], y: c[i + 2], value: WORLD.crystalValue });
    }

    if (msg.m) world.mini = msg.m;
    if (msg.e) for (const e of msg.e) pending.push(e);

    // my own king: server position + the inputs it has not seen yet
    const king = me.commanderId ? units.get(me.commanderId) : null;
    if (!king) { pred.valid = false; inputs = []; }
    else {
      while (inputs.length && inputs[0].s <= msg.you.ack) inputs.shift();
      replay.x = msg.you.kx; replay.y = msg.you.ky;
      for (const i of inputs) moveKing(replay, i.x, i.y, i.m, DT, world.buildings, world.size);
      const dx = replay.x - pred.x, dy = replay.y - pred.y;
      if (!pred.valid || pred.kingId !== king.id || dx * dx + dy * dy > 150 * 150) {
        // new king, respawn or a real teleport: just go there
        pred.x = pred.px = replay.x; pred.y = pred.py = replay.y;
        offset.x = offset.y = 0;
        pred.valid = true; pred.kingId = king.id;
      } else if (dx !== 0 || dy !== 0) {
        // shift the simulation, keep the picture where it was, and fade the difference out
        pred.x += dx; pred.y += dy; pred.px += dx; pred.py += dy;
        offset.x -= dx; offset.y -= dy;
      }
      net.lastCorrection = Math.hypot(dx, dy);
    }

    if (!net.ready) { net.ready = true; onReady(net); }
  }

  // Same rounding and normalising the server will apply, so prediction matches it exactly.
  net.setInput = (x, y) => {
    x = +x.toFixed(3); y = +y.toFixed(3);
    const len = Math.hypot(x, y);
    if (!(len > 0.001)) { want.x = 0; want.y = 0; return; }
    const k = len > 1 ? 1 / len : 1;
    want.x = x * k; want.y = y * k;
  };

  net.command = (cmd) => send({ t: 'cmd', c: { type: cmd.type, kind: cmd.kind, order: cmd.order, mode: cmd.mode, target: cmd.target, revenge: cmd.revenge, choice: cmd.choice } });

  // Called every animation frame. Returns how far we are between the last two snapshots.
  net.frame = (dt) => {
    world.time += dt;
    const me = net.me;
    const king = me && me.commanderId ? units.get(me.commanderId) : null;
    if (king && pred.valid) {
      // one input per simulation tick, exactly like the server consumes them
      acc += dt;
      let n = 0;
      while (acc >= DT && n < 5) {
        const inp = { s: ++inSeq, x: want.x, y: want.y, m: me.boost ? WORLD.boost : 1 };
        send({ t: 'in', s: inp.s, x: inp.x, y: inp.y });
        inputs.push(inp);
        if (inputs.length > 120) inputs.shift();
        pred.px = pred.x; pred.py = pred.y;
        moveKing(pred, inp.x, inp.y, inp.m, DT, world.buildings, world.size);
        acc -= DT;
        n++;
      }
      if (acc > DT) acc = 0;
      const a = acc / DT, fade = Math.exp(-dt / 0.1);
      offset.x *= fade; offset.y *= fade;
      king.x = king.px = pred.px + (pred.x - pred.px) * a + offset.x;
      king.y = king.py = pred.py + (pred.y - pred.py) * a + offset.y;
      if (want.x < -0.15) king.fx = -1; else if (want.x > 0.15) king.fx = 1;
    } else {
      acc = 0;
    }
    return lastSnapAt ? Math.min(1, (performance.now() - lastSnapAt) / 1000 / interval) : 1;
  };

  net.takeEvents = () => { const e = pending; pending = []; return e; };
  net.close = () => { ws.onclose = null; ws.close(); net.closed = true; };
  return net;
}
