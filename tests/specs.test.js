import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  createWorld, addPlayer, queueCommand, setInput, step, findById, spawnUnit, spawnBuilding, playerStats,
  DT, UNITS, SPECS, SPEC_DEFS, WORLD,
} from '../src/sim/index.js';

const run = (world, seconds) => { for (let i = 0; i < Math.round(seconds / DT); i++) step(world); };

// Two players, kings parked far away, no escorts: a clean arena in the middle of the map.
function arena(seed = 11) {
  const world = createWorld({ seed });
  world.crystals.length = 0;
  world.crystalTimer = -1e9;
  world.caravanTimer = 1e9;
  const a = addPlayer(world, { name: 'A' }), b = addPlayer(world, { name: 'B' });
  for (const p of [a, b]) p.shieldUntil = 0;
  const ka = findById(world.units, a.commanderId), kb = findById(world.units, b.commanderId);
  for (const u of world.units) if (u !== ka && u !== kb) u.hp = 0;
  step(world);
  return { world, a, b, ka, kb };
}
// Run while keeping some units nailed to the spot (a dummy would otherwise walk home).
function pinned(world, units, seconds) {
  const at = units.map((u) => [u.x, u.y]);
  for (let i = 0; i < Math.round(seconds / DT); i++) {
    step(world);
    units.forEach((u, j) => { u.x = u.px = at[j][0]; u.y = u.py = at[j][1]; });
  }
}
// Put a king next to his troops (so they are not called back), out of fighting range.
const park = (king, x, y) => { king.x = king.px = x; king.y = king.py = y; };
const forge = (world, p) => { const hq = findById(world.buildings, p.hqId); spawnBuilding(world, p.id, 'forge', hq.x + 120, hq.y + 160); };
const specialise = (world, p, kind, choice) => { p.gold += 1000; queueCommand(world, p.id, { type: 'spec', kind, choice }); step(world); };

test('every specialisation only uses numbers the game knows about', () => {
  const known = new Set(['hp', 'dmg', 'range', 'cd', 'speed', 'splash', 'buildingMult', 'airMult', 'charge',
    'bigMult', 'rangedResist', 'ballistaResist', 'chargeEvery', 'healTargets', 'aura', 'heal', 'slow', 'burn', 'burnDps']);
  for (const [kind, s] of Object.entries(SPECS)) {
    for (const side of ['a', 'b']) {
      const mods = s[side].mods;
      assert.ok(Object.keys(mods).length > 0, `${kind}/${side} changes something`);
      for (const k of Object.keys(mods)) assert.ok(known.has(k), `${kind}/${side}: unknown "${k}"`);
      assert.notEqual(s.a.id, s.b.id);
    }
  }
});

test('buying a specialisation needs a Smidse and gold, works once, and upgrades the troops you have', () => {
  const { world, a } = arena();
  const ka = findById(world.units, a.commanderId);
  const knights = [0, 1].map((i) => spawnUnit(world, a.id, 'knight', ka.x + 40 + i * 25, ka.y));
  knights[0].hp = 70; // half health
  a.gold = 1000;
  queueCommand(world, a.id, { type: 'spec', kind: 'knight', choice: 'a' });
  step(world);
  assert.equal(a.notice.code, 'forge');
  forge(world, a);
  queueCommand(world, a.id, { type: 'spec', kind: 'knight', choice: 'a' });
  step(world);
  assert.equal(a.specs.knight, 'heavy');
  assert.ok(a.gold <= 1000 - SPECS.knight.cost + 50);
  assert.equal(knights[0].spec, 'heavy');
  assert.equal(knights[0].maxHp, SPEC_DEFS.knight.heavy.hp);
  assert.ok(Math.abs(knights[0].hp - SPEC_DEFS.knight.heavy.hp / 2) < 1, 'kept its share of health');
  // once per troop type
  const gold = a.gold;
  queueCommand(world, a.id, { type: 'spec', kind: 'knight', choice: 'b' });
  step(world);
  assert.equal(a.specs.knight, 'heavy');
  assert.equal(a.notice.code, 'specDone');
  assert.ok(a.gold >= gold);
  // new troops are born specialised
  const fresh = spawnUnit(world, a.id, 'knight', ka.x, ka.y + 40);
  assert.equal(fresh.spec, 'heavy');
  assert.equal(fresh.hp, SPEC_DEFS.knight.heavy.hp);
  // junk is ignored
  queueCommand(world, a.id, { type: 'spec', kind: 'commander', choice: 'a' });
  queueCommand(world, a.id, { type: 'spec', kind: 'soldier', choice: 'c' });
  queueCommand(world, a.id, { type: 'spec', kind: 'caravan', choice: 'a' });
  step(world);
  assert.equal(Object.keys(a.specs).length, 1);
});

test('specialisations are lost with the castle', () => {
  const { world, a, b } = arena();
  forge(world, a);
  specialise(world, a, 'soldier', 'a');
  assert.equal(a.specs.soldier, 'spear');
  const hq = findById(world.buildings, a.hqId);
  hq.hp = 0; hq.hitBy = b.id;
  step(world);
  queueCommand(world, a.id, { type: 'respawn' });
  step(world);
  assert.deepEqual(a.specs, {});
  assert.ok(world.units.filter((u) => u.owner === a.id && u.kind === 'soldier').every((u) => !u.spec));
});

// Damage a group deals to one enemy in a fixed time.
function damageDealt({ kind, spec, n, foe, foeSpec, seconds = 4, owner = 'a' }) {
  const { world, a, b, ka, kb } = arena();
  const att = owner === 'a' ? a : b, def = owner === 'a' ? b : a;
  if (spec) { forge(world, att); specialise(world, att, kind, spec); }
  if (foeSpec) { forge(world, def); specialise(world, def, foe, foeSpec); }
  park(owner === 'a' ? ka : kb, 2700, 3000);
  park(owner === 'a' ? kb : ka, 6000, 6000);
  const target = spawnUnit(world, def.id, foe, 3000, 3000);
  target.ret = true; target.cd = 1e9; target.maxHp = target.hp = 1e6; // a punching bag
  for (let i = 0; i < n; i++) spawnUnit(world, att.id, kind, 2900 - (i % 4) * 12, 2960 + Math.floor(i / 4) * 16);
  pinned(world, [target], seconds);
  return 1e6 - target.hp;
}

test('counter: spear soldiers hit knights and giants much harder', () => {
  const plain = damageDealt({ kind: 'soldier', n: 6, foe: 'knight' });
  const spear = damageDealt({ kind: 'soldier', spec: 'a', n: 6, foe: 'knight' });
  assert.ok(spear > plain * 1.8, `spear ${spear.toFixed(0)} vs plain ${plain.toFixed(0)}`);
});

test('counter: shield soldiers take about half the damage from archers', () => {
  const plain = damageDealt({ kind: 'archer', n: 6, foe: 'soldier' });
  const shielded = damageDealt({ kind: 'archer', n: 6, foe: 'soldier', foeSpec: 'b' });
  assert.ok(shielded < plain * 0.6 && shielded > plain * 0.4, `shield ${shielded.toFixed(0)} vs plain ${plain.toFixed(0)}`);
});

test('counter: an armour dragon takes half the damage from ballistas', () => {
  const plain = damageDealt({ kind: 'ballista', n: 4, foe: 'dragon' });
  const armour = damageDealt({ kind: 'ballista', n: 4, foe: 'dragon', foeSpec: 'b' });
  assert.ok(armour < plain * 0.6 && armour > plain * 0.4, `armour ${armour.toFixed(0)} vs plain ${plain.toFixed(0)}`);
});

test('every damage-dealing specialisation changes the outcome of a fight', () => {
  // troop type, what it fights, and which sides should deal more than the plain version
  const cases = [
    ['archer', 'giant', ['a']],        // sharp shooter; fire arrows trade single-target damage for area (tested below)
    ['knight', 'soldier', ['b']],      // light rider charges more often
    ['ballista', 'dragon', ['a']],     // dragon slayer
    ['mage', 'giant', ['a']],          // fire mage: more damage
  ];
  for (const [kind, foe, better] of cases) {
    const plain = damageDealt({ kind, n: 4, foe });
    for (const side of better) {
      const spec = damageDealt({ kind, spec: side, n: 4, foe });
      assert.ok(spec > plain * 1.1, `${kind}/${side}: ${spec.toFixed(0)} vs plain ${plain.toFixed(0)}`);
    }
  }
});

// Total damage a group deals to a cluster of enemies (for area damage).
function clusterDamage({ kind, spec, n = 3, seconds = 4 }) {
  const { world, a, b, ka, kb } = arena();
  if (spec) { forge(world, a); specialise(world, a, kind, spec); }
  park(ka, 2700, 3000); park(kb, 6000, 6000);
  const foes = [];
  for (let i = 0; i < 6; i++) {
    const f = spawnUnit(world, b.id, 'soldier', 3000 + (i % 3) * 14, 3000 + Math.floor(i / 3) * 14);
    f.ret = true; f.cd = 1e9; f.maxHp = f.hp = 1e5;
    foes.push(f);
  }
  for (let i = 0; i < n; i++) spawnUnit(world, a.id, kind, 2920 - i * 12, 2990 + i * 8);
  pinned(world, foes, seconds);
  return { total: foes.reduce((s, f) => s + (1e5 - f.hp), 0), hit: foes.filter((f) => f.hp < 1e5).length };
}

test('area specialisations hit the whole group: fire arrows, brute, grapeshot', () => {
  for (const [kind, side] of [['archer', 'b'], ['giant', 'b'], ['ballista', 'b']]) {
    const plain = clusterDamage({ kind });
    const area = clusterDamage({ kind, spec: side });
    assert.ok(area.hit > plain.hit, `${kind}/${side} hits ${area.hit} vs ${plain.hit}`);
    assert.ok(area.total > plain.total * 1.3, `${kind}/${side}: ${area.total.toFixed(0)} vs ${plain.total.toFixed(0)}`);
  }
});

test('siege giants flatten buildings faster', () => {
  const hit = (spec) => {
    const { world, a, b, ka, kb } = arena();
    if (spec) { forge(world, a); specialise(world, a, 'giant', spec); }
    park(ka, 2700, 3000); park(kb, 6000, 6000);
    const tower = spawnBuilding(world, b.id, 'mine', 3000, 3000);
    tower.maxHp = tower.hp = 1e6;
    for (let i = 0; i < 3; i++) spawnUnit(world, a.id, 'giant', 2940, 2970 + i * 30);
    run(world, 5);
    return 1e6 - tower.hp;
  };
  assert.ok(hit('a') > hit(null) * 1.4);
});

test('heavy knights and brutes last longer; shield soldiers too', () => {
  for (const [kind, side] of [['knight', 'a'], ['giant', 'b'], ['soldier', 'b'], ['dragon', 'b']]) {
    assert.ok(SPEC_DEFS[kind][SPECS[kind][side].id].hp > UNITS[kind].hp, `${kind}/${side}`);
  }
});

test('ice slows troops (and the caravan), but never a king', () => {
  const { world, a, b, ka, kb } = arena();
  forge(world, a); specialise(world, a, 'mage', 'b');
  park(ka, 2700, 3000);
  const mage = spawnUnit(world, a.id, 'mage', 2900, 3000);
  const runner = spawnUnit(world, b.id, 'knight', 3060, 3000);
  runner.ret = true; runner.cd = 1e9;
  park(kb, 3060, 3060); kb.cd = 1e9;
  let slowed = false;
  for (let i = 0; i < 90 && !slowed; i++) { step(world); slowed = runner.slowUntil > world.time; }
  assert.ok(slowed, 'the knight got iced');
  assert.ok(!(kb.slowUntil > world.time), 'the king did not');
  // the king still walks at full speed in the middle of the frost
  setInput(world, b.id, 1, 0);
  const x0 = kb.x;
  run(world, 1);
  assert.ok(Math.abs(kb.x - x0 - UNITS.commander.speed) < 12, `king moved ${kb.x - x0}`);
  assert.ok(mage.hp > 0);
});

test('fire keeps burning after the hit, and the kill is credited', () => {
  const { world, a, b, ka, kb } = arena();
  forge(world, a); specialise(world, a, 'dragon', 'a');
  park(ka, 2700, 3000); park(kb, 6000, 6000);
  const dragon = spawnUnit(world, a.id, 'dragon', 2900, 3000);
  const victim = spawnUnit(world, b.id, 'soldier', 2990, 3000);
  victim.ret = true; victim.cd = 1e9;
  let burning = false;
  for (let i = 0; i < 60 && !burning; i++) { step(world); burning = victim.burnUntil > world.time; }
  assert.ok(burning);
  dragon.hp = 0; step(world); // the dragon is gone; the fire is not
  const hp = victim.hp;
  run(world, 1.5);
  assert.ok(victim.hp < hp || victim.hp <= 0, 'still burning');
  victim.hp = 3;
  const kills = a.kills;
  run(world, 2);
  assert.ok(victim.hp <= 0 || !world.units.includes(victim));
  assert.equal(a.kills, kills + 1, "credited to the dragon's owner");
});

test('a priest heals two at once, a herb woman everyone around her', () => {
  for (const [side, expect] of [['a', 2], ['b', 5]]) {
    const { world, a, ka, kb } = arena();
    forge(world, a); specialise(world, a, 'healer', side);
    park(ka, 3000, 2900); park(kb, 6000, 6000);
    spawnUnit(world, a.id, 'healer', 3000, 3000);
    const hurt = [0, 1, 2, 3, 4].map((i) => { const u = spawnUnit(world, a.id, 'giant', 3040 + i * 20, 3020); u.hp = 100; return u; });
    run(world, 0.5);
    const healed = hurt.filter((u) => u.hp > 100).length;
    assert.ok(healed >= expect, `${side}: healed ${healed}`);
  }
});
