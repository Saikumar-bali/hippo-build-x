import {
  withApiHandler,
  controlPlaneSql,
  requirePlatformUser,
} from '@/lib/api-utils';
import { createTenantSql } from '@hippo/db';
import { AppError, ErrorCode } from '@hippo/shared';
import {
  getPlatformTenant,
  requireSuperAdmin,
  writePlatformAudit,
} from '@/modules/platform/platform-ops-service.js';

const EXCLUDED_TABLES = new Set([
  '_tenant_migrations',
  'sessions',
  'password_reset_tokens',
]);
const SECRET_COLUMN = /(?:password_hash|refresh_token_hash|token_hash|encrypted|secret|api_key|private_key)$/i;
const EXPORT_PAGE_SIZE = 250;
const configuredMaxBytes = Number(process.env.PLATFORM_EXPORT_MAX_BYTES || 50 * 1024 * 1024);
const MAX_EXPORT_BYTES = Number.isFinite(configuredMaxBytes) && configuredMaxBytes > 0
  ? configuredMaxBytes
  : 50 * 1024 * 1024;

function quoteIdentifier(value) {
  if (!/^[a-z_][a-z0-9_]*$/i.test(value)) throw AppError.validation('Unsafe export identifier');
  return `"${value}"`;
}

function stringify(value) {
  return JSON.stringify(value, (_key, item) => (typeof item === 'bigint' ? item.toString() : item), 2);
}

function assertWithinExportLimit(payload) {
  if (Buffer.byteLength(stringify(payload)) > MAX_EXPORT_BYTES) {
    throw new AppError(
      ErrorCode.INVALID_INPUT,
      'This export is too large for an immediate download. Use the background export runbook.',
      413,
    );
  }
}

async function completeExport({ control, actor, job, tenantId, manifest, rowCount, byteCount }) {
  await control.begin(async (tx) => {
    await tx`
      UPDATE tenant_export_jobs
      SET status = 'completed', table_count = ${manifest.length}, row_count = ${rowCount},
          byte_count = ${byteCount}, completed_at = NOW(),
          expires_at = NOW() + INTERVAL '24 hours',
          manifest = ${JSON.stringify({ tables: manifest })}::jsonb
      WHERE id = ${job.id}
    `;
    await writePlatformAudit({
      actor,
      action: 'tenant.exported',
      entityType: 'tenant_export',
      entityId: job.id,
      tenantId,
      after: { tableCount: manifest.length, rowCount, byteCount },
      sql: tx,
    });
  });
}

async function failExport({ control, actor, job, tenantId, error }) {
  const errorMessage = String(error?.message || error).slice(0, 2000);
  await control.begin(async (tx) => {
    await tx`
      UPDATE tenant_export_jobs
      SET status = 'failed', error_message = ${errorMessage}, completed_at = NOW()
      WHERE id = ${job.id}
    `;
    await writePlatformAudit({
      actor,
      action: 'tenant.export_failed',
      entityType: 'tenant_export',
      entityId: job.id,
      tenantId,
      metadata: { error: errorMessage.slice(0, 500) },
      sql: tx,
    });
  });
}

export const POST = withApiHandler(
  { platform: true, auth: false, platformAuth: true },
  async (_request, context) => {
    const actor = requireSuperAdmin(requirePlatformUser());
    const { id } = await context.params;
    const control = controlPlaneSql();
    const tenant = await getPlatformTenant(id, { sql: control });
    if (!['active', 'suspended'].includes(tenant.status)) {
      throw AppError.conflict('Only ready or suspended companies can be exported');
    }

    const [job] = await control`
      INSERT INTO tenant_export_jobs (tenant_id, status, format, requested_by, started_at)
      VALUES (${id}, 'running', 'json', ${actor.id}, NOW())
      RETURNING id, requested_at
    `;

    try {
      const sql = createTenantSql(tenant.schema_name, tenant.id);
      const snapshot = await sql.snapshot(async (tx) => {
        const tables = await tx.unsafe(
          `SELECT table_name
           FROM information_schema.tables
           WHERE table_schema = $1 AND table_type = 'BASE TABLE'
           ORDER BY table_name`,
          [tenant.schema_name],
        );
        const payload = {
          format: 'hippo-build-tenant-export',
          version: 1,
          exportedAt: new Date().toISOString(),
          exportJobId: job.id,
          tenant: {
            id: tenant.id,
            name: tenant.name,
            slug: tenant.slug,
            migrationVersion: tenant.migration_version,
          },
          tables: {},
        };
        const manifest = [];
        let rowCount = 0;

        for (const table of tables) {
          const tableName = table.table_name;
          if (EXCLUDED_TABLES.has(tableName)) continue;
          const columns = await tx.unsafe(
            `SELECT column_name
             FROM information_schema.columns
             WHERE table_schema = $1 AND table_name = $2
             ORDER BY ordinal_position`,
            [tenant.schema_name, tableName],
          );
          const safeColumns = columns
            .map((column) => column.column_name)
            .filter((column) => !SECRET_COLUMN.test(column));
          if (!safeColumns.length) continue;

          const orderColumns = ['created_at', 'id'].filter((column) => safeColumns.includes(column));
          const orderBy = orderColumns.length
            ? orderColumns.map(quoteIdentifier).join(', ')
            : 'ctid';
          const tableRows = [];
          let offset = 0;

          while (true) {
            const rows = await tx.unsafe(
              `SELECT ${safeColumns.map(quoteIdentifier).join(', ')}
               FROM ${quoteIdentifier(tableName)}
               ORDER BY ${orderBy}
               LIMIT $1 OFFSET $2`,
              [EXPORT_PAGE_SIZE, offset],
            );
            if (!rows.length) break;
            tableRows.push(...rows);
            payload.tables[tableName] = tableRows;
            assertWithinExportLimit(payload);
            rowCount += rows.length;
            offset += rows.length;
            if (rows.length < EXPORT_PAGE_SIZE) break;
          }

          payload.tables[tableName] = tableRows;
          manifest.push({ table: tableName, rows: tableRows.length, columns: safeColumns });
        }
        assertWithinExportLimit(payload);
        return { payload, manifest, rowCount };
      });

      const body = stringify(snapshot.payload);
      const byteCount = Buffer.byteLength(body);
      await completeExport({
        control,
        actor,
        job,
        tenantId: id,
        manifest: snapshot.manifest,
        rowCount: snapshot.rowCount,
        byteCount,
      });

      return new Response(body, {
        status: 200,
        headers: {
          'content-type': 'application/json; charset=utf-8',
          'content-disposition': `attachment; filename="${tenant.slug}-export-${new Date().toISOString().slice(0, 10)}.json"`,
          'cache-control': 'no-store, private',
          'x-export-job-id': job.id,
        },
      });
    } catch (error) {
      await failExport({ control, actor, job, tenantId: id, error });
      throw error;
    }
  },
);