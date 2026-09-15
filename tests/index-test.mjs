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

// ── Der gemeldete Fall: XP Talisman ─────────────────────────────────
//
// Stand zweimal da, beide Male als "Jackpot". Dasselbe Item — OPSucht
// hat Ende August "(Off-Hand)" in den Effekttext geschrieben, und
// Exemplare aus Kisten behielten den alten. Beide Texte laufen weiter
// nebeneinander, also muss der Schlüssel darüber hinwegsehen.
console.log('\n=== XP Talisman ===');
const talisman = eintraege.filter(e => e.name === 'XP Talisman');
talisman.forEach(e => console.log(`  label="${e.label}"  verkauft=${e.soldCount}`));
pruefe(talisman.length === 1, 'XP Talisman steht nur noch einmal da');

// ── Und die Gegenprobe: Doppelgänger, die keine sind ────────────────
//
// Der Yamakuza Roller hat zwölf Ausführungen von +60 % bis +180 %
// Geschwindigkeit, mit Schnitten von 4,5 bis 155 Mio. Die dürfen nicht
// zusammen — aber sie dürfen auch nicht alle "Golden Horse Armor"
// heißen, sonst kauft man blind. Genau dafür läuft in buildItemIndex()
// jetzt der Etiketten-Unterscheider, den es dort vorher nicht gab.
console.log('\n=== Yamakuza Roller ===');
const roller = eintraege.filter(e => e.name === 'Yamakuza Roller');
roller.slice(0, 4).forEach(e => console.log(`  label="${e.label.slice(0, 70)}"  verkauft=${e.soldCount}`));
pruefe(roller.length > 1, 'verschiedene Effektstärken bleiben getrennte Einträge');
pruefe(
  new Set(roller.map(e => e.label)).size > 1,
  'und tragen nicht alle dasselbe Etikett'
);
pruefe(
  roller.some(e => /\+60%/.test(e.label)) && roller.some(e => /\+180%/.test(e.label)),
  'die Effektstärke steht im Etikett'
);

// Allgemein: Wie viele Einträge sind unter ihrem Namen noch
// ununterscheidbar?
//
// Null wird es nie. Manche Ausführungen trennt nur eine Spielersignatur
// oder ein doppelt geliefertes Textstück — das fasst kein Etikett, das
// noch in ein Auswahlmenü passt. Gemessen am echten Verlauf waren es
// vorher 968 von 5.639, jetzt 403 von 5.632. Die Schwelle hier hält
// fest, dass es nicht wieder in Richtung des alten Standes rutscht.
const nachName = new Map();
for (const e of eintraege) {
  const k = `${e.name} :: ${e.label}`;
  nachName.set(k, (nachName.get(k) ?? 0) + 1);
}
let ununterscheidbar = 0;
for (const c of nachName.values()) if (c > 1) ununterscheidbar += c;
console.log(`\nEinträge mit gleichem Namen und gleichem Etikett: ${ununterscheidbar} von ${eintraege.length}`);
pruefe(ununterscheidbar < 500, 'deutlich weniger ununterscheidbare Einträge als die 968 von vorher');

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} Prüfung(en) fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
