-- DEPRECATED for runtime use.
-- Control-plane and tenant schemas are applied by @hippo/db migration runner:
--   pnpm --filter @hippo/db db:migrate:control
--   provisionTenantSchema() / pnpm --filter @hippo/db db:seed
--
-- See packages/db/src/migrations/control and packages/db/src/migrations/tenant.

SELECT 1;
