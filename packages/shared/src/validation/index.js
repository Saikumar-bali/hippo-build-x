/**
 * Common validation rules and helpers.
 */

export function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function isValidUUID(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}

export function isValidSlug(slug) {
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug);
}

export function sanitizeString(value) {
  return value.trim().replace(/\s+/g, ' ');
}

export function isPositiveInteger(value) {
  return typeof value === 'number' && Number.isInteger(value) && value > 0;
}
