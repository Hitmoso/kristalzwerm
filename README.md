# Kristalzwerm

Snelle arcade-strategie in de browser: bouw een kasteel, verzamel een leger en veeg de andere koningen van de kaart. Speel tegen bots, in de open wereld of in een privékamer met vrienden.

## Lokaal spelen

```bash
npm install
npm start
```

Open daarna http://localhost:5173. Vrienden op hetzelfde wifi-netwerk gebruiken het adres dat de server bij het starten toont.

## Besturing

| Toets | Actie |
|---|---|
| W A S D of muis ingedrukt | koning sturen |
| 1 2 3 4 | mijn, kazerne, toren, academie bouwen |
| Q E R F T Z X C | soldaat, schutter, ridder, reus, balliste, magiër, genezer, draak |

Draken vliegen: soldaten, ridders en reuzen kunnen ze niet raken. Schutters, magiërs, de koning, torens en kastelen wel, en de balliste doet 3,5× schade op draken. Je leger kan groeien tot 100 (zes kazernes en een academie).
| Spatie | leger bij het kasteel laten of meenemen |
| M | geluid aan/uit |

## Adminrechten

Als admin heb je links een uitklapbaar **Admin**-menu, plus twee codes die je tijdens het spel intypt:

| Code | Wat |
|---|---|
| `G` `O` `U` `D` | 1000 goud |
| `V` `L` `U` `G` | turbo aan/uit: je koning loopt 3,5× zo snel |

In het menu stuur je alle bots tegelijk: naar het Kristalhart, naar huis, een speler aanvallen (ook jezelf), of weer vrij spelen. Een aanvalsbevel stopt vanzelf als het doelwit is uitgeschakeld.

- **Oefenen tegen bots:** je bent altijd admin.
- **Online:** start de server met een geheime sleutel en open het spel met die sleutel in de link:

  ```powershell
  $env:ADMIN_KEY='jouw-geheim'; npm start
  ```

  Ga naar `http://localhost:5173/?admin=jouw-geheim`. Zonder de juiste sleutel is er geen menu en doen de codes niets. De uitnodigingslink voor een kamer bevat de sleutel niet.

## Online zetten (Render)

1. Zet dit project op GitHub.
2. Maak een account op render.com en koppel GitHub.
3. Kies **New → Blueprint** en selecteer de repo; `render.yaml` regelt de rest.
4. Vul bij `ADMIN_KEY` je eigen geheim in (of laat leeg).

Het gratis pakket valt na een tijd zonder bezoekers in slaap; de eerste speler wacht dan even tot de server wakker is.

## Ontwikkelen

```bash
npm test            # simulatie-, bot- en servertests
npm run headless    # een bot-potje van 10 minuten zonder scherm
```

De spelregels staan in `src/sim/` en draaien zowel in de browser (oefenen) als op de server (online).
