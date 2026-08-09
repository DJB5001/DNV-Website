# DarkNova — App als Startseite, Clan als Unterseite

Alles landet in **einem** Repo. Danach kannst du `opsucht-app` abschalten.

## Was in diesem Paket ist

| Datei | Was damit passiert |
|---|---|
| `index.html` | **ersetzt** deine bisherige App-Startseite (zwei kleine Ergänzungen, siehe unten) |
| `css/theme.css` | **neu** — das komplette Redesign der App |
| `css/clan.css` | **neu** — Design der Clan- und Rechtsseiten |
| `clan.html` | **neu** — Clan-Infos |
| `impressum.html` | **neu** |
| `datenschutz.html` | **neu** — deckt jetzt Website, Bot und App ab |
| `nutzungsbedingungen.html` | **neu** — deckt Bot und App ab |

Nicht enthalten sind deine eigenen App-Dateien (`js/`, `icons/`, `css/style.css`, `css/auth.css`, `css/user-profile.css`, `manifest.webmanifest`, `service-worker.js`). Die bleiben unverändert und müssen einfach mitkommen.

## So sieht das Zielrepo aus

```
index.html                 ← die App (Startseite)
clan.html                  ← Clan-Infos
impressum.html
datenschutz.html
nutzungsbedingungen.html
manifest.webmanifest
service-worker.js
css/  style.css  auth.css  user-profile.css  theme.css  clan.css
js/   script.js  chart.js  config.js  supabase-config.js  supabase-compat.js
icons/
```

## Vorgehen

1. Im Repo `dnv-system` die alten Dateien löschen (`index.html`, `style.css`, `README.md`)
2. Aus `opsucht-app` **alle** Dateien und Ordner ins `dnv-system`-Repo übertragen
3. Danach die Dateien aus diesem Paket hochladen und dabei `index.html` überschreiben
4. Fertig — die Seite läuft unter derselben Adresse wie bisher

## Falls du index.html lieber selbst änderst

Es sind nur zwei Stellen. Erstens im `<head>`, direkt nach dem letzten bestehenden Stylesheet:

```html
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wdth,wght@62..125,100..900&family=JetBrains+Mono:wght@400;500&family=Public+Sans:wght@400;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="css/theme.css">
```

Zweitens direkt hinter dem schließenden `</div>` der Tab-Leiste:

```html
<a class="dnv-clanlink" href="clan.html">DNV <span>Clan</span></a>
```

Wichtig ist nur, dass `theme.css` **nach** `style.css` steht — sonst greifen die Überschreibungen nicht.

## Zum Redesign

Keine einzige ID und kein Klassenname wurde verändert. `script.js` greift auf 122 IDs und 43 Selektoren zu — deshalb läuft die gesamte Logik unverändert weiter.

Der Umbau passiert über `theme.css`: Sie definiert die CSS-Variablen neu (deine App nutzt sie an 443 Stellen), tauscht die Schriften und formt Kopfleiste, Reiter, Karten und Eingabefelder um.

Aus der goldenen Serifen-Optik wird ein nüchternes Handelsterminal: scharfe Kanten statt Rundungen, Zahlen in Monospace zum Untereinandervergleichen, Reiter als Unterstrich-Navigation, Amethyst als Akzent passend zum Clan.

Falls dir eine Farbe nicht gefällt, steht alles oben in `theme.css` unter `:root`.

## Noch offen

- Discord-Einladungslink in `clan.html` (steht dort noch als `href="#"`)
- Die vier Zahlen im Clan-Abschnitt auf den echten Stand bringen

## Zwei Hinweise

**Der images-Ordner fehlt.** Deine App verweist auf `images/Zahnrad.png` und `images/add-symbol.svg`, beide Dateien gibt es im Repo nicht. Daher das kaputte Bildsymbol in der Kopfzeile. Das war schon vorher so — entweder die Dateien nachreichen oder die beiden `<img>`-Verweise entfernen.

**Lösch `opsucht-app` nicht sofort.** Die App liegt danach unter einer neuen Adresse. Wer sie als App auf dem Handy installiert hat, zeigt weiterhin auf die alte URL und bekommt nach dem Löschen eine Fehlerseite. Besser: Im alten Repo alles löschen bis auf eine `index.html` mit einer Weiterleitung:

```html
<!doctype html>
<html lang="de">
  <head>
    <meta charset="utf-8">
    <meta http-equiv="refresh" content="0; url=https://djb5001.github.io/dnv-system/">
    <title>Umgezogen</title>
  </head>
  <body>
    <p>OPSuchtWeb ist umgezogen:
      <a href="https://djb5001.github.io/dnv-system/">zur neuen Adresse</a>
    </p>
  </body>
</html>
```

Nach ein paar Wochen kannst du das Repo dann gefahrlos löschen.
