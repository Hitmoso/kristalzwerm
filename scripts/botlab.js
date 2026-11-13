// Bot behaviour lab: how do the bots treat a strong player?
// A scripted stand-in for a strong human: full army, towers, a high score, and
// reinforcements whenever it loses troops.
//   fort    army on guard at the castle
//   roam    king and army camp far from home (near the Kristalhart): the base is empty
//   nofort  bots only
// Usage: node scripts/botlab.js [seeds] [minutes] [fort|roam|nofort]

import { createWorld, addPlayer, playerStats, step, spawnUnit, spawnBuilding, findById, setInput, TICK_RATE } from '../src/sim/index.js';

const seeds = Number(process.argv[2]) || 4;
const minutes = Number(process.argv[3]) || 15;
const mode = process.argv[4] || 'fort';
const withFort = mode !== 'nofort';
const FORT_ARMY = { soldier: 14, archer: 14, knight: 8, giant: 3, mage: 6, healer: 3, ballista: 2, dragon: 2 }; // ~100 supply

function fortify(world, me) {
  const hq = findById(world.buildings, me.hqId);
  const king = findById(world.units, me.commanderId);
  if (!hq) return;
  const st = playerStats(world, me.id);
  // grows like a good player would: a third of the army at minute 4, everything at minute 10
  const grow = Math.max(0.3, Math.min(1, (world.time - 240) / 360));
  const towers = Math.round(2 + 3 * grow);
  if (st.towers < towers) for (let i = st.towers; i < towers; i++) spawnBuilding(world, me.id, 'tower', hq.x + Math.cos(i * 1.257) * 210, hq.y + Math.sin(i * 1.257) * 210);
  const at = mode === 'roam' && king ? king : hq;
  const have = {};
  for (const u of world.units) if (u.owner === me.id) have[u.kind] = (have[u.kind] || 0) + 1;
  let i = 0;
  for (const [kind, n] of Object.entries(FORT_ARMY)) {
    for (let k = have[kind] || 0; k < Math.ceil(n * grow); k++, i++) spawnUnit(world, me.id, kind, at.x + Math.cos(i * 2.4) * 120, at.y + Math.sin(i * 2.4) * 120);
  }
  me.army = mode === 'roam' ? 'follow' : 'hold';
  if (me.score < 2000 + 4000 * grow) me.score = 2000 + 4000 * grow;
}

const tot = { sieges: 0, falls: 0, first: [], botElim: 0, deaths: 0, goals: {}, onFort: 0, samples: 0, joint: 0, fortLost: 0, fortBuildings: 0, botLost: 0, waves: 0, kings: 0, kingsArmy: 0, hitByFort: 0, hitByBot: 0, power: 0, peak: 0, late: 0, lateN: 0 };
for (let seed = 1; seed <= seeds; seed++) {
  const world = createWorld({ seed });
  const me = withFort ? addPlayer(world, { name: 'Fort' }) : null;
  for (const d of ['easy', 'normal', 'easy', 'normal', 'hard']) addPlayer(world, { isBot: true, difficulty: d });
  let lastHit = -999, first = null, lastFight = -999;
  for (let i = 0; i < minutes * 60 * TICK_RATE; i++) {
    if (me && i % (TICK_RATE * 20) === 0 && me.alive && world.time > 240) fortify(world, me); // growing from minute 4, topped up every 20 s
    if (me && !me.alive && i % TICK_RATE === 0) me.commands.push({ type: 'respawn' });
    if (me && mode === 'roam' && me.alive) {
      const king = findById(world.units, me.commanderId), hq = findById(world.buildings, me.hqId);
      if (king && hq) {
        // camp 1800 from home, towards the middle of the map
        const a = Math.atan2(world.size / 2 - hq.y, world.size / 2 - hq.x);
        const cx = hq.x + Math.cos(a) * 1800, cy = hq.y + Math.sin(a) * 1800;
        const d = Math.hypot(cx - king.x, cy - king.y);
        if (world.time > 240 && d > 40) setInput(world, me.id, (cx - king.x) / d, (cy - king.y) / d); else setInput(world, me.id, 0, 0);
      }
    }
    step(world);
    const hq = me && me.alive ? findById(world.buildings, me.hqId) : null;
    for (const e of world.events) {
      if (e.type === 'eliminated') { if (me && e.player === me.id) tot.falls++; else tot.botElim++; }
      if (e.type === 'death') {
        tot.deaths++;
        // a bot king who falls while his army still stands: the army walks home without him
        if (e.kind === 'commander' && world.players[e.owner] && world.players[e.owner].isBot) {
          tot.kings++;
          let left = 0;
          for (const u of world.units) if (u.owner === e.owner && u.kind !== 'commander' && u.hp > 0) left++;
          if (left >= 8) tot.kingsArmy++;
        }
        if (me && e.owner === me.id) { if (['hq', 'mine', 'barracks', 'tower', 'academy', 'forge'].includes(e.kind)) tot.fortBuildings++; else tot.fortLost++; }
        else if (hq && e.owner >= 0 && Math.hypot(e.x - hq.x, e.y - hq.y) < 900) {
          tot.botLost++;
          if (world.time - lastFight > 30) tot.waves++;
          lastFight = world.time;
        }
      }
    }
    // who is hurting the bots at the castle: the defender, or each other?
    if (hq && i % 3 === 0) for (const u of world.units) {
      if (u.owner === me.id || u.owner < 0 || u.hitAt !== world.time || Math.hypot(u.x - hq.x, u.y - hq.y) > 700) continue;
      if (u.hitBy === me.id) tot.hitByFort++; else if (u.hitBy >= 0) tot.hitByBot++;
    }
    if (me && me.hqHitAt === world.time) {
      if (world.time - lastHit > 30) { tot.sieges++; if (first === null) first = world.time; }
      lastHit = world.time;
    }
    if (i % TICK_RATE === 0) {
      let onFort = 0;
      for (const p of world.players) {
        if (!p.isBot || !p.alive) continue;
        tot.samples++;
        tot.goals[p.bot.goal] = (tot.goals[p.bot.goal] || 0) + 1;
        if (i % (TICK_RATE * 10) === 0) {
          const pw = playerStats(world, p.id).power;
          tot.power += pw * 10;
          if (pw > tot.peak) tot.peak = pw;
          if (world.time > minutes * 40) { tot.late += pw; tot.lateN++; }
        }
        if (me && (p.bot.goal === 'attack' || p.bot.goal === 'siege') && p.bot.targetPlayer === me.id) { tot.onFort++; onFort++; }
      }
      if (onFort >= 2) tot.joint++;
    }
  }
  tot.first.push(first === null ? '-' : (first / 60).toFixed(1));
}
const pct = (n) => `${(100 * n / tot.samples).toFixed(1)}%`;
const per = (n) => (n / seeds).toFixed(1);
console.log(`${seeds} potjes van ${minutes} min, ${mode === 'fort' ? 'sterke speler op wacht bij het kasteel' : mode === 'roam' ? 'sterke speler met leger ver van huis' : 'alleen bots'}`);
if (withFort) {
  console.log(`aanvallen op het kasteel per potje: ${per(tot.sieges)} (eerste op minuut: ${tot.first.join(', ')}), kasteel gevallen per potje: ${per(tot.falls)}`);
  console.log(`aanvalsgolven bij het kasteel per potje: ${per(tot.waves)}`);
  console.log(`verliezen speler per potje: ${per(tot.fortLost)} troepen, ${per(tot.fortBuildings)} gebouwen; botverliezen bij het kasteel: ${per(tot.botLost)}`);
  console.log(`klappen op bots bij het kasteel: ${Math.round(100 * tot.hitByBot / (tot.hitByBot + tot.hitByFort || 1))}% van andere bots`);
  console.log(`bot-tijd in aanval op de speler: ${pct(tot.onFort)}, seconden met 2+ bots tegelijk per potje: ${per(tot.joint)}`);
}
console.log(`uitschakelingen bots per potje: ${per(tot.botElim)}, gesneuveld per potje: ${per(tot.deaths)}`);
console.log(`botkoningen gesneuveld per potje: ${per(tot.kings)}, waarvan met nog 8+ troepen in leven: ${per(tot.kingsArmy)}`);
console.log(`legerwaarde bots: gemiddeld ${Math.round(tot.power / tot.samples)}, in het laatste derde ${Math.round(tot.late / (tot.lateN || 1))}, piek ${Math.round(tot.peak)}`);
console.log('tijdverdeling doelen:', Object.entries(tot.goals).map(([k, v]) => `${k} ${pct(v)}`).join(', '));
