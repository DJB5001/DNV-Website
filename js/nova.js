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

  /* ── Sternenfeld ────────────────────────────────────────────────
     Nur auf der Clan-Seite. Die App bekommt bewusst kein bewegtes
     Feld: Über Preistabellen wäre es Unruhe statt Atmosphäre. */

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
