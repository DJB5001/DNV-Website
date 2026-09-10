// Service Worker für OPSUCHT.INFO PWA
// Cached die statischen Dateien, damit die App auch offline startet.
//
// Laufende Daten (Auktionen, Markt, Namensdienste) kommen weiterhin
// immer frisch aus dem Netz. Die beiden großen Verlaufsdateien nicht
// mehr: Sie werden gespeichert und im Hintergrund erneuert — 7 MB bei
// jedem Aufruf war der Grund, warum die Seite sich langsam anfühlte.

// Hochzählen, sobald sich die Liste ändert — beim Aktivieren wirft der
// Worker alle Caches weg, die nicht mehr so heißen.
const CACHE_NAME = 'opsucht-static-v13';

// Getrennt von den statischen Dateien: Hier liegen die Verlaufsdateien
// aus dem Datenrepo. Zwei Speicher, damit das Aufräumen des einen nicht
// den anderen mitnimmt — und damit sich die Verlaufsdaten wegwerfen
// lassen, ohne die App offline unbrauchbar zu machen.
const DATEN_CACHE = 'opsucht-daten-v1';

// Nur diese beiden. "Alles von raw.githubusercontent" wäre zu weit
// gefasst: Dort liegen auch die Mitgliederliste und der Wert-Index, und
// die sollen nicht unbemerkt veralten.
const DATEN_DATEIEN = ['auction-history.json', 'shard-history.json'];
const STATIC_ASSETS = [
  './',
  './index.html',
  './clan.html',
  './impressum.html',
  './datenschutz.html',
  './nutzungsbedingungen.html',
  './css/style.css',
  './css/user-profile.css',
  './css/auth.css',
  './css/theme.css',
  './css/clan.css',
  './css/mitglieder.css',
  './css/clan-inhalt.css',
  './css/hintergrund.css',
  './js/chart.js',
  './js/script.js',
  './js/config.js',
  './js/clan-inhalt.js',
  './js/mitglieder.js',
  './js/nova.js',
  './js/supabase-config.js',
  './js/supabase-compat.js',
  './manifest.webmanifest',
  './images/hintergrund/hoehle.webp',
  './images/hintergrund/ritt.webp',
  './images/hintergrund/weite.webp',
  './images/hintergrund/bluete.webp'
];

// Installation: statische Dateien cachen
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS)).catch(() => {})
  );
  self.skipWaiting();
});

// Aktivierung: alte Caches aufräumen
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys.filter((k) => k !== CACHE_NAME && k !== DATEN_CACHE).map((k) => caches.delete(k))
      )
    )
  );
  self.clients.claim();
});

/**
 * Aus dem Speicher antworten und im Hintergrund erneuern.
 *
 * Der Auktionsverlauf ist 33 MB groß (7 MB über die Leitung) und wurde
 * bisher bei jedem Aufruf neu geholt. Gebraucht wird er für
 * Durchschnitte und den Verlaufs-Reiter — beides verträgt eine Fassung,
 * die ein paar Minuten alt ist, zumal das Datenrepo ohnehin nur alle 15
 * Minuten neu baut.
 *
 * Deshalb: sofort das Gespeicherte ausliefern, die frische Fassung
 * daneben holen und ablegen. Der nächste Aufruf sieht sie. Schlägt das
 * Netz fehl, bleibt das Alte stehen, statt dass die Seite leer bleibt.
 */
function ausSpeicherUndErneuern(request) {
  // Der Aktualisieren-Knopf schickt seine Anfrage mit cache: 'reload'.
  // Wer ihn drückt, will neue Zahlen — die Konserve wäre dann genau die
  // falsche Antwort. Abgelegt wird das Ergebnis trotzdem.
  const willFrisch = request.cache === 'reload' || request.cache === 'no-store';

  return caches.open(DATEN_CACHE).then((cache) => {
    if (willFrisch) {
      return fetch(request)
        .then((antwort) => {
          if (antwort && antwort.ok) cache.put(request, antwort.clone()).catch(() => {});
          return antwort;
        })
        .catch(() => cache.match(request).then((alt) => alt || new Response('', { status: 503 })));
    }

    return cache.match(request).then((gespeichert) => {
      const ausDemNetz = fetch(request)
        .then((antwort) => {
          if (antwort && antwort.ok) cache.put(request, antwort.clone()).catch(() => {});
          return antwort;
        })
        .catch(() => gespeichert || new Response('', { status: 503 }));

      return gespeichert || ausDemNetz;
    });
  });
}

// Fetch-Strategie:
// - laufende Daten (opsucht.net, supabase, Namensdienste): immer Netz
// - die großen Verlaufsdateien: aus dem Speicher, im Hintergrund erneuern
// - statische Dateien: erst Netz, bei Störung aus dem Speicher
self.addEventListener('fetch', (event) => {
  const url = event.request.url;

  // Laufende Auktionen und Gebote dürfen nie aus der Konserve kommen.
  // Eine langsame Seite ist ärgerlich; ein Gebot von vor zehn Minuten
  // als aktueller Stand ist falsch.
  const isLiveData =
    url.includes('api.opsucht.net') ||
    url.includes('supabase.co') ||
    url.includes('supabase.com') ||
    url.includes('playerdb.co') ||
    url.includes('ashcon.app');

  if (isLiveData) {
    event.respondWith(fetch(event.request).catch(() => new Response('', { status: 503 })));
    return;
  }

  if (url.includes('raw.githubusercontent.com') && DATEN_DATEIEN.some((d) => url.includes(d))) {
    event.respondWith(ausSpeicherUndErneuern(event.request));
    return;
  }

  // Statische Dateien: NETWORK-FIRST.
  // Immer zuerst die frische Version aus dem Netz holen und in den Cache legen.
  // Nur wenn offline (Netz schlägt fehl), aus dem Cache bedienen.
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone();
        caches.open(CACHE_NAME).then((cache) => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
      .catch(() => caches.match(event.request))
  );
});
