-- Granty běhové role app_runtime (Cloudflare Worker). Spouští se při KAŽDÉ migraci,
-- takže se doplní i tehdy, když roli Marek založí v Neon Console až později.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'app_runtime') THEN
    RAISE NOTICE 'Role app_runtime zatím neexistuje – granty přeskočeny.';
    RETURN;
  END IF;
  GRANT USAGE ON SCHEMA public TO app_runtime;
  GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO app_runtime;
  GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO app_runtime;
  -- Správce nelze přidat z aplikace, jen privilegovaným jednorázovým krokem.
  REVOKE INSERT, UPDATE, DELETE ON admin_user FROM app_runtime;
  -- Audit a historie jsou jen pro zápis nových řádků.
  REVOKE UPDATE, DELETE ON audit_log, lunch_order_history FROM app_runtime;
  -- Turnaj ani evidence migrací se z aplikace nemažou.
  REVOKE INSERT, DELETE ON tournament FROM app_runtime;
  REVOKE ALL ON schema_migrations FROM app_runtime;
END $$;
