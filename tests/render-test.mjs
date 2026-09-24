// Prüft die Bilder der Custom Items.
//
// Seit dem 23.09.2026 liefert die Auktions-API bei Custom Items einen
// echten Render (items.opsucht.net). Geprüft wird, dass er ankommt — und
// vor allem, dass er an den richtigen Stellen ankommt und an den
// falschen nicht:
//
//   - auch bei Verkäufen von vor dem Render, über die Variante
//   - aber nicht bei einem gleichnamigen Item mit anderer Lore
//   - der neueste, wenn der Server neu gerendert hat
//   - und das handgepflegte Bild wieder vor dem allgemeinen
//     Materialbild, das es seit Juli verdrängt hatte
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

const TAG = 24 * 60 * 60 * 1000;
const vor = (tage) => new Date(Date.now() - tage * TAG).toISOString();
const inZukunft = (min) => new Date(Date.now() + min * 60_000).toISOString();

// Die Adressen, wie die API sie schickt.
const RENDER_ALT = 'https://items.opsucht.net/10496.png';
const RENDER_NEU = 'https://items.opsucht.net/lWowtEefZVEu.png';
const ANGEL = 'https://img.mc-api.io/fishing_rod.png';
const PAPIER = 'https://img.mc-api.io/paper.png';
const DIAMANT = 'https://img.mc-api.io/diamond.png';

const angel = (lore, icon) => ({
  material: 'FISHING_ROD', displayName: 'Hightechangel', amount: 1,
  lore, enchantments: {}, ...(icon ? { icon } : {}),
});

const verkauf = (id, item, tage, preis = 1_000_000) => ({
  id, seller: 'uuid-v', highestBidder: 'uuid-k',
  startBid: preis, currentBid: preis, finalPrice: preis, saleType: 'auction',
  soldAt: vor(tage), endTime: vor(tage), sold: true, bids: { 'uuid-k': preis }, item,
});

const LEGENDAER = ['Seltenheit » Legendär'];
const GEWOEHNLICH = ['Seltenheit » Gewöhnlich'];

const verlauf = {
  Hightechangel: [
    // Aus der Zeit vor dem Render: allgemeines Angelbild bzw. gar keins.
    verkauf('h-juli', angel(LEGENDAER, ANGEL), 40),
    verkauf('h-mai', angel(LEGENDAER, null), 80),
    // Der erste Render, gestern — inzwischen neu gerendert.
    verkauf('h-gestern', angel(LEGENDAER, RENDER_ALT), 1),
    // Dieselbe Angel mit anderer Lore: eine andere Variante.
    verkauf('h-anders', angel(GEWOEHNLICH, ANGEL), 3),
  ],
  Magnet: [
    // Handgepflegtes Bild in config.js, von der API nur ein Blatt Papier.
    verkauf('m-1', { material: 'PAPER', displayName: 'Magnet', amount: 1, lore: ['Zieht Items an'], enchantments: {}, icon: PAPIER }, 5),
  ],
  DIAMOND: [
    verkauf('d-1', { material: 'DIAMOND', amount: 1, lore: [], enchantments: {}, icon: DIAMANT }, 2, 133),
  ],
};

const laufende = [{
  id: 'h-jetzt', seller: 'uuid-v', startBid: 900_000, currentBid: 900_000, instantBuyPrice: null,
  endTime: inZukunft(60), startTime: new Date().toISOString(), bids: {},
  item: angel(LEGENDAER, RENDER_NEU),
}];

const browser = await starteBrowser();
const kontext = await browser.newContext({ serviceWorkers: 'block' });
const seite = await kontext.newPage();

await seite.route('**/auctions/active', (r) =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(laufende) }));
await seite.route('**/auction-history.json*', (r) =>
  r.fulfill({ contentType: 'application/json', body: JSON.stringify(verlauf) }));
// Die Bilder selbst gibt es hier nicht. Ausgeliefert wird ein echtes
// PNG von einem Pixel: Mit leerem Rumpf scheitert das Dekodieren, die
// Rückfallkette springt an und ersetzt die Adresse — dann prüfte der
// Test die Kette statt der Auswahl.
const EIN_PIXEL = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64'
);
await seite.route(/items\.opsucht\.net|img\.mc-api\.io|postimg\.cc|wiki\.gg|mcasset|textures/, (r) =>
  r.fulfill({ status: 200, contentType: 'image/png', body: EIN_PIXEL }));
await seite.addInitScript(() => {
  window.EventSource = class { addEventListener() {} close() {} };
});

await seite.goto(ADRESSE, { waitUntil: 'domcontentloaded' });
await seite.waitForTimeout(2500);
await seite.evaluate(() => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach((m) => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');
});

/** Welches Bild bekommt der Verkauf mit dieser Kennung? */
const bildFuer = (name, id) =>
  seite.evaluate(([n, i]) => {
    const v = (App.auctionHistory[n] || []).find((s) => s.id === i);
    return v ? getAuctionItemIcon(v.item) : null;
  }, [name, id]);

// ── 1. Der Render kommt an ──────────────────────────────────────────
console.log('— Der Render der laufenden Auktion —');

const aktiv = await seite.evaluate(() => getAuctionItemIcon(App.auctionsData[0].item));
pruefe(aktiv === RENDER_NEU, 'Die laufende Auktion zeigt ihren Render', aktiv);

// ── 2. Und auch bei alten Verkäufen ─────────────────────────────────
//
// Sonst zeigte der Verlauf jedes Custom Item noch als Material, bis es
// irgendwann wieder verkauft wird — bei seltenen Items monatelang.
console.log('\n— Verkäufe von vor dem Render —');

pruefe(await bildFuer('Hightechangel', 'h-juli') === RENDER_NEU,
  'Ein Verkauf aus dem Juli bekommt den Render seiner Variante', await bildFuer('Hightechangel', 'h-juli'));
pruefe(await bildFuer('Hightechangel', 'h-mai') === RENDER_NEU,
  'Einer ganz ohne Icon auch', await bildFuer('Hightechangel', 'h-mai'));

// ── 3. Der neueste gewinnt ──────────────────────────────────────────
//
// Der Server rendert neu und vergibt dabei neue Adressen; an den Daten
// lösen sie sich ausnahmslos zeitlich ab.
console.log('\n— Wenn neu gerendert wurde —');

pruefe(await bildFuer('Hightechangel', 'h-gestern') === RENDER_NEU,
  'Auch der Verkauf mit dem alten Render zeigt den neuen', await bildFuer('Hightechangel', 'h-gestern'));

// ── 4. Aber nicht über die Variante hinaus ──────────────────────────
//
// Das Bild hängt am konkreten Item. "Runenbrecher" gibt es mit zwei
// Modellen; über den Namen allein bekäme das eine das Bild des anderen.
console.log('\n— Andere Variante, anderes Bild —');

const anders = await bildFuer('Hightechangel', 'h-anders');
pruefe(anders === ANGEL, 'Gleicher Name, andere Lore: kein fremder Render', anders);

// ── 5. Das handgepflegte Bild ist wieder da ─────────────────────────
//
// Seit Juli stand an jedem Item ein allgemeines Materialbild, und weil
// es zuerst gefragt wurde, kam config.js nie mehr zum Zug: Der Magnet
// war ein Blatt Papier.
console.log('\n— Handgepflegte Bilder —');

const gepflegt = await seite.evaluate(() => customAuctionIcons['Magnet']);
const magnet = await bildFuer('Magnet', 'm-1');
pruefe(magnet === gepflegt, 'Der Magnet zeigt wieder sein handgepflegtes Bild', magnet);
pruefe(magnet !== PAPIER, 'Und nicht das Blatt Papier der API');

// ── 6. Vanilla bleibt Vanilla ───────────────────────────────────────
console.log('\n— Gewöhnliche Items —');

const diamant = await bildFuer('DIAMOND', 'd-1');
pruefe(diamant === DIAMANT, 'Ein Diamant behält das Bild der API', diamant);

// ── 7. Bis auf die Seite ────────────────────────────────────────────
//
// Die Prüfungen darüber fragen die Funktion. Diese hier schaut, was
// wirklich gezeichnet wird — im Verlauf, wo die alten Verkäufe stehen.
console.log('\n— Was auf der Seite steht —');

await seite.evaluate(async () => {
  showSection('items');
  await renderItemSearch();
});
await seite.waitForTimeout(300);

const imItemsReiter = await seite.evaluate(() =>
  [...document.querySelectorAll('#itemsContainer img')].map((b) => b.getAttribute('src')));
pruefe(imItemsReiter.includes(RENDER_NEU), 'Der Items-Reiter zeigt die Angel mit ihrem Render',
  imItemsReiter.filter((s) => s.includes('opsucht') || s.includes('fishing')).join(', '));
pruefe(!imItemsReiter.includes(RENDER_ALT), 'Und nirgends den überholten', imItemsReiter.length + ' Bilder');

// Der Vertreter einer Variante im Items-Reiter ist das Item mit dem
// besten Bild — nicht einfach das erste mit irgendeinem Icon.
const vertreter = await seite.evaluate(() => {
  const index = buildItemIndex();
  const eintrag = Object.values(index).find((e) =>
    e.item.displayName === 'Hightechangel' && (e.item.lore || [])[0]?.includes('Legendär'));
  return eintrag?.item?.icon ?? null;
});
pruefe(vertreter === RENDER_NEU || vertreter === RENDER_ALT,
  'Als Vertreter steht ein Item mit Render', vertreter);

await browser.close();

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exitCode = fehler ? 1 : 0;
