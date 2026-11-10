import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createWorld, addPlayer, playerStats, step, TICK_RATE } from '../src/sim/index.js';

function botMatch(seed, minutes) {
  const world = createWorld({ seed });
  const levels = ['easy', 'easy', 'normal', 'normal', 'hard', 'hard'];
  for (const d of levels) addPlayer(world, { isBot: true, difficulty: d });
  const out = { world, eliminated: 0, kills: 0, maxUnits: 0, built: new Set(), barracks: new Set(), ms: 0, steps: 0 };
  const steps = minutes * 60 * TICK_RATE;
  for (let i = 0; i < steps; i++) {
    const t = performance.now();
    step(world);
    out.ms += performance.now() - t;
    out.steps++;
    for (const e of world.events) {
      if (e.type === 'eliminated') out.eliminated++;
      if (e.type === 'death' && e.kind !== 'hq' && e.kind !== 'mine' && e.kind !== 'barracks' && e.kind !== 'tower') out.kills++;
      if (e.type === 'built' && e.kind === 'mine') out.built.add(e.owner);
      if (e.type === 'built' && e.kind === 'barracks') out.barracks.add(e.owner);
    }
    if (world.units.length > out.maxUnits) out.maxUnits = world.units.length;
  }
  return out;
}

test('bots build an economy, fight each other and eliminate someone', () => {
  const r = botMatch(5, 10);
  assert.equal(r.built.size, 6, 'every bot builds a mine');
  assert.equal(r.barracks.size, 6, 'every bot builds a barracks');
  assert.ok(r.kills > 20, `unit deaths ${r.kills}`);
  assert.ok(r.eliminated >= 1, `eliminations ${r.eliminated}`);
  assert.ok(r.maxUnits >= 100, `peak units ${r.maxUnits}`);
  for (const u of r.world.units) assert.ok(Number.isFinite(u.x) && Number.isFinite(u.y));
  for (const p of r.world.players) assert.ok(Number.isFinite(p.gold));
  const avg = r.ms / r.steps;
  assert.ok(avg < 4, `average step ${avg.toFixed(3)} ms`);
  assert.ok(playerStats(r.world, 0));
});
