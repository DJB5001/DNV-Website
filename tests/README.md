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
| `bilder-test.mjs` | Aus Materialnamen entstehen brauchbare Bildadressen | Verlauf |
| `kette-test.mjs` | Bild-Rückfall: eigenes Bild → Typ → Verbotsschild | Browser |
| `anzeige-test.mjs` | Marktname ohne API-Feld, Variante auf der Auktionskarte | Browser |
| `filter-test.mjs` | „Auktionsverlauf" zeigt nur die gewählte Variante | Browser + Verlauf |

## Warum diese Tests

Der Auslöser: „Bohrer V3" liegt im Verlauf unter einem Schlüssel, ist
aber zweierlei — eine Sammelkarte aus Papier (Ø rund 590 Tsd) und eine
Netherit-Spitzhacke (Ø rund 870 Mio). Wer beides zusammen mittelt,
bekommt eine Zahl, die für keines von beidem stimmt. Betroffen sind 396
der 2569 Namen im Verlauf.
