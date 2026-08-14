// Prüft die beiden Hintergrundebenen (css/hintergrund.css, js/nova.js).
//
// Was hier unbemerkt kaputtgehen kann:
//   1. Ein Motivname im Markup passt zu keiner CSS-Regel — die Ebene
//      bleibt leer, ohne dass irgendwo ein Fehler auftaucht.
//   2. Eine Bilddatei fehlt oder ist umbenannt worden.
//   3. Das Umblenden greift nicht: beim Scrollen (Clan-Seite) oder beim
//      Reiterwechsel (App) bleibt immer dasselbe Bild stehen.
//   4. Es ist mehr als ein Bild gleichzeitig sichtbar — dann liegen zwei
//      Motive übereinander und der Hintergrund wird matschig.
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

const basis = `http://127.0.0.1:${process.env.PORT || 8123}`;
const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 950 } });

let fehlschlag = 0;
const pruefe = (bed, t, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${t}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehlschlag++;
};

// Die Adresse steht im berechneten Stil, nicht im Markup — beim Kopfband
// sogar erst im ::before.
const ebenenLesen = () =>
  p.evaluate(() => {
    const adresse = (stil) => (/url\("?([^")]+)"?\)/.exec(stil.backgroundImage) || [])[1] || '';
    const grund = [...document.querySelectorAll('.mc-grund__bild')].map((el) => {
      const s = getComputedStyle(el);
      return {
        motiv: el.dataset.motiv,
        adresse: adresse(s),
        an: el.classList.contains('an'),
        deckkraft: parseFloat(s.opacity)
      };
    });
    const band = document.querySelector('.mc-kopfband');
    const bandStil = band && getComputedStyle(band, '::before');
    return {
      grund,
      band: band
        ? {
            adresse: adresse(bandStil),
            deckkraft: parseFloat(bandStil.opacity),
            hoehe: band.getBoundingClientRect().height,
            breite: band.getBoundingClientRect().width,
            versteckt: band.getAttribute('aria-hidden') === 'true'
          }
        : null
    };
  });

for (const datei of ['clan.html', 'index.html']) {
  console.log(`\n── ${datei} ──`);
  await p.goto(`${basis}/${datei}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1800);

  const { grund, band } = await ebenenLesen();

  pruefe(grund.length === 4, 'vier Motive liegen bereit', String(grund.length));
  for (const e of grund) {
    pruefe(!!e.adresse, `${e.motiv}: ein Bild ist hinterlegt`, e.adresse.split('/').pop());
    const antwort = await p.request.get(e.adresse);
    pruefe(antwort.ok(), `${e.motiv}: die Datei wird ausgeliefert`, String(antwort.status()));
  }
  pruefe(grund.filter((e) => e.an).length === 1, 'genau ein Motiv ist aktiv',
    grund.filter((e) => e.an).map((e) => e.motiv).join(',') || 'keins');

  pruefe(!!band, 'das Kopfband ist da');
  pruefe(band && band.versteckt, 'das Kopfband ist für Vorleseprogramme ausgeblendet');
  pruefe(band && band.hoehe > 300, 'das Kopfband ist gross', band && Math.round(band.hoehe) + 'px');
  pruefe(band && band.breite >= 1390, 'das Kopfband geht über die volle Breite',
    band && Math.round(band.breite) + 'px');
  pruefe(band && band.deckkraft > 0.3, 'das Kopfband ist deutlich sichtbar',
    band && String(band.deckkraft));
}

// ── Clan-Seite: das Motiv folgt dem Scrollen ──
console.log('\n── Umblenden beim Scrollen ──');
await p.goto(`${basis}/clan.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);

const aktiv = async () =>
  p.evaluate(() => document.querySelector('.mc-grund__bild.an')?.dataset.motiv || 'keins');

// Beim Scrollen darf keine weiche Bewegung mitmessen.
await p.addStyleTag({ content: 'html { scroll-behavior: auto !important; }' });

const obenMotiv = await aktiv();
pruefe(obenMotiv === 'hoehle', 'oben liegt das Motiv des Kopfbereichs', obenMotiv);

for (const [kennung, erwartet] of [
  ['#dnv-ueberuns', 'weite'],
  ['#dnv-projekte', 'bluete'],
  ['#dnv-bot', 'ritt']
]) {
  await p.evaluate((k) => {
    const r = document.querySelector(k).getBoundingClientRect();
    // Der Abschnitt soll die Mitte des Fensters kreuzen, nicht nur den
    // oberen Rand berühren. Bewusst über das Rechteck statt offsetTop:
    // die Abschnitte liegen in einem positionierten Container, offsetTop
    // zählt also nicht ab dem Seitenanfang.
    window.scrollBy(0, r.top + r.height / 2 - window.innerHeight / 2);
  }, kennung);
  await p.waitForTimeout(400);
  const jetzt = await aktiv();
  pruefe(jetzt === erwartet, `${kennung} zeigt sein Motiv`, `${jetzt} (erwartet ${erwartet})`);
}

// ── Der Grund kommt erst hinter dem Kopfband hervor ──
// Oben zeigen beide dasselbe Motiv; lägen sie gleichzeitig da, sähe man
// das Bild doppelt und versetzt.
console.log('\n── Grund blendet sich ein ──');
await p.evaluate(() => window.scrollTo(0, 0));
await p.waitForTimeout(300);
const grundOben = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.mc-grund')).opacity));
pruefe(grundOben < 0.02, 'oben liegt nur das Kopfband', String(grundOben));

await p.evaluate(() => window.scrollTo(0, document.querySelector('.mc-kopfband').offsetHeight * 1.2));
await p.waitForTimeout(300);
const grundUnten = await p.evaluate(() => parseFloat(getComputedStyle(document.querySelector('.mc-grund')).opacity));
pruefe(grundUnten > 0.98, 'unterhalb des Bandes ist der Grund voll da', String(grundUnten));

// ── App: das Motiv folgt dem Reiter ──
console.log('\n── Umblenden beim Reiterwechsel ──');
await p.goto(`${basis}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach((m) => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');
  // script.js bricht hier früh ab (das Supabase-CDN ist gesperrt), dadurch
  // fehlt App.settings, das showSection braucht. App ist ein const auf
  // oberster Ebene und liegt NICHT an window — der Name muss direkt
  // getroffen werden.
  App.settings = App.settings || {};
  App.settings.design = App.settings.design || { itemRain: false };
  App.settings.market = App.settings.market || { name: true };
});

for (const [reiter, erwartet] of [
  ['mitglieder', 'ritt'],
  ['market', 'weite'],
  ['auctions', 'bluete'],
  ['clan', 'hoehle']
]) {
  await p.evaluate((r) => showSection(r), reiter);
  await p.waitForTimeout(300);
  const jetzt = await aktiv();
  pruefe(jetzt === erwartet, `Reiter ${reiter} zeigt sein Motiv`, `${jetzt} (erwartet ${erwartet})`);
}

// Das Kopfband wechselt in der App mit.
const bandMotiv = await p.evaluate(
  () => document.querySelector('.mc-kopfband').className.match(/mc-motiv--(\w+)/)[1]
);
pruefe(bandMotiv === 'hoehle', 'das Kopfband trägt das Motiv des Reiters', bandMotiv);

await b.close();
console.log(fehlschlag ? `\n${fehlschlag} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehlschlag ? 1 : 0);
