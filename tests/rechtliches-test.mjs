// Prüft, dass Impressum und Wohnanschrift wirklich weg sind.
//
// Zwei Dinge gehen bei so einer Aufräumaktion schief, und beide fallen
// nicht von selbst auf:
//
//   1. Ein übersehener Link zeigt weiter auf eine Seite, die es nicht
//      mehr gibt — für jeden Besucher ein 404.
//   2. Die Anschrift bleibt irgendwo stehen. Genau das wäre hier das
//      Verfehlen des Ziels: Sie stand nicht nur im Impressum, sondern
//      auch in der Datenschutzerklärung.
//
// Braucht keinen Browser und keinen Server — der Test liest die Dateien.
//
// Aufruf: node tests/rechtliches-test.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const wurzel = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let fehler = 0;
const pruefe = (bed, text, zusatz = '') => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${text}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bed) fehler++;
};

function dateien({ ohneTests = false } = {}) {
  const raus = [];
  const gehe = (ordner) => {
    for (const eintrag of fs.readdirSync(ordner, { withFileTypes: true })) {
      if (eintrag.name === 'node_modules' || eintrag.name.startsWith('.')) continue;
      if (ohneTests && eintrag.name === 'tests') continue;
      const weg = path.join(ordner, eintrag.name);
      if (eintrag.isDirectory()) gehe(weg);
      else if (/\.(html|js|css|md|webmanifest)$/.test(eintrag.name)) raus.push(weg);
    }
  };
  gehe(wurzel);
  return raus;
}

const lies = (wege) => wege.map((weg) => [path.relative(wurzel, weg), fs.readFileSync(weg, 'utf8')]);

// Die Anschrift wird im **ganzen** Repo gesucht, Tests eingeschlossen:
// Das hier liegt öffentlich auf GitHub, da hilft es nichts, wenn sie
// statt auf der Seite in einer Testdatei steht.
const alle = lies(dateien());

// Der Verweis dagegen nur in dem, was wirklich ausgeliefert wird. Diese
// Testdatei und ihre Beschreibung müssen die gelöschte Seite beim Namen
// nennen dürfen — sonst könnte niemand aufschreiben, worum es geht.
const ausgeliefert = lies(dateien({ ohneTests: true }));

// ── 1. Die Anschrift steht nirgends mehr ────────────────────────────
//
// Das ist der eigentliche Zweck der Übung. Gesucht wird nach Straße und
// Ort — nicht nach dem Namen: Der darf und soll in der
// Datenschutzerklärung stehen bleiben.
console.log('— Die Anschrift —');

const anschrift = /Kopperskamp|Kervenheim|47627/i;
const gefunden = alle.filter(([, inhalt]) => anschrift.test(inhalt)).map(([name]) => name);
pruefe(gefunden.length === 0, 'Die Wohnanschrift steht in keiner Datei mehr',
  gefunden.join(', '));

// ── 2. Kein Link ins Leere ──────────────────────────────────────────
console.log('\n— Das Impressum —');

pruefe(!fs.existsSync(path.join(wurzel, 'impressum.html')), 'Die Seite ist gelöscht');

const verweise = ausgeliefert.filter(([, inhalt]) => /impressum/i.test(inhalt)).map(([name]) => name);
pruefe(verweise.length === 0, 'Und nichts verweist mehr darauf', verweise.join(', '));

// ── 3. Der Service Worker ───────────────────────────────────────────
//
// cache.addAll() ist alles oder nichts: Bliebe die gelöschte Datei in
// der Liste, schlüge der eine 404 den ganzen Aufruf ab — und weil ein
// .catch(() => {}) dahintersteht, ohne ein Wort. Die App hätte danach
// gar keinen statischen Zwischenspeicher mehr.
console.log('\n— Der Service Worker —');

const sw = fs.readFileSync(path.join(wurzel, 'service-worker.js'), 'utf8');
const liste = sw.slice(sw.indexOf('STATIC_ASSETS = ['), sw.indexOf('];', sw.indexOf('STATIC_ASSETS = [')));

pruefe(!/impressum/i.test(liste), 'Die gelöschte Seite steht nicht mehr in STATIC_ASSETS');
for (const soll of ['./index.html', './clan.html', './datenschutz.html']) {
  pruefe(liste.includes(soll), `${soll} steht weiterhin drin`);
}

// Ohne neuen Namen behalten Wiederkehrende die alte Fassung im Speicher,
// und der Netz-zuerst-Handler liefert sie bei jeder Störung weiter aus.
const name = sw.match(/const CACHE_NAME = '([^']+)'/)?.[1];
pruefe(Boolean(name) && name !== 'opsucht-static-v13',
  'Der Cache heißt anders als vorher, sonst bleibt die alte Fassung liegen', String(name));

// ── 4. Was bleiben muss ─────────────────────────────────────────────
//
// Die Gegenprobe: Beim Aufräumen darf nicht zu viel mitgehen. Die
// Datenschutzerklärung hängt nicht am Geld, sondern an der
// Datenverarbeitung — und ohne benannten Verantwortlichen wäre sie keine.
console.log('\n— Was bleibt —');

const datenschutz = fs.readFileSync(path.join(wurzel, 'datenschutz.html'), 'utf8');
pruefe(/Verantwortlich/i.test(datenschutz) && /Nico Dammertz/.test(datenschutz),
  'Die Datenschutzerklärung nennt weiter einen Verantwortlichen');
pruefe(/mailto:/.test(datenschutz), 'Mit einer E-Mail-Adresse');

for (const seite of ['index.html', 'clan.html', 'nutzungsbedingungen.html']) {
  const inhalt = fs.readFileSync(path.join(wurzel, seite), 'utf8');
  pruefe(inhalt.includes('datenschutz.html'), `${seite} verlinkt sie weiterhin`);
}

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
