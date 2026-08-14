/* ═══════════════════════════════════════════════════════════════
   DarkNova · Bewegung
   ---------------------------------------------------------------
   Wird von clan.html und index.html geladen. Alles hier ist
   optional: Fehlt ein Element, passiert schlicht nichts. Die Datei
   fasst keine ID und keine Klasse aus script.js an.

   Wer "Bewegung reduzieren" im Betriebssystem gesetzt hat, bekommt
   denselben Inhalt sofort und ohne Animation.
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  var sparsam = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var kannBeobachten = 'IntersectionObserver' in window;

  /* ── Auftauchen beim Scrollen ───────────────────────────────────
     Elemente mit .auf starten unsichtbar und fahren nach oben ins
     Bild. Die Verzögerung steuert --i, damit Karten gestaffelt
     erscheinen statt alle gleichzeitig. */

  var kandidaten = document.querySelectorAll('.auf');

  if (!kandidaten.length) {
    // nichts zu tun
  } else if (sparsam || !kannBeobachten) {
    kandidaten.forEach(function (el) { el.classList.add('sichtbar'); });
    zahlenSofort();
  } else {
    var wartend = Array.prototype.slice.call(kandidaten);

    var beobachter = new IntersectionObserver(function (eintraege) {
      eintraege.forEach(function (eintrag) {
        if (eintrag.isIntersecting) freigeben(eintrag.target);
      });
    }, { threshold: 0, rootMargin: '0px 0px -10% 0px' });

    wartend.forEach(function (el) { beobachter.observe(el); });

    /* Sicherheitsnetz.

       Der Beobachter meldet nur Zustandswechsel, und seine Rückrufe
       laufen asynchron. Wer sehr schnell nach unten und sofort wieder
       nach oben scrollt, kann sie überholen: Der Rückruf trifft dann
       erst ein, wenn das Element schon wieder draußen ist, meldet
       "nicht sichtbar" — und das Element bliebe bis zum Neuladen auf
       Deckkraft null. Bei einem Knopf zur Bewerbung wäre das fatal.

       Deshalb hier zusätzlich die schlichte geometrische Prüfung: Was
       oberhalb der Unterkante steht, wird freigegeben. Beide Wege
       lösen am selben Punkt aus, der zweite kann nichts verpassen. */
    var netzOffen = false;

    function sicherheitsnetz() {
      for (var i = wartend.length - 1; i >= 0; i--) {
        if (wartend[i].getBoundingClientRect().top < window.innerHeight * 0.9) {
          freigeben(wartend[i]);
        }
      }
      if (!wartend.length) {
        window.removeEventListener('scroll', beiScroll);
        window.removeEventListener('resize', beiScroll);
      }
    }

    function beiScroll() {
      if (netzOffen) return;
      netzOffen = true;
      requestAnimationFrame(function () {
        netzOffen = false;
        sicherheitsnetz();
      });
    }

    window.addEventListener('scroll', beiScroll, { passive: true });
    window.addEventListener('resize', beiScroll);
    sicherheitsnetz();
  }

  // Wird nur aus dem Beobachter-Zweig heraus aufgerufen; beobachter und
  // wartend sind dort gesetzt. Die Funktionsdeklaration steht unten,
  // ist aber hochgezogen und damit oben schon verwendbar.
  function freigeben(el) {
    if (el.classList.contains('sichtbar')) return;
    el.classList.add('sichtbar');
    beobachter.unobserve(el);
    var i = wartend.indexOf(el);
    if (i > -1) wartend.splice(i, 1);
    zaehlerStarten(el);
  }

  /* ── Zahlen laufen hoch ─────────────────────────────────────────
     Läuft erst, wenn der Block sichtbar wird — sonst ist die
     Animation vorbei, bevor jemand hinsieht. */

  function zaehlerStarten(wurzel) {
    if (!wurzel.querySelectorAll) return;
    wurzel.querySelectorAll('[data-ziel]').forEach(function (el) {
      if (el.dataset.gelaufen) return;
      el.dataset.gelaufen = '1';

      var ziel = parseInt(el.dataset.ziel, 10);
      var anhang = el.dataset.anhang || '';
      if (isNaN(ziel)) return;

      var start = performance.now();
      var dauer = 900;

      requestAnimationFrame(function schritt(jetzt) {
        var t = Math.min((jetzt - start) / dauer, 1);
        // ease-out: die Zahl rast los und rastet am Ende sanft ein
        el.textContent = Math.round(ziel * (1 - Math.pow(1 - t, 3))) + (t === 1 ? anhang : '');
        if (t < 1) requestAnimationFrame(schritt);
      });
    });
  }

  function zahlenSofort() {
    document.querySelectorAll('[data-ziel]').forEach(function (el) {
      el.textContent = el.dataset.ziel + (el.dataset.anhang || '');
    });
  }

  if (sparsam || !kannBeobachten) zahlenSofort();

  /* ── Schein folgt dem Zeiger ────────────────────────────────────
     Die Karte selbst bleibt ruhig; bewegt wird nur der Mittelpunkt
     eines Farbverlaufs. Ohne Zeiger (Tastatur, Touch) sitzt er
     mittig — deshalb hat --mx/--my im CSS einen Vorgabewert.

     Bewusst ein einzelner Zuhörer am Dokument statt einer pro Karte:
     In der App baut script.js die Karten erst zur Laufzeit, an eine
     Liste von heute gebundene Zuhörer würden sie nie erreichen. */

  var scheinZiele = '.karte, .card, [data-schein]';
  var offeneBildmessung = false;

  document.addEventListener(
    'pointermove',
    function (e) {
      if (offeneBildmessung) return;
      var el = e.target.closest && e.target.closest(scheinZiele);
      if (!el) return;
      offeneBildmessung = true;
      requestAnimationFrame(function () {
        var kasten = el.getBoundingClientRect();
        el.style.setProperty('--mx', (e.clientX - kasten.left) + 'px');
        el.style.setProperty('--my', (e.clientY - kasten.top) + 'px');
        offeneBildmessung = false;
      });
    },
    { passive: true }
  );

  /* ── Hintergrundmotive ──────────────────────────────────────────
     Vier Bilder liegen übereinander in .mc-grund, sichtbar ist immer
     genau eines. Gewechselt wird per Klasse — das Überblenden macht
     die CSS.

     Woher das Motiv kommt, hängt von der Seite ab:
       Clan-Seite: vom Abschnitt, der gerade in der Mitte steht.
       App:        vom offenen Reiter.
     Beides steuert dieselbe Funktion. */

  var MOTIVE = ['hoehle', 'ritt', 'weite', 'bluete'];

  var grundEbenen = {};
  document.querySelectorAll('.mc-grund__bild').forEach(function (el) {
    grundEbenen[el.dataset.motiv] = el;
  });

  var kopfband = document.querySelector('.mc-kopfband');
  var aktuellesMotiv = 'hoehle';

  function motivSetzen(motiv, auchBand) {
    if (!motiv || !grundEbenen[motiv] || motiv === aktuellesMotiv) return;
    aktuellesMotiv = motiv;
    MOTIVE.forEach(function (m) {
      if (grundEbenen[m]) grundEbenen[m].classList.toggle('an', m === motiv);
    });
    // Das Kopfband wechselt nur in der App mit. Auf der Clan-Seite
    // gehört es fest zum Kopfbereich und soll dort stehen bleiben.
    if (auchBand && kopfband) {
      MOTIVE.forEach(function (m) {
        kopfband.classList.remove('mc-motiv--' + m);
      });
      kopfband.classList.add('mc-motiv--' + motiv);
    }
  }

  window.dnvMotiv = motivSetzen;

  /* Clan-Seite: der Abschnitt, der die Mitte des Fensters kreuzt,
     bestimmt das Bild.

     Bewusst über getBoundingClientRect statt IntersectionObserver:
     dessen Verhältniswert bezieht sich auf die Grösse des Elements,
     nicht auf die des Fensters. Ein Abschnitt, der höher ist als das
     Fenster, käme dabei nie über 0,5 und verlöre gegen jeden kurzen
     Abschnitt daneben. */

  /* Die Liste wird nachgezogen statt einmal festgehalten: die meisten
     Abschnitte baut js/clan-inhalt.js erst bei DOMContentLoaded ein,
     also nach dieser Datei. Eine hier eingefrorene Auswahl kennte nur
     den Kopfbereich und die Mitglieder. */
  var motivBereiche = [];

  function bereicheSammeln() {
    motivBereiche = [].slice.call(document.querySelectorAll('[data-mc-motiv]'));
  }

  var offenePruefung = false;

  function motivPruefen() {
    var mitte = window.innerHeight * 0.42;
    var treffer = null;
    motivBereiche.forEach(function (el) {
      var kasten = el.getBoundingClientRect();
      if (kasten.top <= mitte && kasten.bottom > mitte) treffer = el;
    });
    if (treffer) motivSetzen(treffer.dataset.mcMotiv, false);
  }

  bereicheSammeln();

  // Nur ohne Reiterleiste, also auf der Clan-Seite. In der App würde
  // das Scrollen dem Reiter sein Motiv wieder wegnehmen.
  if (!document.getElementById('tabs')) {
    window.addEventListener(
      'scroll',
      function () {
        if (offenePruefung) return;
        offenePruefung = true;
        requestAnimationFrame(function () {
          motivPruefen();
          offenePruefung = false;
        });
      },
      { passive: true }
    );

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', function () {
        bereicheSammeln();
        motivPruefen();
      });
    }
    motivPruefen();
  }

  /* App: jeder Reiter bekommt sein eigenes Bild. Was nicht in der
     Liste steht, behält das Motiv des Kopfbereichs. */
  var REITER_MOTIV = {
    clan: 'hoehle',
    mitglieder: 'ritt',
    market: 'weite',
    auctions: 'bluete',
    deals: 'hoehle',
    history: 'ritt',
    shards: 'weite',
    items: 'bluete',
    profile: 'ritt'
  };

  /* ── Clan-Knopf als Reiter ──────────────────────────────────────
     In der App ist der Clan-Knopf ein Reiter wie Markt oder Auktionen,
     liegt aber außerhalb von #tabs. showSection räumt beim Wechsel nur
     die Knöpfe INNERHALB von #tabs auf — der Clan-Knopf bliebe also für
     immer hervorgehoben. Statt script.js anzufassen, wird die Funktion
     hier umschlossen: erst das Original, dann die eine Ergänzung. */

  /* Klick auf den Clan-Knopf. Klappt der Reiterwechsel, bleibt man auf
     der Seite; scheitert er, führt der Link wie früher auf clan.html.
     Ein blosses "return false" im onclick wäre riskant: Wirft goToTab,
     wird es nie erreicht — und der Knopf täte gar nichts. */
  window.dnvClanReiter = function (ereignis) {
    try {
      if (typeof goToTab !== 'function' || !document.getElementById('clan')) return true;
      goToTab('clan');
      if (ereignis && ereignis.preventDefault) ereignis.preventDefault();
      return false;
    } catch (e) {
      // Rückfall: dem Link folgen
      return true;
    }
  };

  if (typeof window.showSection === 'function') {
    var urspruenglich = window.showSection;
    window.showSection = function (id) {
      urspruenglich.apply(this, arguments);
      var clanKnopf = document.getElementById('tab-clan');
      if (clanKnopf) clanKnopf.classList.toggle('active', id === 'clan');
      // Die Mitglieder stehen fest im HTML, brauchen also keinen
      // Neuaufbau — nur beim ersten Betreten, falls das Zeichnen vor dem
      // Einfügen der Abschnitte lief.
      if (id === 'mitglieder' && typeof window.dnvMitgliederZeichnen === 'function') {
        window.dnvMitgliederZeichnen();
      }
      motivSetzen(REITER_MOTIV[id] || 'hoehle', true);
    };
  }

  /* ── Sternenfeld ────────────────────────────────────────────────
     Nur auf der Clan-Seite. Die App bekommt bewusst kein bewegtes
     Feld: Über Preistabellen wäre es Unruhe statt Atmosphäre. */

  /* ── Blockfeld ──────────────────────────────────────────────────
     Ein Hauch Minecraft im Hintergrund: langsam treibende Würfel in
     isometrischer Ansicht, gezeichnet statt fotografiert.

     Bewusst kein Bild aus dem Netz: Das wäre fremdes Material, würde
     Ladezeit kosten und müsste für jede Bildschirmgröße neu skaliert
     werden. Gezeichnete Würfel sind ein paar Zeilen groß, passen sich
     jeder Größe an und tragen die Farben des Clans.

     Sehr zurückhaltend gehalten — der Hintergrund soll Tiefe geben,
     nicht um Aufmerksamkeit kämpfen. */

  var blockfeld = document.getElementById('blockfeld');
  if (blockfeld && !sparsam) {
    (function () {
      var ctx = blockfeld.getContext('2d');
      var wuerfel = [];
      var b = 0;
      var h = 0;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var laeuft = true;

      // Die drei sichtbaren Flächen eines Würfels. Unterschiedliche
      // Helligkeit erzeugt die Körperlichkeit, nicht eine Schattierung.
      var FLAECHEN = [
        { deckung: 1.0, punkte: [[0, -0.5], [0.87, 0], [0, 0.5], [-0.87, 0]] },      // oben
        { deckung: 0.62, punkte: [[-0.87, 0], [0, 0.5], [0, 1.5], [-0.87, 1]] },     // links
        { deckung: 0.38, punkte: [[0.87, 0], [0, 0.5], [0, 1.5], [0.87, 1]] }        // rechts
      ];

      function messen() {
        var kasten = blockfeld.parentElement.getBoundingClientRect();
        b = kasten.width;
        h = kasten.height;
        blockfeld.width = Math.round(b * dpr);
        blockfeld.height = Math.round(h * dpr);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        wuerfel = [];
        var anzahl = Math.min(Math.round(b * h / 42000), 26);
        for (var i = 0; i < anzahl; i++) {
          wuerfel.push({
            x: Math.random() * b,
            y: Math.random() * h,
            groesse: 16 + Math.random() * 30,
            tempo: 0.05 + Math.random() * 0.14,
            deckung: 0.03 + Math.random() * 0.05,
            schwung: Math.random() * Math.PI * 2
          });
        }
      }

      function malen() {
        if (!laeuft) return;
        ctx.clearRect(0, 0, b, h);

        for (var i = 0; i < wuerfel.length; i++) {
          var w = wuerfel[i];
          w.y -= w.tempo;
          w.schwung += 0.004;
          if (w.y < -w.groesse * 2) {
            w.y = h + w.groesse * 2;
            w.x = Math.random() * b;
          }

          // Sanftes Pendeln zur Seite, damit die Bewegung nicht wie ein
          // Fahrstuhl wirkt.
          var x = w.x + Math.sin(w.schwung) * 12;

          for (var f = 0; f < FLAECHEN.length; f++) {
            var flaeche = FLAECHEN[f];
            ctx.beginPath();
            for (var p = 0; p < flaeche.punkte.length; p++) {
              var px = x + flaeche.punkte[p][0] * w.groesse;
              var py = w.y + flaeche.punkte[p][1] * w.groesse;
              if (p === 0) ctx.moveTo(px, py);
              else ctx.lineTo(px, py);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(169, 126, 240, ' + (w.deckung * flaeche.deckung).toFixed(4) + ')';
            ctx.fill();
          }
        }
        requestAnimationFrame(malen);
      }

      messen();
      malen();

      var wartetB;
      window.addEventListener('resize', function () {
        clearTimeout(wartetB);
        wartetB = setTimeout(messen, 180);
      });

      document.addEventListener('visibilitychange', function () {
        if (document.hidden) {
          laeuft = false;
        } else if (!laeuft) {
          laeuft = true;
          requestAnimationFrame(malen);
        }
      });
    })();
  }

  var leinwand = document.getElementById('sternenfeld');
  if (leinwand && !sparsam) {
    var ctx = leinwand.getContext('2d');
    var sterne = [];
    var breite = 0;
    var hoehe = 0;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var laeuft = true;

    function messen() {
      var traeger = leinwand.parentElement.getBoundingClientRect();
      breite = traeger.width;
      hoehe = traeger.height;
      leinwand.width = Math.round(breite * dpr);
      leinwand.height = Math.round(hoehe * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      sterne = [];
      var anzahl = Math.min(Math.round(breite * hoehe / 9000), 220);
      for (var i = 0; i < anzahl; i++) {
        sterne.push({
          x: Math.random() * breite,
          y: Math.random() * hoehe,
          r: Math.random() * 1.35 + 0.25,
          t: Math.random() * Math.PI * 2,
          v: Math.random() * 0.11 + 0.02
        });
      }
    }

    function malen() {
      if (!laeuft) return;
      ctx.clearRect(0, 0, breite, hoehe);
      for (var i = 0; i < sterne.length; i++) {
        var s = sterne[i];
        s.t += 0.011;
        s.y -= s.v;
        if (s.y < -2) {
          s.y = hoehe + 2;
          s.x = Math.random() * breite;
        }
        // Das Funkeln sitzt in der Deckkraft, nicht im Radius —
        // sonst flackert das Bild, statt zu atmen.
        var a = Math.max(0.28 + Math.sin(s.t) * 0.3, 0.05);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(214, 200, 255, ' + a.toFixed(3) + ')';
        ctx.fill();
      }
      requestAnimationFrame(malen);
    }

    messen();
    malen();

    var wartet;
    window.addEventListener('resize', function () {
      clearTimeout(wartet);
      wartet = setTimeout(messen, 180);
    });

    // Im Hintergrundtab nicht weiterrechnen.
    document.addEventListener('visibilitychange', function () {
      if (document.hidden) {
        laeuft = false;
      } else if (!laeuft) {
        laeuft = true;
        requestAnimationFrame(malen);
      }
    });
  }
})();
