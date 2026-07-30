/**
 * Legacy slug-based schema naming retained only for existing tenants and older
 * tests. New provisioning must call toTenantSchemaName with the immutable UUID.
 */
export function toSchemaName(slug) {
  const normalized = String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) throw new Error('Invalid tenant slug');
  return `tenant_${normalized}`;
}

/**
 * Stable tenant schema locator. Slugs may change; tenant ids may not.
 * @param {string} tenantId
 */
export function toTenantSchemaName(tenantId) {
  const normalized = String(tenantId).replaceAll('-', '').toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(normalized)) {
    throw new Error('Invalid tenant UUID');
  }
  return `tenant_${normalized}`;
}

export function assertSafeSchemaName(schemaName) {
  if (!/^tenant_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Unsafe schema name: ${schemaName}`);
  }
}
