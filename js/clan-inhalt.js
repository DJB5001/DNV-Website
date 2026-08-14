/* ═══════════════════════════════════════════════════════════════
   DarkNova · Clan-Inhalte
   ---------------------------------------------------------------
   Eine Quelle für beide Seiten: die Clan-Seite (clan.html) und den
   Home-Reiter in OPSuchtWeb. Wer hier etwas ändert, ändert es an
   beiden Stellen.

   Die Klassen tragen alle das Präfix dnv-, weil die Abschnitte in
   zwei völlig verschiedenen Stilwelten landen: clan.css auf der
   Clan-Seite, style.css samt theme.css in der App. Gestaltet werden
   sie von css/clan-inhalt.css, die sich ihre Farben aus der jeweils
   umgebenden Seite holt.

   Gefüllt wird jeder Container mit data-clan-inhalt.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var symbole = {
    leute:
      '<path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />',
    bau: '<path d="M3 21h18M5 21V7l7-4 7 4v14M9 21v-6h6v6" />',
    zahnrad:
      '<path d="M12 3v2M12 19v2M5 12H3M21 12h-2M6.3 6.3L4.9 4.9M19.1 19.1l-1.4-1.4M17.7 6.3l1.4-1.4M4.9 19.1l1.4-1.4" /><circle cx="12" cy="12" r="4" />',
    beitritt:
      '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M19 8v6M22 11h-6" />',
    wuerfel: '<path d="M12 2l9 5v10l-9 5-9-5V7z" /><path d="M12 12l9-5M12 12v10M12 12L3 7" />',
    haken:
      '<path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />',
    burg: '<path d="M2 20h20M4 20V9l8-6 8 6v11" /><path d="M10 20v-5h4v5M9 11h1M14 11h1" />',
    felder:
      '<rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" />',
    karte: '<path d="M3 6l6-3 6 3 6-3v15l-6 3-6-3-6 3z" /><path d="M9 3v15M15 6v15" />',
    sprechblase: '<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />',
    formular:
      '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M9 13h6M9 17h6" />',
    geschenk:
      '<path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />',
    kiste:
      '<path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" /><path d="M3.3 7L12 12l8.7-5M12 22V12" />'
  };

  function svg(name) {
    return `<svg viewBox="0 0 24 24" aria-hidden="true">${symbole[name] || ''}</svg>`;
  }

  function kopf(plakette, symbol, titel, akzent, text) {
    return `
      <div class="dnv-kopf">
        <span class="dnv-plakette">${svg(symbol)}${plakette}</span>
        <h2 class="dnv-titel">${titel} <em>${akzent}</em></h2>
        ${text ? `<p class="dnv-einleitung">${text}</p>` : ''}
      </div>`;
  }

  function karte(symbol, titel, text, chip) {
    return `
      <article class="dnv-karte">
        <span class="dnv-karte__symbol" aria-hidden="true">${svg(symbol)}</span>
        <h3 class="dnv-karte__titel">${titel}</h3>
        <p class="dnv-karte__text">${text}</p>
        ${chip ? `<span class="dnv-karte__chip">${chip}</span>` : ''}
      </article>`;
  }

  var abschnitte = [
    // ── Wer wir sind ──────────────────────────────────────────────
    `<section class="dnv-band" id="dnv-ueberuns" data-mc-motiv="weite">
      ${kopf(
        'Wer wir sind',
        'leute',
        'Mehr als nur ein',
        'Minecraft-Clan',
        'Wir sind noch am Anfang — und genau das ist der Punkt. Wer jetzt einsteigt, entscheidet mit, wie dieser Clan aussieht.'
      )}
      <div class="dnv-raster dnv-raster--zwei">
        ${karte(
          'wuerfel',
          'Platz im Team, nicht nur in der Liste',
          'Bei etablierten Clans sind die Plätze im Team seit Jahren vergeben. Bei uns zählt nicht, wer zuerst da war, sondern wer mitzieht.',
          'Seit 2026'
        )}
        ${karte(
          'haken',
          'Feste Abläufe statt Zurufe',
          'Bewerbungen laufen über ein Formular, Support über Tickets, Aufträge über ein System, das jeder einsehen kann. So hängt nichts an einer einzelnen Person.',
          'Nachvollziehbar'
        )}
      </div>
    </section>`,

    // ── Projekte ──────────────────────────────────────────────────
    `<section class="dnv-band" id="dnv-projekte" data-mc-motiv="bluete">
      ${kopf(
        'Woran wir bauen',
        'bau',
        'Unsere',
        'Projekte',
        'Drei Vorhaben, unterschiedlich weit. Der Status steht dran, damit niemand raten muss.'
      )}
      <div class="dnv-raster">
        ${karte(
          'burg',
          'Hogwarts',
          'Unser größtes Bauprojekt, Stück für Stück hochgezogen. Wer mitbauen will, bekommt einen Bereich, den er selbst gestaltet.',
          'In Arbeit'
        )}
        ${karte(
          'felder',
          'Clan-Grundstücke',
          'Der Ausbau läuft. Jedes Mitglied bekommt eigene Fläche und darf sich dort austoben — inklusive Mitsprache bei der Gesamtplanung.',
          'Laufend'
        )}
        ${karte(
          'karte',
          'Mehrere CityBuilds',
          'Langfristig wollen wir nicht nur auf einem CityBuild aktiv sein, sondern auf mehreren Spuren hinterlassen.',
          'Geplant'
        )}
      </div>
    </section>`,

    // ── Infrastruktur ─────────────────────────────────────────────
    `<section class="dnv-band" id="dnv-bot" data-mc-motiv="ritt">
      ${kopf(
        'Was uns besonders macht',
        'zahnrad',
        'Eigene',
        'Infrastruktur',
        'Kein Baukasten von der Stange — auf unsere Abläufe zugeschnitten und selbst gebaut.'
      )}
      <div class="dnv-raster">
        ${karte(
          'sprechblase',
          'Support-Tickets',
          'Kategorie wählen, privater Channel öffnet sich. Nur du und das Team sehen ihn. Beim Schließen wird der Verlauf gesichert.',
          'DNV | System'
        )}
        ${karte(
          'formular',
          'Bewerbungen',
          'Formular ausfüllen, das Team prüft, danach ein kurzes Gespräch im Voice. Erst dann wird über die Aufnahme entschieden.',
          'Mit Gespräch'
        )}
        ${karte(
          'geschenk',
          'Gewinnspiele',
          'Laufzeit und Gewinnerzahl festlegen, Teilnahme per Knopfdruck. Die Ziehung läuft automatisch, auch nach einem Neustart.',
          'Automatisch'
        )}
        ${karte(
          'kiste',
          'Item-Verleih',
          'Gegenstände im Clan-Bestand. Der Bot führt Buch darüber, was gerade draußen ist und bei wem — mit Bild zu jedem Item.',
          '31 Items'
        )}
      </div>
    </section>`,

    // ── Mitmachen ─────────────────────────────────────────────────
    `<section class="dnv-band" id="dnv-mitmachen" data-mc-motiv="hoehle">
      ${kopf(
        'Interesse?',
        'beitritt',
        'Werde Teil von',
        'DarkNova',
        'Die Bewerbung läuft über unser Discord und dauert keine zwei Minuten. Danach melden wir uns für ein kurzes Kennenlerngespräch.'
      )}
      <ul class="dnv-liste">
        <li>Ab 13 Jahren — Ausnahmen nach Absprache</li>
        <li>Regelmäßig aktiv auf dem Server und im Discord</li>
        <li>Freundlicher, respektvoller Umgang</li>
        <li>Lust auf gemeinsame Projekte statt nur alleine farmen</li>
      </ul>
      <div class="dnv-knopfreihe">
        <a class="dnv-knopf dnv-knopf--voll" href="https://discord.gg/CD4VWsjBqw" target="_blank" rel="noopener noreferrer">Discord beitreten</a>
      </div>
    </section>`
  ];

  function zeichnen() {
    document.querySelectorAll('[data-clan-inhalt]').forEach(function (ziel) {
      if (ziel.dataset.gezeichnet) return;
      ziel.dataset.gezeichnet = '1';
      ziel.innerHTML = abschnitte.join('');
    });
  }

  window.dnvClanInhaltZeichnen = zeichnen;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', zeichnen);
  } else {
    zeichnen();
  }
})();
