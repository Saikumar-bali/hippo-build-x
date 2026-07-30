import { createControlPlaneSql, createTenantSql } from '@hippo/db';
import {
  signAccessToken,
  verifyPassword,
  hashPassword,
  hashToken,
  generateToken,
  REFRESH_TTL_MS,
} from '@/lib/auth';
import { AppError, ErrorCode } from '@hippo/shared';

export function flattenPermissions(roles) {
  const set = new Set();
  for (const role of roles) {
    const permissions = Array.isArray(role.permissions)
      ? role.permissions
      : typeof role.permissions === 'string'
        ? JSON.parse(role.permissions)
        : [];
    for (const permission of permissions) set.add(permission);
  }
  return [...set];
}

export async function loadUserAuthz(schemaName, userId, tenantId) {
  const sql = createTenantSql(schemaName, tenantId);
  const users = await sql.unsafe(
    `SELECT id, email, name, status, password_hash FROM users
     WHERE id = $1 AND deleted_at IS NULL LIMIT 1`,
    [userId],
  );
  if (!users[0]) return null;
  const user = users[0];
  if (user.status !== 'active') {
    throw new AppError(ErrorCode.FORBIDDEN, 'Account is not active', 403);
  }

  const roleRows = await sql.unsafe(
    `SELECT r.id, r.name, r.permissions, ur.project_id, ur.location_id
     FROM user_roles ur
     JOIN roles r ON r.id = ur.role_id AND r.deleted_at IS NULL
     WHERE ur.user_id = $1 AND ur.deleted_at IS NULL`,
    [userId],
  );

  return {
    user: { id: user.id, email: user.email, name: user.name, status: user.status },
    roles: roleRows.map((row) => row.name),
    permissions: flattenPermissions(roleRows),
    projectIds: [...new Set(roleRows.map((row) => row.project_id).filter(Boolean))],
    locationIds: [...new Set(roleRows.map((row) => row.location_id).filter(Boolean))],
    passwordHash: user.password_hash,
  };
}

export async function issueSession(authz, meta = {}) {
  const rawRefresh = generateToken();
  const refreshHash = hashToken(rawRefresh);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);
  const sql = createTenantSql(authz.schemaName, authz.tenantId);

  const [session] = await sql.unsafe(
    `INSERT INTO sessions
      (tenant_id, user_id, refresh_token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [
      authz.tenantId,
      authz.userId,
      refreshHash,
      expiresAt.toISOString(),
      meta.userAgent || null,
      meta.ip || null,
    ],
  );

  const accessToken = await signAccessToken({
    sub: authz.userId,
    tenantId: authz.tenantId,
    sid: session.id,
    scope: 'tenant',
  });

  return {
    accessToken,
    refreshToken: formatRefreshToken(authz.tenantId, rawRefresh),
    sessionId: session.id,
    expiresAt,
  };
}

export async function loginWithPassword({ slug, email, password, userAgent, ip }) {
  const cp = createControlPlaneSql();
  const tenants = await cp`
    SELECT id, schema_name, slug, status, isolation_mode
    FROM tenants
    WHERE slug = ${slug} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!tenants[0] || tenants[0].status !== 'active') {
    throw AppError.unauthorized('Invalid credentials');
  }
  const tenant = tenants[0];
  const sql = createTenantSql(tenant.schema_name, tenant.id);
  const users = await sql.unsafe(
    `SELECT id, email, name, status, password_hash FROM users
     WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  if (!users[0] || users[0].status !== 'active') {
    throw AppError.unauthorized('Invalid credentials');
  }

  const user = users[0];
  if (!(await verifyPassword(user.password_hash, password))) {
    throw AppError.unauthorized('Invalid credentials');
  }

  const authz = await loadUserAuthz(tenant.schema_name, user.id, tenant.id);
  const tokens = await issueSession(
    {
      tenantId: tenant.id,
      schemaName: tenant.schema_name,
      slug: tenant.slug,
      userId: user.id,
      email: user.email,
    },
    { userAgent, ip },
  );

  return {
    user: authz.user,
    roles: authz.roles,
    permissions: authz.permissions,
    projectIds: authz.projectIds,
    locationIds: authz.locationIds,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      isolationMode: tenant.isolation_mode,
    },
    ...tokens,
  };
}

function parseRefreshToken(value) {
  const parts = String(value).split('.');
  if (parts.length < 2 || !/^[0-9a-f-]{36}$/i.test(parts[0])) {
    throw AppError.unauthorized('Invalid refresh token');
  }
  return {
    tenantId: parts[0],
    tokenBody: parts.length === 2 ? parts[1] : parts.slice(2).join('.'),
  };
}

export async function rotateRefreshToken(rawRefresh, meta = {}) {
  const { tenantId, tokenBody } = parseRefreshToken(rawRefresh);
  const cp = createControlPlaneSql();
  const tenants = await cp`
    SELECT id, slug, schema_name, status, isolation_mode
    FROM tenants WHERE id = ${tenantId} AND deleted_at IS NULL LIMIT 1
  `;
  const tenant = tenants[0];
  if (!tenant || tenant.status !== 'active') {
    throw AppError.unauthorized('Invalid refresh token');
  }

  const sql = createTenantSql(tenant.schema_name, tenant.id);
  const sessions = await sql.unsafe(
    `SELECT * FROM sessions
     WHERE refresh_token_hash = $1 AND deleted_at IS NULL LIMIT 1`,
    [hashToken(tokenBody)],
  );
  if (!sessions[0]) throw AppError.unauthorized('Invalid refresh token');
  const session = sessions[0];
  if (session.revoked_at) throw AppError.unauthorized('Refresh token reuse detected');
  if (new Date(session.expires_at) < new Date()) {
    throw AppError.unauthorized('Refresh token expired');
  }

  await sql.unsafe(`UPDATE sessions SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1`, [
    session.id,
  ]);

  const authz = await loadUserAuthz(tenant.schema_name, session.user_id, tenant.id);
  const issued = await issueSession(
    {
      tenantId: tenant.id,
      schemaName: tenant.schema_name,
      slug: tenant.slug,
      userId: authz.user.id,
      email: authz.user.email,
    },
    meta,
  );

  return {
    ...issued,
    user: authz.user,
    roles: authz.roles,
    permissions: authz.permissions,
    projectIds: authz.projectIds,
    locationIds: authz.locationIds,
    tenant: {
      id: tenant.id,
      slug: tenant.slug,
      isolationMode: tenant.isolation_mode,
    },
  };
}

export async function createPasswordResetToken(schemaName, tenantId, email) {
  const sql = createTenantSql(schemaName, tenantId);
  const users = await sql.unsafe(
    `SELECT id FROM users
     WHERE lower(email) = lower($1) AND status = 'active' AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  if (!users[0]) return null;

  const token = generateToken();
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await sql.unsafe(
    `INSERT INTO password_reset_tokens
      (tenant_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tenantId, users[0].id, hashToken(token), expiresAt.toISOString()],
  );
  return { token, expiresAt };
}

export async function resetPasswordWithToken(schemaName, tenantId, token, password) {
  const sql = createTenantSql(schemaName, tenantId);
  const passwordHash = await hashPassword(password);

  await sql.begin(async (tx) => {
    const rows = await tx.unsafe(
      `SELECT id, user_id, expires_at, used_at
       FROM password_reset_tokens
       WHERE token_hash = $1 AND deleted_at IS NULL
       FOR UPDATE`,
      [hashToken(token)],
    );
    const reset = rows[0];
    if (!reset || reset.used_at || new Date(reset.expires_at) < new Date()) {
      throw AppError.validation('Invalid or expired reset token');
    }

    await tx.unsafe(
      `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
      [passwordHash, reset.user_id],
    );
    await tx.unsafe(
      `UPDATE password_reset_tokens SET used_at = NOW(), updated_at = NOW() WHERE id = $1`,
      [reset.id],
    );
    await tx.unsafe(
      `UPDATE sessions SET revoked_at = NOW(), updated_at = NOW()
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [reset.user_id],
    );
  });
}

export async function revokeSession(schemaName, tenantId, sessionId) {
  const sql = createTenantSql(schemaName, tenantId);
  await sql.unsafe(
    `UPDATE sessions SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [sessionId],
  );
}

export async function revokeAllUserSessions(schemaName, tenantId, userId) {
  const sql = createTenantSql(schemaName, tenantId);
  await sql.unsafe(
    `UPDATE sessions SET revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

export function formatRefreshToken(tenantId, raw) {
  return `${tenantId}.${raw}`;
}
