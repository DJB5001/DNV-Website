// Prüft, dass einzelne Ausreißer den angezeigten Durchschnitt nicht
// mehr verreißen — und dass trotzdem kein Verkauf verlorengeht.
//
// Der Anlass: Von 1.744 Varianten mit mindestens fünf Verkäufen lag bei
// 924 der rohe Schnitt über 20 % neben dem typischen Preis. Bei
// ENCHANTED_BOOK stand Ø 29 Tsd, gehandelt wurde für 15 Tsd. Wer sein
// Buch nach dieser Zahl einpreist, setzt fast doppelt zu hoch an.
//
// Seitdem winsorisiert die Seite: Preise unter dem 25.- und über dem
// 75.-Perzentil zählen nur bis zu dieser Grenze mit. Es bleibt ein
// Schnitt, und es bleibt bei allen Verkäufen — der Ausreißer zieht nur
// nicht mehr.
//
// Braucht keinen Browser. Der echte Verlauf ist optional; ohne ihn läuft
// der erste Teil trotzdem.
//
// Aufruf: node tests/schnitt-test.mjs [pfad-zu-auction-history.json]

import fs from 'node:fs';
import vm from 'node:vm';

const quelle = fs.readFileSync(new URL('../js/script.js', import.meta.url), 'utf8');

// Den echten Code der Seite ausschneiden statt nachzubauen — sonst
// prüft der Test eine Kopie gegen eine Kopie.
const schnipsel = (von, bis) => {
  const a = quelle.indexOf(von);
  const b = quelle.indexOf(bis);
  if (a < 0 || b < 0) throw new Error(`Block nicht gefunden: ${von}`);
  return quelle.slice(a, b);
};

// Drei Schnipsel, weil das Gebrauchte in script.js verstreut steht: die
// Verzauberungsnamen ganz oben, materialLesbar im Bild-Abschnitt, der
// Rest beim Verlauf. Dieselbe Aufteilung benutzt
// opsuchtinfo/history-updater/wert-index.test.js.
const fenster = quelle.match(/const VERLAENGERUNG_FENSTER_MS = [^;]+;/);
if (!fenster) throw new Error('VERLAENGERUNG_FENSTER_MS nicht gefunden');

const block =
  'const schnittCache = new Map();\n' +
  fenster[0] + '\n' +
  schnipsel('const verzauberungsNamen = {', '// Rückfallbild, wenn auch das Typ-Bild') +
  schnipsel('// NETHERITE_PICKAXE wird zu', '// Rückfallkette für Item-Bilder') +
  schnipsel('function salePricePerUnit(sale)', 'function getAuctionDiscount');

const kontext = { console, App: { auctionHistory: {} } };
vm.createContext(kontext);
vm.runInContext(
  block +
    '\nglobalThis.__api = { winsorisierterSchnitt, schnittVonVerkaeufen, ' +
    'getMonthlyAveragePerUnit, schnittCache, itemVariante, verlaufEntdoppeln };',
  kontext
);
const {
  winsorisierterSchnitt, schnittVonVerkaeufen, getMonthlyAveragePerUnit,
  schnittCache, itemVariante, verlaufEntdoppeln,
} = kontext.__api;

let fehler = 0;
const pruefe = (bedingung, text, zusatz = '') => {
  console.log(`${bedingung ? '  ok  ' : ' FEHL '} ${text}${zusatz ? '  → ' + zusatz : ''}`);
  if (!bedingung) fehler++;
};

const zahl = (n) => (n === null ? 'keine Daten' : Math.round(n).toLocaleString('de-DE'));
const rohesMittel = (zahlen) => Math.round(zahlen.reduce((a, b) => a + b, 0) / zahlen.length);

// ── 1. Die Formel, von Hand nachgerechnet ───────────────────────────
console.log('— Die Rechnung —');

// Sechs Verkäufe zu 100, dann 700, 800, 900 — und einer zu 50.000:
//
//   sortiert    100 100 100 100 100 100 700 800 900 50000
//   Stelle       0   1   2   3   4   5   6   7   8    9
//   25 %  →  Stelle round(9 × 0,25) = 2  →  100
//   75 %  →  Stelle round(9 × 0,75) = 7  →  800
//
// Der 50.000er zählt damit als 800, die 900 ebenso, sonst ändert sich
// nichts:  (100×6 + 700 + 800 + 800 + 800) ÷ 10 = 3.700 ÷ 10 = 370.
const preisreihe = [100, 100, 100, 100, 100, 100, 700, 800, 900, 50_000];

pruefe(winsorisierterSchnitt(preisreihe) === 370, 'Der Schnitt liegt beim typischen Preis',
  zahl(winsorisierterSchnitt(preisreihe)));
pruefe(rohesMittel(preisreihe) === 5300, 'Roh stünde dort das Vierzehnfache',
  zahl(rohesMittel(preisreihe)));

// Die Gegenprobe zur anderen Seite: Es ist weiter ein Schnitt und kein
// Median. Der läge bei 100 und würde die 700er, 800er und 900er
// vollständig unterschlagen.
pruefe(winsorisierterSchnitt(preisreihe) !== 100, 'Es bleibt ein Schnitt, kein Median',
  `winsorisiert ${winsorisierterSchnitt(preisreihe)}, Median 100`);

// Und dass wirklich jeder Verkauf mitzählt. Nähme die Formel nur den
// mittleren Bereich und würfe den Rest weg, änderte sich hier nichts.
const ohneEinen = preisreihe.filter((_, i) => i !== 6);
pruefe(winsorisierterSchnitt(ohneEinen) !== winsorisierterSchnitt(preisreihe),
  'Jeder Verkauf zählt mit, auch die am Rand',
  `${winsorisierterSchnitt(preisreihe)} vs. ${winsorisierterSchnitt(ohneEinen)} ohne den 700er`);

// Wo die Preise sauber sind, passiert fast nichts. Das ist die Zusage,
// dass hier nicht pauschal nach unten gedrückt wird.
const sauber = [1000, 1050, 1100, 1150, 1200, 1250, 1300, 1350];
pruefe(Math.abs(winsorisierterSchnitt(sauber) - rohesMittel(sauber)) / rohesMittel(sauber) < 0.05,
  'Saubere Preise bleiben, wo sie sind',
  `${zahl(winsorisierterSchnitt(sauber))} statt ${zahl(rohesMittel(sauber))}`);

// Unter vier Verkäufen gibt es keine Verteilung, aus der sich ein
// Perzentil ablesen ließe — dann bleibt es beim gewöhnlichen Mittel.
pruefe(winsorisierterSchnitt([777]) === 777, 'Ein einzelner Verkauf ist der Preis');
pruefe(winsorisierterSchnitt([10, 1000]) === 505, 'Zwei Verkäufe werden gemittelt');
pruefe(schnittVonVerkaeufen([]) === null, 'Ohne Verkauf gibt es keinen Schnitt');

// ── 2. Was die Seite daraus anzeigt ─────────────────────────────────
console.log('\n— Die Kachel „Durchschnitt" —');

const jetzt = Date.now();
const TAG = 24 * 60 * 60 * 1000;
const verkauf = (preis, vorTagen, menge = 1) => ({
  finalPrice: preis * menge,
  currentBid: preis * menge,
  soldAt: new Date(jetzt - vorTagen * TAG).toISOString(),
  item: { material: 'ENCHANTED_BOOK', displayName: 'Zauberbuch', amount: menge, lore: [], enchantments: {} },
});

// Zwölf gewöhnliche Verkäufe um 15 Tsd — und einer, bei dem sich jemand
// vertippt hat.
const gewoehnlich = [14_000, 14_500, 15_000, 15_000, 15_000, 15_500, 15_500, 16_000, 16_000, 16_500, 17_000, 17_500];
const mitAusreisser = [...gewoehnlich, 900_000];

kontext.App.auctionHistory = {
  Zauberbuch: mitAusreisser.map((p, i) => verkauf(p, 1 + (i % 20))),
};
schnittCache.clear();

const angezeigt = getMonthlyAveragePerUnit({ item: kontext.App.auctionHistory.Zauberbuch[0].item });
const rohAngezeigt = rohesMittel(mitAusreisser);
const typisch = rohesMittel(gewoehnlich);

pruefe(Math.abs(angezeigt - typisch) / typisch < 0.1, 'Der Schnitt steht beim typischen Preis',
  `${zahl(angezeigt)} bei typisch ${zahl(typisch)}`);
pruefe(angezeigt < rohAngezeigt / 3, 'Und weit unter dem, was der Vertipper daraus gemacht hätte',
  `${zahl(angezeigt)} statt ${zahl(rohAngezeigt)}`);

// Der Preis gilt pro Stück, nicht pro Auktion — sonst wäre ein Stapel
// von 64 plötzlich das Vierundsechzigfache wert.
kontext.App.auctionHistory = { Zauberbuch: gewoehnlich.map((p, i) => verkauf(p, 1 + i, 64)) };
schnittCache.clear();
const proStueck = getMonthlyAveragePerUnit({ item: kontext.App.auctionHistory.Zauberbuch[0].item });
pruefe(Math.abs(proStueck - typisch) / typisch < 0.05, 'Der Preis gilt pro Stück',
  `${zahl(proStueck)} bei typisch ${zahl(typisch)}`);

// Verkäufe von vor einem Vierteljahr gehören nicht in eine Zahl, die
// „30 Tage" heißt.
kontext.App.auctionHistory = {
  Zauberbuch: [...gewoehnlich.map((p, i) => verkauf(p, 1 + i)), ...gewoehnlich.map((p) => verkauf(p * 10, 70))],
};
schnittCache.clear();
const nurFenster = getMonthlyAveragePerUnit({ item: kontext.App.auctionHistory.Zauberbuch[0].item });
pruefe(Math.abs(nurFenster - typisch) / typisch < 0.1, 'Nur die letzten 30 Tage zählen',
  `${zahl(nurFenster)} bei typisch ${zahl(typisch)}`);

// ── 3. Gegen die echten Daten ───────────────────────────────────────
const pfad =
  process.argv[2] || process.env.AUKTIONSVERLAUF || '../opsuchtinfo/auction-history.json';

if (!fs.existsSync(pfad)) {
  console.log(`\n  --  ${pfad} nicht gefunden, der Teil mit den echten Daten entfällt.`);
} else {
  console.log('\n— Gegen den echten Verlauf —');

  // Entdoppeln wie im Betrieb: Eine verlängerte Auktion steht mehrfach
  // in der Datei, mit steigendem Preis. Ungefiltert gemessen sähe jede
  // Reihe künstlich gespreizt aus, und die Zahlen unten wären zu gut.
  const { verlauf: historie } = verlaufEntdoppeln(JSON.parse(fs.readFileSync(pfad, 'utf8')));

  // Je Variante die Preisreihe. Gemessen wird, wie weit die Zahl
  // springt, wenn der teuerste Verkauf wegfällt: Eine Zahl, die sich an
  // einem einzelnen Verkauf festmacht, ist als Preisempfehlung
  // unbrauchbar.
  const reihen = new Map();
  for (const [name, liste] of Object.entries(historie)) {
    if (!Array.isArray(liste)) continue;
    for (const sale of liste) {
      if (!sale?.item) continue;
      // Dieselbe Variantenkennung wie im Betrieb. Grober gruppiert
      // landeten Sammelkarte und Werkzeug in einer Reihe, und gemessen
      // wäre dann das statt der Ausreißer.
      const k = `${name}::${itemVariante(sale.item)}`;
      if (!reihen.has(k)) reihen.set(k, []);
      reihen.get(k).push(Math.round(salePreis(sale)));
    }
  }

  // Zusammengefasst wird über den **Median** der Varianten, nicht über
  // ihren Schnitt. Der Grund ist derselbe, um den es hier die ganze Zeit
  // geht: Ein paar wilde Varianten ziehen einen Schnitt über alle
  // Varianten genauso schief wie ein Mondpreis den über alle Verkäufe.
  // Gemessen am Schnitt kämen 14,8 % statt 10,0 % heraus — dieselbe
  // Aussage, nur unschärfer.
  const mitte = (werte) => {
    const s = [...werte].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  };

  const beweglich = (rechne) => {
    const bewegungen = [];
    for (const preise of reihen.values()) {
      if (preise.length < 8) continue;
      const sortiert = [...preise].sort((a, b) => a - b);
      const mit = rechne(preise);
      const ohne = rechne(sortiert.slice(0, -1));
      if (mit > 0) bewegungen.push((Math.abs(mit - ohne) / mit) * 100);
    }
    return mitte(bewegungen);
  };

  const untersucht = [...reihen.values()].filter((p) => p.length >= 8).length;
  pruefe(untersucht > 500, `Genug Varianten für eine Messung`, `${untersucht}`);

  const bewegungRoh = beweglich(rohesMittel);
  const bewegungNeu = beweglich(winsorisierterSchnitt);

  console.log(`       fällt der teuerste Verkauf weg, bewegt sich die Zahl um: ` +
    `roh ${bewegungRoh.toFixed(1)} %, winsorisiert ${bewegungNeu.toFixed(1)} %`);
  pruefe(bewegungNeu < bewegungRoh / 2, 'Ein einzelner Verkauf bewegt weniger als halb so viel',
    `${bewegungNeu.toFixed(1)} % statt ${bewegungRoh.toFixed(1)} %`);

  // Und die Schieflage: Ein Schnitt liegt über dem typischen Preis,
  // weil es nach oben unendlich weit geht und nach unten bei 1 endet.
  const median = (preise) => {
    const s = [...preise].sort((a, b) => a - b);
    const m = Math.floor(s.length / 2);
    return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
  };
  const schieflage = (rechne) => {
    const werte = [];
    for (const preise of reihen.values()) {
      if (preise.length < 8) continue;
      const typischer = median(preise);
      if (typischer > 0) werte.push(((rechne(preise) - typischer) / typischer) * 100);
    }
    return mitte(werte);
  };

  const schiefRoh = schieflage(rohesMittel);
  const schiefNeu = schieflage(winsorisierterSchnitt);
  console.log(`       über dem typischen Preis liegt die Zahl um: ` +
    `roh +${schiefRoh.toFixed(1)} %, winsorisiert +${schiefNeu.toFixed(1)} %`);
  pruefe(Math.abs(schiefNeu) < Math.abs(schiefRoh) / 3, 'Und die Schieflage schrumpft auf ein Drittel',
    `+${schiefNeu.toFixed(1)} % statt +${schiefRoh.toFixed(1)} %`);

  // Die Gegenprobe: Bei sauberen Reihen soll sich möglichst wenig
  // ändern. Wäre es ein pauschaler Abschlag, träfe er auch die.
  // "Sauber" heißt hier: kein Verkauf liegt mehr als doppelt so hoch wie
  // der typische Preis. Da gibt es nichts zu dämpfen — und genau deshalb
  // ist das die Gegenprobe. Ein pauschaler Abschlag träfe diese Reihen
  // genauso stark wie die mit den Mondpreisen.
  const sauberBewegt = [];
  const schiefBewegt = [];
  for (const preise of reihen.values()) {
    if (preise.length < 8) continue;
    const typischer = median(preise);
    if (!typischer) continue;
    const roh = rohesMittel(preise);
    const bewegung = (Math.abs(winsorisierterSchnitt(preise) - roh) / roh) * 100;
    (Math.max(...preise) > typischer * 2 ? schiefBewegt : sauberBewegt).push(bewegung);
  }
  console.log(`       gegenüber heute bewegt sich die Zahl um: ` +
    `${mitte(sauberBewegt).toFixed(1)} % bei ${sauberBewegt.length} sauberen Reihen, ` +
    `${mitte(schiefBewegt).toFixed(1)} % bei ${schiefBewegt.length} mit Ausreißern`);
  pruefe(sauberBewegt.length > 100 && mitte(sauberBewegt) < 5,
    'Bei sauberen Preisen ändert sich so gut wie nichts',
    `${mitte(sauberBewegt).toFixed(1)} % bei ${sauberBewegt.length} Reihen`);
  pruefe(mitte(schiefBewegt) > mitte(sauberBewegt) * 3,
    'Und bei Reihen mit Ausreißern deutlich mehr — dort soll es ja wirken',
    `${mitte(schiefBewegt).toFixed(1)} % statt ${mitte(sauberBewegt).toFixed(1)} %`);
}

function salePreis(sale) {
  const preis = sale.finalPrice ?? sale.currentBid ?? sale.startBid ?? 0;
  return preis / (sale.item?.amount || 1);
}

console.log(fehler === 0 ? '\nAlle Prüfungen bestanden.' : `\n${fehler} fehlgeschlagen.`);
process.exit(fehler === 0 ? 0 : 1);
