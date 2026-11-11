// Fold-out admin panel: turbo, gold, and orders for every bot at once.
// Only shown offline (practice) or online when the server accepted your admin key.

import { colorOf } from './render.js';

const ORDER_TEXT = {
  center: 'Bots gaan naar het Kristalhart',
  home: 'Bots verdedigen hun kasteel',
  attack: 'Bots vallen aan',
  free: 'Bots spelen weer zelf',
};
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

export function createAdmin(onAction) {
  const root = document.getElementById('admin');
  root.innerHTML = `
    <button class="admin-head" type="button" aria-expanded="false"><span>Admin</span><i>▸</i></button>
    <div class="admin-body" hidden>
      <div class="admin-row">
        <button data-a="boost" class="toggle"><b>Turbo</b><small>V L U G</small></button>
        <button data-a="cheat"><b>+1000 goud</b><small>G O U D</small></button>
      </div>
      <div class="admin-row">
        <button data-a="caravan"><b>Karavaan oproepen</b></button>
      </div>
      <p class="admin-label">Bots versterken</p>
      <div class="admin-row">
        <button data-a="empower" data-what="gold"><b>+1000 goud</b><small>elke bot</small></button>
        <button data-a="empower" data-what="army"><b>+20 troepen</b><small>elke bot</small></button>
      </div>
      <p class="admin-label">Alle bots</p>
      <div class="admin-row">
        <button data-o="center"><b>Naar het midden</b></button>
        <button data-o="home"><b>Naar huis</b></button>
      </div>
      <div class="admin-row">
        <button data-o="me"><b>Val mij aan</b></button>
        <button data-o="free"><b>Vrij spel</b></button>
      </div>
      <p class="admin-label">Laat ze aanvallen</p>
      <div class="admin-targets"></div>
      <p class="admin-status"></p>
    </div>`;
  const head = root.querySelector('.admin-head');
  const body = root.querySelector('.admin-body');
  const boostBtn = root.querySelector('[data-a="boost"]');
  const targets = root.querySelector('.admin-targets');
  const status = root.querySelector('.admin-status');
  let meId = -1, lastTargets = '';

  head.addEventListener('click', () => {
    body.hidden = !body.hidden;
    head.setAttribute('aria-expanded', String(!body.hidden));
    head.querySelector('i').textContent = body.hidden ? '▸' : '▾';
    head.blur();
  });
  root.addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b || b === head) return;
    b.blur();
    if (b.dataset.a) onAction({ type: b.dataset.a, what: b.dataset.what });
    else if (b.dataset.o === 'me') onAction({ type: 'order', order: 'attack', target: meId });
    else if (b.dataset.o) onAction({ type: 'order', order: b.dataset.o });
    else if (b.dataset.t) onAction({ type: 'order', order: 'attack', target: Number(b.dataset.t) });
  });

  return {
    show(on) { root.hidden = !on; },
    update(world, me) {
      if (root.hidden) return;
      meId = me.id;
      boostBtn.classList.toggle('on', !!me.boost);
      const list = world.players.filter((p) => p && !p.left && p.alive);
      const html = list.map((p) =>
        `<button data-t="${p.id}"><i style="background:${colorOf(p.id).main}"></i>${p.id === me.id ? 'Jij' : esc(p.name)}</button>`).join('');
      if (html !== lastTargets) { targets.innerHTML = html; lastTargets = html; }
      const o = world.botOrder;
      let text = 'Bots spelen zelf';
      if (o) {
        const t = world.players[o.target];
        text = o.order === 'attack' ? `Bots vallen ${o.target === me.id ? 'jou' : t ? t.name : '?'} aan` : ORDER_TEXT[o.order];
      }
      status.textContent = text;
      for (const b of root.querySelectorAll('[data-o],[data-t]')) {
        const on = o && ((b.dataset.o && (b.dataset.o === o.order || (b.dataset.o === 'me' && o.order === 'attack' && o.target === me.id)))
          || (b.dataset.t && o.order === 'attack' && Number(b.dataset.t) === o.target));
        b.classList.toggle('on', !!on);
      }
    },
    say: (order, target, world, me) => {
      if (order === 'attack') {
        const t = world.players[target];
        return `Bots vallen ${target === me.id ? 'jou' : t ? t.name : '?'} aan`;
      }
      return ORDER_TEXT[order];
    },
  };
}
