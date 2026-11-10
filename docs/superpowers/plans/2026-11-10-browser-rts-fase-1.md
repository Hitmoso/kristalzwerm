# Browser-RTS fase 1 — implementatieplan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Een speelbare arcade-RTS in de browser: jij plus vijf AI-bots in één doorlopende, begrensde arena.

**Architecture:** Een pure simulatiemodule (`src/sim/`) met vaste tijdstap van 30 Hz, gestuurd door commando's per speler en zonder enige DOM-afhankelijkheid; bots zitten in de simulatie en gebruiken dezelfde commando's als een mens. De client (`src/client/`) leest de wereldtoestand, interpoleert en tekent op één 2D-canvas, en vertaalt toetsen/muis naar commando's. Een mini-Node-server serveert alleen statische bestanden (ES-modules laden niet vanaf `file://`).

**Tech Stack:** Vanilla JavaScript (ES-modules), Canvas 2D, Node 24 (`node --test`, statische server). Geen dependencies, geen build-stap.

**Spec:** `docs/superpowers/specs/2026-11-10-browser-rts-design.md`

## Global Constraints

- 2D bovenaanzicht, geen installatie, geen account.
- Arena is begrensd met zichtbare randen: 5000 × 5000 wereldeenheden.
- `src/sim/` importeert niets uit `src/client/` en gebruikt geen `window`, `document`, `performance` of `Math.random` (alleen de eigen seeded RNG).
- 60 fps met 100+ eenheden in beeld; simulatiestap ruim onder 4 ms bij ~300 eenheden.
- Bots gebruiken uitsluitend `queueCommand`/`setInput`, net als de mens; drie moeilijkheidsgraden.
- UI-tekst in het Nederlands, code in het Engels. Geen geluid in v1.
- Niet in v1: accounts, persistente ranglijsten, mobiele besturing, netwerk-multiplayer.
- Geen git-repo aanwezig en niet om commits gevraagd: de commit-stappen vervallen.

## Spelontwerp (beslissingen)

| Onderdeel | Waarde |
|---|---|
| Spelers | 1 mens + 5 bots (2 makkelijk, 2 normaal, 1 moeilijk) |
| Start | 150 goud, HQ + aanvoerder + 4 soldaten |
| Inkomen | HQ 3/s, mijn +2/s; kristal +35, 45 kristallen op de kaart (dichter in het midden), aanvulling 1 per 1,2 s |
| Aanvoerder | hp 420, schade 18, bereik 150, cd 0,5 s, snelheid 190; regenereert bij eigen HQ; dood → na 6 s terug bij HQ |
| Soldaat (Q) | 30 goud, hp 60, schade 8, melee, snelheid 150, traintijd 2 s |
| Boogschutter (E) | 45 goud, hp 35, schade 10, bereik 170, traintijd 3 s, vereist kazerne |
| Bruut (R) | 110 goud, hp 240, schade 26 (×2 op gebouwen), snelheid 105, traintijd 5 s, 2 supply, vereist kazerne |
| Mijn (1) | 120 goud (+40 per eigen mijn), hp 350 |
| Kazerne (2) | 150 goud, hp 500, +8 supply, extra trainslot |
| Toren (3) | 130 goud, hp 420, schade 16, bereik 250 |
| HQ | hp 1600, schiet (14 schade, bereik 260), trainslot |
| Supply | 12 basis + 8 per kazerne, maximaal 60 |
| Bouwen | direct vóór de aanvoerder; niet overlappend, binnen de arena, niet binnen 300 van een vijandelijk gebouw |
| Verlies | HQ vernietigd → alles weg, opnieuw beginnen op een nieuwe plek. De overwinnaar krijgt 150 + de helft van het goud. |

Interpretatie van "basis of leger vernietigd": alleen het verlies van het HQ reset je. Een dode aanvoerder komt terug bij het HQ; je leger verdedigt zolang de basis.

Zwermgedrag: eenheden houden een ringformatie rond de aanvoerder, vallen automatisch alles aan binnen 230 en keren terug als ze verder dan 460 van de aanvoerder raken.

## Bestanden

| Bestand | Verantwoordelijkheid |
|---|---|
| `package.json` | `type: module`, scripts `start`, `test`, `headless` |
| `server.js` | statische bestandsserver op poort 5173 |
| `src/sim/config.js` | alle balansgetallen (`UNITS`, `BUILDINGS`, `WORLD`, `DIFFICULTY`) |
| `src/sim/rng.js` | `rand(world)`, `randRange(world,a,b)` — mulberry32 op `world.rngState` |
| `src/sim/grid.js` | ruimtelijke hash: `buildGrid(items, cell)`, `queryGrid(grid,x,y,r,cb)` |
| `src/sim/world.js` | `createWorld`, `addPlayer`, `spawnUnit`, `spawnBuilding`, `playerStats`, `queueCommand`, `setInput`, `resetPlayer` |
| `src/sim/step.js` | `step(world, dt)`: commando's, economie, productie, beweging, gevecht, dood, kristallen, respawn |
| `src/sim/bot.js` | `updateBot(world, player, dt)` |
| `src/sim/index.js` | her-export van de publieke API |
| `src/client/main.js` | lus met vaste tijdstap, startscherm, herstart |
| `src/client/input.js` | toetsen/muis → `setInput`/`queueCommand` |
| `src/client/render.js` | wereld, eenheden, gebouwen, effecten, minimap |
| `src/client/hud.js` | DOM-HUD: goud, supply, knoppen, scorebord, meldingen |
| `index.html`, `style.css` | pagina en HUD-opmaak |
| `scripts/headless.js` | draait 10 spelminuten zonder scherm, print statistiek en staptijd |
| `tests/*.test.js` | simulatietests |

## Review Focus

1. Tabblad op de achtergrond → enorme `dt`: de lus mag hooguit 5 stappen per frame inhalen, de rest vervalt.
2. Venster verliest focus terwijl een toets is ingedrukt: beweging moet stoppen (`blur` wist alle toetsen).
3. Twee eenheden op exact dezelfde plek, of een invoervector (0,0): geen `NaN` in posities.
4. Commando's van een uitgeschakelde speler of met onbekend type: genegeerd, geen crash, geen goud afgeschreven.
5. Bouwen tegen de arenarand of bovenop een gebouw: geweigerd met een melding, geen goud afgeschreven.

---

### Task 1: Simulatiekern — wereld, economie, bouwen, trainen

**Files:** Create `package.json`, `src/sim/{config,rng,grid,world,step,index}.js`, `tests/world.test.js`

**Interfaces — Produces:**
- `createWorld({seed:number, size?:number}) → world` met `{tick,time,size,rngState,nextId,players[],units[],buildings[],crystals[],events[]}`
- `addPlayer(world,{name,isBot,difficulty}) → player` met `{id,name,isBot,difficulty,alive,gold,score,kills,input:{mx,my},commands[],queue[],commanderId,hqId,respawnIn,commanderRespawn,notice}`
- `queueCommand(world, playerId, {type:'build'|'train'|'respawn', kind?})`, `setInput(world, playerId, mx, my)`
- `step(world, dt)`; `playerStats(world, playerId) → {supply,cap,income,army,mines,barracks,towers}`
- unit `{id,owner,kind,x,y,px,py,hp,maxHp,cd,targetId,fx,fy}`; building `{id,owner,kind,x,y,hp,maxHp,cd,train}`; crystal `{id,x,y,value}`
- events per tik: `{type:'shot'|'hit'|'death'|'collect'|'built'|'eliminated', ...}`

- [ ] Tests: zelfde seed → identieke toestand na 600 stappen; inkomen 3/s na 10 s; mijn bouwen kost 120 en verhoogt inkomen; bouwen zonder goud / bovenop HQ / buiten arena wordt geweigerd zonder afschrijving; soldaat trainen levert na 2 s een eenheid; boogschutter zonder kazerne geweigerd; supplylimiet gerespecteerd; onbekend commando en commando van dode speler genegeerd.
- [ ] Implementeren, `npm test` groen.

### Task 2: Beweging, zwerm en gevecht

**Files:** Modify `src/sim/step.js`; Create `tests/combat.test.js`

- [ ] Tests: aanvoerder beweegt met 190/s en blijft binnen de arena; invoer (0,0) en gestapelde eenheden geven geen `NaN`; soldaten volgen de aanvoerder tot binnen 120; twee vijandige groepen bij elkaar → er vallen doden en `kills`/`score` lopen op; aanvoerder dood → terug bij HQ na 6 s; HQ vernietigd → speler `alive=false`, al zijn eenheden/gebouwen weg, `eliminated`-event, overwinnaar krijgt premie; bot respawnt vanzelf na 4 s, mens pas na `respawn`-commando; kristal oppakken geeft +35.
- [ ] Implementeren (doelzoeken gespreid over 4 tikken via `id % 4`, ruimtelijke hash met cel 120), tests groen.

### Task 3: Bots

**Files:** Create `src/sim/bot.js`, `tests/bot.test.js`, `scripts/headless.js`

**Interfaces — Produces:** `updateBot(world, player, dt)`; toestand in `player.bot = {think,goal,tx,ty,targetPlayer}`; `DIFFICULTY[level] = {thinkEvery, aggression, maxMines, idleGold}`.

Gedrag per denkbeurt: (1) bouwvolgorde mijn → kazerne → mijn → toren → mijnen tot `maxMines` → tweede kazerne; (2) troepen trainen tot de supplylimiet, mix soldaat/boogschutter/bruut; (3) doel kiezen: `defend` als het HQ recent geraakt is, `retreat` bij aanvoerder < 35 % hp of leger veel zwakker dan een nabije vijand, `attack` op de speler met de beste verhouding eigen kracht / (hun kracht × afstand) zodra eigen kracht ≥ drempel × `aggression`, anders `gather` naar het dichtstbijzijnde kristal.

- [ ] Tests: 6 bots, 5 spelminuten: elke bot bouwt minstens één mijn en één kazerne; er zijn gevechten tussen bots onderling (totaal `kills` > 20); binnen 10 minuten minstens één `eliminated`; geen `NaN`; gemiddelde staptijd < 4 ms.
- [ ] `scripts/headless.js` print per speler score/kills/leger en de gemiddelde staptijd.

### Task 4: Client — tekenen, besturing, HUD

**Files:** Create `server.js`, `index.html`, `style.css`, `src/client/{main,input,render,hud}.js`, `.claude/launch.json`

- [ ] Lus: `requestAnimationFrame`, accumulator met vaste stap 1/30 s, hooguit 5 stappen per frame, interpolatie tussen `px,py` en `x,y`.
- [ ] Besturing: WASD/pijltjes of linkermuisknop ingedrukt houden → `setInput`; `1/2/3` bouwen, `Q/E/R` trainen; `blur` wist toetsen. Alle acties ook als klikbare knoppen met prijs en sneltoets.
- [ ] Tekenen: alleen wat in beeld is; vormen per eenheidstype, teamkleuren, hp-balken bij schade, schotsporen, vonken, zwevende `+35`, arenarand, minimap rechtsonder.
- [ ] HUD: goud + inkomen, supply, actieknoppen (uitgegrijsd als onbetaalbaar/vergrendeld), live scorebord, meldingen, contextuele tip in de eerste minuut, verliesscherm met "Opnieuw".
- [ ] `window.__game = {world, me}` voor inspectie tijdens testen.

### Task 5: Speeltest en afstelling

- [ ] `npm test` en `npm run headless` groen.
- [ ] In de browser: startscherm → spelen; bewegen, bouwen, trainen, vechten, sterven en herstarten daadwerkelijk uitvoeren; console zonder fouten; frametijd meten met 100+ eenheden in beeld.
- [ ] Balans bijstellen waar het potje niet levendig voelt.
