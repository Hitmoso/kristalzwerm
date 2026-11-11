// All balance numbers live here. Pure data, shared by client and (later) server.

export const TICK_RATE = 30;
export const DT = 1 / TICK_RATE;

export const WORLD = {
  size: 6500,
  crystalCount: 75,
  crystalValue: 35,
  crystalRespawn: 0.8,
  crystalRadius: 14,
  pickupRadius: 30,
  startGold: 300,
  cheatGold: 1000,
  startSoldiers: 4,
  baseSupply: 20,
  maxSupply: 100,     // 20 + 10 barracks × 8 + academy 6 = 106, capped at 100
  commanderRespawn: 6,
  botRespawn: 4,
  hqBounty: 150,
  enemyBuildExclusion: 300,
  aggroRange: 230,
  leashRange: 460,
  edgeMargin: 60,
  hqRegenRange: 320,
  hqRegenPerSec: 20,
  spawnGrace: 90,
  inheritShare: 0.1,   // after a fall you start with 10% of your last score as extra gold...
  inheritMax: 800,     // ...up to this much
  revengeBonus: 500,   // gold for flattening the castle of whoever flattened yours
  crownMargin: 0.05,   // a challenger must beat the leader by 5% (and 50 points) to take the crown
  boost: 3.5,          // admin speed multiplier for the king
  shrineRadius: 170,   // the Kristalhart in the middle of the map
  shrineCapture: 5,    // seconds a king must stand there alone
  shrineIncome: 6,     // gold per second for whoever holds it
  shrineScore: 3,
  botMercy: 150, // bots leave a fresh player's base alone this long, shield or not // seconds of base shield after every (re)start
};

// range = reach beyond the two bodies; `needs` = building that unlocks the unit.
// Owner id of things that belong to nobody (the gold caravan and its escort).
export const NEUTRAL = -1;

export const CARAVAN = {
  first: 100,        // seconds into a world before the first caravan
  every: 150,        // seconds between one caravan ending and the next appearing
  speed: 70,         // the cart: a crossing takes about a minute and a quarter
  botDelay: 20,      // bots only react this long after the horn; players get a head start
  edge: 160,         // starts and ends this far inside the arena edge
  offset: 1400,      // random sideways shift of the route through the middle
  loot: 300,         // gold for whoever destroys the cart
  score: 200,
  crystals: 8,       // crystals the wreck spills, free for anyone
  linger: 20,        // seconds the leftover guards hang around after a raid
  guards: ['knight', 'knight', 'knight', 'archer', 'archer', 'archer', 'archer', 'soldier', 'soldier', 'soldier'],
  guardLeash: 300,   // guards never stray further than this from the cart
  guardAggro: 210,
};

export const UNITS = {
  // The king hits hard: two blows fell a soldier.
  commander: { hp: 520, dmg: 30, range: 150, cd: 0.5, speed: 190, radius: 15, supply: 0, cost: 0, train: 0 },
  soldier: { hp: 60, dmg: 8, range: 8, cd: 0.6, speed: 150, radius: 8, supply: 1, cost: 30, train: 2 },
  archer: { hp: 35, dmg: 10, range: 170, cd: 1.0, speed: 140, radius: 7, supply: 1, cost: 45, train: 3, needs: 'barracks' },
  // Fast cavalry. The first blow after 3 quiet seconds is a charge.
  knight: { hp: 140, dmg: 15, range: 10, cd: 0.8, speed: 200, radius: 11, supply: 2, cost: 80, train: 4, needs: 'barracks', charge: 2.5 },
  // Slow wall-breaker.
  giant: { hp: 340, dmg: 30, range: 12, cd: 1.2, speed: 95, radius: 16, supply: 3, cost: 130, train: 6, needs: 'barracks', buildingMult: 2.5 },
  // Siege crossbow on wheels: slow and fragile up close, but its bolts tear dragons apart.
  ballista: { hp: 150, dmg: 12, range: 230, cd: 1.4, speed: 110, radius: 13, supply: 2, cost: 100, train: 5, needs: 'barracks', airMult: 3.5 },
  // The gold caravan's cart: neutral, unarmed, tough, never trainable.
  caravan: { hp: 1700, dmg: 0, range: 0, cd: 1, speed: 70, radius: 24, supply: 0, cost: 300, train: 0, neutral: true },
  // Fireball hits everything near the target.
  mage: { hp: 45, dmg: 13, range: 180, cd: 1.5, speed: 130, radius: 8, supply: 2, cost: 95, train: 4.5, needs: 'academy', splash: 55 },
  // Does not fight; mends the most wounded ally nearby.
  healer: { hp: 55, dmg: 0, heal: 14, range: 150, cd: 0.8, speed: 145, radius: 8, supply: 1, cost: 70, train: 4, needs: 'academy' },
  // Flies over buildings and breathes fire in a small area. Only ranged attacks reach it.
  dragon: { hp: 260, dmg: 13, range: 95, cd: 0.7, speed: 165, radius: 15, supply: 4, cost: 240, train: 9, needs: 'academy', splash: 45, flying: true },
};

export const BUILDINGS = {
  hq: { hp: 2600, radius: 46, cost: 0, income: 3, dmg: 22, range: 270, cd: 0.5, trains: true },
  mine: { hp: 350, radius: 26, cost: 120, costStep: 40, income: 2 },
  barracks: { hp: 500, radius: 30, cost: 150, supply: 8, trains: true },
  tower: { hp: 420, radius: 20, cost: 130, dmg: 16, range: 250, cd: 0.6 },
  academy: { hp: 450, radius: 30, cost: 220, supply: 6, trains: true },
  forge: { hp: 400, radius: 26, cost: 180 }, // the Smidse: unlocks specialisations
};

// turn = how fast the stick follows the plan (rad-ish per second); micro = how well the king
// positions himself in a fight (0 = walks straight in).
export const DIFFICULTY = {
  // Stand-in for a first-time human in balance runs: slow, cautious, spends late.
  novice: { thinkEvery: 7, aggression: 4, maxMines: 1, armyTarget: 0.45, turn: 3, micro: 0 },
  easy: { thinkEvery: 1.6, aggression: 1.7, maxMines: 2, armyTarget: 0.6, turn: 4, micro: 0 },
  normal: { thinkEvery: 0.9, aggression: 1.35, maxMines: 4, armyTarget: 0.85, turn: 7, micro: 0.6 },
  hard: { thinkEvery: 0.45, aggression: 1.2, maxMines: 6, armyTarget: 1, turn: 9, micro: 1 },
};

export const BOT_NAMES = ['Vos', 'Raaf', 'Otter', 'Wezel', 'Havik', 'Das', 'Lynx', 'Uil'];

// Specialisations, bought at the Smidse: per troop type one of two directions, for good
// (until your castle falls). `mods` override the troop's numbers; a few add a new effect:
//   bigMult        extra damage against knights and giants
//   rangedResist   less damage from anything that shoots
//   ballistaResist less damage from ballistas
//   chargeEvery    every n-th blow is a charge
//   healTargets    heal this many allies at once
//   aura           heal every ally within this radius each cooldown
//   slow           seconds a hit slows its target (kings are immune)
//   burn/burnDps   a hit sets the target on fire for this long
export const SPECS = {
  soldier: {
    cost: 200,
    a: { id: 'spear', name: 'Speerdrager', desc: 'Dubbele schade tegen ridders en reuzen', mods: { bigMult: 2.2 } },
    b: { id: 'shield', name: 'Schilddrager', desc: 'Halve schade van pijlen en schoten, iets trager', mods: { hp: 75, rangedResist: 0.5, speed: 135 } },
  },
  archer: {
    cost: 200,
    a: { id: 'sharp', name: 'Scherpschutter', desc: 'Veel verder bereik en iets meer schade', mods: { range: 240, dmg: 12, cd: 1.2 } },
    b: { id: 'firearrow', name: 'Vuurpijlen', desc: 'Elke pijl raakt een klein groepje', mods: { splash: 32, dmg: 9 } },
  },
  knight: {
    cost: 260,
    a: { id: 'heavy', name: 'Zware ridder', desc: '50% meer levens en een hardere stormloop, trager', mods: { hp: 210, charge: 3.2, speed: 170 } },
    b: { id: 'light', name: 'Lichte ruiter', desc: 'Sneller, en elke derde klap is een stormloop', mods: { speed: 245, chargeEvery: 3 } },
  },
  giant: {
    cost: 300,
    a: { id: 'siege', name: 'Belegeraar', desc: 'Sloopt gebouwen veel sneller, zwakker tegen troepen', mods: { buildingMult: 4.5, dmg: 24 } },
    b: { id: 'brute', name: 'Bruut', desc: 'Elke klap raakt alles om hem heen', mods: { splash: 32, hp: 360, dmg: 27 } },
  },
  ballista: {
    cost: 260,
    a: { id: 'slayer', name: 'Drakendoder', desc: 'Nog meer schade op draken en verder bereik', mods: { airMult: 5, range: 270 } },
    b: { id: 'grape', name: 'Schroot', desc: 'Raakt een hele groep grondtroepen', mods: { splash: 60, dmg: 14, airMult: 2 } },
  },
  mage: {
    cost: 300,
    a: { id: 'firemage', name: 'Vuurmagiër', desc: 'Grotere explosie en meer schade', mods: { splash: 85, dmg: 15 } },
    b: { id: 'icemage', name: 'IJsmagiër', desc: 'Vertraagt vijanden 2 seconden, iets minder schade', mods: { dmg: 10, slow: 2 } },
  },
  healer: {
    cost: 260,
    a: { id: 'priest', name: 'Priester', desc: 'Geneest twee troepen tegelijk', mods: { healTargets: 2, heal: 10 } },
    b: { id: 'herbal', name: 'Kruidenvrouw', desc: 'Geneest langzaam iedereen om zich heen', mods: { aura: 175, heal: 8, cd: 1 } },
  },
  dragon: {
    cost: 400,
    a: { id: 'firedragon', name: 'Vuurdraak', desc: 'Wat hij raakt, brandt nog 3 seconden door', mods: { burn: 3, burnDps: 8 } },
    b: { id: 'armordragon', name: 'Pantserdraak', desc: 'Meer levens en halve schade van ballisten', mods: { hp: 340, ballistaResist: 0.5 } },
  },
};

// The full numbers of every specialised troop, worked out once.
export const SPEC_DEFS = {};
for (const [kind, s] of Object.entries(SPECS)) {
  SPEC_DEFS[kind] = {};
  for (const side of ['a', 'b']) SPEC_DEFS[kind][s[side].id] = { ...UNITS[kind], ...s[side].mods, spec: s[side].id, side };
}

// The numbers that apply to this unit right now (its own specialisation, if any).
export function defOf(u) {
  return (u.spec && SPEC_DEFS[u.kind] && SPEC_DEFS[u.kind][u.spec]) || UNITS[u.kind];
}

export const SLOW_FACTOR = 0.6;

// Admin "make the bots strong": what each bot gets per click.
export const EMPOWER = {
  gold: 1000,
  army: { soldier: 6, archer: 5, knight: 3, giant: 2, mage: 2, ballista: 1, healer: 1 }, // 20 troops
}; // slowed units move at 60%
