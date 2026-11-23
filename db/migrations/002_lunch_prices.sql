-- 002 · Rozdílná cena obědu: hráč 140 Kč, člen realizačního týmu 170 Kč (rozhodnutí 23. 11. 2026).
ALTER TABLE tournament ADD COLUMN lunch_price_player_czk integer;
ALTER TABLE tournament ADD COLUMN lunch_price_staff_czk integer;
UPDATE tournament SET lunch_price_player_czk = 140, lunch_price_staff_czk = 170;
ALTER TABLE tournament ALTER COLUMN lunch_price_player_czk SET NOT NULL;
ALTER TABLE tournament ALTER COLUMN lunch_price_staff_czk SET NOT NULL;
ALTER TABLE tournament ADD CONSTRAINT lunch_prices_nonneg CHECK (lunch_price_player_czk >= 0 AND lunch_price_staff_czk >= 0);
ALTER TABLE tournament DROP COLUMN lunch_price_czk;
