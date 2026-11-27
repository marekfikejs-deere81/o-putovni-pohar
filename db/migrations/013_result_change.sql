-- 013 · Historie změn už zapsaných výsledků (protesty). Jen pro Admin, veřejnost vidí jen platný výsledek.
CREATE TABLE result_change (
  id        bigserial PRIMARY KEY,
  match_id  integer NOT NULL REFERENCES match(id),
  at        timestamptz NOT NULL DEFAULT now(),
  actor     text NOT NULL,
  before    jsonb NOT NULL,   -- {"periods": [[h,a],…], "shootout": "home"|"away"|null}
  after     jsonb NOT NULL
);
CREATE INDEX result_change_match ON result_change (match_id, at);
