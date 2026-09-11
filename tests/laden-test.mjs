// Prüft, dass die Seite nicht mehr auf den Auktionsverlauf wartet.
//
// Der Verlauf ist 33 MB groß (7 MB über die Leitung). Bisher hing die
// ganze Seite daran: erst wenn er durch war, stand die Auktionsliste.
// Die Auktionen selbst brauchen ihn aber gar nicht — nur die
// Rabatt-Abzeichen darauf.
//
// Der Test verzögert die Verlaufs-Antwort künstlich. Ohne diese
// Verzögerung wäre nicht zu unterscheiden, ob die Liste vorher da war
// oder einfach schnell nachkam.
//
// Voraussetzungen: Playwright, und die Seite muss ausgeliefert werden:
//   npx http-server . -p 8123     (abweichender Port über PORT=...)

import fs from 'node:fs';

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
const VERZOEGERUNG_MS = 3000;

let fehler = 0;
const pruefe = (bed, text, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${text}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehler++;
};

// Ein kleiner, aber echt geformter Verlauf und eine laufende Auktion
// dazu. Der Preis liegt bewusst weit unter dem Schnitt, damit ein
// Rabatt-Abzeichen entsteht — daran hängt die zweite Prüfung.
const TAG = 24 * 60 * 60 * 1000;
const stueck = (preis, alter, i) => {
  const zeit = new Date(Date.now() - alter * TAG).toISOString();
  return {
    seller: `uuid-v${i}`, highestBidder: 'uuid-k',
    startBid: preis, currentBid: preis, finalPrice: preis,
    soldAt: zeit, endTime: zeit, bids: { 'uuid-k': preis },
    item: { material: 'DIAMOND', displayName: 'Ladeprobe', amount: 1, lore: [], enchantments: {} },
  };
};
const verlauf = { Ladeprobe: [1, 2, 3, 4, 5, 6].map((i) => stueck(1_000_000, i, i)) };

const laufende = [{
  id: 'ladeprobe-1', seller: 'uuid-v1', startBid: 200_000, currentBid: 200_000,
  endTime: new Date(Date.now() + 20 * 60_000).toISOString(), startTime: new Date().toISOString(), bids: {},
  item: { material: 'DIAMOND', displayName: 'Ladeprobe', amount: 1, lore: [], enchantments: {} },
}];

const browser = await chromium.launch();

// Ohne Service Worker: Er sitzt sonst vor jeder Anfrage und liefert aus
// seinem Speicher, statt die Attrappen unten durchzulassen — die
// Verzoegerung, um die es hier geht, kaeme nie an. Was er speichert,
// wird weiter unten am Quelltext geprueft.
const kontext = await browser.newContext({ serviceWorkers: 'block' });
const seite = await kontext.newPage();

const angefragt = [];
seite.on('request', (r) => angefragt.push(r.url()));

// Die laufenden Auktionen kommen sofort, der Verlauf mit Verspätung.
await seite.route('**/auctions/active', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(laufende) }));

let verlaufAusgeliefert = 0;
await seite.route('**/auction-history.json*', async (route) => {
  await new Promise((f) => setTimeout(f, VERZOEGERUNG_MS));
  verlaufAusgeliefert = Date.now();
  await route.fulfill({ contentType: 'application/json', body: JSON.stringify(verlauf) });
});

/**
 * Die Ladefolge aus init() nachspielen, statt init() zu rufen.
 *
 * init() haengt an Supabase und am Besucherzaehler; ohne Netz kommt es
 * gar nicht bis zu den Auktionen. Nachgespielt wird deshalb genau der
 * Teil, um den es geht — in derselben Reihenfolge wie im Original:
 * Verlauf anstossen, auf die kleine Haelfte warten, zeichnen.
 */
async function ladefolge(zielSeite) {
  await zielSeite.evaluate(() => {
    document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
      .forEach((m) => (m.style.display = 'none'));
    document.body.classList.remove('loading', 'modal-open');

    window.__verlaeuft = ladeVerlauf().catch(() => {});
    window.__bereit = (async () => {
      await ladeAktiveAuktionen();
      setupAuctionFilters();
      showSection('auctions');
      await renderAuctions();
    })();
    return window.__bereit;
  });
}

await seite.goto(ADRESSE, { waitUntil: 'domcontentloaded' });
await seite.waitForTimeout(600);
const start = Date.now();
await ladefolge(seite);

// ── 1. Die Auktionsliste steht, während der Verlauf noch lädt ───────
console.log('— Was da ist, bevor der Verlauf ankommt —');

const kartenNach = Date.now() - start;
const vorherDa = verlaufAusgeliefert === 0;
const karten = await seite.evaluate(() => document.querySelectorAll('#auctionContainer .card').length);

pruefe(karten > 0, 'Auktionskarten sind gezeichnet', `${karten}`);
pruefe(vorherDa, 'Und zwar bevor der Verlauf ausgeliefert war',
  `nach ${kartenNach} ms, Verlauf braucht ${VERZOEGERUNG_MS} ms`);

// ── 2. Der Rabatt kommt nach ────────────────────────────────────────
console.log('\n— Was nachkommt —');

const rabattJetzt = () =>
  seite.evaluate(() => document.querySelectorAll('#auctionContainer .deal-badge').length);

const vorher = await rabattJetzt();
await seite.waitForFunction(() => App.verlaufGeladen === true, null, { timeout: 15000 }).catch(() => {});
await seite.waitForTimeout(800);

pruefe(await seite.evaluate(() => App.verlaufGeladen === true), 'Der Verlauf ist angekommen');
const nachher = await rabattJetzt();
pruefe(nachher > vorher, 'Und die Rabatt-Abzeichen sind jetzt da',
  `vorher ${vorher}, nachher ${nachher}`);

// ── 2b. Sortiert wird über gerechnete Zahlen, nicht über Text ───────
//
// Der Verlaufs-Reiter sortiert 34.000 Verkäufe nach Datum. Stand in dem
// Vergleich `new Date(a.endTime) - new Date(b.endTime)`, wurde dieselbe
// Zeichenkette über eine Million Mal geparst — gemessen 339 ms allein
// dafür.
console.log('\n— Wie sortiert wird —');

const gestempelt = await seite.evaluate(() =>
  Object.values(App.auctionHistory).flat().every((v) => typeof v._zeit === 'number' && v._zeit > 0));
pruefe(gestempelt, 'Jeder Verkauf trägt seinen Zeitpunkt als Zahl');

await seite.evaluate(async () => { showSection('history'); await renderHistory(); });
const reihenfolge = await seite.evaluate(() =>
  [...document.querySelectorAll('#historyContainer .card')].length);
pruefe(reihenfolge > 0, 'Der Verlaufs-Reiter zeigt Karten', `${reihenfolge}`);

// Die beiden Wege gegeneinander, im selben Augenblick auf derselben
// Maschine — nur so ist die Zahl unabhängig davon, wo der Test läuft.
const messung = await seite.evaluate(() => {
  const proben = Array.from({ length: 20000 }, (_, i) => ({
    endTime: new Date(Date.now() - i * 60000).toISOString(),
  }));
  proben.forEach((p) => zeitpunkt(p));

  const t1 = performance.now();
  [...proben].sort((a, b) => zeitpunkt(b) - zeitpunkt(a));
  const gerechnet = performance.now() - t1;

  const t2 = performance.now();
  [...proben].sort((a, b) => new Date(b.endTime) - new Date(a.endTime));
  const geparst = performance.now() - t2;

  return { gerechnet, geparst };
});

pruefe(messung.gerechnet * 2 < messung.geparst,
  'Und das ist um ein Vielfaches schneller als Text zu parsen',
  `${messung.gerechnet.toFixed(0)} ms statt ${messung.geparst.toFixed(0)} ms bei 20.000 Einträgen`);

// ── 3. Keine Zeitstempel mehr an den Adressen ───────────────────────
//
// `?t=${Date.now()}` machte jede Anfrage für den Browser zu einer
// anderen Datei. Damit greift kein Zwischenspeicher — weder seiner noch
// der des Service Workers.
console.log('\n— Der Zwischenspeicher darf greifen —');

const verlaufsAnfragen = angefragt.filter((u) => u.includes('auction-history.json'));
pruefe(verlaufsAnfragen.length > 0, 'Der Verlauf wurde geholt', `${verlaufsAnfragen.length}×`);
pruefe(verlaufsAnfragen.every((u) => !u.includes('?t=')),
  'Ohne angehängten Zeitstempel', verlaufsAnfragen[0] ?? '');

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');
pruefe(!/shard-history\.json\?t=/.test(quelle), 'Beim Shard-Verlauf ebenso');

// ── 4. Ein kaputter Verlauf reißt die Auktionen nicht mit ───────────
console.log('\n— Wenn der Verlauf klemmt —');

const zweite = await kontext.newPage();
await zweite.route('**/auctions/active', (route) =>
  route.fulfill({ contentType: 'application/json', body: JSON.stringify(laufende) }));
await zweite.route('**/auction-history.json*', (route) => route.fulfill({ status: 503, body: '' }));
await zweite.goto(ADRESSE, { waitUntil: 'domcontentloaded' });
await zweite.waitForTimeout(600);
await ladefolge(zweite);
await zweite.waitForTimeout(500);
pruefe(await zweite.evaluate(() => document.querySelectorAll('#auctionContainer .card').length > 0),
  'Die Auktionen stehen trotzdem');
pruefe(await zweite.evaluate(() => Object.keys(App.auctionHistory).length === 0),
  'Und der Verlauf bleibt leer, statt die Seite mitzureissen');

// ── 5. Der Service Worker ───────────────────────────────────────────
//
// Am Quelltext und nicht am laufenden Browser: Playwright reicht weder
// page.route noch context.route an Anfragen heran, die aus einem
// Service Worker kommen — der Speicher-Treffer selbst ist von hier aus
// nicht prüfbar. Was sich prüfen lässt, sind die Regeln, und die zweite
// ist die wichtigere: Ein Gebot von vor zehn Minuten als aktueller Stand
// wäre schlimmer als eine langsame Seite.
console.log('\n— Was der Service Worker speichert —');

const sw = fs.readFileSync(new URL('../service-worker.js', import.meta.url), 'utf8');
const liveBlock = sw.slice(sw.indexOf('const isLiveData'), sw.indexOf('if (isLiveData)'));

pruefe(!liveBlock.includes('raw.githubusercontent.com'),
  'Die Verlaufsdateien sind nicht mehr vom Speichern ausgenommen');
pruefe(liveBlock.includes('api.opsucht.net'),
  'Laufende Auktionen kommen weiter immer aus dem Netz');
pruefe(/DATEN_DATEIEN\s*=\s*\[[^\]]*auction-history\.json/.test(sw),
  'Und gespeichert wird nur, was benannt ist');
pruefe(/request\.cache === 'reload'/.test(sw),
  'Der Aktualisieren-Knopf kommt an der Konserve vorbei');
pruefe(/ladeVerlauf\(\{ frisch: true/.test(quelle),
  'Und schickt seine Anfrage auch so ab');

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
await browser.close();
process.exit(fehler === 0 ? 0 : 1);
