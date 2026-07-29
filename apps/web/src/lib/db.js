/**
 * @deprecated Prefer controlPlaneSql / tenantSql from api-utils + @hippo/db.
 * Kept as thin wrappers for any remaining call sites.
 */
export { getSql as getPool } from '@hippo/db';

import { getSql } from '@hippo/db';

export async function query(text, params = []) {
  const sql = getSql();
  return sql.unsafe(text, params);
}

export async function queryOne(text, params = []) {
  const rows = await query(text, params);
  return rows[0] || null;
}

export async function transaction(fn) {
  const sql = getSql();
  return sql.begin(async (tx) => {
    const client = {
      query: async (text, params = []) => {
        const rows = await tx.unsafe(text, params);
        return { rows };
      },
    };
    return fn(client);
  });
}
