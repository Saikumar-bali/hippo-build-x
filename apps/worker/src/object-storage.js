const DEFAULT_TIMEOUT_MS = 30_000;

export async function purgeTenantObjectStorage({ tenantId, storagePrefix, deletionJobId }) {
  const endpoint = process.env.OBJECT_STORAGE_PURGE_URL;
  if (!endpoint) {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('OBJECT_STORAGE_PURGE_URL is required before permanent tenant purge');
    }
    return {
      status: 'not_configured_nonproduction',
      tenantId,
      storagePrefix,
      deletionJobId,
      deletedObjects: null,
    };
  }

  const controller = new AbortController();
  const timeoutMs = Number(process.env.OBJECT_STORAGE_PURGE_TIMEOUT_MS || DEFAULT_TIMEOUT_MS);
  const timer = setTimeout(() => controller.abort(), Number.isFinite(timeoutMs) ? timeoutMs : DEFAULT_TIMEOUT_MS);
  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        'content-type': 'application/json',
        'idempotency-key': `tenant-purge:${deletionJobId}`,
        ...(process.env.OBJECT_STORAGE_PURGE_TOKEN
          ? { authorization: `Bearer ${process.env.OBJECT_STORAGE_PURGE_TOKEN}` }
          : {}),
      },
      body: JSON.stringify({
        tenantId,
        prefix: storagePrefix,
        deletionJobId,
      }),
    });
    const text = await response.text();
    let payload = {};
    if (text) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = { response: text.slice(0, 1000) };
      }
    }
    if (!response.ok) {
      throw new Error(
        payload?.message ||
          payload?.error ||
          `Object-storage purge failed with status ${response.status}`,
      );
    }
    return {
      status: 'completed',
      tenantId,
      storagePrefix,
      deletionJobId,
      ...payload,
    };
  } finally {
    clearTimeout(timer);
  }
}
