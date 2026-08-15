-- ═══════════════════════════════════════════════════════════════════════
-- DarkNova · Discord-Anmeldung und Discord-Benachrichtigungen
-- ═══════════════════════════════════════════════════════════════════════
--
-- Einmal im Supabase-SQL-Editor ausführen (Dashboard → SQL Editor → New query).
-- Die Datei ist so geschrieben, dass ein zweiter Lauf nichts kaputt macht:
-- Alles prüft vorher, ob es schon da ist. Du kannst sie also gefahrlos
-- erneut ausführen, wenn du zwischendurch etwas anpasst.
--
-- Danach noch im Dashboard, das geht nicht per SQL:
--   Authentication → Sign In / Providers → Discord einschalten
--   Client-ID und Secret aus dem Discord Developer Portal eintragen
--   Die dort angezeigte Callback-URL im Developer Portal unter
--   OAuth2 → Redirects hinterlegen
-- ═══════════════════════════════════════════════════════════════════════


-- ── 1. profiles: Wer ist das im Discord? ───────────────────────────────
--
-- Der Bot kennt nur Discord-IDs, Supabase nur seine eigenen Konto-IDs.
-- Diese Spalte ist das Bindeglied zwischen beiden Welten.

alter table public.profiles
  add column if not exists discord_id   text,
  add column if not exists discord_name text;

-- Eine Discord-ID gehört zu genau einem Konto. Mehrere leere Felder sind
-- erlaubt - Postgres zählt NULL nicht als Dopplung.
create unique index if not exists profiles_discord_id_idx
  on public.profiles (discord_id)
  where discord_id is not null;


-- ── 2. discord_verifications: die Minecraft-Verknüpfung ────────────────
--
-- Geschrieben wird ausschließlich vom Bot, gelesen von der Website. Damit
-- gibt es die Verifizierung nur noch einmal: Wer sich im Discord über das
-- Auktionshaus verifiziert hat, gilt auch auf der Website als verifiziert.
--
-- Schlüssel ist die Discord-ID, nicht die Konto-ID: So kann der Bot
-- schreiben, bevor sich jemand überhaupt das erste Mal auf der Website
-- angemeldet hat.

create table if not exists public.discord_verifications (
  discord_id  text primary key,
  mc_name     text not null,
  mc_uuid     text,
  plattform   text not null default 'java',
  verified_at timestamptz not null default now()
);

alter table public.discord_verifications enable row level security;

-- Jeder darf seine eigene Verknüpfung sehen. Schreiben darf nur der Bot,
-- und der arbeitet mit dem Service-Role-Key ohnehin an RLS vorbei.
drop policy if exists "eigene verknuepfung lesen" on public.discord_verifications;
create policy "eigene verknuepfung lesen"
  on public.discord_verifications for select
  using (
    discord_id = (select p.discord_id from public.profiles p where p.id = auth.uid())
  );


-- ── 3. notification_settings: was jemand bekommen will ─────────────────
--
-- Ebenfalls über die Discord-ID, damit der Bot ohne Umweg nachsehen kann,
-- bevor er eine Nachricht schickt.

create table if not exists public.notification_settings (
  discord_id            text primary key,
  sold_dm               boolean not null default true,
  reminder_dm           boolean not null default true,
  reminder_lead_minutes integer not null default 10,
  browser_popup         boolean not null default true,
  updated_at            timestamptz not null default now()
);

-- Unsinnige Vorlaufzeiten gar nicht erst zulassen: unter einer Minute ist
-- sinnlos, über einen Tag hat mit "Erinnerung" nichts mehr zu tun.
alter table public.notification_settings
  drop constraint if exists notification_settings_lead_check;
alter table public.notification_settings
  add constraint notification_settings_lead_check
  check (reminder_lead_minutes between 1 and 1440);

alter table public.notification_settings enable row level security;

drop policy if exists "eigene einstellungen lesen" on public.notification_settings;
create policy "eigene einstellungen lesen"
  on public.notification_settings for select
  using (
    discord_id = (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "eigene einstellungen anlegen" on public.notification_settings;
create policy "eigene einstellungen anlegen"
  on public.notification_settings for insert
  with check (
    discord_id = (select p.discord_id from public.profiles p where p.id = auth.uid())
  );

drop policy if exists "eigene einstellungen aendern" on public.notification_settings;
create policy "eigene einstellungen aendern"
  on public.notification_settings for update
  using (
    discord_id = (select p.discord_id from public.profiles p where p.id = auth.uid())
  );


-- ── 4. reminders: für den Bot abfragbar machen ─────────────────────────
--
-- Bisher stand alles im jsonb-Feld "data". Der Bot muss aber gezielt fragen
-- können: "welche Erinnerungen sind fällig und noch nicht verschickt?" -
-- und das geht nur mit echten Spalten.

alter table public.reminders
  add column if not exists discord_id  text,
  add column if not exists end_time    timestamptz,
  add column if not exists notified_at timestamptz;

-- Endzeit aus den vorhandenen Zeilen nachtragen, damit alte Erinnerungen
-- nicht verlorengehen. Steht dort Unsinn, bleibt das Feld leer.
update public.reminders
   set end_time = (data->>'endTime')::timestamptz
 where end_time is null
   and data ? 'endTime'
   and (data->>'endTime') ~ '^\d{4}-\d{2}-\d{2}';

-- Genau die Abfrage des Bots: offene Erinnerungen, nach Endzeit sortiert.
create index if not exists reminders_faellig_idx
  on public.reminders (end_time)
  where notified_at is null;


-- ── 5. Kontrolle ───────────────────────────────────────────────────────
-- Nach dem Ausführen sollte hier alles auf "da" stehen.

select
  (select count(*) from information_schema.columns
    where table_name = 'profiles' and column_name = 'discord_id')            as profiles_discord_id,
  (select count(*) from information_schema.tables
    where table_name = 'discord_verifications')                              as tabelle_verknuepfungen,
  (select count(*) from information_schema.tables
    where table_name = 'notification_settings')                              as tabelle_einstellungen,
  (select count(*) from information_schema.columns
    where table_name = 'reminders' and column_name = 'notified_at')          as reminders_notified_at,
  (select count(*) from public.reminders where end_time is not null)         as erinnerungen_mit_endzeit;
