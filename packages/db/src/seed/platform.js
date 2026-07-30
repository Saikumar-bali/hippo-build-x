import { createControlPlaneSql } from '../client.js';
import { hashPassword } from '@hippo/shared/crypto';

export const PLATFORM_SUPER_ADMIN = {
  email: 'superadmin@hippo.example',
  name: 'Hippo Super Admin',
  password: 'SuperAdmin@12345',
};

export async function seedPlatformSuperAdmin(admin = PLATFORM_SUPER_ADMIN) {
  const sql = createControlPlaneSql();
  const passwordHash = await hashPassword(admin.password);
  const existing = await sql`
    SELECT id FROM platform_users
    WHERE lower(email) = lower(${admin.email}) AND deleted_at IS NULL
    LIMIT 1
  `;
  if (existing[0]) {
    await sql`
      UPDATE platform_users
      SET name = ${admin.name},
          password_hash = ${passwordHash},
          role = 'super_admin',
          status = 'active',
          updated_at = NOW()
      WHERE id = ${existing[0].id}
    `;
    return { id: existing[0].id, email: admin.email, created: false };
  }
  const [row] = await sql`
    INSERT INTO platform_users (email, name, password_hash, role, status)
    VALUES (${admin.email}, ${admin.name}, ${passwordHash}, 'super_admin', 'active')
    RETURNING id
  `;
  return { id: row.id, email: admin.email, created: true };
}
