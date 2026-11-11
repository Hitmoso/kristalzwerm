// The gold caravan: a neutral ox cart with a small escort that crosses the map now and then.
// Whoever destroys the cart gets the gold; the wreck spills crystals anyone can grab.
// If nobody stops it, it rolls off the far edge and is gone.
//
// Lives entirely in the simulation, so offline play, the server and bots all see the same thing.

import { CARAVAN, NEUTRAL, WORLD, UNITS } from './config.js';
import { rand } from './rng.js';
import { spawnUnit, findById } from './world.js';

// Called once per tick from step(): schedule, spawn, and wind down.
export function updateCaravan(world, dt) {
  const cv = world.caravan;
  if (!cv) {
    world.caravanTimer -= dt;
    if (world.caravanTimer <= 0) spawnCaravan(world);
    return;
  }
  const wagon = findById(world.units, cv.wagonId);
  if (wagon && wagon.hp > 0) {
    cv.x = wagon.x;
    cv.y = wagon.y;
    cv.hp = wagon.hp / wagon.maxHp;
  }
  // a cart that got wedged somewhere (a castle on the route, a corner) gives up in the end,
  // so it can never block the caravans after it
  if (cv.state === 'rolling' && world.time > cv.deadline) cv.arrived = true;
  if (cv.state === 'rolling' && cv.arrived) {
    world.events.push({ type: 'caravan', phase: 'escaped', x: cv.x, y: cv.y });
    endCaravan(world);
  } else if (cv.state === 'looted' && world.time >= cv.endAt) {
    endCaravan(world); // the surviving guards scatter
  }
}

export function spawnCaravan(world) {
  if (world.caravan) return null;
  const s = world.size, c = s / 2;
  const a = rand(world) * Math.PI * 2;
  const reach = c - CARAVAN.edge;
  // cross the map through the middle, with a little offset so it is not always the same line
  const off = (rand(world) - 0.5) * CARAVAN.offset;
  const ox = -Math.sin(a) * off, oy = Math.cos(a) * off;
  const sx = c + Math.cos(a) * reach + ox, sy = c + Math.sin(a) * reach + oy;
  const ex = c - Math.cos(a) * reach + ox, ey = c - Math.sin(a) * reach + oy;
  const wagon = spawnUnit(world, NEUTRAL, 'caravan', sx, sy);
  const dx = ex - sx, dy = ey - sy, d = Math.hypot(dx, dy);
  wagon.fx = dx / d; wagon.fy = dy / d;
  const guards = [];
  CARAVAN.guards.forEach((kind, i) => {
    const ga = (i / CARAVAN.guards.length) * Math.PI * 2;
    const g = spawnUnit(world, NEUTRAL, kind, sx + Math.cos(ga) * 70, sy + Math.sin(ga) * 70);
    g.slot = i;
    guards.push(g.id);
  });
  world.caravan = {
    wagonId: wagon.id, guards, x: sx, y: sy, ex, ey, hp: 1,
    state: 'rolling', arrived: false, side: rand(world) < 0.5 ? 1 : -1, endAt: 0, startedAt: world.time,
    deadline: world.time + 2 * (d / UNITS.caravan.speed),
  };
  world.events.push({ type: 'caravan', phase: 'spawn', x: sx, y: sy });
  return world.caravan;
}

// The cart was destroyed by `killer` (a player): pay out and spill crystals.
export function lootCaravan(world, wagon, killer) {
  const cv = world.caravan;
  if (!cv || cv.state !== 'rolling') return;
  cv.state = 'looted';
  cv.endAt = world.time + CARAVAN.linger;
  cv.x = wagon.x; cv.y = wagon.y; cv.hp = 0;
  if (killer) {
    if (killer.life) killer.life.caravans++;
    killer.gold += CARAVAN.loot;
    killer.score += CARAVAN.score;
  }
  for (let i = 0; i < CARAVAN.crystals; i++) {
    const a = (i / CARAVAN.crystals) * Math.PI * 2 + rand(world) * 0.6;
    const r = 45 + rand(world) * 70;
    world.crystals.push({ id: world.nextId++, x: wagon.x + Math.cos(a) * r, y: wagon.y + Math.sin(a) * r, value: WORLD.crystalValue });
  }
  world.events.push({ type: 'caravan', phase: 'loot', by: killer ? killer.id : -1, gold: CARAVAN.loot, x: wagon.x, y: wagon.y });
}

// Remove whatever is left of the caravan quietly (no death puffs) and schedule the next one.
function endCaravan(world) {
  const cv = world.caravan;
  const gone = new Set([cv.wagonId, ...cv.guards]);
  let w = 0;
  for (let i = 0; i < world.units.length; i++) {
    const u = world.units[i];
    if (!gone.has(u.id)) world.units[w++] = u;
  }
  world.units.length = w;
  world.caravan = null;
  world.caravanTimer = CARAVAN.every;
}

export const isNeutral = (u) => u.owner === NEUTRAL;
export const caravanUnit = (kind) => !!UNITS[kind] && !!UNITS[kind].neutral;
