/** Environment validation — fails fast when required vars are missing. */

export function validateEnv(schema, env = process.env) {
  const result = {};
  const missing = [];
  for (const key of schema.required) {
    const value = env[key] ?? schema.defaults?.[key];
    if (value === undefined || value === '') missing.push(key);
    else result[key] = value;
  }
  if (schema.defaults) {
    for (const [key, value] of Object.entries(schema.defaults)) {
      if (!(key in result)) result[key] = env[key] || value;
    }
  }
  if (missing.length) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }
  return result;
}

export const webEnvSchema = {
  required: ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'],
  defaults: {
    NODE_ENV: 'development',
    CORS_ORIGIN: 'http://localhost:3000',
    CHANNEL_CONFIG_KEY: 'dev-channel-config-key-change-me!!',
    CHANNEL_CONFIG_KEY_VERSION: 'v1',
    PLATFORM_API_KEY: 'dev-platform-api-key-change-me',
    COOKIE_SECURE: 'false',
  },
};

/**
 * The worker handles tenant provisioning, so production workers need both a
 * restricted runtime connection and an operator connection used only inside
 * checked-in provisioning/migration functions.
 */
export const workerEnvSchema = {
  required: ['DATABASE_URL', 'MIGRATION_DATABASE_URL', 'DATABASE_RUNTIME_ROLE', 'REDIS_URL'],
  defaults: { NODE_ENV: 'development' },
};
