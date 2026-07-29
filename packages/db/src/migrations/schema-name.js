/**
 * Normalize a slug into a PostgreSQL-safe schema name.
 * @param {string} slug
 */
export function toSchemaName(slug) {
  const normalized = String(slug)
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '');
  if (!normalized) {
    throw new Error('Invalid tenant slug');
  }
  return `tenant_${normalized}`;
}

/**
 * Validate schema name is safe for SQL identifiers.
 * @param {string} schemaName
 */
export function assertSafeSchemaName(schemaName) {
  if (!/^tenant_[a-z0-9_]+$/.test(schemaName)) {
    throw new Error(`Unsafe schema name: ${schemaName}`);
  }
}
