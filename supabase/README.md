# Discord-Anmeldung und Discord-Benachrichtigungen

Die Website meldet über Discord an, und der Bot schickt Direktnachrichten,
wenn eine Auktion verkauft wurde oder gleich ausläuft.

## Was sich für die Nutzer ändert

**Die E-Mail-Anmeldung gibt es nicht mehr.** Bestehende Konten verlieren
damit den Zugang zu ihrer Merkliste, ihren Erinnerungen und ihrer
Minecraft-Verknüpfung. Die Daten bleiben in Supabase liegen, sind aber
nicht mehr erreichbar. **Vorher im Discord ankündigen.**

Die Verifizierung passiert nur noch an einer Stelle: im Discord. Vorher gab
es sie zweimal — im Discord über den Bot und auf der Website über dasselbe
Auktionshaus-Verfahren, mit zwei getrennten Ergebnissen. Wer im Discord
verifiziert ist, ist es jetzt auch auf der Website.

## Einrichten

### 1. SQL einspielen

Im Supabase-Dashboard unter **SQL Editor → New query** den Inhalt von
`discord-benachrichtigungen.sql` einfügen und ausführen. Die Datei ist
mehrfach ausführbar — sie prüft überall vorher, ob es das schon gibt.

Am Ende gibt sie eine Übersicht aus, an der man sieht, ob alles steht.

### 2. Discord als Anmeldeweg einschalten

Im Discord Developer Portal (dieselbe Anwendung wie der Bot):

- **OAuth2** öffnen, `CLIENT ID` und `CLIENT SECRET` merken

Im Supabase-Dashboard:

- **Authentication → Sign In / Providers → Discord** einschalten
- Client-ID und Secret eintragen
- Die dort angezeigte **Callback-URL** kopieren

Zurück im Developer Portal:

- **OAuth2 → Redirects** → die Callback-URL eintragen und speichern

### 3. Bot einrichten

In der `.env` des Bots:

```
SUPABASE_URL=https://<projekt>.supabase.co
SUPABASE_SERVICE_KEY=<service_role-Schlüssel>
WEBSITE_URL=https://dnv-clan.de
```

Der **Service-Role-Schlüssel**, nicht der `anon`-Schlüssel: Der Bot muss an
den RLS-Regeln vorbei lesen und schreiben, weil er keine Nutzersitzung hat.
Er steht im Dashboard unter **Project Settings → API**. Er gehört nirgends
ins Frontend und nicht ins Repo.

Ohne diese Werte läuft der Bot weiter, nur ohne Benachrichtigungen — genau
wie beim Mitglieder-Sync.

### 4. Bestehende Verifizierungen nachtragen

Einmalig im Discord:

```
/verify sync
```

Damit wandern alle bereits verifizierten Mitglieder aus `data/store.json`
nach `discord_verifications`. Ohne diesen Schritt kennt die Website nur die,
die sich ab jetzt neu verifizieren.

## Wie es zusammenspielt

```
Discord-Login ──> Supabase Auth (Provider: discord)
                        │
                        ├─ profiles.discord_id      wer ist das im Discord
                        ├─ notification_settings    was will er, wie früh
                        └─ reminders                welche Auktion, wann
                                  ▲            │
   Website schreibt ──────────────┘            │ Bot liest, schickt DM,
                                               ▼ hakt ab
   Bot ──> OPSucht-API ──> Momentaufnahme ──> verschwunden + hatte Gebote
                                               = verkauft
                                               ──> seller-UUID ──> store.json
                                               ──> Discord-ID ──> DM
```

Die Verkaufserkennung braucht Supabase **nicht**, um zu wissen, wem eine
Auktion gehört: Das `seller`-Feld der Auktion ist dieselbe Minecraft-UUID,
die der Bot bei der Verifizierung gespeichert hat. Supabase beantwortet nur
die Frage „will derjenige das überhaupt?".

Deshalb bekommt eine Verkaufs-Nachricht nur, wer **beides** hat: auf der
Website mit Discord angemeldet **und** im Discord per Minecraft verifiziert.

## Die Tabellen

| Tabelle | Schlüssel | Wer schreibt | Wer liest |
|---|---|---|---|
| `profiles.discord_id` | Konto-ID | Website bei jeder Anmeldung | Bot |
| `discord_verifications` | Discord-ID | Bot | Website |
| `notification_settings` | Discord-ID | Website | Bot |
| `reminders` | Konto-ID + Auktion | Website | Bot |

`reminders` hat `discord_id`, `end_time` und `notified_at` als eigene
Spalten neben dem alten `data`-Block: Der Bot fragt „welche Erinnerung ist
fällig und wem gehört sie" — das muss ohne Umweg über JSON gehen. Das
Häkchen `notified_at` verhindert Doppelzustellung auch nach einem Neustart.

## Prüfen, ob es läuft

1. Auf der Website mit Discord anmelden → in Supabase steht
   `profiles.discord_id` gefüllt?
2. Profil-Einstellungen öffnen → stehen die vier Schalter da, lässt sich die
   Vorlaufzeit umstellen, taucht sie in `notification_settings` auf?
3. Erinnerung auf eine Auktion setzen, die in etwa zwölf Minuten endet, dann
   den Tab schließen → kommt nach rund zwei Minuten die DM?
4. Eine eigene Auktion verkaufen lassen → kommt die Verkaufs-DM mit dem
   richtigen Preis? (Der Bot schaut alle fünf Minuten nach.)
5. Beide Knöpfe in der DM antippen — der zweite muss die
   Benachrichtigungs-Verwaltung öffnen.

## Wenn keine DM ankommt

- **Discord-DMs blockiert?** Wer in den Discord-Einstellungen unter
  *Privatsphäre* keine Nachrichten von Servermitgliedern zulässt, kann vom
  Bot nicht erreicht werden. Der Bot merkt sich das nach drei Fehlversuchen
  in Folge und hört bei dieser Person auf — sonst läuft er bei jedem
  Durchgang in denselben Fehler.
- **Nicht verifiziert?** Ohne Eintrag in `discord_verifications` weiß der Bot
  nicht, welche Auktionen jemandem gehören. Im Einstellungsfenster steht
  dann ein Hinweis darüber.
- **Nicht auf der Website angemeldet?** Ohne `profiles.discord_id` gibt es
  keine Verbindung zwischen Konto und Discord.
