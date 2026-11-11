// DOM HUD: resources, action buttons, scoreboard, messages, tips.

import { UNITS, BUILDINGS, WORLD, SPECS, playerStats, buildingCost, countOwned } from '../sim/index.js';
import { colorOf } from './render.js';
import { iconUrl } from './sprites.js';

const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

const BUILD = [
  ['mine', 'Mijn', '1', 'Digit1', '+2 goud per seconde'],
  ['barracks', 'Kazerne', '2', 'Digit2', `+${BUILDINGS.barracks.supply} leger; schutters, ridders, reuzen en ballisten`],
  ['tower', 'Toren', '3', 'Digit3', 'Schiet op vijanden in de buurt'],
  ['academy', 'Academie', '4', 'Digit4', `+${BUILDINGS.academy.supply} leger; magiërs, genezers en draken`],
  ['forge', 'Smidse', '5', 'Digit5', 'Specialiseer je troepen: klik daarna op ★ bij een troep'],
];
const TRAIN = [
  ['soldier', 'Soldaat', 'Q', 'Goedkoop en stevig'],
  ['archer', 'Schutter', 'E', 'Schiet van afstand'],
  ['knight', 'Ridder', 'R', 'Snel; opent met een stormloop'],
  ['giant', 'Reus', 'F', 'Traag en taai; sloopt gebouwen'],
  ['ballista', 'Balliste', 'T', 'Schiet ver; 3,5× schade op draken'],
  ['mage', 'Magiër', 'Z', 'Vuurbal raakt een hele groep'],
  ['healer', 'Genezer', 'X', 'Geneest gewonde troepen'],
  ['dragon', 'Draak', 'C', 'Elite: vliegt, alleen afstandstroepen raken hem'],
];
const NEEDS = { barracks: 'Kazerne', academy: 'Academie' };
const NOTICES = {
  gold: 'Niet genoeg goud',
  supply: 'Legerlimiet bereikt — bouw een Kazerne of Academie',
  barracks: 'Bouw eerst een Kazerne',
  academy: 'Bouw eerst een Academie',
  blocked: 'Daar staat al een gebouw',
  edge: 'Te dicht bij de rand',
  enemy: 'Te dicht bij een vijandelijke basis',
  commander: 'Je koning is onderweg terug',
  targetShield: 'Dat kasteel heeft nog een schild',
  forge: 'Bouw eerst een Smidse (5)',
  specDone: 'Die troep is al gespecialiseerd',
  max: 'Je hebt al het maximum aantal draken (3)',
};

export function createHud(onAction) {
  const el = {
    hud: $('hud'), gold: $('gold'), income: $('income'), supply: $('supply'), queue: $('queue'),
    shieldRow: $('shieldRow'), shield: $('shield'),
    board: $('board'), feed: $('feed'), banner: $('banner'), tip: $('tip'),
    build: $('buildGroup'), train: $('trainGroup'), specMenu: $('specMenu'),
    follow: $('armyFollow'), hold: $('armyHold'), attack: $('armyAttack'), attackMenu: $('attackMenu'), armyState: $('armyState'),
    mute: $('mute'), room: $('room'),
    buttons: [],
  };
  let lastNoticeAt = -1, lastNoticeCode = '', lastNoticeShown = -99;
  let lastBoard = '';
  const mine = colorOf(0);

  const addButton = (group, cmd, [kind, name, key, , hint]) => {
    const b = document.createElement('button');
    b.dataset.cmd = cmd;
    b.dataset.kind = kind;
    b.title = `${name} — ${cmd === 'build' ? BUILD.find((x) => x[0] === kind)[4] : hint}`;
    const star = cmd === 'train' && SPECS[kind] ? '<b class="star" title="Specialiseren" hidden>★</b>' : '';
    b.innerHTML = `<kbd>${key}</kbd><img alt="" src="${iconUrl(kind, mine)}"><span>${name}</span>${star}<i></i>`;
    b.addEventListener('click', (e) => {
      if (e.target.classList.contains('star')) { e.stopPropagation(); openSpecMenu(kind); b.blur(); return; }
      onAction({ type: cmd, kind }); b.blur();
    });
    group.append(b);
    el.buttons.push(b);
  };
  for (const row of BUILD) addButton(el.build, 'build', row);
  for (const [kind, name, key, hint] of TRAIN) addButton(el.train, 'train', [kind, name, key, null, hint]);

  const say = (text, warn) => {
    const d = document.createElement('div');
    d.textContent = text;
    if (warn) d.className = 'warn';
    el.feed.append(d);
    while (el.feed.children.length > 4) el.feed.firstChild.remove();
    setTimeout(() => d.remove(), 4600);
  };

  const flash = (cmd) => {
    const b = el.buttons.find((x) => x.dataset.cmd === cmd.type && x.dataset.kind === cmd.kind);
    if (!b) return;
    b.classList.add('flash');
    setTimeout(() => b.classList.remove('flash'), 90);
  };

  // Called ~10 times per second.
  // `stats` comes from the server when playing online; offline we work it out here.
  // Pick an enemy castle: every living opponent, strongest score first; shielded ones greyed out.
  let lastWorld = null, lastMe = null, lastMenu = '';
  function fillAttackMenu(world, me) {
    const foes = world.players.filter((p) => p && !p.left && p.alive && p.id !== me.id).sort((a, b) => b.score - a.score);
    const html = '<p>Val het kasteel aan van</p>' + (foes.length ? foes.map((p) => {
      const shield = p.shieldUntil > world.time;
      return `<button data-t="${p.id}" class="${shield ? 'off' : ''}${me.army === 'attack' && me.armyTarget === p.id ? ' on' : ''}"><i style="background:${colorOf(p.id).main}"></i>${esc(p.name)}<small>${me.revenge === p.id ? (shield ? 'wraak · schild' : 'wraak') : shield ? 'schild' : Math.floor(p.score)}</small></button>`;
    }).join('') : '<p>Geen tegenstanders</p>');
    if (html !== lastMenu) { el.attackMenu.innerHTML = html; lastMenu = html; }
  }

  // Specialisation menu: the two directions for one troop type, with their look and price.
  const specName = (kind, id) => (SPECS[kind].a.id === id ? SPECS[kind].a.name : SPECS[kind].b.name);
  let specKind = null;
  function openSpecMenu(kind) {
    specKind = kind;
    el.specMenu.hidden = false;
    fillSpecMenu();
  }
  function fillSpecMenu() {
    if (!specKind || el.specMenu.hidden || !lastMe) return;
    const s = SPECS[specKind], me = lastMe, chosen = me.specs && me.specs[specKind];
    const unitName = TRAIN.find((t) => t[0] === specKind)[1];
    const card = (side) => {
      const o = s[side], picked = chosen === o.id, other = chosen && !picked;
      const afford = me.gold >= s.cost;
      return `<button data-side="${side}" class="${picked ? 'on' : ''}${other || (!chosen && !afford) ? ' off' : ''}"${chosen ? ' disabled' : ''}>
        <img alt="" src="${iconUrl(specKind, mine, o.id)}"><span><b>${o.name}</b><small>${o.desc}</small></span>
        <i>${picked ? 'gekozen' : other ? '—' : s.cost}</i></button>`;
    };
    const html = `<p>${unitName} specialiseren${chosen ? '' : ' — kies één, voor de rest van dit leven'}</p>${card('a')}${card('b')}`;
    if (html !== el.specMenu.dataset.html) { el.specMenu.innerHTML = html; el.specMenu.dataset.html = html; }
  }
  el.specMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b || b.disabled || b.classList.contains('off')) return;
    onAction({ type: 'spec', kind: specKind, choice: b.dataset.side });
    el.specMenu.hidden = true;
  });
  document.addEventListener('click', () => { el.specMenu.hidden = true; });

  const update = (world, me, stats) => {
    lastWorld = world; lastMe = me;
    fillSpecMenu();
    const st = stats || playerStats(world, me.id);
    el.gold.textContent = Math.floor(me.gold);
    const heart = world.shrine && world.shrine.owner === me.id ? WORLD.shrineIncome : 0;
    el.income.textContent = heart ? `+${st.income + heart}/s met Kristalhart` : `+${st.income}/s`;
    const mode = me.army || 'follow';
    el.follow.classList.toggle('on', mode === 'follow');
    el.hold.classList.toggle('on', mode === 'hold');
    el.attack.classList.toggle('on', mode === 'attack');
    const foe = world.players[me.armyTarget];
    el.armyState.lastElementChild.textContent = mode === 'attack' ? `Leger valt ${foe ? foe.name : '?'} aan` : mode === 'hold' ? 'Leger bewaakt je kasteel' : 'Leger volgt je';
    if (!el.attackMenu.hidden) fillAttackMenu(world, me);
    el.supply.textContent = `${st.supply}/${st.cap}`;
    const training = me.queue.length + world.buildings.reduce((n, b) => n + (b.owner === me.id && b.train ? 1 : 0), 0);
    el.queue.textContent = training ? `${training} in opleiding` : 'leger';

    const shield = me.alive ? me.shieldUntil - world.time : 0;
    el.shieldRow.hidden = shield <= 0;
    if (shield > 0) el.shield.textContent = `${Math.floor(shield / 60)}:${String(Math.floor(shield % 60)).padStart(2, '0')}`;

    for (const b of el.buttons) {
      const kind = b.dataset.kind;
      let cost, locked = '', full = false;
      if (b.dataset.cmd === 'build') cost = buildingCost(kind, st);
      else {
        const def = UNITS[kind];
        cost = def.cost;
        if (def.needs && !st[def.needs]) locked = NEEDS[def.needs];
        full = st.supply + def.supply > st.cap;
        if (def.max && countOwned(world, me, kind) >= def.max) locked = `max ${def.max}`;
      }
      b.lastElementChild.textContent = locked || (full ? 'vol' : cost);
      const star = b.querySelector('.star');
      if (star) {
        const chosen = me.specs && me.specs[kind];
        star.hidden = !st.forge;
        star.classList.toggle('done', !!chosen);
        star.title = chosen ? `Gespecialiseerd: ${specName(kind, chosen)}` : 'Specialiseren';
        const img = b.querySelector('img');
        if (img.dataset.spec !== (chosen || '')) { img.dataset.spec = chosen || ''; img.src = iconUrl(kind, mine, chosen || undefined); }
      }
      b.classList.toggle('off', !!locked || full || me.gold < cost);
      b.classList.toggle('locked', !!locked);
    }

    // scoreboard
    const rows = world.players.filter((p) => p && !p.left).sort((a, b) => b.score - a.score);
    const html = rows.map((p) =>
      `<li class="${p.id === me.id ? 'me' : ''}${p.alive ? '' : ' out'}"><i style="background:${colorOf(p.id).main}"></i><span>${p.id === world.leader ? '<em class="crown">♛</em> ' : ''}${p.id === me.id ? 'Jij' : esc(p.name)}</span><b>${Math.floor(p.score)}</b></li>`
    ).join('');
    if (html !== lastBoard) { el.board.innerHTML = html; lastBoard = html; }

    // refused commands
    if (me.notice && me.notice.at !== lastNoticeAt) {
      // Holding a key repeats the command; say each reason at most once per 2 s.
      const repeat = me.notice.code === lastNoticeCode && me.notice.at - lastNoticeShown < 2;
      lastNoticeAt = me.notice.at;
      if (!repeat) {
        lastNoticeCode = me.notice.code;
        lastNoticeShown = me.notice.at;
        say(NOTICES[me.notice.code] || 'Dat kan nu niet', true);
      }
    }

    // banner: base under attack / commander down
    let banner = '';
    if (me.alive && !me.commanderId) banner = `Je koning keert terug over ${Math.ceil(Math.max(0, me.commanderRespawn))} s`;
    else if (me.alive && world.time - me.hqHitAt < 2.5) banner = 'Je kasteel wordt aangevallen!';
    el.banner.hidden = !banner;
    if (banner) el.banner.textContent = banner;

    // contextual tip for the first minutes of a life
    let tip = '';
    const age = world.time - me.spawnedAt;
    if (me.alive && age < 300 && me.score < 2500) {
      if (st.barracks === 0) tip = me.gold >= BUILDINGS.barracks.cost ? 'Druk op 2 voor een Kazerne — groter leger en sterkere troepen' : 'Loop over de gouden kristallen om goud te verzamelen';
      else if (st.army < 10) tip = 'Train troepen met Q, E, R, F en T — je leger volgt je en valt vanzelf aan';
      else if (st.academy === 0) tip = me.gold >= BUILDINGS.academy.cost ? 'Druk op 4 voor een Academie — magiërs, genezers en draken' : 'Spaar voor een Academie (220 goud) of bouw nog een Mijn (1)';
      else if (shield > 0) tip = 'Je kasteel is beschermd zolang het schild staat — bouw je leger op';
      else if (age < 260) tip = 'Zoek een vijand op de kaart rechtsonder en sloop zijn kasteel';
    }
    el.tip.hidden = !tip;
    if (tip) el.tip.textContent = tip;
  };

  // Announce what happened this tick.
  const events = (world, me) => {
    for (const e of world.events) {
      if (e.type === 'cheat' && e.player === me.id) say(`Geheime schatkist geopend: +${e.gold} goud`);
      if (e.type === 'spec' && e.player === me.id) say(`${TRAIN.find((t) => t[0] === e.kind)[1]}: ${specName(e.kind, e.spec)}!`);
      if (e.type === 'caravan') {
        if (e.phase === 'spawn') say('Een goudkaravaan trekt door het land — zie de kaart rechtsonder');
        else if (e.phase === 'escaped') say('De goudkaravaan is ontsnapt');
        else if (e.phase === 'loot') {
          const who = e.by === me.id ? 'Jij hebt' : world.players[e.by] ? `${world.players[e.by].name} heeft` : 'Iemand heeft';
          say(`${who} de goudkaravaan geplunderd (+${e.gold} goud)`, e.by !== me.id);
        }
      }
      if (e.type === 'captured') {
        const who = e.player === me.id ? 'Jij hebt' : `${world.players[e.player] ? world.players[e.player].name : 'Iemand'} heeft`;
        say(`${who} het Kristalhart veroverd (+${WORLD.shrineIncome} goud/s)`, e.player !== me.id);
      }
      if (e.type !== 'eliminated') continue;
      const loser = e.player === me.id ? 'Jij bent' : `${world.players[e.player].name} is`;
      const by = e.by === me.id ? 'jou' : e.by >= 0 ? world.players[e.by].name : 'onbekend';
      say(`${loser} uitgeschakeld door ${by}${e.by === me.id ? ` (+${e.bounty} goud)` : ''}`, e.player === me.id);
    }
  };

  el.follow.addEventListener('click', () => { onAction({ type: 'army', mode: 'follow' }); el.follow.blur(); });
  el.hold.addEventListener('click', () => { onAction({ type: 'army', mode: 'hold' }); el.hold.blur(); });
  el.attack.addEventListener('click', (e) => {
    e.stopPropagation();
    el.attackMenu.hidden = !el.attackMenu.hidden;
    if (!el.attackMenu.hidden && lastWorld) fillAttackMenu(lastWorld, lastMe);
    el.attack.blur();
  });
  el.attackMenu.addEventListener('click', (e) => {
    e.stopPropagation();
    const b = e.target.closest('button');
    if (!b || b.classList.contains('off')) return;
    onAction({ type: 'army', mode: 'attack', target: Number(b.dataset.t) });
    el.attackMenu.hidden = true;
  });
  document.addEventListener('click', () => { el.attackMenu.hidden = true; });
  el.mute.addEventListener('click', () => { onAction({ type: 'mute' }); el.mute.blur(); });
  const setMuted = (m) => { el.mute.querySelector('span').textContent = m ? 'Geluid uit' : 'Geluid aan'; el.mute.classList.toggle('on', m); };

  // Private room: show the code; a click copies the invite link.
  const setRoom = (code, link) => {
    el.room.hidden = !code;
    if (!code) return;
    el.room.textContent = `Kamer ${code} — kopieer uitnodiging`;
    el.room.onclick = async () => {
      try { await navigator.clipboard.writeText(link); say('Uitnodigingslink gekopieerd'); }
      catch { say(link); }
    };
  };

  return { update, events, say, flash, setMuted, setRoom, show: (v) => { el.hud.hidden = !v; } };
}
