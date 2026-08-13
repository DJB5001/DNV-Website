import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');

// Nur den Varianten-Block aus script.js herausschneiden und ausfuehren,
// damit wirklich der ausgelieferte Code getestet wird und keine Kopie.
const von = quelle.indexOf('function loreAlsText(item)');
const bis = quelle.indexOf('function getMonthlyAveragePerUnit');
if (von < 0 || bis < 0) throw new Error('Varianten-Block nicht gefunden');
const block = quelle.slice(von, bis);

// Der Verlauf liegt im Datenrepo DJB5001/opsuchtinfo. Pfad per Argument
// oder Umgebungsvariable, damit der Test nicht an einem Rechner klebt.
const pfad =
  process.argv[2] ||
  process.env.AUKTIONSVERLAUF ||
  '../opsuchtinfo/auction-history.json';

if (!fs.existsSync(pfad)) {
  console.error(
    `auction-history.json nicht gefunden unter: ${pfad}\n` +
      'Aufruf: node tests/<datei>.mjs <pfad-zu-auction-history.json>\n' +
      'oder:   AUKTIONSVERLAUF=<pfad> node tests/<datei>.mjs'
  );
  process.exit(2);
}

const historie = JSON.parse(fs.readFileSync(pfad, 'utf8'));

const kontext = { App: { auctionHistory: historie }, console };
vm.createContext(kontext);
vm.runInContext(block + '\nglobalThis.__api = { itemVariante, gleicheVariante, verkaeufeZurVariante, variantenLabel };', kontext);
const { itemVariante, verkaeufeZurVariante, variantenLabel } = kontext.__api;

const preis = s => (s.finalPrice ?? s.currentBid ?? s.startBid ?? 0) / (s.item?.amount || 1);
const mittel = a => a.reduce((x, s) => x + preis(s), 0) / a.length;
const fmt = n => Math.round(n).toLocaleString('de-DE');

let fehler = 0;
const pruefe = (bedingung, text) => {
  console.log(`${bedingung ? '  ok  ' : ' FEHL '} ${text}`);
  if (!bedingung) fehler++;
};

// ── 1. Der gemeldete Fall: Bohrer V3 ────────────────────────────────
console.log('\n=== Bohrer V3 ===');
const alleBohrer = historie['Bohrer V3'];
console.log(`Alle 38 Verkäufe zusammen gemittelt (vorher): ${fmt(mittel(alleBohrer))}`);

const karte = alleBohrer.find(s => s.item.material === 'PAPER');
const werkzeug = alleBohrer.find(s => s.item.material === 'NETHERITE_PICKAXE');

const karteVerkaeufe = verkaeufeZurVariante(karte.item);
const werkzeugVerkaeufe = verkaeufeZurVariante(werkzeug.item);

console.log(`Sammelkarte:  n=${karteVerkaeufe.length}  Ø ${fmt(mittel(karteVerkaeufe))}  [${variantenLabel(karte.item)}]`);
console.log(`Werkzeug:     n=${werkzeugVerkaeufe.length}  Ø ${fmt(mittel(werkzeugVerkaeufe))}  [${variantenLabel(werkzeug.item)}]`);

pruefe(karteVerkaeufe.length === 33, 'Sammelkarte hat 33 Verkäufe');
pruefe(karteVerkaeufe.every(s => s.item.material === 'PAPER'), 'kein Werkzeug in der Kartengruppe');
pruefe(werkzeugVerkaeufe.every(s => s.item.material === 'NETHERITE_PICKAXE'), 'keine Karte in der Werkzeuggruppe');
pruefe(mittel(karteVerkaeufe) < 2_000_000, 'Kartendurchschnitt liegt im Kartenbereich');
pruefe(mittel(werkzeugVerkaeufe) > 500_000_000, 'Werkzeugdurchschnitt liegt im Werkzeugbereich');
pruefe(karteVerkaeufe.length + werkzeugVerkaeufe.length <= alleBohrer.length, 'keine Verkäufe doppelt gezählt');

// ── 2. Zustand trennt ebenfalls ─────────────────────────────────────
console.log('\n=== Zustand ===');
const dreiStern = alleBohrer.find(s => (s.item.lore || []).some(l => l.includes('✯✯✯')));
const zweiStern = alleBohrer.find(s => (s.item.lore || []).some(l => l.includes('✯✯✩')));
if (dreiStern && zweiStern) {
  pruefe(itemVariante(dreiStern.item) !== itemVariante(zweiStern.item), '✯✯✯ und ✯✯✩ sind verschiedene Varianten');
  console.log(`  ✯✯✯: ${verkaeufeZurVariante(dreiStern.item).length} Verkäufe · ✯✯✩: ${verkaeufeZurVariante(zweiStern.item).length} Verkäufe`);
}

// ── 3. Trennzeichen im Schlüssel ────────────────────────────────────
console.log('\n=== Schlüssel-Trennung ===');
const a = { material: 'STONE', lore: ['X Y'] };
const b = { material: 'STONE X', lore: ['Y'] };
pruefe(itemVariante(a) !== itemVariante(b), 'Material und Lore können nicht ineinander laufen');

// ── 4. Gesamtbild über alle Namen ───────────────────────────────────
console.log('\n=== Alle Namen ===');
let mehrdeutig = 0, groessteSpreizung = { name: null, faktor: 1 };
for (const [name, verkaeufe] of Object.entries(historie)) {
  const gruppen = new Map();
  for (const s of verkaeufe) {
    if (!s.item) continue;
    const k = itemVariante(s.item);
    if (!gruppen.has(k)) gruppen.set(k, []);
    gruppen.get(k).push(s);
  }
  if (gruppen.size > 1) {
    mehrdeutig++;
    const schnitte = [...gruppen.values()].map(mittel).filter(x => x > 0);
    const faktor = Math.max(...schnitte) / Math.min(...schnitte);
    if (faktor > groessteSpreizung.faktor) groessteSpreizung = { name, faktor, gruppen: gruppen.size };
  }
}
console.log(`Namen mit mehr als einer Variante: ${mehrdeutig} von ${Object.keys(historie).length}`);
console.log(`Größte Preisspreizung: ${groessteSpreizung.name} — Faktor ${Math.round(groessteSpreizung.faktor).toLocaleString('de-DE')} über ${groessteSpreizung.gruppen} Varianten`);

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} Prüfung(en) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
