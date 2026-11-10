// Online session: keeps a local mirror of the server's world in the same shape the
// renderer and HUD already understand, and smooths movement between snapshots.

import { UNITS, BUILDINGS, WORLD, pushOutOfBuildings } from '../sim/index.js';
import {
  UNIT_KINDS, BUILDING_KINDS, UNIT_STRIDE, BUILDING_STRIDE, CRYSTAL_STRIDE,
  F_ATTACK, F_HIT, F_LEFT, F_RIGHT,
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
  const sentIn = { x: 0, y: 0, at: 0 };
  const want = { x: 0, y: 0 };
  const pred = { x: 0, y: 0, valid: false };

  const send = (msg) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg)); };

  ws.onopen = () => send({ t: 'join', name, key, room });
  ws.onclose = () => { net.closed = true; onClose(net.ready ? 'lost' : net.full ? 'full' : 'unreachable'); };
  ws.onerror = () => {};
  ws.onmessage = (ev) => {
    net.bytes += ev.data.length;
    const msg = JSON.parse(ev.data);
    if (msg.t === 's') snapshot(msg);
    else if (msg.t === 'init') { net.room = msg.room; myId = msg.id; world.size = msg.size; interval = 1 / msg.snapHz; net.admin = msg.admin; }
    else if (msg.t === 'full') net.full = true;
  };

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
    me.hold = !!msg.you.hold;
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

    // my own king: trust the server, but only pull the predicted position toward it
    const king = me.commanderId ? units.get(me.commanderId) : null;
    if (!king) pred.valid = false;
    else {
      const dx = king.sx - pred.x, dy = king.sy - pred.y;
      if (!pred.valid || dx * dx + dy * dy > 170 * 170) { pred.x = king.sx; pred.y = king.sy; pred.valid = true; }
      else {
        const pull = want.x === 0 && want.y === 0 ? 0.35 : 0.1;
        pred.x += dx * pull; pred.y += dy * pull;
      }
    }

    if (!net.ready) { net.ready = true; onReady(net); }
  }

  net.setInput = (x, y) => {
    const len = Math.hypot(x, y);
    if (len > 1) { x /= len; y /= len; }
    want.x = x; want.y = y;
    const now = performance.now();
    const changed = Math.abs(x - sentIn.x) + Math.abs(y - sentIn.y) > 0.04;
    if ((changed && now - sentIn.at > 45) || now - sentIn.at > 400 || (changed && x === 0 && y === 0)) {
      sentIn.x = x; sentIn.y = y; sentIn.at = now;
      send({ t: 'in', x: +x.toFixed(3), y: +y.toFixed(3) });
    }
  };

  net.command = (cmd) => send({ t: 'cmd', c: { type: cmd.type, kind: cmd.kind } });

  // Called every animation frame. Returns how far we are between the last two snapshots.
  net.frame = (dt) => {
    world.time += dt;
    const me = net.me;
    const king = me && me.commanderId ? units.get(me.commanderId) : null;
    if (king && pred.valid) {
      const speed = UNITS.commander.speed, r = UNITS.commander.radius;
      pred.x = Math.min(world.size - r, Math.max(r, pred.x + want.x * speed * dt));
      pred.y = Math.min(world.size - r, Math.max(r, pred.y + want.y * speed * dt));
      pushOutOfBuildings(world.buildings, pred.x, pred.y, r, pred); // same walls as the server
      king.x = king.px = pred.x;
      king.y = king.py = pred.y;
      if (want.x < -0.15) king.fx = -1; else if (want.x > 0.15) king.fx = 1;
    }
    return lastSnapAt ? Math.min(1, (performance.now() - lastSnapAt) / 1000 / interval) : 1;
  };

  net.takeEvents = () => { const e = pending; pending = []; return e; };
  net.close = () => { ws.onclose = null; ws.close(); net.closed = true; };
  return net;
}
