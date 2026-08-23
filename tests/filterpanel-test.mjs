// Das Filter-Panel über den Auktionen: Preis, Verzauberungsstufen,
// Kategorien.
//
// Geprüft werden die Regeln, nicht die Oberfläche — die Knöpfe zeichnen
// sich aus denselben Listen, also stimmt die Anzeige, wenn die Regeln
// stimmen. Was man nur im Browser sehen kann (Aufklappen, Chip-Reihe),
// steht in auktionsfilter-test.mjs.
//
// Aufruf: node tests/filterpanel-test.mjs [pfad-zu-auction-history.json]

import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');
const schnipsel = (von, bis) => {
  const a = quelle.indexOf(von);
  const b = quelle.indexOf(bis);
  if (a < 0 || b < 0) throw new Error(`nicht gefunden: ${von} / ${bis}`);
  return quelle.slice(a, b);
};

const block =
  schnipsel('/* Was Minecraft selbst höchstens vergibt.', 'const ROEMISCH =') +
  schnipsel('function getAuctionCategoryKey(auction)', 'function getAuctionCategoryLabel') +
  schnipsel('/**\n * In welche Gruppe gehört diese Auktion?', '/** Gehört diese Auktion zur gewählten Art? */') +
  schnipsel('/* Die Listen des Filter-Panels', '// Zeitfenster, in dem zwei Aufnahmen') +
  schnipsel('function stufenVorhanden', '/** Zeichnet Knopf-Abzeichen') +
  schnipsel('/** Der leere Filter.', '/* ═══════════════════════════════════════════════════════════════\n   Kopfzeile des Auktionshauses');

const kontext = { console, App: { auctionsData: [] } };
vm.createContext(kontext);
vm.runInContext(
  block +
    '\nglobalThis.__api = { passtZumFilter, lesePreis, stufeVon, sterneVonAuktion,' +
    ' filterKategorien, filterVerzauberungen, leererAuktionsFilter, anzahlAktiverFilter,' +
    ' auktionsPreis, stufenVorhanden };',
  kontext
);
const {
  passtZumFilter, lesePreis, stufeVon, sterneVonAuktion,
  filterKategorien, filterVerzauberungen, leererAuktionsFilter, anzahlAktiverFilter, stufenVorhanden,
} = kontext.__api;

let fehler = 0;
const pruefe = (b, t, zusatz = '') => {
  console.log(`${b ? '  ok  ' : ' FEHL '} ${t}${zusatz ? '  → ' + zusatz : ''}`);
  if (!b) fehler++;
};

const auktion = (angaben = {}) => ({
  currentBid: 1_000_000,
  item: { displayName: 'Ding', material: 'STONE', ...(angaben.item || {}) },
  ...angaben,
});

const filter = (angaben = {}) => ({ ...leererAuktionsFilter(), ...angaben });

// ── Preis ────────────────────────────────────────────────────

console.log('— Preise lesen —');
pruefe(lesePreis('500k') === 500_000, 'k sind Tausend');
pruefe(lesePreis('50m') === 50_000_000, 'm sind Millionen');
pruefe(lesePreis('50mio') === 50_000_000, 'mio auch');
pruefe(lesePreis('1,5mrd') === 1_500_000_000, 'Komma und mrd', String(lesePreis('1,5mrd')));
pruefe(lesePreis('1.5mrd') === 1_500_000_000, 'Punkt geht genauso');
pruefe(lesePreis(' 50 M ') === 50_000_000, 'Leerzeichen und Großschreibung stören nicht');
pruefe(lesePreis('12345') === 12_345, 'Blanke Zahlen bleiben, wie sie sind');
pruefe(lesePreis('') === null, 'Leer heißt kein Filter');
pruefe(lesePreis('abc') === null, 'Unsinn heißt auch kein Filter');
pruefe(lesePreis(null) === null, 'Und nichts erst recht');

console.log('\n— Preisspanne —');
const zehnMio = auktion({ currentBid: 10_000_000 });
pruefe(passtZumFilter(zehnMio, filter()), 'Ohne Filter kommt alles durch');
pruefe(passtZumFilter(zehnMio, filter({ preisVon: 5_000_000 })), 'Über der Untergrenze');
pruefe(!passtZumFilter(zehnMio, filter({ preisVon: 20_000_000 })), 'Darunter nicht');
pruefe(passtZumFilter(zehnMio, filter({ preisBis: 20_000_000 })), 'Unter der Obergrenze');
pruefe(!passtZumFilter(zehnMio, filter({ preisBis: 5_000_000 })), 'Darüber nicht');
pruefe(
  passtZumFilter(zehnMio, filter({ preisVon: 5_000_000, preisBis: 20_000_000 })),
  'Zwischen beiden'
);
pruefe(
  passtZumFilter(zehnMio, filter({ preisVon: 10_000_000, preisBis: 10_000_000 })),
  'Die Grenzen zählen mit'
);

// Ohne Gebot ist der Startpreis der Preis - sonst fiele jede frische
// Auktion aus jedem Preisfilter heraus.
const ohneGebot = { startBid: 3_000_000, item: { material: 'STONE' } };
pruefe(passtZumFilter(ohneGebot, filter({ preisVon: 2_000_000 })), 'Ohne Gebot zählt das Startgebot');

// ── Verzauberungsstufen ──────────────────────────────────────

console.log('\n— Mindeststufen —');
const picke = auktion({ item: { material: 'NETHERITE_PICKAXE', enchantments: { efficiency: 10, unbreaking: 3 } } });

pruefe(stufeVon(picke.item, 'efficiency') === 10, 'Stufe wird gelesen');
pruefe(stufeVon(picke.item, 'fortune') === 0, 'Fehlende Verzauberung ist Stufe 0');
pruefe(stufeVon({ enchantments: { 'minecraft:efficiency': 7 } }, 'efficiency') === 7, 'Namensraum stört nicht');

pruefe(passtZumFilter(picke, filter({ stufen: { efficiency: 10 } })), 'Genau die Stufe reicht');
pruefe(passtZumFilter(picke, filter({ stufen: { efficiency: 5 } })), 'Mehr als gefordert auch');
pruefe(!passtZumFilter(picke, filter({ stufen: { efficiency: 20 } })), 'Zu wenig fällt raus');
pruefe(!passtZumFilter(picke, filter({ stufen: { fortune: 1 } })), 'Fehlt sie ganz, fällt es raus');
pruefe(
  passtZumFilter(picke, filter({ stufen: { efficiency: 5, unbreaking: 3 } })),
  'Mehrere Stufen gelten zusammen'
);
pruefe(
  !passtZumFilter(picke, filter({ stufen: { efficiency: 5, unbreaking: 9 } })),
  'Eine reicht zum Aussortieren'
);

// ── Kategorien ───────────────────────────────────────────────

console.log('\n— Kategorien —');
const kat = (id) => filterKategorien.find((k) => k.id === id);

pruefe(kat('schuhe').passt({ material: 'NETHERITE_BOOTS' }, {}), 'Stiefel sind Stiefel');
pruefe(!kat('schuhe').passt({ material: 'NETHERITE_HELMET' }, {}), 'Ein Helm nicht');
pruefe(kat('helm').passt({ material: 'DIAMOND_HELMET' }, {}), 'Helme sind Helme');
pruefe(kat('werkzeug').passt({ material: 'NETHERITE_PICKAXE' }, {}), 'Spitzhacke ist Werkzeug');
pruefe(kat('kampf').passt({ material: 'NETHERITE_SWORD' }, {}), 'Schwert ist Kampf');
pruefe(!kat('werkzeug').passt({ material: 'NETHERITE_SWORD' }, {}), 'Und kein Werkzeug');
pruefe(kat('buch').passt({ material: 'ENCHANTED_BOOK' }, {}), 'Verzauberungsbücher');
pruefe(kat('spawnegg').passt({ material: 'ZOMBIE_SPAWN_EGG' }, {}), 'Spawn-Eier');
pruefe(kat('shulker').passt({ material: 'RED_SHULKER_BOX' }, {}), 'Shulker');
pruefe(kat('verzaubert').passt({ enchantments: { mending: 1 } }, {}), 'Verzaubert ist verzaubert');
pruefe(!kat('verzaubert').passt({ material: 'STONE' }, {}), 'Ein Stein nicht');

// Die Sterne stehen im Kategorieschluessel der API, nicht im Namen: Ein
// ★ im Namen ist auf OPSUCHT blosse Zierde ("Normale ★ Hose" ist keine
// Ein-Stern-Karte, davon gibt es im Verlauf 1422 Stueck).
console.log('\n— Sterne aus dem Kategorieschlüssel —');
const karte = (category) => ({ category, item: { displayName: 'Karte', material: 'PAPER' } });
pruefe(sterneVonAuktion(karte('SAMMELKARTE_3_STERN')) === 3, 'Drei Sterne');
pruefe(sterneVonAuktion(karte('BOOSTER_PACK_CARD_5_STARS')) === 5, 'Auch auf Englisch');
pruefe(sterneVonAuktion(karte('SUB_SAMMELKARTE_1_STERN')) === 1, 'Das SUB_ davor stört nicht');
pruefe(sterneVonAuktion(karte('TOOLS_ARMOR')) === 0, 'Ohne Sterne null');
pruefe(sterneVonAuktion({ item: {} }) === 0, 'Und ohne Kategorie auch');
pruefe(!kat('sterne3').passt({ displayName: 'Normale ★ Hose' }, { item: {} }), 'Ein ★ im Namen zählt nicht');
pruefe(kat('sterne3').passt({}, karte('SAMMELKARTE_3_STERN')), 'Die Kategorie greift darauf zu');
pruefe(!kat('sterne3').passt({}, karte('SAMMELKARTE_2_STERN')), 'Zwei sind nicht drei');
pruefe(kat('booster').passt({}, karte('BOOSTER_PACKS')), 'Boosterpacks über den Schlüssel');

console.log('\n— Kategorien wirken als ODER —');
const stiefel = auktion({ item: { material: 'NETHERITE_BOOTS' } });
const helm = auktion({ item: { material: 'NETHERITE_HELMET' } });
const stein = auktion({ item: { material: 'STONE' } });

pruefe(passtZumFilter(stiefel, filter({ kategorien: ['schuhe'] })), 'Eine gewählte Kategorie passt');
pruefe(!passtZumFilter(helm, filter({ kategorien: ['schuhe'] })), 'Eine andere nicht');
pruefe(
  passtZumFilter(helm, filter({ kategorien: ['schuhe', 'helm'] })),
  'Zwei gewählte: eine davon reicht'
);
pruefe(!passtZumFilter(stein, filter({ kategorien: ['schuhe', 'helm'] })), 'Keine davon fällt raus');
pruefe(passtZumFilter(stein, filter({ kategorien: [] })), 'Keine Auswahl heißt alles');

console.log('\n— Und die Abschnitte als UND —');
const teureStiefel = auktion({ currentBid: 900_000_000, item: { material: 'NETHERITE_BOOTS', enchantments: { protection: 10 } } });
pruefe(
  passtZumFilter(teureStiefel, filter({ kategorien: ['schuhe'], preisBis: 1_000_000_000, stufen: { protection: 8 } })),
  'Alles zusammen erfüllt'
);
pruefe(
  !passtZumFilter(teureStiefel, filter({ kategorien: ['schuhe'], preisBis: 100_000_000 })),
  'Nur der Preis reißt es'
);
pruefe(
  !passtZumFilter(teureStiefel, filter({ kategorien: ['helm'], preisBis: 1_000_000_000 })),
  'Nur die Kategorie auch'
);

console.log('\n— Der Zähler auf dem Knopf —');
pruefe(anzahlAktiverFilter(filter()) === 0, 'Leer ist null');
pruefe(anzahlAktiverFilter(filter({ preisVon: 1 })) === 1, 'Preis zählt einmal');
pruefe(anzahlAktiverFilter(filter({ preisVon: 1, preisBis: 2 })) === 1, 'Auch mit beiden Grenzen');
pruefe(anzahlAktiverFilter(filter({ stufen: { a: 1, b: 2 } })) === 2, 'Jede Stufe einzeln');
pruefe(anzahlAktiverFilter(filter({ kategorien: ['helm', 'schuhe'] })) === 1, 'Kategorien zusammen einmal');
pruefe(
  anzahlAktiverFilter(filter({ preisBis: 5, stufen: { a: 1 }, kategorien: ['helm'] })) === 3,
  'Und alles zusammen'
);

// Der Regler laeuft ueber die Stufen, die es gibt, nicht ueber die
// Zahlen dazwischen: Haltbarkeit kommt als 3, 6, 10 und 160 vor. Ueber
// die Zahlen gezogen waeren neun Zehntel des Weges tote Strecke.
console.log('\n— Die Rasten des Reglers —');
kontext.App.auctionsData = [
  { item: { enchantments: { unbreaking: 6 } } },
  { item: { enchantments: { unbreaking: 3 } } },
  { item: { enchantments: { unbreaking: 160 } } },
  { item: { enchantments: { unbreaking: 6, efficiency: 5 } } },
  { item: { material: 'STONE' } },
];
const rasten = stufenVorhanden('unbreaking');
pruefe(rasten.join(',') === '3,6,160', 'Nur vorhandene Stufen, aufsteigend', rasten.join(','));
pruefe(stufenVorhanden('efficiency').join(',') === '5', 'Auch wenn es nur eine gibt');
pruefe(stufenVorhanden('fortune').length === 0, 'Fehlt sie ganz, gibt es keinen Regler');

// Raste n bedeutet Stufe rasten[n-1], Raste 0 bedeutet aus.
pruefe(passtZumFilter({ item: { enchantments: { unbreaking: 6 } } }, filter({ stufen: { unbreaking: rasten[1] } })), 'Raste 2 trifft die 6');
pruefe(!passtZumFilter({ item: { enchantments: { unbreaking: 3 } } }, filter({ stufen: { unbreaking: rasten[1] } })), 'Und nicht die 3');
pruefe(passtZumFilter({ item: { enchantments: { unbreaking: 3 } } }, filter()), 'Raste 0 heißt kein Filter');

kontext.App.auctionsData = [];

console.log('\n— Die Listen selbst —');
pruefe(filterVerzauberungen.length >= 5, 'Verzauberungen stehen zur Wahl', String(filterVerzauberungen.length));
pruefe(
  new Set(filterKategorien.map((k) => k.id)).size === filterKategorien.length,
  'Keine Kategorie-Kennung doppelt'
);
pruefe(
  filterKategorien.every((k) => k.label && k.gruppe && typeof k.passt === 'function'),
  'Jede Kategorie ist vollständig'
);

// ── Gegen die echten Daten ───────────────────────────────────

const pfad = process.argv[2] || process.env.AUKTIONSVERLAUF || '../opsuchtinfo/auction-history.json';
if (!fs.existsSync(pfad)) {
  console.log(`\nOhne Verlauf (${pfad}) bleibt es bei den Beispielen oben.`);
  console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
  process.exit(fehler ? 1 : 0);
}

console.log('\n— Gegen den echten Verlauf —');
const historie = JSON.parse(fs.readFileSync(pfad, 'utf8'));
const items = [];
for (const name in historie) for (const s of historie[name]) if (s.item) items.push(s.item);

// Die Sternkategorien lesen den Kategorieschluessel der API. Den traegt
// nur die Liste der laufenden Auktionen, der Verlauf nicht - dort waeren
// sie zwangslaeufig leer und wuerden hier nichts beweisen.
const ohneSterne = filterKategorien.filter((k) => !/^sterne\d$/.test(k.id));
const leer = [];
for (const k of ohneSterne) {
  const n = items.filter((i) => k.passt(i, {})).length;
  console.log(`       ${k.label.padEnd(22)} ${String(n).padStart(6)}`);
  if (n === 0) leer.push(k.label);
}

// Eine Kategorie, die im ganzen Verlauf nichts trifft, ist im Panel
// unsichtbar (dort zählt der aktuelle Bestand) - aber sie wäre auch nie
// nützlich. Dann ist ihre Regel falsch geschrieben.
pruefe(leer.length === 0, 'Jede Kategorie trifft irgendetwas', leer.join(', ') || 'keine leer');

for (const v of filterVerzauberungen) {
  const n = items.filter((i) => stufeVon(i, v) > 0).length;
  pruefe(n > 0, `${v} kommt wirklich vor`, `${n}x`);
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
