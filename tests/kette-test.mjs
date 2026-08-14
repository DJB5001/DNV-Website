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

// ── Bildgedächtnis ───────────────────────────────────────────────
// Hier laufen echte Ladevorgänge, aber nur gegen Dateien aus dem Repo —
// externe Adressen sind in der Sandbox ohnehin nicht erreichbar, und
// jeder Fehlversuch würde in eine Zeitüberschreitung laufen.
console.log('\n── Bildgedächtnis');

const g = await p.evaluate(async () => {
  const gut = '/images/hintergrund/hoehle.webp';
  const kaputt = '/gibt-es-nicht.png';

  localStorage.removeItem('opsucht_bild_gedaechtnis_v1');
  for (const k of Object.keys(bildGedaechtnis)) delete bildGedaechtnis[k];

  const einhaengen = (html) => {
    const huelle = document.createElement('div');
    huelle.innerHTML = html;
    const img = huelle.querySelector('img');
    document.body.appendChild(img);
    return img;
  };

  const warten = (img) =>
    new Promise((fertig) => {
      if (img.complete && img.naturalWidth) return fertig(true);
      const ende = setTimeout(() => fertig(false), 4000);
      img.addEventListener('load', () => { clearTimeout(ende); fertig(true); }, { once: true });
    });

  const erg = {};

  // 1. Ein Bild, das gleich beim ersten Versuch lädt.
  const a = einhaengen(itemBildTag('PRUEF_GUT', gut, 'gut'));
  // img.src liefert die aufgelöste Adresse, getAttribute die geschriebene.
  // Gemerkt wird die aufgelöste — deshalb hier auch damit vergleichen.
  erg.ersterStart = a.src;
  erg.hatLazy = a.getAttribute('loading') === 'lazy' && a.getAttribute('decoding') === 'async';
  erg.geladen = await warten(a);
  erg.gemerkt = bildGedaechtnis[bildSchluessel('PRUEF_GUT', gut)] || null;
  a.remove();

  // 2. Dasselbe Item noch einmal — jetzt muss es direkt richtig starten.
  const b2 = einhaengen(itemBildTag('PRUEF_GUT', gut, 'gut'));
  erg.zweiterStart = b2.getAttribute('src');
  b2.remove();

  // 3. Wunschadresse tot: die Kette übernimmt, das Ergebnis wird gemerkt.
  const c = einhaengen(itemBildTag('PRUEF_KAPUTT', kaputt, 'kaputt'));
  erg.kaputtStart = c.getAttribute('src');
  c.onerror = null;
  c.src = gut;                       // steht für die Stufe, die es schafft
  bildGeladen(c);
  erg.kaputtGemerkt = bildGedaechtnis[bildSchluessel('PRUEF_KAPUTT', kaputt)] || null;
  c.remove();

  // 4. Der Start darf nicht noch einmal in der Kette stehen.
  const d = einhaengen(itemBildTag('PRUEF_GUT', gut, 'gut'));
  erg.ketteOhneStart = !JSON.parse(d.dataset.bildkette || '[]').includes(d.getAttribute('src'));
  d.remove();

  return erg;
});

console.log(JSON.stringify(g, null, 1));

pruefe(g.hatLazy, 'Item-Bilder laden verzögert und dekodieren nebenläufig');
pruefe(g.geladen, 'das Prüfbild wurde wirklich geladen');
pruefe(g.gemerkt === g.ersterStart, 'die geladene Adresse wird gemerkt');
pruefe(g.zweiterStart === g.gemerkt, 'beim zweiten Mal beginnt das Bild direkt dort');
pruefe(g.kaputtStart === '/gibt-es-nicht.png', 'ohne Gedächtnis gilt weiter die Wunschadresse');
pruefe(
  g.kaputtGemerkt && g.kaputtGemerkt.endsWith('hoehle.webp'),
  'nach dem Rückfall wird die Stufe gemerkt, die es geschafft hat'
);
pruefe(g.ketteOhneStart, 'die Startadresse steht nicht noch einmal in der Kette');

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
await b.close();
process.exit(fehler === 0 ? 0 : 1);
