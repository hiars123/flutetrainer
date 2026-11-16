# Flötenlehrer (Prototyp)

Lernhilfe für Flöten: Noten laufen auf eine Abspiellinie zu, daneben zeigt eine Flöte als SVG, welche Löcher
gerade zugedeckt sind – inklusive Vorschau auf den nächsten Griff.

Flöten (Einstellungen): Sopranblockflöte, Altblockflöte (jeweils barocke oder deutsche Griffweise) und Tin Whistle in D.
Pro-Vorschau (Einstellungen): Mikrofon zum Mitspielen mit Bewertung und **Warte-Modus** (das Stück wartet, bis du den Ton triffst).

Seiten: **Lernpfad** (Sterne, schaltet Schritt für Schritt frei) · **Lieder** · **Töne** (Übungen) · **Quiz** (Griff-Trainer) · **Griffe** (Grifftabelle zum Nachschlagen).
Lieder: Alle meine Entchen, Hänschen klein, Kuckuck, Morgen kommt der Weihnachtsmann, Bruder Jakob, Ode an die Freude, Happy Birthday, Jingle Bells, Alle Jahre wieder.

Angular 22 (standalone, Signals, zoneless) · SVG + CSS · Web Audio API · keine weiteren Laufzeit-Abhängigkeiten.

```bash
npm install
npm start          # http://localhost:4200
npm test           # Vitest: Takte, Griffe, Notenparser
npm run build
```

## Als App installieren (PWA) und veröffentlichen

Die App ist eine PWA: nach dem ersten Laden läuft sie auch offline und lässt sich auf dem Handy installieren.

1. Repository auf GitHub **öffentlich** anlegen und diesen Ordner pushen (Branch `main`).
2. Auf GitHub: *Settings → Pages → Source: GitHub Actions*.
3. Der Workflow `.github/workflows/pages.yml` testet, baut und veröffentlicht bei jedem Push.
   Adresse: `https://<benutzer>.github.io/<repo>/`
4. Auf dem Handy öffnen: Android/Chrome „App installieren“, iPhone/Safari „Teilen → Zum Home-Bildschirm“.

Der Service Worker ist nur im Produktions-Build aktiv (`npm run build`), nicht bei `npm start`.
Das Mikrofon braucht HTTPS (GitHub Pages) oder `localhost`.

## Aufbau

```
src/app/
  core/
    notes.ts          Ton-Parser ('C5', 'F#5', 'Bb5'), Frequenz, deutsche Namen (H, Cis, B …)
    fingerings.ts     Griffe als Daten: '1 111 1111' = Daumen | Loch 1-3 | Loch 4-7 (1 zu, 0 offen, h halb)
    instruments.ts    Flöten: Lochzahl, Griff-Tabelle, Stück-Verschiebung (Alt −7, Whistle +2), Notations-Oktave
    settings.service.ts  Einstellungen (Flöte, Pro-Schalter), im Browser gespeichert
    pitch.ts          Tonhöhenerkennung (YIN)
    mic.service.ts    Mikrofon-Zugriff; playalong.service.ts wertet pro Note aus
    songs.ts          Lieder + Übungen in Mini-Notenschrift: 'C5 D5:2 R:1 F#5:0.5 | …' + Liedtext
    exercises.ts      Tonvorräte für den Griff-Trainer (je nach Flöte)
    waitmode.service.ts  Warte-Modus: Stück hält an, bis der Ton ~0,2 s sauber klingt; gleiche Töne brauchen neuen Zungenstoß
    progress.service.ts  Sterne pro Schritt (Lieder: Trefferquote 50/75/90 %, Quiz: Serie 5/8/12), localStorage
    path.ts           Lernpfad: Reihenfolge der Schritte
    audio.service.ts  Flötenton (Synth) und Metronom-Klick
    player.service.ts Transport: Einzähler, Tempo, Loop – Zeit kommt aus der Audio-Uhr, daher bleiben Bild und Ton synchron
    glyphs.ts         Notenschlüssel, Köpfe, Pausen, Vorzeichen aus Noto Music (SIL OFL), als SVG-Pfade
  ui/flute/           Flöte (SVG) mit animierten Fingerpolstern; auch klickbar (Trainer)
  ui/staff/           Scrollende Notenzeile (SVG), Abstand proportional zur Zeit
  features/practice/  Lieder und Übungen spielen
  features/trainer/   Griff-Trainer (Note → Griff, Griff → Note)
  features/path/      Lernpfad mit Sternen
  features/chart/     Grifftabelle: alle Töne der gewählten Flöte, antippbar
  features/settings/  Flötenwahl und Pro-Schalter
```

## Neues Lied hinzufügen

In `core/songs.ts` einen weiteren `song({...})`-Eintrag ergänzen (optional `key` = Vorzeichen, +Kreuze/−Bs, und `pickup` = Auftakt in Schlägen; im Text `_` für Noten ohne Silbe). Die Tests prüfen automatisch,
dass jeder Takt voll ist und jeder Ton einen Griff hat.

## Bekannte Grenzen des Prototyps

- Deutsche Griffweise: belegt ist nur der Unterschied beim F in der Grundskala (C5–D6); höhere Töne fehlen.
- Tin Whistle: nur die Töne der D-Dur-Tonleiter, keine Halbtöne (Halblochen/Gabelgriffe).
- Altflöte und Whistle: Stücke werden verschoben (Alt eine Quinte tiefer, Whistle nach D-Dur); die Tonart wandert mit.
  Stücke mit Halbtönen sind auf dem Whistle nicht spielbar und dort gesperrt.
- Mikrofon: erkennt den Tonnamen (Oktave egal); mit Kopfhörern benutzen, sonst hört es das Metronom. Im eingebetteten Vorschaufenster geht das Mikrofon nicht – lokal starten.
- Notenwerte: Achtel bis Ganze, mit Punkt. Keine Triolen, Bindebögen.
- Vorzeichen: Tonart am Zeilenanfang, Vorzeichen und Auflösungszeichen gelten bis zum Taktende.
- Kuckuck: 3. Zeile als Wiederholung der 1. Zeile notiert (nicht an einer zweiten Quelle geprüft).
- Happy Birthday: vereinfachter Rhythmus (zwei Achtel im Auftakt), ohne Text.
