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

  // ── Spielerkopf ────────────────────────────────────────────────
  // Denselben Bau nutzen die Bieterkarten und die Verkäuferzeile im
  // Auktionsfenster. Der Buchstabe muss stehen bleiben: fällt das Bild
  // aus, ist er das Einzige, was den Kreis noch füllt.
  const kopf = document.createElement('div');
  kopf.className = 'player-initial-avatar player-initial-avatar--klein';
  kopf.innerHTML = 'N' + spielerKopfBild('11111111-2222-3333-4444-555555555555');
  document.body.appendChild(kopf);
  const bild = kopf.querySelector('img.player-kopf');
  erg.kopf = {
    bildDa: !!bild,
    ueberUuid: !!bild && bild.getAttribute('src').includes('11111111-2222-3333-4444-555555555555'),
    hatRueckfall: !!bild && (JSON.parse(bild.dataset.kopfkette || '[]').length > 0),
    buchstabeBleibt: kopf.textContent.trim() === 'N',
    breite: Math.round(kopf.getBoundingClientRect().width),
  };
  kopf.remove();

  // ── Knochenblock ───────────────────────────────────────────────
  // Die Seitentextur ist fast weiss; erkennbar ist der Block nur an den
  // Ringen der Oberseite. Sie muss vor den Rückfallstufen kommen.
  const bbKette = materialBildKandidaten('BONE_BLOCK');
  const bbOben = bbKette.findIndex((u) => u.endsWith('bone_block_top.png'));
  const bbSeite = bbKette.findIndex((u) => u.endsWith('bone_block_side.png'));
  erg.knochen = { oben: bbOben, seite: bbSeite, mitNamensraum: materialBildKandidaten('minecraft:bone_block')[1] || '' };

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
pruefe(r.kopf.bildDa, 'der Spielerkopf wird als Bild angelegt');
pruefe(r.kopf.ueberUuid, 'der Kopf wird über die UUID geholt, nicht über den Namen');
pruefe(r.kopf.hatRueckfall, 'es gibt einen zweiten Dienst als Rückfall');
pruefe(r.kopf.buchstabeBleibt, 'der Anfangsbuchstabe bleibt darunter stehen');
pruefe(r.kopf.breite === 24, 'die kleine Fassung misst 24 Pixel', r.kopf.breite + 'px');
pruefe(r.knochen.oben > 0 && r.knochen.oben < r.knochen.seite,
  'Knochenblock: die Oberseite kommt vor der Seitentextur',
  `oben ${r.knochen.oben}, seite ${r.knochen.seite}`);
pruefe(r.knochen.mitNamensraum.endsWith('bone_block_top.png'),
  'der Sonderfall greift auch mit Namensraum-Präfix',
  r.knochen.mitNamensraum.split('/').pop());

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
await b.close();
process.exit(fehler === 0 ? 0 : 1);
