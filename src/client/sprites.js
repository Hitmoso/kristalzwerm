// Hand-drawn vector models, rendered once into small canvases and reused every frame.
// Everything is drawn facing right with the origin at the feet; mirrored copies are cached too.

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
    draw(g, c, f) {
      const b = f === 1 ? -1 : 0;
      ground(g, 10, 4.5, c);
      feet(g, f);
      pivot(g, 7, -11 + b, f === 2 ? 1.25 : 0.35, () => sword(g, 15, 2.6));
      box(g, -7, -18 + b, 14, 14.5, 5, c.main);
      box(g, -7, -9.5 + b, 14, 2.6, 1, WOOD_D, 1);
      ell(g, 0.5, -24.5 + b, 7.4, 7, SKIN);
      face(g, 0, -24 + b);
      g.beginPath(); g.arc(0.5, -25.5 + b, 7.9, Math.PI * 1.02, -0.02 * Math.PI); g.closePath(); ink(g, STEEL);
      box(g, -8, -26.5 + b, 17, 2.4, 1, STEEL_D, 1.1);
      ell(g, -1, -34.5 + b, 2.6, 3.4, c.main, 1.1);
      ell(g, -6.5, -11.5 + b, 5.6, 6.6, c.dark);
      ell(g, -6.5, -11.5 + b, 3.6, 4.6, c.main, 0);
      dot(g, -6.5, -11.5 + b, 1.5, c.light);
    },
  },

  archer: {
    box: [-15, -38, 23, 6],
    draw(g, c, f) {
      const b = f === 1 ? -1 : 0;
      ground(g, 9.5, 4.3, c);
      feet(g, f, 3.6, 3);
      pivot(g, -6.5, -14 + b, -0.35, () => {
        box(g, -2.2, -7, 4.4, 12, 1.5, WOOD_D, 1.1);
        line(g, -0.8, -7, -1.4, -10.5, '#f4efe2', 1.3);
        line(g, 1, -7, 1.4, -10.5, c.light, 1.3);
      });
      box(g, -6, -17.5 + b, 12, 14, 4.5, c.main);
      line(g, -5, -17 + b, 5, -5 + b, WOOD_D, 1.6);
      ell(g, 0.5, -23 + b, 6.6, 6.3, SKIN);
      face(g, -0.3, -22.5 + b);
      // hood
      g.beginPath();
      g.moveTo(-7.4, -19.5 + b); g.quadraticCurveTo(-9.5, -31 + b, 1, -31.5 + b);
      g.quadraticCurveTo(7.5, -31 + b, 7.6, -25.5 + b); g.quadraticCurveTo(1, -28 + b, -3, -22 + b);
      g.closePath(); ink(g, c.dark);
      // bow and (when shooting) a nocked arrow
      const pull = f === 2 ? 3.5 : 0;
      g.beginPath(); g.arc(4.5, -13 + b, 9.5, -1.15, 1.15);
      g.lineCap = 'round'; g.lineWidth = 3.2; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 1.7; g.strokeStyle = WOOD; g.stroke();
      const sx = 4.5 + Math.cos(1.15) * 9.5, sy = Math.sin(1.15) * 9.5;
      g.beginPath(); g.moveTo(sx, -13 + b - sy); g.lineTo(sx - pull, -13 + b); g.lineTo(sx, -13 + b + sy);
      g.lineWidth = 0.8; g.strokeStyle = '#f4efe2'; g.stroke();
      if (f === 2) {
        line(g, sx - pull, -13 + b, 17, -13 + b, WOOD_D, 1.3);
        poly(g, [17, -15 + b, 20, -13 + b, 17, -11 + b], STEEL, 0.8);
      }
    },
  },

  knight: {
    box: [-22, -48, 42, 7],
    draw(g, c, f) {
      const b = f === 1 ? -1.2 : 0;
      ground(g, 16, 5.5, c);
      // legs
      const l = f === 1 ? 2.5 : 0;
      for (const [x, d] of [[-9, l], [-5, -l], [6, -l], [10, l]]) {
        box(g, x + d - 1.3, -8, 2.8, 8.5, 1.2, '#6b4526', 1.1);
        box(g, x + d - 1.6, -1.6, 3.4, 2.2, 1, INK, 0);
      }
      // tail, body
      g.beginPath(); g.moveTo(-12, -14 + b); g.quadraticCurveTo(-20, -13 + b, -18, -4 + b);
      g.lineCap = 'round'; g.lineWidth = 4.2; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 2.4; g.strokeStyle = '#4a2f1b'; g.stroke();
      ell(g, 0, -12 + b, 13.5, 7.2, '#a06a3a');
      // neck and head
      poly(g, [8, -17 + b, 15, -27 + b, 20, -25 + b, 14, -11 + b], '#a06a3a');
      ell(g, 19.5, -25.5 + b, 5.6, 3.6, '#a06a3a');
      poly(g, [14.5, -29 + b, 16, -33 + b, 17.6, -28.5 + b], '#a06a3a', 1.1);
      dot(g, 20, -26.5 + b, 1, INK);
      line(g, 9, -19 + b, 14, -27.5 + b, '#4a2f1b', 2.4);
      line(g, 16, -23 + b, 23.5, -24 + b, c.light, 1);
      // caparison in team colour
      g.beginPath();
      g.moveTo(-10, -17 + b); g.lineTo(9, -17 + b); g.lineTo(10, -6 + b);
      g.lineTo(5, -8 + b); g.lineTo(0, -5.5 + b); g.lineTo(-5, -8 + b); g.lineTo(-11, -6 + b);
      g.closePath(); ink(g, c.main);
      line(g, -9.5, -14.5 + b, 9, -14.5 + b, c.light, 1.2);
      // lance (behind the rider's arm)
      const reach = f === 2 ? 7 : 0;
      line(g, -8 + reach, -19 + b, 25 + reach, -27 + b, INK, 3);
      line(g, -8 + reach, -19 + b, 25 + reach, -27 + b, WOOD, 1.6);
      poly(g, [24 + reach, -29 + b, 31 + reach, -28.5 + b, 25 + reach, -25 + b], '#e9eef3', 1);
      poly(g, [14 + reach, -24.5 + b, 20 + reach, -26 + b, 16 + reach, -20 + b], c.main, 1);
      // rider
      box(g, -4.5, -27 + b, 9.5, 11.5, 3.5, STEEL);
      ell(g, -3.5, -20 + b, 4.2, 5.2, c.dark);
      dot(g, -3.5, -20 + b, 1.6, c.light);
      ell(g, 0.5, -32 + b, 5.8, 5.6, STEEL);
      line(g, 1.5, -32 + b, 6, -32 + b, INK, 1.5);
      g.beginPath(); g.moveTo(-1, -37.5 + b); g.quadraticCurveTo(-9, -44 + b, -8, -34 + b);
      g.quadraticCurveTo(-5, -37 + b, -1, -36 + b); g.closePath(); ink(g, c.main, 1.1);
    },
  },

  mage: {
    box: [-17, -52, 31, 6],
    draw(g, c, f) {
      const b = f === 1 ? -1 : 0;
      ground(g, 10, 4.5, c);
      // staff
      pivot(g, 9.5, -8 + b, f === 2 ? 0.45 : 0.08, () => {
        line(g, 0, 8, 0, -22, INK, 3);
        line(g, 0, 8, 0, -22, WOOD, 1.6);
        dot(g, 0, -25, f === 2 ? 8 : 5.5, 'rgba(190, 150, 255, 0.35)');
        ell(g, 0, -25, 3.4, 3.4, f === 2 ? '#ffffff' : '#d7bcff', 1.1);
      });
      // robe
      g.beginPath();
      g.moveTo(-6, -18 + b); g.lineTo(6, -18 + b); g.quadraticCurveTo(9, -8, 9.5, -0.5);
      g.quadraticCurveTo(0, 2, -9.5, -0.5); g.quadraticCurveTo(-9, -8, -6, -18 + b);
      g.closePath(); ink(g, c.main);
      g.beginPath(); g.moveTo(-9, -3.2); g.quadraticCurveTo(0, -0.8, 9, -3.2);
      g.lineWidth = 1.6; g.strokeStyle = c.light; g.stroke();
      line(g, 0, -17 + b, 0, -4, c.dark, 1.3);
      ell(g, 0.5, -23 + b, 6.4, 6, SKIN);
      face(g, -0.3, -23.5 + b);
      // beard
      g.beginPath(); g.moveTo(-3, -21 + b); g.quadraticCurveTo(2, -19 + b, 7, -21.5 + b);
      g.quadraticCurveTo(5.5, -12 + b, 2.5, -9.5 + b); g.quadraticCurveTo(-1.5, -14 + b, -3, -21 + b);
      g.closePath(); ink(g, '#f4f1ea', 1.2);
      // hat
      ell(g, 0.5, -27.5 + b, 11, 3.2, c.dark);
      g.beginPath(); g.moveTo(-6.5, -28 + b); g.quadraticCurveTo(-3, -40 + b, -7, -47 + b);
      g.quadraticCurveTo(4, -41 + b, 7.5, -28 + b); g.closePath(); ink(g, c.main);
      g.beginPath(); g.moveTo(-6.2, -30 + b); g.quadraticCurveTo(0.5, -27.5 + b, 7.2, -30 + b);
      g.lineWidth = 2; g.strokeStyle = c.light; g.stroke();
      dot(g, 0, -35.5 + b, 1.5, GOLD);
    },
  },

  healer: {
    box: [-16, -46, 31, 6],
    draw(g, c, f) {
      const b = f === 1 ? -1 : 0;
      ground(g, 10, 4.5, c);
      pivot(g, 9.5, -8 + b, f === 2 ? 0.4 : 0.06, () => {
        line(g, 0, 8, 0, -23, INK, 3);
        line(g, 0, 8, 0, -23, GOLD, 1.6);
        if (f === 2) dot(g, 0, -27, 8, 'rgba(140, 255, 170, 0.4)');
        ell(g, 0, -27, 4.2, 4.2, '#fff6cf', 1.1);
        line(g, 0, -29.6, 0, -24.4, '#3fbf6a', 1.5);
        line(g, -2.6, -27, 2.6, -27, '#3fbf6a', 1.5);
      });
      g.beginPath();
      g.moveTo(-6, -18 + b); g.lineTo(6, -18 + b); g.quadraticCurveTo(8.5, -8, 9, -0.5);
      g.quadraticCurveTo(0, 2, -9, -0.5); g.quadraticCurveTo(-8.5, -8, -6, -18 + b);
      g.closePath(); ink(g, '#f6f1e4');
      box(g, -1.8, -17.5 + b, 3.6, 16.5, 1, c.main, 0);
      g.beginPath(); g.moveTo(-8.6, -3.4); g.quadraticCurveTo(0, -1, 8.6, -3.4);
      g.lineWidth = 1.8; g.strokeStyle = c.main; g.stroke();
      ell(g, 0.5, -23 + b, 6.4, 6, SKIN);
      face(g, -0.3, -22.5 + b);
      // hood
      g.beginPath();
      g.moveTo(-7.2, -18.5 + b); g.quadraticCurveTo(-9.6, -31.5 + b, 1, -31.5 + b);
      g.quadraticCurveTo(7.6, -31 + b, 7.6, -25.5 + b); g.quadraticCurveTo(1, -28.5 + b, -3, -21 + b);
      g.closePath(); ink(g, '#f6f1e4');
      line(g, -6.5, -27 + b, 0, -30.6 + b, c.main, 1.4);
      // halo
      g.beginPath(); g.ellipse(0.5, -36 + b, 6, 2, 0, 0, TAU);
      g.lineWidth = 2.6; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 1.4; g.strokeStyle = GOLD; g.stroke();
    },
  },

  giant: {
    box: [-30, -66, 54, 8],
    draw(g, c, f) {
      const b = f === 1 ? -1.5 : 0;
      const hide = '#9bb86c', hideD = '#6f8c48';
      ground(g, 20, 7.5, c);
      const s = f === 1 ? 3 : 0;
      ell(g, -8 + s, -2.5, 6.5, 4, hideD);
      ell(g, 8 - s, -2.5 - (f === 1 ? 2 : 0), 6.5, 4, hideD);
      // club arm behind the body
      pivot(g, 14, -27 + b, f === 2 ? 1.5 : 0.55, () => {
        box(g, -3, -6, 6, 12, 3, hide);
        box(g, -4, -34, 8.5, 29, 4, WOOD);
        line(g, -1, -30, -1, -12, WOOD_D, 1);
        for (const [x, y] of [[-4.5, -29], [4.5, -24], [-4.5, -19], [4.5, -31]]) {
          poly(g, [x, y - 2, x + (x < 0 ? -3.5 : 3.5), y, x, y + 2], '#e9eef3', 0.9);
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
      // front arm
      ell(g, -15, -19 + b, 5.2, 9.5, hide);
      // head
      ell(g, 3, -40 + b, 9, 8.2, hide);
      line(g, 2, -43.5 + b, 10.5, -42.5 + b, INK, 2.2);
      dot(g, 5, -40.8 + b, 1.2, INK);
      dot(g, 9, -40.5 + b, 1.2, INK);
      poly(g, [2.5, -35.5 + b, 3.8, -39.5 + b, 5.2, -35.5 + b], '#fffbe9', 0.9);
      poly(g, [8, -35.3 + b, 9.2, -39.2 + b, 10.6, -35.3 + b], '#fffbe9', 0.9);
      ell(g, -5.5, -41 + b, 2.4, 3.4, hideD, 1.1);
    },
  },

  dragon: {
    box: [-36, -68, 48, 8],
    draw(g, c, f) {
      const y = -26; // flying height
      g.beginPath(); g.ellipse(0, 0, 15, 5.5, 0, 0, TAU);
      g.fillStyle = 'rgba(20, 30, 10, 0.2)'; g.fill();
      g.lineWidth = 1.6; g.strokeStyle = c.main; g.stroke();
      // far wing
      const up = f === 0;
      const wing = (dx, shade) => {
        g.beginPath();
        if (up) {
          g.moveTo(-2 + dx, y - 4); g.lineTo(-16 + dx, y - 34); g.lineTo(-6 + dx, y - 27);
          g.lineTo(0 + dx, y - 36); g.lineTo(5 + dx, y - 26); g.lineTo(12 + dx, y - 30); g.lineTo(7 + dx, y - 4);
        } else {
          g.moveTo(-2 + dx, y - 3); g.lineTo(-22 + dx, y - 6); g.lineTo(-13 + dx, y + 2);
          g.lineTo(-17 + dx, y + 11); g.lineTo(-6 + dx, y + 7); g.lineTo(-3 + dx, y + 15); g.lineTo(6 + dx, y - 2);
        }
        g.closePath(); ink(g, shade);
      };
      wing(-4, c.dark);
      // tail
      g.beginPath(); g.moveTo(-10, y + 1); g.quadraticCurveTo(-24, y + 6, -27, y - 4);
      g.lineCap = 'round'; g.lineWidth = 6.5; g.strokeStyle = INK; g.stroke();
      g.lineWidth = 4.2; g.strokeStyle = c.main; g.stroke();
      poly(g, [-27, y - 9, -32, y - 3, -25, y - 1], c.dark, 1.1);
      // body, belly, neck, head
      ell(g, 0, y, 13.5, 8.5, c.main);
      ell(g, 1, y + 3, 9.5, 4.6, c.light, 0);
      poly(g, [8, y - 5, 17, y - 14, 22, y - 10, 13, y + 2], c.main);
      ell(g, 22, y - 13, 7.2, 5.4, c.main);
      box(g, 25, y - 13.5, 7.5, 5, 2.4, c.main);
      dot(g, 23, y - 15, 1.6, GOLD); dot(g, 23.3, y - 15, 0.7, INK);
      dot(g, 31, y - 12.5, 0.7, INK);
      poly(g, [17.5, y - 17, 15, y - 24, 20.5, y - 18.5], '#fff3d6', 1);
      poly(g, [21, y - 18, 20.5, y - 24.5, 24, y - 18.5], '#fff3d6', 1);
      for (const x of [-6, -1, 4]) poly(g, [x - 2, y - 7.6, x, y - 12, x + 2, y - 7.6], c.dark, 1);
      // near wing
      wing(2, c.main);
      // little legs
      ell(g, -5, y + 8.5, 2.6, 3.2, c.dark, 1.1);
      ell(g, 6, y + 8.5, 2.6, 3.2, c.dark, 1.1);
      if (f === 2) {
        g.beginPath(); g.moveTo(32, y - 13); g.quadraticCurveTo(42, y - 20, 40, y - 10);
        g.quadraticCurveTo(44, y - 6, 32, y - 9); g.closePath(); ink(g, '#ff8a2b', 1.1);
        ell(g, 36.5, y - 11.5, 2.6, 1.8, '#fff0a0', 0);
      }
    },
  },

  // Siege crossbow on a two-wheeled cart, pushed by a crewman in team colours.
  ballista: {
    box: [-30, -44, 34, 9],
    draw(g, c, f) {
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
      g.beginPath(); g.arc(cx, -21.5, 5.6, Math.PI * 1.05, -0.05 * Math.PI); g.closePath(); ink(g, c.dark, 1.2);
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
      // mount and stock, tilted up a little
      pivot(g, 3, -17, -0.12, () => {
        box(g, -14, -3, 32, 5.5, 1.5, WOOD_D);
        box(g, -14, -3.2, 32, 1.6, 0.8, '#b98a55', 0);
        // the bow: two thick arms in team colours, swept back
        const draw = f === 2 ? 0 : 1; // fired: string snaps forward
        for (const s of [-1, 1]) {
          g.beginPath();
          g.moveTo(13, 0);
          g.quadraticCurveTo(11, s * 9, 5 - draw * 3, s * 17);
          g.lineCap = 'round'; g.lineWidth = 5.2; g.strokeStyle = INK; g.stroke();
          g.lineWidth = 3.2; g.strokeStyle = c.main; g.stroke();
          dot(g, 5 - draw * 3, s * 17, 1.8, STEEL);
        }
        // string
        const back = f === 2 ? 9 : -9;
        g.beginPath(); g.moveTo(5 - draw * 3, -17); g.lineTo(back, 0); g.lineTo(5 - draw * 3, 17);
        g.lineWidth = 1; g.strokeStyle = '#f4efe2'; g.stroke();
        // the bolt, loaded
        if (f !== 2) {
          line(g, -9, 0, 22, 0, INK, 3);
          line(g, -9, 0, 22, 0, WOOD, 1.6);
          poly(g, [21, -2.6, 27, 0, 21, 2.6], STEEL, 1);
          poly(g, [-9, 0, -12, -3, -6, 0, -12, 3], c.light, 0.8);
        }
        dot(g, 13, 0, 2.2, GOLD);
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
  const [x0, y0, x1, y1] = art.box;
  const w = x1 - x0, h = y1 - y0;
  const cv = document.createElement('canvas');
  cv.width = Math.ceil(w * RES);
  cv.height = Math.ceil(h * RES);
  const g = cv.getContext('2d');
  g.lineJoin = 'round';
  g.scale(RES, RES);
  if (flip) { g.translate(w, 0); g.scale(-1, 1); }
  g.translate(-x0, -y0);
  art.draw(g, col, frame);
  if (spec && SPEC_ART[spec]) SPEC_ART[spec](g, col, frame);
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
// ---------- specialisation overlays ----------
// Drawn on top of the base model, in the same facing-right coordinates, so every
// specialised troop is recognisable at a glance (also on the other team).
const ORB = [[11.5, -33], [11.5, -33], [20, -31]]; // where the mage/healer staff tip is per frame
function flame(g, x, y, s) {
  poly(g, [x - s, y, x - s * 0.5, y - s * 1.6, x, y - s * 0.8, x + s * 0.4, y - s * 2, x + s, y], '#ff8a2b', 1);
  poly(g, [x - s * 0.5, y, x, y - s, x + s * 0.5, y], '#ffe066', 0);
}
const SPEC_ART = {
  spear(g, c, f) {                       // long spear held high
    const r = f === 2 ? 3 : 0;
    line(g, -3 + r, 2, 15 + r, -40, INK, 3.4);
    line(g, -3 + r, 2, 15 + r, -40, WOOD, 1.8);
    poly(g, [13 + r, -38, 17 + r, -48, 18.5 + r, -37], STEEL, 1.2);
    line(g, 12 + r, -35, 18 + r, -37, c.main, 2);
  },
  shield(g, c) {                         // tall tower shield
    box(g, -14, -27, 11, 25, 3, c.main, 1.6);
    box(g, -12, -25, 7, 21, 2, null, 0);
    line(g, -8.5, -24, -8.5, -5, c.light, 1.4);
    line(g, -12.5, -15, -4.5, -15, c.light, 1.4);
    dot(g, -8.5, -15, 1.6, GOLD);
    g.beginPath(); g.roundRect(-14, -27, 11, 25, 3); g.lineWidth = 2; g.strokeStyle = STEEL_D; g.stroke();
  },
  sharp(g, c) {                          // feathered cap and a spyglass at the belt
    poly(g, [-6, -29, -14, -40, -11, -41, -3, -30], c.light, 1.1);
    line(g, -5, -30, -12, -39.5, c.dark, 0.9);
    box(g, -8, -9, 7, 3, 1.4, '#b98a55', 1);
  },
  firearrow(g) {                         // quiver of burning arrows on the back
    box(g, -11, -20, 5, 13, 2, WOOD_D, 1.1);
    flame(g, -8.5, -20, 2.4);
  },
  heavy(g, c) {                          // steel barding on the horse, big plume
    poly(g, [-9, -17, 9, -17, 10, -9, -10, -9], STEEL, 1.3);
    for (const x of [-6, -1, 4]) dot(g, x, -13, 0.9, STEEL_D);
    poly(g, [9, -18, 16, -28, 20, -25, 12, -13], STEEL, 1.2);
    g.beginPath(); g.moveTo(-1, -38); g.quadraticCurveTo(-12, -48, -12, -36); g.quadraticCurveTo(-6, -40, -1, -37); g.closePath();
    ink(g, GOLD, 1.1);
  },
  light(g, c, f) {                       // a long pennant streaming behind the rider
    const w = f === 1 ? 2 : 0;
    line(g, -5, -24, -5, -46, INK, 2);
    line(g, -5, -24, -5, -46, WOOD, 1);
    g.beginPath(); g.moveTo(-5, -46); g.quadraticCurveTo(-14, -48 - w, -22, -43 + w); g.lineTo(-5, -40); g.closePath();
    ink(g, c.light, 1.1);
  },
  siege(g) {                             // iron helmet with a ram's brow
    g.beginPath(); g.arc(3, -42, 9.6, Math.PI * 1.02, -0.02 * Math.PI); g.closePath(); ink(g, STEEL, 1.4);
    box(g, -7, -43.5, 20, 3, 1, STEEL_D, 1.1);
    for (const x of [-2, 3, 8]) dot(g, x, -47.5, 0.9, STEEL_D);
  },
  brute(g) {                             // spiked leather pauldrons
    for (const x of [-13, 13]) {
      ell(g, x, -31, 7, 5, '#5e3a1e', 1.3);
      for (const dx of [-4, 0, 4]) poly(g, [x + dx - 1.6, -34, x + dx, -40, x + dx + 1.6, -34], '#e9eef3', 0.9);
    }
  },
  slayer(g) {                            // dragon-skull trophy on the cart
    ell(g, -2, -12, 5.5, 4, '#f4efe2', 1.2);
    dot(g, -4, -12.5, 1, INK); dot(g, 0, -12.5, 1, INK);
    poly(g, [-6, -14, -10, -19, -5.5, -15.5], '#f4efe2', 1);
    poly(g, [2, -14, 6, -19, 1.5, -15.5], '#f4efe2', 1);
    line(g, -6, -8.5, 2, -8.5, '#c0392b', 1.4);
  },
  grape(g) {                             // barrel of grapeshot on the back of the cart
    box(g, -16, -27, 9, 11, 2.5, WOOD, 1.3);
    line(g, -16, -24, -7, -24, WOOD_D, 1); line(g, -16, -19, -7, -19, WOOD_D, 1);
    for (const [x, y] of [[-14, -28.5], [-11.5, -29.5], [-9, -28.5]]) dot(g, x, y, 1.6, '#3b3b3b');
  },
  firemage(g, c, f) {                    // flaming staff tip and embers on the hat
    const [x, y] = ORB[f];
    dot(g, x, y, 7, 'rgba(255, 120, 40, 0.45)');
    flame(g, x, y + 2, 3.2);
    flame(g, -6, -44, 1.8);
  },
  icemage(g, c, f) {                     // ice crystal on the staff, frost on the hat brim
    const [x, y] = ORB[f];
    dot(g, x, y, 7, 'rgba(150, 220, 255, 0.45)');
    poly(g, [x, y - 6, x + 3.5, y, x, y + 5, x - 3.5, y], '#bfefff', 1.1);
    for (const fx of [-7, -2, 3]) poly(g, [fx - 1.5, -29.5, fx, -26.5, fx + 1.5, -29.5], '#e6fbff', 0.8);
  },
  priest(g) {                            // golden mitre over the hood
    poly(g, [-5, -30, -4.5, -40, 0.5, -45, 5.5, -40, 6, -30], GOLD, 1.3);
    line(g, 0.5, -43, 0.5, -32, '#c0392b', 1.4);
    line(g, -2.5, -37, 3.5, -37, '#c0392b', 1.4);
  },
  herbal(g, c) {                         // leaf crown and a little basket of herbs
    for (const [x, a] of [[-5, -0.6], [-1, -0.2], [3, 0.2], [7, 0.6]]) {
      g.save(); g.translate(x, -31); g.rotate(a);
      g.beginPath(); g.ellipse(0, -2.5, 1.8, 3.2, 0, 0, TAU); ink(g, '#4caf50', 0.9);
      g.restore();
    }
    box(g, -12, -11, 7, 5, 1.5, '#b98a55', 1);
    dot(g, -10.5, -12, 1.5, '#4caf50'); dot(g, -7.5, -12.5, 1.5, '#7bd36b');
  },
  firedragon(g, c, f) {                  // flames licking along its back
    const y = -26;
    for (const x of [-6, -1, 4]) flame(g, x, y - 8, 2.2 + (f === 1 ? 0.6 : 0));
    dot(g, 30, y - 12, 2.2, 'rgba(255, 140, 40, 0.6)');
  },
  armordragon(g) {                       // steel plates on body and head
    const y = -26;
    g.beginPath(); g.roundRect(-9, y - 6, 18, 9, 3); ink(g, STEEL, 1.3);
    for (const x of [-5, 0, 5]) dot(g, x, y - 1.5, 0.9, STEEL_D);
    g.beginPath(); g.arc(22, y - 14, 6, Math.PI * 1.05, -0.1 * Math.PI); g.closePath(); ink(g, STEEL, 1.1);
  },
};

export const UNIT_KINDS = Object.keys(UNIT_ART);
export const BUILDING_KINDS = Object.keys(BUILDING_ART);
