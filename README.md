# ECHO RACER

Mobiler Fun-Racer im Browser – schnell, bunt, kompetitiv: offene Spielzeug-Karts mit acht eigenen Fahrerfiguren, Turbostart, Drift-Hüpfer, Sprungschanzen mit Tricks und sechs Welten. Statt Items aus Kisten gibt es zwei eigene Mechaniken:

1. **Echos:** Jede abgeschlossene Runde hinterlässt ein leuchtendes Echo-Auto, das deine Linie dieser Runde exakt nachfährt – in Endlosschleife. Echos sind für **alle** feste Hindernisse (Treffer = Tempoverlust, kein Totalstopp), auch für dich selbst. Das Rennen wird von Runde zu Runde dichter.
2. **Streckenhacks und Angriffe:** Driften, Windschatten und knappe Überholmanöver laden die Hack-Leiste. Damit veränderst du die Strecke **vor dem Gegner** (Barriere, Rampe, Boostfeld spiegeln, Kurve verengen, Echo-Klon) oder greifst direkt an (Schockwelle, Rammstoß mit Holo-Schild). Kein Zufall, keine Kisten – alles ist Können.

Dazu: **Grand-Prix-Meisterschaft** über alle sechs Welten, **Spiegelmodus** für jede Strecke, **Fahrer-Level mit XP**, **Tages-Challenge** mit Serien-Bonus, **Medaillen im Zeitfahren**, **Stil-Kette** (Combo-Multiplikator), **Rivalen**, **20 Erfolge** und **12 Lacke** (u. a. Chrom, Holo, Carbon, Gold, Galaxie) sowie Effekte wie Speed-Streifen, Treffer-Freeze, Datenstrahlen, Feuerwerk und Fotofinish in Zeitlupe.

Optik: glänzende Spielzeug-Karts mit großen Cartoon-Figuren auf einer aufgeständerten Plastik-Rennbahn – Metallic-Lack, Chrom-Motoren, dicke Reifen, Startnummern, Loopings, Booster-Tore, Sprungschanzen und eine Tribüne voller hüpfender Steckfiguren. Natürliche Farben, weiches Licht mit Umgebungsverdeckung, alles gestochen scharf (keine Bewegungs- oder Tiefenunschärfe).

Läuft rein statisch (GitHub Pages), als PWA installierbar, offline im Solo-Modus, online mit bis zu 6 Fahrern per 4-stelligem Raumcode – ohne eigenen Server.

---

## Spielen

| Modus | Beschreibung |
|---|---|
| **Solo-Rennen** | Gegen 0–5 KI-Fahrer in drei Stärken (Leicht, Mittel, Schwer), 3/4/5/7 Runden, Richtung normal oder **gespiegelt** |
| **Grand Prix** | Meisterschaft über 5 Rennen (alle Welten, je 3 Runden) gegen 5 KI-Fahrer. Punkte 10 · 8 · 6 · 5 · 4 · 3, Gesamtwertung nach jedem Rennen, der Führende startet hinten. Am Ende Pokal mit **1–3 Sternen** (nach Punkten) – der Titel schaltet den Gold-Lack frei. Die **Pokal-Sammlung** zeigt je Schwierigkeit und Tempo-Klasse den besten Pokal. |
| **Zeitfahren** | Allein gegen die eigenen Echos. Die Bestzeit wird gespeichert und fährt beim nächsten Mal als goldener **Rekord-Geist** mit (nicht fest). Gespiegelte Strecken haben eigene Rekorde. |
| **Online** | Host erstellt einen Raum → 4-stelliger Code, Link und QR-Code. Bis zu 6 Spieler, freie Plätze optional mit KI auffüllen. Die Strecke wird per **Abstimmung** bestimmt (jeder tippt eine Streckenkarte an, beim Start entscheidet ein **Strecken-Roulette** – jede Stimme ist ein Los) oder vom Host fest gewählt, auch gespiegelt. |

### Echos im Detail
- Ein Echo startet beim Überfahren der Ziellinie und fährt die gerade beendete Runde nach.
- Frisch gesetzte Echos sind für ein Auto erst fest, sobald es einmal ≥ 8 m Abstand zu ihnen hatte – so gibt es keine Treffer direkt beim Entstehen.
- Windschatten funktioniert auch hinter Echos, knapp an ihnen vorbei zu ziehen lädt die Hack-Leiste.

### Streckenhacks und Angriffe
Die Hack-Leiste hat 3 Ladungen. Streckenhacks zielen immer auf den Fahrer **direkt vor dir** (bist du vorne: den direkt hinter dir) und erscheinen zuerst als flackerndes Hologramm (Warnung), dann werden sie fest. Schockwelle und Rammstoß wirken direkt an deinem Auto. Eigene Hacks sind für dich durchlässig. Beim Auslösen fliegt ein **Datenstrahl** vom Hacker zum Ziel.

| Hack | Kosten | Wirkung |
|---|---|---|
| ▮ Barriere | 1 | Holo-Wand über die halbe Fahrbahn auf der Linie des Ziels (≈3 s) |
| ◢ Rampe | 1 | Rampe vor dem Ziel. Wer abhebt, verliert ohne Trick 22 % Tempo. In der Luft **Drift** tippen = Trick + kleiner Boost |
| ⇄ Boost spiegeln | 1 | Das nächste Boostfeld vor dem Ziel springt auf die andere Seite und **bremst** dort alle außer dir |
| ⟫ Kurve verengen | 2 | Holo-Wand auf der Außenseite der nächsten Kurve – nur die enge Innenlinie bleibt |
| ◎ Schockwelle | 1 | Nach kurzer Aufladung breitet sich ein Druckring (15 m) um dein Auto aus und wandert mit dem Feld mit. Jeder Gegner, den er erwischt, wird **seitlich** weggestoßen, gebremst und kurz rutschig |
| ➤ Rammstoß | 1 | Schub nach vorn + Holo-Schild (1,8 s): Gegner, die du berührst, fliegen zur Seite; Echos, Klone, Barrieren und Schockwellen **durchbrichst** du ohne Tempoverlust |
| ◈ Echo-Klon | 2 | Ein Holo-Klon deines Autos materialisiert vor dem Gegner und fährt halb so schnell schlingernd in seiner Spur – fest und schwer zu überholen (4,5 s) |

Hacks wählen: ⇆ bzw. **Q** schaltet weiter, auf Tastatur direkt mit **1–7**, auf dem Handy durch Antippen in der **Fähigkeiten-Leiste** über dem Hack-Knopf (ladbare Hacks leuchten).

### Fahren
- Gas gibt das Auto automatisch (in den Einstellungen abschaltbar).
- **Turbostart:** **Drift** genau beim „LOS“ drücken (Fenster ca. 0,6 s davor bis kurz danach) = Boost. Zu früh gedrückt = das Kart dreht 0,8 s durch. Klappt auch online.
- **Drift** halten und lenken: kleiner Hüpfer, dann laden Funken in drei Stufen (blau → orange → lila). Loslassen = Mini-Boost. Beim Driften qualmen die Reifen.
- **Hügel und Abfahrten:** Jede Strecke hat ein Höhenprofil – bergauf wird das Kart langsamer, bergab schneller; im **Lava-Kreuz** führt die Acht über eine **Brücke** über die untere Fahrbahn.
- **Sprungschanzen** (gelb, über die ganze Bahn) auf den langen Geraden: das Kart fährt die Rampe hoch und hebt ab. In der Luft **Drift** tippen = Trick, Landung mit Boost. In der Luft lässt sich leicht lenken.
- **Boostfelder** geben Schub, **Windschatten** erhöht das Tempo, Wände und Echos kosten Tempo.
- **Start:** Die Startampel am Zielbogen zählt mit drei roten Lampenpaaren herunter und springt bei „LOS“ auf Grün.
- **Letzte Runde:** goldenes Banner, kurze Fanfare und schnellere Musik. Bei jeder Runde zeigt das Banner den Abstand zur bisher besten Runde (grün = schneller, rot = langsamer).
- **Rückblick:** B oder C halten (Gamepad: rechten Stick drücken oder nach hinten ziehen) – die Kamera schaut nach hinten.
- Feststecken oder falsche Richtung → das Auto wird nach ein paar Sekunden automatisch zurückgesetzt (manuell: Pause → „Auto zurücksetzen“ bzw. Taste R).

### Steuerung

| | Handy (Querformat) | Tastatur | Gamepad |
|---|---|---|---|
| Lenken | Touch-Lenkrad links (ziehen) **oder** Neigung | ←/→ oder A/D | linker Stick |
| Gas | automatisch | ↑ / W (wenn Auto-Gas aus) | RT |
| Bremsen / rückwärts | BREMSE | ↓ / S | LT oder B |
| Drift | großer DRIFT-Knopf | Leertaste / Shift | A oder RB |
| Hack auslösen | großer HACK-Knopf | E / Enter | X |
| Hack wählen | ⇆ oder Symbol in der Leiste antippen | Q / Tab, direkt 1–7 | Y oder LB |
| Zurückschauen | ◀◀ oben (halten) | B / C (halten) | rechter Stick |
| Pause | ❚❚ | Esc / P | Start |

Umschalten zwischen Touch-Lenkrad und Neigung in **Einstellungen → Steuerung**; dort auch **Kalibrieren** (Gerät in Neutralhaltung halten), Empfindlichkeit, „Neigung umkehren“, Vibration, Grafikstufe und maximale Auflösung.

**Lenkhilfe** (Einstellungen, standardmäßig aus): schaut gut eine halbe Sekunde voraus und lenkt sanft zurück, wenn das Kart auf die Bande zusteuert – ideal für Einsteiger und die Neigungssteuerung. Sie wirkt auf die Eingabe selbst (online gleich für alle), schwächer im Drift und macht nicht schneller als sauberes Fahren.

### Fortschritt: Level, Tages-Challenge, Medaillen, Stil-Kette, Rivale
- **Fahrer-Level:** Jedes Rennen bringt XP (Ziel, Platzierung, Ultra-Boosts, Tricks, Treffer, Stil-Punkte, Rekorde, Medaillen, Rivale). Der Ergebnis-Bildschirm zeigt die Abrechnung mit laufender Leiste und „LEVEL X!“. Level 2/4/7/10/15 schalten die Lacke **Rennstreifen**, **Candy**, **Abendrot**, **Neonkante** und **Galaxie** frei (in der Garage mit „NEU“ markiert).
- **Tages-Challenge** (Karte im Titelmenü): jeden Tag eine feste Aufgabe mit vorgegebener Strecke, Richtung und Auto (z. B. „Gewinne gegen 5 KI-Fahrer“, „Lande 4 Tricks“, „Hol dir Silber im Zeitfahren“). Für alle Spieler am selben Tag gleich. Geschaffte Tage in Folge bilden eine **Serie** mit steigendem XP-Bonus.
- **Medaillen im Zeitfahren:** Bronze, Silber, Gold und die schwere **Echo-Medaille** je Strecke (gemessen an der besten Runde; Zielzeiten aus Läufen der schweren KI, siehe `scripts/medal-times.mjs`). Medaillen stehen auf den Streckenkarten, die nächste Zielzeit im HUD.
- **Stil-Kette:** Drift-Boosts, Tricks, Windschatten, knappe Manöver, Durchbrüche, Treffer mit Hacks/Echos und Überholen kurz hintereinander erhöhen den Multiplikator (bis ×4, Anzeige unter der Rundenzeit). Nach 4 s ohne Aktion wird die Kette gutgeschrieben; ein Treffer lässt sie reißen (nur die Hälfte zählt).
- **Rivale:** In Solo-Rennen (ab 2 Gegnern) und im Grand Prix ist ein KI-Fahrer dein Rivale (rotes ⚔-Namensschild). Ihn zu schlagen bringt Bonus-XP.
- **Tagesaufträge** (Titelmenü und Ergebnis): jeden Tag drei Ziele, die über alle Rennen des Tages zählen (z. B. „Gewinne 2 Rennen“, „Lande 12 Tricks“, „Fahre 2 Rennen auf Canyon-Klamm“) – je Auftrag XP, alle drei geschafft = +150 XP Bonus.
- **Boost-Flammen** (Garage): Farbe der Boost-Flammen und -Funken – Blaues Feuer (Level 3), Giftgrün (5), Pink (8), Gold (12), Regenbogen (18). Das Ergebnis nennt immer die nächste Level-Belohnung.
- **Siegerehrung:** Nach Solo-Rennen gegen die KI stehen die besten drei auf einem Podest (Gold/Silber/Bronze) mit Konfetti und jubelnden Fahrern – Tippen oder eine Taste springt direkt zum Ergebnis.
- **Tempo-Klassen** (Solo und Grand Prix): Kompakt, Sport, **Turbo** (ab Level 6, ×1,15 XP) und **Hyper** (ab Level 12, ×1,3 XP) – schneller, die KI zieht mit.
- **Grand-Prix-Sterne:** Sieg mit ≥ 80 % der möglichen Punkte = 2 Sterne, ≥ 92 % = 3 Sterne; Platz 2–3 bekommt 1–2 Sterne. Bester Pokal je Schwierigkeit × Klasse wird gesammelt; 3 Sterne auf „Schwer“ = Erfolg *Drei Sterne*.

### Präsentation (Stil-Analyse, siehe `STIL-ANALYSE.md`)
- **Strecken-Intro:** Kameraflug über die Strecke in drei Einstellungen (Überblick, Kreisfahrt um das **Wahrzeichen der Welt** – Riesenrad, Felsbogen, Himmelsinsel, Riesen-Gießkanne, höchster Neon-Wolkenkratzer – bzw. Blick zum Vulkan, auf das Startfeld zu) mit Namenskarte – Welt-Medaille, Weltname, Streckenname – und Modus-Abzeichen. Tippen/Taste überspringt; Neustart ohne Intro.
- **Porträts** aller 8 Figuren, aus den 3D-Köpfen gerendert: auf der Minikarte (statt Punkten), in der Ergebnisliste und in der Fahrerauswahl der Garage.
- **HUD:** Platzzahl groß mit Gold-/Silber-/Bronze-Verlauf und dicker Kontur, Runden-Pille mit Zielflagge (letzte Runde gold), Zeit-Pille; große Einblendungen (3-2-1, LOS!, ZIEL!) in Gold mit Kontur.
- **Ergebnis:** Rangliste rechts als Zeilen mit Porträt, Sieger gold, eigene Zeile hervorgehoben; links bleibt die 3D-Szene (Podest) sichtbar.
- **Strecken-Deko:** Stoffbanner an Masten entlang der Strecke, Ballontrauben an Start/Ziel, Blütenblätter (Garten), Sandverwehungen (Canyon), Pfützen (Neon), Rußflecken (Lava) auf der Fahrbahn.
- **Mimik und Körpersprache:** eigenes Mund-Rig und Lidschalen je Figur – Lächeln, Schreck-„O“ mit zappelnden Armen bei Treffern, zusammengebissene Zähne und zusammengekniffene Augen beim Turbo, Lachen mit lachenden Augen bei Jubel/Podest, hängende Lider, Schmollmund und gesenkter Kopf im Ziel ab Platz 4.
- **Fahrer-Details:** Kragen, Schulterpolster, Hosenträger-Gurte mit Metall-Verstellern, Gürtel mit Schnalle, Ärmelbündchen; Helmstreifen (Nyx, Volt, Kiko), Nietenkranz (Rune), Nähte und Brillenband (Juno), Kiemen (Zed), Haargummis (Mira), Wartungsklappe mit Schrauben und Lüftungsschlitzen (Byte).
- **Kart-Details:** Reifen mit Straßenprofil und Flankenbeschriftung, Radmuttern, Startnummer mit Stern als Aufkleber auf der Rückseite der Sitzlehne. **Sponsor-Aufkleber** je Kart-Typ (Seiten, Haube, Frontflügel) und **Banner auf den Heckflügeln** (Viper, Nova, Pixel) – aus der Verfolgerkamera lesbar; die Aufkleber werden per Strahltest exakt auf die Karosserie gelegt.

### Grand Prix, Erfolge und Lacke
- **Erfolge** (Titelmenü → ERFOLGE): 21 Ziele wie *Erster Sieg*, *Drift-König* (25 Ultra-Boosts), *Hacker* (30 Hack-Treffer), *Fehlerfrei* (ohne Treffer ins Ziel), *Rammbock*, *Erdbeben* (3 Autos mit einer Schockwelle), *Haaresbreite* (Fotofinish gewinnen), *Weltenbummler*, *Rekordjäger*, *Spiegelwelt* (Sieg auf gespiegelter Strecke), *Seitenverkehrt* (Rekord auf jeder gespiegelten Strecke), *Goldrausch* (Gold auf jeder Strecke), *Echo-Ass* (eine Echo-Medaille), *Stammgast* (7 Tages-Challenges in Folge), *Profi* (Level 20), *Stilikone* (5.000 Stil-Punkte in einem Rennen), *Drei Sterne* (GP auf „Schwer“ mit drei Sternen), *Marathon* (100 km). Mit Fortschrittsbalken und Gesamtstatistik.
- **Lacke** (Garage): Metallic und Matt sind frei, **Chrom** (Erster Sieg), **Perlmutt** (Drift-König, schimmert je nach Blickwinkel), **Holo** (Hacker, wandernde Regenbogenbänder), **Carbon** (Fehlerfrei, Webmuster) und **Gold** (Grand-Prix-Champion). Gesperrte Lacke lassen sich in der Garage ansehen. Der gewählte Lack ist auch online für alle sichtbar.
- Neue Erfolge werden direkt im Ergebnis-Bildschirm angezeigt. Fortschritt und Statistik liegen lokal im Browser (`localStorage`).

### Effekte
- **Speed-Streifen** beim Boost, im Windschatten und im Rammstoß.
- **Treffer-Freeze** (kurzer Hit-Stop im Solo-Rennen) mit Farbsäumen, Kamera-Wackeln und Farbblitz in der Farbe des Angreifers.
- **Schockwellen-Ring**, Holo-Kuppel und Partikelring; **Holo-Schild** beim Rammen mit Funken; **Durchbruch-Splitter** beim Durchbrechen von Hindernissen.
- **Zieleinlauf:** Konfetti, Feuerwerk rund ums eigene Auto, die Tribüne jubelt, das Auto rollt in einer Ehrenrunde aus und die Kamera kreist darum.
- **Fotofinish:** Liegt ein Gegner beim Zieleinlauf weniger als 0,45 s vor oder hinter dir, läuft das Rennen kurz in Zeitlupe (Solo) mit entsättigtem Bild – samt Einblendung.
- **Funken als scharfe Striche:** Drift-, Boost- und Treffer-Funken werden entlang ihrer Flugrichtung gestreckt (Instanz-Quads) statt als weiche Kugeln gezeichnet; Reifenrauch als Comic-Wölkchen mit unregelmäßigem Umriss.
- **Kamera-Drohne** fliegt vor dem Führenden her und filmt das Feld; Fahrer drehen den Kopf zu Gegnern neben oder hinter ihnen; im Countdown pusten die Auspuffe kleine Abgaswölkchen.
- **Regenspritzer** auf der Bahn im Neon-Hafen; aufgemalte **Kurvenpfeile** auf der Fahrbahn vor scharfen Kurven.
- **Konfetti** aus Papierschnipseln (drehen sich, flattern, sinken): Kanonen am Startbogen beim „LOS“, beim eigenen Zieleinlauf und auf dem Podest.
- **Sternenhimmel** über Neon-Hafen und Lava-Kreuz; die Fahrerfiguren **blinzeln**; Platz 1–3 im HUD in Gold, Silber und Bronze.

### Strecken und Fahrzeuge
| Strecke | Welt | Besonderheit |
|---|---|---|
| Neon-Hafen | Orange Bahn über einem Spielteppich mit Neon-Hochhäusern (Dachaufbauten, blinkende Antennen), Werbetafeln, fliegenden Autos, Straßenverkehr mit Schein- und Rücklichtern und Straßenlaternen | Lange Geraden – Windschatten und Echo-Ketten |
| Canyon-Klamm | Blaue Bahn durch eine Wüste mit gewellten Gesteinsschichten, Felsbögen, Tafelbergen, Spielzeug-Kakteen, kreisenden Geiern und rollenden Steppenläufern | Zwei enge Schluchten – dort blockieren Echos besonders stark |
| Wolkenarena | Orange Bahn zwischen schwebenden Inseln (Felszapfen, Bäumchen, Kristalle, Wasserfälle), Wolken, Heißluftballons und Möwenschwärmen | Sehr breite Arenen mit 9 Boostfeldern – Hacks dominieren |
| Lava-Kreuz | Türkise Bahn über Lavafeldern mit Fontänen, glühenden Kristallen und rauchendem Vulkan mit Lavaströmen | Eine Acht mit Kreuzung – Echos schneiden deine Linie |
| Gartenring | Gelbe Bahn durch einen sonnigen Riesengarten: Bäume, riesige Grashalme und Sonnenblumen, Teich mit Seerosen, Bauklötze, Wasserbälle, Riesen-Gießkannen, Tulpentöpfe, Gartenschlauch, Picknickdecke, Schmetterlinge und Vögel, Lattenzaun | Kurvig mit Schanze auf der Startgeraden |
| Lunapark | Violette Bahn durch einen Freizeitpark in der Abendsonne: Riesenrad mit Gondeln, Karussell mit wippenden Pferden, Kettenkarussell, Freifallturm, Achterbahn mit fahrendem Zug, Buden mit gestreiften Markisen und Kundschaft, Lichterketten über der Bahn, Wege mit Laternen, Bänken und Blumenbeeten, Warteschlangen und Spaziergänger, Lauflichter an Riesenrad, Karussell und Zelt, Pflasterplätze mit Rasen und Bäumen, Feuerwerk am Himmel; eigene Rummel-Musik | Haarnadel mit 12° Steilkurve, lange S-Kurve, **Durchfahrt durch ein Zirkuszelt** auf der Gegengeraden |

Auf jeder Strecke: Tribüne mit Zuschauern, Spruchband und Flutlicht an der Start-/Zielgeraden, wehende Fahnen an den Leisten, rot-weiße **Pfeiltafeln** an engen Kurven (die Pfeile zeigen in Kurvenrichtung), rot-weiße **Randsteine** an der Kurveninnenseite, **Zuschauer-Balkone** mit hüpfenden Steckfiguren und Fähnchen an Schanzen und Kurvenausgängen, **Werbebanden** mit 17 erfundenen Sponsoren auf den Leisten der Geraden (u. a. VOLT Batterien, KIKO Knusper-Kekse, NYX Nacht-Cola, RUNE Reifen, ECHO FM; je Welt eine eigene Marke wie OASE Limonade im Canyon, LAVALINO Glüh-Limo oder ZUCKERWOLKE Zuckerwatte im Lunapark; nachts hinterleuchtet) und **Reifenspuren**, die beim Driften und Bremsen auf der Bahn bleiben und langsam verblassen.

**Steilkurven:** Kurven sind je nach Radius bis etwa 13° geneigt (außen höher, Drehpunkt in der Bahnmitte); Start/Ziel, Kreuzungen und Sprungschanzen bleiben flach, in Senken wird die Neigung begrenzt. In geneigten Kurven lenkt das Kart bei Tempo bis zu 22 % stärker ein (die KI plant damit). Karts, Schatten, Reifenspuren, Echos und Hacks liegen auf der geneigten Fahrbahn; die Kamera neigt sich halb mit.

**Spiegelmodus:** Jede Strecke lässt sich seitenverkehrt fahren (Solo, Zeitfahren, Online). Alle Kurven drehen in die andere Richtung, Höhenprofil und Schanzen bleiben an ihrem Platz.

**Streckenbreite:** Alle Strecken sind gegenüber den Bauplänen um 2,2–3,5 m verbreitert (+25 % der Breite, schmale Abschnitte gewinnen relativ am meisten) – mehr Platz zum Überholen und Driften. Die Medaillenzeiten sind darauf (und auf die Steilkurven) neu abgestimmt.

Sechs Spielzeug-Karts mit offenem Cockpit, eigener Silhouette und klar unterschiedlichen Werten (Tempo, Beschleunigung, Handling, Drift, Hack-Ladetempo, Gewicht):

| Kart | Stil | Rolle |
|---|---|---|
| **Komet** | Retro-Flitzer mit runder Bugverkleidung, Kompressor und Sidepipes | Allrounder |
| **Viper** | Flacher Pfeil mit Frontflügel, Haifischflosse, Düse und Heckflügel | Topspeed |
| **Glitch** | Kantiges Cyber-Kart mit LED-Streifen, Holo-Bildschirm und Antennenschüssel | Hacker |
| **Nova** | Drift-Buggy mit runden Radbögen, Überrollbügel und GT-Flügel | Drift-Profi |
| **Titan** | Monster-Kart mit Stollenreifen, Rammschutz und Lichtbalken | Schwergewicht |
| **Pixel** | Dragster mit Motor vor dem Fahrer, Mini-Vorderrädern und Riesen-Slicks | Flitzer |

**Acht eigene Fahrerfiguren** mit großem Kopf, Gesicht und eigener Silhouette (in der Garage wählbar, KI-Gegner tragen ihre Namen): **Byte** (Roboter mit LED-Augen), **Nyx** (Katzenhelm), **Volt** (Blitz-Helm), **Rune** (Ritter mit Federbusch), **Kiko** (Astronauten-Kind), **Juno** (Fliegerin mit Brille), **Zed** (Hai-Helm), **Mira** (Popstar). Die Figuren lehnen sich in Kurven, schauen in die Kurve, schütteln bei Treffern den Kopf und jubeln mit erhobenen Armen bei eigenen Treffern, Tricks und nach dem Zieleinlauf.

---

## Lokal starten

Voraussetzung: [Node.js](https://nodejs.org) 20.19+ oder 22.12+.

```bash
npm install
```

```bash
npm run dev
```

Der Dev-Server zeigt eine lokale und eine Netzwerk-Adresse. Mit der Netzwerk-Adresse kannst du im selben WLAN direkt am Handy testen. Hinweis: Neigungssensor, Vollbild und Service Worker brauchen auf Handys meist **HTTPS** – am einfachsten über GitHub Pages testen.

Produktions-Build und Vorschau (inkl. Service Worker):

```bash
npm run build
```

```bash
npm run preview
```

---

## Auf GitHub Pages veröffentlichen

1. Neues Repository auf GitHub anlegen und den Projektordner hineinpushen (Branch `main`).
2. Im Repository: **Settings → Pages → Build and deployment → Source: „GitHub Actions“**.
3. Fertig: Jeder Push auf `main` startet `.github/workflows/deploy.yml` (Node 22, `npm ci`, `npm run build`, Upload von `dist/`). Die Adresse steht danach unter *Settings → Pages* bzw. im Workflow-Lauf (`https://<name>.github.io/<repo>/`).

Der Build nutzt relative Pfade (`base: './'`), funktioniert also in jedem Unterordner ohne Anpassung. Raum-Links (`?room=CODE`) und QR-Codes zeigen automatisch auf die veröffentlichte Adresse.

**Als App installieren:** Android/Chrome → Menü → „App installieren“ bzw. „Zum Startbildschirm“. iPhone/Safari → Teilen → „Zum Home-Bildschirm“ (dort läuft das Spiel dann im Vollbild; Safari selbst erlaubt Webseiten kein Vollbild).

---

## Technik

- **Three.js (WebGL2)** + Vanilla JS, gebaut mit **Vite**. Keine Bild-, Modell- oder Audiodateien: Strecken, Autos, Texturen und Musik werden prozedural erzeugt. Die App-Icons sind aus den echten 3D-Modellen gerendert (Kart „Komet“ mit Volt, Echo-Geist, Spielzeugbahn vor Abendhimmel).
- **Eigene Arcade-Physik** mit festem 60-Hz-Takt (Drift mit Funken-Stufen, Mini-Boosts, Windschatten, Rampen, Kollisionen über zwei Kreise pro Auto).
- **Materialien und Licht:** PBR-Lack mit Rauheit/Metall pro Bauteil (Lack, Chrom, Glas, Gummi in einem Draw-Call), Spiegelungen über eine pro Welt erzeugte Umgebungs-Map (PMREM aus Himmel + Leuchtflächen), echte Schatten der Autos (Schatten-Kamera folgt dem Spieler), Scheinwerfer-Lichtkegel in dunklen Welten, GPU-animierte Umgebungspartikel (Regen, Staub, Glitzer, Glut).
- **Rendering:** MSAA-Szene → Bloom (Dual-Filter, Schwelle pro Welt) → Kompositpass mit Schärfefilter (ohne Halos an Leuchtkanten), Geschwindigkeits-Unschärfe nur am Rand, Glitch-Effekt, ACES-Tonemapping und Color Grading pro Welt (Schatten-/Lichter-Tönung, Sättigung, Kontrast). Auflösung = `devicePixelRatio` (max. 2,5×) × **adaptiver Regler**: sinkt die Bildrate unter ~54 FPS, wird die Renderskalierung in Stufen gesenkt (bis 60 %, dann stärker nachgeschärft), bei Reserven wieder angehoben; bleibt es zu langsam, fällt die Grafikstufe automatisch (Hoch → Mittel → Niedrig) und steigt bei dauerhaften Reserven wieder. Auf 120-Hz-Displays wird auf 60 FPS begrenzt.
- **Umgebungsverdeckung (SAO):** aus dem Tiefenpuffer in halber Auflösung berechnet, kantenerhaltend weichgezeichnet – Kontaktschatten unter Karts, in Ecken und Fugen (Stufen Hoch und Ultra).
- **Farben und Schärfe:** natürliche Farbstimmung je Welt (fast neutrale Farbkorrektur, wenig Dunst und Glow), keine Bewegungs- oder Tiefenunschärfe; Tempo zeigen Sichtfeld und Speed-Streifen (nur beim Boost).
- **Grafikstufen:** Ultra/HD (Schatten 4096, Bloom ½ mit 5 Stufen, MSAA 4×, mehr Kulisse, bis 2× **Supersampling**), Hoch (Schatten 2048, bis 1,5× Supersampling), Mittel – Standard auf Handys (Schatten 1024, Bloom ¼, MSAA 2×, weniger Kulisse), Niedrig (ohne Schatten und Bloom). Auf PCs regelt „Auto“ bei genug Leistung bis Ultra hoch.
- **Lacke als Shader:** Die Lackflächen jedes Autos sind per Vertex-Attribut markiert; Chrom/Gold/Matt ändern Rauheit und Metall, Perlmutt und Holo färben blickwinkelabhängig (Fresnel), Carbon erzeugt das Webmuster prozedural.
- **Texturdichte (Detail-Schicht):** `render/detail.js` erzeugt kachelbare Detail-Texturen (Höhe, Gefälle, Helligkeit) für Gestein, Körnung, Laub, Rasen, Sandrippel und Stoff. Sie werden in Weltkoordinaten triplanar in zwei Maßstäben gesampelt und hellen/dunkeln die Grundfarbe und kippen die Normale (feines Relief) – auf Felsen, Inseln, Böden, Bahn, Leisten, Bäumen und Hecken. In der Ferne mitteln die Mipmaps alles weg (kein Flimmern); Stufe Mittel nutzt einen Maßstab, Niedrig keinen.
- **Hochaufgelöste Oberflächen:** Bahn 1024 px mit Kunststoff-Körnung, Reifenabrieb, Kratzern, Laschen, Schrauben und eingeprägten Sternen plus passender **Normal-Map**; Leisten mit Rippen, Fugen und Schrauben (Textur + Normal-Map); Sand mit Windwellen, Kieseln und Steinchen; Rasen mit dichten Halmen, Klee und Blumen; Lava-Boden als scharfes, glühendes Rissnetz auf Basaltplatten (Kruste und Glut deckungsgleich).
- **Materialklassen an Karts und Figuren:** dritter Wert im Farb-Material-Eintrag → Attribut `aMat`; der Lack-Shader legt in Objektkoordinaten (haftet am Teil) passende Feinstruktur auf: Carbon-Gewebe, Gummi mit Staub auf der Lauffläche, gebürstetes Metall, Lack-Flakes, Stoff, Leder, Haarsträhnen – dazu leichter Schmutz an der Unterkante.
- **Streckenrand und Tribüne:** Zuschauer und Fahnen sind GPU-Instanzen, die im Vertex-Shader hüpfen bzw. wehen (keine CPU-Last). Speed-Streifen werden komplett im Shader animiert.
- **Menü-Hintergrund:** ein laufendes KI-Rennen mit wechselnden Kameraeinstellungen wie bei einer TV-Übertragung (Verfolger, Seite, Front, Streckenrand, Luft, Rad-Perspektive) und Glitch-Schnitten.
- **Mobil:** Querformat (Hinweis bei Hochformat), Vollbild + Orientierungs-Sperre (wo erlaubt), Safe-Areas, Wake Lock, Vibration.
- **PWA:** `manifest.webmanifest` + Service Worker (wird beim Build mit allen Dateien befüllt) → offline spielbar (Solo/Zeitfahren).
- **Audio:** Web Audio API – Motor (3 Oszillatoren + Filter, Gangwechsel), Drift-Quietschen, Effekte und je Strecke ein eigener kurzer Musik-Loop. **Umgebungsgeräusche je Welt:** Regen und Stadtbrummen mit fernen Hupen (Neon), Wüstenwind und Geierrufe (Canyon), Höhenwind und Möwen (Wolken), Grollen, Blubbern und Knistern (Lava), Vogelgezwitscher und Hummeln (Garten), Stimmengewirr, Lachen und Achterbahn-Jubel (Lunapark); das Feuerwerk knallt mit Schall-Laufzeit. **Figuren-Stimmen** ohne Sprache: jede der acht Figuren hat eigene Tonlage, Klangfarbe und Vokal-Färbung (Formant) – Byte piepst in Tonstufen, Nyx gleitet wie eine Katze, Volt knistert, Rune klingt tief, Kiko hallt, Zed blubbert. Sie jubeln bei Turbostart, Trick, Ultra-Boost und Durchbruch, ärgern sich bei Treffern (auch getroffene Gegner), feiern oder schmollen im Ziel und melden sich bei der Auswahl in der Garage.

### Projektstruktur

```
index.html                 Einstieg
vite.config.js             Build-Konfiguration + Service-Worker-Generator
sw-template.js             Vorlage des Service Workers
public/                    Manifest und App-Icons
scripts/                   Entwickler-Werkzeuge (Streckenvorschau, Medaillenzeiten, Simulations- und Angriffstest)
src/
  main.js                  App: Menüfluss, Online-Lobby, Hauptschleife
  session.js               Rennsitzung (Solo / Host / Client / Menü-Demo)
  config.js                Balancing: Autos, Hacks, KI-Stufen, Netz-Konstanten
  platform.js              Einstellungen, Vibration, Vollbild, Wake Lock
  progress.js              Statistik, Erfolge, Lacke, Fahrer-Level/XP, Tages-Challenge
  game/                    Spiellogik (ohne Grafik, läuft auch in Node)
    track.js, trackDefs.js   Strecken als Spline, Abfragen, Ideallinie
    car.js                   Fahrphysik
    echo.js                  Aufzeichnung, Wiedergabe, kompakte Kodierung
    hacks.js                 Streckenhacks und Angriffe (Schockwelle, Rammstoß, Echo-Klon)
    ai.js                    KI-Fahrer
    sim.js                   Renn-Simulation (Runden, Positionen, Echos, Hacks)
  render/                  Three.js: Renderer/Post-Processing, Welten (park.js: Lunapark-Fahrgeschäfte), Streckenrand/Tribüne/Werbebanden, Karts, Fahrerfiguren, Effekte, Kamera
  net/net.js               PeerJS-Verbindungen (Host/Client)
  input/input.js           Tastatur, Gamepad, Touch, Neigung
  audio/audio.js           Prozeduraler Sound
  ui/                      Menüs, HUD, Mini-Karte
```

### Netzwerk-Architektur

- **Ohne eigenen Server:** WebRTC-Datenkanäle über [PeerJS](https://peerjs.com). Nur der Verbindungsaufbau läuft über den öffentlichen PeerJS-Vermittlungsserver; danach fließen die Daten direkt zwischen den Geräten. Der Host registriert sich als `echoracer-v1-<CODE>`, Clients verbinden sich direkt zu ihm (Stern-Topologie).
- **Zwei Kanäle pro Client:** `ctrl` (zuverlässig, geordnet: Lobby, Start, Echos, Hacks, Runden, Ergebnis) und `fast` (ungeordnet: Eingaben und Snapshots). Nachrichten > 12 KB werden automatisch gestückelt.
- **Autoritativer Host:** Der Host simuliert das ganze Rennen (inkl. KI, Kollisionen, Runden, Echos, Hacks). Clients schicken nur Eingaben (30× pro Sekunde, jeweils die letzten 6 zur Absicherung gegen Verluste) und Hack-Wünsche.
- **Client-Prediction:** Das eigene Auto wird lokal sofort mit derselben Physik simuliert. Jeder Snapshot (20 Hz) enthält den autoritativen Zustand des eigenen Autos und die zuletzt verarbeitete Eingabe; der Client setzt sich darauf zurück, simuliert die noch offenen Eingaben neu und blendet kleine Abweichungen weich aus. Echo-Kollisionen werden mit der Zeit der jeweiligen Eingabe geprüft (Lag-Kompensation), weil Echos reine Funktionen der Rennzeit sind.
- **Fremde Autos:** Dead Reckoning auf einem Kreisbogen (Geschwindigkeit + Gierrate) bis zur aktuellen Rennzeit, neue Snapshots werden per *Projective Velocity Blending* weich übernommen – keine Sprünge, auch bei 100–150 ms Ping. Gemessen mit simulierten 150 ms RTT + 3 % Paketverlust: Korrekturen am eigenen Auto im Median 2 mm.
- **Uhr-Synchronisation:** Ping/Pong mit Auswahl der Messung mit der kleinsten Laufzeit; alle Geräte rechnen in derselben Rennzeit (Countdown, Echos, Hacks).
- **Hacks als Funktion der Zeit:** Die Bahn des Echo-Klons und das mitwandernde Zentrum der Schockwelle werden aus wenigen Startwerten berechnet – Host und Clients kommen zum gleichen Zeitpunkt auf exakt dieselbe Position. Die Schockwelle trifft jedes Auto in genau dem Takt, in dem der Ring es überstreicht (zustandslos, daher auch beim Neu-Simulieren der Client-Vorhersage korrekt). Der Rammstoß-Schild steckt im Fahrzeugzustand bzw. als Flag im Snapshot.
- **Turbostart online:** Der Client meldet den Zeitpunkt seines Drift-Drucks im Countdown, der Host wertet ihn aus (kommt die Meldung erst nach dem Start an, wird sie sofort angewendet).
- **Höhen:** Die Physik rechnet die Flughöhe relativ zur Fahrbahn; Echos speichern absolute Höhen (mit Querneigung der Steilkurven), Autos auf verschiedenen Ebenen (Brücke) berühren sich nicht; auch Hacks (Schockwelle, Barriere, Klon), Windschatten, Knapp-Bonus und die KI-Zielwahl prüfen die Ebene (Höhe der Bahnmitte).
- **Protokoll-Version 8:** Unterschiedliche Spielversionen werden beim Beitreten erkannt (Hinweis „bitte neu laden“).
- **Strecken-Abstimmung:** Stimmen laufen als `cfg`-Nachricht zum Host und mit der Lobby an alle zurück. Beim Start lost der Host aus allen Stimmen (ohne Stimmen: aus allen Strecken), schickt `roulette` (Lose, Gewinner, Dauer) – alle Geräte zeigen dieselbe Animation – und startet danach das Rennen; die Stimmen werden für die nächste Runde zurückgesetzt.
- **Echo-Daten:** 20 Abtastpunkte pro Sekunde als `Int16` (x/z auf 10 cm, Höhe auf 1 cm, Richtung auf 0,1 mrad), Base64-kodiert – eine 30-s-Runde sind ≈ 6 KB. Host und Clients nutzen exakt dieselben dekodierten Daten.
- Verlässt ein Client das Rennen, übernimmt die KI sein Auto. Verlässt der Host, endet der Raum für alle.

---

## Annahmen und Entscheidungen

Wo das Briefing Spielraum ließ, wurde so entschieden:

- **PeerJS statt Trystero:** Die feste Raum-ID (`Präfix + Code`) passt direkt zum Host-Modell, belegte Codes werden erkannt. PeerJS bringt Google-STUN und einen öffentlichen TURN-Server mit.
- **Raumcode:** 4 Zeichen aus `A–Z` und `2–9` ohne verwechselbare Zeichen (kein I, O, 0, 1).
- **Max. 6 Fahrzeuge** im Rennen (Spieler + KI zusammen). Wer während eines laufenden Rennens beitritt, wartet in der Lobby auf das nächste.
- **Startaufstellung:** KI vorne, Menschen dahinter.
- **Echo-Start:** Ein Echo beginnt beim Überqueren der Ziellinie (die Startaufstellung liegt hinter der Linie, Runde 1 wird erst ab der Linie aufgezeichnet). Max. 36 Echos gleichzeitig (älteste verschwinden zuerst).
- **„Boostfeld spiegeln“** = seitlich gespiegelt **und** für Gegner bremsend, für den Hacker weiter ein Boost.
- **„Kurvenradius verengen“** = Holo-Wand auf der Außenseite der nächsten Kurve; die Kurve muss enger (innen) gefahren werden.
- **Hack-Ziel** ist der Fahrer direkt vor dir (als Führender: direkt hinter dir) – deterministisch, kein Zufall. Der Hack-Knopf zeigt das aktuelle Ziel.
- **Nach dem Zieleinlauf** rollt das Auto per Autopilot in einer Ehrenrunde aus (für andere als Geist ohne Kollisionen, keine weiteren Echos). Das Rennen endet, wenn alle menschlichen Fahrer im Ziel sind, spätestens 30 s nach dem ersten.
- **Angriffe ohne Zufall:** Schockwelle und Rammstoß stoßen immer **seitlich** weg und bremsen – nie nach vorn, damit ein Treffer dem Opfer keinen Vorteil bringt. Nach einem Stoß greifen die Reifen kurz schlechter (das Auto rutscht wirklich weg).
- **Treffer-Freeze und Fotofinish-Zeitlupe** halten die Rennuhr an bzw. verlangsamen sie – deshalb nur im Solo-Modus. Online laufen alle Geräte auf derselben Uhr, dort gibt es nur die optischen Effekte.
- **Grand Prix:** feste Reihenfolge der Welten, 3 Runden, kein Neustart einzelner Rennen. Bei Punktgleichheit entscheidet das letzte Rennen.
- **Zeitfahren:** Die beste Runde wird pro Strecke im Browser gespeichert (`localStorage`) und erscheint als nicht-festes Rekord-Echo.
- **Look:** Spielzeug-Karts, Figuren und Plastik-Rennbahn sind eigene Entwürfe – angelehnt an die Qualität großer Fun-Racer, aber ohne deren Figuren, Items, Strecken oder Markenzeichen. Die Bahn ist über dem Boden aufgeständert und folgt einem Höhenprofil (Hügel, Senken, Brücke); abheben lassen nur Schanzen und Rampen.
- **Sprungschanzen** stehen fest auf den langen Geraden (keine Lücke in der Bahn), die Flugbahn ist für alle gleich – Tricks entscheiden über den Landeboost.

## Bekannte Grenzen

- **Host im Vordergrund lassen:** Browser pausieren Hintergrund-Tabs; wechselt der Host die App, steht das Rennen für alle still.
- **Mobilfunk/strenge Firewalls:** Ohne erreichbaren TURN-Server kann eine direkte Verbindung scheitern. Eigene STUN/TURN-Server (z. B. von Metered oder Cloudflare) lassen sich in `src/config.js` unter `ICE_SERVERS` eintragen.
- **iPhone:** Safari unterstützt weder Vibration noch Vollbild für Webseiten; Vollbild gibt es über „Zum Home-Bildschirm“. Die Neigungssteuerung fragt beim ersten Tippen nach der Bewegungs-Freigabe.
- Der öffentliche PeerJS-Vermittlungsserver ist ein kostenloser Dienst Dritter; fällt er aus, funktioniert nur der Solo-Modus.

## Entwickler-Werkzeuge

```bash
node scripts/sim-test.mjs
```
Simuliert ohne Grafik Rennen mit 6 KI-Autos auf allen Strecken und gibt Rundenzeiten, Treffer, Ereignisse und die genutzten Hacks je Art aus (Balancing).

```bash
node scripts/attack-test.mjs
```
Prüft Schockwelle, Rammstoß und Echo-Klon in festen Situationen (Treffer, Immunität des Besitzers, Seitenstoß statt Vorwärtsschub, Durchbrechen von Echos, identische Klon-Bahn auf Host und Client).

```bash
node scripts/medal-times.mjs
```
Misst die beste Runde der schweren KI im Zeitfahren je Strecke und Auto (Grundlage der Medaillenzeiten in `trackDefs.js`).

```bash
node scripts/track-preview.mjs vorschau.png
```
Zeichnet alle Strecken (Ideallinie, Kurven, Boostfelder, Kreuzungen) als Bild und prüft Mindestabstände.

Schlechtes Netz simulieren: in der Browser-Konsole `window.__netLag = 70` (ms je Richtung) und `window.__netLoss = 0.05` (Verlustrate) setzen.

## Lizenzen der Abhängigkeiten

[three.js](https://github.com/mrdoob/three.js) (MIT), [PeerJS](https://github.com/peers/peerjs) (MIT), [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) (MIT), [Vite](https://vitejs.dev) (MIT).
