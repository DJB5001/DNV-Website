// Prüft die gemeinsamen Clan-Inhalte aus js/clan-inhalt.js.
//
// Der Punkt der Datei ist "eine Quelle, zwei Seiten": Dieselben Abschnitte
// stehen auf der Clan-Seite und im Clan-Reiter der App. Bricht dieser
// Mechanismus, fällt es sonst erst auf, wenn jemand eine der beiden Seiten
// aufmacht und dort ein Loch ist.
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

const BASIS = `http://127.0.0.1:${process.env.PORT || 8123}`;

let fehler = 0;
function pruefe(label, bedingung, zusatz = '') {
  console.log(`${bedingung ? '  ok  ' : ' FAIL '} ${label}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bedingung) fehler += 1;
}

const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 1400, height: 950 } });

/** Liest die gezeichneten Karten und die Kennzahl über den Systemen aus. */
const lesen = () =>
  seite.evaluate(() => ({
    behaelter: document.querySelectorAll('[data-clan-inhalt]').length,
    baender: [...document.querySelectorAll('[data-clan-inhalt] .dnv-band')].map((b) => b.id),
    karten: [...document.querySelectorAll('#dnv-bot .dnv-karte')].map((k) => ({
      titel: k.querySelector('.dnv-karte__titel')?.textContent?.trim(),
      text: k.querySelector('.dnv-karte__text')?.textContent?.trim() ?? '',
      chip: k.querySelector('.dnv-karte__chip')?.textContent?.trim(),
      symbol: Boolean(k.querySelector('.dnv-karte__symbol svg path')),
    })),
    // Die Zahl steht in beiden Seiten anders im HTML, gemeint ist dieselbe.
    systeme: [...document.querySelectorAll('.zahl, .clan-tab__zahlen div')]
      .filter((el) => /Systeme im Discord/.test(el.textContent))
      .map((el) => el.textContent.replace(/\D+/g, '')),
  }));

try {
  for (const datei of ['clan.html', 'index.html']) {
    console.log(`\n── ${datei} ──`);
    await seite.goto(`${BASIS}/${datei}`, { waitUntil: 'domcontentloaded' });
    await seite.waitForTimeout(1200);

    const { behaelter, baender, karten, systeme } = await lesen();

    pruefe('Ein Container für die Clan-Inhalte', behaelter === 1, String(behaelter));
    pruefe('Alle fünf Abschnitte sind gezeichnet', baender.length === 5, baender.join(', '));

    const nova = karten.find((k) => k.titel === 'Nova Points');
    pruefe('Die Nova-Points-Karte steht da', Boolean(nova),
      karten.map((k) => k.titel).join(', '));
    pruefe('Sie nennt die Stunde und den Tausch',
      Boolean(nova) && /Stunde/.test(nova.text) && /Ingame-Geld/.test(nova.text),
      nova?.text?.slice(0, 60));
    pruefe('Mit Kennzeichen daneben', nova?.chip === '1 Punkt je Stunde', nova?.chip);
    pruefe('Und mit einem Symbol', nova?.symbol === true);

    // Die Zahl über den Systemen zählt genau diese Karten. Kommt eine dazu
    // und die Zahl bleibt stehen, steht auf der Seite etwas Falsches.
    pruefe('Die Kennzahl passt zur Zahl der Karten',
      systeme.length === 1 && Number(systeme[0]) === karten.length,
      `Kennzahl ${systeme.join('/')}, Karten ${karten.length}`);
  }
} finally {
  await browser.close();
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exitCode = fehler ? 1 : 0;
