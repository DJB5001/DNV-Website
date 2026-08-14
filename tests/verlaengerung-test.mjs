// Prüft, dass verlängerte Auktionen nur einmal gezählt werden.
//
// Der Fall aus der Meldung: Drei Karten „Bohrer V3" nebeneinander, alle
// mit 13 Geboten, Preise 815 Mio / 861 Mio / 900 Mio. Es sind nicht drei
// Verkäufe, sondern einer — die Auktion wurde zweimal verlängert, weil
// kurz vor Schluss noch geboten wurde, und der Verlauf hat jede Stufe
// als eigenen Eintrag festgehalten.
//
// Getestet wird gegen die echten Daten, weil sich der Fall nur dort in
// seiner ganzen Form zeigt: die Verteilung der Abstände ist es, die den
// Zuschnitt des Zeitfensters rechtfertigt.

import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');

// Den echten Code ausschneiden statt nachzubauen — sonst prüft der Test
// eine Kopie, die auseinanderlaufen kann.
const fenster = quelle.match(/const VERLAENGERUNG_FENSTER_MS = [^;]+;/);
const von = quelle.indexOf('function loreAlsText(item)');
const bis = quelle.indexOf('// Alle Verkäufe aus dem Verlauf');
if (!fenster || von < 0 || bis < 0) throw new Error('Block nicht gefunden');
const block = fenster[0] + '\n' + quelle.slice(von, bis);

const pfad =
  process.argv[2] ||
  process.env.AUKTIONSVERLAUF ||
  '../opsuchtinfo/auction-history.json';

if (!fs.existsSync(pfad)) {
  console.error(
    `auction-history.json nicht gefunden unter: ${pfad}\n` +
      'Aufruf: node tests/verlaengerung-test.mjs <pfad-zu-auction-history.json>\n' +
      'oder:   AUKTIONSVERLAUF=<pfad> node tests/verlaengerung-test.mjs'
  );
  process.exit(2);
}

const historie = JSON.parse(fs.readFileSync(pfad, 'utf8'));

const kontext = { App: { auctionHistory: historie }, console };
vm.createContext(kontext);
vm.runInContext(
  block + '\nglobalThis.__api = { verlaufEntdoppeln, istFortsetzung, verkaufsZeit, VERLAENGERUNG_FENSTER_MS };',
  kontext
);
const { verlaufEntdoppeln, istFortsetzung, VERLAENGERUNG_FENSTER_MS } = kontext.__api;

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  console.log(`${bedingung ? '  ok  ' : ' FEHL '} ${text}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bedingung) fehler++;
};

const zaehle = (v) =>
  Object.values(v).reduce((n, l) => n + (Array.isArray(l) ? l.length : 0), 0);
const fmt = (n) => Math.round(n).toLocaleString('de-DE');

// ── 1. Der gemeldete Fall ───────────────────────────────────────────
console.log('\n=== Bohrer V3, Netherit-Spitzhacke ===');
const vorher = historie['Bohrer V3'].filter(
  (s) => s.item?.material === 'NETHERITE_PICKAXE'
);
for (const s of vorher.slice().sort((a, b) => a.endTime.localeCompare(b.endTime))) {
  const gebote = Object.keys(s.bids || {}).length;
  console.log(`  ${s.endTime.slice(0, 19)}  ${fmt(s.currentBid).padStart(13)}  Gebote=${gebote}`);
}

const { verlauf: sauber, entfernt } = verlaufEntdoppeln(historie);
const nachher = sauber['Bohrer V3'].filter((s) => s.item?.material === 'NETHERITE_PICKAXE');

console.log(`\n  vorher ${vorher.length} Einträge → nachher ${nachher.length}`);
pruefe(vorher.length === 5, 'im Rohverlauf stehen fünf Einträge', String(vorher.length));
pruefe(nachher.length === 3, 'übrig bleiben drei echte Auktionen', String(nachher.length));

const preise = nachher.map((s) => s.currentBid).sort((a, b) => a - b);
pruefe(
  !preise.includes(815123074) && !preise.includes(860678260),
  'die beiden Zwischenstände sind weg'
);
pruefe(preise.includes(900000000), 'der tatsächliche Endpreis bleibt stehen');

// ── 2. Umfang über den ganzen Verlauf ───────────────────────────────
console.log('\n=== Gesamter Verlauf ===');
const gesamtVorher = zaehle(historie);
const gesamtNachher = zaehle(sauber);
console.log(`  ${fmt(gesamtVorher)} Einträge → ${fmt(gesamtNachher)}  (${fmt(entfernt)} zusammengefasst)`);

pruefe(gesamtVorher - gesamtNachher === entfernt, 'die Zählung stimmt mit dem Ergebnis überein');
pruefe(entfernt > 5000, 'der Fall ist kein Einzelfall', `${fmt(entfernt)} Zwischenstände`);
pruefe(
  entfernt / gesamtVorher < 0.25,
  'aber auch keine Übertreibung — unter einem Viertel',
  `${((entfernt / gesamtVorher) * 100).toFixed(1)} %`
);
pruefe(
  Object.keys(sauber).length === Object.keys(historie).length,
  'kein Item-Name geht verloren'
);

// ── 3. Die Regel selbst ─────────────────────────────────────────────
console.log('\n=== Die Erkennungsregel ===');
const mit = (bids, ms) => ({ bids, endTime: new Date(ms).toISOString(), item: {} });

pruefe(
  istFortsetzung(mit({ a: 10, b: 20 }, 0), mit({ a: 10, b: 30 }, 60_000)),
  'gleiche Bieter, höherer Preis, kurz danach → dieselbe Auktion'
);
pruefe(
  istFortsetzung(mit({ a: 10 }, 0), mit({ a: 10, b: 99 }, 60_000)),
  'ein neuer Bieter kommt dazu → immer noch dieselbe'
);
pruefe(
  !istFortsetzung(mit({ a: 10, b: 20 }, 0), mit({ a: 10 }, 60_000)),
  'ein Bieter fehlt → andere Auktion'
);
pruefe(
  !istFortsetzung(mit({ a: 20 }, 0), mit({ a: 10 }, 60_000)),
  'jemand bietet weniger als vorher → andere Auktion'
);
pruefe(
  !istFortsetzung(mit({ a: 10 }, 0), mit({ a: 20 }, VERLAENGERUNG_FENSTER_MS + 1000)),
  'zu spät → andere Auktion'
);
pruefe(
  !istFortsetzung(mit({}, 0), mit({}, 60_000)),
  'ohne Gebote kann nichts verlängert worden sein'
);

// ── 4. Ketten über die Fensterbreite hinaus ─────────────────────────
// Eine Auktion kann sich mehrfach hintereinander verlängern. Verglichen
// wird deshalb mit der jeweils letzten Stufe, nicht mit der ersten —
// sonst risse die Kette, sobald sie länger als das Fenster wird.
const schritt = VERLAENGERUNG_FENSTER_MS - 60_000;
const kette = {
  Prüfstück: [
    { seller: 'S', bids: { a: 10 }, endTime: new Date(0).toISOString(), item: { material: 'X', lore: [] } },
    { seller: 'S', bids: { a: 20 }, endTime: new Date(schritt).toISOString(), item: { material: 'X', lore: [] } },
    { seller: 'S', bids: { a: 30 }, endTime: new Date(schritt * 2).toISOString(), item: { material: 'X', lore: [] } }
  ]
};
const geprueft = verlaufEntdoppeln(kette).verlauf['Prüfstück'];
pruefe(geprueft.length === 1, 'eine dreifach verlängerte Auktion bleibt eine', String(geprueft.length));
pruefe(geprueft[0].bids.a === 30, 'und behält ihren letzten Stand', String(geprueft[0].bids.a));

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
