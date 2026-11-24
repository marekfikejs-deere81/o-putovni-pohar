-- 007 · Rozpis v2 (24. 11. 2026): polední pauza 12:00–12:50, odpoledne o 30 min později, vyhlášení 17:40–18:00.
-- Obědy: 4 okna po 30 minutách, nejvýše 3 týmy v restauraci. Na prázdné databázi nic nedělá (doplní seed).
UPDATE block SET end_min = 770 WHERE id = 8;                                   -- 12:00–12:50
UPDATE block SET start_min = start_min + 30, end_min = end_min + 30 WHERE id BETWEEN 9 AND 18;
UPDATE block SET start_min = 1060, end_min = 1080 WHERE id = 19;               -- 17:40–18:00

DELETE FROM lunch_window_team;
DELETE FROM lunch_window;
INSERT INTO lunch_window (id, anchor_block_id, offset_min, length_min)
SELECT v.id, v.anchor, v.off, 30
FROM (VALUES (1, 6, 0), (2, 7, 15), (3, 8, 15), (4, 8, 45)) AS v(id, anchor, off)
WHERE EXISTS (SELECT 1 FROM block WHERE id = v.anchor);
INSERT INTO lunch_window_team (window_id, team_id)
SELECT v.w, t.id
FROM (VALUES (1, 'VLA'), (1, 'VLB'), (2, 'MBL'), (2, 'KOB'), (2, 'LIT'), (3, 'CEB'), (3, 'SLA'), (3, 'PLZ'), (4, 'BEN'), (4, 'SVE')) AS v(w, code)
JOIN team t ON t.code = v.code
WHERE EXISTS (SELECT 1 FROM lunch_window WHERE id = v.w);
UPDATE tournament SET revision = revision + 1;
