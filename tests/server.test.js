import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../src/server/room.js';
import { UNIT_STRIDE, UNIT_KINDS, PROTOCOL } from '../src/net/protocol.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const findKing = (w, id) => w.units.find((u) => u.id === w.players[id].commanderId);
const fakeClient = (game, hello) => {
  const inbox = [];
  const c = game.join((m) => inbox.push(JSON.parse(JSON.stringify(m))), { v: PROTOCOL, ...hello });
  const snaps = () => inbox.filter((m) => m.t === 's');
  const king = () => {
    const s = snaps().at(-1), id = inbox[0].id;
    for (let i = 0; i < s.u.length; i += UNIT_STRIDE) {
      if (s.u[i + 1] === id && UNIT_KINDS[s.u[i + 2]] === 'commander') return { x: s.u[i + 3], y: s.u[i + 4] };
    }
    return null;
  };
  return { c, inbox, snaps, king };
};

test('two players share one world, move, and leave cleanly', async () => {
  const game = createRoom({ adminKey: 'geheim' });
  const a = fakeClient(game, { name: '<b>Anna</b>' });
  const b = fakeClient(game, { name: 'Bram', key: 'geheim' });
  assert.equal(a.inbox[0].t, 'init');
  assert.notEqual(a.inbox[0].id, b.inbox[0].id);
  assert.equal(a.inbox[0].admin, false);
  assert.equal(b.inbox[0].admin, true);

  await wait(500);
  assert.ok(a.snaps().length >= 4, `snapshots ${a.snaps().length}`);
  const names = a.snaps().at(-1).p.filter((p) => !p[5]).map((p) => p[1]);
  assert.ok(names.includes('bAnnab') && names.includes('Bram'), names.join());
  assert.equal(names.length, 6, 'bots fill the world up to six players');

  // input moves only your own king
  const before = a.king(), otherBefore = b.king();
  for (let i = 1; i <= 18; i++) { game.receive(a.c, { t: 'in', s: i, x: 1, y: 0 }); await wait(33); }
  await wait(400);
  assert.equal(a.snaps().at(-1).you.ack, 18, 'every input is acknowledged');
  assert.ok(a.king().x - before.x > 60, `moved ${a.king().x - before.x}`);
  assert.ok(Math.abs(b.king().x - otherBefore.x) < 1);

  // hostile or broken messages are ignored
  const gold = a.snaps().at(-1).you.gold;
  game.receive(a.c, { t: 'cmd', c: { type: 'cheat' } });
  game.receive(a.c, { t: 'cmd', c: { type: 'train', kind: { evil: 1 } } });
  game.receive(a.c, { t: 'cmd', c: { type: 'explode' } });
  game.receive(a.c, { t: 'in', x: 'nee', y: null });
  game.receive(a.c, null);
  game.receive(b.c, { t: 'cmd', c: { type: 'cheat' } }); // b is admin
  const goldB = b.snaps().at(-1).you.gold;
  await wait(200);
  assert.ok(a.snaps().at(-1).you.gold - gold < 50);
  assert.ok(b.snaps().at(-1).you.gold - goldB >= 1000);

  // a snapshot stays small
  const bytes = JSON.stringify(a.snaps().at(-1)).length;
  assert.ok(bytes < 12000, `snapshot ${bytes} bytes`);

  game.leave(a.c);
  await wait(200);
  const left = b.snaps().at(-1).p.find((p) => p[0] === a.inbox[0].id);
  assert.ok(left[5] === 1 || left[1] !== 'bAnnab', 'seat is free or already reused by a bot');
  game.leave(b.c);
  assert.equal(game.room.timer, null, 'world pauses when nobody is online');
});

test('room codes are cleaned and stance reaches the simulation', async () => {
  const { cleanRoom } = await import('../src/net/protocol.js');
  assert.equal(cleanRoom(' vrienden-42! '), 'VRIENDEN');
  assert.equal(cleanRoom('ab c1'), 'ABC1');
  assert.equal(cleanRoom(undefined), '');
  const game = createRoom({ code: 'ABC1' });
  const a = fakeClient(game, { name: 'Anna' });
  assert.equal(a.inbox[0].room, 'ABC1');
  game.receive(a.c, { t: 'cmd', c: { type: 'stance' } });
  await wait(250);
  const s = a.snaps().at(-1);
  assert.equal(s.you.hold, 1);
  assert.deepEqual(s.you.army, ['hold', -1]);
  assert.deepEqual(s.sh, [-1, -1, 0]);
  game.leave(a.c);
});

test('the input queue is bounded and stale or broken inputs are ignored', async (t) => {
  const game = createRoom({});
  const a = fakeClient(game, { name: 'Anna' });
  t.after(() => game.leave(a.c)); // never leave a world ticking, even when an assert fails
  for (let i = 1; i <= 50; i++) game.receive(a.c, { t: 'in', s: i, x: 1, y: 0 });
  assert.ok(a.c.inputs.length <= 10);
  game.receive(a.c, { t: 'in', s: 3, x: 0, y: 1 });       // older than what we have
  game.receive(a.c, { t: 'in', s: 1.5, x: 0, y: 1 });     // not an integer
  game.receive(a.c, { t: 'in', s: 99, x: 'x', y: 1 });    // not a number
  assert.ok(a.c.inputs.every((i) => i.y === 0));
  game.receive(a.c, { t: 'cmd', c: { type: 'order', order: 'center' } }); // not an admin
  await wait(150);
  assert.equal(game.room.world.botOrder, null);
});

test('late inputs are caught up exactly, but never faster than real time', async (t) => {
  const game = createRoom({});
  const a = fakeClient(game, { name: 'Anna' });
  t.after(() => game.leave(a.c));
  await wait(300);
  const start = a.snaps().at(-1).you;
  // 10 inputs arrive in one burst after a 300 ms silence: all are used, none twice
  for (let i = 1; i <= 10; i++) game.receive(a.c, { t: 'in', s: i, x: 1, y: 0 });
  await wait(600);
  const you = a.snaps().at(-1).you;
  assert.equal(you.ack, 10);
  const moved = you.kx - start.kx;
  assert.ok(Math.abs(moved - 10 * 190 / 30) < 1, `moved ${moved}, expected ${10 * 190 / 30}`);
  // a flood of inputs cannot buy extra speed: no debt, so one input per tick
  const before = a.snaps().at(-1).you;
  for (let i = 11; i <= 400; i++) game.receive(a.c, { t: 'in', s: i, x: 1, y: 0 });
  await wait(300);
  const after = a.snaps().at(-1).you;
  // ~9 ticks passed; at most 8 more may be owed from the pause before. 390 would be cheating.
  const steps = (after.kx - before.kx) / (190 / 30);
  assert.ok(steps <= 9 + 8 + 3, `walked ${steps.toFixed(1)} steps`);
});

test('pages without a version still play but never see neutral units; other versions reload', async (t) => {
  const game = createRoom({ adminKey: 'k' });
  const oldInbox = [];
  const old = game.join((m) => oldInbox.push(JSON.parse(JSON.stringify(m))), { name: 'Oud' }); // a page from before versions
  t.after(() => game.leave(old));
  assert.ok(old, 'still let in');
  const admin = fakeClient(game, { name: 'Baas', key: 'k' });
  t.after(() => game.leave(admin.c));
  game.receive(admin.c, { t: 'cmd', c: { type: 'caravan' } });
  game.room.world.caravanTimer = 0;
  await wait(400);
  const w = game.room.world;
  assert.ok(w.caravan, 'a caravan is out');
  // bring the caravan into the old page's view, and force a minimap round
  const oldKing = findKing(w, old.playerId);
  oldKing.x = w.caravan.x + 100; oldKing.y = w.caravan.y;
  await wait(1200);
  const snaps = oldInbox.filter((m) => m.t === 's');
  for (const s of snaps) {
    for (let i = 0; i < s.u.length; i += UNIT_STRIDE) assert.ok(s.u[i + 1] >= 0, 'no neutral unit sent');
    if (s.m) for (let i = 0; i < s.m.length; i += 3) assert.ok(s.m[i] >= 0, 'no neutral minimap dot');
    for (const e of s.e || []) assert.ok(!(e.owner < 0) && e.type !== 'caravan', 'no neutral event');
  }
  assert.ok(admin.snaps().some((s) => s.cv), 'a current page does get the caravan');
  const inbox = [];
  assert.equal(game.join((m) => inbox.push(m), { v: 1, name: 'Ander' }), null);
  assert.equal(inbox[0].t, 'old');
});

test('online: the summary, inheritance, revenge choice and crown reach the player', async (t) => {
  const game = createRoom({});
  const a = fakeClient(game, { name: 'Anna' }), b = fakeClient(game, { name: 'Bram' });
  t.after(() => { game.leave(a.c); game.leave(b.c); });
  await wait(200);
  const w = game.room.world;
  const pa = w.players[a.c.playerId], pb = w.players[b.c.playerId];
  pa.score = 2000;
  await wait(150);
  assert.equal(a.snaps().at(-1).ld, pa.id, 'the crown is in the snapshot');
  const hq = w.buildings.find((x) => x.id === pa.hqId);
  hq.hp = 0; hq.hitBy = pb.id;
  await wait(200);
  const ev = a.snaps().flatMap((s) => s.e || []).find((e) => e.type === 'eliminated' && e.player === pa.id);
  assert.ok(ev && ev.sum && ev.sum.inherit === 200, 'summary with inheritance');
  game.receive(a.c, { t: 'cmd', c: { type: 'respawn', revenge: true } });
  await wait(200);
  const you = a.snaps().at(-1).you;
  assert.equal(you.rv, pb.id);
  assert.equal(you.inh, 200);
});

test('online: buying a specialisation goes through and shows on the units', async (t) => {
  const { spawnBuilding, spawnUnit } = await import('../src/sim/index.js');
  const { F_SPEC_A, F_SPEC_B } = await import('../src/net/protocol.js');
  const game = createRoom({});
  const a = fakeClient(game, { name: 'Smid' });
  t.after(() => game.leave(a.c));
  await wait(150);
  const w = game.room.world, p = w.players[a.c.playerId];
  const hq = w.buildings.find((x) => x.id === p.hqId);
  spawnBuilding(w, p.id, 'forge', hq.x + 120, hq.y + 160);
  p.gold = 1000;
  game.receive(a.c, { t: 'cmd', c: { type: 'spec', kind: 'soldier', choice: 'b' } });
  game.receive(a.c, { t: 'cmd', c: { type: 'spec', kind: 'soldier', choice: 'x' } });       // not a side
  game.receive(a.c, { t: 'cmd', c: { type: 'spec', kind: 'commander', choice: 'a' } });     // not a troop you can specialise
  await wait(250);
  const s = a.snaps().at(-1);
  assert.deepEqual(s.you.sp, { soldier: 'shield' });
  let seen = 0;
  for (let i = 0; i < s.u.length; i += UNIT_STRIDE) {
    if (s.u[i + 1] === p.id && UNIT_KINDS[s.u[i + 2]] === 'soldier') {
      assert.ok(s.u[i + 6] & F_SPEC_B && !(s.u[i + 6] & F_SPEC_A), 'soldier carries the B flag');
      seen++;
    }
  }
  assert.ok(seen > 0, 'the starting soldiers are in view');
});
