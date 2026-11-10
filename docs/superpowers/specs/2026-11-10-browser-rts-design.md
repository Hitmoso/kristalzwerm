# Brief: browser-RTS in .io-stijl

## Doel
Een snelle, arcade strategiegame in de browser, in een doorlopende wereld met jij, AI-bots en later je vrienden. Je speelt zolang je wilt. Dit is ook een showcase van wat Fable 5.2 zelfstandig kan bouwen.

## Vastgestelde keuzes
- **Wereld:** een doorlopende wereld met meerdere spelers tegelijk (zoals agar.io en deeeep.io). De kaart is **begrensd en niet oneindig**: een vaste arena met duidelijke randen. Fable kiest een grootte die ruim genoeg is om te verkennen en klein genoeg dat spelers elkaar tegenkomen.
- **Kern:** je traint troepen, bouwt een leger, plaatst gebouwen en trekt de kaart rond om anderen aan te pakken.
- **Besturing:** één aanvoerder die je zelf bestuurt (muis of WASD), met een zwerm die hem volgt en automatisch aanvalt. Gebouwen plaats je met een snelle bouwknop.
- **Verlies:** wordt je basis of leger vernietigd, dan begin je helemaal opnieuw.
- **Grondstoffen:** basisinkomen uit gebouwen, plus kristallen op de kaart die een grote bonus geven.
- **Fase 1:** jij plus een paar AI-bots, in je eigen browser.
- **Fase 2:** vrienden erbij via een Node-server met WebSockets.
- **Sfeer:** snel en arcade, korte momenten van actie, weinig menu's.

## Aannames
- 2D, bovenaanzicht, canvas of WebGL. Geen installatie en geen account.
- De spelregels staan in een **losse simulatiemodule** zonder koppeling aan het scherm, zodat dezelfde code in fase 2 op de server draait.
- Een bot gedraagt zich als een speler: verzamelt, bouwt, trekt rond en valt aan. Een paar moeilijkheidsgraden.
- Geen geluid in de eerste versie, tenzij er ruimte voor is.

## Aan Fable overlaten
Architectuur, eenheden en balans, bot-AI, kaartgeneratie, camera en minimap, visuele stijl, effecten.

## Wanneer is het geslaagd
- Binnen een minuut snap je wat je moet doen, zonder uitleg.
- Een potje met bots voelt levendig: ze kiezen eigen doelen en vallen elkaar ook aan.
- Het blijft soepel (60 fps) met zeker 100+ eenheden op het scherm.
- De simulatiecode kan zonder scherm draaien, als bewijs dat fase 2 mogelijk is.

## Bewust niet in v1
Accounts, ranglijsten, mobiele besturing, vrienden-multiplayer.
