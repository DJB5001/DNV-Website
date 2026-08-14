// Prüft die Mitgliederliste: Sie kommt aus data/mitglieder.json, die der
// Discord-Bot schreibt. Fehlt die Datei, muss die im Skript hinterlegte
// Liste einspringen — sonst stünde die Seite bei jeder Störung leer da.
//
// Voraussetzungen: Playwright, und die Seite muss ausgeliefert werden:
//   npx http-server . -p 8123     (abweichender Port über PORT=...)
//
// NODE_PATH hilft bei ESM nicht, deshalb wird die globale Installation
// notfalls selbst aufgelöst.
import fs from 'node:fs';

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

const BASIS = new URL('..', import.meta.url);
const DATEI = new URL('data/mitglieder.json', BASIS);
const ORT = `http://127.0.0.1:${process.env.PORT || 8123}/clan.html`;

// Eine vorhandene Datei gehört dem Bot - sie wird beiseitegelegt und am
// Ende zurückgeschoben, damit der Test nichts kaputtmacht.
const gabEsSchon = fs.existsSync(DATEI);
const vorher = gabEsSchon ? fs.readFileSync(DATEI, 'utf8') : null;

let fehler = 0;
function pruefe(label, bedingung, zusatz = '') {
  console.log(`${bedingung ? '  ok  ' : ' FAIL '} ${label}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bedingung) fehler += 1;
}

const browser = await chromium.launch();
const seite = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const seitenfehler = [];
seite.on('pageerror', (e) => seitenfehler.push(String(e).split('\n')[0]));

const gezeichnet = () =>
  seite.evaluate(() => ({
    namen: [...document.querySelectorAll('.mitglied__name')].map((el) => el.textContent),
    rollen: [...document.querySelectorAll('.mitglied__rolle')].map((el) => el.textContent),
    klassen: [...document.querySelectorAll('.mitglied__rolle')].map((el) => el.className),
    anzahl: document.querySelector('[data-mitglieder-anzahl]')?.textContent,
  }));

try {
  // ── Ohne Bot-Datei: die hinterlegte Liste trägt ──────────────
  if (gabEsSchon) fs.rmSync(DATEI);

  await seite.goto(ORT, { waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(1200);

  const notnagel = await gezeichnet();
  pruefe('Ohne Bot-Datei wird trotzdem gezeichnet', notnagel.namen.length > 0, `${notnagel.namen.length} Karten`);
  pruefe('Zähler passt zur Kartenzahl', notnagel.anzahl === String(notnagel.namen.length), notnagel.anzahl);
  pruefe('Führung steht oben', notnagel.rollen[0]?.includes('Anführer'), notnagel.rollen[0]);

  // ── Mit Bot-Datei: sie gewinnt ──────────────────────────────
  fs.mkdirSync(new URL('data/', BASIS), { recursive: true });
  fs.writeFileSync(
    DATEI,
    JSON.stringify({
      stand: new Date().toISOString(),
      anzahl: 4,
      mitglieder: [
        { name: 'ChefIn', rolle: 'Owner', farbe: 'fuehrung', rang: 1, seit: '2026-08-08', verifiziert: true },
        { name: 'Aufpasser', rolle: 'Moderator', farbe: 'team', rang: 8, seit: '2026-08-09', verifiziert: true },
        { name: 'Maurer', rolle: 'Builder', farbe: 'builder', rang: 11, seit: '2026-08-10', verifiziert: true },
        { name: '.BedrockHans', rolle: 'Farmer', farbe: 'farmer', rang: 12, seit: '2026-08-11', verifiziert: false },
      ],
    })
  );

  await seite.reload({ waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(
    () => document.querySelectorAll('.mitglied__name').length === 4,
    null,
    { timeout: 5000 }
  );

  const vomBot = await gezeichnet();
  pruefe('Bot-Liste ersetzt die hinterlegte', vomBot.namen.length === 4, vomBot.namen.join(', '));
  pruefe('Zähler zeigt die neue Anzahl', vomBot.anzahl === '4', vomBot.anzahl);
  pruefe('Reihenfolge nach Rang', vomBot.namen[0] === 'ChefIn' && vomBot.namen.at(-1) === '.BedrockHans');
  pruefe('Neue Rollen werden angezeigt', vomBot.rollen.includes('Moderator'));
  pruefe('Farbe Team greift', vomBot.klassen.some((k) => k.includes('mitglied__rolle--team')));
  pruefe('Farbe Builder greift', vomBot.klassen.some((k) => k.includes('mitglied__rolle--builder')));

  // Bedrock-Kopf wird ohne den Punkt geholt, der Name behält ihn
  const kopfQuelle = await seite.evaluate(
    () => [...document.querySelectorAll('.mitglied')].at(-1).querySelector('img')?.getAttribute('src')
  );
  pruefe('Bedrock-Name behält den Punkt', vomBot.namen.at(-1) === '.BedrockHans');
  pruefe('Kopfbild ohne Punkt abgefragt', /BedrockHans/.test(kopfQuelle) && !/\.BedrockHans/.test(kopfQuelle), kopfQuelle);

  // ── Kaputte Datei: die hinterlegte Liste muss wieder tragen ──
  fs.writeFileSync(DATEI, '{ das ist kein json');
  await seite.reload({ waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(1200);

  const kaputt = await gezeichnet();
  pruefe('Kaputte Datei lässt die Seite nicht leer', kaputt.namen.length > 0, `${kaputt.namen.length} Karten`);
  pruefe('Dann greift wieder die hinterlegte Liste', kaputt.namen.length === notnagel.namen.length);

  pruefe('Keine Skriptfehler auf der Seite', seitenfehler.length === 0, seitenfehler.join(' | '));
} finally {
  await browser.close();
  if (gabEsSchon) fs.writeFileSync(DATEI, vorher);
  else if (fs.existsSync(DATEI)) fs.rmSync(DATEI);
}

console.log(fehler ? `\n${fehler} Fehler.` : '\nAlle Prüfungen bestanden.');
process.exit(fehler ? 1 : 0);
