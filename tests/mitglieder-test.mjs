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

  // Dieser Eintrag hat keine UUID, also gibt es auch keinen Skin zu holen —
  // dann muss der Anfangsbuchstabe stehen bleiben statt eines fremden Kopfs.
  const letzteKarte = await seite.evaluate(() => {
    const k = [...document.querySelectorAll('.mitglied')].at(-1);
    return {
      hatImg: Boolean(k.querySelector('img')),
      hatSkin: Boolean(k.querySelector('.mitglied__skinkopf')),
      initial: k.querySelector('.mitglied__initial')?.textContent,
    };
  });
  pruefe('Bedrock-Name behält den Punkt', vomBot.namen.at(-1) === '.BedrockHans');
  pruefe('Bedrock ohne UUID holt kein Java-Kopfbild', letzteKarte.hatImg === false);
  pruefe('Stattdessen der Anfangsbuchstabe', letzteKarte.initial === 'B', letzteKarte.initial);

  // ── Bedrock-Köpfe ───────────────────────────────────────────
  // Bedrock-Spieler haben kein Java-Konto. mc-heads liefert für ihren Namen
  // trotzdem ein Bild — den Standard-Steve — also darf er gar nicht erst
  // gefragt werden. Der Skin kommt stattdessen über die Xbox-ID von Geyser.
  const javaAbfragen = [];
  await seite.route('**/mc-heads.net/**', (route) => {
    javaAbfragen.push(route.request().url());
    route.abort();
  });
  await seite.route('**/minotar.net/**', (route) => {
    javaAbfragen.push(route.request().url());
    route.abort();
  });

  let geyserAbfragen = 0;
  await seite.route('**/api.geysermc.org/v2/skin/**', (route) => {
    geyserAbfragen += 1;
    // Kein Skin für die 999 — dort muss der Buchstabe übrig bleiben
    if (route.request().url().endsWith('/999')) return route.fulfill({ status: 404, body: '{}' });
    route.fulfill({ status: 200, contentType: 'application/json', body: '{"texture_id":"abc123"}' });
  });
  await seite.route('**/textures.minecraft.net/texture/**', (route) =>
    route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.alloc(0) })
  );

  fs.writeFileSync(
    DATEI,
    JSON.stringify({
      anzahl: 4,
      mitglieder: [
        // Verifizierter Bedrock-Spieler: Geyser-UUID, daraus die Xbox-ID
        { name: '.BedrockHans', rolle: 'Farmer', rang: 12, seit: '2026-08-11',
          verifiziert: true, plattform: 'bedrock', uuid: '00000000-0000-0000-0009-01f585da16d5' },
        // Bedrock ohne Punkt im Namen — nur die Plattform verrät es
        { name: 'OhnePunkt', rolle: 'Farmer', rang: 12, seit: '2026-08-11',
          verifiziert: true, plattform: 'bedrock', uuid: '00000000-0000-0000-0009-01f60bea46ea' },
        // Bedrock ohne Verifizierung: keine UUID, also nur der Buchstabe
        { name: '.NochNichtVerifiziert', rolle: 'Farmer', rang: 12, seit: '2026-08-12',
          verifiziert: false, plattform: null, uuid: null },
        { name: 'JavaSpieler', rolle: 'Farmer', rang: 12, seit: '2026-08-13',
          verifiziert: true, plattform: 'java', uuid: 'aaaa-bbbb' },
      ],
    })
  );

  await seite.reload({ waitUntil: 'domcontentloaded' });
  await seite.waitForFunction(() => document.querySelectorAll('.mitglied__name').length === 4, null, {
    timeout: 5000,
  });
  await seite.waitForTimeout(600);

  const koepfe = await seite.evaluate(() =>
    [...document.querySelectorAll('.mitglied')].map((k) => ({
      name: k.querySelector('.mitglied__name').textContent,
      hatImg: Boolean(k.querySelector('img')),
      hatSkin: Boolean(k.querySelector('.mitglied__skinkopf')),
      hintergrund: k.querySelector('.mitglied__skinkopf')?.style.backgroundImage ?? '',
      initial: k.querySelector('.mitglied__initial')?.textContent,
    }))
  );
  const nach = (name) => koepfe.find((k) => k.name === name);

  // Für den Java-Spieler dürfen beide Dienste drankommen — der abgewiesene
  // erste zieht ja absichtlich den zweiten nach. Entscheidend ist, dass kein
  // Bedrock-Name dabei auftaucht.
  pruefe(
    'Kein Java-Dienst wird nach einem Bedrock-Namen gefragt',
    javaAbfragen.length > 0 && javaAbfragen.every((u) => u.includes('JavaSpieler')),
    javaAbfragen.join(' | ')
  );
  pruefe('Java-Spieler nutzt weiter das Bild', nach('JavaSpieler').hatImg === true);
  pruefe('Bedrock nutzt kein Bild', nach('.BedrockHans').hatImg === false);
  pruefe('Bedrock bekommt den Skin-Ausschnitt', nach('.BedrockHans').hatSkin === true);
  pruefe(
    'Skin-Adresse aus der Textur-Kennung gebaut',
    nach('.BedrockHans').hintergrund.includes('textures.minecraft.net/texture/abc123'),
    nach('.BedrockHans').hintergrund.slice(0, 70)
  );
  pruefe(
    'Zwei Ebenen für Kopf und Mütze',
    (nach('.BedrockHans').hintergrund.match(/url\(/g) || []).length === 2
  );
  pruefe('Ohne Punkt erkennt die Plattform es trotzdem', nach('OhnePunkt').hatSkin === true);
  pruefe('Ohne UUID bleibt nur der Buchstabe', nach('.NochNichtVerifiziert').hatSkin === false);
  pruefe('Und der Buchstabe stimmt', nach('.NochNichtVerifiziert').initial === 'N');
  pruefe('Geyser wurde für beide gefragt', geyserAbfragen === 2, String(geyserAbfragen));

  // Antwortet Geyser nicht, darf keine leere Fläche stehen bleiben
  fs.writeFileSync(
    DATEI,
    JSON.stringify({
      anzahl: 1,
      mitglieder: [
        { name: '.KeinSkin', rolle: 'Farmer', rang: 12, seit: '2026-08-11',
          verifiziert: true, plattform: 'bedrock', uuid: '00000000-0000-0000-0000-0000000003e7' },
      ],
    })
  );
  await seite.reload({ waitUntil: 'domcontentloaded' });
  await seite.waitForTimeout(900);
  const ohneSkin = await seite.evaluate(() => ({
    hatSkin: Boolean(document.querySelector('.mitglied__skinkopf')),
    initial: document.querySelector('.mitglied__initial')?.textContent,
  }));
  pruefe('Ohne Antwort von Geyser verschwindet die Fläche', ohneSkin.hatSkin === false);
  pruefe('Darunter steht der Buchstabe', ohneSkin.initial === 'K');

  await seite.unroute('**/mc-heads.net/**');
  await seite.unroute('**/minotar.net/**');
  await seite.unroute('**/api.geysermc.org/v2/skin/**');
  await seite.unroute('**/textures.minecraft.net/texture/**');

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
