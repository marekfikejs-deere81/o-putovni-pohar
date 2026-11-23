-- 006 · Neúspěšné pokusy o otevření objednávky (otisk IP adresy, ne adresa) – brzda proti hádání krátkých kódů.
CREATE TABLE order_fail (
  ip_hash text NOT NULL,
  at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX order_fail_ip_at ON order_fail (ip_hash, at);
