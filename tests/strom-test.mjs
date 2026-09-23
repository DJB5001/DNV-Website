// Prüft den Live-Strom des Auktionshauses im Browser.
//
// Die Regel, die hier geprüft wird, ist eine einzige: **Was die Liste
// verrutschen lässt, wartet auf einen Klick. Was nur eine Zeile ändert,
// passiert sofort.** Alles darunter sind Einzelfälle davon.
//
// Geprüft wird im echten Browser, weil genau das hier zählt: dass die
// Karte, die jemand gerade unter dem Zeiger hat, an ihrem Platz bleibt.
// Das ist in einer Attrappe nicht zu sehen.
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

const inZukunft = (min) => new Date(Date.now() + min * 60_000).toISOString();

/** Drei laufende Auktionen — genug, um „rutscht die Liste?" zu sehen. */
const laufende = [1, 2, 3].map((i) => ({
  id: `strom-${i}`,
  seller: `uuid-v${i}`,
  startBid: 100_000 * i,
  currentBid: 100_000 * i,
  instantBuyPrice: null,
  endTime: inZukunft(30 + i),
  startTime: new Date().toISOString(),
  bids: {},
  item: { material: 'DIAMOND', displayName: `Stromprobe ${i}`, amount: 1, lore: [], enchantments: {} },
}));

/**
 * Browser starten — notfalls mit einem, der schon da ist.
 *
 * `npx playwright install` lädt zu jeder Playwright-Fassung eine eigene
 * Chromium-Nummer. Wo schon eine daneben liegt (CI-Abbilder bringen
 * meist eine mit), ist der Fehler „Executable doesn't exist" nur ein
 * Versionsversatz und kein Grund, den Test ausfallen zu lassen.
 * `CHROMIUM=/pfad/zu/chrome` setzt ihn ausdrücklich.
 */
async function starteBrowser() {
  try {
    return await chromium.launch();
  } catch (fehler) {
    const wege = [process.env.CHROMIUM, '/opt/pw-browsers/chromium'].filter(Boolean);
    for (const weg of wege) {
      try {
        return await chromium.launch({ executablePath: weg });
      } catch { /* nächster Versuch */ }
    }
    throw fehler;
  }
}

const browser = await starteBrowser();
const kontext = await browser.newContext({ serviceWorkers: 'block' });
const seite = await kontext.newPage();

await seite.route('**/auctions/active', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(laufende) })
);
await seite.route('**/auction-history.json*', (route) =>
  route.fulfill({ contentType: 'application/json', body: '{}' })
);

// Der echte Strom wird weiter unten einmal geprüft. Für die Fälle
// dazwischen liefert eine Attrappe die Ereignisse — nur so lässt sich
// genau ein Ereignis schicken und danach nachsehen, was sich geändert
// hat. Beim echten EventSource hinge das an der Zustellung.
await seite.addInitScript(() => {
  window.__ereignisse = [];
  class AttrappenStrom {
    constructor(url) {
      this.url = url;
      this.hoerer = {};
      window.__strom = this;
    }
    addEventListener(art, fn) {
      (this.hoerer[art] ||= []).push(fn);
    }
    close() {
      this.geschlossen = true;
    }
    /** Ein Ereignis einspeisen, so wie der Server es schicken würde. */
    schicke(art, daten) {
      for (const fn of this.hoerer[art] ?? []) fn({ data: JSON.stringify(daten) });
    }
  }
  window.__EchtesEventSource = window.EventSource;
  window.EventSource = AttrappenStrom;
});

await seite.goto(ADRESSE, { waitUntil: 'domcontentloaded' });
await seite.waitForTimeout(600);

// Die Ladefolge aus init() nachspielen: Ohne Netz kommt init() nicht
// bis zu den Auktionen, und um die geht es.
await seite.evaluate(async () => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach((m) => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');
  await ladeVerlauf().catch(() => {});
  await ladeAktiveAuktionen();
  setupAuctionFilters();
  showSection('auctions');
  await renderAuctions();
  starteAuktionsStrom();
});

const zustand = () =>
  seite.evaluate(() => {
    const karten = [...document.querySelectorAll('#auctionContainer .card')];
    return {
      karten: karten.length,
      reihenfolge: karten.map((k) => k.dataset.auctionId),
      vorbei: karten.filter((k) => k.classList.contains('auktion-vorbei')).map((k) => k.dataset.auctionId),
      daten: (App.auctionsData || []).map((a) => a.id),
      wartend: Strom.wartend.size,
      knopfSichtbar: !document.getElementById('auktionenNeuLeiste').hidden,
      knopfText: document.getElementById('auktionenNeuText').textContent,
      preise: Object.fromEntries(
        karten.map((k) => [
          k.dataset.auctionId,
          k.querySelector('.auction-currentBid .price-info__wert')?.textContent ?? null,
        ])
      ),
      beschriftung: Object.fromEntries(
        karten.map((k) => [
          k.dataset.auctionId,
          k.querySelector('.auction-currentBid span')?.textContent ?? null,
        ])
      ),
    };
  });

const anfang = await zustand();
pruefe(anfang.karten === 3, 'Drei Auktionen stehen da', `${anfang.karten}`);
pruefe(!anfang.knopfSichtbar, 'Und der Knopf für neue Auktionen ist weg');

// ── 1. Ein Gebot ändert eine Zeile, sonst nichts ────────────────────
console.log('— Ein neues Gebot —');

// Den DOM-Knoten der Karte markieren: Wer die Liste neu aufbaut, wirft
// ihn weg. Genau das darf ein Gebot nicht auslösen.
await seite.evaluate(() => {
  document.querySelector('#auctionContainer .card[data-auction-id="strom-2"]').dataset.merkzettel = 'ja';
});

await seite.evaluate(() => {
  window.__strom.schicke('auction.bid_placed', {
    ...App.auctionsData.find((a) => a.id === 'strom-2'),
    currentBid: 777_000,
    bids: { 'uuid-k1': 500_000, 'uuid-k2': 777_000 },
  });
});
await seite.waitForTimeout(100);

const nachGebot = await zustand();
pruefe(nachGebot.preise['strom-2'] !== anfang.preise['strom-2'],
  'Der Preis auf der Karte ist nachgezogen',
  `${anfang.preise['strom-2']} → ${nachGebot.preise['strom-2']}`);
pruefe(nachGebot.beschriftung['strom-2'] === 'Aktuelles Gebot',
  'Und aus „Startgebot" wird „Aktuelles Gebot"', nachGebot.beschriftung['strom-2']);
pruefe(nachGebot.preise['strom-1'] === anfang.preise['strom-1']
  && nachGebot.preise['strom-3'] === anfang.preise['strom-3'],
  'Die anderen Karten stehen unverändert da');

const gleicherKnoten = await seite.evaluate(() =>
  document.querySelector('#auctionContainer .card[data-auction-id="strom-2"]')?.dataset.merkzettel === 'ja');
pruefe(gleicherKnoten, 'Die Liste wurde nicht neu aufgebaut — es ist dieselbe Karte');
pruefe(nachGebot.reihenfolge.join(',') === anfang.reihenfolge.join(','),
  'Und nichts ist verrutscht', nachGebot.reihenfolge.join(', '));

const geboteZeile = await seite.evaluate(() =>
  document.querySelector('#auctionContainer .card[data-auction-id="strom-2"] .auction-bids .price-info__wert')
    ?.textContent ?? null);
pruefe(geboteZeile === '2', 'Die Gebotszahl stimmt auch', `${geboteZeile}`);

// ── 2. Neue Auktionen warten hinter dem Knopf ───────────────────────
console.log('\n— Eine neue Auktion —');

const neue = {
  id: 'strom-neu', seller: 'uuid-v9', startBid: 42_000, currentBid: 42_000,
  instantBuyPrice: null, endTime: inZukunft(90), startTime: new Date().toISOString(), bids: {},
  item: { material: 'EMERALD', displayName: 'Frisch eingestellt', amount: 1, lore: [], enchantments: {} },
};
await seite.evaluate((a) => window.__strom.schicke('auction.created', a), neue);
await seite.waitForTimeout(100);

const nachNeu = await zustand();
pruefe(nachNeu.karten === 3, 'Die Liste bleibt, wie sie war', `${nachNeu.karten} Karten`);
pruefe(nachNeu.reihenfolge.join(',') === anfang.reihenfolge.join(','),
  'Nichts ist nach unten gerutscht');
pruefe(nachNeu.knopfSichtbar && nachNeu.knopfText === '1 neue Auktion',
  'Stattdessen steht der Knopf da', nachNeu.knopfText);

// Zwei weitere: Der Knopf zählt mit, die Liste rührt sich nicht.
for (const i of [10, 11]) {
  await seite.evaluate((a) => window.__strom.schicke('auction.created', a),
    { ...neue, id: `strom-neu-${i}`, item: { ...neue.item, displayName: `Frisch ${i}` } });
}
await seite.waitForTimeout(100);
const nachDrei = await zustand();
pruefe(nachDrei.knopfText === '3 neue Auktionen', 'Der Knopf zählt mit', nachDrei.knopfText);
pruefe(nachDrei.karten === 3, 'Und die Liste steht immer noch still', `${nachDrei.karten}`);

// Der Klick bringt sie herein.
await seite.click('#auktionenNeuKnopf');
await seite.waitForTimeout(400);
const nachKlick = await zustand();
pruefe(nachKlick.karten === 6, 'Nach dem Klick sind sie da', `${nachKlick.karten} Karten`);
pruefe(!nachKlick.knopfSichtbar, 'Und der Knopf ist wieder weg');
pruefe(nachKlick.daten.includes('strom-neu'), 'Auch in den Daten', nachKlick.daten.join(', '));

// ── 3. Verkauft heißt grau, nicht weg ───────────────────────────────
console.log('\n— Eine Auktion ist vorbei —');

await seite.evaluate(() => {
  window.__strom.schicke('auction.sold', App.auctionsData.find((a) => a.id === 'strom-1'));
});
await seite.waitForTimeout(100);

const nachVerkauf = await zustand();
pruefe(nachVerkauf.karten === nachKlick.karten,
  'Die Karte verschwindet nicht', `${nachKlick.karten} → ${nachVerkauf.karten}`);
pruefe(nachVerkauf.reihenfolge.join(',') === nachKlick.reihenfolge.join(','),
  'Also rutscht auch nichts nach oben');
pruefe(nachVerkauf.vorbei.includes('strom-1'), 'Sie ist als vorbei gekennzeichnet',
  nachVerkauf.vorbei.join(', '));

const fahne = await seite.evaluate(() =>
  document.querySelector('.card[data-auction-id="strom-1"] .auktion-vorbei__fahne')?.textContent ?? null);
pruefe(fahne === 'Verkauft', 'Und sagt, was passiert ist', `${fahne}`);

// Aus den Daten ist sie aber sofort raus: Was nicht mehr läuft, hat in
// keiner Zählung und keinem Schnitt etwas zu suchen.
pruefe(!nachVerkauf.daten.includes('strom-1'), 'Aus den Daten ist sie raus',
  nachVerkauf.daten.join(', '));

// Beim nächsten Neuaufbau ist sie dann auch von der Seite weg.
await seite.evaluate(() => renderAuctions());
await seite.waitForTimeout(400);
const nachNeuaufbau = await zustand();
pruefe(!nachNeuaufbau.reihenfolge.includes('strom-1'),
  'Beim nächsten Neuaufbau ist sie fort', nachNeuaufbau.reihenfolge.join(', '));

// Die anderen Enden sagen dasselbe mit anderem Wort.
for (const [art, wort] of [
  ['auction.instant_bought', 'Sofort gekauft'],
  ['auction.expired', 'Abgelaufen'],
  ['auction.cancelled', 'Zurückgezogen'],
]) {
  const ziel = await seite.evaluate(() => App.auctionsData[0]?.id);
  await seite.evaluate(
    ([a, id]) => window.__strom.schicke(a, App.auctionsData.find((x) => x.id === id)),
    [art, ziel]
  );
  await seite.waitForTimeout(80);
  const text = await seite.evaluate((id) =>
    document.querySelector(`.card[data-auction-id="${id}"] .auktion-vorbei__fahne`)?.textContent ?? null, ziel);
  pruefe(text === wort, `${art} steht als „${wort}" da`, `${text}`);
}

// auction.removed trägt nur die Kennung, keine Auktion.
const uebrig = await seite.evaluate(() => App.auctionsData[0]?.id);
await seite.evaluate((id) => window.__strom.schicke('auction.removed', { uid: id }), uebrig);
await seite.waitForTimeout(80);
const nachRemoved = await zustand();
pruefe(!nachRemoved.daten.includes(uebrig), 'auction.removed nimmt sie allein über die Kennung raus',
  `${uebrig} weg, übrig: ${nachRemoved.daten.join(', ')}`);

// ── 4. Unsinn kippt die Seite nicht ─────────────────────────────────
console.log('\n— Wenn das Ereignis nicht ist, was es sein sollte —');

const vorUnsinn = await zustand();
await seite.evaluate(() => {
  for (const fn of window.__strom.hoerer['auction.created'] ?? []) fn({ data: '{kein json' });
  for (const fn of window.__strom.hoerer['auction.sold'] ?? []) fn({ data: 'null' });
  for (const fn of window.__strom.hoerer['auction.bid_placed'] ?? []) fn({ data: '{"nichts":1}' });
});
await seite.waitForTimeout(100);
const nachUnsinn = await zustand();
pruefe(nachUnsinn.daten.join(',') === vorUnsinn.daten.join(','),
  'Unlesbare Ereignisse ändern nichts', nachUnsinn.daten.join(', '));
pruefe(nachUnsinn.karten === vorUnsinn.karten, 'Und die Liste steht');

// ── 5. Einmal mit dem echten EventSource ────────────────────────────
//
// Alles darüber prüft die Verarbeitung. Diese Prüfung ist dafür da,
// dass sie im Betrieb überhaupt erreicht wird: dass starteAuktionsStrom()
// wirklich eine Verbindung aufmacht und ein echtes Ereignis ankommt.
console.log('\n— Mit dem echten EventSource —');

const seite2 = await kontext.newPage();
await seite2.route('**/auctions/active', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(laufende) })
);
await seite2.route('**/auction-history.json*', (route) =>
  route.fulfill({ contentType: 'application/json', body: '{}' })
);

// retry setzt die Wartezeit auf eine Minute, damit der Browser nicht
// im Sekundentakt neu verbindet, wenn diese Antwort zu Ende ist.
const gebot = { ...laufende[2], currentBid: 999_000, bids: { 'uuid-k': 999_000 } };
let stromAngefragt = 0;
await seite2.route('**/auctions/stream', (route) => {
  stromAngefragt += 1;
  route.fulfill({
    status: 200,
    contentType: 'text/event-stream',
    headers: { 'Cache-Control': 'no-cache' },
    body: `retry: 60000\nid: 1\nevent: auction.bid_placed\ndata: ${JSON.stringify(gebot)}\n\n`,
  });
});

// Hier wird die Ladefolge *nicht* nachgespielt. init() der Seite macht
// sie selbst, und genau darum geht es: dass der Strom im normalen
// Ablauf anspringt. Würde hier noch einmal /active geladen, käme die
// alte Zahl zurück und überschriebe, was das Ereignis gerade gebracht
// hat — die Prüfung sähe dann aus wie ein Fehler und wäre nur ein
// Test, der sich selbst im Weg steht.
await seite2.goto(ADRESSE, { waitUntil: 'domcontentloaded' });
await seite2.waitForTimeout(2500);
await seite2.evaluate(async () => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach((m) => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');
  showSection('auctions');
  await renderAuctions();
});

pruefe(stromAngefragt >= 1, 'Der Strom wird von selbst angefragt', `${stromAngefragt}×`);

const angekommen = await seite2.evaluate(() => ({
  ereignisse: Strom.ereignisse,
  gebot: App.auctionsData.find((a) => a.id === 'strom-3')?.currentBid ?? null,
}));
pruefe(angekommen.ereignisse >= 1, 'Ein echtes Ereignis kommt an', `${angekommen.ereignisse}`);
pruefe(angekommen.gebot === 999_000, 'Und steht in den Daten', `${angekommen.gebot}`);

const echterPreis = await seite2.evaluate(() =>
  document.querySelector('.card[data-auction-id="strom-3"] .auction-currentBid .price-info__wert')?.textContent ?? null);
pruefe(echterPreis !== null && !echterPreis.includes('300'),
  'Bis auf die Karte', `${echterPreis}`);

await browser.close();

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exitCode = fehler ? 1 : 0;
