// Runs a full bot match without any screen: proof the simulation is server-ready.
// Usage: node scripts/headless.js [minutes] [seed]

import { createWorld, addPlayer, playerStats, step, TICK_RATE } from '../src/sim/index.js';

const minutes = Number(process.argv[2]) || 10;
const seed = Number(process.argv[3]) || 1;
const world = createWorld({ seed });
for (const d of ['easy', 'easy', 'normal', 'normal', 'hard', 'hard']) {
  addPlayer(world, { name: `Bot-${d}-${world.players.length}`, isBot: true, difficulty: d });
}

let ms = 0, worst = 0, peak = 0, eliminations = 0, deaths = 0;
const goals = {};
const steps = minutes * 60 * TICK_RATE;
for (let i = 0; i < steps; i++) {
  const t = performance.now();
  step(world);
  const d = performance.now() - t;
  ms += d;
  if (d > worst) worst = d;
  if (world.units.length > peak) peak = world.units.length;
  for (const e of world.events) {
    if (e.type === 'eliminated') {
      eliminations++;
      console.log(`[${(world.time / 60).toFixed(1)} min] ${world.players[e.player].name} uitgeschakeld door ${e.by >= 0 ? world.players[e.by].name : '?'}`);
    }
    if (e.type === 'death') deaths++;
  }
  if (i % TICK_RATE === 0) for (const p of world.players) if (p.alive) goals[p.bot.goal] = (goals[p.bot.goal] || 0) + 1;
}

console.log(`\n${minutes} spelminuten, seed ${seed}`);
console.table(world.players.map((p) => {
  const st = playerStats(world, p.id);
  return { naam: p.name, levens: p.lives, score: Math.floor(p.score), kills: p.kills, goud: Math.floor(p.gold), leger: st.army, mijnen: st.mines, kazernes: st.barracks, torens: st.towers };
}));
console.log('tijd per doel (s):', goals);
console.log(`eliminaties: ${eliminations}, gesneuveld: ${deaths}, piek eenheden: ${peak}`);
console.log(`stap gemiddeld ${(ms / steps).toFixed(3)} ms, slechtste ${worst.toFixed(2)} ms (budget 33 ms)`);
