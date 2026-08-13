// Integrationstest der Bild-Rückfallkette im echten Browser.
//
// Voraussetzungen:
//   1. Playwright verfügbar (npm i -D playwright, oder global installiert)
//   2. Die Seite wird ausgeliefert, z. B.: npx http-server . -p 8123
//      Abweichender Port über PORT=... setzen.
//
// Hier im Test schlagen ALLE externen Bilder fehl, deshalb lässt sich
// die komplette Kette in einem Durchlauf beobachten.

// NODE_PATH hilft bei ESM nicht weiter, deshalb wird die globale
// Installation notfalls selbst aufgelöst.
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
const p = await b.newPage();
await p.goto('http://127.0.0.1:' + (process.env.PORT || 8123) + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

const r = await p.evaluate(async () => {
  const ergebnis = {};
  ergebnis.funktionenDa = {
    bildRueckfall: typeof bildRueckfall,
    materialBildUrl: typeof materialBildUrl,
  };
  ergebnis.typUrl = materialBildUrl('NETHERITE_SWORD');

  // Bild mit totem eigenem Link, so wie "Magnet" oder "Wasserwaage"
  const img = document.createElement('img');
  img.dataset.material = 'NETHERITE_SWORD';
  img.onerror = () => bildRueckfall(img);

  // Jede Änderung von src mitschreiben. Zu festen Zeiten zu messen geht
  // daneben: Beide Fehlschläge können längst durch sein.
  const schritte = [];
  new MutationObserver(() => schritte.push(img.getAttribute('src')))
    .observe(img, { attributes: true, attributeFilter: ['src'] });

  const warte = ms => new Promise(r => setTimeout(r, ms));

  img.src = 'https://i.postimg.cc/000TOT/gibt-es-nicht.png';
  document.body.appendChild(img);
  await warte(9000);

  ergebnis.schritte = schritte;
  ergebnis.typVersucht = img.dataset.typVersucht;
  ergebnis.onerrorDanach = img.onerror === null ? 'null (kein Kreisel)' : 'noch gesetzt';
  img.remove();
  return ergebnis;
});

console.log(JSON.stringify(r, null, 1));

// schritte[0] ist der Startwert, die Rückfallstufen folgen danach.
const [, stufe1, stufe2] = r.schritte;
const ok1 = stufe1 === r.typUrl;
const ok2 = /Barrier/.test(stufe2);
console.log(`\n${ok1 ? '  ok  ' : ' FEHL '} Stufe 1: totes eigenes Bild → Typ-Bild`);
console.log(`${ok2 ? '  ok  ' : ' FEHL '} Stufe 2: totes Typ-Bild → Verbotsschild`);
console.log(`${r.onerrorDanach.startsWith('null') ? '  ok  ' : ' FEHL '} kein endloses Nachfeuern`);

await b.close();
process.exit(ok1 && ok2 ? 0 : 1);
