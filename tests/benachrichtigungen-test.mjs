// Prüft die Discord-Anmeldung und die Benachrichtigungs-Verwaltung.
//
// Der Kern: Die Vorlaufzeit aus den Einstellungen muss auch dort gelten, wo
// eine Erinnerung gesetzt wird. Vorher standen dort feste fünf Minuten — wer
// dreißig einstellte, bekam trotzdem fünf, und der Knopf ließ Auktionen zu,
// für die der Bot nie rechtzeitig gelaufen wäre.
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

const ORT = `http://127.0.0.1:${process.env.PORT || 8123}/index.html`;

let fehler = 0;
function pruefe(label, bedingung, zusatz = '') {
  console.log(`${bedingung ? '  ok  ' : ' FAIL '} ${label}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bedingung) fehler += 1;
}

const ende = (min) => new Date(Date.now() + min * 60000).toISOString();
const auktionen = [
  { id: 'lang', seller: 'verkaeufer-uuid', startBid: 100, currentBid: 150, endTime: ende(45), bids: {},
    item: { material: 'DIAMOND_PICKAXE', displayName: 'Lange Auktion', amount: 1, lore: [], enchantments: {} } },
  { id: 'kurz', seller: 'verkaeufer-uuid', startBid: 50, currentBid: 50, endTime: ende(8), bids: {},
    item: { material: 'STONE', displayName: 'Kurze Auktion', amount: 1, lore: [], enchantments: {} } },
];

const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 1400, height: 1000 } });
const seitenfehler = [];
seite.on('pageerror', (e) => seitenfehler.push(String(e).split('\n')[0]));

// Ein Supabase-Ersatz, der sich merkt, was geschrieben wurde. Anders als in
// den übrigen Tests ist hier jemand angemeldet — sonst gäbe es weder
// Einstellungen noch Erinnerungen zu prüfen.
await seite.addInitScript(() => {
  window.__gespeichert = { upserts: [], oauth: [] };

  const NUTZER = {
    id: 'konto-1',
    email: null,
    identities: [{ provider: 'discord', id: '123456789' }],
    user_metadata: { full_name: 'TottiGermany881', avatar_url: null },
  };

  // Was der Server zurückgibt, je Tabelle.
  const bestand = {
    notification_settings: { sold_dm: true, reminder_dm: true, reminder_lead_minutes: 30, browser_popup: false },
    discord_verifications: { mc_name: '.TottiGermany881', mc_uuid: '00000000-0000-0000-0003-0000abcd1234', plattform: 'bedrock' },
    profiles: null,
    reminders: null,
  };

  function abfrageFuer(tabelle) {
    const antwort = { data: bestand[tabelle] ?? null, error: null };
    const q = {
      select: () => q, eq: () => q, order: () => q, limit: () => q, delete: () => q, update: () => q,
      insert: (zeile) => { window.__gespeichert.upserts.push({ tabelle, zeile }); return q; },
      upsert: (zeile) => { window.__gespeichert.upserts.push({ tabelle, zeile }); return q; },
      maybeSingle: async () => antwort,
      single: async () => antwort,
      then: (auf) => Promise.resolve({ data: [], error: null }).then(auf),
    };
    return q;
  }

  const rufe = [];
  window.supabase = {
    createClient: () => ({
      from: (tabelle) => abfrageFuer(tabelle),
      rpc: async () => ({ data: [], error: null }),
      channel: () => ({ on: () => ({ subscribe: () => {} }), subscribe: () => {} }),
      removeChannel: () => {},
      auth: {
        getSession: async () => ({ data: { session: { user: NUTZER } }, error: null }),
        getUser: async () => ({ data: { user: NUTZER }, error: null }),
        onAuthStateChange: (cb) => {
          rufe.push(cb);
          // Wie bei Supabase: der Rückruf kommt asynchron mit der Sitzung.
          setTimeout(() => cb('SIGNED_IN', { user: NUTZER }), 0);
          return { data: { subscription: { unsubscribe() {} } } };
        },
        signInWithOAuth: async (optionen) => {
          window.__gespeichert.oauth.push(optionen);
          return { data: {}, error: null };
        },
        signOut: async () => ({ data: null, error: null }),
      },
    }),
  };
  window.alert = () => {};
});

await seite.route(/api\.opsucht\.net|auction-history\.json|mitglieder\.json/, (route) => {
  const url = route.request().url();
  const json = (daten) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(daten) });

  if (url.includes('/auctions/active')) return json(auktionen);
  if (url.includes('auction-history.json')) return json({});
  return json([]);
});

try {
  await seite.goto(ORT, { waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(() => typeof App !== 'undefined' && App.auctionsData.length > 0, null, {
    timeout: 20000,
  });

  // ── Anmeldung ───────────────────────────────────────────────
  console.log('— Anmeldung —');
  const knopf = seite.locator('#authDiscordBtn');
  pruefe('Discord-Knopf im Anmeldefenster', (await knopf.count()) === 1);
  pruefe(
    'Keine E-Mail-Felder mehr',
    (await seite.locator('#authEmail').count()) === 0 && (await seite.locator('#authPassword').count()) === 0
  );

  await seite.evaluate(() => anmeldenMitDiscord());
  const oauth = await seite.evaluate(() => window.__gespeichert.oauth);
  pruefe('signInWithOAuth mit Provider discord', oauth[0]?.provider === 'discord', JSON.stringify(oauth[0] ?? {}));
  pruefe('Nur der identify-Zugriff', oauth[0]?.options?.scopes === 'identify', oauth[0]?.options?.scopes);

  // ── Profil-Verbindung ───────────────────────────────────────
  console.log('\n— Verbindung zum Bot —');
  const profil = await seite.evaluate(
    () => window.__gespeichert.upserts.find((u) => u.tabelle === 'profiles' && u.zeile.discord_id)
  );
  pruefe('discord_id landet im Profil', profil?.zeile?.discord_id === '123456789', JSON.stringify(profil ?? {}));
  pruefe('Name kommt mit', profil?.zeile?.discord_name === 'TottiGermany881', profil?.zeile?.discord_name);

  const angemeldet = await seite.evaluate(() => !!firebase.auth().currentUser?.discordId);
  pruefe('Konto gilt als angemeldet', angemeldet);

  // ── Einstellungen ───────────────────────────────────────────
  console.log('\n— Benachrichtigungs-Verwaltung —');
  await seite.evaluate(() => openProfileSettingsModal());
  await seite.waitForTimeout(400);

  const zustand = await seite.evaluate(() => ({
    verkauf: document.getElementById('dcVerkaufToggle')?.checked,
    erinnerung: document.getElementById('dcErinnerungToggle')?.checked,
    vorlauf: document.getElementById('dcVorlaufSelect')?.value,
    browser: document.getElementById('dcBrowserToggle')?.checked,
    hinweisSichtbar: document.getElementById('dcNotizNichtVerknuepft')?.style.display,
    einstellungen: App.dcEinstellungen,
  }));

  pruefe('Verkaufs-Schalter steht an', zustand.verkauf === true);
  pruefe('Erinnerungs-Schalter steht an', zustand.erinnerung === true);
  pruefe('Gespeicherte Vorlaufzeit wird gezeigt', zustand.vorlauf === '30', zustand.vorlauf);
  pruefe('Browser-Fenster ist aus', zustand.browser === false);
  pruefe('Hinweis bleibt weg, weil verknüpft', zustand.hinweisSichtbar === 'none', zustand.hinweisSichtbar);
  pruefe(
    'Nur die vier bekannten Felder im Zustand',
    Object.keys(zustand.einstellungen).sort().join(',') ===
      'browser_popup,reminder_dm,reminder_lead_minutes,sold_dm',
    Object.keys(zustand.einstellungen).join(',')
  );

  // Umstellen speichert unter der Discord-ID
  await seite.evaluate(() => setzeDcEinstellung('reminder_lead_minutes', 15));
  await seite.waitForTimeout(300);
  const gespeichert = await seite.evaluate(
    () => [...window.__gespeichert.upserts].reverse().find((u) => u.tabelle === 'notification_settings')
  );
  pruefe('Speichert unter der Discord-ID', gespeichert?.zeile?.discord_id === '123456789');
  pruefe('Neue Vorlaufzeit steht drin', gespeichert?.zeile?.reminder_lead_minutes === 15, String(gespeichert?.zeile?.reminder_lead_minutes));
  pruefe(
    'Fremde Spalten werden nicht mitgeschrieben',
    !('created_at' in (gespeichert?.zeile ?? {})),
    Object.keys(gespeichert?.zeile ?? {}).join(',')
  );

  await seite.evaluate(() => closeProfileSettingsModal());

  // ── Erinnerung mit Vorlaufzeit ──────────────────────────────
  console.log('\n— Erinnerung —');

  // Vorlaufzeit 15 Minuten: Die Auktion in 8 Minuten muss abgelehnt werden.
  const kurz = await seite.evaluate(async () => {
    const auktion = App.auctionsData.find((a) => a.id === 'kurz');
    let gezeigt = null;
    const alt = window.showConfirmModal;
    window.showConfirmModal = (titel, text) => { gezeigt = { titel, text }; return Promise.resolve(false); };
    const knopf = { classList: { add() {}, remove() {}, contains: () => false } };
    await scheduleNotification(auktion, knopf);
    window.showConfirmModal = alt;
    return gezeigt;
  });
  pruefe('Zu knappe Auktion wird abgelehnt', kurz !== null, JSON.stringify(kurz ?? {}));
  pruefe('Meldung nennt die eingestellte Zeit', kurz?.text?.includes('15 Minuten'), kurz?.text);

  // Die Auktion in 45 Minuten wird angenommen und gespeichert.
  await seite.evaluate(async () => {
    const auktion = App.auctionsData.find((a) => a.id === 'lang');
    const knopf = { classList: { add() {}, remove() {}, contains: () => false } };
    await scheduleNotification(auktion, knopf);
  });
  await seite.waitForTimeout(300);

  const zeile = await seite.evaluate(
    () => [...window.__gespeichert.upserts].reverse().find((u) => u.tabelle === 'reminders')
  );
  pruefe('Erinnerung wird gespeichert', !!zeile, JSON.stringify(zeile ?? {}));
  pruefe('discord_id steht als eigene Spalte', zeile?.zeile?.discord_id === '123456789', zeile?.zeile?.discord_id);
  pruefe('end_time steht als eigene Spalte', typeof zeile?.zeile?.end_time === 'string', String(zeile?.zeile?.end_time));
  pruefe('notified_at wird zurückgesetzt', zeile?.zeile?.notified_at === null, String(zeile?.zeile?.notified_at));

  // browser_popup ist in diesem Konto aus — es darf kein Timer laufen,
  // die Erinnerung selbst aber trotzdem stehen.
  const timer = await seite.evaluate(() => Object.keys(App.scheduledNotifications).length);
  pruefe('Kein Browser-Timer bei abgeschaltetem Fenster', timer === 0, String(timer));

  const merker = await seite.evaluate(() => Object.keys(App.userReminders).length);
  pruefe('Erinnerung trotzdem gemerkt', merker === 1, String(merker));

  // ── Verknüpfung wird gelesen, nicht selbst gemacht ──────────
  console.log('\n— Minecraft-Verknüpfung —');
  const verknuepfung = await seite.evaluate(() => ladeDiscordVerknuepfung());
  pruefe('Verknüpfung kommt aus discord_verifications', verknuepfung?.mc_name === '.TottiGermany881', JSON.stringify(verknuepfung ?? {}));

  await seite.evaluate(() => loadMinecraftVerificationStatus());
  await seite.waitForTimeout(300);
  const anzeige = await seite.evaluate(() => ({
    name: document.getElementById('verified-mc-name')?.textContent,
    uuid: document.getElementById('verified-mc-uuid')?.textContent,
    verifiziert: document.getElementById('minecraft-verified-ui')?.style.display,
    offen: document.getElementById('minecraft-unverified-ui')?.style.display,
  }));
  pruefe('Name wird angezeigt', anzeige.name === '.TottiGermany881', anzeige.name);
  pruefe('UUID wird angezeigt', anzeige.uuid?.startsWith('00000000-'), anzeige.uuid);
  pruefe('Verifiziert-Bereich sichtbar', anzeige.verifiziert === 'block', anzeige.verifiziert);
  pruefe('Der alte Ablauf ist weg', anzeige.offen === 'none', anzeige.offen);
  pruefe(
    'Kein Code-Formular mehr im Dokument',
    (await seite.locator('#minecraft-ign-input').count()) === 0 &&
      (await seite.locator('#start-verification-btn').count()) === 0
  );

  // ── Anker aus der Discord-Nachricht ─────────────────────────
  console.log('\n— Anker #benachrichtigungen —');
  await seite.evaluate(() => {
    window.location.hash = '#benachrichtigungen';
  });
  await seite.waitForTimeout(500);
  const offen = await seite.evaluate(
    () => document.getElementById('profileSettingsModal')?.classList.contains('show')
  );
  pruefe('Der Knopf aus der DM öffnet die Verwaltung', offen === true);

  pruefe('Keine Skriptfehler auf der Seite', seitenfehler.length === 0, seitenfehler.join(' | '));
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
