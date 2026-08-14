# Tests

Prüfungen für die Auktions- und Marktlogik. Es gibt keinen Testrunner —
jede Datei läuft einzeln mit `node`.

## Voraussetzungen

Die datenbasierten Tests brauchen `auction-history.json` aus dem
Datenrepo [DJB5001/opsuchtinfo](https://github.com/DJB5001/opsuchtinfo).
Pfad als Argument oder über die Umgebungsvariable:

```sh
export AUKTIONSVERLAUF=../opsuchtinfo/auction-history.json
```

Die Browser-Tests brauchen zusätzlich Playwright und eine laufende
Auslieferung der Seite:

```sh
npx http-server . -p 8123      # abweichender Port über PORT=...
```

## Die einzelnen Tests

| Datei | Prüft | Braucht |
|---|---|---|
| `varianten-test.mjs` | Sammelkarte und Werkzeug unter gleichem Namen werden getrennt | Verlauf |
| `index-test.mjs` | Der Item-Index teilt Varianten auf, ohne Verkäufe zu verlieren | Verlauf |
| `bilder-test.mjs` | Aus Materialnamen entstehen brauchbare Bildadressen. Mit `--abrufen` wird jede Adresse wirklich geholt (dauert Minuten) | Verlauf |
| `kette-test.mjs` | Bild-Rückfall: eigenes Bild → Wiki → Spieltextur → Verbotsschild, und dass die Adresse, die es geschafft hat, gemerkt wird | Browser |
| `anzeige-test.mjs` | Marktname ohne API-Feld, Variante auf der Auktionskarte | Browser |
| `filter-test.mjs` | „Auktionsverlauf" zeigt nur die gewählte Variante | Browser + Verlauf |
| `reiter-test.mjs` | Clan und Mitglieder laufen als Reiter, die Leiste bleibt stehen | Browser |
| `hintergrund-test.mjs` | Jede Bildebene hat ein Motiv, die Datei wird ausgeliefert, der Inhalt liegt darüber | Browser |
| `spieler-test.mjs` | Bestenliste, alle sieben Sortierarten, Profil und Rückweg | Browser |
| `verlaengerung-test.mjs` | Verlängerte Auktionen zählen nur einmal — gegen die echten Daten | Verlauf |
| `mitglieder-test.mjs` | Die Mitgliederliste kommt aus `data/mitglieder.json`; fehlt oder klemmt sie, trägt die hinterlegte Liste | Browser |

## Zwei Auktionen, die keine sind

Neben den Varianten gibt es einen zweiten Grund, warum Durchschnitte
danebenlagen: Wird kurz vor Schluss geboten, verlängert sich die Auktion,
und der Verlauf hält jede Verlängerung als eigenen Eintrag fest. Dieselbe
Auktion steht dann bis zu fünfzehnmal darin, jedes Mal teurer.

Erkannt wird das an der Gebotsliste, nicht an der Zeit: bei einer
Verlängerung bleibt jeder bisherige Bieter drin und bietet nie weniger als
zuvor. Das Zeitfenster von zehn Minuten ist an den echten Daten gemessen —
96 % aller Verlängerungen liegen unter 5,5 Minuten, danach bricht die
Verteilung ab. Betroffen waren 6.468 von 40.966 Einträgen, also 16 %.

## Warum diese Tests

Der Auslöser: „Bohrer V3" liegt im Verlauf unter einem Schlüssel, ist
aber zweierlei — eine Sammelkarte aus Papier (Ø rund 590 Tsd) und eine
Netherit-Spitzhacke (Ø rund 870 Mio). Wer beides zusammen mittelt,
bekommt eine Zahl, die für keines von beidem stimmt. Betroffen sind 396
der 2569 Namen im Verlauf.

## Zu den Bildern

Items ohne eigenes Bild bekommen das Bild ihres Typs. Probiert wird der
Reihe nach: Wiki (schönere Ansichten, aber die Seitennamen weichen
mitunter ab), dann die Spieltextur nach exakter Material-ID — als
Gegenstand, als Block, und zuletzt die Seitenflächen mehrflächiger
Blöcke wie Knochen- oder Honigblock.

Gemessen mit `--abrufen`: Die Spieltexturen allein decken **99,1 %** der
40.522 Items im Verlauf ab. Was übrig bleibt, sind eigene Server-Items
(`NETHERITE_SPEAR`, `DIAMOND_SPEAR`), sehr neue Inhalte (`DRIED_GHAST`)
und mehrflächige Blöcke.

Ob ein Bild am Ende wirklich erscheint, lässt sich nur auf der laufenden
Seite sehen — in dieser Umgebung erreicht der Browser keine externen
Adressen.
