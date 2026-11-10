import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRoom } from '../src/server/room.js';
import { UNIT_STRIDE, UNIT_KINDS } from '../src/net/protocol.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const fakeClient = (game, hello) => {
  const inbox = [];
  const c = game.join((m) => inbox.push(JSON.parse(JSON.stringify(m))), hello);
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
  game.receive(a.c, { t: 'in', x: 1, y: 0 });
  await wait(600);
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
  assert.deepEqual(s.sh, [-1, -1, 0]);
  game.leave(a.c);
});
