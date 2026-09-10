// Prüft den Zeitraum-Umschalter im Item-Fenster: 15, 30 oder 90 Tage.
//
// Der Fall, um den es geht, ist die Kopplung: Die Zahl und die Kurve
// darunter müssen denselben Zeitraum meinen. Stünde neben dem
// 15-Tage-Schnitt die Kurve aus einem Vierteljahr, fiele das niemandem
// auf — und in die Irre führte es trotzdem.
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

// Verkäufe mit bekanntem Alter und bekanntem Preis. Die drei Zeiträume
// ergeben mit Absicht drei verschiedene Zahlen — sonst ließe sich nicht
// unterscheiden, ob der Umschalter wirkt oder nur anders aussieht:
//
//   15 Tage  (400+400+300+300) / 4   = 350
//   30 Tage  (… + 250 + 250)   / 6   = 316,67 → 317
//   90 Tage  (… + 200 + 200)   / 8   = 287,5  → 288
const TAG = 24 * 60 * 60 * 1000;
const verlauf = { Zeitprobe: [] };
let lauf = 0;
for (const [alter, preis] of [[2, 400], [3, 400], [10, 300], [11, 300],
                              [20, 250], [21, 250], [40, 200], [41, 200]]) {
  lauf += 1;
  const zeit = new Date(Date.now() - alter * TAG).toISOString();
  verlauf.Zeitprobe.push({
    // Eigener Verkäufer je Eintrag: Sonst könnte die Entdopplung zwei
    // davon für eine verlängerte Auktion halten und einen wegwerfen.
    seller: `uuid-v${lauf}`,
    highestBidder: 'uuid-k',
    startBid: preis, currentBid: preis, finalPrice: preis,
    soldAt: zeit,
    endTime: zeit,
    bids: { 'uuid-k': preis },
    item: { material: 'EMERALD', displayName: 'Zeitprobe', amount: 1, lore: [], enchantments: {} },
  });
}

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
p.on('pageerror', (e) => console.log('PAGEERROR:', String(e).split('\n')[0]));
await p.goto(`http://127.0.0.1:${process.env.PORT || 8123}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

const r = await p.evaluate(async (daten) => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach((m) => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');

  localStorage.removeItem('itemDetailZeitraum');
  App.auctionHistory = daten;
  App.auctionsData = [];

  const schluessel = Object.keys(buildItemIndex()).find((k) => k.startsWith('Zeitprobe'));
  const modal = document.getElementById('itemDetailModal');
  modal.style.display = '';

  const lies = () => ({
    zahl: document.getElementById('itemDetailAvg')?.textContent.trim(),
    aktiv: [...document.querySelectorAll('#itemDetailZeitraum button.aktiv')].map((k) => k.textContent.trim()),
    knoepfe: [...document.querySelectorAll('#itemDetailZeitraum button')].map((k) => k.textContent.trim()),
    // Die Kurve als Bilddaten: Sie ändert sich nur, wenn wirklich andere
    // Verkäufe gezeichnet werden.
    kurve: document.querySelector('#itemDetailChart canvas')?.toDataURL() ?? null,
    gemerkt: localStorage.getItem('itemDetailZeitraum'),
  });

  const klick = async (beschriftung) => {
    [...document.querySelectorAll('#itemDetailZeitraum button')]
      .find((k) => k.textContent.trim() === beschriftung)?.click();
    await new Promise((f) => setTimeout(f, 250));
    return lies();
  };

  await openItemDetail(schluessel);
  await new Promise((f) => setTimeout(f, 250));

  const vorgabe = lies();
  const auf15 = await klick('15 Tage');
  const auf90 = await klick('90 Tage');

  // Und noch einmal von vorn: Bleibt die Wahl beim nächsten Item stehen?
  closeItemDetail();
  await openItemDetail(schluessel);
  await new Promise((f) => setTimeout(f, 250));
  const wieder = lies();

  return { vorgabe, auf15, auf90, wieder };
}, verlauf);

let fehler = 0;
const pruefe = (bed, text, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${text}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehler++;
};

pruefe(r.vorgabe.knoepfe.join('|') === '15 Tage|30 Tage|90 Tage',
  'Drei Zeiträume stehen zur Wahl', r.vorgabe.knoepfe.join('|'));
pruefe(r.vorgabe.aktiv.join() === '30 Tage', 'Ohne Zutun sind es 30 Tage', r.vorgabe.aktiv.join());
pruefe(r.vorgabe.zahl === '317', 'Und der Schnitt gilt für diese 30 Tage', r.vorgabe.zahl);

pruefe(r.auf15.zahl === '350', 'Ein Klick auf 15 Tage rechnet neu', r.auf15.zahl);
pruefe(r.auf15.aktiv.join() === '15 Tage', 'Der gewählte Knopf ist hervorgehoben', r.auf15.aktiv.join());
pruefe(r.auf90.zahl === '288', 'Und 90 Tage nehmen auch die alten Verkäufe mit', r.auf90.zahl);

pruefe(Boolean(r.vorgabe.kurve && r.auf15.kurve && r.auf90.kurve), 'Zu jedem Zeitraum wird gezeichnet');
pruefe(r.auf15.kurve !== r.vorgabe.kurve && r.auf90.kurve !== r.auf15.kurve,
  'Die Kurve zieht mit — nicht nur die Zahl');

pruefe(r.auf90.gemerkt === '90', 'Die Wahl wird gemerkt', String(r.auf90.gemerkt));
pruefe(r.wieder.aktiv.join() === '90 Tage' && r.wieder.zahl === '288',
  'Und steht beim nächsten Item noch', `${r.wieder.aktiv.join()} / ${r.wieder.zahl}`);

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
await b.close();
process.exit(fehler === 0 ? 0 : 1);
