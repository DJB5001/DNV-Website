// Prüft, dass Hinweis und Cookie-Banner nur einmal kommen.
//
// Die eigentliche Probe steckt im zweiten Browser-Kontext:
// context.storageState() nimmt localStorage mit, sessionStorage aber
// nicht — das ist genau ein geschlossener und neu geöffneter Browser.
// Vorher lagen die Merker in sessionStorage, und deshalb stand beides
// bei jedem Besuch wieder da.
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
const TAG = 24 * 60 * 60 * 1000;

let fehler = 0;
const pruefe = (bed, text, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${text}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehler++;
};

const browser = await chromium.launch();

/**
 * Eine geladene Seite, auf der nur die beiden Fenster stören dürfen.
 *
 * checkDisclaimer() wird von Hand gerufen und nicht init() überlassen:
 * init() wartet vorher auf Markt, Auktionen und Shards, und ohne Netz
 * kommt es nie so weit. Geprüft werden soll die Entscheidung, nicht die
 * Ladekette davor.
 */
async function seiteOeffnen(kontext) {
  const seite = await kontext.newPage();
  await seite.goto(ADRESSE, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(1500);
  await seite.evaluate(() => {
    document.querySelectorAll('.modal:not(.disclaimer-modal)').forEach((m) => (m.style.display = 'none'));
    document.body.classList.remove('loading', 'modal-open');
  });
  return seite;
}

const sichtbar = (seite) =>
  seite.evaluate(() => ({
    hinweis: getComputedStyle(document.getElementById('disclaimerModal')).display !== 'none',
    banner: getComputedStyle(document.getElementById('cookieConsentModal')).display !== 'none',
  }));

/** Beide Fenster zurück auf Anfang, dann neu entscheiden lassen. */
async function nochmalFragen(seite) {
  await seite.evaluate(() => {
    document.getElementById('disclaimerModal').style.display = 'none';
    document.getElementById('disclaimerModal').classList.remove('show');
    document.getElementById('cookieConsentModal').style.display = 'none';
    checkDisclaimer();
  });
  await seite.waitForTimeout(900); // 300 ms Ausblenden + 500 ms Vorlauf
}

// ── 1. Erster Besuch: beides kommt, beides lässt sich wegklicken ────
console.log('— Erster Besuch —');

const ersterKontext = await browser.newContext();
let seite = await seiteOeffnen(ersterKontext);

await seite.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
});
await nochmalFragen(seite);

let stand = await sichtbar(seite);
pruefe(stand.hinweis, 'Der Hinweis kommt beim ersten Besuch');
pruefe(!stand.banner, 'Das Banner wartet noch');

await seite.click('.disclaimer-btn');
await seite.waitForTimeout(900);
stand = await sichtbar(seite);
pruefe(!stand.hinweis, 'Nach "Verstanden" ist der Hinweis weg');
pruefe(stand.banner, 'Und jetzt kommt das Cookie-Banner');

await seite.click('.cookie-consent-content .auth-submit-btn:not(.decline-btn)');
await seite.waitForTimeout(600);
stand = await sichtbar(seite);
pruefe(!stand.banner, 'Nach "Zustimmen" ist auch das weg');

const gemerkt = await seite.evaluate(() => ({
  hinweis: localStorage.getItem('hasSeenDisclaimer'),
  cookies: localStorage.getItem('cookiesAccepted'),
}));
pruefe(Number(gemerkt.hinweis) > 0 && Number(gemerkt.cookies) > 0,
  'Beides steht als Zeitpunkt in localStorage', JSON.stringify(gemerkt));

// ── 2. Browser zu, Browser auf ──────────────────────────────────────
//
// Der Fall, um den es geht. storageState() trägt localStorage
// hinüber, sessionStorage nicht — genau wie ein neu gestarteter Browser.
console.log('\n— Nach dem Neustart des Browsers —');

const zustand = await ersterKontext.storageState();
await ersterKontext.close();

const zweiterKontext = await browser.newContext({ storageState: zustand });
seite = await seiteOeffnen(zweiterKontext);

const frisch = await seite.evaluate(() => sessionStorage.length);
pruefe(frisch === 0, 'Die Sitzung ist wirklich neu — sonst prüfte das hier nichts',
  `${frisch} Einträge in sessionStorage`);

await nochmalFragen(seite);
stand = await sichtbar(seite);
pruefe(!stand.hinweis, 'Der Hinweis kommt nicht wieder');
pruefe(!stand.banner, 'Das Cookie-Banner auch nicht');

// ── 3. Nach zwölf Monaten einmal neu fragen ─────────────────────────
console.log('\n— Nach einem Jahr —');

await seite.evaluate((vorMonaten) => {
  localStorage.setItem('hasSeenDisclaimer', String(vorMonaten));
  localStorage.setItem('cookiesAccepted', String(vorMonaten));
}, Date.now() - 396 * TAG);
await nochmalFragen(seite);
stand = await sichtbar(seite);
pruefe(stand.hinweis, 'Nach dreizehn Monaten wird wieder gefragt');

await seite.evaluate((vorTagen) => {
  localStorage.setItem('hasSeenDisclaimer', String(vorTagen));
  localStorage.setItem('cookiesAccepted', String(vorTagen));
}, Date.now() - 300 * TAG);
await nochmalFragen(seite);
stand = await sichtbar(seite);
pruefe(!stand.hinweis && !stand.banner, 'Nach zehn Monaten noch nicht');

// ── 4. "Ablehnen" hält genauso lange ────────────────────────────────
console.log('\n— Ablehnen —');

await seite.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  localStorage.setItem('hasSeenDisclaimer', String(Date.now()));
});
await nochmalFragen(seite);
pruefe((await sichtbar(seite)).banner, 'Ohne Entscheidung kommt das Banner');

await seite.click('.cookie-consent-content .decline-btn');
await seite.waitForTimeout(600);
await nochmalFragen(seite);
stand = await sichtbar(seite);
pruefe(!stand.banner, 'Nach "Ablehnen" bleibt es weg');
pruefe(Number(await seite.evaluate(() => localStorage.getItem('cookiesDeclined'))) > 0,
  'Und auch das wird als Zeitpunkt gemerkt');

// ── 5. Wer gerade zugestimmt hat, wird nicht noch einmal gefragt ────
//
// Beim Ausrollen liegt die Zustimmung der Leute, die gerade auf der
// Seite sind, noch im alten sessionStorage. Die soll gelten.
console.log('\n— Übernahme aus der alten Fassung —');

await seite.evaluate(() => {
  localStorage.clear();
  sessionStorage.clear();
  sessionStorage.setItem('hasSeenDisclaimer', 'true');
  sessionStorage.setItem('cookiesAccepted', 'true');
});
await nochmalFragen(seite);
stand = await sichtbar(seite);
pruefe(!stand.hinweis && !stand.banner, 'Das alte "true" gilt weiter');
pruefe(Number(await seite.evaluate(() => localStorage.getItem('hasSeenDisclaimer'))) > 0,
  'Und wandert dabei als Zeitpunkt nach localStorage');

// ── 6. Der Besucherzähler bleibt, wo er ist ─────────────────────────
//
// hasCountedVisit zählt einen Besuch je Sitzung. In localStorage würde
// jeder Mensch genau einmal im Leben gezählt, und der Zähler bliebe für
// alle Stammbesucher stehen. Dieselbe Zeile Code, die umgekehrte
// Absicht — deshalb steht die Probe hier.
console.log('\n— Der Besucherzähler —');

const quelle = await (await fetch(`http://127.0.0.1:${process.env.PORT || 8123}/js/script.js`)).text();
pruefe(/sessionStorage\.getItem\('hasCountedVisit'\)/.test(quelle) &&
       /sessionStorage\.setItem\('hasCountedVisit'/.test(quelle),
  'hasCountedVisit liegt weiter in sessionStorage');
pruefe(!/localStorage\.[gs]etItem\('hasCountedVisit'/.test(quelle),
  'Und ist nicht mit umgestellt worden');

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
await browser.close();
process.exit(fehler === 0 ? 0 : 1);
