// Test der Bild-Rückfallkette im echten Browser.
//
// Voraussetzungen: Playwright, und die Seite muss ausgeliefert werden:
//   npx http-server . -p 8123     (abweichender Port über PORT=...)
//
// Geprüft wird die Schrittlogik: Reihenfolge der Quellen, Vollständigkeit,
// sauberer Abschluss beim Verbotsschild und kein Nachfeuern.
//
// bildRueckfall wird dafür direkt aufgerufen, statt auf echte Fehlschläge
// zu warten. Das ist Absicht: Ein scheiterndes Bild braucht bis zur
// Zeitüberschreitung mitunter zehn Sekunden, was den Test langsam und
// wacklig machen würde. Ob die Adressen tatsächlich etwas liefern, prüft
// tests/bilder-test.mjs mit echten Abrufen.
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
const p = await b.newPage();
await p.goto(`http://127.0.0.1:${process.env.PORT || 8123}/index.html`, {
  waitUntil: 'domcontentloaded',
});
await p.waitForTimeout(2000);

const r = await p.evaluate(() => {
  const durchlauf = material => {
    const kandidaten = materialBildKandidaten(material);
    const img = document.createElement('img');
    img.dataset.bildkette = JSON.stringify(kandidaten);
    img.onerror = () => {};

    // Zwei Schritte mehr als Kandidaten: Der vorletzte muss das
    // Verbotsschild setzen, der letzte darf nichts mehr ändern.
    const gesehen = [];
    for (let i = 0; i < kandidaten.length + 2; i++) {
      bildRueckfall(img);
      gesehen.push(img.getAttribute('src'));
    }
    return { kandidaten, gesehen, onerrorDanach: img.onerror === null };
  };

  return {
    schwert: durchlauf('NETHERITE_SWORD'),
    spawnEi: durchlauf('ZOMBIE_SPAWN_EGG'),
    ohneMaterial: durchlauf(undefined),
  };
});

const kurz = s => (s.includes('/textures/') ? s.split('/textures/')[1] : s.split('/').pop());
for (const [name, e] of Object.entries(r)) {
  console.log(`── ${name}`);
  e.gesehen.forEach((s, i) => console.log(`   ${i + 1}. ${kurz(s)}`));
}
console.log();

let fehler = 0;
const pruefe = (bed, t) => {
  console.log(`${bed ? '  ok  ' : ' FEHL '} ${t}`);
  if (!bed) fehler++;
};

const k = r.schwert.kandidaten;
pruefe(k.length === 5, 'fünf Quellen für ein gewöhnliches Material');
pruefe(/mcdf\.wiki\.gg/.test(k[0]), 'zuerst das Wiki (schönere Ansichten)');
pruefe(/textures\/item\//.test(k[1]), 'dann die Spieltextur als Gegenstand');
pruefe(/textures\/block\//.test(k[2]), 'dann die Spieltextur als Block');
pruefe(
  k[3].endsWith('_side.png') && k[4].endsWith('_top.png'),
  'zuletzt die Seitenflächen mehrflächiger Blöcke'
);

pruefe(
  r.spawnEi.kandidaten.some(x => /item\/spawn_egg\.png$/.test(x)),
  'Spawn-Eier greifen auf die gemeinsame Textur zurück'
);

for (const [name, e] of Object.entries(r)) {
  const bisKette = e.gesehen.slice(0, e.kandidaten.length);
  pruefe(
    bisKette.join('|') === e.kandidaten.join('|'),
    `${name}: alle Stufen in der richtigen Reihenfolge`
  );
  pruefe(
    /Barrier/.test(e.gesehen[e.kandidaten.length]),
    `${name}: danach das Verbotsschild`
  );
  pruefe(
    e.gesehen[e.kandidaten.length] === e.gesehen[e.kandidaten.length + 1],
    `${name}: danach ändert sich nichts mehr`
  );
  pruefe(e.onerrorDanach, `${name}: onerror abgeschaltet, kein Kreisel`);
}

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
await b.close();
process.exit(fehler === 0 ? 0 : 1);
