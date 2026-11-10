import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, addPlayer, queueCommand, setInput, playerStats, step, findById, spawnUnit,
  DT, WORLD, UNITS,
} from '../src/sim/index.js';

const run = (world, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) step(world); };
const duo = () => {
  const world = createWorld({ seed: 11 });
  world.crystals.length = 0;
  world.crystalTimer = -1e9;
  const a = addPlayer(world, { name: 'A' });
  const b = addPlayer(world, { name: 'B' });
  return { world, a, b };
};
const finite = (world) => world.units.every((u) => Number.isFinite(u.x) && Number.isFinite(u.y));

test('commander moves at 190/s and stays inside the arena', () => {
  const { world, a } = duo();
  const c = findById(world.units, a.commanderId);
  c.x = 2500; c.y = 2500;
  for (const u of world.units) if (u.owner === a.id && u !== c) { u.x = 2500; u.y = 2700; }
  setInput(world, a.id, 1, 0);
  run(world, 1);
  assert.ok(Math.abs(c.x - 2690) < 8, `x ${c.x}`);
  run(world, 30);
  assert.ok(c.x <= world.size - UNITS.commander.radius + 0.001);
});

test('stacked units do not produce NaN', () => {
  const { world, a } = duo();
  for (let i = 0; i < 20; i++) spawnUnit(world, a.id, 'soldier', 1000, 1000);
  run(world, 2);
  assert.ok(finite(world));
});

test('the swarm follows the commander', () => {
  const { world, a } = duo();
  const c = findById(world.units, a.commanderId);
  setInput(world, a.id, 0.7, 0.7);
  run(world, 4);
  setInput(world, a.id, 0, 0);
  run(world, 2);
  for (const u of world.units) {
    if (u.owner !== a.id || u === c) continue;
    assert.ok(Math.hypot(u.x - c.x, u.y - c.y) < 120);
  }
});

test('armies that meet fight, and kills are credited', () => {
  const { world, a, b } = duo();
  for (let i = 0; i < 10; i++) {
    spawnUnit(world, a.id, 'soldier', 2400 + i, 2500);
    spawnUnit(world, b.id, 'soldier', 2520 + i, 2500 + i);
  }
  const ca = findById(world.units, a.commanderId), cb = findById(world.units, b.commanderId);
  ca.x = 2380; ca.y = 2500; cb.x = 2560; cb.y = 2500;
  run(world, 12);
  assert.ok(a.kills + b.kills > 5, `kills ${a.kills + b.kills}`);
  assert.ok(a.score + b.score > 0);
  assert.ok(finite(world));
});

test('a dead commander returns at the HQ after 6 seconds', () => {
  const { world, a } = duo();
  const c = findById(world.units, a.commanderId);
  c.hp = 0;
  step(world);
  assert.equal(a.commanderId, 0);
  assert.ok(a.alive);
  run(world, 5);
  assert.equal(a.commanderId, 0);
  run(world, 1.2);
  const again = findById(world.units, a.commanderId);
  const hq = findById(world.buildings, a.hqId);
  assert.ok(again && Math.hypot(again.x - hq.x, again.y - hq.y) < 150);
});

test('losing the HQ eliminates the player and pays the winner', () => {
  const { world, a, b } = duo();
  a.gold = 400;
  const hq = findById(world.buildings, a.hqId);
  hq.hp = 0;
  hq.hitBy = b.id;
  const goldBefore = b.gold;
  step(world);
  assert.equal(a.alive, false);
  assert.equal(world.units.filter((u) => u.owner === a.id).length, 0);
  assert.equal(world.buildings.filter((x) => x.owner === a.id).length, 0);
  assert.ok(world.events.some((e) => e.type === 'eliminated' && e.player === a.id && e.by === b.id));
  assert.ok(b.gold - goldBefore >= WORLD.hqBounty + 200);

  // A human stays down until they ask to respawn; commands while dead cost nothing.
  queueCommand(world, a.id, { type: 'train', kind: 'soldier' });
  run(world, 8);
  assert.equal(a.alive, false);
  queueCommand(world, a.id, { type: 'respawn' });
  step(world);
  assert.equal(a.alive, true);
  assert.equal(a.gold, WORLD.startGold);
  assert.equal(playerStats(world, a.id).army, WORLD.startSoldiers);
});

test('bots respawn on their own', () => {
  const world = createWorld({ seed: 3 });
  const bot = addPlayer(world, { isBot: true });
  findById(world.buildings, bot.hqId).hp = 0;
  step(world);
  assert.equal(bot.alive, false);
  run(world, WORLD.botRespawn + 0.5);
  assert.equal(bot.alive, true);
  assert.equal(bot.lives, 2);
});

test('picking up a crystal gives 35 gold', () => {
  const { world, a } = duo();
  const c = findById(world.units, a.commanderId);
  world.crystals.push({ id: 99999, x: c.x + 5, y: c.y, value: WORLD.crystalValue });
  const before = a.gold;
  step(world);
  assert.equal(world.crystals.length, 0);
  assert.ok(a.gold - before >= 35);
});

test('a spawn shield keeps buildings from taking damage', () => {
  const { world, a, b } = duo();
  const hqA = findById(world.buildings, a.hqId);
  b.shieldUntil = 0; // only A is protected
  for (let i = 0; i < 12; i++) spawnUnit(world, b.id, 'giant', hqA.x + 120 + i, hqA.y - 150);
  const cb = findById(world.units, b.commanderId);
  cb.x = hqA.x + 150; cb.y = hqA.y - 150;
  run(world, 6);
  assert.equal(hqA.hp, hqA.maxHp);
  assert.ok(world.buildings.filter((x) => x.owner === a.id).every((x) => x.hp === x.maxHp));
  assert.ok(a.shieldUntil > world.time);
});

test('attacking a base ends your own shield', () => {
  const { world, a, b } = duo();
  const hqB = findById(world.buildings, b.hqId);
  b.shieldUntil = 0;
  const ca = findById(world.units, a.commanderId);
  ca.x = hqB.x + 80; ca.y = hqB.y + 230;
  for (let i = 0; i < 14; i++) spawnUnit(world, a.id, 'giant', hqB.x + 80 + i, hqB.y + 200);
  run(world, 12);
  assert.ok(hqB.hp < hqB.maxHp || !b.alive);
  assert.ok(a.shieldUntil <= world.time);
});

// Two commanders far apart, no escorts: a clean stage for single-unit tests.
const stage = () => {
  const { world, a, b } = duo();
  const ca = findById(world.units, a.commanderId), cb = findById(world.units, b.commanderId);
  for (const u of world.units) if (u !== ca && u !== cb) u.hp = 0;
  ca.x = 2000; ca.y = 3000; cb.x = 5000; cb.y = 5000;
  step(world);
  return { world, a, b, ca, cb };
};

test('a mage fireball damages every enemy near the target', () => {
  const { world, a, b, ca } = stage();
  spawnUnit(world, a.id, 'mage', 2000, 3050);
  const victims = [0, 1, 2].map((i) => spawnUnit(world, b.id, 'giant', 2190 + i * 14, 3050 + i * 12));
  for (const v of victims) v.ret = true; // stand still and soak
  ca.x = 1750; // keep the commander's own shots out of it
  run(world, 2.5);
  assert.ok(victims.every((v) => v.hp < v.maxHp), 'all three were hit');
});

test('a healer restores a wounded ally and never attacks', () => {
  const { world, a, b, ca } = stage();
  const healer = spawnUnit(world, a.id, 'healer', ca.x + 30, ca.y);
  const friend = spawnUnit(world, a.id, 'giant', ca.x + 60, ca.y);
  friend.hp = 100;
  let healed = false;
  for (let i = 0; i < 60; i++) { step(world); if (world.events.some((e) => e.type === 'heal')) healed = true; }
  assert.ok(healed);
  assert.ok(friend.hp > 100);
  assert.ok(healer.atkAt > 0);
  assert.equal(a.kills, 0);
});

test('a knight opens with one charge', () => {
  const { world, a, ca, cb } = stage();
  spawnUnit(world, a.id, 'knight', 2000, 3060);
  const dummy = cb; // the enemy commander stands still and takes it
  dummy.x = 2040; dummy.y = 3060;
  ca.x = 1780; // own commander out of range, knight still inside its leash
  let charges = 0;
  for (let i = 0; i < 45; i++) { step(world); charges += world.events.filter((e) => e.type === 'charge').length; }
  assert.equal(charges, 1);
  assert.ok(dummy.maxHp - dummy.hp >= UNITS.knight.dmg * UNITS.knight.charge);
});

test('dragons fly over buildings, soldiers do not', () => {
  const { world, a } = duo();
  const hq = findById(world.buildings, a.hqId);
  const d = spawnUnit(world, a.id, 'dragon', hq.x, hq.y);
  const s = spawnUnit(world, a.id, 'soldier', hq.x + 1, hq.y);
  step(world);
  assert.ok(Math.hypot(s.x - hq.x, s.y - hq.y) >= 46, 'soldier is pushed out');
  assert.ok(Math.hypot(d.x - hq.x, d.y - hq.y) < 46, 'dragon is not');
});

test('a lone king claims the Kristalhart and is paid for holding it', () => {
  const { world, a, ca } = stage();
  const sh = world.shrine;
  ca.x = sh.x; ca.y = sh.y;
  run(world, WORLD.shrineCapture - 0.5);
  assert.equal(sh.owner, -1);
  run(world, 1);
  assert.equal(sh.owner, a.id);
  const gold = a.gold;
  ca.x = sh.x + 900; // walking away keeps it
  run(world, 10);
  assert.equal(sh.owner, a.id);
  assert.ok(a.gold - gold > 10 * (WORLD.shrineIncome + 4), `earned ${a.gold - gold}`);
});

test('two kings on the Kristalhart block each other', () => {
  const { world, ca, cb } = stage();
  const sh = world.shrine;
  ca.x = sh.x - 100; ca.y = sh.y; cb.x = sh.x + 100; cb.y = sh.y;
  ca.hp = cb.hp = 1e6; // they will shoot each other; keep both alive
  run(world, 8);
  assert.equal(sh.owner, -1);
});

test('hold stance keeps the army at the castle', () => {
  const { world, a } = duo();
  const c = findById(world.units, a.commanderId), hq = findById(world.buildings, a.hqId);
  queueCommand(world, a.id, { type: 'stance' });
  setInput(world, a.id, hq.x > 3250 ? -1 : 1, 0);
  run(world, 5);
  assert.equal(a.hold, true);
  assert.ok(Math.abs(c.x - hq.x) > 700);
  for (const u of world.units) {
    if (u.owner === a.id && u !== c) assert.ok(Math.hypot(u.x - hq.x, u.y - hq.y) < 260);
  }
  queueCommand(world, a.id, { type: 'stance' });
  setInput(world, a.id, 0, 0);
  run(world, 8);
  for (const u of world.units) {
    if (u.owner === a.id && u !== c) assert.ok(Math.hypot(u.x - c.x, u.y - c.y) < 160);
  }
});

test('admin boost makes the king 3.5 times as fast, and only for admins', () => {
  const { world, a, ca } = stage();
  setInput(world, a.id, 1, 0);
  queueCommand(world, a.id, { type: 'boost' });
  let x = ca.x; run(world, 1);
  assert.ok(Math.abs(ca.x - x - 190) < 8, 'no admin, no boost');
  a.admin = true;
  queueCommand(world, a.id, { type: 'boost' });
  step(world);
  x = ca.x; run(world, 1);
  assert.ok(Math.abs(ca.x - x - 190 * WORLD.boost) < 20, `moved ${ca.x - x}`);
});

test('bots obey an admin order and drop it when the target falls', () => {
  const world = createWorld({ seed: 21 });
  const me = addPlayer(world, { name: 'Ik' });
  const bots = [0, 1, 2].map(() => addPlayer(world, { isBot: true, difficulty: 'normal' }));
  queueCommand(world, bots[0].id, { type: 'order', order: 'center' });
  step(world);
  assert.equal(world.botOrder, null, 'only admins may order');
  me.admin = true;
  queueCommand(world, me.id, { type: 'order', order: 'attack', target: 99 });
  queueCommand(world, me.id, { type: 'order', order: 'dance' });
  step(world);
  assert.equal(world.botOrder, null, 'bad orders are ignored');
  queueCommand(world, me.id, { type: 'order', order: 'center' });
  run(world, 3);
  for (const b of bots) assert.equal(b.bot.goal, 'capture');
  queueCommand(world, me.id, { type: 'order', order: 'attack', target: bots[2].id });
  run(world, 3);
  assert.equal(bots[0].bot.goal, 'attack');
  assert.equal(bots[0].bot.targetPlayer, bots[2].id);
  assert.equal(bots[2].bot.goal, 'defend', 'the target defends itself');
  findById(world.buildings, bots[2].hqId).hp = 0;
  step(world);
  assert.equal(world.botOrder, null);
});
