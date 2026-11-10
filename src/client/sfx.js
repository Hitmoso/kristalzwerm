// Sound effects, synthesised on the fly with WebAudio — no audio files to load.
// Everything is short, quiet and rate-limited so a 100-unit brawl stays pleasant.

const GAP = { hit: 55, arrow: 70, orb: 90, flame: 110, splash: 90, heal: 160, charge: 120, death: 70, crumble: 200, collect: 60, built: 120, ui: 40 };

export function createSfx() {
  let ctx = null, master = null, noiseBuf = null;
  let muted = false;
  const last = {};
  try { muted = localStorage.getItem('kz-mute') === '1'; } catch { /* private window */ }

  // Browsers only allow sound after a click or key press; call this from one.
  function unlock() {
    if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.5;
    master.connect(ctx.destination);
    noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }

  function tone(f0, f1, dur, type, gain, delay = 0) {
    const t = ctx.currentTime + delay;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  function noise(dur, freq, kind, gain, delay = 0) {
    const t = ctx.currentTime + delay;
    const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    s.buffer = noiseBuf;
    f.type = kind;
    f.frequency.value = freq;
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f).connect(g).connect(master);
    s.start(t, Math.random() * 0.3, dur + 0.02);
  }

  const RECIPES = {
    hit: (v) => noise(0.05, 1900, 'highpass', 0.22 * v),
    arrow: (v) => tone(950, 520, 0.07, 'triangle', 0.1 * v),
    orb: (v) => tone(320, 760, 0.14, 'sine', 0.13 * v),
    flame: (v) => noise(0.2, 700, 'lowpass', 0.22 * v),
    splash: (v) => { tone(150, 48, 0.28, 'sine', 0.34 * v); noise(0.16, 900, 'lowpass', 0.18 * v); },
    heal: (v) => { tone(660, 990, 0.16, 'sine', 0.09 * v); tone(990, 1320, 0.16, 'sine', 0.06 * v, 0.07); },
    charge: (v) => { tone(210, 80, 0.16, 'square', 0.12 * v); noise(0.08, 1200, 'highpass', 0.16 * v); },
    death: (v) => noise(0.13, 800, 'lowpass', 0.2 * v),
    crumble: (v) => { tone(120, 38, 0.55, 'sawtooth', 0.26 * v); noise(0.45, 500, 'lowpass', 0.3 * v); },
    collect: (v) => { tone(880, 1320, 0.09, 'triangle', 0.16 * v); tone(1320, 1760, 0.12, 'triangle', 0.12 * v, 0.06); },
    built: (v) => { tone(190, 110, 0.12, 'square', 0.14 * v); noise(0.1, 600, 'lowpass', 0.2 * v); },
    ui: (v) => tone(520, 640, 0.04, 'triangle', 0.07 * v),
    refuse: (v) => tone(190, 150, 0.12, 'square', 0.09 * v),
    alarm: (v) => { tone(740, 740, 0.12, 'square', 0.1 * v); tone(560, 560, 0.16, 'square', 0.1 * v, 0.15); },
    capture: (v) => [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.2, 'triangle', 0.16 * v, i * 0.09)),
    victory: (v) => [392, 523, 659, 784].forEach((f, i) => tone(f, f, 0.16, 'square', 0.1 * v, i * 0.08)),
    defeat: (v) => [392, 330, 262, 196].forEach((f, i) => tone(f, f * 0.97, 0.3, 'sawtooth', 0.13 * v, i * 0.2)),
    coins: (v) => [1047, 1319, 1568, 2093, 1568, 2093].forEach((f, i) => tone(f, f, 0.08, 'triangle', 0.12 * v, i * 0.05)),
  };

  function play(name, vol = 1) {
    if (!ctx || muted || vol <= 0.02) return;
    const now = performance.now();
    if (now - (last[name] || 0) < (GAP[name] || 0)) return;
    last[name] = now;
    RECIPES[name](Math.min(1, vol));
  }

  // Loudness falls off with distance from the middle of the screen.
  function fromEvents(events, cam, meId) {
    if (!ctx || muted) return;
    for (const e of events) {
      const x = e.x ?? e.x1, y = e.y ?? e.y1;
      const far = x === undefined ? 0 : Math.hypot(x - cam.x, y - cam.y);
      const v = Math.max(0, 1 - far / 950) ** 1.6;
      if (e.type === 'hit') play('hit', v * 0.8);
      else if (e.type === 'shot') play(e.kind === 'mage' ? 'orb' : e.kind === 'dragon' ? 'flame' : 'arrow', v);
      else if (e.type === 'splash') play('splash', v);
      else if (e.type === 'heal') play('heal', v);
      else if (e.type === 'charge') play('charge', v);
      else if (e.type === 'death') play(['hq', 'mine', 'barracks', 'tower', 'academy'].includes(e.kind) ? 'crumble' : 'death', v);
      else if (e.type === 'collect') { if (e.owner === meId) play('collect', 1); }
      else if (e.type === 'built') play('built', e.owner === meId ? 1 : v);
      else if (e.type === 'captured') play('capture', e.player === meId ? 1 : 0.5);
      else if (e.type === 'eliminated') { if (e.player === meId) play('defeat', 1); else if (e.by === meId) play('victory', 1); }
      else if (e.type === 'cheat') { if (e.player === meId) play('coins', 1); }
    }
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('kz-mute', muted ? '1' : '0'); } catch { /* private window */ }
    if (master) master.gain.value = muted ? 0 : 0.5;
    return muted;
  }

  return { unlock, play, fromEvents, toggleMute, isMuted: () => muted };
}
