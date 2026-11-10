// Keyboard and mouse → simulation input. Holds no game rules.

const MOVE = {
  KeyW: [0, -1], ArrowUp: [0, -1],
  KeyS: [0, 1], ArrowDown: [0, 1],
  KeyA: [-1, 0], ArrowLeft: [-1, 0],
  KeyD: [1, 0], ArrowRight: [1, 0],
};
const ACTIONS = {
  Digit1: { type: 'build', kind: 'mine' },
  Digit2: { type: 'build', kind: 'barracks' },
  Digit3: { type: 'build', kind: 'tower' },
  Digit4: { type: 'build', kind: 'academy' },
  Numpad1: { type: 'build', kind: 'mine' },
  Numpad2: { type: 'build', kind: 'barracks' },
  Numpad3: { type: 'build', kind: 'tower' },
  Numpad4: { type: 'build', kind: 'academy' },
  KeyQ: { type: 'train', kind: 'soldier' },
  KeyE: { type: 'train', kind: 'archer' },
  KeyR: { type: 'train', kind: 'knight' },
  KeyF: { type: 'train', kind: 'giant' },
  KeyZ: { type: 'train', kind: 'mage' },
  KeyX: { type: 'train', kind: 'healer' },
  KeyC: { type: 'train', kind: 'dragon' },
  Space: { type: 'stance' },
  KeyM: { type: 'mute' },
};

const SECRET = ['KeyG', 'KeyO', 'KeyU', 'KeyD']; // type G-O-U-D

export function createInput(canvas, onAction) {
  let secretAt = 0;
  const held = new Set();
  const mouse = { down: false, x: 0, y: 0 };

  const clear = () => { held.clear(); mouse.down = false; };

  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.target instanceof HTMLInputElement) return; // typing a name
    if (!e.repeat) {
      secretAt = e.code === SECRET[secretAt] ? secretAt + 1 : e.code === SECRET[0] ? 1 : 0;
      if (secretAt === SECRET.length) { secretAt = 0; onAction({ type: 'cheat' }); }
    }
    if (MOVE[e.code]) { held.add(e.code); e.preventDefault(); return; }
    const a = ACTIONS[e.code];
    if (a) {
      // Holding a train key keeps training; building needs a fresh press.
      if (e.repeat && a.type !== 'train') return;
      onAction(a);
      e.preventDefault();
    }
  });
  window.addEventListener('keyup', (e) => held.delete(e.code));
  window.addEventListener('blur', clear);
  document.addEventListener('visibilitychange', clear);

  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    mouse.down = true; mouse.x = e.clientX; mouse.y = e.clientY;
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetic pointer */ }
  });
  canvas.addEventListener('pointermove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });
  const up = () => { mouse.down = false; };
  canvas.addEventListener('pointerup', up);
  canvas.addEventListener('pointercancel', up);
  canvas.addEventListener('contextmenu', (e) => e.preventDefault());

  return {
    clear,
    // Direction the commander should move, given where it is on screen.
    direction(commanderScreenX, commanderScreenY) {
      let x = 0, y = 0;
      for (const code of held) { x += MOVE[code][0]; y += MOVE[code][1]; }
      if (x !== 0 || y !== 0) return { x, y };
      if (mouse.down) {
        const dx = mouse.x - commanderScreenX, dy = mouse.y - commanderScreenY;
        const d = Math.hypot(dx, dy);
        if (d > 18) return { x: dx / d, y: dy / d };
      }
      return { x: 0, y: 0 };
    },
  };
}
