-- 011 · Rozpis v6 (27. 11. 2026): v prvním bloku 7:50 je Vlašim uvedená jako domácí
-- (Vlašim A – Benešov, Vlašim B – Světlá). Časy, ostatní dvojice i obědy beze změny.
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM period WHERE match_id IN (0, 1)) OR EXISTS (SELECT 1 FROM shootout WHERE match_id IN (0, 1)) THEN
    RAISE EXCEPTION 'Utkání 7:50 už mají zapsaný výsledek – strany nelze prohodit.';
  END IF;
END $$;
UPDATE match m SET home_team = h.id, away_team = a.id
FROM (VALUES (0, 'VLA', 'BEN'), (1, 'VLB', 'SVE')) AS v(id, home, away)
JOIN team h ON h.code = v.home JOIN team a ON a.code = v.away
WHERE m.id = v.id AND m.place IS NULL;
UPDATE tournament SET revision = revision + 1;
