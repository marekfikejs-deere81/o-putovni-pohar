-- 010 · Rozpis v5 (25. 11. 2026): Vlašim na pozici A2/B2 (Benešov A1, Světlá B1) a nové dvojice ve skupinách.
-- Časy bloků beze změny (v4). Obědy: 4 směny – 10:40 Benešov + Světlá · 11:30 Boleslav, Kobra, Litvínov ·
-- 12:05 Budějovice, Slavia, Plzeň · 12:35 Vlašim A + B. Na prázdné databázi nic nedělá (doplní seed).
-- Bezpečnostní pojistka: migrace se zastaví, pokud už je zapsaný jakýkoli výsledek.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM period) OR EXISTS (SELECT 1 FROM shootout) THEN
    RAISE EXCEPTION 'Rozpis nelze přeskládat – už jsou zapsané výsledky.';
  END IF;
END $$;

-- pořadí v tabulkách: Vlašim A2/B2 (přes volné místo 6 kvůli jedinečnosti)
UPDATE group_member gm SET slot = 6 FROM team t WHERE gm.team_id = t.id AND t.code IN ('VLA');
UPDATE group_member gm SET slot = 1 FROM team t WHERE gm.team_id = t.id AND t.code IN ('BEN');
UPDATE group_member gm SET slot = 2 FROM team t WHERE gm.team_id = t.id AND t.code IN ('VLA');
UPDATE group_member gm SET slot = 6 FROM team t WHERE gm.team_id = t.id AND t.code IN ('VLB');
UPDATE group_member gm SET slot = 1 FROM team t WHERE gm.team_id = t.id AND t.code IN ('SVE');
UPDATE group_member gm SET slot = 2 FROM team t WHERE gm.team_id = t.id AND t.code IN ('VLB');

-- nové dvojice skupinových utkání (id utkání a bloky zůstávají)
UPDATE match m SET home_team = h.id, away_team = a.id
FROM (VALUES
  (0, 'BEN', 'VLA'),
  (1, 'SVE', 'VLB'),
  (2, 'CEB', 'MBL'),
  (3, 'SLA', 'KOB'),
  (4, 'VLA', 'LIT'),
  (5, 'VLB', 'PLZ'),
  (6, 'BEN', 'CEB'),
  (7, 'SVE', 'SLA'),
  (8, 'MBL', 'LIT'),
  (9, 'KOB', 'PLZ'),
  (10, 'VLA', 'CEB'),
  (11, 'VLB', 'SLA'),
  (12, 'BEN', 'MBL'),
  (13, 'SVE', 'KOB'),
  (14, 'CEB', 'LIT'),
  (15, 'SLA', 'PLZ'),
  (16, 'VLA', 'MBL'),
  (17, 'VLB', 'KOB'),
  (18, 'BEN', 'LIT'),
  (19, 'SVE', 'PLZ')) AS v(id, home, away)
JOIN team h ON h.code = v.home JOIN team a ON a.code = v.away
WHERE m.id = v.id AND m.place IS NULL;

DELETE FROM lunch_window_team;
DELETE FROM lunch_window;
INSERT INTO lunch_window (id, anchor_block_id, offset_min, length_min)
SELECT v.id, v.anchor, v.off, v.len
FROM (VALUES (1, 6, 0, 30),    -- 10:40–11:10 Benešov + Světlá
             (2, 7, 15, 25),   -- 11:30–11:55 Boleslav + Kobra + Litvínov
             (3, 8, 15, 25),   -- 12:05–12:30 Budějovice + Slavia + Plzeň
             (4, 8, 45, 30))   -- 12:35–13:05 Vlašim A + B
     AS v(id, anchor, off, len)
WHERE EXISTS (SELECT 1 FROM block WHERE id = v.anchor);
INSERT INTO lunch_window_team (window_id, team_id)
SELECT v.w, t.id
FROM (VALUES (1, 'BEN', 1), (1, 'SVE', 2), (2, 'MBL', 3), (2, 'KOB', 4), (2, 'LIT', 5), (3, 'CEB', 6), (3, 'SLA', 7), (3, 'PLZ', 8), (4, 'VLA', 9), (4, 'VLB', 10)) AS v(w, code, n)
JOIN team t ON t.code = v.code
WHERE EXISTS (SELECT 1 FROM lunch_window WHERE id = v.w)
ORDER BY v.n;                                                                  -- pořadí týmů v okně = pořadí v rozpisu
UPDATE tournament SET revision = revision + 1;
