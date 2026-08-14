// Prüft die Bildquellen für Item-Typen gegen den echten Verlauf.
//
// Ohne Argument werden nur die erzeugten Adressen geprüft (schnell).
// Mit --abrufen wird jede Adresse tatsächlich abgerufen — das dauert
// einige Minuten, belegt aber, wie viel wirklich abgedeckt ist.
//
//   node tests/bilder-test.mjs <pfad-zu-auction-history.json> [--abrufen]

import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');

// Zwei getrennte Stücke: Die Konstanten stehen am Dateianfang, die
// Funktionen weiter unten. Alles dazwischen (App, localStorage …) darf
// nicht mitkommen.
const stueck = (von, bis) => {
  const a = quelle.indexOf(von);
  const b = quelle.indexOf(bis);
  if (a < 0 || b < 0) throw new Error(`nicht gefunden: ${von}`);
  return quelle.slice(a, b);
};

const block =
  stueck('// Rückfallbild, wenn auch das Typ-Bild', 'const App = {') +
  stueck('// Kandidaten für das Bild eines Item-Typs', 'function getAuctionCategoryKey');

const argumente = process.argv.slice(2);
const abrufen = argumente.includes('--abrufen');
const pfad =
  argumente.find(a => !a.startsWith('--')) ||
  process.env.AUKTIONSVERLAUF ||
  '../opsuchtinfo/auction-history.json';

if (!fs.existsSync(pfad)) {
  console.error(`auction-history.json nicht gefunden unter: ${pfad}`);
  process.exit(2);
}

const kontext = { console };
vm.createContext(kontext);
vm.runInContext(config, kontext);
vm.runInContext(
  block + '\nglobalThis.__api = { materialBildKandidaten, materialLesbar, BARRIER_BILD };',
  kontext
);
const { materialBildKandidaten, materialLesbar } = kontext.__api;

const historie = JSON.parse(fs.readFileSync(pfad, 'utf8'));

let fehler = 0;
const pruefe = (bed, t, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${t}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehler++;
};

// ── Namensbildung ────────────────────────────────────────────────────
console.log('=== Erzeugte Adressen ===');
for (const m of ['NETHERITE_PICKAXE', 'TOTEM_OF_UNDYING', 'ZOMBIE_SPAWN_EGG', 'TNT']) {
  const k = materialBildKandidaten(m);
  console.log(`  ${m.padEnd(20)} ${k.map(x => x.split('/').pop()).join('  →  ')}`);
}

pruefe(
  materialBildKandidaten('TOTEM_OF_UNDYING')[0].endsWith('Totem_of_Undying.png'),
  'kleine Wörter bleiben im Wiki-Namen klein'
);
pruefe(
  materialBildKandidaten('ZOMBIE_SPAWN_EGG').some(x => x.endsWith('item/spawn_egg.png')),
  'Spawn-Eier bekommen die gemeinsame Textur'
);
pruefe(materialBildKandidaten(undefined).length === 0, 'ohne Material keine Adressen');
pruefe(materialLesbar('OAK_LOG') === 'Oak Log', 'Materialname wird lesbar');

// ── Materialien im echten Bestand ────────────────────────────────────
const haeufig = new Map();
for (const verkaeufe of Object.values(historie)) {
  for (const s of verkaeufe) {
    const m = s.item?.material;
    if (m) haeufig.set(m, (haeufig.get(m) || 0) + 1);
  }
}
const gesamtItems = [...haeufig.values()].reduce((a, b) => a + b, 0);
console.log(`\n=== ${haeufig.size} Materialien, ${gesamtItems.toLocaleString('de-DE')} Items ===`);

const auffaellig = [...haeufig.keys()]
  .flatMap(m => materialBildKandidaten(m))
  .filter(u => /\s|__|\/\.png|[^\x20-\x7e]/.test(u));
pruefe(auffaellig.length === 0, 'keine kaputt aussehenden Adressen', String(auffaellig.length));
pruefe(
  [...haeufig.keys()].every(m => materialBildKandidaten(m).length >= 3),
  'jedes Material bekommt die volle Kette'
);

// ── Optional: wirklich abrufen ───────────────────────────────────────
if (abrufen) {
  console.log('\n=== Abruf (dauert einige Minuten) ===');
  const treffer = [];
  const daneben = [];
  const materialien = [...haeufig.entries()].sort((a, b) => b[1] - a[1]);
  const WELLE = 12;

  for (let i = 0; i < materialien.length; i += WELLE) {
    await Promise.all(
      materialien.slice(i, i + WELLE).map(async ([mat, anzahl]) => {
        // Das Wiki ist aus vielen Umgebungen nicht erreichbar, deshalb
        // zählt hier nur, was die Spieltexturen abdecken.
        const texturen = materialBildKandidaten(mat).filter(u => u.includes('/textures/'));
        for (const u of texturen) {
          try {
            if ((await fetch(u, { method: 'HEAD' })).ok) return treffer.push({ mat, anzahl });
          } catch {
            /* nächste Stufe */
          }
        }
        daneben.push({ mat, anzahl });
      })
    );
    process.stdout.write(`\r  ${Math.min(i + WELLE, materialien.length)}/${materialien.length}`);
  }

  const abgedeckt = treffer.reduce((s, e) => s + e.anzahl, 0);
  const quote = (abgedeckt / gesamtItems) * 100;
  console.log(
    `\n  Spieltexturen decken ${abgedeckt.toLocaleString('de-DE')}/${gesamtItems.toLocaleString('de-DE')} Items ab = ${quote.toFixed(1)} %`
  );
  console.log('  Ohne Textur (häufigste):');
  daneben
    .sort((a, b) => b.anzahl - a.anzahl)
    .slice(0, 10)
    .forEach(e => console.log(`    ${String(e.anzahl).padStart(5)}×  ${e.mat}`));

  pruefe(quote > 85, 'Spieltexturen decken über 85 % der Items ab', `${quote.toFixed(1)} %`);
} else {
  console.log('\n(Abruf übersprungen — mit --abrufen wirklich prüfen)');
}

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
