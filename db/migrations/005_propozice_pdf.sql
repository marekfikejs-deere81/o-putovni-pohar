-- 005 · PDF propozic nahrané pořadatelem v Adminu (jeden soubor, nová verze přepíše starou).
CREATE TABLE propozice_pdf (
  id          smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  filename    text NOT NULL,
  bytes       bytea NOT NULL CHECK (octet_length(bytes) BETWEEN 5 AND 8388608),
  version     integer NOT NULL DEFAULT 1,
  uploaded_at timestamptz NOT NULL DEFAULT now(),
  uploaded_by text NOT NULL
);
