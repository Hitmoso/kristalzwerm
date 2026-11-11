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
  boost: 3.5,          // admin speed multiplier for the king
  shrineRadius: 170,   // the Kristalhart in the middle of the map
  shrineCapture: 5,    // seconds a king must stand there alone
  shrineIncome: 6,     // gold per second for whoever holds it
  shrineScore: 3,
  botMercy: 150, // bots leave a fresh player's base alone this long, shield or not // seconds of base shield after every (re)start
};

// range = reach beyond the two bodies; `needs` = building that unlocks the unit.
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
