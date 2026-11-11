// Game server: serves the client files and runs the shared world over WebSockets.
//   PORT       port to listen on (hosting platforms set this themselves; default 5173)
//   ADMIN_KEY  optional secret; open the game as  /?admin=<key>  to unlock the gold code

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { networkInterfaces } from 'node:os';
import { extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { createRoom } from './src/server/room.js';
import { cleanRoom } from './src/net/protocol.js';

const root = fileURLToPath(new URL('.', import.meta.url));
const port = Number(process.env.PORT) || 5173;
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
};
const served = ['index.html', 'style.css', `src${sep}`];

const server = createServer(async (req, res) => {
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path === '/') path = '/index.html';
    if (path === '/health') { res.writeHead(200).end('ok'); return; }
    const rel = normalize(path).replace(/^[\\/]+/, '');
    if (rel.includes('..') || !served.some((s) => rel === s || rel.startsWith(s))) throw new Error('not served');
    const data = await readFile(join(root, rel));
    res.writeHead(200, { 'Content-Type': types[extname(rel)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Niet gevonden');
  }
});

// One world per room code. '' is the public world; any other code is a private one that
// exists for as long as somebody is in it.
const MAX_ROOMS = 40;
const rooms = new Map();
function roomFor(code) {
  let game = rooms.get(code);
  if (!game) {
    if (rooms.size >= MAX_ROOMS) return null;
    const tag = code ? `kamer ${code}` : 'open wereld';
    game = createRoom({
      code,
      adminKey: process.env.ADMIN_KEY || '',
      log: (text) => console.log(`[${new Date().toLocaleTimeString('nl-NL')}] ${tag}: ${text}`),
    });
    rooms.set(code, game);
  }
  return game;
}

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 2048 });
wss.on('connection', (ws) => {
  let client = null, game = null, code = '';
  ws.isAlive = true;
  ws.on('pong', () => { ws.isAlive = true; });
  const send = (msg) => {
    // A client on a slow line skips snapshots instead of piling them up.
    if (ws.readyState === ws.OPEN && ws.bufferedAmount < 256 * 1024) ws.send(JSON.stringify(msg));
  };
  ws.on('message', (data, isBinary) => {
    if (isBinary) return;
    let msg;
    try { msg = JSON.parse(data.toString()); } catch { return; }
    if (!client) {
      if (msg?.t !== 'join') return;
      code = cleanRoom(msg.room);
      game = roomFor(code);
      client = game ? game.join(send, msg) : null;
      if (!client) {
        if (game && game.humans() === 0) rooms.delete(code);
        if (!game) send({ t: 'full' }); // too many rooms; join() explains its own refusals
        ws.close();
      }
      return;
    }
    game.receive(client, msg);
  });
  ws.on('close', () => {
    if (!client) return;
    game.leave(client);
    if (game.humans() === 0) rooms.delete(code);
  });
  ws.on('error', () => {});
});

// Drop connections that stopped answering.
setInterval(() => {
  for (const ws of wss.clients) {
    if (!ws.isAlive) { ws.terminate(); continue; }
    ws.isAlive = false;
    ws.ping();
  }
}, 20000);

server.listen(port, () => {
  console.log(`Kristalzwerm draait op http://localhost:${port}`);
  for (const list of Object.values(networkInterfaces())) {
    for (const n of list || []) {
      if (n.family === 'IPv4' && !n.internal) console.log(`  op je eigen netwerk: http://${n.address}:${port}`);
    }
  }
});
