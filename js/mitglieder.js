/* ═══════════════════════════════════════════════════════════════
   DarkNova · Mitglieder
   ---------------------------------------------------------------
   Eine Datenquelle für beide Seiten: die Clan-Seite und den
   Mitglieder-Reiter in OPSuchtWeb. Wer dazukommt, wird hier
   eingetragen — die Darstellung zieht automatisch nach.

   Stand: 14.08.2026, übernommen aus der Clan-Übersicht im Spiel.
   ═══════════════════════════════════════════════════════════════ */

const dnvRollen = {
  'Anführer': { rang: 1, farbe: 'fuehrung' },
  'Co-Anführer': { rang: 2, farbe: 'fuehrung' },
  'Allrounder': { rang: 3, farbe: 'allround' },
  'Farmer': { rang: 4, farbe: 'farmer' }
};

const dnvMitglieder = [
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

  function sortiert() {
    return dnvMitglieder.slice().sort((a, b) => {
      const ra = dnvRollen[a.rolle]?.rang ?? 99;
      const rb = dnvRollen[b.rolle]?.rang ?? 99;
      if (ra !== rb) return ra - rb;
      // Gleicher Rang: wer länger dabei ist, steht vorn
      if (a.seit !== b.seit) return a.seit < b.seit ? -1 : 1;
      return a.name.localeCompare(b.name, 'de');
    });
  }

  function karte(m) {
    const kette = kopfKette(m.name);
    const farbe = dnvRollen[m.rolle]?.farbe || 'farmer';
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
  window.dnvMitgliederZeichnen = function () {
    const liste = sortiert();
    document.querySelectorAll('[data-mitglieder]').forEach(ziel => {
      if (ziel.dataset.gezeichnet) return;
      ziel.dataset.gezeichnet = '1';
      ziel.innerHTML = liste.map(karte).join('');
    });
    document.querySelectorAll('[data-mitglieder-anzahl]').forEach(el => {
      el.textContent = String(liste.length);
    });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', window.dnvMitgliederZeichnen);
  } else {
    window.dnvMitgliederZeichnen();
  }
})();
