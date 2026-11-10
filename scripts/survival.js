// Balance check: how long does a slow "novice" player survive against the normal bot mix?
// Usage: node scripts/survival.js [seeds] [minutes]

import { createWorld, addPlayer, step, TICK_RATE } from '../src/sim/index.js';

const seeds = Number(process.argv[2]) || 12;
const minutes = Number(process.argv[3]) || 10;
const firstDeaths = [];
let totalDeaths = 0, scoreSum = 0, rankSum = 0;

for (let seed = 1; seed <= seeds; seed++) {
  const world = createWorld({ seed });
  const me = addPlayer(world, { name: 'Beginner', isBot: true, difficulty: 'novice' });
  for (const d of ['easy', 'normal', 'easy', 'normal', 'hard']) addPlayer(world, { isBot: true, difficulty: d });
  let first = null, best = 0;
  for (let i = 0; i < minutes * 60 * TICK_RATE; i++) {
    step(world);
    if (me.score > best) best = me.score;
    for (const e of world.events) {
      if (e.type === 'eliminated' && e.player === me.id) {
        totalDeaths++;
        if (first === null) first = world.time;
      }
    }
  }
  firstDeaths.push(first === null ? minutes * 60 : first);
  scoreSum += best;
  rankSum += 1 + world.players.filter((p) => p.score > me.score).length;
}

firstDeaths.sort((a, b) => a - b);
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
console.log(`${seeds} potjes van ${minutes} min, beginner tegen 5 bots`);
console.log(`eerste uitschakeling: mediaan ${fmt(firstDeaths[Math.floor(seeds / 2)])}, vroegste ${fmt(firstDeaths[0])}, laatste ${fmt(firstDeaths[seeds - 1])}`);
console.log(`overleeft het hele potje: ${firstDeaths.filter((t) => t >= minutes * 60).length}/${seeds}`);
console.log(`uitschakelingen per potje: ${(totalDeaths / seeds).toFixed(1)}, beste score gem. ${Math.round(scoreSum / seeds)}, eindrang gem. ${(rankSum / seeds).toFixed(1)} van 6`);
