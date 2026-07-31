import { createTenantSql } from '@hippo/db';
import { AppError } from '@hippo/shared';

export async function assertAccessSessionActive(schemaName, tenantId, sessionId, userId) {
  if (!sessionId) throw AppError.unauthorized('Access session is missing');
  const sql = createTenantSql(schemaName, tenantId);
  const rows = await sql.unsafe(
    `SELECT id
     FROM sessions
     WHERE id = $1
       AND user_id = $2
       AND revoked_at IS NULL
       AND expires_at > NOW()
       AND deleted_at IS NULL
     LIMIT 1`,
    [sessionId, userId],
  );
  if (!rows[0]) throw AppError.unauthorized('Session has expired or was revoked');
  return true;
}
