// Voraussetzungen: Playwright, und die Seite muss ausgeliefert werden:
//   npx http-server . -p 8123     (abweichender Port über PORT=...)
//
// NODE_PATH hilft bei ESM nicht, deshalb wird die globale Installation
// notfalls selbst aufgelöst.
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

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
await p.goto(`http://127.0.0.1:${process.env.PORT || 8123}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

let fehler = 0;
const pruefe = (bed, text, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${text}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehler++;
};

const r = await p.evaluate(() => {
  const erg = {};

  // ── Lesbarer Materialname ──────────────────────────────────────
  erg.lesbar = {
    OAK_LOG: materialLesbar('OAK_LOG'),
    CHERRY_LEAVES: materialLesbar('CHERRY_LEAVES'),
    leer: materialLesbar(undefined),
  };

  // ── Marktkarte ohne name-Feld ──────────────────────────────────
  // Genau der Fall aus dem Screenshot: die API liefert kein name.
  App.settings = App.settings || {};
  App.settings.market = Object.assign({ name: true, buy: true, sell: true }, App.settings.market);
  const karte = createMarketCard('OAK_LOG', { icon: 'x.png' }, []);
  erg.marktName = karte.querySelector('h3')?.textContent ?? null;

  const karteMitName = createMarketCard('OAK_LOG', { icon: 'x.png', name: 'Eichenstamm' }, []);
  erg.marktNameEcht = karteMitName.querySelector('h3')?.textContent ?? null;

  // ── Variante auf der Auktionskarte ─────────────────────────────
  const auktion = {
    item: {
      material: 'PAPER',
      amount: 1,
      displayName: 'Bohrer V3',
      lore: ['', 'Gewinntyp » Sammelkarte'],
    },
    startBid: 1000,
    currentBid: 2000,
    endTime: new Date(Date.now() + 60000).toISOString(),
    bids: {},
  };
  const ak = createAuctionCard(auktion);
  erg.auktionVariante = ak.querySelector('.item-variante')?.textContent?.trim() ?? null;

  // ── Variantenfilter ────────────────────────────────────────────
  erg.filterFelder = {
    auktion: 'auctionVarianteFilter' in App,
    verlauf: 'historyVarianteFilter' in App,
  };
  const karteVar = itemVariante(auktion.item);
  const werkzeug = { material: 'NETHERITE_PICKAXE', displayName: 'Bohrer V3', lore: ['', 'Zustand: ✯✯✯'] };
  erg.filterTrennt = karteVar !== itemVariante(werkzeug);

  return erg;
});

console.log(JSON.stringify(r, null, 1), '\n');

pruefe(r.lesbar.OAK_LOG === 'Oak Log', 'Materialname wird lesbar', r.lesbar.OAK_LOG);
pruefe(r.lesbar.leer === '', 'leeres Material ergibt leeren Text');
pruefe(r.marktName === 'Oak Log', 'Marktkarte ohne name zeigt den Typ statt "undefined"', r.marktName);
pruefe(!/undefined/i.test(r.marktName || ''), 'kein "undefined" mehr auf der Marktkarte');
pruefe(r.marktNameEcht === 'Eichenstamm', 'echter Name wird weiterhin bevorzugt', r.marktNameEcht);
pruefe(r.auktionVariante === 'Sammelkarte', 'Auktionskarte weist die Variante aus', r.auktionVariante);
pruefe(r.filterFelder.auktion && r.filterFelder.verlauf, 'Variantenfilter sind im Zustand angelegt');
pruefe(r.filterTrennt, 'Sammelkarte und Werkzeug ergeben verschiedene Filterwerte');

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
await b.close();
process.exit(fehler === 0 ? 0 : 1);
