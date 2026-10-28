# Prompt: ECHO RACER (Arbeitstitel)

Baue ein mobiles Arcade-Autorennspiel als Browsergame. Es soll auf GitHub Pages laufen (rein statisch, kein eigener Server), online mit Freunden spielbar sein und auf Handys in hoher Auflösung flüssig laufen. Spielgefühl: schnell, bunt, kompetitiv wie Mario Kart, aber mit einer eigenen Kernmechanik, die es so noch nicht gibt.

## 1. Die Kernidee (muss das Spiel ausmachen)

**Keine Panzerschalen, keine Bananen, keine Items aus Kisten.** Stattdessen zwei Mechaniken:

1. **Echos:** Jede abgeschlossene Runde hinterlässt ein festes, leuchtendes Echo-Auto, das deine Linie dieser Runde exakt nachfährt. Echos sind für ALLE Fahrer solide Hindernisse (Kollision = Tempoverlust, kein Totalstopp). Das Rennen wird dadurch von Runde zu Runde dichter und taktischer: Wer sauber und riskant fährt, baut Echos, die Gegner behindern. Eigene Echos können auch dich selbst treffen.
2. **Streckenhacken:** Durch Driften, Windschattenfahren und knappe Überholmanöver lädt sich eine Hack-Leiste auf. Per Tipp auf einen Button verändert man in Echtzeit die Strecke VOR den Gegnern: Rampe hochfahren, Barriere kurz hochziehen, Boostfeld spiegeln oder Kurvenradius verengen. Das ist die einzige "Waffe", ohne Zufall und ohne Kisten.

Gewonnen wird durch Linienwahl, Timing der Hacks und kluges Setzen der Echos, nicht durch Glück.

## 2. Technik

- **Three.js** (WebGL2), Vanilla JS oder Vite. Ergebnis muss als statischer Build auf GitHub Pages laufen (inkl. kurzer Anleitung und GitHub-Actions-Workflow für Deploy).
- **Hohe Auflösung:** Renderauflösung an `devicePixelRatio` koppeln (bis max. 2.5x), dazu ein **adaptiver Auflösungs-Regler**, der bei FPS-Einbruch die Renderskalierung senkt und bei Reserven wieder anhebt. Ziel: stabile 60 FPS auf Mittelklasse-Handys.
- **Querformat** als Standard, Fullscreen, Safe-Areas beachten, Bildschirm bleibt an (Wake Lock).
- **PWA:** Manifest + Service Worker, damit es sich wie eine App zum Homescreen hinzufügen lässt und offline im Solo-Modus läuft.
- **Online-Multiplayer ohne eigenen Server:** WebRTC Peer-to-Peer über eine Bibliothek wie Trystero oder PeerJS. Ablauf: Host erstellt Raum, bekommt 4-stelligen Code/QR-Link, bis zu 6 Spieler treten bei. Autoritatives Host-Modell mit Client-Prediction und Interpolation, damit es auch bei 100 bis 150 ms Ping gut aussieht. Echo-Daten werden als kompakte Positionslisten synchronisiert.
- **Solo-Modus** mit KI-Gegnern (3 Schwierigkeitsstufen) und Zeitfahren gegen eigene Echos.
- Audio: Web Audio API, dynamischer Motorsound, Drift-Sound, kurze Musik-Loops (prozedural erzeugt, keine externen Dateien).
- Fahrphysik: eigene arcade-nahe Physik (kein schweres Physik-Framework), Drift mit Funken-Stufen, Mini-Boosts, Windschatten.

## 3. Steuerung (Mobile zuerst)

- Automatisches Gasgeben, Bremse optional per Daumen.
- Lenken per **Neigungssensor** ODER per virtuellem Touch-Lenkrad (im Menü umschaltbar, mit Kalibrierung).
- Großer Drift-Button, großer Hack-Button, alles daumenfreundlich am Rand.
- Haptisches Feedback (Vibration) bei Drift-Stufen, Treffern und Hacks.
- Optional Gamepad- und Tastatursteuerung für Desktop.

## 4. Look & Feel

- Eigener, wiedererkennbarer Stil: kräftige Farben, weiche Lichter, stylisierte Low-Poly-Welten mit Bloom und Geschwindigkeits-Unschärfe, saubere Kanten (kein Pixelbrei).
- Echos als leuchtende Geisterautos in der Farbe ihres Fahrers, mit Lichtspur.
- Streckenhacks sichtbar als Glitch-/Hologramm-Effekt, damit jeder sofort sieht, was passiert.
- 4 Strecken zum Start in unterschiedlichen Welten, jede mit eigener Besonderheit, die zu den Echos passt (z.B. enge Passagen, wo Echos stark behindern; breite Arenen, wo Hacks dominieren).
- 6 Fahrzeuge mit klar unterschiedlichen Werten (Tempo, Drift, Hack-Ladegeschwindigkeit).
- Clean UI: Rundenanzeige, Position, Hack-Leiste, Mini-Karte mit Echos.

## 5. Umfang und Vorgehen

1. Plane zuerst kurz die Projektstruktur und die Netzwerk-Architektur.
2. Baue zuerst einen **spielbaren Solo-Prototyp**: ein Auto, eine Strecke, Drift, Rundenzähler, Echo-Mechanik.
3. Dann Hack-Mechanik, KI-Gegner, weitere Strecken.
4. Danach Online-Multiplayer per Raumcode.
5. Zum Schluss Politur: Grafikeffekte, Sound, adaptive Auflösung, PWA, Deploy-Workflow.
6. Teste nach jedem Schritt im Browser (Mobil-Viewport) und behebe Fehler selbst, bevor du weitermachst.
7. Lege eine `README.md` an: Spielidee, Steuerung, lokal starten, auf GitHub Pages veröffentlichen.

Frage nur nach, wenn eine Entscheidung wirklich nicht aus diesem Briefing ableitbar ist. Triff sonst sinnvolle Annahmen und dokumentiere sie in der README.
