// Prüft den Spieler-Reiter: Bestenliste, Sortierung, Profil und zurück.
//
// Die Zahlen kommen aus erfundenen Daten, die hier in die App gelegt
// werden. Das ist Absicht: der echte Verlauf ändert sich täglich, und ein
// Test, dessen erwartetes Ergebnis mitwandert, prüft nichts.
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

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 1000 } });
const seitenfehler = [];
p.on('pageerror', (e) => seitenfehler.push(String(e).split('\n')[0]));

await p.goto(`http://127.0.0.1:${process.env.PORT || 8123}/index.html`, {
  waitUntil: 'domcontentloaded'
});
await p.waitForTimeout(2500);

let fehler = 0;
const pruefe = (bed, t, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${t}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehler++;
};

// Zora verkauft viel, Anton nimmt am meisten ein, Mira hat die einzige
// laufende Auktion. Damit trennt jede Sortierart die drei anders.
const gelegt = await p.evaluate(() => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach((m) => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');

  // script.js bricht hier früh ab (das Supabase-CDN ist gesperrt), dadurch
  // fehlt App.settings. App ist ein const auf oberster Ebene und liegt
  // NICHT an window — der Name muss direkt getroffen werden.
  App.settings = App.settings || {};
  App.settings.design = App.settings.design || { itemRain: false };
  App.settings.market = App.settings.market || { name: true };
  App.settings.players = App.settings.players || { name: true, auctions: true, bids: true, 'bid-amount': true };

  const A = 'aaaaaaaa-1111-1111-1111-111111111111';
  const B = 'bbbbbbbb-2222-2222-2222-222222222222';
  const C = 'cccccccc-3333-3333-3333-333333333333';
  App.uuidCache[A] = 'Zora';
  App.uuidCache[B] = 'Anton';
  App.uuidCache[C] = 'Mira';

  const jetzt = new Date().toISOString();
  App.auctionHistory = {
    'Bohrer V3': [
      { seller: A, highestBidder: B, currentBid: 1000, endTime: jetzt, item: { material: 'PAPER', displayName: 'Bohrer V3', amount: 1 } },
      { seller: A, highestBidder: C, currentBid: 500, endTime: jetzt, item: { material: 'PAPER', displayName: 'Bohrer V3', amount: 1 } },
      { seller: B, highestBidder: A, currentBid: 8000, endTime: jetzt, item: { material: 'BONE_BLOCK', displayName: 'Knochenblock', amount: 1 } }
    ]
  };
  App.auctionsData = [
    {
      seller: C,
      bids: { [A]: 50 },
      item: { material: 'DIAMOND', displayName: 'Diamant', amount: 1 },
      startBid: 10,
      currentBid: 50,
      endTime: new Date(Date.now() + 9e5).toISOString()
    }
  ];
  App.spielerListe = null;
  showSection('players');
  return { A, B, C };
});
await p.waitForTimeout(1200);

const liste = () =>
  p.evaluate(() => ({
    kopf: document.querySelector('.spieler-kopfzeile')?.textContent || '',
    karten: [...document.querySelectorAll('#playersContainer .spieler-karte')].map((k) => ({
      rang: k.querySelector('.spieler-karte__rang')?.textContent,
      name: k.querySelector('.players-name')?.textContent,
      // Die Zahl ist der Textknoten neben der Beschriftung.
      wert: k.querySelector('.spieler-karte__wert')?.lastChild?.textContent?.trim(),
      kopfbild: !!k.querySelector('img.player-kopf')
    }))
  }));

const start = await liste();
console.log(JSON.stringify(start, null, 1), '\n');

pruefe(start.karten.length === 3, 'alle drei Spieler stehen in der Liste', String(start.karten.length));
pruefe(start.karten.every((k) => k.kopfbild), 'jede Karte trägt ein Minecraft-Kopfbild');
pruefe(start.karten[0].rang === '#1', 'die Platzziffer steht an der Karte', start.karten[0].rang);
pruefe(/Höchste Summe/.test(start.kopf), 'die Kopfzeile nennt die Sortierung', start.kopf);

// Einnahmen + Ausgaben: Zora 1500+8000, Anton 8000+1000, Mira 0+500
pruefe(start.karten[0].name === 'Zora', 'Höchste Summe: Zora führt', start.karten[0].name);
pruefe(start.karten[0].wert === '9.500', 'der Wert der Sortierung steht auf der Karte', start.karten[0].wert);

const erwartet = {
  EARNED: ['Anton', 'Zora', 'Mira'],
  SPENT: ['Zora', 'Anton', 'Mira'],
  SOLD: ['Zora', 'Anton', 'Mira'],
  ACTIVE: ['Mira', 'Zora', 'Anton'],
  NAME: ['Anton', 'Mira', 'Zora']
};

for (const [modus, reihe] of Object.entries(erwartet)) {
  await p.evaluate((m) => setPlayerSort(m), modus);
  await p.waitForTimeout(400);
  const jetzt = (await liste()).karten.map((k) => k.name);
  // Bei gleichem Wert ist die Reihenfolge offen — deshalb nur der erste
  // Platz, der in diesen Daten überall eindeutig ist.
  pruefe(jetzt[0] === reihe[0], `${modus}: ${reihe[0]} steht vorn`, jetzt.join(' > '));
}

// ── Profil und zurück ──
await p.evaluate(() => setPlayerSort('SUM'));
await p.waitForTimeout(400);
await p.click('#playersContainer .spieler-karte');
await p.waitForTimeout(800);

const profil = await p.evaluate(() => ({
  titel: document.querySelector('#playersContainer h2')?.textContent,
  werte: [...document.querySelectorAll('#playersContainer .auction-info-box .info-item')]
    .map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
  zurueck: !!document.querySelector('#playersContainer .back-btn'),
  reiterDa: document.querySelectorAll('#tabs button').length
}));
console.log('\n' + JSON.stringify(profil, null, 1), '\n');

pruefe(profil.titel === 'Zora', 'der Klick öffnet das richtige Profil', profil.titel);
pruefe(profil.werte.some((t) => /Erfolgreich verkauft2/.test(t)), 'die Verkäufe stimmen');
pruefe(profil.werte.some((t) => /Gesamt eingenommen1\.500/.test(t)), 'die Einnahmen stimmen');
pruefe(profil.werte.some((t) => /Gesamt ausgegeben8\.000/.test(t)), 'die Ausgaben stimmen');
pruefe(profil.reiterDa >= 9, 'die Reiterleiste bleibt stehen', String(profil.reiterDa));

await p.click('#playersContainer .back-btn');
await p.waitForTimeout(800);
const zurueck = await liste();
pruefe(zurueck.karten.length === 3, 'Zurück führt in die Bestenliste', String(zurueck.karten.length));

// Der Profil-Cache muss aus dem einen Durchlauf gefüllt sein — sonst
// läuft renderPlayerProfile für jeden Spieler erneut durch den Verlauf.
const cache = await p.evaluate((u) => App.playerStatsCache[u] || null, gelegt.A);
pruefe(cache && cache.sold === 2 && cache.earned === 1500,
  'die Bestenliste füllt den Profil-Cache gleich mit', JSON.stringify(cache));

// Suche über das Feld filtert nach bekannten Namen.
await p.fill('#searchPlayers', 'anton');
await p.waitForTimeout(700);
const gefiltert = await liste();
pruefe(gefiltert.karten.length === 1 && gefiltert.karten[0].name === 'Anton',
  'die Suche filtert die Liste', gefiltert.karten.map((k) => k.name).join(','));

const echteFehler = seitenfehler.filter(
  (t) => !/supabase|firebase/i.test(t)
);
console.log('\nJS-Fehler:', echteFehler.length ? echteFehler : 'keine');
pruefe(echteFehler.length === 0, 'keine unerwarteten Skriptfehler');

await b.close();
console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
