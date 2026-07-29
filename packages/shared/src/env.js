/**
 * Environment validation — fails fast when required vars are missing.
 */

/**
 * @typedef {object} EnvSchema
 * @property {string[]} required
 * @property {Record<string, string>} [defaults]
 */

/**
 * @param {EnvSchema} schema
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {Record<string, string>}
 */
export function validateEnv(schema, env = process.env) {
  const result = {};
  const missing = [];

  for (const key of schema.required) {
    const value = env[key] ?? schema.defaults?.[key];
    if (value === undefined || value === '') {
      missing.push(key);
    } else {
      result[key] = value;
    }
  }

  if (schema.defaults) {
    for (const [key, value] of Object.entries(schema.defaults)) {
      if (!(key in result) && env[key]) {
        result[key] = env[key];
      } else if (!(key in result)) {
        result[key] = value;
      }
    }
  }

  // Capture optional known keys if present
  for (const [key, value] of Object.entries(env)) {
    if (value !== undefined && !(key in result)) {
      // skip — only return required + defaults
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return result;
}

/** Schema for Next.js web (API + UI) */
export const webEnvSchema = {
  required: ['DATABASE_URL', 'REDIS_URL', 'JWT_SECRET', 'JWT_REFRESH_SECRET'],
  defaults: {
    NODE_ENV: 'development',
    CORS_ORIGIN: 'http://localhost:3000',
    CHANNEL_CONFIG_KEY: 'dev-channel-config-key-change-me!!',
    PLATFORM_API_KEY: 'dev-platform-api-key-change-me',
    COOKIE_SECURE: 'false',
  },
};

/** Schema for BullMQ worker */
export const workerEnvSchema = {
  required: ['DATABASE_URL', 'REDIS_URL'],
  defaults: {
    NODE_ENV: 'development',
  },
};
