/**
 * Lightweight structured logger (JSON lines).
 * Avoids a hard pino dependency so shared stays dependency-light;
 * apps may wrap with pino if desired.
 */

/**
 * @param {string} level
 * @param {string} message
 * @param {Record<string, unknown>} [fields]
 */
function write(level, message, fields = {}) {
  const entry = {
    level,
    time: new Date().toISOString(),
    msg: message,
    ...fields,
  };
  const line = JSON.stringify(entry);
  if (level === 'error' || level === 'fatal') {
    console.error(line);
  } else if (level === 'warn') {
    console.warn(line);
  } else {
    console.log(line);
  }
}

/**
 * @param {Record<string, unknown>} [bindings]
 */
export function createLogger(bindings = {}) {
  return {
    child(extra) {
      return createLogger({ ...bindings, ...extra });
    },
    debug(message, fields) {
      write('debug', message, { ...bindings, ...fields });
    },
    info(message, fields) {
      write('info', message, { ...bindings, ...fields });
    },
    warn(message, fields) {
      write('warn', message, { ...bindings, ...fields });
    },
    error(message, fields) {
      write('error', message, { ...bindings, ...fields });
    },
  };
}

export const logger = createLogger({ service: 'hippo' });
