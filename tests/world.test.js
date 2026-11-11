import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, addPlayer, removePlayer, pushOutOfBuildings, BUILDINGS, UNITS, queueCommand, setInput, playerStats, step, findById, DT, WORLD,
} from '../src/sim/index.js';

const run = (world, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) step(world); };
const solo = (seed = 7) => {
  const world = createWorld({ seed });
  world.crystals.length = 0; // keep economy tests exact
  world.crystalTimer = -1e9;
  const me = addPlayer(world, { name: 'Ik' });
  return { world, me };
};

test('same seed gives identical worlds', () => {
  const make = () => {
    const w = createWorld({ seed: 42 });
    for (let i = 0; i < 4; i++) addPlayer(w, { isBot: true, difficulty: 'hard' });
    for (let i = 0; i < 600; i++) step(w);
    return JSON.stringify(w);
  };
  assert.equal(make(), make());
});

test('start state: HQ, commander, soldiers, gold', () => {
  const { world, me } = solo();
  assert.equal(me.gold, WORLD.startGold);
  assert.ok(findById(world.buildings, me.hqId));
  assert.ok(findById(world.units, me.commanderId));
  assert.equal(playerStats(world, me.id).army, WORLD.startSoldiers);
});

test('HQ pays 3 and the free mine 2 gold per second', () => {
  const { world, me } = solo();
  run(world, 10);
  assert.ok(Math.abs(me.gold - (WORLD.startGold + 50)) < 0.01, `gold ${me.gold}`);
});

test('a second mine costs 160 and raises income', () => {
  const { world, me } = solo();
  queueCommand(world, me.id, { type: 'build', kind: 'mine' });
  step(world);
  const st = playerStats(world, me.id);
  assert.equal(st.mines, 2);
  assert.equal(st.income, 7);
  assert.ok(me.gold < 141 && me.gold > 139);
});

test('build is refused without gold, on top of a building, or outside the arena', () => {
  const { world, me } = solo();
  me.gold = 50;
  queueCommand(world, me.id, { type: 'build', kind: 'mine' });
  step(world);
  assert.equal(world.buildings.length, 2);
  assert.equal(me.notice.code, 'gold');

  me.gold = 1000;
  const c = findById(world.units, me.commanderId);
  const hq = findById(world.buildings, me.hqId);
  queueCommand(world, me.id, { type: 'build', kind: 'mine', x: hq.x + 5, y: hq.y + 60 });
  step(world);
  assert.equal(world.buildings.length, 2);
  assert.equal(me.notice.code, 'blocked');

  c.x = 20; c.y = 20;
  me.facing.x = -1; me.facing.y = 0;
  queueCommand(world, me.id, { type: 'build', kind: 'tower' });
  step(world);
  assert.equal(world.buildings.length, 2);
  assert.equal(me.notice.code, 'edge');
  assert.ok(me.gold >= 1000);
});

test('training a soldier takes 2 seconds and costs 30', () => {
  const { world, me } = solo();
  queueCommand(world, me.id, { type: 'train', kind: 'soldier' });
  run(world, 1.5);
  assert.equal(playerStats(world, me.id).army, WORLD.startSoldiers);
  run(world, 0.8);
  assert.equal(playerStats(world, me.id).army, WORLD.startSoldiers + 1);
});

test('archers need a barracks', () => {
  const { world, me } = solo();
  queueCommand(world, me.id, { type: 'train', kind: 'archer' });
  step(world);
  assert.equal(me.queue.length, 0);
  assert.equal(me.notice.code, 'barracks');
  assert.ok(me.gold >= WORLD.startGold);
});

test('supply cap is respected', () => {
  const { world, me } = solo();
  me.gold = 10000;
  for (let i = 0; i < 30; i++) queueCommand(world, me.id, { type: 'train', kind: 'soldier' });
  run(world, 60);
  const st = playerStats(world, me.id);
  assert.equal(st.supply, WORLD.baseSupply);
  assert.equal(me.notice.code, 'supply');
});

test('junk commands are ignored', () => {
  const { world, me } = solo();
  const gold = me.gold;
  queueCommand(world, me.id, { type: 'explode' });
  queueCommand(world, me.id, { type: 'train', kind: 'commander' });
  queueCommand(world, me.id, { type: 'build', kind: 'hq' });
  queueCommand(world, me.id, null);
  queueCommand(world, 99, { type: 'train', kind: 'soldier' });
  step(world);
  assert.ok(me.gold >= gold);
  assert.equal(world.buildings.length, 2);
  assert.equal(world.units.length, 1 + WORLD.startSoldiers);
});

test('zero and oversized input vectors are safe', () => {
  const { world, me } = solo();
  setInput(world, me.id, 0, 0);
  assert.deepEqual(me.input, { mx: 0, my: 0 });
  setInput(world, me.id, NaN, 3);
  assert.deepEqual(me.input, { mx: 0, my: 0 });
  setInput(world, me.id, 30, 40);
  assert.ok(Math.abs(Math.hypot(me.input.mx, me.input.my) - 1) < 1e-9);
});

test('the secret gold command only works when cheats are on', () => {
  const { world, me } = solo();
  queueCommand(world, me.id, { type: 'cheat' });
  step(world);
  assert.ok(me.gold < WORLD.startGold + 1);

  const local = createWorld({ seed: 7, cheats: true });
  const p = addPlayer(local, { name: 'Ik' });
  queueCommand(local, p.id, { type: 'cheat' });
  step(local);
  assert.ok(p.gold >= WORLD.startGold + WORLD.cheatGold);
  assert.ok(local.events.some((e) => e.type === 'cheat' && e.player === p.id));
});

test('mages need an academy, which also adds supply', () => {
  const { world, me } = solo();
  me.gold = 2000;
  queueCommand(world, me.id, { type: 'train', kind: 'mage' });
  step(world);
  assert.equal(me.notice.code, 'academy');
  queueCommand(world, me.id, { type: 'build', kind: 'academy' });
  step(world);
  const st = playerStats(world, me.id);
  assert.equal(st.academy, 1);
  assert.equal(st.cap, WORLD.baseSupply + BUILDINGS.academy.supply);
  queueCommand(world, me.id, { type: 'train', kind: 'mage' });
  queueCommand(world, me.id, { type: 'train', kind: 'dragon' });
  step(world);
  assert.equal(me.queue.length + world.buildings.filter((b) => b.train).length, 2);
});

test('a player who leaves is wiped and the seat is reused', () => {
  const world = createWorld({ seed: 9 });
  const a = addPlayer(world, { name: 'A' });
  const b = addPlayer(world, { name: 'B' });
  removePlayer(world, a.id);
  queueCommand(world, a.id, { type: 'respawn' });
  for (let i = 0; i < 300; i++) step(world);
  assert.equal(a.alive, false);
  assert.equal(world.units.filter((u) => u.owner === a.id).length, 0);
  assert.equal(world.buildings.filter((x) => x.owner === a.id).length, 0);
  assert.ok(b.alive);
  const c = addPlayer(world, { name: 'C' });
  assert.equal(c.id, a.id);
  assert.equal(world.players.length, 2);
  step(world);
  assert.ok(c.alive && findById(world.buildings, c.hqId));
});

test('an admin may use the gold command on a server without cheats', () => {
  const { world, me } = solo();
  me.admin = true;
  queueCommand(world, me.id, { type: 'cheat' });
  step(world);
  assert.ok(me.gold >= WORLD.startGold + WORLD.cheatGold);
});

test('pushOutOfBuildings puts a body exactly on the wall and leaves free ones alone', () => {
  const hq = { kind: 'hq', x: 1000, y: 1000 };
  const r = UNITS.commander.radius, wall = BUILDINGS.hq.radius + r;
  const out = { x: 0, y: 0 };
  pushOutOfBuildings([hq], 1010, 1020, r, out);
  assert.ok(Math.abs(Math.hypot(out.x - 1000, out.y - 1000) - wall) < 1e-9);
  pushOutOfBuildings([hq], 1000, 1000, r, out); // dead centre: still a definite way out
  assert.ok(Math.abs(Math.hypot(out.x - 1000, out.y - 1000) - wall) < 1e-9);
  pushOutOfBuildings([hq], 1000 + wall + 5, 1000, r, out);
  assert.deepEqual(out, { x: 1000 + wall + 5, y: 1000 });
});
