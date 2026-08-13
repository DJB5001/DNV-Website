import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');
const config = fs.readFileSync(new URL('../js/config.js', import.meta.url), 'utf8');

const von = quelle.indexOf('// Rückfallbild, wenn auch das Typ-Bild');
const bis = quelle.indexOf('function getAuctionCategoryKey');
const block = quelle.slice(von, bis);

const kontext = { console };
vm.createContext(kontext);
vm.runInContext(config, kontext);
vm.runInContext(block + '\nglobalThis.__api = { materialBildUrl, getAuctionItemIcon, BARRIER_BILD };', kontext);
const { materialBildUrl, getAuctionItemIcon, BARRIER_BILD } = kontext.__api;

// Der Verlauf liegt im Datenrepo DJB5001/opsuchtinfo. Pfad per Argument
// oder Umgebungsvariable, damit der Test nicht an einem Rechner klebt.
const pfad =
  process.argv[2] ||
  process.env.AUKTIONSVERLAUF ||
  '../opsuchtinfo/auction-history.json';

if (!fs.existsSync(pfad)) {
  console.error(
    `auction-history.json nicht gefunden unter: ${pfad}\n` +
      'Aufruf: node tests/bilder-test.mjs <pfad-zu-auction-history.json>'
  );
  process.exit(2);
}

const historie = JSON.parse(fs.readFileSync(pfad, 'utf8'));

// ── Namensbildung stichprobenartig ansehen ──────────────────────────
console.log('=== Materialname → Dateiname ===');
for (const m of ['NETHERITE_PICKAXE', 'PAPER', 'GOLDEN_HORSE_ARMOR', 'TOTEM_OF_UNDYING',
                 'VAULT', 'PLAYER_HEAD', 'IRON_BOOTS', 'DIAMOND_SWORD']) {
  console.log(`  ${m.padEnd(22)} → ${materialBildUrl(m).split('/').pop()}`);
}

// ── Wirkung auf den echten Bestand ──────────────────────────────────
const alleItems = [];
for (const verkaeufe of Object.values(historie)) {
  for (const s of verkaeufe) if (s.item) alleItems.push(s.item);
}

let barrier = 0, typBild = 0, eigenes = 0;
const materialien = new Map();
for (const it of alleItems) {
  const url = getAuctionItemIcon(it);
  if (url === BARRIER_BILD) barrier++;
  else if (url === materialBildUrl(it.material)) {
    typBild++;
    materialien.set(it.material, (materialien.get(it.material) || 0) + 1);
  } else eigenes++;
}

const gesamt = alleItems.length;
console.log(`\n=== ${gesamt.toLocaleString('de-DE')} Items im Verlauf ===`);
console.log(`  eigenes Bild (Konfiguration/API): ${eigenes.toLocaleString('de-DE').padStart(7)}  ${(eigenes / gesamt * 100).toFixed(1)}%`);
console.log(`  Typ-Bild (NEU statt Verbotsschild): ${typBild.toLocaleString('de-DE').padStart(6)}  ${(typBild / gesamt * 100).toFixed(1)}%`);
console.log(`  Verbotsschild übrig:              ${barrier.toLocaleString('de-DE').padStart(7)}  ${(barrier / gesamt * 100).toFixed(1)}%`);

console.log('\n=== Häufigste Typen, die jetzt ein Bild bekommen ===');
[...materialien.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
  .forEach(([m, n]) => console.log(`  ${String(n).padStart(6)}×  ${m.padEnd(24)} → ${materialBildUrl(m).split('/').pop()}`));

// ── Auffälligkeiten in der Namensbildung ────────────────────────────
const verdaechtig = [...materialien.keys()]
  .map(m => materialBildUrl(m).split('/').pop())
  .filter(n => /__|^_|_\.png|[^A-Za-z0-9_.]/.test(n));
console.log('\nAuffällige Dateinamen:', verdaechtig.length ? verdaechtig : 'keine');
