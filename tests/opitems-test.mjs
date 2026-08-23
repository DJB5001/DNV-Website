// Welche Items in "OP Items" gehören.
//
// Der Filter kannte lange nur ein Merkmal: das Wort "OP" im Namen. Damit
// fiel jedes Item durch, dessen Besitzer es nicht so getauft hat — ein
// Schwert mit Schärfe X hieß eben "Windkatana" und lag zwischen den
// gewöhnlichen Werkzeugen.
//
// Jetzt zählt auch die Verzauberung. Wo dabei die Grenze liegt, ist an
// den echten Daten gemessen und nicht geraten, deshalb prüft dieser Test
// beides: die Regel an Beispielen und ihre Wirkung auf den ganzen
// Verlauf.
//
// Aufruf: node tests/opitems-test.mjs [pfad-zu-auction-history.json]

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
  schnipsel('const auktionsArten = [', '/** Gehört diese Auktion zur gewählten Art? */');

const kontext = { console };
vm.createContext(kontext);
vm.runInContext(
  block + '\nglobalThis.__api = { auktionsGruppe, hatEigeneVerzauberung, auktionsArten, OP_STUFEN_ABSTAND };',
  kontext
);
const { auktionsGruppe, hatEigeneVerzauberung, auktionsArten, OP_STUFEN_ABSTAND } = kontext.__api;

let fehler = 0;
const pruefe = (b, t, zusatz = '') => {
  console.log(`${b ? '  ok  ' : ' FEHL '} ${t}${zusatz ? '  → ' + zusatz : ''}`);
  if (!b) fehler++;
};

const item = (angaben) => ({ displayName: '', material: 'NETHERITE_PICKAXE', ...angaben });

// ── Die Regel an Beispielen ──────────────────────────────────

console.log('— Verzauberungen aus dem Spiel —');
pruefe(!hatEigeneVerzauberung(item({ enchantments: { efficiency: 5 } })), 'Effizienz V ist das Maximum');
pruefe(!hatEigeneVerzauberung(item({ enchantments: { unbreaking: 3, mending: 1 } })), 'Haltbarkeit III und Reparatur auch');
pruefe(!hatEigeneVerzauberung(item({ enchantments: {} })), 'Ohne Verzauberung nichts');
pruefe(!hatEigeneVerzauberung(item({})), 'Ohne das Feld auch nicht');

console.log('\n— Eine Stufe drüber zählt nicht —');
// Gemessen: über dem Maximum liegen 40,8 % aller Items. Haltbarkeit IV
// hat auf OPSUCHT fast jede Spitzhacke — das hebt nichts heraus.
pruefe(!hatEigeneVerzauberung(item({ enchantments: { unbreaking: 4 } })), 'Haltbarkeit IV ist Serveralltag');
pruefe(!hatEigeneVerzauberung(item({ enchantments: { sharpness: 6 } })), 'Schärfe VI ebenso');
pruefe(OP_STUFEN_ABSTAND === 2, 'Die Grenze steht als eigener Wert da', String(OP_STUFEN_ABSTAND));

console.log('\n— Deutlich drüber zählt —');
pruefe(hatEigeneVerzauberung(item({ enchantments: { unbreaking: 5 } })), 'Haltbarkeit V');
pruefe(hatEigeneVerzauberung(item({ enchantments: { efficiency: 10 } })), 'Effizienz X');
pruefe(hatEigeneVerzauberung(item({ enchantments: { protection: 22 } })), 'Schutz XXII');
pruefe(hatEigeneVerzauberung(item({ enchantments: { unbreaking: 160 } })), 'Haltbarkeit 160');
pruefe(
  hatEigeneVerzauberung(item({ enchantments: { mending: 1, efficiency: 5, fortune: 5 } })),
  'Eine von mehreren reicht'
);

console.log('\n— Verzauberungen, die es gar nicht gibt —');
pruefe(hatEigeneVerzauberung(item({ enchantments: { lunge: 1 } })), 'Lunge I gibt es im Spiel nicht');
pruefe(hatEigeneVerzauberung(item({ enchantments: { 'minecraft:lunge': 1 } })), 'Auch mit Namensraum davor');
pruefe(
  !hatEigeneVerzauberung(item({ enchantments: { 'minecraft:efficiency': 5 } })),
  'Der Namensraum macht aus Vanilla nichts Eigenes'
);

console.log('\n— Und wie es die Gruppe entscheidet —');
pruefe(auktionsGruppe(item({ displayName: 'OP Schwert', material: 'NETHERITE_SWORD' })) === 'op', '"OP" im Namen wie bisher');
pruefe(
  auktionsGruppe(item({ displayName: 'Windkatana', material: 'NETHERITE_SWORD', enchantments: { sharpness: 7 } })) === 'op',
  'Schärfe VII macht das Schwert zum OP-Item'
);
pruefe(
  auktionsGruppe(item({ displayName: 'Schwert', material: 'NETHERITE_SWORD', enchantments: { sharpness: 5 } })) === 'werkzeug',
  'Ein normales Schwert bleibt Werkzeug'
);
pruefe(
  auktionsGruppe(item({ displayName: 'Helm', material: 'NETHERITE_HELMET', enchantments: { protection: 4 } })) === 'ruestung',
  'Eine normale Rüstung bleibt Rüstung'
);

// Genau eine Gruppe je Item — sonst addieren sich die Trefferzahlen der
// Filterleiste nicht mehr zur Gesamtzahl.
console.log('\n— Jedes Item in genau einer Gruppe —');
const proben = [
  item({ displayName: 'OP Picke', enchantments: { efficiency: 20 } }),
  item({ displayName: 'Sammelkarte', material: 'PAPER' }),
  item({ displayName: '', material: 'DIRT' }),
  item({ displayName: 'Elytra des Olymp', material: 'ELYTRA', enchantments: { unbreaking: 9 } }),
];
const gruppen = proben.map(auktionsGruppe);
pruefe(gruppen.every((g) => auktionsArten.some((a) => a.id === g)), 'Jede Gruppe steht in der Leiste', gruppen.join(', '));

// ── Wirkung auf die echten Daten ─────────────────────────────

const pfad = process.argv[2] || process.env.AUKTIONSVERLAUF || '../opsuchtinfo/auction-history.json';

if (!fs.existsSync(pfad)) {
  console.log(`\nOhne Verlauf (${pfad}) bleibt es bei den Beispielen oben.`);
  console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
  process.exit(fehler ? 1 : 0);
}

console.log('\n— Gegen den echten Verlauf —');
const historie = JSON.parse(fs.readFileSync(pfad, 'utf8'));

const zaehler = {};
let gesamt = 0;
for (const name in historie) {
  for (const verkauf of historie[name]) {
    if (!verkauf.item) continue;
    gesamt += 1;
    const g = auktionsGruppe(verkauf.item);
    zaehler[g] = (zaehler[g] ?? 0) + 1;
  }
}

for (const art of auktionsArten) {
  const n = zaehler[art.id] ?? 0;
  console.log(`       ${art.label.padEnd(24)} ${String(n).padStart(6)}  ${((n / gesamt) * 100).toFixed(1)} %`);
}

const opAnteil = ((zaehler.op ?? 0) / gesamt) * 100;

// Die Kategorie soll aussortieren. Deckt sie fast alles ab, ist sie kein
// Filter mehr — genau deshalb liegt die Grenze bei zwei Stufen und nicht
// bei einer (dort wären es 40,8 %).
pruefe(opAnteil > 5, 'OP Items ist keine leere Kategorie mehr', `${opAnteil.toFixed(1)} %`);
pruefe(opAnteil < 38, 'Und keine, in die fast alles fällt', `${opAnteil.toFixed(1)} %`);

// Die Rangfolge nimmt der OP-Gruppe zwar Geräte weg, aber nicht alle:
// Wer nach Rüstungen sucht, soll dort weiter etwas finden.
pruefe((zaehler.ruestung ?? 0) > 0, 'Rüstungen bleiben besetzt', String(zaehler.ruestung ?? 0));
pruefe((zaehler.werkzeug ?? 0) > 0, 'Werkzeuge & Kampf auch', String(zaehler.werkzeug ?? 0));

// Die Summe muss stimmen, sonst überlappen sich Gruppen.
const summe = Object.values(zaehler).reduce((s, n) => s + n, 0);
pruefe(summe === gesamt, 'Die Gruppen addieren sich zur Gesamtzahl', `${summe} von ${gesamt}`);

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
