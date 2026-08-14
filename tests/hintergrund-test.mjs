// Prüft die Minecraft-Bildebenen (css/hintergrund.css).
//
// Drei Dinge können hier schiefgehen, und alle drei sind unsichtbar, bis
// jemand die Seite von Hand anschaut:
//   1. Ein Motiv-Name im Markup passt zu keiner Regel — die Ebene bleibt
//      leer, ohne dass irgendwo ein Fehler auftaucht.
//   2. Eine Bilddatei fehlt oder ist umbenannt worden.
//   3. Die Regel ".mc-hg ~ *" setzt ein Geschwister auf position: relative,
//      das absolut bleiben muss (der Lichtkreis .band__schein).
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

// Die Ebene malt ihr Bild im ::before. Die Adresse steht deshalb nicht am
// Element selbst, sondern nur im berechneten Stil des Pseudo-Elements.
async function ebenen(seite) {
  return seite.evaluate(() =>
    [...document.querySelectorAll('.mc-hg')].map((el) => {
      const stil = getComputedStyle(el, '::before');
      const treffer = /url\("?([^")]+)"?\)/.exec(stil.backgroundImage);
      return {
        klasse: el.className,
        adresse: treffer ? treffer[1] : '',
        deckkraft: parseFloat(stil.opacity),
        versteckt: el.getAttribute('aria-hidden') === 'true'
      };
    })
  );
}

for (const datei of ['clan.html', 'index.html']) {
  console.log(`\n── ${datei} ──`);
  await p.goto(`${basis}/${datei}`, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1500);

  const liste = await ebenen(p);
  pruefe(liste.length >= 5, 'Bildebenen sind vorhanden', String(liste.length));

  for (const e of liste) {
    const motiv = (/mc-hg--(\w+)/.exec(e.klasse) || [])[1] || '?';
    pruefe(!!e.adresse, `${motiv}: ein Bild ist hinterlegt`, e.adresse.split('/').pop());
    pruefe(e.deckkraft > 0 && e.deckkraft < 0.5, `${motiv}: dezent genug`, String(e.deckkraft));
    pruefe(e.versteckt, `${motiv}: für Vorleseprogramme ausgeblendet`);
  }

  // Wird jede Adresse wirklich ausgeliefert?
  const adressen = [...new Set(liste.map((e) => e.adresse).filter(Boolean))];
  for (const a of adressen) {
    const antwort = await p.request.get(a);
    pruefe(antwort.ok(), `${a.split('/').pop()} wird ausgeliefert`, String(antwort.status()));
  }
}

// Der Lichtkreis auf der Clan-Seite muss absolut bleiben, sonst schiebt er
// den Inhalt auseinander.
await p.goto(`${basis}/clan.html`, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(600);
const schein = await p.evaluate(() => {
  const el = document.querySelector('#mitglieder .band__schein');
  return el ? getComputedStyle(el).position : 'fehlt';
});
pruefe(schein === 'absolute', 'der Lichtkreis bleibt absolut positioniert', schein);

// Und der Inhalt muss über der Bildebene liegen.
const stapel = await p.evaluate(() => {
  const innen = document.querySelector('.hero > .innen');
  const ebene = document.querySelector('.hero > .mc-hg');
  return {
    inhalt: parseInt(getComputedStyle(innen).zIndex, 10) || 0,
    ebene: parseInt(getComputedStyle(ebene).zIndex, 10) || 0
  };
});
pruefe(stapel.inhalt > stapel.ebene, 'der Kopfbereich liegt über seinem Bild', JSON.stringify(stapel));

await b.close();
console.log(fehlschlag ? `\n${fehlschlag} Prüfung(en) fehlgeschlagen.` : '\nAlle Prüfungen bestanden.');
process.exit(fehlschlag ? 1 : 0);
