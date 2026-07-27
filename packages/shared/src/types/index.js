/**
 * Common types JSDoc annotations for editor support.
 * @typedef {Object} JwtPayload
 * @property {string} sub
 * @property {string} tenantId
 * @property {string} email
 * @property {string[]} roles
 * @property {string[]} permissions
 * @property {number} iat
 * @property {number} exp
 */

/**
 * @typedef {Object} TenantContext
 * @property {string} tenantId
 * @property {string} schemaName
 * @property {string} userId
 * @property {string[]} roles
 * @property {string[]} permissions
 * @property {string} [projectId]
 * @property {string} [locationId]
 */

/**
 * @typedef {Object} RequestContext
 * @property {string} requestId
 * @property {string} correlationId
 * @property {TenantContext} tenant
 * @property {string} ipAddress
 * @property {string} userAgent
 */
