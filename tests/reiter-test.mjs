// Prüft, dass Clan und Mitglieder als Reiter laufen und die Leiste dabei
// stehen bleibt.
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

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 950 } });
const fehler = [];
p.on('pageerror', e => fehler.push(String(e).split('\n')[0]));
await p.goto(`http://127.0.0.1:${process.env.PORT || 8123}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);

await p.evaluate(() => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach(m => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');

  // script.js bricht hier früh ab, weil das Supabase-CDN gesperrt ist —
  // dadurch fehlt App.settings, das showSection braucht. In der echten
  // Umgebung ist es gesetzt; hier wird es nachgereicht.
  //
  // Wichtig: App ist ein const auf oberster Ebene und liegt damit NICHT
  // an window. Über window.App zu gehen legt ein zweites, wirkungsloses
  // Objekt an — die Zuweisung muss den Namen direkt treffen.
  App.settings = App.settings || {};
  App.settings.design = App.settings.design || { itemRain: false };
  App.settings.market = App.settings.market || { name: true };
});

let fehlschlag = 0;
const pruefe = (bed, t, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${t}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehlschlag++;
};

// Auf den Clan-Knopf klicken — die Leiste muss stehen bleiben
await p.click('#tab-clan');
await p.waitForTimeout(700);

const nachKlick = await p.evaluate(() => ({
  adresse: location.pathname,
  leisteDa: !!document.querySelector('.header-controls'),
  leisteSichtbar: document.querySelector('.header-controls')?.getBoundingClientRect().height > 0,
  reiterAnzahl: document.querySelectorAll('#tabs button').length,
  clanOffen: document.getElementById('clan')?.classList.contains('active'),
  clanKnopfAktiv: document.getElementById('tab-clan')?.classList.contains('active'),
  marktOffen: document.getElementById('market')?.classList.contains('active'),
}));
console.log(JSON.stringify(nachKlick, null, 1));

pruefe(nachKlick.adresse.endsWith('/index.html'), 'die Seite wird nicht verlassen', nachKlick.adresse);
pruefe(nachKlick.leisteSichtbar, 'die Leiste bleibt sichtbar');
pruefe(nachKlick.reiterAnzahl >= 8, 'alle Reiter sind weiterhin da', String(nachKlick.reiterAnzahl));
pruefe(nachKlick.clanOffen, 'der Clan-Abschnitt ist offen');
pruefe(nachKlick.clanKnopfAktiv, 'der Clan-Knopf ist hervorgehoben');


// Auf Mitglieder wechseln
await p.click('#tab-mitglieder');
await p.waitForTimeout(700);
const mitglieder = await p.evaluate(() => ({
  offen: document.getElementById('mitglieder')?.classList.contains('active'),
  clanKnopfAktiv: document.getElementById('tab-clan')?.classList.contains('active'),
  karten: document.querySelectorAll('#mitglieder .mitglied').length,
  namen: [...document.querySelectorAll('#mitglieder .mitglied__name')].map(e => e.textContent),
  rollen: [...document.querySelectorAll('#mitglieder .mitglied__rolle')].map(e => e.textContent),
  anzahlText: document.querySelector('#mitglieder [data-mitglieder-anzahl]')?.textContent,
}));
console.log(JSON.stringify(mitglieder, null, 1));

pruefe(mitglieder.offen, 'der Mitglieder-Abschnitt ist offen');
pruefe(!mitglieder.clanKnopfAktiv, 'der Clan-Knopf ist nicht mehr hervorgehoben');
pruefe(mitglieder.karten === 10, 'zehn Mitglieder werden gezeigt', String(mitglieder.karten));
pruefe(mitglieder.namen[0] === 'M4Claiz', 'der Anführer steht vorn', mitglieder.namen[0]);
pruefe(mitglieder.rollen[0] === 'Anführer', 'die Rolle stimmt', mitglieder.rollen[0]);
pruefe(mitglieder.anzahlText === '10', 'die Anzahl wird eingesetzt', mitglieder.anzahlText);


// Zurück auf Markt — nichts darf hängen bleiben
await p.click('#tab-market');
await p.waitForTimeout(500);
const zurueck = await p.evaluate(() => ({
  marktOffen: document.getElementById('market')?.classList.contains('active'),
  clanOffen: document.getElementById('clan')?.classList.contains('active'),
  clanKnopfAktiv: document.getElementById('tab-clan')?.classList.contains('active'),
}));
pruefe(zurueck.marktOffen && !zurueck.clanOffen, 'Rückkehr zum Markt funktioniert');
pruefe(!zurueck.clanKnopfAktiv, 'der Clan-Knopf bleibt danach ruhig');

const echte = fehler.filter(f => !/supabase|firebase/i.test(f));
console.log('\nJS-Fehler:', echte.length ? echte : 'keine');
if (echte.length) fehlschlag++;

console.log(fehlschlag === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehlschlag} fehlgeschlagen.`);
await b.close();
process.exit(fehlschlag === 0 ? 0 : 1);
