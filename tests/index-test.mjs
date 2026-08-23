import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');

const schnipsel = (von, bis) => {
  const a = quelle.indexOf(von);
  const b = quelle.indexOf(bis);
  if (a < 0 || b < 0) throw new Error(`nicht gefunden: ${von} / ${bis}`);
  return quelle.slice(a, b);
};

// materialLesbar steht im Bild-Abschnitt weiter oben und die
// Verzauberungsnamen im Anzeige-Abschnitt; variantenLabel braucht beides.
const block =
  schnipsel('const verzauberungsNamen = {', '// Rückfallbild, wenn auch das Typ-Bild') +
  schnipsel('// NETHERITE_PICKAXE wird zu', '// Rückfallkette für Item-Bilder') +
  schnipsel('function loreAlsText(item)', 'function getMonthlyAveragePerUnit') +
  // Der Index merkt sich sein Ergebnis; die Bindungen dafür stehen
  // oben in der Datei bei den anderen, die aus Funktionen heraus
  // benutzt werden.
  schnipsel('let itemIndexCache = null;', '/* Ruft fn erst,') +
  schnipsel('/** Wirft Index und Durchschnitte weg', 'function renderItemSearch()');

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

const kontext = { App: { auctionHistory: historie, auctionsData: [] }, console };
vm.createContext(kontext);
vm.runInContext(block + '\nglobalThis.__api = { buildItemIndex, itemVariante, variantenLabel };', kontext);
const { buildItemIndex } = kontext.__api;

const index = buildItemIndex();
const eintraege = Object.values(index);

let fehler = 0;
const pruefe = (b, t) => { console.log(`${b ? '  ok  ' : ' FEHL '} ${t}`); if (!b) fehler++; };

console.log(`Einträge im Index: ${eintraege.length}`);

// Bohrer V3 muss jetzt ZWEI Einträge haben
const bohrer = eintraege.filter(e => e.name === 'Bohrer V3');
console.log('\n=== Bohrer V3 im Index ===');
bohrer.forEach(e => console.log(`  ${e.item.material.padEnd(20)} label="${e.label}"  verkauft=${e.soldCount}`));

// Mindestens drei: die Sammelkarte plus zwei Zustandsstufen der
// Spitzhacke. Keine feste Zahl, weil die Verzauberungen mittlerweile
// mittrennen und der Verlauf wächst — geprüft wird, dass getrennt wird,
// nicht wie oft.
pruefe(bohrer.length >= 3, `Bohrer V3 erscheint als getrennte Einträge (${bohrer.length})`);
pruefe(
  new Set(bohrer.map(e => e.item.material)).size === 2,
  'Sammelkarte (Papier) und Werkzeug (Netherit) sind getrennt'
);
pruefe(
  bohrer.some(e => e.label.startsWith('Sammelkarte')),
  'eine Variante ist als Sammelkarte beschriftet'
);

// Jede Ausführung muss ein eigenes Etikett tragen, sonst stehen im
// Auswahlmenü zwei gleich benannte Zeilen mit verschiedenen Preisen.
const etiketten = bohrer.map(e => e.label);
pruefe(
  new Set(etiketten).size === etiketten.length,
  'keine zwei Ausführungen heißen gleich'
);
pruefe(
  bohrer.filter(e => e.item.material === 'NETHERITE_PICKAXE')
    .every(e => /Effizienz|Haltbarkeit|Reparatur/.test(e.label)),
  'die Werkzeuge nennen ihre Verzauberungen'
);
pruefe(bohrer.every(e => e.soldCount > 0), 'beide Varianten haben eigene Verkaufszahlen');
pruefe(
  bohrer.reduce((s, e) => s + e.soldCount, 0) <= historie['Bohrer V3'].length,
  'die Verkäufe summieren sich nicht über den Bestand hinaus'
);

// Jeder Schluessel muss eindeutig sein und die Zaehler muessen aufgehen
const namen = new Set(eintraege.map(e => e.name));
console.log(`\nNamen: ${namen.size} · Einträge: ${eintraege.length} · zusätzliche Varianten: ${eintraege.length - namen.size}`);
pruefe(eintraege.length > namen.size, 'es gibt mehr Einträge als Namen (Varianten sind getrennt)');
pruefe(eintraege.every(e => e.schluessel && e.name && e.item), 'jeder Eintrag hat Schlüssel, Name und Item');

const summeIndex = eintraege.reduce((s, e) => s + e.soldCount, 0);
const summeRoh = Object.values(historie).reduce((s, v) => s + v.filter(x => x.item).length, 0);
console.log(`Verkäufe im Index: ${summeIndex.toLocaleString('de-DE')} · im Verlauf: ${summeRoh.toLocaleString('de-DE')}`);
pruefe(summeIndex === summeRoh, 'kein Verkauf ist beim Aufteilen verloren gegangen');

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} Prüfung(en) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
