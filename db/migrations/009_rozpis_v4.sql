-- 009 · Rozpis v4 (25. 11. 2026): polední pauza 11:50–12:40, odpoledne o 10 min dřív, finále 16:55–17:30, vyhlášení 17:30–18:00.
-- Obědy: 6 oken po 25–30 min podle času do dalšího zápasu, nejvýše 3 týmy v restauraci. Na prázdné databázi nic nedělá (doplní seed).
UPDATE block SET end_min = 760 WHERE id = 8;                                   -- 11:50–12:40
UPDATE block SET start_min = start_min - 10, end_min = end_min - 10 WHERE id BETWEEN 9 AND 18;
UPDATE block SET start_min = 1050, end_min = 1080 WHERE id = 19;               -- 17:30–18:00

DELETE FROM lunch_window_team;
DELETE FROM lunch_window;
INSERT INTO lunch_window (id, anchor_block_id, offset_min, length_min)
SELECT v.id, v.anchor, v.off, v.len
FROM (VALUES (1, 6, 0, 30),    -- 10:40–11:10 Vlašim A + B
             (2, 7, 15, 25),   -- 11:30–11:55 Boleslav + Kobra
             (3, 7, 15, 30),   -- 11:30–12:00 Litvínov
             (4, 7, 40, 30),   -- 11:55–12:25 Plzeň
             (5, 8, 15, 25),   -- 12:05–12:30 Budějovice + Slavia
             (6, 8, 40, 30))   -- 12:30–13:00 Benešov + Světlá
     AS v(id, anchor, off, len)
WHERE EXISTS (SELECT 1 FROM block WHERE id = v.anchor);
INSERT INTO lunch_window_team (window_id, team_id)
SELECT v.w, t.id
FROM (VALUES (1, 'VLA'), (1, 'VLB'), (2, 'MBL'), (2, 'KOB'), (3, 'LIT'), (4, 'PLZ'), (5, 'CEB'), (5, 'SLA'), (6, 'BEN'), (6, 'SVE')) AS v(w, code)
JOIN team t ON t.code = v.code
WHERE EXISTS (SELECT 1 FROM lunch_window WHERE id = v.w);
UPDATE tournament SET revision = revision + 1;
