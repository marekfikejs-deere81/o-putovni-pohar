-- 004 · Tip pro rodiče: vedle odkazu na mapy i odkaz na webové stránky.
ALTER TABLE parent_tip ADD COLUMN web_url text NOT NULL DEFAULT '';
