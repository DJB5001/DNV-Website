// Prüft die tiefen Links: #item=… und #spieler=…
//
// Der Knopf unter /wert und /spieler im Discord zeigt darauf. Die Adresse
// baut der Bot (DNV-Bot/src/marktdaten.js), gelesen wird sie hier — zwei
// Seiten, die zeichengleich sein müssen. Deshalb prüft dieser Test beide
// gegeneinander: Er schneidet den echten Code der Website heraus und baut
// die Adressen mit demselben Verfahren wie der Bot.
//
// Aufruf:
//   node tests/tieferlink-test.mjs
//   node tests/tieferlink-test.mjs <pfad-zu-auction-history.json>

import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');

const schnipsel = (von, bis) => {
  const a = quelle.indexOf(von);
  const b = quelle.indexOf(bis);
  if (a < 0 || b < 0) throw new Error(`Block nicht gefunden: ${von}`);
  return quelle.slice(a, b);
};

const block =
  schnipsel('const verzauberungsNamen = {', '// Rückfallbild, wenn auch das Typ-Bild') +
  schnipsel('// NETHERITE_PICKAXE wird zu', '// Rückfallkette für Item-Bilder') +
  schnipsel('function loreAlsText(item)', 'function getMonthlyAveragePerUnit') +
  schnipsel('function buildItemIndex()', 'function renderItemSearch()') +
  schnipsel('function tieferLink()', 'async function folgeTiefemLink()');

let fehler = 0;
const pruefe = (label, bedingung, zusatz = '') => {
  console.log(`${bedingung ? '  ok  ' : ' FEHL '} ${label}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bedingung) fehler += 1;
};

// Eine Adresse, wie der Bot sie baut. Muss zu itemLink()/spielerLink() in
// DNV-Bot/src/marktdaten.js passen - dieselben Namen, dieselbe Kodierung.
function botItemLink(name, eintrag = {}) {
  const teile = [`item=${encodeURIComponent(name)}`];
  if (eintrag.m) teile.push(`m=${encodeURIComponent(eintrag.m)}`);
  if (typeof eintrag.e === 'string') teile.push(`e=${encodeURIComponent(eintrag.e)}`);
  return `#${teile.join('&')}`;
}
const botSpielerLink = (uuid) => `#spieler=${encodeURIComponent(uuid)}`;

const kontext = {
  console,
  App: { auctionHistory: {}, auctionsData: [] },
  URLSearchParams,
  document: { getElementById: () => null },
  window: { location: { hash: '' } },
};
vm.createContext(kontext);
vm.runInContext(
  block +
    '\nglobalThis.__api = { tieferLink, schluesselZuItem, buildItemIndex, verzauberungsStempel, itemVariante };',
  kontext
);
const web = kontext.__api;

const mitHash = (hash) => {
  kontext.window.location.hash = hash;
  return web.tieferLink();
};

// ── 1. Die Adresse lesen ────────────────────────────────────────────
console.log('— Adressen lesen —');

const bohrer = mitHash(botItemLink('Bohrer V3', { m: 'NETHERITE_PICKAXE', e: 'efficiency=5,mending=1' }));
pruefe('Der Name kommt heil an', bohrer?.item === 'Bohrer V3', bohrer?.item);
pruefe('Das Material auch', bohrer?.material === 'NETHERITE_PICKAXE', bohrer?.material);
pruefe('Und die Verzauberungen mit ihren Gleichheitszeichen',
  bohrer?.verzauberungen === 'efficiency=5,mending=1', bohrer?.verzauberungen);

const stern = mitHash(botItemLink('Normaler ★ Helm', { m: 'NETHERITE_HELMET', e: '' }));
pruefe('Sonderzeichen im Namen überleben', stern?.item === 'Normaler ★ Helm', stern?.item);
pruefe('Ein leerer Stempel bleibt leer und wird nicht null',
  stern?.verzauberungen === '', JSON.stringify(stern?.verzauberungen));

const alt = mitHash(botItemLink('Altes Item', { m: 'STONE' }));
pruefe('Fehlt der Stempel, ist er null', alt?.verzauberungen === null,
  JSON.stringify(alt?.verzauberungen));

const spieler = mitHash(botSpielerLink('00000000-0000-0000-0009-01fb840db809'));
pruefe('Spieler-UUID kommt an', spieler?.spieler === '00000000-0000-0000-0009-01fb840db809',
  spieler?.spieler);
pruefe('Und wird nicht als Item gelesen', spieler?.item === null);

// Gewöhnliche Anker dürfen nicht als tiefer Link durchgehen, sonst
// entführt #benachrichtigungen die Seite in den Item-Reiter.
pruefe('#benachrichtigungen bleibt unberührt', mitHash('#benachrichtigungen') === null);
pruefe('Leerer Hash ebenso', mitHash('') === null);
pruefe('Unbekannte Angaben werden ignoriert', mitHash('#irgendwas=1') === null);

// ── 2. Die richtige Ausführung finden ───────────────────────────────
console.log('\n— Die richtige Ausführung —');

const verkauf = (o) => ({
  seller: o.seller ?? 'v1',
  highestBidder: 'k1',
  finalPrice: o.preis,
  currentBid: o.preis,
  soldAt: new Date(Date.now() - (o.vorTagen ?? 1) * 86400000).toISOString(),
  bids: { k1: o.preis },
  item: {
    material: o.material,
    displayName: o.name,
    amount: 1,
    lore: o.lore ?? [],
    enchantments: o.ench ?? {},
  },
});

const schlicht = { 'minecraft:efficiency': 5, 'minecraft:unbreaking': 6 };
const stark = { 'minecraft:efficiency': 6, 'minecraft:fortune': 4 };

// Drei Ausführungen: Papierkarte, schlichte Hacke (häufig), starke Hacke.
kontext.App.auctionHistory = {
  'Bohrer V3': [
    verkauf({ name: 'Bohrer V3', material: 'PAPER', preis: 590_000, lore: ['', 'Gewinntyp » Sammelkarte'] }),
    verkauf({ name: 'Bohrer V3', material: 'NETHERITE_PICKAXE', preis: 200_000, ench: schlicht }),
    verkauf({ name: 'Bohrer V3', material: 'NETHERITE_PICKAXE', preis: 210_000, ench: schlicht, vorTagen: 2 }),
    verkauf({ name: 'Bohrer V3', material: 'NETHERITE_PICKAXE', preis: 5_500_000, ench: stark, vorTagen: 3 }),
  ],
};

const index = web.buildItemIndex();
const nachSchluessel = (s) => index[s];

const stempelSchlicht = 'efficiency=5,unbreaking=6';
const stempelStark = 'efficiency=6,fortune=4';

const genau = web.schluesselZuItem('Bohrer V3', 'NETHERITE_PICKAXE', stempelStark);
pruefe('Die starke Ausführung wird genau getroffen',
  web.verzauberungsStempel(nachSchluessel(genau)?.item) === stempelStark,
  web.verzauberungsStempel(nachSchluessel(genau)?.item));

const schlichtTreffer = web.schluesselZuItem('Bohrer V3', 'NETHERITE_PICKAXE', stempelSchlicht);
pruefe('Und die schlichte ebenso',
  web.verzauberungsStempel(nachSchluessel(schlichtTreffer)?.item) === stempelSchlicht,
  web.verzauberungsStempel(nachSchluessel(schlichtTreffer)?.item));
pruefe('Es sind wirklich zwei verschiedene', genau !== schlichtTreffer);

const karte = web.schluesselZuItem('Bohrer V3', 'PAPER', '');
pruefe('Die Papierkarte über ihr Material', nachSchluessel(karte)?.item.material === 'PAPER',
  nachSchluessel(karte)?.item.material);

// Ohne Angaben oder mit unbekannten: lieber die häufigste als nichts.
const ohne = web.schluesselZuItem('Bohrer V3', null, null);
pruefe('Ohne Angaben die meistgehandelte',
  nachSchluessel(ohne)?.soldCount === 2, `${nachSchluessel(ohne)?.soldCount} Verkäufe`);

const unbekannt = web.schluesselZuItem('Bohrer V3', 'NETHERITE_PICKAXE', 'gibtesnicht=9');
pruefe('Unbekannte Verzauberung fällt auf die häufigste des Materials zurück',
  nachSchluessel(unbekannt)?.item.material === 'NETHERITE_PICKAXE' &&
    nachSchluessel(unbekannt)?.soldCount === 2,
  `${nachSchluessel(unbekannt)?.soldCount}`);

const falschesMaterial = web.schluesselZuItem('Bohrer V3', 'DIAMOND_HOE', null);
pruefe('Falsches Material fällt auf den Namen zurück, statt nichts zu liefern',
  Boolean(falschesMaterial), String(falschesMaterial));

pruefe('Ein unbekannter Name ergibt null',
  web.schluesselZuItem('Gibt Es Nicht', null, null) === null);

// ── 3. Beide Seiten zusammen ────────────────────────────────────────
console.log('\n— Bot-Adresse bis zur Ausführung —');

// Der ganze Weg: Der Bot kennt Name, Material und Stempel aus dem
// Wert-Index und baut die Adresse. Die Website muss daraus genau die
// Ausführung finden, über die im Discord geredet wurde.
for (const [was, stempel] of [['schlicht', stempelSchlicht], ['stark', stempelStark]]) {
  const ziel = mitHash(botItemLink('Bohrer V3', { m: 'NETHERITE_PICKAXE', e: stempel }));
  const s = web.schluesselZuItem(ziel.item, ziel.material, ziel.verzauberungen);
  pruefe(`Adresse der ${was} verzauberten Hacke landet richtig`,
    web.verzauberungsStempel(nachSchluessel(s)?.item) === stempel,
    web.verzauberungsStempel(nachSchluessel(s)?.item));
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
