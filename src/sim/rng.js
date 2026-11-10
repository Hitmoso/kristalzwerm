// Seeded RNG (mulberry32). State lives on the world so runs are reproducible.

export function rand(world) {
  let t = (world.rngState = (world.rngState + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randRange(world, a, b) {
  return a + rand(world) * (b - a);
}
