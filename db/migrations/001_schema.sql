-- 001 · Základní schéma turnaje O putovní pohár
-- Časy bloků jsou v minutách od půlnoci v časovém pásmu turnaje (Europe/Prague).

CREATE TABLE tournament (
  id              text PRIMARY KEY,
  name            text NOT NULL,
  day             date NOT NULL,
  time_zone       text NOT NULL DEFAULT 'Europe/Prague',
  revision        bigint NOT NULL DEFAULT 0,          -- zvyšuje se s každou publikovanou změnou
  manual_order    jsonb,                              -- {"A":[ids],"B":[ids]} nebo NULL = automatické pořadí
  lunch_price_czk integer NOT NULL CHECK (lunch_price_czk >= 0),
  lunch_deadline  timestamptz NOT NULL,               -- týmové zadávání uzavřeno od tohoto okamžiku
  lunch_menu      text NOT NULL
);

CREATE TABLE team (
  id            integer PRIMARY KEY,                   -- stabilní ID, přežije přejmenování
  code          text NOT NULL UNIQUE CHECK (code ~ '^[A-Z]{2,4}$'),
  name          text NOT NULL,
  line1         text NOT NULL,
  line2         text NOT NULL,
  color         text NOT NULL CHECK (color ~ '^#[0-9a-fA-F]{6}$'),
  web_logo      text NOT NULL,                         -- výchozí cesta v repozitáři
  stadium_logo  text NOT NULL,
  logo_version  integer NOT NULL DEFAULT 0             -- 0 = výchozí PNG z repozitáře
);

CREATE TABLE group_member (
  tournament_id text NOT NULL REFERENCES tournament(id),
  team_id       integer NOT NULL REFERENCES team(id),
  grp           char(1) NOT NULL CHECK (grp IN ('A','B')),
  slot          smallint NOT NULL CHECK (slot BETWEEN 1 AND 6),
  PRIMARY KEY (tournament_id, team_id),
  UNIQUE (tournament_id, grp, slot)
);

CREATE TABLE block (
  id            integer PRIMARY KEY,                   -- stálé ID bloku (obědy se na něj váží)
  tournament_id text NOT NULL REFERENCES tournament(id),
  start_min     smallint NOT NULL CHECK (start_min BETWEEN 0 AND 1439),
  end_min       smallint NOT NULL CHECK (end_min BETWEEN 1 AND 1440),
  title         text NOT NULL,
  CHECK (end_min > start_min)
);

CREATE TABLE match (
  id          integer PRIMARY KEY,
  block_id    integer NOT NULL REFERENCES block(id),
  rink        char(1) NOT NULL CHECK (rink IN ('A','B')),
  place       smallint CHECK (place IN (1,3,5,7,9,11)),  -- NULL = skupinové utkání
  home_team   integer REFERENCES team(id),
  away_team   integer REFERENCES team(id),
  home_seed   text CHECK (home_seed ~ '^[1-6][AB]$'),    -- zdrojová příčka u utkání o umístění
  away_seed   text CHECK (away_seed ~ '^[1-6][AB]$'),
  UNIQUE (block_id, rink),
  CHECK (
    (place IS NULL AND home_team IS NOT NULL AND away_team IS NOT NULL AND home_team <> away_team AND home_seed IS NULL AND away_seed IS NULL)
    OR
    (place IS NOT NULL AND home_seed IS NOT NULL AND away_seed IS NOT NULL AND home_team IS NULL AND away_team IS NULL)
  )
);

-- Potvrzená třetina. Žádný řádek = třetina nezadaná (není to 0:0).
CREATE TABLE period (
  match_id     integer NOT NULL REFERENCES match(id),
  no           smallint NOT NULL CHECK (no IN (1,2)),
  home_goals   smallint NOT NULL CHECK (home_goals BETWEEN 0 AND 99),
  away_goals   smallint NOT NULL CHECK (away_goals BETWEEN 0 AND 99),
  confirmed_by text NOT NULL,
  confirmed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (match_id, no)
);

-- Rozhodující nájezdy po utkání o umístění (uchovávají se zvlášť).
CREATE TABLE shootout (
  match_id   integer PRIMARY KEY REFERENCES match(id),
  winner     text NOT NULL CHECK (winner IN ('home','away')),
  note       text,
  decided_by text NOT NULL,
  decided_at timestamptz NOT NULL DEFAULT now()
);

-- Los pořadatele pro nevyřešenou shodu.
CREATE TABLE lot (
  tournament_id text NOT NULL REFERENCES tournament(id),
  grp           char(1) NOT NULL CHECK (grp IN ('A','B')),
  team_id       integer NOT NULL REFERENCES team(id),
  position      smallint NOT NULL CHECK (position >= 1),
  decided_by    text NOT NULL,
  decided_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (tournament_id, grp, team_id)
);

CREATE TABLE audit_log (
  id      bigserial PRIMARY KEY,
  at      timestamptz NOT NULL DEFAULT now(),
  actor   text NOT NULL,
  action  text NOT NULL,
  before  jsonb,
  after   jsonb
);

-- Správci: stabilní ID identity z Neon Auth. Plní se jen privilegovaným jednorázovým krokem.
CREATE TABLE admin_user (
  auth_user_id text PRIMARY KEY,
  email        text NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

-- Obědová okna: vazba na stálý blok + posun v minutách.
CREATE TABLE lunch_window (
  id              integer PRIMARY KEY,
  anchor_block_id integer NOT NULL REFERENCES block(id),
  offset_min      smallint NOT NULL,
  length_min      smallint NOT NULL CHECK (length_min > 0),
  frozen_start    smallint                              -- vyplní se při zahájení; zahájené obědy se neposouvají
);

CREATE TABLE lunch_window_team (
  window_id integer NOT NULL REFERENCES lunch_window(id),
  team_id   integer NOT NULL UNIQUE REFERENCES team(id),
  PRIMARY KEY (window_id, team_id)
);

-- Objednatel: 9 klíčů (Vlašim A+B společně, ostatní po jednom týmu).
CREATE TABLE order_key (
  key   text PRIMARY KEY CHECK (key ~ '^[A-Z]{2,4}$'),
  label text NOT NULL
);

CREATE TABLE order_key_team (
  key     text NOT NULL REFERENCES order_key(key),
  team_id integer NOT NULL UNIQUE REFERENCES team(id),
  PRIMARY KEY (key, team_id)
);

-- Objednávka. Neexistující řádek = neobjednáno (liší se od výslovné nuly).
CREATE TABLE lunch_order (
  key        text PRIMARY KEY REFERENCES order_key(key),
  players    integer NOT NULL CHECK (players BETWEEN 0 AND 99),
  staff      integer NOT NULL CHECK (staff BETWEEN 0 AND 99),
  note       varchar(100) NOT NULL DEFAULT '',
  email      text NOT NULL CHECK (email ~ '^[^@\s]+@[^@\s]+\.[^@\s]+$'),
  version    integer NOT NULL DEFAULT 1,                -- ochrana souběžné editace
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by text NOT NULL                              -- 'team:<key>' nebo 'admin:<id>'
);

CREATE TABLE lunch_order_history (
  id         bigserial PRIMARY KEY,
  key        text NOT NULL REFERENCES order_key(key),
  version    integer NOT NULL,
  players    integer NOT NULL,
  staff      integer NOT NULL,
  note       varchar(100) NOT NULL,
  email      text NOT NULL,
  changed_by text NOT NULL,
  changed_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (key, version)
);

-- Odvolatelné týmové oprávnění k jedné objednávce (jednorázová pozvánka).
CREATE TABLE team_access (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key         text NOT NULL REFERENCES order_key(key),
  token_hash  bytea NOT NULL UNIQUE,                    -- SHA-256 tokenu, token samotný se neukládá
  email       text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  used_at     timestamptz,
  revoked_at  timestamptz
);

-- Idempotence požadavků (dvojklik, opakování sítě).
CREATE TABLE request_key (
  key        text PRIMARY KEY,
  response   jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Transakční fronta pošty.
CREATE TABLE mail_outbox (
  id               bigserial PRIMARY KEY,
  kind             text NOT NULL CHECK (kind IN ('order_confirmation','lunch_summary','test')),
  dedupe_key       text NOT NULL UNIQUE,                -- např. order:BEN:v3, summary:2026-12-13
  to_addr          text NOT NULL,
  cc_addr          text,
  subject          text NOT NULL,
  body_text        text NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                   CHECK (status IN ('pending','sending','sent','failed','unknown')),
  attempts         integer NOT NULL DEFAULT 0,
  next_attempt_at  timestamptz NOT NULL DEFAULT now(),
  last_error       text,
  gmail_message_id text,
  created_at       timestamptz NOT NULL DEFAULT now(),
  sent_at          timestamptz
);
CREATE INDEX mail_outbox_due ON mail_outbox (next_attempt_at) WHERE status = 'pending';

-- Stav OAuth odděleně od výsledků. Obnovovací token jen šifrovaně.
CREATE TABLE oauth_account (
  provider          text PRIMARY KEY CHECK (provider = 'google'),
  account_email     text NOT NULL,
  refresh_token_enc bytea NOT NULL,
  scope             text NOT NULL,
  updated_at        timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE oauth_state (
  state      text PRIMARY KEY,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Nahraná loga: verzované bitmapy, nejvýše 512 KiB na variantu.
CREATE TABLE logo_upload (
  team_id    integer NOT NULL REFERENCES team(id),
  version    integer NOT NULL CHECK (version >= 1),
  variant    text NOT NULL CHECK (variant IN ('web','stadium')),
  mime       text NOT NULL CHECK (mime IN ('image/png','image/webp')),
  width      integer NOT NULL CHECK (width BETWEEN 16 AND 2048),
  height     integer NOT NULL CHECK (height BETWEEN 16 AND 2048),
  bytes      bytea NOT NULL CHECK (octet_length(bytes) <= 524288),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (team_id, version, variant)
);

-- Tipy pro rodiče (restaurace, adresy) – patička.
CREATE TABLE parent_tip (
  id      serial PRIMARY KEY,
  title   text NOT NULL,
  body    text NOT NULL DEFAULT '',
  address text NOT NULL DEFAULT '',
  url     text NOT NULL DEFAULT '',
  sort    integer NOT NULL DEFAULT 0
);

-- Publikovaná veřejná projekce: jedna revize pro mobil i stadion.
CREATE TABLE published_snapshot (
  revision   bigint PRIMARY KEY,
  etag       text NOT NULL,
  body       jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Veřejný PDF zápis (verze podle revize výsledků).
CREATE TABLE report_pdf (
  revision   bigint PRIMARY KEY,
  bytes      bytea NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
