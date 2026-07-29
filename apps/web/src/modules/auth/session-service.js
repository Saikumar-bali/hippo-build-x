import { createTenantSql, getSql } from '@hippo/db';
import {
  signAccessToken,
  verifyPassword,
  hashPassword,
  hashToken,
  generateToken,
  REFRESH_TTL_MS,
} from '@/lib/auth';
import { AppError, ErrorCode } from '@hippo/shared';

/**
 * Expand role permissions; `*` means all known permissions via caller.
 * @param {Array<{ name: string, permissions: unknown }>} roles
 */
export function flattenPermissions(roles) {
  const set = new Set();
  for (const role of roles) {
    const perms = Array.isArray(role.permissions)
      ? role.permissions
      : typeof role.permissions === 'string'
        ? JSON.parse(role.permissions)
        : [];
    for (const p of perms) set.add(p);
  }
  return [...set];
}

/**
 * @param {string} schemaName
 * @param {string} userId
 */
export async function loadUserAuthz(schemaName, userId) {
  const sql = createTenantSql(schemaName);
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

  const roles = roleRows.map((r) => r.name);
  const permissions = flattenPermissions(roleRows);
  const projectIds = [...new Set(roleRows.map((r) => r.project_id).filter(Boolean))];
  const locationIds = [...new Set(roleRows.map((r) => r.location_id).filter(Boolean))];

  return {
    user: { id: user.id, email: user.email, name: user.name, status: user.status },
    roles,
    permissions,
    projectIds,
    locationIds,
    passwordHash: user.password_hash,
  };
}

/**
 * @param {{ tenantId: string, schemaName: string, slug: string, userId: string, email: string, roles: string[], permissions: string[], projectIds: string[], locationIds: string[] }} authz
 * @param {{ userAgent?: string, ip?: string }} meta
 */
export async function issueSession(authz, meta = {}) {
  const rawRefresh = generateToken();
  const refreshHash = hashToken(rawRefresh);
  const expiresAt = new Date(Date.now() + REFRESH_TTL_MS);

  const sql = createTenantSql(authz.schemaName);
  const [session] = await sql.unsafe(
    `INSERT INTO sessions (tenant_id, user_id, refresh_token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5, $6)
     RETURNING id`,
    [
      authz.tenantId,
      authz.userId,
      refreshHash,
      expiresAt.toISOString(),
      meta.userAgent || null,
      meta.ip || null,
    ],
  );

  const accessPayload = {
    sub: authz.userId,
    tenantId: authz.tenantId,
    schemaName: authz.schemaName,
    slug: authz.slug,
    email: authz.email,
    roles: authz.roles,
    permissions: authz.permissions,
    projectIds: authz.projectIds,
    locationIds: authz.locationIds,
    sid: session.id,
  };

  const accessToken = await signAccessToken(accessPayload);
  const refreshToken = formatRefreshToken(authz.tenantId, authz.schemaName, rawRefresh);

  return {
    accessToken,
    refreshToken,
    sessionId: session.id,
    expiresAt,
  };
}

/**
 * Login by tenant slug + email + password.
 */
export async function loginWithPassword({ slug, email, password, userAgent, ip }) {
  const cp = getSql();
  const tenants = await cp`
    SELECT id, schema_name, slug, status FROM tenants
    WHERE slug = ${slug} AND deleted_at IS NULL
    LIMIT 1
  `;
  if (!tenants[0] || tenants[0].status !== 'active') {
    throw AppError.unauthorized('Invalid credentials');
  }
  const tenant = tenants[0];
  const sql = createTenantSql(tenant.schema_name);
  const users = await sql.unsafe(
    `SELECT id, email, name, status, password_hash FROM users
     WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  if (!users[0]) throw AppError.unauthorized('Invalid credentials');
  const user = users[0];
  if (user.status !== 'active') throw AppError.unauthorized('Invalid credentials');

  const ok = await verifyPassword(user.password_hash, password);
  if (!ok) throw AppError.unauthorized('Invalid credentials');

  const authz = await loadUserAuthz(tenant.schema_name, user.id);
  const tokens = await issueSession(
    {
      tenantId: tenant.id,
      schemaName: tenant.schema_name,
      slug: tenant.slug,
      userId: user.id,
      email: user.email,
      roles: authz.roles,
      permissions: authz.permissions,
      projectIds: authz.projectIds,
      locationIds: authz.locationIds,
    },
    { userAgent, ip },
  );

  return {
    user: authz.user,
    roles: authz.roles,
    permissions: authz.permissions,
    projectIds: authz.projectIds,
    locationIds: authz.locationIds,
    tenant: { id: tenant.id, slug: tenant.slug, schemaName: tenant.schema_name },
    ...tokens,
  };
}

/**
 * Rotate refresh token; rejects reuse.
 */
export async function rotateRefreshToken(rawRefresh, meta = {}) {
  const parts = String(rawRefresh).split('.');
  if (parts.length < 3 || !parts[0].match(/^[0-9a-f-]{36}$/i)) {
    throw AppError.unauthorized('Invalid refresh token');
  }

  const tenantId = parts[0];
  const schemaName = parts[1];
  const tokenBody = parts.slice(2).join('.');
  const tokenHash = hashToken(tokenBody);

  const sql = createTenantSql(schemaName);
  const sessions = await sql.unsafe(
    `SELECT * FROM sessions
     WHERE refresh_token_hash = $1 AND deleted_at IS NULL
     LIMIT 1`,
    [tokenHash],
  );
  if (!sessions[0]) throw AppError.unauthorized('Invalid refresh token');
  const session = sessions[0];
  if (session.revoked_at) {
    throw AppError.unauthorized('Refresh token reuse detected');
  }
  if (new Date(session.expires_at) < new Date()) {
    throw AppError.unauthorized('Refresh token expired');
  }

  await sql.unsafe(`UPDATE sessions SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1`, [
    session.id,
  ]);

  const authz = await loadUserAuthz(schemaName, session.user_id);
  const cp = getSql();
  const [tenant] = await cp`
    SELECT id, slug, schema_name FROM tenants WHERE id = ${tenantId}
  `;
  if (!tenant) throw AppError.unauthorized('Invalid refresh token');

  const issued = await issueSession(
    {
      tenantId: tenant.id,
      schemaName: tenant.schema_name,
      slug: tenant.slug,
      userId: authz.user.id,
      email: authz.user.email,
      roles: authz.roles,
      permissions: authz.permissions,
      projectIds: authz.projectIds,
      locationIds: authz.locationIds,
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
    tenant: { id: tenant.id, slug: tenant.slug, schemaName: tenant.schema_name },
  };
}

export async function revokeSession(schemaName, sessionId) {
  const sql = createTenantSql(schemaName);
  await sql.unsafe(
    `UPDATE sessions SET revoked_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [sessionId],
  );
}

export async function revokeAllUserSessions(schemaName, userId) {
  const sql = createTenantSql(schemaName);
  await sql.unsafe(
    `UPDATE sessions SET revoked_at = NOW(), updated_at = NOW()
     WHERE user_id = $1 AND revoked_at IS NULL`,
    [userId],
  );
}

/**
 * Format opaque refresh token with tenant routing prefix.
 */
export function formatRefreshToken(tenantId, schemaName, raw) {
  return `${tenantId}.${schemaName}.${raw}`;
}

export async function createPasswordResetToken(schemaName, tenantId, email) {
  const sql = createTenantSql(schemaName);
  const users = await sql.unsafe(
    `SELECT id FROM users WHERE lower(email) = lower($1) AND deleted_at IS NULL LIMIT 1`,
    [email],
  );
  if (!users[0]) return null;
  const raw = generateToken();
  const tokenHash = hashToken(raw);
  const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
  await sql.unsafe(
    `INSERT INTO password_reset_tokens (tenant_id, user_id, token_hash, expires_at)
     VALUES ($1, $2, $3, $4)`,
    [tenantId, users[0].id, tokenHash, expiresAt.toISOString()],
  );
  return { token: raw, userId: users[0].id, expiresAt };
}

export async function resetPasswordWithToken(schemaName, rawToken, newPassword) {
  const sql = createTenantSql(schemaName);
  const tokenHash = hashToken(rawToken);
  const rows = await sql.unsafe(
    `SELECT * FROM password_reset_tokens
     WHERE token_hash = $1 AND deleted_at IS NULL LIMIT 1`,
    [tokenHash],
  );
  if (!rows[0] || rows[0].used_at || new Date(rows[0].expires_at) < new Date()) {
    throw AppError.validation('Invalid or expired reset token');
  }
  const passwordHash = await hashPassword(newPassword);
  await sql.unsafe(
    `UPDATE users SET password_hash = $1, updated_at = NOW() WHERE id = $2`,
    [passwordHash, rows[0].user_id],
  );
  await sql.unsafe(
    `UPDATE password_reset_tokens SET used_at = NOW(), updated_at = NOW() WHERE id = $1`,
    [rows[0].id],
  );
  await revokeAllUserSessions(schemaName, rows[0].user_id);
  return { userId: rows[0].user_id };
}
