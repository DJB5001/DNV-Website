import fs from 'node:fs';
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

// Echte Bohrer-V3-Verkäufe: 33 Sammelkarten + 5 Werkzeuge unter EINEM Namen.
// Der Verlauf liegt im Datenrepo DJB5001/opsuchtinfo. Pfad per Argument
// oder Umgebungsvariable, damit der Test nicht an einem Rechner klebt.
const pfad =
  process.argv[2] ||
  process.env.AUKTIONSVERLAUF ||
  '../opsuchtinfo/auction-history.json';

if (!fs.existsSync(pfad)) {
  console.error(`auction-history.json nicht gefunden unter: ${pfad}`);
  process.exit(2);
}

const historie = JSON.parse(fs.readFileSync(pfad, 'utf8'));
const bohrer = { 'Bohrer V3': historie['Bohrer V3'] };

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1400, height: 900 } });
p.on('pageerror', e => console.log('PAGEERROR:', String(e).split('\n')[0]));
await p.goto(`http://127.0.0.1:${process.env.PORT || 8123}/index.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

const r = await p.evaluate(async (daten) => {
  document.querySelectorAll('.modal,.disclaimer-modal,.cookie-consent-modal')
    .forEach(m => (m.style.display = 'none'));
  document.body.classList.remove('loading', 'modal-open');
  document.querySelectorAll('.section').forEach(s => (s.style.display = 'none'));
  document.getElementById('history').style.display = 'block';

  App.auctionHistory = daten;
  App.auctionsData = [];
  App.historyCategoryFilter = 'Alle';
  App.historyStarFilter = 'Alle';
  App.selectedPlayerUuid = null;

  const zaehleKarten = () =>
    [...document.querySelectorAll('#historyContainer .card')].map(
      k => k.querySelector('.item-variante')?.textContent.trim() || '(ohne)'
    );

  // Fall 1: nur Namensfilter — so verhielt es sich vorher
  App.historyItemFilter = 'Bohrer V3';
  App.historyVarianteFilter = '';
  await renderHistory();
  await new Promise(r => setTimeout(r, 400));
  const ohneVariante = zaehleKarten();

  // Fall 2: zusätzlich auf die Sammelkarte eingegrenzt
  const karte = daten['Bohrer V3'].find(s => s.item.material === 'PAPER');
  App.historyVarianteFilter = itemVariante(karte.item);
  await renderHistory();
  await new Promise(r => setTimeout(r, 400));
  const nurKarte = zaehleKarten();

  // Fall 3: auf das Werkzeug eingegrenzt
  const werkzeug = daten['Bohrer V3'].find(s => s.item.material === 'NETHERITE_PICKAXE');
  App.historyVarianteFilter = itemVariante(werkzeug.item);
  await renderHistory();
  await new Promise(r => setTimeout(r, 400));
  const nurWerkzeug = zaehleKarten();

  return { ohneVariante, nurKarte, nurWerkzeug };
}, bohrer);

const zaehl = a => a.reduce((m, v) => ((m[v] = (m[v] || 0) + 1), m), {});
console.log('nur Name        :', r.ohneVariante.length, 'Karten →', zaehl(r.ohneVariante));
console.log('+ Sammelkarte   :', r.nurKarte.length, 'Karten →', zaehl(r.nurKarte));
console.log('+ Werkzeug ✯✯✯  :', r.nurWerkzeug.length, 'Karten →', zaehl(r.nurWerkzeug));

let fehler = 0;
const pruefe = (bed, t) => { console.log(`${bed ? '  ok  ' : ' FEHL '} ${t}`); if (!bed) fehler++; };

pruefe(r.ohneVariante.length > r.nurKarte.length, 'ohne Variante werden mehr Karten gezeigt als mit');
pruefe(new Set(r.nurKarte).size === 1, 'gefiltert auf Sammelkarte: nur eine Variante sichtbar');
pruefe(new Set(r.nurWerkzeug).size === 1, 'gefiltert auf Werkzeug: nur eine Variante sichtbar');
pruefe(r.nurKarte[0] !== r.nurWerkzeug[0], 'die beiden Filter zeigen Verschiedenes');

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
await b.close();
process.exit(fehler === 0 ? 0 : 1);
