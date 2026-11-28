-- 014 · Obědy v8 (28. 11. 2026): 5 směn, v restauraci nejvýše 2 týmy, směny se střídají.
-- 10:40 Benešov + Světlá · 11:20 Boleslav + Kobra · 11:50 Litvínov + Plzeň · 12:15 Budějovice + Slavia · 12:40 Vlašim A + B.
-- Rozpis zápasů beze změny. Na prázdné databázi nic nedělá (doplní seed).
DELETE FROM lunch_window_team;
DELETE FROM lunch_window;
INSERT INTO lunch_window (id, anchor_block_id, offset_min, length_min)
SELECT v.id, v.anchor, v.off, v.len
FROM (VALUES (1, 6, 0, 30),    -- 10:40–11:10 (blok 10:40)
             (2, 7, 5, 30),    -- 11:20–11:50 (blok 11:15 + 5)
             (3, 8, 0, 25),    -- 11:50–12:15 (polední pauza 11:50)
             (4, 8, 25, 25),   -- 12:15–12:40
             (5, 8, 50, 30))   -- 12:40–13:10
     AS v(id, anchor, off, len)
WHERE EXISTS (SELECT 1 FROM block WHERE id = v.anchor);
INSERT INTO lunch_window_team (window_id, team_id)
SELECT v.w, t.id
FROM (VALUES (1, 'BEN', 1), (1, 'SVE', 2), (2, 'MBL', 3), (2, 'KOB', 4), (3, 'LIT', 5), (3, 'PLZ', 6), (4, 'CEB', 7), (4, 'SLA', 8), (5, 'VLA', 9), (5, 'VLB', 10)) AS v(w, code, n)
JOIN team t ON t.code = v.code
WHERE EXISTS (SELECT 1 FROM lunch_window WHERE id = v.w)
ORDER BY v.n;
UPDATE tournament SET revision = revision + 1;
