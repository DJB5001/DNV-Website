// Prüft das automatische Nachladen.
//
// Die interessante Hälfte ist das Nichtstun. Eine Seite, die sich alle
// zwei Minuten neu aufbaut, verliert die Bildlaufstelle, die Seitenzahl
// und die Karte, auf die gerade jemand zielt. Geprüft wird deshalb
// vor allem, dass bei unveränderten Daten **nichts** passiert — und
// dass die teure Datei gar nicht erst geholt wird, wenn eine
// HEAD-Anfrage schon sagt, dass sie dieselbe ist.
//
// Voraussetzungen: Playwright, und die Seite muss ausgeliefert werden:
//   npx http-server . -p 8123     (abweichender Port über PORT=...)

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  try {
    const { execSync } = await import('node:child_process');
    const global = execSync('npm root -g').toString().trim();
    ({ chromium } = await import(`${global}/playwright/index.mjs`));
  } catch {
    console.error('Playwright nicht gefunden. Bitte "npm i -D playwright" ausführen.');
    process.exit(2);
  }
}

const ADRESSE = `http://127.0.0.1:${process.env.PORT || 8123}/index.html`;

let fehler = 0;
const pruefe = (bed, text, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${text}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehler++;
};

/** Siehe strom-test.mjs — derselbe Rückfall auf ein vorhandenes Chromium. */
async function starteBrowser() {
  try {
    return await chromium.launch();
  } catch (fehler) {
    for (const weg of [process.env.CHROMIUM, '/opt/pw-browsers/chromium'].filter(Boolean)) {
      try {
        return await chromium.launch({ executablePath: weg });
      } catch { /* nächster Versuch */ }
    }
    throw fehler;
  }
}

const inZukunft = (min) => new Date(Date.now() + min * 60_000).toISOString();
const TAG = 24 * 60 * 60 * 1000;

const laufende = [1, 2].map((i) => ({
  id: `nach-${i}`, seller: `uuid-v${i}`, startBid: 100_000, currentBid: 100_000,
  instantBuyPrice: null, endTime: inZukunft(30 + i), startTime: new Date().toISOString(), bids: {},
  item: { material: 'DIAMOND', displayName: `Nachladeprobe ${i}`, amount: 1, lore: [], enchantments: {} },
}));

const verkauf = (preis, alter) => {
  const zeit = new Date(Date.now() - alter * TAG).toISOString();
  return {
    id: `v-${preis}-${alter}`, seller: 'uuid-v1', highestBidder: 'uuid-k',
    startBid: preis, currentBid: preis, finalPrice: preis, saleType: 'auction',
    soldAt: zeit, endTime: zeit, sold: true, bids: { 'uuid-k': preis },
    item: { material: 'DIAMOND', displayName: 'Nachladeprobe 1', amount: 1, lore: [], enchantments: {} },
  };
};

const verlaufKlein = { 'Nachladeprobe 1': [verkauf(900_000, 2), verkauf(910_000, 3)] };
const verlaufGross = { 'Nachladeprobe 1': [...verlaufKlein['Nachladeprobe 1'], verkauf(920_000, 1)] };

const markt = { Bloecke: { DIAMOND: [{ orderSide: 'SELL', price: 3.5 }] } };
const marktItems = [{ material: 'DIAMOND', name: 'Diamant' }];
const shards = [{ source: 'DIAMOND', rate: 2 }];

const browser = await starteBrowser();
const kontext = await browser.newContext({ serviceWorkers: 'block' });
const seite = await kontext.newPage();

// Der Zustand, den die Attrappe ausliefert. Ändert der Test ihn, sieht
// der nächste Durchgang etwas Neues.
let verlaufJetzt = verlaufKlein;
const zaehler = { head: 0, verlauf: 0, markt: 0, shards: 0, aktiv: 0 };

const alsText = (d) => JSON.stringify(d);

await seite.route('**/auctions/active', (route) => {
  zaehler.aktiv += 1;
  route.fulfill({ contentType: 'application/json', body: alsText(laufende) });
});
await seite.route('**/market/prices', (route) => {
  zaehler.markt += 1;
  route.fulfill({ contentType: 'application/json', body: alsText(markt) });
});
await seite.route('**/market/items', (route) =>
  route.fulfill({ contentType: 'application/json', body: alsText(marktItems) }));
await seite.route('**/merchant/rates', (route) => {
  zaehler.shards += 1;
  route.fulfill({ contentType: 'application/json', body: alsText(shards) });
});

// Die teure Datei. HEAD liefert nur die Größe — genau darum geht es.
await seite.route('**/auction-history.json*', (route) => {
  const koerper = alsText(verlaufJetzt);
  const laenge = String(new TextEncoder().encode(koerper).length);
  if (route.request().method() === 'HEAD') {
    zaehler.head += 1;
    return route.fulfill({ status: 200, headers: { 'content-length': laenge }, body: '' });
  }
  zaehler.verlauf += 1;
  route.fulfill({
    contentType: 'application/json',
    headers: { 'content-length': laenge },
    body: koerper,
  });
});

// Der Strom bleibt hier außen vor: Er hat seinen eigenen Test, und die
// aktiven Auktionen sollen im Rückfallweg geprüft werden.
await seite.addInitScript(() => {
  window.EventSource = class {
    constructor() { window.__strom = this; }
    addEventListener() {}
    close() {}
  };
});

await seite.goto(ADRESSE, { waitUntil: 'domcontentloaded' });
await seite.waitForTimeout(2500);

await seite.evaluate(async () => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach((m) => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');
  showSection('items');
  await renderItemSearch();
});

const stand = () =>
  seite.evaluate(() => ({
    karten: document.querySelectorAll('#itemsContainer .card').length,
    verkaeufe: Object.values(App.auctionHistory || {}).flat().length,
    durchgaenge: Nachladen.durchgaenge,
    geaendert: Nachladen.geaendert,
    groesse: App.verlaufGroesse,
  }));

const anfang = await stand();
pruefe(anfang.karten > 0, 'Der Items-Reiter steht', `${anfang.karten} Karten`);
pruefe(anfang.verkaeufe === 2, 'Mit dem kleinen Verlauf', `${anfang.verkaeufe} Verkäufe`);
pruefe(anfang.groesse !== null, 'Und die Größe des Verlaufs ist gemerkt', `${anfang.groesse}`);

// ── 1. Unveränderte Daten ändern nichts ─────────────────────────────
//
// Der wichtigste Fall. Am Servershop ändert sich stundenlang nichts;
// dann soll die Seite auch stundenlang stillstehen.
console.log('— Wenn sich nichts getan hat —');

const vorherHead = zaehler.head;
const vorherVerlauf = zaehler.verlauf;

// Eine Karte markieren: Wird die Liste neu gebaut, ist die Markierung weg.
await seite.evaluate(() => {
  const k = document.querySelector('#itemsContainer .card');
  if (k) k.dataset.merkzettel = 'ja';
});

await seite.evaluate(() => nachladen({ sofort: true }));
await seite.waitForTimeout(300);

const nachLeerlauf = await stand();
pruefe(nachLeerlauf.durchgaenge === anfang.durchgaenge + 1, 'Der Durchgang lief',
  `${nachLeerlauf.durchgaenge}`);
pruefe(nachLeerlauf.geaendert === anfang.geaendert,
  'Aber es gab nichts zu ändern', `${nachLeerlauf.geaendert}`);
pruefe(zaehler.head === vorherHead + 1, 'Nachgesehen wurde mit HEAD', `${zaehler.head}×`);
pruefe(zaehler.verlauf === vorherVerlauf,
  'Und die sieben Megabyte wurden gar nicht erst geholt',
  `${zaehler.verlauf}× geladen, unverändert`);

const markierung = await seite.evaluate(() =>
  document.querySelector('#itemsContainer .card')?.dataset.merkzettel === 'ja');
pruefe(markierung, 'Die Liste wurde nicht neu gebaut — es sind dieselben Karten');

// ── 2. Ein neuer Verlauf kommt an ───────────────────────────────────
console.log('\n— Wenn der Verlauf neu gebaut wurde —');

verlaufJetzt = verlaufGross;
await seite.evaluate(() => nachladen({ sofort: true }));
await seite.waitForTimeout(600);

const nachNeu = await stand();
pruefe(zaehler.verlauf === vorherVerlauf + 1, 'Jetzt wird er geholt', `${zaehler.verlauf}×`);
pruefe(nachNeu.verkaeufe === 3, 'Und die neuen Zahlen stehen da', `${nachNeu.verkaeufe} Verkäufe`);
pruefe(nachNeu.geaendert === anfang.geaendert + 1, 'Der Durchgang meldet die Änderung',
  `${nachNeu.geaendert}`);

const neuGebaut = await seite.evaluate(() =>
  document.querySelector('#itemsContainer .card')?.dataset.merkzettel !== 'ja');
pruefe(neuGebaut, 'Und diesmal wurde die Liste neu gezeichnet');

// Und gleich danach wieder Ruhe.
const vorRuhe = zaehler.verlauf;
await seite.evaluate(() => nachladen({ sofort: true }));
await seite.waitForTimeout(300);
pruefe(zaehler.verlauf === vorRuhe, 'Der nächste Durchgang holt ihn nicht noch einmal',
  `${zaehler.verlauf}×`);

// ── 3. Offene Fenster werden in Ruhe gelassen ───────────────────────
//
// Wer sich die Kurve eines Items ansieht, will nicht, dass darunter die
// Liste ausgetauscht wird — beim Schließen stünde er sonst woanders.
console.log('\n— Während ein Fenster offen steht —');

await seite.evaluate(() => {
  const k = document.querySelector('#itemsContainer .card');
  if (k) k.dataset.merkzettel = 'ja';
  const m = document.getElementById('chartModal');
  if (m) m.style.display = 'block';
});

verlaufJetzt = { ...verlaufGross, 'Nachladeprobe 1': [...verlaufGross['Nachladeprobe 1'], verkauf(930_000, 5)] };
await seite.evaluate(() => nachladen({ sofort: true }));
await seite.waitForTimeout(500);

const beiModal = await stand();
pruefe(beiModal.verkaeufe === 4, 'Die Daten werden trotzdem geholt', `${beiModal.verkaeufe}`);
pruefe(
  await seite.evaluate(() => document.querySelector('#itemsContainer .card')?.dataset.merkzettel === 'ja'),
  'Aber die Liste darunter bleibt stehen'
);

await seite.evaluate(() => {
  const m = document.getElementById('chartModal');
  if (m) m.style.display = 'none';
});

// ── 4. Der Reiter entscheidet, was gezeichnet wird ──────────────────
//
// Ändert sich nur der Markt, hat der Items-Reiter nichts davon. Ihn
// deshalb neu zu bauen wäre reine Unruhe.
console.log('\n— Nur der passende Reiter wird gezeichnet —');

await seite.evaluate(() => {
  const k = document.querySelector('#itemsContainer .card');
  if (k) k.dataset.merkzettel = 'ja';
});

await seite.unroute('**/market/prices');
await seite.route('**/market/prices', (route) => {
  zaehler.markt += 1;
  route.fulfill({
    contentType: 'application/json',
    body: JSON.stringify({ Bloecke: { DIAMOND: [{ orderSide: 'SELL', price: 9.9 }] } }),
  });
});

await seite.evaluate(() => nachladen({ sofort: true }));
await seite.waitForTimeout(400);

pruefe(
  await seite.evaluate(() => App.marketPricesMap?.diamond === 9.9),
  'Der neue Marktpreis ist übernommen',
  `${await seite.evaluate(() => App.marketPricesMap?.diamond)}`
);
pruefe(
  await seite.evaluate(() => document.querySelector('#itemsContainer .card')?.dataset.merkzettel === 'ja'),
  'Der Items-Reiter wurde dafür nicht neu gebaut — er lebt nicht vom Markt'
);

// ── 5. Jede Quelle hat ihren eigenen Takt ───────────────────────────
//
// Der Servershop bewegt sich langsam, und seine Preisliste ist ein paar
// hundert Kilobyte. Sie im Grundtakt zu holen wäre auf Mobilfunk eine
// Zumutung für nichts.
console.log('\n— Wie oft welche Quelle gefragt wird —');

await seite.evaluate(() => {
  // So, als wäre gerade eben ein Durchgang gelaufen.
  const jetzt = Date.now();
  for (const q of Object.keys(Nachladen.zuletztJe)) Nachladen.zuletztJe[q] = jetzt;
});

const vorTakt = { markt: zaehler.markt, head: zaehler.head };
await seite.evaluate(() => nachladen());
await seite.waitForTimeout(300);
pruefe(zaehler.markt === vorTakt.markt, 'Der Markt wird im Grundtakt nicht gefragt',
  `${zaehler.markt}×, unverändert`);
pruefe(zaehler.head === vorTakt.head, 'Und der Verlauf auch nicht, solange er nicht dran ist',
  `${zaehler.head}×`);

await seite.evaluate(() => {
  // Der Verlauf ist dran, der Markt noch nicht.
  Nachladen.zuletztJe.verlauf = Date.now() - 10 * 60_000;
});
await seite.evaluate(() => nachladen());
await seite.waitForTimeout(400);
pruefe(zaehler.head === vorTakt.head + 1, 'Ist er dran, wird nachgesehen', `${zaehler.head}×`);
pruefe(zaehler.markt === vorTakt.markt, 'Der Markt bleibt trotzdem aus', `${zaehler.markt}×`);

// Wer zurückkommt, will den Stand von jetzt — nicht den von vor vier
// Minuten.
await seite.evaluate(() => nachladen({ sofort: true }));
await seite.waitForTimeout(300);
pruefe(zaehler.markt === vorTakt.markt + 1, 'Bei „sofort" zählt der Takt nicht',
  `${zaehler.markt}×`);

// ── 6. Im Hintergrund wird nicht nachgeladen ────────────────────────
console.log('\n— Wenn niemand hinsieht —');

const vorHintergrund = await stand();
await seite.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  return nachladen();
});
await seite.waitForTimeout(200);
const imHintergrund = await stand();
pruefe(imHintergrund.durchgaenge === vorHintergrund.durchgaenge,
  'Ein verdeckter Reiter lädt nichts nach',
  `${imHintergrund.durchgaenge} statt ${vorHintergrund.durchgaenge + 1}`);

await seite.evaluate(() => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
});

// ── 7. Die aktiven Auktionen nur ohne Strom ─────────────────────────
//
// Läuft der Ereignisstrom, trägt er sie laufend nach. Sie dann noch
// einmal abzufragen wäre verschwendet.
console.log('\n— Der Rückfallweg für die Auktionen —');

const ohneStrom = zaehler.aktiv;
await seite.evaluate(() => nachladen({ sofort: true }));
await seite.waitForTimeout(300);
pruefe(zaehler.aktiv === ohneStrom + 1, 'Ohne Strom werden sie abgefragt', `${zaehler.aktiv}×`);

await seite.evaluate(() => { Strom.verbunden = true; });
const mitStrom = zaehler.aktiv;
await seite.evaluate(() => nachladen({ sofort: true }));
await seite.waitForTimeout(300);
pruefe(zaehler.aktiv === mitStrom, 'Mit Strom nicht', `${zaehler.aktiv}×, unverändert`);

await browser.close();

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exitCode = fehler ? 1 : 0;
