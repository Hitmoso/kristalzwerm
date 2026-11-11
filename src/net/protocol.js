// Wire format shared by server and client. Snapshots use flat number arrays to stay small.

// Append only: snapshots send these as indexes, and old tabs still know the old order.
export const UNIT_KINDS = ['commander', 'soldier', 'archer', 'knight', 'giant', 'mage', 'healer', 'dragon', 'ballista', 'caravan'];
export const BUILDING_KINDS = ['hq', 'mine', 'barracks', 'tower', 'academy', 'forge'];

export const SNAPSHOT_EVERY = 2;   // ticks between snapshots (30 Hz sim → 15 Hz network)
export const MINIMAP_EVERY = 8;    // snapshots between full-map unit dots
export const VIEW_HALF_W = 1300;   // what a client gets to see around its king
export const VIEW_HALF_H = 700;

// unit flags
export const F_ATTACK = 1, F_HIT = 2, F_LEFT = 4, F_RIGHT = 8;
// specialisation side and lasting effects ride along in spare bits, so older pages that read
// rows by length are not thrown off
export const F_SPEC_A = 16, F_SPEC_B = 32, F_SLOW = 64, F_BURN = 128;

export const UNIT_STRIDE = 7;      // id, owner, kind, x, y, hp, flags
export const BUILDING_STRIDE = 9;  // id, owner, kind, x, y, hp, flags, trainKind, trainPct
export const CRYSTAL_STRIDE = 3;   // id, x, y
export const MINI_STRIDE = 3;      // owner, x/8, y/8

// Room codes: letters and digits only, so they survive being read out loud or typed in a chat.
export function cleanRoom(raw) {
  return String(raw ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
}

// Bumped whenever the wire format or game rules change in a way an already-open page cannot
// handle. A page with another version is refused by the server and reloads itself.
export const PROTOCOL = 6;

export const MAX_NAME = 14;
export function cleanName(raw) {
  const s = String(raw ?? '').replace(/[^\p{L}\p{N} _-]/gu, '').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME);
  return s || 'Koning';
}
