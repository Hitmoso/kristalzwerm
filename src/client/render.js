// Canvas renderer: reads the world, never changes it.

import { UNITS, BUILDINGS } from '../sim/index.js';
import {
  unitSprite, buildingSprite, crystalSprite, shrineSprite, decoSprite, groundTile, DECO_COUNT,
} from './sprites.js';

export const COLORS = [
  { main: '#3fa9f5', dark: '#1d5f9c', light: '#cfeaff' },
  { main: '#ef5350', dark: '#9c2622', light: '#ffd6d4' },
  { main: '#ffb627', dark: '#a86a00', light: '#fff0c4' },
  { main: '#9b6bf2', dark: '#55309e', light: '#e6dbff' },
  { main: '#ff7ac0', dark: '#a8387a', light: '#ffe0f1' },
  { main: '#f2f2f2', dark: '#8e98a3', light: '#ffffff' },
  { main: '#ff8a3d', dark: '#a34a10', light: '#ffe2cc' },
  { main: '#35c9b5', dark: '#167a6d', light: '#d2f7f1' },
];
// Neutral (the caravan and its escort): sand with bronze trim, unlike any player colour.
export const NEUTRAL_COLOR = { main: '#c8b48a', dark: '#7a5a2e', light: '#f6ecd2' };
export const colorOf = (owner) => (owner < 0 ? NEUTRAL_COLOR : COLORS[owner % COLORS.length]);

const VIEW_HEIGHT = 860;
const SCALE = { giant: 1.2, dragon: 1.3 }; // elite troops stand out // world units visible vertically
const MINIMAP = 176;
const TAU = Math.PI * 2;
const DECO_CELL = 230;
const FONT = '"Trebuchet MS", "Segoe UI", system-ui, sans-serif';

function hash(x, y) {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return (h ^ (h >>> 16)) >>> 0;
}

export function createRenderer(canvas) {
  const g = canvas.getContext('2d');
  const r = {
    cam: { x: 2500, y: 2500 },
    scale: 1,
    w: 0, h: 0, dpr: 1,
    effects: [],
    shake: 0,
    frame: 0,
  };
  const flips = new WeakMap(); // which way each unit last faced
  let grass = null, water = null;
  const items = [];

  r.resize = () => {
    r.dpr = Math.min(window.devicePixelRatio || 1, 2);
    r.w = window.innerWidth;
    r.h = window.innerHeight;
    canvas.width = Math.round(r.w * r.dpr);
    canvas.height = Math.round(r.h * r.dpr);
    r.scale = Math.max(0.6, Math.min(1.7, r.h / VIEW_HEIGHT));
  };
  r.resize();

  r.screenToWorld = (sx, sy) => ({
    x: r.cam.x + (sx - r.w / 2) / r.scale,
    y: r.cam.y + (sy - r.h / 2) / r.scale,
  });

  const inView = (x, y, m) => {
    const hw = r.w / 2 / r.scale + m, hh = r.h / 2 / r.scale + m;
    return x > r.cam.x - hw && x < r.cam.x + hw && y > r.cam.y - hh && y < r.cam.y + hh;
  };
  const fx = (e) => { r.effects.push(e); };

  // Turn simulation events into short-lived visual effects.
  r.addEvents = (world, meId) => {
    for (const e of world.events) {
      if (e.type === 'shot') {
        if (!inView(e.x1, e.y1, 320)) continue;
        const kind = e.kind === 'mage' ? 'orb' : e.kind === 'dragon' ? 'flame' : e.kind === 'ballista' ? 'bolt' : 'arrow';
        const lift = e.kind === 'tower' ? 48 : e.kind === 'hq' ? 70 : e.kind === 'dragon' ? 36 : e.kind === 'ballista' ? 20 : 16;
        const d = Math.hypot(e.x2 - e.x1, e.y2 - e.y1);
        fx({ kind, x: e.x1, y: e.y1 - lift, x2: e.x2, y2: e.y2 - 10, t: 0, life: Math.max(0.09, d / 900) });
      } else if (e.type === 'splash') {
        if (!inView(e.x, e.y, 120)) continue;
        fx({ kind: 'boom', x: e.x, y: e.y, t: 0, life: 0.38, size: e.r, fire: e.kind === 'dragon' });
      } else if (e.type === 'aura') {
        if (!inView(e.x, e.y, 150)) continue;
        fx({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.7, size: e.r * 0.8, color: '#8fe39a' });
      } else if (e.type === 'heal') {
        if (!inView(e.x, e.y, 60)) continue;
        fx({ kind: 'heal', x: e.x, y: e.y, t: 0, life: 0.7 });
      } else if (e.type === 'charge') {
        if (!inView(e.x, e.y, 60)) continue;
        fx({ kind: 'star', x: e.x, y: e.y - 10, t: 0, life: 0.3 });
      } else if (e.type === 'hit') {
        if (!inView(e.x, e.y, 50)) continue;
        fx({ kind: 'spark', x: e.x, y: e.y - 10, t: 0, life: 0.16, a: (world.tick * 1.7 + e.x) % TAU });
      } else if (e.type === 'death') {
        if (!inView(e.x, e.y, 120)) continue;
        const b = BUILDINGS[e.kind];
        const size = b ? b.radius * 1.5 : UNITS[e.kind].radius * 1.9;
        fx({ kind: 'puff', x: e.x, y: e.y - (b ? 18 : 8), t: 0, life: b ? 0.8 : 0.45, size, seed: e.x * 7 + e.y });
        if (b || e.kind === 'commander') fx({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.6, size: size * 1.4, color: colorOf(e.owner).main });
        if (e.kind === 'hq') r.shake = 14;
      } else if (e.type === 'collect') {
        if (!inView(e.x, e.y, 50)) continue;
        fx({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.3, size: 24, color: '#ffe58a' });
        if (e.owner === meId) fx({ kind: 'text', x: e.x, y: e.y - 18, t: 0, life: 0.9, text: `+${e.value}` });
      } else if (e.type === 'caravan' && e.phase === 'loot') {
        // the cart bursts: a shower of coins, a golden ring, and the haul over the raider's head
        if (!inView(e.x, e.y, 200)) continue;
        fx({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.8, size: 90, color: '#ffd24a' });
        fx({ kind: 'coins', x: e.x, y: e.y - 20, t: 0, life: 1.1, seed: e.x });
        fx({ kind: 'text', x: e.x, y: e.y - 60, t: 0, life: 1.6, text: e.by === meId ? `+${e.gold} goud` : 'Geplunderd!' });
        r.shake = Math.max(r.shake, 5);
      } else if (e.type === 'built') {
        if (!inView(e.x, e.y, 100)) continue;
        fx({ kind: 'ring', x: e.x, y: e.y, t: 0, life: 0.5, size: BUILDINGS[e.kind].radius * 2, color: '#ffffff' });
        fx({ kind: 'puff', x: e.x, y: e.y - 6, t: 0, life: 0.5, size: BUILDINGS[e.kind].radius, seed: e.x });
      }
    }
    if (r.effects.length > 700) r.effects.splice(0, r.effects.length - 700);
  };

  r.draw = (world, meId, alpha, frameDt) => {
    r.frame++;
    const me = world.players[meId];
    const size = world.size;
    const time = world.time;
    if (!grass) {
      const m = new DOMMatrix().scale(0.5);
      grass = g.createPattern(groundTile('grass'), 'repeat'); grass.setTransform(m);
      water = g.createPattern(groundTile('water'), 'repeat'); water.setTransform(m);
    }

    let shx = 0, shy = 0;
    if (r.shake > 0.3) {
      shx = Math.sin(r.frame * 1.9) * r.shake;
      shy = Math.cos(r.frame * 2.3) * r.shake;
      r.shake *= 0.88;
    }
    const k = r.dpr * r.scale;
    g.setTransform(k, 0, 0, k, (r.w / 2 + shx) * r.dpr - r.cam.x * k, (r.h / 2 + shy) * r.dpr - r.cam.y * k);
    g.lineJoin = 'round';

    const hw = r.w / 2 / r.scale + 30, hh = r.h / 2 / r.scale + 30;
    const vx0 = r.cam.x - hw, vx1 = r.cam.x + hw, vy0 = r.cam.y - hh, vy1 = r.cam.y + hh;
    const x0 = Math.max(0, vx0), x1 = Math.min(size, vx1);
    const y0 = Math.max(0, vy0), y1 = Math.min(size, vy1);

    // sea, beach, grass
    g.fillStyle = water;
    g.fillRect(vx0, vy0, vx1 - vx0, vy1 - vy0);
    if (vx0 < 0 || vy0 < 0 || vx1 > size || vy1 > size) {
      g.fillStyle = 'rgba(190, 235, 245, 0.35)';
      g.beginPath(); g.roundRect(-78, -78, size + 156, size + 156, 90); g.fill();
      g.fillStyle = '#ead9a6';
      g.beginPath(); g.roundRect(-58, -58, size + 116, size + 116, 70); g.fill();
      g.fillStyle = '#d9c48a';
      g.beginPath(); g.roundRect(-22, -22, size + 44, size + 44, 34); g.fill();
    }
    if (x1 > x0 && y1 > y0) {
      g.fillStyle = grass;
      g.fillRect(x0, y0, x1 - x0, y1 - y0);
    }
    g.strokeStyle = '#3f7a34'; g.lineWidth = 7;
    g.strokeRect(0, 0, size, size);

    // scenery: a few props per cell, picked by hashing the cell
    for (let cx = Math.floor(x0 / DECO_CELL); cx <= Math.floor(x1 / DECO_CELL); cx++) {
      for (let cy = Math.floor(y0 / DECO_CELL); cy <= Math.floor(y1 / DECO_CELL); cy++) {
        let h = hash(cx, cy);
        const n = h % 4;
        for (let i = 0; i < n; i++) {
          h = hash(h, i + 1);
          const dx = cx * DECO_CELL + (h % 1000) / 1000 * DECO_CELL;
          const dy = cy * DECO_CELL + ((h >>> 10) % 1000) / 1000 * DECO_CELL;
          if (dx < 20 || dy < 20 || dx > size - 20 || dy > size - 20) continue;
          const s = decoSprite((h >>> 20) % DECO_COUNT);
          g.drawImage(s.cv, dx + s.dx, dy + s.dy, s.w, s.h);
        }
      }
    }

    // the Kristalhart's circle: tinted by its holder, with the current claim as an arc
    const sh = world.shrine;
    if (sh && inView(sh.x, sh.y, sh.r + 60)) {
      const holder = sh.owner >= 0 ? colorOf(sh.owner) : null;
      g.fillStyle = holder ? holder.main : '#ffffff';
      g.globalAlpha = 0.16 + 0.04 * Math.sin(r.frame * 0.05);
      g.beginPath(); g.ellipse(sh.x, sh.y, sh.r, sh.r * 0.9, 0, 0, TAU); g.fill();
      g.globalAlpha = 0.9;
      g.strokeStyle = holder ? holder.main : '#fff6cf'; g.lineWidth = 4;
      g.setLineDash([10, 12]); g.lineDashOffset = r.frame * 0.3;
      g.stroke();
      g.setLineDash([]);
      if (sh.contender >= 0 && sh.progress > 0) {
        g.strokeStyle = '#2a1a10'; g.lineWidth = 11; g.lineCap = 'round';
        g.beginPath(); g.ellipse(sh.x, sh.y, sh.r, sh.r * 0.9, 0, -Math.PI / 2, -Math.PI / 2 + sh.progress * TAU); g.stroke();
        g.strokeStyle = colorOf(sh.contender).main; g.lineWidth = 7;
        g.stroke();
      }
      g.globalAlpha = 1;
    }

    // spawn shields lie on the ground
    for (const b of world.buildings) {
      if (b.kind !== 'hq') continue;
      const p = world.players[b.owner];
      if (p.shieldUntil <= time || !inView(b.x, b.y, 200)) continue;
      const left = p.shieldUntil - time;
      g.globalAlpha = left < 10 ? 0.45 + 0.35 * Math.sin(r.frame * 0.3) : 0.9;
      g.fillStyle = 'rgba(160, 225, 255, 0.16)';
      g.strokeStyle = '#e8f8ff'; g.lineWidth = 3.5;
      g.setLineDash([16, 11]); g.lineDashOffset = -r.frame * 0.4;
      g.beginPath(); g.ellipse(b.x, b.y, 165, 150, 0, 0, TAU); g.fill(); g.stroke();
      g.setLineDash([]); g.globalAlpha = 1;
    }

    // collect everything standing on the ground, then paint back to front
    items.length = 0;
    for (const c of world.crystals) {
      if (c.x < x0 - 20 || c.x > x1 + 20 || c.y < y0 - 10 || c.y > y1 + 34) continue;
      items.push({ y: c.y, c });
    }
    for (const b of world.buildings) {
      if (b.x < x0 - 70 || b.x > x1 + 70 || b.y < y0 - 40 || b.y > y1 + 110) continue;
      items.push({ y: b.y, b });
    }
    for (const u of world.units) {
      const ux = u.px + (u.x - u.px) * alpha, uy = u.py + (u.y - u.py) * alpha;
      if (ux < x0 - 50 || ux > x1 + 50 || uy < y0 - 12 || uy > y1 + 70) continue;
      items.push({ y: uy + (UNITS[u.kind].flying ? 30 : 0), u, x: ux, uy });
    }
    if (sh && inView(sh.x, sh.y, 160)) items.push({ y: sh.y, sh });
    items.sort((a, b) => a.y - b.y);

    const cs = crystalSprite();
    for (const it of items) {
      if (it.sh) {
        const s = shrineSprite();
        const bob = Math.sin(r.frame * 0.04) * 2;
        g.drawImage(s.cv, sh.x + s.dx, sh.y + s.dy + bob * 0.3, s.w, s.h);
        if (r.frame % 50 < 10) sparkle(g, sh.x + 10, sh.y - 92, 6);
        if (r.frame % 70 > 58) sparkle(g, sh.x - 20, sh.y - 40, 5);
        const holder = world.players[sh.owner];
        label(g, 'Kristalhart', sh.x, sh.y + s.dy - 14, '#fff3b0', 15);
        label(g, holder ? (sh.owner === meId ? 'van jou' : `van ${holder.name}`) : 'vrij — ga er alleen op staan', sh.x, sh.y + s.dy + 2, holder ? colorOf(sh.owner).light : '#ffffff', 12);
      } else if (it.c) {
        const c = it.c;
        const bob = Math.sin(r.frame * 0.06 + c.id) * 1.5;
        g.drawImage(cs.cv, c.x + cs.dx, c.y + cs.dy + bob, cs.w, cs.h);
        if ((r.frame + c.id * 13) % 90 < 12) sparkle(g, c.x + ((c.id % 3) - 1) * 6, c.y - 20 + bob, 4);
      } else if (it.b) {
        const b = it.b, def = BUILDINGS[b.kind], col = colorOf(b.owner);
        const flash = time - b.hitAt < 0.08;
        const s = buildingSprite(b.kind, col, flash);
        g.drawImage(s.cv, b.x + s.dx, b.y + s.dy, s.w, s.h);
        let top = b.y + s.dy - 2;
        if (b.kind === 'hq') {
          const p = world.players[b.owner];
          label(g, b.owner === meId ? 'Jouw kasteel' : p.name, b.x, top, b.owner === meId ? '#ffffff' : col.light, 14);
          top -= 16;
        }
        if (b.hp < b.maxHp) bar(g, b.x, top - 4, def.radius * 1.5, b.hp / b.maxHp, 5, null);
        if (b.train) bar(g, b.x, b.y + def.radius * 0.45 + 8, def.radius * 1.2, 1 - b.train.left / b.train.total, 4, '#7fd6ff');
      } else {
        const u = it.u, def = UNITS[u.kind], col = colorOf(u.owner);
        let flip = flips.get(u) || false;
        if (u.fx < -0.15) flip = true; else if (u.fx > 0.15) flip = false;
        flips.set(u, flip);
        const attacking = time - u.atkAt < 0.2;
        const moving = (u.x - u.px) ** 2 + (u.y - u.py) ** 2 > 0.3;
        let f = 0;
        if (attacking) f = 2;
        else if (def.flying) f = Math.floor(time * 5 + u.id * 0.37) % 2;
        else if (moving) f = Math.floor(time * 7 + u.id * 0.37) % 2;
        const flash = time - u.hitAt < 0.07;
        const s = unitSprite(u.kind, col, f, flip, flash, u.spec);
        if (u.slowUntil > time) { // frost on the ground under an iced unit
          g.strokeStyle = 'rgba(200, 240, 255, 0.9)'; g.lineWidth = 2.5;
          g.beginPath(); g.ellipse(it.x, it.uy, def.radius + 6, (def.radius + 6) * 0.45, 0, 0, TAU); g.stroke();
        }
        const sc = SCALE[u.kind] || 1; // elite troops are drawn bigger
        g.drawImage(s.cv, it.x + s.dx * sc, it.uy + s.dy * sc, s.w * sc, s.h * sc);
        if (u.slowUntil > time) snowflake(g, it.x + def.radius, it.uy + s.dy * sc + 6, 4);
        if (u.burnUntil > time) { // flickering fire on a burning unit
          const fl = 1 + 0.25 * Math.sin(r.frame * 0.6 + u.id);
          g.fillStyle = 'rgba(255, 140, 40, 0.85)';
          g.beginPath(); g.ellipse(it.x - 3, it.uy + s.dy + 10, 3.5 * fl, 6 * fl, 0, 0, TAU); g.fill();
          g.fillStyle = 'rgba(255, 230, 120, 0.9)';
          g.beginPath(); g.ellipse(it.x + 3, it.uy + s.dy + 12, 2.2 * fl, 4 * fl, 0, 0, TAU); g.fill();
        }
        const top = it.uy + s.dy * sc + (u.kind === 'commander' ? 0 : 4);
        if (u.hp < u.maxHp) bar(g, it.x, top - 3, def.radius * 2 + 6, u.hp / u.maxHp, 3.5, null);
        if (u.kind === 'caravan') {
          if (u.hp >= u.maxHp) bar(g, it.x, top - 3, def.radius * 2 + 6, 1, 3.5, null);
          label(g, 'Goudkaravaan', it.x, top - 9, '#ffe58a', 14);
        }
        if (u.kind === 'commander') {
          const ty = top - (u.hp < u.maxHp ? 8 : 2);
          label(g, u.owner === meId ? 'Jij' : world.players[u.owner].name, it.x, ty, u.owner === meId ? '#ffffff' : col.light, 13);
          if (u.owner === world.leader) drawCrown(g, it.x, ty - 20, r.frame);
          const me = world.players[meId];
          if (me && me.revenge === u.owner) label(g, 'WRAAK', it.x, ty - (u.owner === world.leader ? 40 : 16), '#ff8a7a', 11);
        }
      }
    }

    drawEffects(g, r, frameDt);
    drawMinimap(g, r, world, me, meId);
  };

  return r;
}

// A small gold crown floating over the leader's name.
function drawCrown(g, x, y, frame) {
  const bob = Math.sin(frame * 0.08) * 1.5;
  y += bob;
  g.fillStyle = 'rgba(255, 210, 74, 0.25)';
  g.beginPath(); g.arc(x, y - 5, 13, 0, TAU); g.fill();
  g.beginPath();
  g.moveTo(x - 11, y); g.lineTo(x - 12, y - 10); g.lineTo(x - 6, y - 5); g.lineTo(x, y - 13);
  g.lineTo(x + 6, y - 5); g.lineTo(x + 12, y - 10); g.lineTo(x + 11, y); g.closePath();
  g.fillStyle = '#ffd24a'; g.fill();
  g.lineWidth = 1.8; g.strokeStyle = '#2a1a10'; g.stroke();
  g.fillStyle = '#ff5a5a'; g.beginPath(); g.arc(x, y - 4, 2, 0, TAU); g.fill();
  g.fillStyle = '#7fe3ff';
  g.beginPath(); g.arc(x - 6, y - 3, 1.3, 0, TAU); g.fill();
  g.beginPath(); g.arc(x + 6, y - 3, 1.3, 0, TAU); g.fill();
}

function snowflake(g, x, y, s) {
  g.strokeStyle = '#e6fbff'; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath();
  for (let i = 0; i < 3; i++) {
    const a = i * Math.PI / 3;
    g.moveTo(x - Math.cos(a) * s, y - Math.sin(a) * s); g.lineTo(x + Math.cos(a) * s, y + Math.sin(a) * s);
  }
  g.stroke();
}

function sparkle(g, x, y, s) {
  g.fillStyle = '#ffffff';
  g.beginPath();
  g.moveTo(x, y - s); g.lineTo(x + s * 0.25, y - s * 0.25); g.lineTo(x + s, y); g.lineTo(x + s * 0.25, y + s * 0.25);
  g.lineTo(x, y + s); g.lineTo(x - s * 0.25, y + s * 0.25); g.lineTo(x - s, y); g.lineTo(x - s * 0.25, y - s * 0.25);
  g.closePath(); g.fill();
}

function drawEffects(g, r, frameDt) {
  for (let i = r.effects.length - 1; i >= 0; i--) {
    const e = r.effects[i];
    e.t += frameDt;
    const k = e.t / e.life;
    if (k >= 1) { r.effects[i] = r.effects[r.effects.length - 1]; r.effects.pop(); continue; }
    if (e.kind === 'arrow' || e.kind === 'bolt' || e.kind === 'orb' || e.kind === 'flame') {
      const x = e.x + (e.x2 - e.x) * k;
      const y = e.y + (e.y2 - e.y) * k - Math.sin(k * Math.PI) * (e.kind === 'arrow' ? 10 : e.kind === 'bolt' ? 4 : 0);
      if (e.kind === 'bolt') {
        // heavy ballista bolt: thick shaft, steel head, a pale streak behind it
        const d = Math.hypot(e.x2 - e.x, e.y2 - e.y) || 1;
        const ux = (e.x2 - e.x) / d, uy = (e.y2 - e.y) / d;
        g.lineCap = 'round';
        g.strokeStyle = 'rgba(255, 255, 255, 0.35)'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(x - ux * 40, y - uy * 40); g.lineTo(x - ux * 16, y - uy * 16); g.stroke();
        g.strokeStyle = '#2a1a10'; g.lineWidth = 5;
        g.beginPath(); g.moveTo(x - ux * 20, y - uy * 20); g.lineTo(x, y); g.stroke();
        g.strokeStyle = '#b98a55'; g.lineWidth = 2.6;
        g.beginPath(); g.moveTo(x - ux * 20, y - uy * 20); g.lineTo(x - ux * 3, y - uy * 3); g.stroke();
        g.fillStyle = '#d6dde5'; g.strokeStyle = '#2a1a10'; g.lineWidth = 1.4;
        g.beginPath(); g.moveTo(x + ux * 6, y + uy * 6); g.lineTo(x - uy * 4, y + ux * 4); g.lineTo(x + uy * 4, y - ux * 4); g.closePath(); g.fill(); g.stroke();
      } else if (e.kind === 'arrow') {
        const d = Math.hypot(e.x2 - e.x, e.y2 - e.y) || 1;
        const ux = (e.x2 - e.x) / d, uy = (e.y2 - e.y) / d;
        g.lineCap = 'round';
        g.strokeStyle = '#2a1a10'; g.lineWidth = 3.4;
        g.beginPath(); g.moveTo(x - ux * 11, y - uy * 11); g.lineTo(x, y); g.stroke();
        g.strokeStyle = '#f4e6c8'; g.lineWidth = 1.6;
        g.beginPath(); g.moveTo(x - ux * 11, y - uy * 11); g.lineTo(x - ux * 2, y - uy * 2); g.stroke();
      } else {
        const fire = e.kind === 'flame';
        g.fillStyle = fire ? 'rgba(255, 150, 40, 0.4)' : 'rgba(190, 140, 255, 0.4)';
        g.beginPath(); g.arc(x, y, 9, 0, TAU); g.fill();
        g.fillStyle = fire ? '#ffd76a' : '#f1e4ff';
        g.strokeStyle = fire ? '#c7461a' : '#6b3fc4'; g.lineWidth = 1.6;
        g.beginPath(); g.arc(x, y, 4.5, 0, TAU); g.fill(); g.stroke();
      }
      continue;
    }
    g.globalAlpha = 1 - k;
    if (e.kind === 'boom') {
      const rad = e.size * (0.35 + 0.75 * Math.sqrt(k));
      g.fillStyle = e.fire ? 'rgba(255, 140, 40, 0.5)' : 'rgba(170, 110, 255, 0.5)';
      g.beginPath(); g.ellipse(e.x, e.y, rad, rad * 0.72, 0, 0, TAU); g.fill();
      g.strokeStyle = e.fire ? '#fff0a0' : '#f1e4ff'; g.lineWidth = 3 * (1 - k) + 1;
      g.stroke();
      g.fillStyle = e.fire ? '#fff0a0' : '#ffffff';
      for (let j = 0; j < 6; j++) {
        const a = j * 1.05 + e.x, d = rad * (0.5 + k * 0.6);
        g.beginPath(); g.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.72 - k * 14, 2.6 * (1 - k) + 0.6, 0, TAU); g.fill();
      }
    } else if (e.kind === 'heal') {
      g.lineCap = 'round';
      for (let j = 0; j < 3; j++) {
        const x = e.x + (j - 1) * 9, y = e.y - 14 - k * 26 - j * 5;
        g.lineWidth = 4.5; g.strokeStyle = '#1f7a3d';
        g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke();
        g.lineWidth = 2.2; g.strokeStyle = '#a8ffbf';
        g.beginPath(); g.moveTo(x - 4, y); g.lineTo(x + 4, y); g.moveTo(x, y - 4); g.lineTo(x, y + 4); g.stroke();
      }
    } else if (e.kind === 'star') {
      g.strokeStyle = '#fff3a0'; g.lineWidth = 3; g.lineCap = 'round';
      g.beginPath();
      for (let j = 0; j < 8; j++) {
        const a = j * 0.785, d0 = 6 + k * 10, d1 = 14 + k * 22;
        g.moveTo(e.x + Math.cos(a) * d0, e.y + Math.sin(a) * d0);
        g.lineTo(e.x + Math.cos(a) * d1, e.y + Math.sin(a) * d1);
      }
      g.stroke();
    } else if (e.kind === 'spark') {
      g.strokeStyle = '#ffffff'; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath();
      for (let j = 0; j < 3; j++) {
        const a = e.a + j * 2.1, d0 = 4 + k * 6, d1 = 8 + k * 12;
        g.moveTo(e.x + Math.cos(a) * d0, e.y + Math.sin(a) * d0);
        g.lineTo(e.x + Math.cos(a) * d1, e.y + Math.sin(a) * d1);
      }
      g.stroke();
    } else if (e.kind === 'ring') {
      g.strokeStyle = e.color; g.lineWidth = 3.5 * (1 - k) + 1;
      const rad = e.size * (0.4 + k * 0.9);
      g.beginPath(); g.ellipse(e.x, e.y, rad, rad * 0.72, 0, 0, TAU); g.stroke();
    } else if (e.kind === 'puff') {
      g.fillStyle = '#f3efe6';
      for (let j = 0; j < 7; j++) {
        const a = j * 0.9 + e.seed, d = e.size * (0.2 + k * 0.9);
        g.beginPath();
        g.arc(e.x + Math.cos(a) * d, e.y + Math.sin(a) * d * 0.6 - k * 12, e.size * 0.42 * (1 - k * 0.5), 0, TAU);
        g.fill();
      }
    } else if (e.kind === 'coins') {
      for (let j = 0; j < 16; j++) {
        const a = j * 0.39 + e.seed, sp = 60 + (j % 5) * 22;
        const x = e.x + Math.cos(a) * sp * k, y = e.y - Math.sin(1.2 + (j % 3) * 0.4) * 90 * k + 160 * k * k + Math.sin(a) * 18 * k;
        g.fillStyle = j % 3 ? '#ffd24a' : '#fff0a8';
        g.strokeStyle = '#7a5200'; g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(x, y, 4.2, 3, j, 0, TAU); g.fill(); g.stroke();
      }
    } else if (e.kind === 'text') {
      g.font = `800 18px ${FONT}`;
      g.textAlign = 'center';
      g.lineWidth = 4; g.strokeStyle = '#3a2500';
      g.strokeText(e.text, e.x, e.y - k * 34);
      g.fillStyle = '#ffd94a';
      g.fillText(e.text, e.x, e.y - k * 34);
    }
  }
  g.globalAlpha = 1;
}

function bar(g, x, y, w, k, h, color) {
  g.fillStyle = 'rgba(30, 20, 10, 0.75)';
  g.beginPath(); g.roundRect(x - w / 2 - 1.2, y - 1.2, w + 2.4, h + 2.4, 2); g.fill();
  g.fillStyle = color || (k > 0.5 ? '#6fe06a' : k > 0.25 ? '#ffc542' : '#ff5a4a');
  g.fillRect(x - w / 2, y, w * Math.max(0, Math.min(1, k)), h);
}

function label(g, text, x, y, color, px) {
  g.font = `800 ${px}px ${FONT}`;
  g.textAlign = 'center';
  g.lineWidth = 3.5;
  g.strokeStyle = 'rgba(30, 20, 10, 0.85)';
  g.strokeText(text, x, y);
  g.fillStyle = color;
  g.fillText(text, x, y);
}

function drawMinimap(g, r, world, me, meId) {
  g.setTransform(r.dpr, 0, 0, r.dpr, 0, 0);
  const s = r.w < 900 ? 132 : MINIMAP, k = s / world.size;
  // On narrow windows the scoreboard is hidden and the map takes its corner.
  const ox = r.w - s - 16, oy = r.w < 900 ? 16 : r.h - s - 16;
  g.fillStyle = '#2a1a10';
  g.beginPath(); g.roundRect(ox - 5, oy - 5, s + 10, s + 10, 10); g.fill();
  g.fillStyle = '#4f8a3c';
  g.beginPath(); g.roundRect(ox, oy, s, s, 6); g.fill();
  g.save();
  g.beginPath(); g.roundRect(ox, oy, s, s, 6); g.clip();
  g.fillStyle = 'rgba(255, 225, 120, 0.8)';
  for (const c of world.crystals) g.fillRect(ox + c.x * k - 0.8, oy + c.y * k - 0.8, 1.6, 1.6);
  for (const b of world.buildings) {
    if (b.kind !== 'hq') continue;
    const p = world.players[b.owner];
    if (p && p.shieldUntil > world.time) {
      g.strokeStyle = 'rgba(232, 248, 255, 0.8)'; g.lineWidth = 1;
      g.beginPath(); g.arc(ox + b.x * k, oy + b.y * k, 8, 0, TAU); g.stroke();
    }
  }
  if (world.mini) {
    // online: the server sends dots for the whole map now and then
    const m = world.mini;
    for (let i = 0; i < m.length; i += 3) {
      g.fillStyle = colorOf(m[i]).main;
      g.fillRect(ox + m[i + 1] * 8 * k - 0.9, oy + m[i + 2] * 8 * k - 0.9, 1.8, 1.8);
    }
  } else {
    for (const u of world.units) {
      if (u.kind === 'commander') continue;
      g.fillStyle = colorOf(u.owner).main;
      g.fillRect(ox + u.x * k - 0.9, oy + u.y * k - 0.9, 1.8, 1.8);
    }
  }
  for (const b of world.buildings) {
    const z = b.kind === 'hq' ? 8 : 4.5;
    g.fillStyle = '#2a1a10';
    g.fillRect(ox + b.x * k - z / 2 - 1, oy + b.y * k - z / 2 - 1, z + 2, z + 2);
    g.fillStyle = colorOf(b.owner).main;
    g.fillRect(ox + b.x * k - z / 2, oy + b.y * k - z / 2, z, z);
  }
  for (const u of world.units) {
    if (u.kind !== 'commander') continue;
    if (u.owner === world.leader) {
      g.strokeStyle = '#ffd24a'; g.lineWidth = 2;
      g.beginPath(); g.arc(ox + u.x * k, oy + u.y * k, 6.5, 0, TAU); g.stroke();
    }
    g.fillStyle = colorOf(u.owner).main;
    g.strokeStyle = u.owner === meId ? '#ffffff' : '#2a1a10'; g.lineWidth = 1.4;
    g.beginPath(); g.arc(ox + u.x * k, oy + u.y * k, 3.4, 0, TAU); g.fill(); g.stroke();
  }
  const cv = world.caravan;
  if (cv && cv.state !== 'gone') {
    const x = ox + cv.x * k, y = oy + cv.y * k;
    if (cv.ex !== undefined && cv.state === 'rolling') {
      g.setLineDash([3, 3]); g.strokeStyle = 'rgba(255, 229, 138, 0.55)'; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(ox + cv.ex * k, oy + cv.ey * k); g.stroke(); g.setLineDash([]);
    }
    const pulse = 6 + 3 * Math.sin(r.frame * 0.15);
    g.strokeStyle = 'rgba(255, 229, 138, 0.8)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(x, y, pulse, 0, TAU); g.stroke();
    g.fillStyle = '#ffd24a'; g.strokeStyle = '#2a1a10'; g.lineWidth = 1.4;
    g.beginPath(); g.roundRect(x - 4, y - 3, 8, 6, 1.5); g.fill(); g.stroke();
  }
  if (world.shrine) {
    const sx = ox + world.shrine.x * k, sy = oy + world.shrine.y * k;
    g.fillStyle = world.shrine.owner >= 0 ? colorOf(world.shrine.owner).main : '#ffe58a';
    g.strokeStyle = '#2a1a10'; g.lineWidth = 1.4;
    g.beginPath(); g.moveTo(sx, sy - 6); g.lineTo(sx + 4.5, sy); g.lineTo(sx, sy + 6); g.lineTo(sx - 4.5, sy); g.closePath();
    g.fill(); g.stroke();
  }
  if (me && me.revenge >= 0 && world.players[me.revenge]) {
    const hq = world.buildings.find((b) => b.id === world.players[me.revenge].hqId);
    if (hq) {
      g.strokeStyle = '#ff5a4a'; g.lineWidth = 2;
      g.beginPath(); g.arc(ox + hq.x * k, oy + hq.y * k, 9, 0, TAU); g.stroke();
    }
  }
  if (me && me.army === 'attack' && world.players[me.armyTarget]) {
    const hq = world.buildings.find((b) => b.id === world.players[me.armyTarget].hqId);
    if (hq) {
      const x = ox + hq.x * k, y = oy + hq.y * k;
      g.strokeStyle = '#ffffff'; g.lineWidth = 2;
      g.beginPath(); g.moveTo(x - 7, y - 7); g.lineTo(x + 7, y + 7); g.moveTo(x + 7, y - 7); g.lineTo(x - 7, y + 7); g.stroke();
    }
  }
  if (me && me.alive && world.time - me.hqHitAt < 2 && r.frame % 20 < 10) {
    const hq = world.buildings.find((b) => b.id === me.hqId);
    if (hq) { g.strokeStyle = '#ff3b2f'; g.lineWidth = 2.5; g.beginPath(); g.arc(ox + hq.x * k, oy + hq.y * k, 11, 0, TAU); g.stroke(); }
  }
  const vw = r.w / r.scale * k, vh = r.h / r.scale * k;
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 1.2;
  g.strokeRect(ox + r.cam.x * k - vw / 2, oy + r.cam.y * k - vh / 2, vw, vh);
  g.restore();
}
