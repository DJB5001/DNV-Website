// Prüft Suchleiste, die Filter nach Item-Art und die Verzauberungen auf den
// Auktionskarten — gegen erfundene, aber realistisch geformte Auktionen.
//
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

const ORT = `http://127.0.0.1:${process.env.PORT || 8123}/index.html`;

let fehler = 0;
function pruefe(label, bedingung, zusatz = '') {
  console.log(`${bedingung ? '  ok  ' : ' FAIL '} ${label}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bedingung) fehler += 1;
}

// Die Materialien und Verzauberungsschlüssel sind so geschrieben, wie sie
// wirklich aus der API kommen — inklusive "minecraft:"-Namensraum.
const ende = (min) => new Date(Date.now() + min * 60000).toISOString();
const auktionen = [
  { id: 'a1', seller: 's1', startBid: 100, currentBid: 150, endTime: ende(30), bids: {},
    item: { material: 'DIAMOND_PICKAXE', displayName: 'OP Spitzhacke', amount: 1, lore: [],
            enchantments: { 'minecraft:efficiency': 5, 'minecraft:unbreaking': 160, 'minecraft:mending': 1, 'minecraft:fortune': 3 } } },
  { id: 'a2', seller: 's2', startBid: 50, currentBid: 50, endTime: ende(60), bids: {},
    item: { material: 'ZOMBIE_SPAWN_EGG', displayName: 'Zombie Spawn-Ei', amount: 3, lore: [], enchantments: {} } },
  { id: 'a3', seller: 's3', startBid: 10, currentBid: 20, endTime: ende(90), bids: {},
    item: { material: 'PLAYER_HEAD', displayName: 'Sonnen Talisman', amount: 1, lore: [], enchantments: {} } },
  { id: 'a4', seller: 's4', startBid: 5, currentBid: 5, endTime: ende(120), bids: {},
    item: { material: 'ELYTRA', displayName: 'Odins Schwingen', amount: 1, lore: [],
            enchantments: { 'minecraft:unbreaking': 3 } } },
  { id: 'a5', seller: 's5', startBid: 1, currentBid: 2, endTime: ende(150), bids: {},
    item: { material: 'PURPLE_SHULKER_BOX', displayName: 'Shulker', amount: 1, lore: [], enchantments: {} } },
  { id: 'a6', seller: 's6', startBid: 7, currentBid: 9, endTime: ende(180), bids: {},
    item: { material: 'STONE', displayName: 'Ganz normaler Stein', amount: 64, lore: [], enchantments: {} } },
];

const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const seitenfehler = [];
seite.on('pageerror', (e) => seitenfehler.push(String(e).split('\n')[0]));

// Supabase kommt von einem CDN. Ohne Netz bricht supabase-config.js mit einem
// alert ab, und dann läuft script.js gar nicht erst an. Für diesen Test wird
// deshalb ein Minimal-Ersatz vorgeschoben: Er beantwortet, was beim Start
// gefragt wird — angemeldet ist dabei niemand.
await seite.addInitScript(() => {
  const leer = { data: null, error: null };
  const abfrage = {
    select: () => abfrage, insert: () => abfrage, upsert: () => abfrage,
    update: () => abfrage, delete: () => abfrage, eq: () => abfrage,
    order: () => abfrage, limit: () => abfrage,
    maybeSingle: async () => leer, single: async () => leer,
    then: (auf) => Promise.resolve({ data: [], error: null }).then(auf),
  };
  window.supabase = {
    createClient: () => ({
      from: () => abfrage,
      rpc: async () => ({ data: [], error: null }),
      channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
      removeChannel: () => {},
      auth: {
        getSession: async () => ({ data: { session: null }, error: null }),
        getUser: async () => ({ data: { user: null }, error: null }),
        onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
        signOut: async () => leer,
      },
    }),
  };
  window.alert = () => {};

  // Der Hinweis beim ersten Besuch legt sich über die Seite und fängt jeden
  // Klick ab. Für den Test ist er schon gesehen.
  sessionStorage.setItem('hasSeenDisclaimer', 'true');
  sessionStorage.setItem('cookiesAccepted', 'true');
});

// Auktionen und Verlauf abfangen, damit der Test nicht am Netz hängt.
//
// Bewusst eine einzige Route mit Fallunterscheidung: Playwright wertet
// mehrere Routen in umgekehrter Reihenfolge aus, ein später eingetragenes
// Auffangmuster würde die genauere Route also überstimmen.
await seite.route(/api\.opsucht\.net|auction-history\.json/, (route) => {
  const url = route.request().url();
  const json = (daten) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(daten) });

  if (url.includes('/auctions/active')) return json(auktionen);
  if (url.includes('auction-history.json')) return json({});
  return json([]);
});

const karten = () =>
  seite.evaluate(() =>
    [...document.querySelectorAll('#auctionContainer .card')].map((k) => ({
      name: k.querySelector('.auction-name')?.textContent,
      verzauberungen: [...k.querySelectorAll('.enchant-badge')].map((b) => b.textContent.trim()),
      titel: k.querySelector('.auction-enchants')?.getAttribute('title') ?? '',
    }))
  );

try {
  await seite.goto(ORT, { waitUntil: 'domcontentloaded' });

  // init() lädt zuerst Markt, Auktionen und Shards und zeigt solange "clan".
  await seite.waitForFunction(() => typeof App !== 'undefined' && App.auctionsData.length > 0, null, {
    timeout: 20000,
  });
  await seite.evaluate(() => goToTab('auctions'));
  await seite.waitForFunction(() => document.querySelectorAll('#auctionContainer .card').length > 0, null, {
    timeout: 15000,
  });

  // ── Suchleiste ──────────────────────────────────────────────
  console.log('— Suchleiste —');
  const feld = seite.locator('#searchAuctions');
  pruefe('Suchfeld ist da', (await feld.count()) === 1);

  await feld.fill('spawn');
  await seite.waitForTimeout(400);
  let sichtbar = await karten();
  pruefe('Suche nach "spawn" findet das Ei', sichtbar.length === 1 && sichtbar[0].name.includes('Spawn-Ei'),
    sichtbar.map((k) => k.name).join(', '));

  // Material statt Anzeigename
  await feld.fill('elytra');
  await seite.waitForTimeout(400);
  sichtbar = await karten();
  pruefe('Suche greift auch auf das Material', sichtbar.length === 1 && sichtbar[0].name === 'Odins Schwingen',
    sichtbar.map((k) => k.name).join(', '));

  // Verzauberung — der eigentliche Zugewinn
  await feld.fill('behutsam');
  await seite.waitForTimeout(400);
  pruefe('Unbekannte Verzauberung findet nichts', (await karten()).length === 0);

  await feld.fill('reparatur');
  await seite.waitForTimeout(400);
  sichtbar = await karten();
  pruefe('Suche nach "reparatur" findet die Spitzhacke', sichtbar.length === 1 && sichtbar[0].name === 'OP Spitzhacke',
    sichtbar.map((k) => k.name).join(', '));

  await feld.fill('');
  await seite.waitForTimeout(400);
  pruefe('Leeres Feld zeigt wieder alle', (await karten()).length === auktionen.length);

  // ── Verzauberungen auf der Karte ────────────────────────────
  console.log('\n— Verzauberungen —');
  const alle = await karten();
  const hacke = alle.find((k) => k.name === 'OP Spitzhacke');
  const stein = alle.find((k) => k.name === 'Ganz normaler Stein');

  pruefe('Deutscher Name statt "minecraft:"', hacke.verzauberungen.some((v) => v.startsWith('Effizienz')),
    hacke.verzauberungen.join(' | '));
  pruefe('Kein Namensraum mehr sichtbar', !hacke.verzauberungen.join(' ').toLowerCase().includes('minecraft'));
  pruefe('Römische Stufe bis zehn', hacke.verzauberungen.includes('Effizienz V'), hacke.verzauberungen.join(' | '));
  pruefe('Darüber die Zahl', hacke.titel.includes('Haltbarkeit 160'), hacke.titel);
  pruefe('Stärkste zuerst', hacke.verzauberungen[0] === 'Haltbarkeit 160', hacke.verzauberungen[0]);
  pruefe('Höchstens drei plus Rest', hacke.verzauberungen.length === 4 && hacke.verzauberungen.at(-1) === '+1',
    hacke.verzauberungen.join(' | '));
  pruefe('Alle vier stehen im Titel', hacke.titel.split('·').length === 4, hacke.titel);
  pruefe('Ohne Verzauberung keine Leiste', stein.verzauberungen.length === 0);

  // ── Filter nach Art ─────────────────────────────────────────
  console.log('\n— Filter nach Art —');
  const arten = await seite.evaluate(() =>
    [...document.querySelectorAll('#auction-filters optgroup[label="Nach Art"] option')].map((o) => ({
      wert: o.value,
      text: o.textContent,
    }))
  );
  pruefe('Gruppe "Nach Art" existiert', arten.length > 0, `${arten.length} Einträge`);
  pruefe('OP-Items dabei', arten.some((a) => a.wert === 'art:op'));
  pruefe('Spawn-Eier dabei', arten.some((a) => a.wert === 'art:spawnegg'));
  pruefe('Verzauberte dabei', arten.some((a) => a.wert === 'art:verzaubert'));
  pruefe('Trefferzahl steht dabei', arten.find((a) => a.wert === 'art:op')?.text.includes('(1)'),
    arten.find((a) => a.wert === 'art:op')?.text);
  pruefe('Leere Arten fehlen', !arten.some((a) => a.wert === 'art:platte'), arten.map((a) => a.wert).join(', '));

  // Gefiltert wird über die Chips — das Auswahlfeld dahinter ist nur noch
  // die Datenquelle und für den Besucher unsichtbar. Der Test geht deshalb
  // denselben Weg wie er: klicken, nicht auswählen.
  const waehle = async (wert) => {
    await seite.click(`.ah-chip[data-wert="${wert}"]`);
    await seite.waitForTimeout(400);
    return karten();
  };

  let treffer = await waehle('art:op');
  pruefe('OP-Items filtert richtig', treffer.length === 1 && treffer[0].name === 'OP Spitzhacke',
    treffer.map((k) => k.name).join(', '));

  treffer = await waehle('art:spawnegg');
  pruefe('Spawn-Eier über das Material erkannt', treffer.length === 1 && treffer[0].name.includes('Spawn-Ei'));

  treffer = await waehle('art:verzaubert');
  pruefe('Verzauberte: nur die beiden', treffer.length === 2, treffer.map((k) => k.name).join(', '));

  treffer = await waehle('art:talisman');
  pruefe('Talisman über den Namen erkannt', treffer.length === 1 && treffer[0].name.includes('Talisman'));

  treffer = await waehle('art:kopf');
  pruefe('Spielerkopf über das Material', treffer.length === 1 && treffer[0].name.includes('Talisman'));

  treffer = await waehle('art:shulker');
  pruefe('Shulker erkannt', treffer.length === 1 && treffer[0].name === 'Shulker');

  treffer = await waehle('art:elytra');
  pruefe('Elytra erkannt', treffer.length === 1 && treffer[0].name === 'Odins Schwingen');

  treffer = await waehle('Alle');
  pruefe('Zurück auf Alle', treffer.length === auktionen.length);

  // Suche und Art greifen zusammen
  await feld.fill('spitzhacke');
  await seite.waitForTimeout(300);
  treffer = await waehle('art:spawnegg');
  pruefe('Suche und Art zusammen ergeben nichts', treffer.length === 0);

  pruefe('Keine Skriptfehler auf der Seite', seitenfehler.length === 0, seitenfehler.join(' | '));
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
