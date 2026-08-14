/* ═══════════════════════════════════════════════════════════════
   DarkNova · Mitglieder
   ---------------------------------------------------------------
   Eine Datenquelle für beide Seiten: die Clan-Seite und den
   Mitglieder-Reiter in OPSuchtWeb.

   Die Liste kommt aus data/mitglieder.json. Diese Datei schreibt der
   Discord-Bot aus den Serverrollen — wer dort einen Rang bekommt oder
   verliert, steht wenige Minuten später auch hier. Von Hand muss
   niemand mehr etwas nachtragen.

   Die Liste weiter unten ist nur der Notnagel: Sie greift, solange der
   Bot noch nie geschrieben hat oder die Datei gerade nicht zu laden ist.
   Ohne sie stünde die Seite im Fehlerfall leer da.
   ═══════════════════════════════════════════════════════════════ */

const dnvRollen = {
  'Owner': { rang: 1, farbe: 'fuehrung' },
  'Co-Owner': { rang: 2, farbe: 'fuehrung' },
  'Admin': { rang: 3, farbe: 'fuehrung' },
  'Event Leitung': { rang: 4, farbe: 'leitung' },
  'Builder Leitung': { rang: 5, farbe: 'leitung' },
  'Farmer Leitung': { rang: 6, farbe: 'leitung' },
  'Lager Leitung': { rang: 7, farbe: 'leitung' },
  'Moderator': { rang: 8, farbe: 'team' },
  'Supporter': { rang: 9, farbe: 'team' },
  'Allrounder': { rang: 10, farbe: 'allround' },
  'Builder': { rang: 11, farbe: 'builder' },
  'Farmer': { rang: 12, farbe: 'farmer' },
  // Die alten Bezeichnungen aus der Clan-Übersicht im Spiel
  'Anführer': { rang: 1, farbe: 'fuehrung' },
  'Co-Anführer': { rang: 2, farbe: 'fuehrung' }
};

let dnvMitglieder = [
  { name: 'M4Claiz', rolle: 'Anführer', seit: '2026-08-08' },
  { name: 'DJB500', rolle: 'Co-Anführer', seit: '2026-08-08' },
  { name: 'Ailyn2013', rolle: 'Allrounder', seit: '2026-08-10' },
  { name: 'EagleOneHD123', rolle: 'Farmer', seit: '2026-08-09' },
  { name: 'Starfisch_', rolle: 'Farmer', seit: '2026-08-10' },
  { name: '.Lunoking3904', rolle: 'Farmer', seit: '2026-08-11' },
  { name: 'enrico5667', rolle: 'Farmer', seit: '2026-08-13' },
  { name: 'Itz_Edgar', rolle: 'Farmer', seit: '2026-08-13' },
  { name: 'KilianMMXII', rolle: 'Farmer', seit: '2026-08-13' },
  { name: '.DavidCraft8080', rolle: 'Farmer', seit: '2026-08-14' },
  { name: 'TentieMC', rolle: 'Farmer', seit: '2026-08-14' }
];

(function () {
  'use strict';

  // Kopfbilder: zwei Dienste hintereinander, dann der eigene Ersatz mit
  // dem Anfangsbuchstaben. Ein führender Punkt kennzeichnet auf OPSUCHT
  // Bedrock-Spieler; für die Abfrage muss er weg, ein Kopf existiert dort
  // aber oft trotzdem nicht — dann greift der Ersatz.
  function kopfKette(name) {
    const sauber = String(name).replace(/^\./, '');
    return [
      `https://mc-heads.net/avatar/${encodeURIComponent(sauber)}/96`,
      `https://minotar.net/avatar/${encodeURIComponent(sauber)}/96`
    ];
  }

  function datumLesbar(iso) {
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return d.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  }

  // Rang und Farbe stehen in der Bot-Datei schon drin. Die Tabelle oben ist
  // nur der Rückfall für die Notliste und für Rollen, die der Bot noch nicht
  // kennt — so muss diese Datei nicht jedes Mal mitgepflegt werden.
  const rangVon = (m) => m.rang ?? dnvRollen[m.rolle]?.rang ?? 99;
  const farbeVon = (m) => m.farbe ?? dnvRollen[m.rolle]?.farbe ?? 'farmer';

  function sortiert() {
    return dnvMitglieder.slice().sort((a, b) => {
      const ra = rangVon(a);
      const rb = rangVon(b);
      if (ra !== rb) return ra - rb;
      // Gleicher Rang: wer länger dabei ist, steht vorn
      if (a.seit !== b.seit) return a.seit < b.seit ? -1 : 1;
      return a.name.localeCompare(b.name, 'de');
    });
  }

  function karte(m) {
    const kette = kopfKette(m.name);
    const farbe = farbeVon(m);
    // Der Anfangsbuchstabe als Ersatz, falls kein Kopf zu holen ist.
    const initial = String(m.name).replace(/^\./, '').charAt(0).toUpperCase();

    return `
      <article class="mitglied">
        <div class="mitglied__kopf">
          <span class="mitglied__initial" aria-hidden="true">${initial}</span>
          <img
            src="${kette[0]}"
            alt=""
            loading="lazy"
            data-kopfkette='${JSON.stringify(kette.slice(1))}'
            onerror="dnvKopfFehler(this)"
          />
        </div>
        <h3 class="mitglied__name">${m.name}</h3>
        <span class="mitglied__rolle mitglied__rolle--${farbe}">${m.rolle}</span>
        <p class="mitglied__seit">Dabei seit ${datumLesbar(m.seit)}</p>
      </article>`;
  }

  // Aus onerror aufgerufen: nächste Quelle probieren, sonst das Bild
  // ausblenden — darunter liegt schon der Anfangsbuchstabe.
  window.dnvKopfFehler = function (img) {
    let kette = [];
    try {
      kette = JSON.parse(img.dataset.kopfkette || '[]');
    } catch {
      kette = [];
    }
    if (kette.length) {
      img.dataset.kopfkette = JSON.stringify(kette.slice(1));
      img.src = kette[0];
      return;
    }
    img.onerror = null;
    img.style.display = 'none';
  };

  // Füllt jeden Container mit data-mitglieder. So funktioniert dieselbe
  // Datei auf der Clan-Seite wie im Reiter der App.
  window.dnvMitgliederZeichnen = function (nochmal) {
    const liste = sortiert();
    document.querySelectorAll('[data-mitglieder]').forEach(ziel => {
      // Einmal zeichnen reicht — außer die Bot-Datei kommt nach, dann wird
      // mit den echten Daten überschrieben.
      if (ziel.dataset.gezeichnet && !nochmal) return;
      ziel.dataset.gezeichnet = '1';
      ziel.innerHTML = liste.map(karte).join('');
    });
    document.querySelectorAll('[data-mitglieder-anzahl]').forEach(el => {
      el.textContent = String(liste.length);
    });
  };

  /* Der Discord-Bot legt die aktuelle Liste als data/mitglieder.json ab.
     Zuerst wird gezeichnet, was schon da ist — die Seite steht damit sofort —
     und sobald die Datei geladen ist, wird mit den echten Daten ersetzt.
     Fehlt oder klemmt sie, bleibt die Notliste stehen. */
  async function ausDatei() {
    try {
      const antwort = await fetch(`data/mitglieder.json?t=${Date.now()}`, { cache: 'no-store' });
      if (!antwort.ok) return;

      const daten = await antwort.json();
      if (!Array.isArray(daten.mitglieder) || daten.mitglieder.length === 0) return;

      dnvMitglieder = daten.mitglieder;
      window.dnvMitgliederZeichnen(true);
    } catch (fehler) {
      console.warn('Mitgliederliste vom Bot nicht ladbar, nutze die hinterlegte:', fehler);
    }
  }

  function start() {
    window.dnvMitgliederZeichnen();
    ausDatei();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
