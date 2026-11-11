// Hand-drawn vector models, rendered once into small canvases and reused every frame.
// Everything is drawn facing right with the origin at the feet; mirrored copies are cached too.
// A unit's draw function also gets its specialisation id, so a specialised troop swaps
// weapons, headgear and trim inside the model instead of having something pasted on top.

const RES = 3; // sprite pixels per world unit: stays crisp when zoomed
const INK = '#2a1a10';
const SKIN = '#f3c9a1';
const STEEL = '#c5ced8';
const STEEL_D = '#8c97a3';
const WOOD = '#9a6a3c';
const WOOD_D = '#6b4423';
const GOLD = '#ffd24a';
const STONE = '#d6cdbb';
const STONE_D = '#a89f8c';
const TAU = Math.PI * 2;

const cache = new Map();

// ---------- tiny drawing vocabulary ----------
function ink(g, fill, lw = 1.5) {
  if (fill) { g.fillStyle = fill; g.fill(); }
  if (lw) { g.lineWidth = lw; g.strokeStyle = INK; g.stroke(); }
}
function ell(g, x, y, rx, ry, fill, lw) {
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); ink(g, fill, lw);
}
function box(g, x, y, w, h, r, fill, lw) {
  g.beginPath(); g.roundRect(x, y, w, h, r); ink(g, fill, lw);
}
function poly(g, pts, fill, lw) {
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) g.lineTo(pts[i], pts[i + 1]);
  g.closePath(); ink(g, fill, lw);
}
function line(g, x1, y1, x2, y2, color, lw) {
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2);
  g.lineCap = 'round'; g.strokeStyle = color; g.lineWidth = lw; g.stroke();
}
function dot(g, x, y, r, fill) {
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fillStyle = fill; g.fill();
}
function ground(g, rx, ry, col) {
  g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, TAU);
  g.fillStyle = 'rgba(20, 30, 10, 0.28)'; g.fill();
  if (col) { g.lineWidth = 1.8; g.strokeStyle = col.main; g.stroke(); }
}
function feet(g, f, spread = 4, size = 3.2) {
  const s = f === 1 ? 2 : 0;
  ell(g, -spread + s, -1.5, size, size * 0.7, '#4a2f1b', 1.2);
  ell(g, spread - s, -1.5 - (f === 1 ? 1.5 : 0), size, size * 0.7, '#4a2f1b', 1.2);
}
function face(g, x, y) {
  dot(g, x + 2.2, y, 1.1, INK);
  dot(g, x + 5.6, y, 1.1, INK);
}
// Draw something rotated around a pivot (weapons).
function pivot(g, x, y, a, fn) {
  g.save(); g.translate(x, y); g.rotate(a); fn(); g.restore();
}
function sword(g, len, w) {
  box(g, -w / 2, -len, w, len, w / 2, '#e9eef3', 1.2);
  line(g, 0, -len + 2, 0, -3, STEEL_D, 0.7);
  box(g, -w * 1.6, -1.5, w * 3.2, 2.6, 1, GOLD, 1.1);
  box(g, -1.1, 1, 2.2, 4, 1, WOOD_D, 1);
}

// ---------- units ----------
const UNIT_ART = {
  soldier: {
    box: [-16, -40, 25, 6],
    boxes: { spear: [-16, -52, 40, 6], shield: [-16, -40, 25, 6] },
    draw(g, c, f, s) {
      const b = f === 1 ? -1 : 0;
      const spear = s === 'spear', shield = s === 'shield';
      ground(g, 10, 4.5, c);
      feet(g, f);
      if (shield) { // sword arm behind the big shield, chopping over the top when attacking
        pivot(g, f === 2 ? 2 : -6, (f === 2 ? -20 : -14) + b, f === 2 ? 1.1 : -0.6, () => sword(g, 15, 2.8));
      } else if (!spear) {
        pivot(g, 7, -11 + b, f === 2 ? 1.25 : 0.35, () => sword(g, 15, 2.6));
      }
      box(g, -7, -18 + b, 14, 14.5, 5, c.main);
      box(g, -7, -9.5 + b, 14, 2.6, 1, WOOD_D, 1);
      ell(g, 0.5, -24.5 + b, 7.4, 7, SKIN);
      face(g, 0, -24 + b);
      if (spear) { // tall horsehair crest in team colour, front to back
        g.beginPath(); g.moveTo(-9.5, -27 + b); g.quadraticCurveTo(-11, -41.5 + b, 1, -42 + b);
        g.quadraticCurveTo(10, -41 + b, 10.5, -30 + b); g.closePath(); ink(g, c.main, 1.3);
        for (const [x, y] of [[-7.5, -37], [-3, -40.2], [2.5, -40.5], [7.5, -37.5]]) line(g, 0.5, -30 + b, x, y + b, c.dark, 0.9);
      }
      g.beginPath(); g.arc(0.5, -25.5 + b, 7.9, Math.PI * 1.02, -0.02 * Math.PI); g.closePath(); ink(g, STEEL);
      if (shield) { // kettle hat: wide steel brim, no plume
        box(g, -10.5, -28.6 + b, 22, 2.8, 1.4, STEEL_D, 1.2);
        line(g, -4.5, -31.2 + b, 5.5, -31.2 + b, '#e9eef3', 1);
        ell(g, 0.5, -33.6 + b, 1.7, 1.5, GOLD, 1);
      } else {
        box(g, -8, -26.5 + b, 17, 2.4, 1, STEEL_D, 1.1);
        if (!spear) ell(g, -1, -34.5 + b, 2.6, 3.4, c.main, 1.1);
      }
      if (spear) { // long spear with a pennant: upright at rest, levelled for the thrust
        const t = f === 2;
        pivot(g, t ? 0 : 8.5, (t ? -14 : -11) + b, t ? 1.42 : 0.1, () => {
          line(g, 0, 13, 0, -27, INK, 3.2);
          line(g, 0, 13, 0, -27, WOOD, 1.7);
          const d = t ? 1 : -1; // the pennant hangs down during the thrust
          poly(g, [d * 0.8, -25.5, d * 8.5, -24, d * 5.5, -22, d * 9, -19.8, d * 0.8, -19.5], c.main, 1);
          poly(g, [0, -38, 3, -30.5, 1.3, -26, -1.3, -26, -3, -30.5], '#e9eef3', 1.1);
          line(g, 0, -35.5, 0, -28, STEEL_D, 0.7);
          ell(g, 0, 0, 2, 2, SKIN, 1);
        });
      }
      if (shield) { // tall heater shield held out in front
        const sh = (i, fill, lw) => {
          g.beginPath(); g.moveTo(-1 + i, -21 + b + i); g.lineTo(14 - i, -21 + b + i); g.lineTo(14 - i, -8 + b);
          g.quadraticCurveTo(14 - i, -1 + b - i * 0.7, 6.5, 1 + b - i * 1.2);
          g.quadraticCurveTo(-1 + i, -1 + b - i * 0.7, -1 + i, -8 + b); g.closePath(); ink(g, fill, lw);
        };
        sh(0, STEEL, 1.6);
        sh(1.9, c.main, 0.9);
        line(g, 6.5, -17 + b, 6.5, -3.5 + b, c.light, 1.7);
        line(g, 2.5, -12.5 + b, 10.5, -12.5 + b, c.light, 1.7);
        ell(g, 6.5, -12.5 + b, 2.1, 2.1, GOLD, 1);
      } else {
        ell(g, -6.5, -11.5 + b, 5.6, 6.6, c.dark);
        ell(g, -6.5, -11.5 + b, 3.6, 4.6, c.main, 0);
        dot(g, -6.5, -11.5 + b, 1.5, c.light);
      }
    },
  },

  archer: {
    box: [-15, -38, 23, 6],
    boxes: { sharp: [-19, -47, 27, 6], firearrow: [-17, -40, 26, 6] },
    draw(g, c, f, s) {
      const b = f === 1 ? -1 : 0;
      const sharp = s === 'sharp', fire = s === 'firearrow';
      ground(g, 9.5, 4.3, c);
      feet(g, f, 3.6, 3);
      if (sharp) { // ranger's cloak
        g.beginPath(); g.moveTo(-5.5, -17.5 + b); g.quadraticCurveTo(-13.5, -10, -11.5, -1.5);
        g.lineTo(-6.5, -4); g.lineTo(-2.5, -1.5); g.lineTo(2, -16 + b); g.closePath(); ink(g, c.dark);
      }
      pivot(g, -6.5, -14 + b, -0.35, () => {
        box(g, -2.2, -7, 4.4, 12, 1.5, fire ? '#4a4a52' : WOOD_D, 1.1);
        if (fire) { // a quiver full of burning arrows
          dot(g, 0, -10.5, 5.5, 'rgba(255, 214, 110, 0.4)');
          flame(g, 0, -6.5, 3.6);
        } else {
          line(g, -0.8, -7, -1.4, -10.5, '#f4efe2', 1.3);
          line(g, 1, -7, 1.4, -10.5, c.light, 1.3);
        }
      });
      box(g, -6, -17.5 + b, 12, 14, 4.5, c.main);
      line(g, -5, -17 + b, 5, -5 + b, WOOD_D, 1.6);
      ell(g, 0.5, -23 + b, 6.6, 6.3, SKIN);
      face(g, -0.3, -22.5 + b);
      if (sharp) { // pointed hunter's cap with a long feather
        poly(g, [-4.5, -29.5 + b, -17.5, -41.5 + b, -15.5, -45 + b, -11, -45.5 + b, 0.5, -32.5 + b], '#f4efe2', 1.1);
        line(g, -2.5, -31.5 + b, -13, -42 + b, STEEL_D, 0.7);
        g.beginPath(); g.moveTo(-7.6, -24.6 + b); g.quadraticCurveTo(-8.8, -33.5 + b, 0, -33 + b);
        g.quadraticCurveTo(7.5, -32.3 + b, 14, -26.2 + b); g.quadraticCurveTo(4, -27.8 + b, -7.6, -24.6 + b);
        g.closePath(); ink(g, c.dark);
        line(g, -6.6, -26.6 + b, 5, -28.6 + b, c.light, 1.2);
      } else { // hood
        g.beginPath();
        g.moveTo(-7.4, -19.5 + b); g.quadraticCurveTo(-9.5, -31 + b, 1, -31.5 + b);
        g.quadraticCurveTo(7.5, -31 + b, 7.6, -25.5 + b); g.quadraticCurveTo(1, -28 + b, -3, -22 + b);
        g.closePath(); ink(g, c.dark);
        if (fire) line(g, -6.8, -27.5 + b, 0.5, -30.6 + b, '#ff8a2b', 1.5);
      }
      // bow (a longbow for the sharpshooter) and a nocked arrow
      const R = sharp ? 13.5 : 9.5, cy = (sharp ? -14.5 : -13) + b;
      const pull = f === 2 ? (sharp ? 5 : 3.5) : 0;
      g.beginPath(); g.arc(4.5, cy, R, -1.15, 1.15);
      g.lineCap = 'round'; g.lineWidth = sharp ? 3.6 : 3.2; g.strokeStyle = INK; g.stroke();
      g.lineWidth = sharp ? 2 : 1.7; g.strokeStyle = fire ? '#5b3a22' : WOOD; g.stroke();
      if (sharp) { dot(g, 4.5 + R, cy, 1.5, c.light); }
      const sx = 4.5 + Math.cos(1.15) * R, sy = Math.sin(1.15) * R;
      g.beginPath(); g.moveTo(sx, cy - sy); g.lineTo(sx - pull, cy); g.lineTo(sx, cy + sy);
      g.lineWidth = 0.8; g.strokeStyle = '#f4efe2'; g.stroke();
      if (f === 2 || fire) {
        const tip = sharp ? 22 : fire && f !== 2 ? 15.5 : 17;
        line(g, sx - pull, cy, tip, cy, WOOD_D, 1.3);
        if (fire) { // the arrowhead is wrapped in burning cloth
          dot(g, tip + 1.5, cy - 2.5, f === 2 ? 6.5 : 5, 'rgba(255, 214, 110, 0.4)');
          flame(g, tip + 1.5, cy + 2.5, f === 2 ? 3.9 : 3.3);
        } else {
          poly(g, [tip, cy - 2, tip + 3, cy, tip, cy + 2], STEEL, 0.8);
        }
      }
    },
  },

  knight: {
    box: [-22, -48, 42, 7],
    boxes: { heavy: [-23, -53, 44, 7], light: [-28, -48, 42, 7] },
    draw(g, c, f, s) {
      const heavy = s === 'heavy', light = s === 'light';
      const coat = heavy ? '#5a3c26' : light ? '#f3ead9' : '#a06a3a';
      const mane = heavy ? '#2e1c0e' : light ? '#b7a380' : '#4a2f1b';
      const legC = heavy ? '#3f2916' : light ? '#d2c4a8' : '#6b4526';
      const b = f === 1 ? -1.2 : 0;
      ground(g, 16, 5.5, c);
      // legs
      const l = f === 1 ? (light ? 4 : 2.5) : 0;
      for (const [x, d] of [[-9, l], [-5, -l], [6, -l], [10, l]]) {
        box(g, x + d - 1.3, -8, 2.8, 8.5, 1.2, legC, 1.1);
        if (heavy) box(g, x + d - 1.7, -6.5, 3.6, 3.4, 1, STEEL, 0.9);
        box(g, x + d - 1.6, -1.6, 3.4, 2.2, 1, INK, 0);
      }
      // tail, body
      g.beginPath(); g.moveTo(-12, -14 + b);
      if (light) g.quadraticCurveTo(-20, -19 + b, -26, -11 + b - l * 0.4);
      else g.quadraticCurveTo(-20, -13 + b, -18, -4 + b);
      g.lineCap = 'round'; g.lineWidth = 4.2; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 2.4; g.strokeStyle = mane; g.stroke();
      ell(g, 0, -12 + b, 13.5, 7.2, coat);
      // neck and head
      poly(g, [8, -17 + b, 15, -27 + b, 20, -25 + b, 14, -11 + b], coat);
      ell(g, 19.5, -25.5 + b, 5.6, 3.6, coat);
      poly(g, [14.5, -29 + b, 16, -33 + b, 17.6, -28.5 + b], coat, 1.1);
      dot(g, 20, -26.5 + b, 1, INK);
      line(g, 9, -19 + b, 14, -27.5 + b, mane, 2.4);
      line(g, 16, -23 + b, 23.5, -24 + b, c.light, 1);
      if (light) { // just a saddle blanket: the horse itself shows
        box(g, -7, -18.5 + b, 13, 8, 2.2, c.main);
        line(g, -6, -12.3 + b, 5, -12.3 + b, c.light, 1.2);
        line(g, -0.5, -10.5 + b, -0.5, -5.2 + b, WOOD_D, 1.3);
      } else { // caparison in team colour
        g.beginPath();
        g.moveTo(-10, -17 + b); g.lineTo(9, -17 + b); g.lineTo(10, -6 + b);
        g.lineTo(5, -8 + b); g.lineTo(0, -5.5 + b); g.lineTo(-5, -8 + b); g.lineTo(-11, -6 + b);
        g.closePath(); ink(g, c.main);
        if (!heavy) line(g, -9.5, -14.5 + b, 9, -14.5 + b, c.light, 1.2);
      }
      if (heavy) { // steel barding: flank plates, neck guard and a spiked chanfron
        poly(g, [-11, -18 + b, 10, -18 + b, 10.4, -11.5 + b, -11.4, -11.5 + b], STEEL, 1.3);
        line(g, -10, -16.2 + b, 9.5, -16.2 + b, '#e9eef3', 0.9);
        for (const x of [-7.5, -2.5, 2.5, 7.5]) dot(g, x, -13.6 + b, 0.9, STEEL_D);
        poly(g, [8.3, -18 + b, 14.6, -27.6 + b, 18.4, -26 + b, 12.6, -13.5 + b], STEEL, 1.2);
        line(g, 10.5, -20.5 + b, 15, -18.6 + b, STEEL_D, 0.9);
        line(g, 12.6, -24 + b, 16.8, -22.2 + b, STEEL_D, 0.9);
        poly(g, [15, -29 + b, 24.6, -27 + b, 25, -24.2 + b, 17, -23.4 + b], STEEL, 1.1);
        poly(g, [18.6, -28.6 + b, 20.6, -34 + b, 22, -27.8 + b], '#e9eef3', 1);
        dot(g, 20, -26 + b, 0.9, INK);
      }
      // lance (behind the rider's arm)
      const reach = f === 2 ? 7 : 0;
      line(g, -8 + reach, -19 + b, 25 + reach, -27 + b, INK, heavy ? 4.2 : light ? 2.6 : 3);
      line(g, -8 + reach, -19 + b, 25 + reach, -27 + b, WOOD, heavy ? 2.6 : light ? 1.3 : 1.6);
      if (heavy) {
        poly(g, [23 + reach, -30 + b, 33 + reach, -29 + b, 24.5 + reach, -24 + b], '#e9eef3', 1.1);
        poly(g, [6 + reach, -26.5 + b, 10.5 + reach, -23.5 + b, 8 + reach, -18.5 + b, 4.5 + reach, -22 + b], STEEL, 1.1);
        poly(g, [14 + reach, -24.5 + b, 21 + reach, -26.2 + b, 16.5 + reach, -19 + b], c.main, 1);
      } else if (light) {
        poly(g, [24 + reach, -28.6 + b, 30 + reach, -28.2 + b, 25 + reach, -25.4 + b], '#e9eef3', 1);
        poly(g, [17 + reach, -25.2 + b, 22 + reach, -26.4 + b, 19 + reach, -21.5 + b], c.light, 0.9);
      } else {
        poly(g, [24 + reach, -29 + b, 31 + reach, -28.5 + b, 25 + reach, -25 + b], '#e9eef3', 1);
        poly(g, [14 + reach, -24.5 + b, 20 + reach, -26 + b, 16 + reach, -20 + b], c.main, 1);
      }
      // rider
      if (light) { // scout in a tunic, a long scarf streaming behind
        const w = f === 1 ? 1.6 : 0;
        g.beginPath(); g.moveTo(-3.5, -30.5 + b); g.quadraticCurveTo(-12, -37 + b - w, -24, -32 + b + w);
        g.lineTo(-18.5, -30 + b + w); g.lineTo(-22.5, -26 + b + w);
        g.quadraticCurveTo(-12, -30.5 + b - w, -3.5, -27 + b); g.closePath(); ink(g, c.main, 1.2);
        box(g, -4.5, -27 + b, 9.5, 11.5, 3.5, c.main);
        box(g, -4.5, -19.5 + b, 9.5, 2.2, 1, WOOD_D, 0.9);
        ell(g, 0.5, -32 + b, 5.6, 5.4, SKIN);
        dot(g, 2.4, -31.6 + b, 0.95, INK); dot(g, 5, -31.6 + b, 0.95, INK);
        g.beginPath(); g.arc(0.5, -32.8 + b, 6, Math.PI * 1.02, -0.02 * Math.PI); g.closePath(); ink(g, c.dark, 1.2);
        line(g, -5, -33 + b, 6.2, -33 + b, c.light, 1.1);
      } else {
        box(g, heavy ? -5.5 : -4.5, (heavy ? -28 : -27) + b, heavy ? 11 : 9.5, heavy ? 12.5 : 11.5, 3.5, STEEL);
        if (heavy) { // kite shield
          poly(g, [-9, -26 + b, 0.5, -26 + b, 0.5, -18.5 + b, -4.2, -11.5 + b, -9, -18.5 + b], c.dark, 1.3);
          poly(g, [-6.8, -24 + b, -1.7, -24 + b, -1.7, -19 + b, -4.2, -15.2 + b, -6.8, -19 + b], c.main, 0);
          dot(g, -4.2, -20.5 + b, 1.5, GOLD);
        } else {
          ell(g, -3.5, -20 + b, 4.2, 5.2, c.dark);
          dot(g, -3.5, -20 + b, 1.6, c.light);
        }
        if (heavy) { // great helm with a towering double plume
          g.beginPath(); g.moveTo(-1, -38.5 + b); g.quadraticCurveTo(-13, -51 + b, -12.5, -35 + b);
          g.quadraticCurveTo(-6.5, -39.5 + b, -1, -37 + b); g.closePath(); ink(g, c.main, 1.2);
          g.beginPath(); g.moveTo(-0.5, -38 + b); g.quadraticCurveTo(-6.5, -46.5 + b, -7.5, -38.5 + b);
          g.quadraticCurveTo(-4, -40 + b, -0.5, -37 + b); g.closePath(); ink(g, c.light, 1);
          box(g, -5.6, -38.6 + b, 12.4, 12.4, 4, STEEL);
          line(g, 1, -33 + b, 6.6, -33 + b, INK, 1.5);
          line(g, 3.8, -36.5 + b, 3.8, -29 + b, STEEL_D, 1);
          line(g, -5, -37 + b, 6.2, -37 + b, GOLD, 1.3);
        } else {
          ell(g, 0.5, -32 + b, 5.8, 5.6, STEEL);
          line(g, 1.5, -32 + b, 6, -32 + b, INK, 1.5);
          g.beginPath(); g.moveTo(-1, -37.5 + b); g.quadraticCurveTo(-9, -44 + b, -8, -34 + b);
          g.quadraticCurveTo(-5, -37 + b, -1, -36 + b); g.closePath(); ink(g, c.main, 1.1);
        }
      }
    },
  },

  mage: {
    box: [-17, -52, 31, 6],
    boxes: { firemage: [-17, -56, 33, 6], icemage: [-17, -55, 32, 6] },
    draw(g, c, f, s) {
      const b = f === 1 ? -1 : 0;
      const fire = s === 'firemage', ice = s === 'icemage';
      const fur = '#f4fbff';
      ground(g, 10, 4.5, c);
      // staff
      pivot(g, 9.5, -8 + b, f === 2 ? 0.45 : 0.08, () => {
        line(g, 0, 8, 0, -22, INK, 3);
        line(g, 0, 8, 0, -22, fire ? '#5b3a22' : ice ? '#cfe6f2' : WOOD, 1.6);
        if (fire) { // an iron brazier with a tall flame
          dot(g, 0, -28, f === 2 ? 11 : 8, 'rgba(255, 214, 110, 0.45)');
          flame(g, 0, -23.5, f === 2 ? 5.4 : 4.2);
          poly(g, [-4, -24.5, 4, -24.5, 2.4, -20.5, -2.4, -20.5], '#4a4a52', 1.1);
        } else if (ice) { // a cluster of ice shards
          dot(g, 0, -27, f === 2 ? 11 : 8, 'rgba(150, 220, 255, 0.45)');
          poly(g, [-1.5, -21.5, -6.5, -29.5, -2.5, -27], '#8fdcff', 1);
          poly(g, [1.5, -21.5, 6.8, -30, 2.5, -27], '#8fdcff', 1);
          poly(g, [0, -20.5, -3.2, -27, 0, -36, 3.2, -27], f === 2 ? '#ffffff' : '#d9f6ff', 1.1);
          line(g, -1, -28, 0, -33, '#ffffff', 0.9);
        } else {
          dot(g, 0, -25, f === 2 ? 8 : 5.5, 'rgba(190, 150, 255, 0.35)');
          ell(g, 0, -25, 3.4, 3.4, f === 2 ? '#ffffff' : '#d7bcff', 1.1);
        }
      });
      // robe
      g.beginPath();
      g.moveTo(-6, -18 + b); g.lineTo(6, -18 + b); g.quadraticCurveTo(9, -8, 9.5, -0.5);
      g.quadraticCurveTo(0, 2, -9.5, -0.5); g.quadraticCurveTo(-9, -8, -6, -18 + b);
      g.closePath(); ink(g, c.main);
      line(g, 0, -17 + b, 0, -4, c.dark, 1.3);
      if (fire) { // flames licking up from the hem
        for (const x of [-6.6, -2.2, 2.2, 6.6]) {
          const y = Math.abs(x) > 4 ? -0.4 : 0.5;
          poly(g, [x - 2.3, y, x, y - 6.2, x + 2.3, y], '#ff8a2b', 0.9);
          poly(g, [x - 1.1, y, x, y - 3, x + 1.1, y], '#ffe066', 0);
        }
      } else if (ice) { // fur-trimmed hem
        for (const x of [-7.4, -3.7, 0, 3.7, 7.4]) ell(g, x, Math.abs(x) > 5 ? -1.6 : -0.6, 2.5, 2.1, fur, 0.9);
      } else {
        g.beginPath(); g.moveTo(-9, -3.2); g.quadraticCurveTo(0, -0.8, 9, -3.2);
        g.lineWidth = 1.6; g.strokeStyle = c.light; g.stroke();
      }
      ell(g, 0.5, -23 + b, 6.4, 6, SKIN);
      face(g, -0.3, -23.5 + b);
      // beard
      g.beginPath(); g.moveTo(-3, -21 + b); g.quadraticCurveTo(2, -19 + b, 7, -21.5 + b);
      g.quadraticCurveTo(5.5, -12 + b, 2.5, ice ? -7 + b : -9.5 + b); g.quadraticCurveTo(-1.5, -14 + b, -3, -21 + b);
      g.closePath(); ink(g, fire ? '#e9742f' : ice ? '#bfeaff' : '#f4f1ea', 1.2);
      // hat
      if (ice) { // icicles hanging from the back of the brim
        for (const x of [-8, -4.6]) poly(g, [x - 1.4, -26 + b, x, -20.5 + b, x + 1.4, -26 + b], '#bfeaff', 0.9);
      }
      ell(g, 0.5, -27.5 + b, 11, ice ? 3.6 : 3.2, ice ? fur : c.dark);
      g.beginPath(); g.moveTo(-6.5, -28 + b); g.quadraticCurveTo(-3, -40 + b, -7, -47 + b);
      g.quadraticCurveTo(4, -41 + b, 7.5, -28 + b); g.closePath(); ink(g, c.main);
      g.beginPath(); g.moveTo(-6.2, -30 + b); g.quadraticCurveTo(0.5, -27.5 + b, 7.2, -30 + b);
      g.lineWidth = fire ? 2.6 : 2; g.strokeStyle = fire ? '#ff8a2b' : c.light; g.stroke();
      if (fire) {
        for (const x of [-3.5, 0.5, 4.5]) dot(g, x, -28.9 + b + Math.abs(x - 0.5) * 0.12, 0.9, '#ffe066');
        flame(g, -6.6, -45 + b, 2.7); // the tip of the hat is alight
      } else if (ice) {
        ell(g, -6.8, -47.5 + b, 3.3, 3.3, fur, 1.1);
        for (const [x, y] of [[-1.5, -35.5], [2.5, -32], [-3.5, -40.5]]) {
          line(g, x - 1.5, y + b, x + 1.5, y + b, '#ffffff', 0.9);
          line(g, x, y - 1.5 + b, x, y + 1.5 + b, '#ffffff', 0.9);
        }
      } else {
        dot(g, 0, -35.5 + b, 1.5, GOLD);
      }
    },
  },

  healer: {
    box: [-16, -46, 31, 6],
    boxes: { priest: [-16, -55, 31, 6], herbal: [-19, -46, 31, 6] },
    draw(g, c, f, s) {
      const b = f === 1 ? -1 : 0;
      const priest = s === 'priest', herbal = s === 'herbal';
      const white = '#f6f1e4', leaf = '#5aa655', leafD = '#3d7d3f';
      ground(g, 10, 4.5, c);
      pivot(g, 9.5, -8 + b, f === 2 ? 0.4 : 0.06, () => {
        if (herbal) { // a gnarled branch that has sprouted
          line(g, 0, 8, 0, -23, INK, 3.2);
          line(g, 0, 8, 0, -23, WOOD, 1.8);
          line(g, 0, -14, 3.5, -18, INK, 2.4); line(g, 0, -14, 3.5, -18, WOOD, 1.2);
          if (f === 2) dot(g, 0, -27, 10, 'rgba(140, 255, 170, 0.45)');
          for (const [x, y, a] of [[-3.6, -25, -0.9], [3.8, -25.5, 0.9], [0, -28.5, 0], [4.8, -19.5, 1.2]]) {
            g.save(); g.translate(x, y); g.rotate(a);
            g.beginPath(); g.ellipse(0, 0, 2.5, 4.2, 0, 0, TAU); ink(g, a === 0 ? '#7bd36b' : leaf, 1);
            g.restore();
          }
          ell(g, -1.2, -22.6, 1.3, 1.3, '#e2483d', 0.7); ell(g, 1.6, -22, 1.3, 1.3, '#e2483d', 0.7);
        } else if (priest) { // a tall golden processional cross
          if (f === 2) dot(g, 0, -27, 11, 'rgba(255, 236, 140, 0.5)');
          line(g, 0, 8, 0, -33, INK, 3.4); line(g, -5.5, -26, 5.5, -26, INK, 4.6);
          line(g, 0, -20, 0, -33, INK, 4.6);
          line(g, 0, 8, 0, -33, GOLD, 1.8); line(g, -5.5, -26, 5.5, -26, GOLD, 2.8);
          line(g, 0, -20, 0, -33, GOLD, 2.8);
          ell(g, 0, -26, 1.7, 1.7, '#e2483d', 0.8);
        } else {
          line(g, 0, 8, 0, -23, INK, 3);
          line(g, 0, 8, 0, -23, GOLD, 1.6);
          if (f === 2) dot(g, 0, -27, 8, 'rgba(140, 255, 170, 0.4)');
          ell(g, 0, -27, 4.2, 4.2, '#fff6cf', 1.1);
          line(g, 0, -29.6, 0, -24.4, '#3fbf6a', 1.5);
          line(g, -2.6, -27, 2.6, -27, '#3fbf6a', 1.5);
        }
      });
      g.beginPath();
      g.moveTo(-6, -18 + b); g.lineTo(6, -18 + b); g.quadraticCurveTo(8.5, -8, 9, -0.5);
      g.quadraticCurveTo(0, 2, -9, -0.5); g.quadraticCurveTo(-8.5, -8, -6, -18 + b);
      g.closePath(); ink(g, white);
      box(g, -1.8, -17.5 + b, 3.6, 16.5, 1, c.main, 0);
      g.beginPath(); g.moveTo(-8.6, -3.4); g.quadraticCurveTo(0, -1, 8.6, -3.4);
      g.lineWidth = 1.8; g.strokeStyle = c.main; g.stroke();
      if (priest) { // golden shoulder cape and stole ends
        box(g, -7, -18.6 + b, 14, 5, 2.4, GOLD, 1.2);
        for (const x of [-5.6, 3.4]) box(g, x, -13.6 + b, 2.2, 7.5, 0.8, GOLD, 0.8);
      } else if (herbal) { // green shawl and a basket of herbs on the arm
        box(g, -7.2, -18.6 + b, 14.4, 6, 2.6, leaf, 1.2);
        g.beginPath(); g.arc(-12, -11 + b, 4, Math.PI, 0); g.lineWidth = 2.4; g.strokeStyle = INK; g.stroke();
        g.lineWidth = 1.1; g.strokeStyle = WOOD; g.stroke();
        for (const [x, y, col] of [[-14.2, -11.8, leaf], [-11.8, -12.8, '#7bd36b'], [-9.4, -11.8, leaf]]) ell(g, x, y + b, 1.9, 2.4, col, 0.8);
        box(g, -16.5, -11 + b, 9.4, 6.6, 2.2, '#c79a5e', 1.2);
        line(g, -15.5, -8.6 + b, -8, -8.6 + b, WOOD_D, 0.9);
        dot(g, -10.2, -12.6 + b, 1, '#ff8fb3');
      }
      ell(g, 0.5, -23 + b, 6.4, 6, SKIN);
      face(g, -0.3, -22.5 + b);
      // hood
      g.beginPath();
      g.moveTo(-7.2, -18.5 + b); g.quadraticCurveTo(-9.6, -31.5 + b, 1, -31.5 + b);
      g.quadraticCurveTo(7.6, -31 + b, 7.6, -25.5 + b); g.quadraticCurveTo(1, -28.5 + b, -3, -21 + b);
      g.closePath(); ink(g, herbal ? leaf : white);
      line(g, -6.5, -27 + b, 0, -30.6 + b, herbal ? leafD : c.main, 1.4);
      if (priest) { // tall mitre, the halo floating above it
        poly(g, [-4.6, -29.5 + b, -5.4, -38 + b, 0.8, -46 + b, 7, -38 + b, 6.2, -29.5 + b], white, 1.3);
        line(g, 0.8, -43 + b, 0.8, -34.5 + b, c.main, 1.6);
        line(g, -2.2, -39.6 + b, 3.8, -39.6 + b, c.main, 1.6);
        box(g, -5.2, -32.6 + b, 12, 3, 0.9, GOLD, 1);
      } else if (herbal) { // a wreath of flowers instead of a halo
        for (const [x, y] of [[-6.4, -28.6], [3.2, -32.4], [7, -29.6]]) ell(g, x, y + b, 2, 1.5, leafD, 0.7);
        for (const [x, y, col] of [[-3.6, -31.4, '#ff8fb3'], [0.8, -33, '#ffe066'], [5.4, -31.6, '#ffffff']]) {
          ell(g, x, y + b, 2.3, 2.3, col, 0.9);
          dot(g, x, y + b, 0.8, col === '#ffe066' ? '#e2483d' : GOLD);
        }
      }
      if (!herbal) { // halo
        const hy = (priest ? -50 : -36) + b;
        g.beginPath(); g.ellipse(0.5, hy, 6, 2, 0, 0, TAU);
        g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke();
        g.lineWidth = 1.4; g.strokeStyle = GOLD; g.stroke();
      }
    },
  },

  giant: {
    box: [-30, -66, 54, 8],
    boxes: { siege: [-30, -75, 64, 8], brute: [-30, -74, 65, 8] },
    draw(g, c, f, s) {
      const b = f === 1 ? -1.5 : 0;
      const siege = s === 'siege', brute = s === 'brute';
      const hide = '#9bb86c', hideD = '#6f8c48', iron = '#55555f';
      ground(g, 20, 7.5, c);
      const st = f === 1 ? 3 : 0;
      ell(g, -8 + st, -2.5, 6.5, 4, hideD);
      ell(g, 8 - st, -2.5 - (f === 1 ? 2 : 0), 6.5, 4, hideD);
      // weapon arm behind the body
      pivot(g, 14, -27 + b, f === 2 ? 1.5 : 0.55, () => {
        box(g, -3, -6, 6, 12, 3, hide);
        if (siege) { // a stone maul for knocking down walls
          box(g, -2.6, -36, 5.2, 31, 2.5, WOOD);
          line(g, -0.6, -31, -0.6, -10, WOOD_D, 1);
          box(g, -10.5, -47, 21, 14.5, 3, STONE);
          box(g, -10.5, -47, 21, 5, 2.5, '#ebe4d4', 0);
          g.beginPath(); g.roundRect(-10.5, -47, 21, 14.5, 3); g.lineWidth = 1.5; g.strokeStyle = INK; g.stroke();
          for (const x of [-6.5, 4.2]) box(g, x, -47, 2.6, 14.5, 0, STEEL_D, 1);
          g.beginPath(); g.moveTo(-2, -44); g.lineTo(0, -41); g.lineTo(-1.5, -38.5); g.lineTo(1.5, -35);
          g.lineWidth = 0.9; g.strokeStyle = STONE_D; g.stroke();
        } else if (brute) { // a huge spiked iron ball
          box(g, -3, -28, 6, 23, 3, WOOD);
          line(g, -0.8, -24, -0.8, -10, WOOD_D, 1);
          for (let i = 0; i < 8; i++) {
            const a = i * TAU / 8 + 0.2, ca = Math.cos(a), sa = Math.sin(a);
            poly(g, [ca * 14.2, -35 + sa * 14.2, ca * 7.5 - sa * 2.6, -35 + sa * 7.5 + ca * 2.6, ca * 7.5 + sa * 2.6, -35 + sa * 7.5 - ca * 2.6], '#e9eef3', 1);
          }
          ell(g, 0, -35, 9.4, 9.4, iron);
          ell(g, -2.6, -37.8, 3.4, 2.8, '#7d7d88', 0);
          for (const [x, y] of [[3.5, -33], [-1, -31], [3, -38.5]]) dot(g, x, y, 1.1, '#2f2f36');
        } else {
          box(g, -4, -34, 8.5, 29, 4, WOOD);
          line(g, -1, -30, -1, -12, WOOD_D, 1);
          for (const [x, y] of [[-4.5, -29], [4.5, -24], [-4.5, -19], [4.5, -31]]) {
            poly(g, [x, y - 2, x + (x < 0 ? -3.5 : 3.5), y, x, y + 2], '#e9eef3', 0.9);
          }
        }
      });
      ell(g, 0, -20 + b, 16, 15.5, hide);
      ell(g, 1.5, -17 + b, 10, 9.5, '#b9d38c', 0);
      // loincloth and strap in team colour
      g.beginPath();
      g.moveTo(-14.5, -12 + b); g.quadraticCurveTo(0, -7 + b, 14.5, -12 + b);
      g.lineTo(11, -3.5 + b); g.lineTo(5, -6 + b); g.lineTo(0, -2 + b); g.lineTo(-5, -6 + b); g.lineTo(-11, -3.5 + b);
      g.closePath(); ink(g, c.main);
      line(g, -11, -31 + b, 12, -11 + b, INK, 4.6);
      line(g, -11, -31 + b, 12, -11 + b, c.main, 3);
      dot(g, 1, -20.5 + b, 2.2, GOLD);
      if (siege) { // a mason's apron of iron plates over the loincloth
        for (const x of [-9.5, -3.2, 3.1]) box(g, x, -10.5 + b + Math.abs(x + 0.2) * 0.12, 6.2, 5.6, 1.2, STEEL, 1);
      }
      // front arm
      ell(g, -15, -19 + b, 5.2, 9.5, hide);
      if (brute) { // spiked shoulder guard and bracer
        for (const [x, y] of [[-20, -27], [-16, -30.5], [-11.5, -31]]) poly(g, [x - 2, y + 1.5 + b, x - 1.2, y - 5.5 + b, x + 2, y + b], '#e9eef3', 1);
        ell(g, -15, -26 + b, 7, 4.8, '#5e3a1e', 1.3);
        box(g, -19.5, -15.5 + b, 9, 4.2, 1.5, '#5e3a1e', 1.1);
        for (const x of [-17.5, -15, -12.5]) dot(g, x, -13.4 + b, 0.8, GOLD);
      } else if (siege) {
        box(g, -19.5, -15.5 + b, 9, 4.2, 1.5, STEEL, 1.1);
      }
      // head
      if (brute) { // a wild mohawk in team colour
        poly(g, [-5, -44 + b, -7, -53 + b, -2.5, -49.5 + b, 0, -56 + b, 3, -50 + b, 7.5, -54 + b, 8.5, -46 + b, 11.5, -47.5 + b, 10, -42 + b], c.main, 1.3);
      }
      ell(g, 3, -40 + b, 9, 8.2, hide);
      line(g, 2, -43.5 + b, 10.5, -42.5 + b, INK, 2.2);
      dot(g, 5, -40.8 + b, 1.2, INK);
      dot(g, 9, -40.5 + b, 1.2, INK);
      const tusk = brute ? 1.5 : 1;
      poly(g, [2.5, -35.5 + b, 3.8, -35.5 - 4 * tusk + b, 5.2, -35.5 + b], '#fffbe9', 0.9);
      poly(g, [8, -35.3 + b, 9.2, -35.3 - 3.9 * tusk + b, 10.6, -35.3 + b], '#fffbe9', 0.9);
      ell(g, -5.5, -41 + b, 2.4, 3.4, hideD, 1.1);
      if (brute) { // war paint
        line(g, 1, -38.6 + b, 4.5, -37.4 + b, c.main, 1.5);
        line(g, 0.4, -36.4 + b, 2, -35.8 + b, c.main, 1.3);
      }
      if (siege) { // iron helmet with a spike
        poly(g, [0.8, -52 + b, 3, -59.5 + b, 5.2, -52 + b], '#e9eef3', 1.1);
        g.beginPath(); g.arc(3, -44.5 + b, 9.6, Math.PI * 1.02, -0.02 * Math.PI); g.closePath(); ink(g, STEEL, 1.4);
        line(g, -2, -50.5 + b, 5, -51.5 + b, '#e9eef3', 1.1);
        box(g, -8, -46.2 + b, 22, 3.2, 1.2, STEEL_D, 1.2);
        for (const x of [-4, 3, 10]) dot(g, x, -44.6 + b, 0.8, INK);
      }
    },
  },

  dragon: {
    box: [-36, -68, 48, 8],
    boxes: { firedragon: [-39, -68, 56, 8], armordragon: [-39, -68, 48, 8] },
    draw(g, c, f, s) {
      const y = -26; // flying height
      const fire = s === 'firedragon', armor = s === 'armordragon';
      g.beginPath(); g.ellipse(0, 0, 15, 5.5, 0, 0, TAU);
      g.fillStyle = 'rgba(20, 30, 10, 0.2)'; g.fill();
      g.lineWidth = 1.6; g.strokeStyle = c.main; g.stroke();
      // far wing
      const up = f === 0;
      const wing = (dx, shade) => {
        const pts = up
          ? [-2, y - 4, -16, y - 34, -6, y - 27, 0, y - 36, 5, y - 26, 12, y - 30, 7, y - 4]
          : [-2, y - 3, -22, y - 6, -13, y + 2, -17, y + 11, -6, y + 7, -3, y + 15, 6, y - 2];
        g.beginPath();
        for (let i = 0; i < pts.length; i += 2) g.lineTo(pts[i] + dx, pts[i + 1]);
        g.closePath(); ink(g, shade);
        if (armor) { // steel along the leading edge, with a claw
          const ex = pts[0] + dx + (pts[2] - pts[0]) * 0.6, ey = pts[1] + (pts[3] - pts[1]) * 0.6;
          line(g, pts[0] + dx, pts[1], ex, ey, INK, 3.8);
          line(g, pts[0] + dx, pts[1], ex, ey, STEEL, 2.2);
          poly(g, [pts[2] + dx, pts[3], pts[2] + dx + 4.5, pts[3] + 1, pts[2] + dx + 2, pts[3] + 5], '#e9eef3', 1);
        }
      };
      wing(-4, c.dark);
      // tail
      g.beginPath(); g.moveTo(-10, y + 1); g.quadraticCurveTo(-24, y + 6, -27, y - 4);
      g.lineCap = 'round'; g.lineWidth = 6.5; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 4.2; g.strokeStyle = c.main; g.stroke();
      if (fire) { // a burning tail tip
        dot(g, -28, y - 9, 8.5, 'rgba(255, 214, 110, 0.4)');
        flame(g, -27.5, y - 2.5, f === 1 ? 5.4 : 4.6);
      } else if (armor) { // a spiked steel tail mace
        for (let i = 0; i < 6; i++) {
          const a = i * TAU / 6 + 0.5, ca = Math.cos(a), sa = Math.sin(a);
          poly(g, [-28 + ca * 8.6, y - 5 + sa * 8.6, -28 + ca * 4 - sa * 1.8, y - 5 + sa * 4 + ca * 1.8, -28 + ca * 4 + sa * 1.8, y - 5 + sa * 4 - ca * 1.8], '#e9eef3', 0.9);
        }
        ell(g, -28, y - 5, 5, 5, STEEL, 1.2);
        dot(g, -29.3, y - 6.3, 1.5, '#e9eef3');
      } else {
        poly(g, [-27, y - 9, -32, y - 3, -25, y - 1], c.dark, 1.1);
      }
      // body, belly, neck, head
      ell(g, 0, y, 13.5, 8.5, c.main);
      if (fire) { // a belly glowing like embers
        ell(g, 1, y + 3, 9.5, 4.6, '#ffb23c', 0);
        ell(g, 1.5, y + 3.6, 6.4, 2.8, '#ffe066', 0);
      } else if (armor) { // a riveted belly plate
        ell(g, 1, y + 3.4, 10, 4.8, STEEL, 1.1);
        for (const x of [-4, 1, 6]) line(g, x, y - 0.6, x - 0.6, y + 7.4, STEEL_D, 0.9);
      } else {
        ell(g, 1, y + 3, 9.5, 4.6, c.light, 0);
      }
      poly(g, [8, y - 5, 17, y - 14, 22, y - 10, 13, y + 2], c.main);
      if (armor) { // neck guard
        poly(g, [7.6, y - 5.4, 16.6, y - 14.6, 19.4, y - 12.4, 10.6, y - 3], STEEL, 1.1);
        line(g, 10.6, y - 8.4, 13.4, y - 6, STEEL_D, 0.9);
        line(g, 13.6, y - 11.5, 16.4, y - 9.2, STEEL_D, 0.9);
      }
      ell(g, 22, y - 13, 7.2, 5.4, c.main);
      box(g, 25, y - 13.5, 7.5, 5, 2.4, c.main);
      const horn = armor ? '#e9eef3' : fire ? '#ffb23c' : '#fff3d6';
      const hl = fire ? 1.45 : armor ? 1.2 : 1;
      poly(g, [17.5, y - 17, 17.5 - 2.5 * hl, y - 17 - 7 * hl, 20.5, y - 18.5], horn, 1);
      poly(g, [21, y - 18, 21 - 0.5 * hl, y - 18 - 6.5 * hl, 24, y - 18.5], horn, 1);
      if (armor) { // helmet and nose plate
        g.beginPath(); g.arc(22, y - 14, 7.4, Math.PI * 1.04, -0.1 * Math.PI); g.closePath(); ink(g, STEEL, 1.2);
        box(g, 27, y - 14.6, 6, 2.6, 1, STEEL, 1);
        line(g, 17, y - 17.6, 26, y - 19, '#e9eef3', 0.9);
      }
      dot(g, 23, y - 15, 1.6, fire ? '#ff5a2b' : GOLD); dot(g, 23.3, y - 15, 0.7, INK);
      dot(g, 31, y - 12.5, 0.7, INK);
      if (fire) { // flames instead of spines
        for (const x of [-6, -1, 4]) flame(g, x, y - 7.2, 2.9 + (f === 1 ? 0.7 : 0) + (x === -1 ? 0.5 : 0));
      } else if (armor) { // back plate with steel spikes
        for (const x of [-6, -1, 4]) poly(g, [x - 2, y - 9.5, x, y - 14.5, x + 2, y - 9.5], '#e9eef3', 1);
        g.beginPath(); g.roundRect(-10, y - 10.4, 19, 5.4, 2.2); ink(g, STEEL, 1.2);
        for (const x of [-7, -2.5, 2, 6.5]) dot(g, x, y - 7.7, 0.8, STEEL_D);
      } else {
        for (const x of [-6, -1, 4]) poly(g, [x - 2, y - 7.6, x, y - 12, x + 2, y - 7.6], c.dark, 1);
      }
      // near wing
      wing(2, c.main);
      // little legs
      ell(g, -5, y + 8.5, 2.6, 3.2, armor ? STEEL_D : c.dark, 1.1);
      ell(g, 6, y + 8.5, 2.6, 3.2, armor ? STEEL_D : c.dark, 1.1);
      if (f === 2) {
        if (fire) { // a much bigger gout of fire
          g.beginPath(); g.moveTo(32, y - 13.5); g.quadraticCurveTo(46, y - 25, 45, y - 13);
          g.quadraticCurveTo(53, y - 9, 44, y - 5); g.quadraticCurveTo(40, y - 2, 32, y - 8.5); g.closePath(); ink(g, '#ff8a2b', 1.2);
          ell(g, 39.5, y - 10.5, 5, 3, '#ffe066', 0);
          ell(g, 37, y - 10.8, 2.4, 1.6, '#ffffff', 0);
        } else {
          g.beginPath(); g.moveTo(32, y - 13); g.quadraticCurveTo(42, y - 20, 40, y - 10);
          g.quadraticCurveTo(44, y - 6, 32, y - 9); g.closePath(); ink(g, '#ff8a2b', 1.1);
          ell(g, 36.5, y - 11.5, 2.6, 1.8, '#fff0a0', 0);
        }
      } else if (fire) { // smouldering nostrils
        flame(g, 34.5, y - 10, 1.9);
      }
    },
  },

  // Siege crossbow on a two-wheeled cart, pushed by a crewman in team colours.
  ballista: {
    box: [-30, -44, 34, 9],
    boxes: { slayer: [-30, -47, 41, 9], grape: [-30, -44, 36, 12] },
    draw(g, c, f, s) {
      const slayer = s === 'slayer', grape = s === 'grape';
      const bone = '#f4efe2';
      ground(g, 19, 6, c);
      const turn = f === 1 ? 0.5 : 0;
      // crewman behind the cart
      const cx = -21;
      ell(g, cx - 2.5, -1.5, 3, 2.1, '#4a2f1b', 1.1);
      ell(g, cx + 2.5, -1.5 - (f === 1 ? 1.2 : 0), 3, 2.1, '#4a2f1b', 1.1);
      box(g, cx - 5, -15, 10, 12, 4, c.main);
      line(g, cx + 3, -11, cx + 10, -12, INK, 3.2);
      line(g, cx + 3, -11, cx + 10, -12, SKIN, 1.8);
      ell(g, cx, -20, 5.2, 5, SKIN);
      dot(g, cx + 1.8, -20.3, 0.9, INK);
      if (slayer) { // the dragon hunter wears a horned helmet
        poly(g, [cx - 4.5, -23.5, cx - 7.5, -29, cx - 2.5, -25.5], bone, 1);
        poly(g, [cx + 3.5, -24.5, cx + 6, -30, cx + 1, -26], bone, 1);
      }
      g.beginPath(); g.arc(cx, -21.5, 5.6, Math.PI * 1.05, -0.05 * Math.PI); g.closePath(); ink(g, slayer ? STEEL : c.dark, 1.2);
      // cart: rear wheel, bed, front wheel
      const wheel = (x) => {
        ell(g, x, -6, 7, 7, WOOD_D, 1.5);
        ell(g, x, -6, 4.6, 4.6, WOOD, 1);
        for (let i = 0; i < 4; i++) {
          const a = turn + i * Math.PI / 4;
          line(g, x - Math.cos(a) * 4.4, -6 - Math.sin(a) * 4.4, x + Math.cos(a) * 4.4, -6 + Math.sin(a) * 4.4, WOOD_D, 1.1);
        }
        dot(g, x, -6, 1.5, STEEL);
      };
      wheel(-9);
      box(g, -15, -15, 32, 7, 2, WOOD);
      line(g, -13, -12, 15, -12, WOOD_D, 0.9);
      box(g, -4, -15, 4.5, 3.4, 1, STEEL_D, 1);
      wheel(10);
      if (grape) { // a crate heaped with iron shot on the back of the cart
        for (const [x, y] of [[-12.5, -24.5], [-9, -25.5], [-5.6, -24.5], [-10.8, -28], [-7.4, -28]]) ell(g, x, y, 2.3, 2.3, '#4a4a52', 1);
        box(g, -15.5, -24, 13, 9, 1.8, '#b98a55', 1.3);
        line(g, -15.5, -19.5, -2.5, -19.5, WOOD_D, 1);
        for (const x of [-12, -6]) line(g, x, -24, x, -15, STEEL_D, 1.3);
      }
      // mount and stock: the dragon slayer aims at the sky, the grapeshot thrower lies flat
      pivot(g, 3, -17, slayer ? -0.42 : grape ? -0.03 : -0.12, () => {
        box(g, -14, -3, 32, 5.5, 1.5, WOOD_D);
        box(g, -14, -3.2, 32, 1.6, 0.8, '#b98a55', 0);
        // the bow: two thick arms in team colours, swept back
        const draw = f === 2 ? 0 : 1; // fired: string snaps forward
        const span = slayer ? 19 : 17, tx = 5 - draw * 3;
        for (const sd of [-1, 1]) {
          g.beginPath();
          g.moveTo(13, 0);
          g.quadraticCurveTo(11, sd * 9, tx, sd * span);
          g.lineCap = 'round'; g.lineWidth = slayer ? 6 : 5.2; g.strokeStyle = INK; g.stroke();
          g.lineWidth = slayer ? 3.8 : 3.2; g.strokeStyle = c.main; g.stroke();
          if (slayer) { // dragon fangs on the tips
            poly(g, [tx - 2.4, sd * (span - 1.6), tx + 6.5, sd * (span + 4), tx + 2.2, sd * (span - 3.6)], bone, 1);
          } else {
            dot(g, tx, sd * span, 1.8, STEEL);
          }
        }
        // string
        const back = f === 2 ? 9 : -9;
        g.beginPath(); g.moveTo(tx, -span); g.lineTo(back, 0); g.lineTo(tx, span);
        g.lineWidth = 1; g.strokeStyle = bone; g.stroke();
        // the bolt, loaded
        if (f !== 2) {
          if (slayer) { // one long barbed harpoon
            line(g, -9, 0, 27, 0, INK, 3.8);
            line(g, -9, 0, 27, 0, WOOD, 2.2);
            poly(g, [21.5, -1, 17.5, -5, 24.5, -1], '#e9eef3', 0.9);
            poly(g, [21.5, 1, 17.5, 5, 24.5, 1], '#e9eef3', 0.9);
            poly(g, [25.5, -4, 36, 0, 25.5, 4, 28, 0], '#e9eef3', 1.1);
            poly(g, [-9, 0, -13, -4, -5, 0, -13, 4], '#e2483d', 0.9);
          } else if (grape) { // a fan of three bolts with heavy iron heads
            for (const a of [-0.26, 0.26, 0]) pivot(g, -9, 0, a, () => {
              line(g, 0, 0, 29, 0, INK, 2.8);
              line(g, 0, 0, 29, 0, WOOD, 1.4);
              ell(g, 30.5, 0, 2.7, 2.7, '#4a4a52', 1);
            });
            poly(g, [-9, 0, -12, -3, -6, 0, -12, 3], c.light, 0.8);
          } else {
            line(g, -9, 0, 22, 0, INK, 3);
            line(g, -9, 0, 22, 0, WOOD, 1.6);
            poly(g, [21, -2.6, 27, 0, 21, 2.6], STEEL, 1);
            poly(g, [-9, 0, -12, -3, -6, 0, -12, 3], c.light, 0.8);
          }
        }
        dot(g, 13, 0, 2.2, GOLD);
        if (slayer) { // dragon skull trophy on the nose of the stock
          poly(g, [13, -3.6, 10.5, -8.5, 15.5, -5], bone, 0.9);
          poly(g, [13, 3.6, 10.5, 8.5, 15.5, 5], bone, 0.9);
          ell(g, 15.5, 0, 4.2, 3.8, bone, 1.1);
          dot(g, 16.6, -1.5, 0.9, INK); dot(g, 16.6, 1.5, 0.9, INK);
        }
      });
      // little pennant on the back of the cart
      line(g, -14, -15, -14, -27, INK, 2);
      line(g, -14, -15, -14, -27, WOOD_D, 1);
      poly(g, [-14, -27, -6, -25, -14, -22], c.main, 1);
    },
  },

  // The gold caravan: an ox pulling a covered wagon heaped with gold, a driver on the bench.
  caravan: {
    box: [-56, -66, 58, 11],
    draw(g, c, f) {
      g.beginPath(); g.ellipse(-6, 0, 50, 9, 0, 0, TAU);
      g.fillStyle = 'rgba(20, 30, 10, 0.28)'; g.fill();
      const step = f === 1 ? 2.2 : 0;
      const turn = f === 1 ? 0.4 : 0;
      // ---- ox (in front, to the right) ----
      const hide = '#8a5a34', hideD = '#5e3a1e';
      for (const [x, d] of [[22, step], [27, -step], [38, -step], [43, step]]) {
        box(g, x + d - 1.8, -11, 3.8, 11, 1.5, hideD, 1.1);
        box(g, x + d - 2.2, -1.6, 4.4, 2.2, 1, INK, 0);
      }
      ell(g, 32, -16, 15, 9, hide);
      ell(g, 31, -12.5, 9, 4, '#a87650', 0);
      g.beginPath(); g.moveTo(18, -18); g.quadraticCurveTo(13, -16, 14, -9);
      g.lineCap = 'round'; g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke(); g.lineWidth = 1.2; g.strokeStyle = hideD; g.stroke();
      ell(g, 48, -20, 7.5, 7, hide);
      ell(g, 53, -17.5, 4.5, 3.6, '#d9a98a', 1.2);
      dot(g, 54.5, -18.5, 0.8, INK);
      dot(g, 48.5, -22.5, 1.1, INK);
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(46, -25); g.quadraticCurveTo(44 + s * 3, -33, 40 + s * 6, -32);
        g.lineWidth = 3.2; g.strokeStyle = INK; g.stroke(); g.lineWidth = 1.8; g.strokeStyle = '#f4efe2'; g.stroke();
      }
      // yoke and shaft to the wagon
      line(g, 4, -14, 22, -19, INK, 3.4);
      line(g, 4, -14, 22, -19, WOOD, 1.8);
      box(g, 21, -26, 4, 12, 1.5, WOOD_D, 1.1);
      // ---- wagon ----
      const wheel = (x, rad) => {
        ell(g, x, -rad, rad, rad, WOOD_D, 1.6);
        ell(g, x, -rad, rad * 0.68, rad * 0.68, WOOD, 1);
        for (let i = 0; i < 4; i++) {
          const a = turn + i * Math.PI / 4;
          line(g, x - Math.cos(a) * rad * 0.65, -rad - Math.sin(a) * rad * 0.65, x + Math.cos(a) * rad * 0.65, -rad + Math.sin(a) * rad * 0.65, WOOD_D, 1.2);
        }
        dot(g, x, -rad, 2, STEEL);
      };
      wheel(-34, 11);                                          // far rear wheel peeks out
      box(g, -48, -26, 52, 12, 2.5, WOOD);                     // bed
      line(g, -46, -20, 2, -20, WOOD_D, 1);
      for (const x of [-38, -22, -6]) line(g, x, -25, x, -15, WOOD_D, 0.9);
      // canvas cover with bronze bands, open at the front
      g.beginPath();
      g.moveTo(-47, -26); g.quadraticCurveTo(-48, -52, -30, -55); g.lineTo(-6, -55);
      g.quadraticCurveTo(6, -52, 3, -26); g.closePath(); ink(g, c.light, 1.6);
      g.beginPath(); g.moveTo(-6, -55); g.quadraticCurveTo(6, -52, 3, -26); g.lineTo(-4, -26); g.quadraticCurveTo(-1, -48, -10, -54); g.closePath();
      g.fillStyle = 'rgba(120, 90, 50, 0.18)'; g.fill();
      for (const x of [-38, -24]) {
        g.beginPath(); g.moveTo(x, -26); g.quadraticCurveTo(x - 1, -45, x + 2, -55.5);
        g.lineWidth = 2.4; g.strokeStyle = c.dark; g.stroke();
      }
      // gold heaped at the open front, coins and a chest
      box(g, -6, -36, 13, 10, 2, '#7a4a20', 1.2);
      line(g, -6, -31.5, 7, -31.5, GOLD, 1.6);
      dot(g, 0.5, -31.5, 1.4, INK);
      for (const [x, y] of [[-2, -38], [3, -39], [7, -37], [0, -41], [5, -42]]) ell(g, x, y, 3, 2, GOLD, 1);
      poly(g, [-8, -40, -5, -47, -2, -40], '#ffe58a', 1);
      // driver on the bench
      box(g, 2, -36, 9, 10, 3, c.main);
      ell(g, 7, -41, 4.6, 4.4, SKIN);
      dot(g, 9, -41.5, 0.9, INK);
      g.beginPath(); g.arc(7, -42.5, 5.2, Math.PI * 1.05, -0.05 * Math.PI); g.closePath(); ink(g, c.dark, 1.1);
      line(g, 10, -33, 22, -24, INK, 1);                       // reins
      // sacks of gold lashed to the side, coins spilling out of the tops
      for (const [x, w] of [[-41, 7], [-30, 8], [-18, 7]]) {
        g.beginPath();
        g.moveTo(x - w, -25); g.quadraticCurveTo(x - w - 1, -36, x - w * 0.4, -38);
        g.lineTo(x + w * 0.4, -38); g.quadraticCurveTo(x + w + 1, -36, x + w, -25); g.closePath();
        ink(g, '#b98a55', 1.3);
        line(g, x - w * 0.5, -35, x + w * 0.5, -35, WOOD_D, 1.2);
        ell(g, x - 2, -39.5, 2.6, 1.8, GOLD, 1);
        ell(g, x + 2.2, -40.5, 2.6, 1.8, GOLD, 1);
        ell(g, x, -42.5, 2.4, 1.7, '#ffe58a', 1);
      }
      // near wheels
      wheel(-36, 12);
      wheel(-4, 10);
      // banner on a pole at the back: a gold coin on sand
      line(g, -47, -26, -47, -63, INK, 2.4);
      line(g, -47, -26, -47, -63, WOOD_D, 1.2);
      g.beginPath(); g.moveTo(-47, -63); g.quadraticCurveTo(-38, -64, -32, -60); g.quadraticCurveTo(-38, -56, -47, -55); g.closePath(); ink(g, c.main, 1.1);
      dot(g, -40, -59.5, 2.3, GOLD);
    },
  },

  commander: {
    box: [-22, -56, 38, 8],
    draw(g, c, f) {
      const b = f === 1 ? -1.2 : 0;
      g.scale(1.22, 1.22);
      ground(g, 12.5, 5.2, null);
      g.beginPath(); g.ellipse(0, 0, 12.5, 5.2, 0, 0, TAU);
      g.lineWidth = 2.4; g.strokeStyle = '#ffffff'; g.stroke();
      g.lineWidth = 1.2; g.strokeStyle = c.main; g.stroke();
      feet(g, f, 4.2, 3.4);
      // cape
      g.beginPath();
      g.moveTo(-6.5, -18 + b); g.quadraticCurveTo(-14, -9, -11.5, -1.5);
      g.quadraticCurveTo(-4, -4, 2, -1.5); g.lineTo(3, -17 + b); g.closePath(); ink(g, c.dark);
      pivot(g, 8, -11.5 + b, f === 2 ? 1.3 : 0.3, () => sword(g, 19, 3.2));
      box(g, -7.5, -19 + b, 15, 15.5, 5, c.main);
      box(g, -7.5, -10 + b, 15, 2.8, 1, GOLD, 1);
      poly(g, [0, -17 + b, 3, -14 + b, 0, -11.5 + b, -3, -14 + b], c.light, 0.9);
      ell(g, 0.5, -26 + b, 8, 7.6, SKIN);
      face(g, 0.2, -26 + b);
      // beard
      g.beginPath(); g.moveTo(-4, -23.5 + b); g.quadraticCurveTo(2, -21.5 + b, 8.2, -24 + b);
      g.quadraticCurveTo(6, -17 + b, 2, -17.5 + b); g.quadraticCurveTo(-3, -18.5 + b, -4, -23.5 + b);
      g.closePath(); ink(g, '#8a5a33', 1.1);
      // crown
      poly(g, [-7, -31 + b, -8, -39 + b, -4, -35.5 + b, 0.5, -40.5 + b, 5, -35.5 + b, 9, -39 + b, 8, -31 + b], GOLD, 1.3);
      dot(g, 0.5, -34 + b, 1.4, '#ff5a5a');
      dot(g, -4.5, -33.2 + b, 0.9, '#7fe3ff');
      dot(g, 5.5, -33.2 + b, 0.9, '#7fe3ff');
    },
  },
};

// ---------- buildings ----------
function bricks(g, x, y, w, h) {
  g.save();
  g.beginPath(); g.rect(x, y, w, h); g.clip();
  g.strokeStyle = 'rgba(90, 80, 60, 0.35)'; g.lineWidth = 0.8;
  for (let r = 0, yy = y + 6; yy < y + h; yy += 6, r++) {
    g.beginPath(); g.moveTo(x, yy); g.lineTo(x + w, yy); g.stroke();
    for (let xx = x + (r % 2 ? 5 : 10); xx < x + w; xx += 10) {
      g.beginPath(); g.moveTo(xx, yy - 6); g.lineTo(xx, yy); g.stroke();
    }
  }
  g.restore();
}
function crenels(g, x, y, w, n) {
  const step = w / (n * 2 - 1);
  for (let i = 0; i < n; i++) box(g, x + i * step * 2, y, step, 4.5, 0.6, STONE, 1.2);
}
function flag(g, x, y, c, h = 12) {
  line(g, x, y, x, y - h, INK, 2.2);
  line(g, x, y, x, y - h, WOOD_D, 1);
  g.beginPath(); g.moveTo(x, y - h); g.quadraticCurveTo(x + 6, y - h - 2, x + 10, y - h + 1.5);
  g.quadraticCurveTo(x + 6, y - h + 4, x, y - h + 6); g.closePath(); ink(g, c.main, 1.1);
}
function coneRoof(g, x, y, w, h, c) {
  poly(g, [x - w / 2 - 2, y, x, y - h, x + w / 2 + 2, y], c.main);
  poly(g, [x, y - h, x + w / 2 + 2, y, x + 2, y], c.dark, 0);
  poly(g, [x - w / 2 - 2, y, x, y - h, x + w / 2 + 2, y], null, 1.5);
}

const BUILDING_ART = {
  hq: {
    box: [-62, -104, 62, 28],
    draw(g, c) {
      ell(g, 0, 2, 56, 23, '#b59a6a', 0);
      ell(g, 0, 2, 56, 23, 'rgba(20,30,10,0.18)', 0);
      // side towers
      for (const sx of [-1, 1]) {
        const x = sx * 36;
        box(g, x - 11, -52, 22, 62, 3, STONE);
        bricks(g, x - 11, -52, 22, 62);
        if (sx > 0) { g.fillStyle = 'rgba(60,50,30,0.16)'; g.fillRect(x, -52, 11, 62); }
        box(g, x - 13.5, -57, 27, 7, 1.5, STONE_D);
        crenels(g, x - 13.5, -61, 27, 4);
        coneRoof(g, x, -61, 22, 20, c);
        box(g, x - 2, -40, 4, 9, 2, '#3a2a1c', 1);
      }
      // keep
      box(g, -27, -44, 54, 58, 3, STONE);
      bricks(g, -27, -44, 54, 58);
      g.fillStyle = 'rgba(60,50,30,0.14)'; g.fillRect(8, -44, 19, 58);
      box(g, -30, -49, 60, 7, 1.5, STONE_D);
      crenels(g, -30, -53.5, 60, 7);
      // central tower
      box(g, -12, -78, 24, 28, 2, STONE);
      bricks(g, -12, -78, 24, 28);
      box(g, -14.5, -82, 29, 6, 1.5, STONE_D);
      coneRoof(g, 0, -82, 26, 18, c);
      flag(g, 0, -99, c, 5);
      box(g, -2.5, -70, 5, 10, 2.5, '#3a2a1c', 1);
      // gate
      g.beginPath(); g.moveTo(-10, 14); g.lineTo(-10, -6); g.arc(0, -6, 10, Math.PI, 0); g.lineTo(10, 14);
      g.closePath(); ink(g, WOOD_D);
      line(g, 0, -15, 0, 13, INK, 1.2);
      line(g, -5, -14, -5, 13, 'rgba(0,0,0,0.3)', 0.8); line(g, 5, -14, 5, 13, 'rgba(0,0,0,0.3)', 0.8);
      dot(g, -2.5, 1, 1.2, GOLD); dot(g, 2.5, 1, 1.2, GOLD);
      // banners
      for (const x of [-19, 19]) {
        poly(g, [x - 5, -38, x + 5, -38, x + 5, -20, x, -24, x - 5, -20], c.main, 1.2);
        dot(g, x, -31, 2.2, c.light);
      }
    },
  },

  mine: {
    box: [-36, -52, 36, 18],
    draw(g, c) {
      ell(g, 0, 2, 31, 13, 'rgba(20,30,10,0.25)', 0);
      g.beginPath();
      g.moveTo(-29, 6); g.quadraticCurveTo(-32, -18, -17, -27); g.quadraticCurveTo(-8, -43, 6, -34);
      g.quadraticCurveTo(22, -36, 26, -17); g.quadraticCurveTo(33, -4, 28, 6); g.closePath(); ink(g, '#9a9184');
      g.beginPath(); g.moveTo(-17, -27); g.quadraticCurveTo(-8, -22, -4, -30); g.moveTo(8, -33); g.quadraticCurveTo(15, -22, 25, -18);
      g.lineWidth = 1; g.strokeStyle = 'rgba(40,30,20,0.4)'; g.stroke();
      // tunnel
      g.beginPath(); g.moveTo(-12, 7); g.lineTo(-12, -9); g.arc(0, -9, 12, Math.PI, 0); g.lineTo(12, 7);
      g.closePath(); ink(g, '#241710');
      box(g, -15, -11, 4.5, 19, 1, WOOD); box(g, 10.5, -11, 4.5, 19, 1, WOOD);
      box(g, -17, -24, 34, 5, 1.5, WOOD);
      // rails and cart full of gold
      line(g, -7, 9, -11, 16, WOOD_D, 1.4); line(g, 7, 9, 11, 16, WOOD_D, 1.4);
      poly(g, [-8, 0, 8, 0, 6, 9, -6, 9], STEEL_D);
      poly(g, [-6, 0, -2, -6, 1, -1, 4, -5, 7, 0], GOLD, 1.1);
      dot(g, -4, 10.5, 2.2, INK); dot(g, 4, 10.5, 2.2, INK);
      // loose crystals
      poly(g, [17, 6, 20, -3, 23, 6], GOLD, 1.1);
      poly(g, [21, 7, 25, 0, 27, 7], '#ffe58a', 1.1);
      poly(g, [-25, 7, -22, 0, -19, 7], GOLD, 1.1);
      flag(g, 4, -35, c, 11);
    },
  },

  barracks: {
    box: [-40, -62, 40, 18],
    draw(g, c) {
      ell(g, 0, 3, 36, 13, 'rgba(20,30,10,0.25)', 0);
      box(g, -29, -24, 58, 32, 2, '#c49a68');
      g.strokeStyle = 'rgba(70,45,20,0.4)'; g.lineWidth = 0.8;
      for (let x = -22; x < 29; x += 7) { g.beginPath(); g.moveTo(x, -24); g.lineTo(x, 8); g.stroke(); }
      g.fillStyle = 'rgba(60,40,20,0.15)'; g.fillRect(10, -24, 19, 32);
      // roof
      poly(g, [-34, -22, -24, -46, 24, -46, 34, -22], c.main);
      poly(g, [6, -46, 24, -46, 34, -22, 12, -22], c.dark, 0);
      g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
      for (const y of [-40, -34, -28]) { g.beginPath(); g.moveTo(-34 + (y + 46) * -0.42 + 9, y); g.lineTo(34 - (-22 - y) * 0.42 - 0, y); g.stroke(); }
      poly(g, [-34, -22, -24, -46, 24, -46, 34, -22], null, 1.5);
      box(g, -26, -49, 52, 4.5, 2, c.light);
      // door, shield with crossed swords
      g.beginPath(); g.moveTo(-7, 8); g.lineTo(-7, -8); g.arc(0, -8, 7, Math.PI, 0); g.lineTo(7, 8); g.closePath(); ink(g, WOOD_D);
      line(g, 0, -14, 0, 7, INK, 1);
      for (const x of [-19, 19]) {
        line(g, x - 5, -4, x + 5, -15, '#e9eef3', 1.6); line(g, x + 5, -4, x - 5, -15, '#e9eef3', 1.6);
        g.beginPath(); g.moveTo(x - 5, -14); g.lineTo(x + 5, -14); g.lineTo(x + 5, -8); g.quadraticCurveTo(x, -1, x - 5, -8); g.closePath(); ink(g, c.main, 1.2);
        dot(g, x, -9.5, 1.5, c.light);
      }
      flag(g, 0, -49, c, 12);
    },
  },

  tower: {
    box: [-26, -86, 26, 14],
    draw(g, c) {
      ell(g, 0, 2, 24, 9, 'rgba(20,30,10,0.25)', 0);
      poly(g, [-14, 6, -11, -46, 11, -46, 14, 6], STONE);
      bricks(g, -14, -46, 28, 52);
      poly(g, [3, -46, 11, -46, 14, 6, 5, 6], 'rgba(60,50,30,0.16)', 0);
      poly(g, [-14, 6, -11, -46, 11, -46, 14, 6], null, 1.5);
      box(g, -16, -54, 32, 9, 2, STONE_D);
      crenels(g, -16, -58.5, 32, 4);
      coneRoof(g, 0, -57, 24, 20, c);
      flag(g, 0, -76, c, 6);
      box(g, -2.2, -34, 4.4, 11, 2.2, '#3a2a1c', 1);
      box(g, -2.2, -14, 4.4, 9, 2.2, '#3a2a1c', 1);
    },
  },

  // Smidse: stone workshop with a glowing forge, a chimney and an anvil out front.
  forge: {
    box: [-40, -78, 40, 18],
    draw(g, c) {
      ell(g, 0, 3, 35, 12, 'rgba(20,30,10,0.25)', 0);
      // chimney with smoke
      box(g, 12, -66, 11, 40, 2, STONE_D);
      bricks(g, 12, -66, 11, 40);
      box(g, 10, -70, 15, 6, 1.5, STONE_D);
      for (const [x, y, r] of [[19, -74, 4], [23, -78, 5], [28, -80, 4]]) dot(g, x, y, r, 'rgba(230, 230, 230, 0.75)');
      // walls
      box(g, -27, -30, 50, 38, 3, STONE);
      bricks(g, -27, -30, 50, 38);
      g.fillStyle = 'rgba(60,50,30,0.16)'; g.fillRect(6, -30, 17, 38);
      // roof in team colour
      poly(g, [-31, -28, -22, -48, 18, -48, 27, -28], c.main);
      poly(g, [4, -48, 18, -48, 27, -28, 10, -28], c.dark, 0);
      poly(g, [-31, -28, -22, -48, 18, -48, 27, -28], null, 1.5);
      // forge mouth with fire
      g.beginPath(); g.moveTo(-20, 6); g.lineTo(-20, -10); g.arc(-12, -10, 8, Math.PI, 0); g.lineTo(-4, 6); g.closePath(); ink(g, '#2a1408');
      dot(g, -12, -2, 7, 'rgba(255, 140, 40, 0.55)');
      poly(g, [-17, 4, -14, -6, -12, -1, -10, -9, -7, 4], '#ffb43a', 0);
      poly(g, [-15, 4, -12, -3, -9, 4], '#fff0a0', 0);
      // anvil and hammer out front
      poly(g, [4, -1, 22, -1, 19, 3, 7, 3], STEEL_D, 1.3);
      box(g, 3, -6, 21, 5, 1.5, STEEL, 1.3);
      poly(g, [24, -6, 30, -4.5, 24, -2], STEEL, 1.1);
      box(g, 10, 3, 6, 5, 1, STEEL_D, 1.1);
      line(g, 6, -9, 14, -16, WOOD_D, 2.4);
      box(g, 12, -20, 6, 5, 1, STEEL_D, 1);
      // crossed hammer sign
      dot(g, -2, -38, 6, c.light);
      g.lineWidth = 1.4; g.strokeStyle = INK; g.beginPath(); g.arc(-2, -38, 6, 0, TAU); g.stroke();
      line(g, -5.5, -35, 1.5, -41.5, WOOD_D, 1.6); line(g, 1.5, -35, -5.5, -41.5, WOOD_D, 1.6);
    },
  },

  academy: {
    box: [-40, -92, 40, 18],
    draw(g, c) {
      ell(g, 0, 3, 36, 13, 'rgba(20,30,10,0.25)', 0);
      // side turret
      box(g, 16, -34, 15, 42, 2.5, '#d9d2e6');
      coneRoof(g, 23.5, -34, 15, 17, c);
      box(g, 21.5, -24, 4, 8, 2, '#3a2a55', 1);
      // main hall
      box(g, -24, -30, 44, 38, 3, '#e3dcee');
      g.fillStyle = 'rgba(70,50,110,0.14)'; g.fillRect(4, -30, 16, 38);
      g.strokeStyle = 'rgba(80,60,120,0.3)'; g.lineWidth = 0.8;
      for (const y of [-20, -10, 0]) { g.beginPath(); g.moveTo(-24, y); g.lineTo(20, y); g.stroke(); }
      // dome
      g.beginPath(); g.moveTo(-26, -29); g.quadraticCurveTo(-24, -58, -2, -60); g.quadraticCurveTo(20, -58, 22, -29); g.closePath(); ink(g, c.main);
      g.beginPath(); g.moveTo(-2, -60); g.quadraticCurveTo(20, -58, 22, -29); g.lineTo(6, -29); g.quadraticCurveTo(8, -50, -2, -60); g.fillStyle = c.dark; g.fill();
      g.beginPath(); g.moveTo(-19, -34); g.quadraticCurveTo(-17, -50, -8, -54); g.lineWidth = 2; g.strokeStyle = c.light; g.lineCap = 'round'; g.stroke();
      box(g, -27, -32, 50, 4.5, 2, c.light);
      // spire with floating crystal
      line(g, -2, -60, -2, -68, INK, 2.6); line(g, -2, -60, -2, -68, GOLD, 1.3);
      dot(g, -2, -77, 9, 'rgba(140, 230, 255, 0.3)');
      poly(g, [-2, -85, 3, -77, -2, -69, -7, -77], '#9cf0ff', 1.2);
      poly(g, [-2, -85, 3, -77, -2, -77], '#e6fbff', 0);
      // door and windows
      g.beginPath(); g.moveTo(-9, 8); g.lineTo(-9, -8); g.arc(-2, -8, 7, Math.PI, 0); g.lineTo(5, 8); g.closePath(); ink(g, '#3a2a55');
      dot(g, -2, -6, 2.2, '#9cf0ff');
      dot(g, -16, -17, 2.8, '#9cf0ff'); dot(g, 12, -17, 2.8, '#9cf0ff');
      g.lineWidth = 1.1; g.strokeStyle = INK;
      for (const x of [-16, 12]) { g.beginPath(); g.arc(x, -17, 2.8, 0, TAU); g.stroke(); }
    },
  },
};

// ---------- sprite cache ----------
function render(art, col, frame, flip, mode, spec) {
  // A specialisation may need more room than the base model (a long spear, a tall mitre).
  const [x0, y0, x1, y1] = (spec && art.boxes && art.boxes[spec]) || art.box;
  const w = x1 - x0, h = y1 - y0;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * RES);
  cv.height = Math.ceil(h * RES);
  const g = cv.getContext('2d');
  g.lineJoin = 'round';
  g.scale(RES, RES);
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.translate(-x0, -y0);
  art.draw(g, col, frame, spec);
  if (mode === 'white') {
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = '#ffffff';
    g.fillRect(0, 0, cv.width, cv.height);
  }
  // dx/dy: where to put the canvas relative to the model's feet
  return { cv, w, h, dx: flip ? -x1 : x0, dy: y0 };
}

export function unitSprite(kind, col, frame, flip, white, spec) {
  const key = `${kind}|${spec || ''}|${white ? 'w' : col.main}|${frame}|${flip ? 1 : 0}`;
  let s = cache.get(key);
  if (!s) cache.set(key, (s = render(UNIT_ART[kind], col, frame, flip, white ? 'white' : '', spec)));
  return s;
}

export function buildingSprite(kind, col, white) {
  const key = `b|${kind}|${white ? 'w' : col.main}`;
  let s = cache.get(key);
  if (!s) cache.set(key, (s = render(BUILDING_ART[kind], col, 0, false, white ? 'white' : '')));
  return s;
}

// A model as an image URL, for HUD buttons.
export function iconUrl(kind, col, spec) {
  const s = UNIT_ART[kind] ? unitSprite(kind, col, 0, false, false, spec) : buildingSprite(kind, col, false);
  return s.cv.toDataURL();
}

// ---------- scenery ----------
function lcg(seed) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

const CRYSTAL_ART = {
  box: [-16, -30, 16, 8],
  draw(g) {
    ell(g, 0, 1, 13, 5, 'rgba(20,30,10,0.25)', 0);
    dot(g, 0, -10, 14, 'rgba(255, 220, 110, 0.22)');
    poly(g, [-10, 1, -8, -13, -3, -9, -2, 1], '#f0b429', 1.3);
    poly(g, [5, 1, 7, -11, 11, -7, 11, 1], '#f0b429', 1.3);
    poly(g, [-5, 2, -3, -22, 2, -26, 6, -20, 6, 2], GOLD, 1.4);
    poly(g, [-3, -22, 2, -26, 1, 2, -5, 2], '#fff0a8', 0);
    poly(g, [-5, 2, -3, -22, 2, -26, 6, -20, 6, 2], null, 1.4);
    line(g, 1, -25, 1, 1, 'rgba(120,80,0,0.35)', 0.8);
  },
};

const DECO_ART = [
  { box: [-9, -12, 9, 3], draw(g) { // flowers
    for (const [x, y, c] of [[-5, -4, '#ffffff'], [3, -7, '#ffe37a'], [5, -1, '#ffb3d1']]) {
      line(g, x, 1, x, y, '#3f7a34', 1.2);
      for (let i = 0; i < 5; i++) dot(g, x + Math.cos(i * 1.257) * 2, y + Math.sin(i * 1.257) * 2, 1.5, c);
      dot(g, x, y, 1.1, '#f0a429');
    }
  } },
  { box: [-9, -10, 9, 3], draw(g) { // grass tuft
    for (const [x, t] of [[-5, -3], [-2, 0], [1, 2], [4, 4]]) {
      g.beginPath(); g.moveTo(x, 1); g.quadraticCurveTo(x + t * 0.3, -5, x + t, -8 - Math.abs(t) * 0.2);
      g.lineCap = 'round'; g.lineWidth = 2; g.strokeStyle = '#3f7a34'; g.stroke();
    }
  } },
  { box: [-12, -11, 12, 4], draw(g) { // rocks
    ell(g, 0, 1.5, 10, 3, 'rgba(20,30,10,0.2)', 0);
    poly(g, [-9, 1, -7, -6, -1, -8, 3, -3, 2, 1], '#a9a79d', 1.3);
    poly(g, [1, 2, 3, -4, 8, -3, 10, 2], '#c2c0b6', 1.3);
  } },
  { box: [-14, -16, 14, 4], draw(g) { // bush
    ell(g, 0, 1.5, 12, 3.5, 'rgba(20,30,10,0.22)', 0);
    ell(g, -5, -5, 7, 6, '#3f8a3a', 1.3); ell(g, 5, -4, 7, 5.5, '#3f8a3a', 1.3); ell(g, 0, -9, 7, 6, '#52a348', 1.3);
    dot(g, -3, -8, 1.2, '#ff6b6b'); dot(g, 4, -6, 1.2, '#ff6b6b'); dot(g, 1, -11, 1.2, '#ff6b6b');
  } },
  { box: [-8, -11, 8, 3], draw(g) { // mushrooms
    box(g, -4.5, -4, 3, 5, 1, '#f4efe2', 1.1);
    g.beginPath(); g.arc(-3, -4, 4.5, Math.PI, 0); g.closePath(); ink(g, '#e2574c', 1.1);
    dot(g, -4, -6, 0.9, '#fff'); dot(g, -1.5, -5.2, 0.7, '#fff');
    box(g, 2.5, -2, 2.2, 3.5, 1, '#f4efe2', 1); g.beginPath(); g.arc(3.6, -2, 3, Math.PI, 0); g.closePath(); ink(g, '#e2574c', 1);
  } },
  { box: [-16, -6, 16, 6], draw(g) { // bare earth patch
    ell(g, 0, 0, 14, 4.5, 'rgba(120, 95, 55, 0.35)', 0);
    ell(g, 3, 0.5, 7, 2.2, 'rgba(120, 95, 55, 0.3)', 0);
  } },
];

const SHRINE_ART = {
  box: [-70, -118, 70, 36],
  draw(g) {
    // stone dais
    ell(g, 0, 6, 62, 26, 'rgba(20,30,10,0.25)', 0);
    ell(g, 0, 2, 58, 24, STONE_D);
    ell(g, 0, -2, 58, 24, STONE);
    ell(g, 0, -2, 44, 17, '#bfb6a2', 1.2);
    for (let i = 0; i < 10; i++) {
      const a = i * 0.628 + 0.3;
      dot(g, Math.cos(a) * 51, -2 + Math.sin(a) * 20.5, 1.8, '#7fe3ff');
    }
    // glow and the crystal cluster
    dot(g, 0, -50, 46, 'rgba(255, 225, 120, 0.2)');
    dot(g, 0, -50, 30, 'rgba(255, 240, 170, 0.22)');
    poly(g, [-30, -4, -26, -44, -15, -36, -12, -4], '#f0b429', 1.5);
    poly(g, [14, -4, 19, -40, 29, -30, 30, -4], '#f0b429', 1.5);
    poly(g, [-17, -2, -12, -84, 2, -104, 16, -80, 18, -2], GOLD, 1.8);
    poly(g, [-12, -84, 2, -104, 3, -2, -17, -2], '#fff0a8', 0);
    poly(g, [2, -104, 16, -80, 9, -70, 2, -78], '#fff8d6', 0);
    poly(g, [-17, -2, -12, -84, 2, -104, 16, -80, 18, -2], null, 1.8);
    line(g, 3, -100, 3, -4, 'rgba(120,80,0,0.35)', 1);
    poly(g, [-6, 0, -3, -22, 5, -16, 6, 0], '#ffe58a', 1.3);
  },
};

export function shrineSprite() {
  let s = cache.get('shrine');
  if (!s) cache.set('shrine', (s = render(SHRINE_ART, null, 0, false, '')));
  return s;
}

export function crystalSprite() {
  let s = cache.get('crystal');
  if (!s) cache.set('crystal', (s = render(CRYSTAL_ART, null, 0, false, '')));
  return s;
}
export function decoSprite(i) {
  const key = `deco${i}`;
  let s = cache.get(key);
  if (!s) cache.set(key, (s = render(DECO_ART[i], null, 0, false, '')));
  return s;
}
export const DECO_COUNT = DECO_ART.length;

// Seamless tiles for the ground and the sea around the arena.
export function groundTile(kind) {
  const key = `tile|${kind}`;
  let cv = cache.get(key);
  if (cv) return cv;
  const N = 512;
  cv = document.createElement('canvas');
  cv.width = cv.height = N;
  const g = cv.getContext('2d');
  const rnd = lcg(kind === 'grass' ? 11 : 29);
  const wrap = (fn) => { for (const ox of [-N, 0, N]) for (const oy of [-N, 0, N]) { g.save(); g.translate(ox, oy); fn(); g.restore(); } };
  if (kind === 'grass') {
    g.fillStyle = '#69a84c'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 46; i++) {
      const x = rnd() * N, y = rnd() * N, rx = 30 + rnd() * 70, ry = 18 + rnd() * 40;
      const tone = rnd() < 0.5 ? 'rgba(120, 190, 90, 0.16)' : 'rgba(55, 120, 50, 0.13)';
      wrap(() => { g.beginPath(); g.ellipse(x, y, rx, ry, rnd() * 3, 0, TAU); g.fillStyle = tone; g.fill(); });
    }
    g.lineCap = 'round';
    for (let i = 0; i < 260; i++) {
      const x = rnd() * N, y = rnd() * N, h = 5 + rnd() * 6, lean = (rnd() - 0.5) * 5;
      g.strokeStyle = rnd() < 0.5 ? 'rgba(50, 110, 45, 0.5)' : 'rgba(150, 210, 110, 0.45)';
      g.lineWidth = 2;
      wrap(() => { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + lean * 0.3, y - h * 0.6, x + lean, y - h); g.stroke(); });
    }
  } else {
    g.fillStyle = '#2f86a8'; g.fillRect(0, 0, N, N);
    for (let i = 0; i < 30; i++) {
      const x = rnd() * N, y = rnd() * N, rx = 40 + rnd() * 80, ry = 16 + rnd() * 30;
      wrap(() => { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = 'rgba(30, 95, 130, 0.25)'; g.fill(); });
    }
    g.lineCap = 'round'; g.lineWidth = 3; g.strokeStyle = 'rgba(210, 240, 250, 0.3)';
    for (let i = 0; i < 46; i++) {
      const x = rnd() * N, y = rnd() * N, w = 14 + rnd() * 22;
      wrap(() => { g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + w / 2, y - 5, x + w, y); g.stroke(); });
    }
  }
  cache.set(key, cv);
  return cv;
}

export const SPRITE_RES = RES;

// A little cartoon flame, used by the fire specialisations.
function flame(g, x, y, s) {
  poly(g, [x - s, y, x - s * 0.5, y - s * 1.6, x, y - s * 0.8, x + s * 0.4, y - s * 2, x + s, y], '#ff8a2b', 1);
  poly(g, [x - s * 0.5, y, x, y - s, x + s * 0.5, y], '#ffe066', 0);
}

export const UNIT_KINDS = Object.keys(UNIT_ART);
export const BUILDING_KINDS = Object.keys(BUILDING_ART);
