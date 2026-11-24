-- 008 · Rozpis v3 (24. 11. 2026 večer): začátek 7:50, polední pauza 11:50–12:50, odpoledne beze změny.
-- Obědy: 10:45 Vlašim A+B · 11:30 Boleslav, Kobra, Litvínov · 12:05 Budějovice, Slavia, Plzeň · 12:35 Benešov, Světlá.
UPDATE block SET start_min = start_min - 10, end_min = end_min - 10 WHERE id BETWEEN 0 AND 7;
UPDATE block SET start_min = 710 WHERE id = 8;                                 -- 11:50–12:50
UPDATE lunch_window SET offset_min = 5, frozen_start = NULL WHERE id = 1;     -- blok 6 (10:40) + 5 = 10:45
UPDATE lunch_window SET offset_min = 15, frozen_start = NULL WHERE id = 2;    -- blok 7 (11:15) + 15 = 11:30
UPDATE lunch_window SET offset_min = 15, frozen_start = NULL WHERE id = 3;    -- blok 8 (11:50) + 15 = 12:05
UPDATE lunch_window SET offset_min = 45, frozen_start = NULL WHERE id = 4;    -- blok 8 (11:50) + 45 = 12:35
UPDATE tournament SET revision = revision + 1;
