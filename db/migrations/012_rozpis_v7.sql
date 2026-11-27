-- 012 · Rozpis v7 (27. 11. 2026): Vlašim zpět na pozici A1/B1 (Benešov A2, Světlá B2).
-- Dvojice, časy i obědy beze změny. Pořadí ve skupině ovlivňuje jen označení A1–A5 / B1–B5.
UPDATE group_member gm SET slot = 6 FROM team t WHERE gm.team_id = t.id AND t.code = 'VLA';
UPDATE group_member gm SET slot = 2 FROM team t WHERE gm.team_id = t.id AND t.code = 'BEN';
UPDATE group_member gm SET slot = 1 FROM team t WHERE gm.team_id = t.id AND t.code = 'VLA';
UPDATE group_member gm SET slot = 6 FROM team t WHERE gm.team_id = t.id AND t.code = 'VLB';
UPDATE group_member gm SET slot = 2 FROM team t WHERE gm.team_id = t.id AND t.code = 'SVE';
UPDATE group_member gm SET slot = 1 FROM team t WHERE gm.team_id = t.id AND t.code = 'VLB';
UPDATE tournament SET revision = revision + 1;
