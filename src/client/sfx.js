// Sound effects, synthesised with WebAudio — no audio files to load.
//
// Instead of bare beeps every sound is layered from a few building blocks:
//   bell()   inharmonic partials: metal, crystals, magic
//   brass()  detuned saws through a moving low-pass: horns and fanfares
//   burst()  filtered noise with a moving cutoff: whooshes, fire, rumble, wood
//   thump()  a falling sine: weight and impact
// Everything goes through a shared room reverb and a compressor, is panned left/right by
// where it happened on screen, and gets a small random pitch shift so repeats differ.

const GAP = { bolt: 90, hit: 45, thud: 60, arrow: 60, orb: 90, flame: 110, splash: 90, heal: 160, charge: 120, death: 60, crumble: 220, collect: 60, built: 140, ui: 40, refuse: 200 };

// ---------------------------------------------------------------- voices

function makeVoices(ac, noise) {
  const exp = (param, v, t) => param.exponentialRampToValueAtTime(Math.max(0.0001, v), t);

  function amp(out, t, attack, peak, decay) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    exp(g.gain, peak, t + attack);
    exp(g.gain, 0.0001, t + attack + decay);
    g.connect(out);
    return g;
  }

  // Struck metal / glass. ratios are the classic bar/bell partials.
  function bell(out, t, f, dur, gain, bright = 1) {
    const ratios = [1, 2.76, 5.4, 8.93];
    const amps = [1, 0.55 * bright, 0.28 * bright, 0.12 * bright];
    ratios.forEach((r, i) => {
      const o = ac.createOscillator();
      o.type = 'sine';
      o.frequency.value = f * r;
      o.connect(amp(out, t, 0.002, gain * amps[i], dur / (1 + i * 0.8)));
      o.start(t);
      o.stop(t + dur + 0.05);
    });
  }

  // Horn-like note: two detuned saws, filter opens on the attack and settles.
  function brass(out, t, f, dur, gain) {
    const lp = ac.createBiquadFilter();
    lp.type = 'lowpass';
    lp.Q.value = 2;
    lp.frequency.setValueAtTime(f * 1.5, t);
    exp(lp.frequency, f * 7, t + 0.05);
    exp(lp.frequency, f * 3, t + dur);
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    exp(g.gain, gain, t + 0.04);
    g.gain.setValueAtTime(gain, t + dur * 0.7);
    exp(g.gain, 0.0001, t + dur);
    lp.connect(g).connect(out);
    for (const d of [-7, 7]) {
      const o = ac.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = f;
      o.detune.value = d;
      o.connect(lp);
      o.start(t);
      o.stop(t + dur + 0.05);
    }
  }

  // Filtered noise; cutoff glides from f0 to f1.
  function burst(out, t, type, f0, f1, q, attack, dur, gain) {
    const s = ac.createBufferSource();
    s.buffer = noise;
    const f = ac.createBiquadFilter();
    f.type = type;
    f.Q.value = q;
    f.frequency.setValueAtTime(f0, t);
    exp(f.frequency, f1, t + attack + dur);
    s.connect(f).connect(amp(out, t, attack, gain, dur));
    s.start(t, Math.random() * 1.5, attack + dur + 0.05);
  }

  function thump(out, t, f0, f1, dur, gain) {
    const o = ac.createOscillator();
    o.type = 'sine';
    o.frequency.setValueAtTime(f0, t);
    exp(o.frequency, f1, t + dur);
    o.connect(amp(out, t, 0.004, gain, dur));
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  const N = { C4: 261.6, D4: 293.7, E4: 329.6, F4: 349.2, G4: 392, A4: 440, C5: 523.3, E5: 659.3, G5: 784, C6: 1046.5, E6: 1318.5, G6: 1568, B6: 1975.5, C7: 2093, D3: 146.8, F3: 174.6, A3: 220, G3: 196, Eb4: 311.1 };

  // name → { play(out, t, v, p), reverb } ; p = random pitch factor near 1
  return {
    hit: { reverb: 0.15, play(o, t, v, p) {          // sword on shield
      bell(o, t, 1900 * p, 0.16, 0.12 * v, 0.8);
      burst(o, t, 'highpass', 4000, 2500, 0.7, 0.001, 0.035, 0.22 * v);
    } },
    thud: { reverb: 0.1, play(o, t, v, p) {          // club / hoof on body
      thump(o, t, 150 * p, 60, 0.12, 0.5 * v);
      burst(o, t, 'lowpass', 900, 250, 1, 0.002, 0.08, 0.3 * v);
    } },
    arrow: { reverb: 0.1, play(o, t, v, p) {         // whoosh past
      burst(o, t, 'bandpass', 3200 * p, 900, 2.5, 0.015, 0.11, 0.2 * v);
    } },
    orb: { reverb: 0.4, play(o, t, v, p) {           // spell cast
      burst(o, t, 'bandpass', 500 * p, 2600, 4, 0.03, 0.22, 0.2 * v);
      bell(o, t + 0.02, 880 * p, 0.3, 0.06 * v, 0.6);
    } },
    bolt: { reverb: 0.25, play(o, t, v, p) {         // ballista: wooden thunk, string twang, rush of air
      thump(o, t, 120 * p, 55, 0.14, 0.45 * v);
      burst(o, t, 'bandpass', 700 * p, 500, 6, 0.002, 0.07, 0.3 * v);
      bell(o, t, 210 * p, 0.25, 0.06 * v, 0.3);
      burst(o, t + 0.02, 'bandpass', 2400 * p, 700, 2, 0.01, 0.18, 0.16 * v);
    } },
    flame: { reverb: 0.25, play(o, t, v, p) {        // dragon breath
      burst(o, t, 'lowpass', 1600 * p, 350, 0.8, 0.04, 0.32, 0.32 * v);
      burst(o, t, 'bandpass', 600, 300, 3, 0.02, 0.25, 0.14 * v);
    } },
    splash: { reverb: 0.45, play(o, t, v, p) {       // fireball impact
      thump(o, t, 95 * p, 32, 0.45, 0.65 * v);
      burst(o, t, 'lowpass', 2600, 160, 0.9, 0.004, 0.55, 0.42 * v);
    } },
    heal: { reverb: 0.6, play(o, t, v, p) {          // soft chime
      bell(o, t, N.E6 * p, 0.6, 0.05 * v, 0.4);
      bell(o, t + 0.08, N.B6 * p, 0.7, 0.04 * v, 0.4);
    } },
    charge: { reverb: 0.2, play(o, t, v, p) {        // knight lands a lance
      thump(o, t, 120 * p, 50, 0.18, 0.55 * v);
      bell(o, t, 1500 * p, 0.2, 0.1 * v, 1);
      burst(o, t, 'highpass', 3000, 1500, 0.7, 0.001, 0.05, 0.2 * v);
    } },
    death: { reverb: 0.2, play(o, t, v, p) {         // someone falls
      thump(o, t, 180 * p, 55, 0.2, 0.42 * v);
      burst(o, t, 'lowpass', 700, 200, 1, 0.005, 0.18, 0.26 * v);
    } },
    crumble: { reverb: 0.5, play(o, t, v, p) {       // a building collapses
      thump(o, t, 70 * p, 30, 0.9, 0.6 * v);
      burst(o, t, 'lowpass', 1100, 120, 0.7, 0.03, 1.0, 0.45 * v);
      for (let i = 0; i < 7; i++) burst(o, t + 0.08 + i * 0.09 + Math.random() * 0.05, 'bandpass', 1300 + Math.random() * 1200, 900, 6, 0.002, 0.05, 0.16 * v);
    } },
    collect: { reverb: 0.45, play(o, t, v, p) {      // crystal chime
      bell(o, t, N.G6 * p, 0.35, 0.09 * v, 0.7);
      bell(o, t + 0.06, N.C7 * p, 0.5, 0.08 * v, 0.7);
    } },
    built: { reverb: 0.3, play(o, t, v, p) {         // hammer on wood
      for (let i = 0; i < 3; i++) {
        burst(o, t + i * 0.11, 'bandpass', 950 * p, 700, 7, 0.002, 0.06, 0.4 * v);
        thump(o, t + i * 0.11, 380 * p, 220, 0.06, 0.22 * v);
      }
    } },
    ui: { reverb: 0, play(o, t, v, p) {              // soft wooden tick
      burst(o, t, 'bandpass', 2200 * p, 1600, 5, 0.001, 0.025, 0.22 * v);
    } },
    refuse: { reverb: 0.1, play(o, t, v, p) {        // muted "nope"
      thump(o, t, 210 * p, 150, 0.14, 0.32 * v);
      thump(o, t + 0.1, 170 * p, 120, 0.16, 0.28 * v);
    } },
    alarm: { reverb: 0.5, play(o, t, v) {            // war horn
      brass(o, t, N.D3, 0.42, 0.13 * v);
      brass(o, t, N.A3, 0.42, 0.08 * v);
      brass(o, t + 0.45, N.F3, 0.6, 0.13 * v);
      brass(o, t + 0.45, N.C4, 0.6, 0.08 * v);
    } },
    capture: { reverb: 0.5, play(o, t, v) {          // fanfare
      [N.C4, N.E4, N.G4].forEach((f, i) => brass(o, t + i * 0.12, f, 0.22, 0.1 * v));
      brass(o, t + 0.36, N.C5, 0.6, 0.11 * v);
      brass(o, t + 0.36, N.G4, 0.6, 0.07 * v);
      bell(o, t + 0.36, N.C7, 0.8, 0.05 * v, 0.6);
    } },
    victory: { reverb: 0.5, play(o, t, v) {
      [N.G4, N.C5, N.E5].forEach((f, i) => brass(o, t + i * 0.1, f, 0.2, 0.1 * v));
      for (const f of [N.C5, N.E5, N.G5]) brass(o, t + 0.3, f, 0.7, 0.07 * v);
    } },
    defeat: { reverb: 0.6, play(o, t, v) {
      [N.G4, N.Eb4, N.C4].forEach((f, i) => brass(o, t + i * 0.28, f, 0.4, 0.11 * v));
      for (const f of [N.C4, N.Eb4, N.G3]) brass(o, t + 0.84, f * 0.5, 1.1, 0.07 * v);
    } },
    caravan: { reverb: 0.6, play(o, t, v) {           // distant horn: a caravan is coming
      brass(o, t, N.G3, 0.5, 0.1 * v);
      brass(o, t + 0.55, N.C4, 0.9, 0.11 * v);
      brass(o, t + 0.55, N.G4 * 0.5, 0.9, 0.06 * v);
    } },
    coins: { reverb: 0.4, play(o, t, v) {
      for (let i = 0; i < 7; i++) bell(o, t + i * 0.055, (1800 + Math.random() * 900), 0.25, 0.06 * v, 0.8);
    } },
  };
}

// A short, soft room: decaying stereo noise as the impulse response.
function makeReverb(ac, seconds = 1.4) {
  const len = Math.floor(ac.sampleRate * seconds);
  const ir = ac.createBuffer(2, len, ac.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  }
  const conv = ac.createConvolver();
  conv.buffer = ir;
  return conv;
}

function makeNoise(ac) {
  const buf = ac.createBuffer(1, ac.sampleRate * 2, ac.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return buf;
}

// Level trim per sound, set by measuring them (see measureSounds): frequent combat sounds
// sit around the same loudness, big moments (horns, collapses) clearly above them, and the
// "you can't do that" bump well below so it never nags.
const LEVEL = { arrow: 3, ui: 3, orb: 1.8, flame: 1.7, hit: 1.5, heal: 1.3, thud: 0.6, refuse: 0.5 };

// Wire one context: per-sound panner → dry + reverb send → compressor → volume.
function makeGraph(ac, dest) {
  const comp = ac.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 12;
  comp.ratio.value = 4;
  comp.attack.value = 0.004;
  comp.release.value = 0.2;
  const volume = ac.createGain();
  comp.connect(volume).connect(dest);
  const reverb = makeReverb(ac);
  const wet = ac.createGain();
  wet.gain.value = 0.55;
  reverb.connect(wet).connect(comp);
  const voices = makeVoices(ac, makeNoise(ac));
  function trigger(name, v, pan, when) {
    const voice = voices[name];
    const p = ac.createStereoPanner();
    p.pan.value = Math.max(-0.8, Math.min(0.8, pan));
    p.connect(comp);
    if (voice.reverb) {
      const send = ac.createGain();
      send.gain.value = voice.reverb;
      p.connect(send).connect(reverb);
    }
    voice.play(p, when ?? ac.currentTime + 0.005, v * (LEVEL[name] || 1), 1 + (Math.random() - 0.5) * 0.09);
  }
  return { trigger, volume, voices };
}

// ---------------------------------------------------------------- public

export function createSfx() {
  let ac = null, graph = null;
  let muted = false;
  const last = {};
  try { muted = localStorage.getItem('kz-mute') === '1'; } catch { /* private window */ }

  // Browsers only allow sound after a click or key press; call this from one.
  function unlock() {
    if (ac) { if (ac.state === 'suspended') ac.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    graph = makeGraph(ac, ac.destination);
    graph.volume.gain.value = muted ? 0 : 0.8;
  }

  function play(name, vol = 1, pan = 0) {
    if (!ac || muted || vol <= 0.03) return;
    const now = performance.now();
    if (now - (last[name] || 0) < (GAP[name] || 0)) return;
    last[name] = now;
    graph.trigger(name, Math.min(1, vol), pan);
  }

  const BUILDINGS = { hq: 1, mine: 1, barracks: 1, tower: 1, academy: 1 };
  const HEAVY = { giant: 1, knight: 1, commander: 1 };

  // Loudness falls off with distance from the middle of the screen; left/right follows x.
  function fromEvents(events, cam, meId) {
    if (!ac || muted) return;
    for (const e of events) {
      const x = e.x ?? e.x1, y = e.y ?? e.y1;
      const far = x === undefined ? 0 : Math.hypot(x - cam.x, y - cam.y);
      const v = Math.max(0, 1 - far / 950) ** 1.6;
      const pan = x === undefined ? 0 : (x - cam.x) / 700;
      switch (e.type) {
        case 'hit': play(HEAVY[e.kind] ? 'thud' : 'hit', v * 0.8, pan); break;
        case 'shot': play(e.kind === 'mage' ? 'orb' : e.kind === 'dragon' ? 'flame' : e.kind === 'ballista' ? 'bolt' : 'arrow', v, pan); break;
        case 'splash': play('splash', v, pan); break;
        case 'heal': play('heal', v, pan); break;
        case 'charge': play('charge', v, pan); break;
        case 'death': play(BUILDINGS[e.kind] ? 'crumble' : 'death', v, pan); break;
        case 'collect': if (e.owner === meId) play('collect', 1, pan); break;
        case 'built': play('built', e.owner === meId ? 1 : v, pan); break;
        case 'captured': play('capture', e.player === meId ? 1 : 0.5); break;
        case 'eliminated': if (e.player === meId) play('defeat', 1); else if (e.by === meId) play('victory', 1); break;
        case 'cheat': if (e.player === meId) play('coins', 1); break;
        case 'caravan':
          if (e.phase === 'spawn') play('caravan', 0.8);
          else if (e.phase === 'loot') play(e.by === meId ? 'coins' : 'crumble', e.by === meId ? 1 : v);
          break;
        default:
      }
    }
  }

  function toggleMute() {
    muted = !muted;
    try { localStorage.setItem('kz-mute', muted ? '1' : '0'); } catch { /* private window */ }
    if (graph) graph.volume.gain.value = muted ? 0 : 0.8;
    return muted;
  }

  return { unlock, play, fromEvents, toggleMute, isMuted: () => muted };
}

// Development aid: render every sound offline and report its length and loudness,
// so levels can be balanced without listening. Not used by the game itself.
export async function measureSounds() {
  const names = Object.keys(makeVoices(new OfflineAudioContext(1, 1, 44100), null));
  const out = {};
  for (const name of names) {
    const ac = new OfflineAudioContext(2, 44100 * 3, 44100);
    const graph = makeGraph(ac, ac.destination);
    graph.volume.gain.value = 0.8;
    graph.trigger(name, 1, 0, 0.01);
    const buf = await ac.startRendering();
    const d = buf.getChannelData(0);
    let peak = 0, sum = 0, end = 0;
    for (let i = 0; i < d.length; i++) {
      const a = Math.abs(d[i]);
      if (a > peak) peak = a;
      sum += d[i] * d[i];
      if (a > 0.003) end = i;
    }
    // loudness over the part that actually sounds
    out[name] = { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / Math.max(1, end)).toFixed(3), seconds: +(end / 44100).toFixed(2) };
  }
  return out;
}
