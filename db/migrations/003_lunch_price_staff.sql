-- 003 · Cena obědu pro člena realizačního týmu 150 Kč (rozhodnutí 23. 11. 2026, dříve 170 Kč).
-- Další změny cen a menu dělá pořadatel v Adminu (záložka Obědy).
UPDATE tournament SET lunch_price_staff_czk = 150 WHERE lunch_price_staff_czk = 170;
