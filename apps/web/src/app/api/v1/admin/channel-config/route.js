import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
  tenantSql,
} from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { Permission } from '@hippo/rbac';
import {
  encryptChannelConfig,
  decryptChannelConfig,
  decryptLegacyChannelConfig,
  maskChannelConfig,
  channelKeyVersion,
} from '@/modules/admin/channel-crypto.js';

const CHANNEL_DEFINITIONS = {
  email: {
    secretFields: ['apiKey', 'password'],
    configFields: ['from', 'host', 'port', 'username'],
    defaultProvider: 'brevo',
  },
  sms: {
    secretFields: ['apiKey', 'authToken', 'accountSid'],
    configFields: ['senderId'],
    defaultProvider: 'twilio',
  },
  whatsapp: {
    secretFields: ['token', 'appSecret'],
    configFields: ['phoneNumberId', 'businessAccountId'],
    defaultProvider: 'meta',
  },
};

const aad = (tenantId, channelType) => `${tenantId}:${channelType}`;
const hasOwn = (value, key) => Object.prototype.hasOwnProperty.call(value, key);

function normalizeLegacy(raw = {}) {
  const email = raw.email || {};
  const sms = raw.sms || {};
  const whatsapp = raw.whatsapp || {};
  const emailSecrets = {
    ...(email.apiKey ? { apiKey: email.apiKey } : {}),
    ...(email.password ? { password: email.password } : {}),
    ...(raw.smtpApiKey ? { apiKey: raw.smtpApiKey } : {}),
  };
  const smsSecrets = {
    ...(sms.apiKey ? { apiKey: sms.apiKey } : {}),
    ...(sms.authToken ? { authToken: sms.authToken } : {}),
    ...(sms.accountSid ? { accountSid: sms.accountSid } : {}),
    ...(raw.smsApiKey ? { apiKey: raw.smsApiKey } : {}),
  };
  const whatsappSecrets = {
    ...(whatsapp.token ? { token: whatsapp.token } : {}),
    ...(whatsapp.appSecret ? { appSecret: whatsapp.appSecret } : {}),
    ...(raw.whatsappToken ? { token: raw.whatsappToken } : {}),
  };
  const make = (provider, config, secrets, explicitEnabled) => {
    const enabled = explicitEnabled ?? Object.keys(secrets).length > 0;
    return {
      provider,
      config,
      secrets,
      enabled,
      verificationStatus: enabled ? 'pending_verification' : 'not_configured',
    };
  };
  return {
    email: make(
      email.provider || raw.emailProvider || 'brevo',
      {
        ...(email.from || raw.emailFrom ? { from: email.from || raw.emailFrom } : {}),
        ...(email.host ? { host: email.host } : {}),
        ...(email.port ? { port: email.port } : {}),
        ...(email.username ? { username: email.username } : {}),
      },
      emailSecrets,
      email.enabled,
    ),
    sms: make(
      sms.provider || raw.smsProvider || 'twilio',
      { ...(sms.senderId || raw.smsSenderId ? { senderId: sms.senderId || raw.smsSenderId } : {}) },
      smsSecrets,
      sms.enabled,
    ),
    whatsapp: make(
      whatsapp.provider || raw.whatsappProvider || 'meta',
      {
        ...(whatsapp.phoneNumberId ? { phoneNumberId: whatsapp.phoneNumberId } : {}),
        ...(whatsapp.businessAccountId ? { businessAccountId: whatsapp.businessAccountId } : {}),
      },
      whatsappSecrets,
      whatsapp.enabled,
    ),
  };
}

async function loadLegacyChannels() {
  const rows = await tenantSql().unsafe(
    `SELECT channel_config_encrypted FROM tenant_settings
     WHERE deleted_at IS NULL LIMIT 1`,
  );
  if (!rows[0]?.channel_config_encrypted) return null;
  const { config, keyVersion } = decryptLegacyChannelConfig(rows[0].channel_config_encrypted);
  return { channels: normalizeLegacy(config), keyVersion };
}

async function readRows(sql, tenantId) {
  return sql`
    SELECT channel_type, provider, encrypted_credentials, encryption_key_version,
           non_secret_config, enabled, verification_status, last_verified_at, updated_at
    FROM tenant_channels
    WHERE tenant_id = ${tenantId} AND channel_type IN ('email', 'sms', 'whatsapp')
    ORDER BY channel_type
  `;
}

async function readChannels(sql, tenantId, legacy = null) {
  const rows = await readRows(sql, tenantId);
  const byType = new Map(rows.map((row) => [row.channel_type, row]));
  return Object.fromEntries(
    Object.entries(CHANNEL_DEFINITIONS).map(([channelType, definition]) => {
      const row = byType.get(channelType);
      const fallback = legacy?.channels?.[channelType];
      const secrets = row?.encrypted_credentials
        ? decryptChannelConfig(
            row.encrypted_credentials,
            aad(tenantId, channelType),
            row.encryption_key_version,
          )
        : fallback?.secrets || {};
      return [
        channelType,
        {
          provider: row?.provider || fallback?.provider || definition.defaultProvider,
          enabled: row?.enabled ?? fallback?.enabled ?? false,
          verificationStatus:
            row?.verification_status || fallback?.verificationStatus || 'not_configured',
          lastVerifiedAt: row?.last_verified_at || null,
          keyVersion: row?.encryption_key_version || legacy?.keyVersion || channelKeyVersion(),
          storage: row ? 'control_plane' : fallback ? 'legacy_pending_migration' : 'control_plane',
          ...(fallback?.config || {}),
          ...(row?.non_secret_config || {}),
          ...maskChannelConfig(secrets),
        },
      ];
    }),
  );
}

export const GET = withApiHandler(
  { auth: true, permission: Permission.TENANT_MANAGE },
  async () => {
    const { tenantId } = requireAuthContext();
    const legacy = await loadLegacyChannels();
    return successResponse(await readChannels(controlPlaneSql(), tenantId, legacy));
  },
);

export const PATCH = withApiHandler(
  {
    auth: true,
    permission: Permission.TENANT_MANAGE,
    audit: { action: 'update', entityType: 'tenant_channels' },
  },
  async (request) => {
    const { tenantId } = requireAuthContext();
    const body = await parseBody(request);
    const sql = controlPlaneSql();
    const legacy = await loadLegacyChannels();
    const existingRows = await readRows(sql, tenantId);
    const existingByType = new Map(existingRows.map((row) => [row.channel_type, row]));

    for (const [channelType, definition] of Object.entries(CHANNEL_DEFINITIONS)) {
      const requested = body[channelType];
      const fallback = legacy?.channels?.[channelType];
      const currentRow = existingByType.get(channelType);
      if ((!requested || typeof requested !== 'object') && (!fallback || currentRow)) continue;
      const input = requested || {};

      const currentSecrets = currentRow?.encrypted_credentials
        ? decryptChannelConfig(
            currentRow.encrypted_credentials,
            aad(tenantId, channelType),
            currentRow.encryption_key_version,
          )
        : fallback?.secrets || {};
      const nextSecrets = { ...currentSecrets };
      for (const field of definition.secretFields) {
        const value = input[field];
        if (typeof value === 'string' && value && value !== '••••••••') nextSecrets[field] = value;
      }

      const nextConfig = {
        ...(fallback?.config || {}),
        ...(currentRow?.non_secret_config || {}),
      };
      for (const field of definition.configFields) {
        if (input[field] !== undefined) nextConfig[field] = input[field];
      }

      const provider = input.provider || currentRow?.provider || fallback?.provider || definition.defaultProvider;
      const currentEnabled = currentRow?.enabled ?? fallback?.enabled ?? false;
      const currentStatus =
        currentRow?.verification_status || fallback?.verificationStatus || 'not_configured';
      const enabled = hasOwn(input, 'enabled') ? Boolean(input.enabled) : currentEnabled;
      let verificationStatus = currentStatus;
      if (hasOwn(input, 'enabled')) {
        if (!enabled) verificationStatus = 'not_configured';
        else if (!currentEnabled) verificationStatus = 'pending_verification';
      }

      const currentVersion = channelKeyVersion();
      const encryptedCredentials = Object.keys(nextSecrets).length
        ? encryptChannelConfig(nextSecrets, aad(tenantId, channelType), currentVersion)
        : null;

      await sql`
        INSERT INTO tenant_channels
          (tenant_id, channel_type, provider, encrypted_credentials,
           encryption_key_version, non_secret_config, enabled, verification_status)
        VALUES
          (${tenantId}, ${channelType}, ${provider}, ${encryptedCredentials},
           ${currentVersion}, ${JSON.stringify(nextConfig)}::jsonb,
           ${enabled}, ${verificationStatus})
        ON CONFLICT (tenant_id, channel_type)
        DO UPDATE SET
          provider = EXCLUDED.provider,
          encrypted_credentials = EXCLUDED.encrypted_credentials,
          encryption_key_version = EXCLUDED.encryption_key_version,
          non_secret_config = EXCLUDED.non_secret_config,
          enabled = EXCLUDED.enabled,
          verification_status = EXCLUDED.verification_status,
          updated_at = NOW()
      `;
    }

    if (legacy) {
      const migrated = await sql`
        SELECT count(*)::int AS count FROM tenant_channels
        WHERE tenant_id = ${tenantId} AND channel_type IN ('email', 'sms', 'whatsapp')
      `;
      if (migrated[0]?.count === 3) {
        await tenantSql().unsafe(
          `UPDATE tenant_settings
           SET channel_config_encrypted = NULL, updated_at = NOW()
           WHERE deleted_at IS NULL`,
        );
      }
    }

    return successResponse(await readChannels(sql, tenantId));
  },
);
