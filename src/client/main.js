// Game loop. Three modes share one renderer and HUD:
//   attract  bots play behind the start screen
//   local    you against bots, simulated in this browser
//   online   the server simulates; we mirror and draw

import { createWorld, addPlayer, queueCommand, setInput, step, findById, DT, BOT_NAMES } from '../sim/index.js';
import { createRenderer } from './render.js';
import { createInput } from './input.js';
import { createHud } from './hud.js';
import { connect } from './net.js';
import { createSfx } from './sfx.js';
import { createAdmin } from './admin.js';
import { cleanRoom } from '../net/protocol.js';

const MAX_STEPS_PER_FRAME = 5;
const BOT_LEVELS = ['easy', 'normal', 'easy', 'normal', 'hard'];

const $ = (id) => document.getElementById(id);
const canvas = $('game');
const renderer = createRenderer(canvas);
const startEl = $('start'), deadEl = $('dead'), deadText = $('deadText');
const nameEl = $('name'), playBtn = $('play'), statusEl = $('status');

const game = { world: null, me: null, playing: false, net: null, fps: 60, stepMs: 0, drawMs: 0 };
window.__game = game;

// The admin key arrives once in the link (?admin=…). Keep it for this tab only and take it
// out of the address bar straight away, so copying the address never shares it.
let adminKey;
try {
  const url = new URL(location.href);
  const fromUrl = url.searchParams.get('admin');
  if (fromUrl) {
    try { sessionStorage.setItem('kz-admin', fromUrl); } catch { /* private window */ }
    url.searchParams.delete('admin');
    history.replaceState(null, '', url);
  }
  adminKey = fromUrl || sessionStorage.getItem('kz-admin') || undefined;
} catch { /* storage blocked: the key from the link still works this once */ }

const sfx = createSfx();

function act(cmd) {
  sfx.unlock();
  if (cmd.type === 'mute') { hud.setMuted(sfx.toggleMute()); return; }
  if (!game.playing) return;
  if (cmd.type !== 'respawn' && !game.me.alive) return;
  if (game.net) game.net.command(cmd);
  else queueCommand(game.world, game.me.id, cmd);
  hud.flash(cmd);
  sfx.play('ui');
}

const hud = createHud(act);
const input = createInput(canvas, act);
const admin = createAdmin(act);
hud.setMuted(sfx.isMuted());
const roomEl = $('roomCode');
roomEl.value = cleanRoom(new URLSearchParams(location.search).get('kamer'));
$('newRoom').addEventListener('click', () => {
  const letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  roomEl.value = Array.from({ length: 4 }, () => letters[Math.floor(Math.random() * letters.length)]).join('');
});

function newLocalWorld(withHuman) {
  const world = createWorld({ seed: (Date.now() & 0x7fffffff) || 1, cheats: true });
  let me = null;
  if (withHuman) me = addPlayer(world, { name: 'Jij' });
  const bots = withHuman ? BOT_LEVELS : [...BOT_LEVELS, 'normal'];
  bots.forEach((difficulty, i) => addPlayer(world, { name: BOT_NAMES[i % BOT_NAMES.length], isBot: true, difficulty }));
  game.world = world;
  game.me = me || world.players[0];
  game.playing = withHuman;
  lookAtKing();
  renderer.effects.length = 0;
}

function lookAtKing() {
  const c = game.me && game.me.commanderId ? findById(game.world.units, game.me.commanderId) : null;
  if (c) { renderer.cam.x = c.x; renderer.cam.y = c.y; }
}

function enterGame() {
  startEl.hidden = true;
  deadEl.hidden = true;
  hud.show(true);
  input.clear();
  nameEl.blur();
}

function say(text) {
  statusEl.hidden = !text;
  statusEl.textContent = text;
}

function startLocal() {
  sfx.unlock();
  hud.setRoom('');
  admin.show(true); // practice: you are always the admin
  if (game.net) { game.net.close(); game.net = null; }
  newLocalWorld(true);
  enterGame();
}

function startOnline() {
  if (game.net || playBtn.disabled) return;
  sfx.unlock();
  const name = nameEl.value.trim();
  try { localStorage.setItem('kz-name', name); } catch { /* private window */ }
  playBtn.disabled = true;
  playBtn.textContent = 'Verbinden…';
  say('');
  const key = adminKey;
  const net = connect({
    name, key, room: cleanRoom(roomEl.value),
    onReady(n) {
      game.net = n;
      game.world = n.world;
      game.me = n.me;
      admin.show(!!n.admin);
      game.playing = true;
      renderer.effects.length = 0;
      lookAtKing();
      enterGame();
      // put the room in the address bar so the link itself is the invitation
      const url = new URL(location.href);
      if (n.room) url.searchParams.set('kamer', n.room); else url.searchParams.delete('kamer');
      history.replaceState(null, '', url);
      const invite = new URL(url);
      hud.setRoom(n.room, invite.href);
    },
    onClose(why) {
      playBtn.disabled = false;
      playBtn.textContent = 'Spelen';
      const wasPlaying = game.net === net;
      game.net = null;
      if (wasPlaying) {
        hud.show(false);
        deadEl.hidden = true;
        startEl.hidden = false;
        newLocalWorld(false);
      }
      say(why === 'full' ? 'De server zit vol. Probeer het zo nog eens.'
        : why === 'lost' ? 'Verbinding met de server verbroken.'
        : 'Server niet bereikbaar. Je kunt wel oefenen tegen bots.');
    },
  });
}

function respawn() {
  if (!game.playing || game.me.alive) return;
  act({ type: 'respawn' });
  deadEl.hidden = true;
}

try { nameEl.value = localStorage.getItem('kz-name') || ''; } catch { /* private window */ }
playBtn.addEventListener('click', startOnline);
$('practice').addEventListener('click', startLocal);
$('again').addEventListener('click', respawn);
window.addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && !startEl.hidden) { startOnline(); return; }
  if ((e.code === 'Enter' || e.code === 'Space') && !deadEl.hidden) respawn();
});
window.addEventListener('resize', renderer.resize);

// Things the HUD and camera care about, whichever mode produced the events.
function handleEvents(world, me) {
  renderer.addEvents(world, game.playing ? me.id : -1);
  if (!game.playing) return;
  hud.events(world, me);
  for (const e of world.events) {
    if (e.type === 'boost' && e.player === me.id) hud.say(e.on ? 'Turbo aan' : 'Turbo uit');
    if (e.type === 'order' && (e.player === me.id || e.reason === 'done')) hud.say(e.reason === 'done' ? 'Doelwit uitgeschakeld — bots spelen weer zelf' : admin.say(e.order, e.target, world, me));
  }
  sfx.fromEvents(world.events, renderer.cam, me.id);
  if (me.notice && me.notice.at !== lastNotice) { lastNotice = me.notice.at; sfx.play('refuse'); }
  if (me.alive && world.time - me.hqHitAt < 0.5 && world.time - lastAlarm > 5) { lastAlarm = world.time; sfx.play('alarm'); }
  for (const e of world.events) {
    if (e.type === 'eliminated' && e.player === me.id) {
      const by = e.by >= 0 && world.players[e.by] ? world.players[e.by].name : 'een onbekende';
      deadText.textContent = `Gesloopt door ${by}. Eindscore: ${e.score}.`;
      setTimeout(() => { if (game.playing && !game.me.alive) deadEl.hidden = false; }, 900);
    }
    if (e.type === 'spawned' && e.player === me.id) lookAtKing();
  }
}

function steer() {
  const { world, me } = game;
  const c = me.alive && me.commanderId ? findById(world.units, me.commanderId) : null;
  if (!c) return { x: 0, y: 0 };
  const sx = renderer.w / 2 + (c.x - renderer.cam.x) * renderer.scale;
  const sy = renderer.h / 2 + (c.y - renderer.cam.y) * renderer.scale;
  return input.direction(sx, sy);
}

function localTick() {
  const { world, me } = game;
  if (game.playing) { const d = steer(); setInput(world, me.id, d.x, d.y); }
  step(world, DT);
  handleEvents(world, me);
}

let last = performance.now();
let acc = 0;
let hudTimer = 0;
let lastNotice = -1, lastAlarm = -99;

function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000;
  last = now;
  if (dt > 0.25) dt = 0.25; // tab was in the background: drop the backlog
  game.fps += (1 / Math.max(dt, 0.001) - game.fps) * 0.05;

  let alpha;
  const net = game.net;
  if (net) {
    const d = steer();
    net.setInput(d.x, d.y);
    alpha = net.frame(dt);
    net.world.events = net.takeEvents();
    game.me = net.me;
    if (net.world.events.length) handleEvents(net.world, net.me);
    net.world.events = [];
  } else {
    acc += dt;
    let steps = 0;
    const t0 = performance.now();
    while (acc >= DT && steps < MAX_STEPS_PER_FRAME) { localTick(); acc -= DT; steps++; }
    if (steps) game.stepMs += ((performance.now() - t0) / steps - game.stepMs) * 0.05;
    if (acc > DT) acc = 0;
    alpha = acc / DT;
  }

  // camera follows the king (or the castle while he is away)
  const { world, me } = game;
  let fx = renderer.cam.x, fy = renderer.cam.y;
  const c = me.commanderId ? findById(world.units, me.commanderId) : null;
  if (c) { fx = c.px + (c.x - c.px) * alpha; fy = c.py + (c.y - c.py) * alpha; }
  else if (me.alive) { const hq = findById(world.buildings, me.hqId); if (hq) { fx = hq.x; fy = hq.y; } }
  const k = 1 - Math.exp(-dt * (game.playing ? 9 : 2));
  renderer.cam.x += (fx - renderer.cam.x) * k;
  renderer.cam.y += (fy - renderer.cam.y) * k;

  const d0 = performance.now();
  renderer.draw(world, game.playing ? me.id : -1, alpha, dt);
  game.drawMs += (performance.now() - d0 - game.drawMs) * 0.05;

  hudTimer += dt;
  if (game.playing && hudTimer > 0.1) {
    hudTimer = 0;
    hud.update(world, me, net ? me.stats : undefined);
    admin.update(world, me);
  }
}

// Debug hooks for automated play tests.
game.renderer = renderer;
game.advance = (seconds) => {
  if (game.net) return;
  for (let i = 0; i < seconds / DT; i++) localTick();
  hud.update(game.world, game.me);
  admin.update(game.world, game.me);
};

newLocalWorld(false); // bots play behind the start screen
requestAnimationFrame(frame);
