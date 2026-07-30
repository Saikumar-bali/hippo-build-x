import {
  successResponse,
  parseBody,
  withApiHandler,
  controlPlaneSql,
} from '@/lib/api-utils';
import { requireAuthContext } from '@/lib/tenant-context.js';
import { Permission } from '@hippo/rbac';
import {
  encryptChannelConfig,
  decryptChannelConfig,
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

function associatedData(tenantId, channelType) {
  return `${tenantId}:${channelType}`;
}

async function readChannels(sql, tenantId) {
  const rows = await sql`
    SELECT channel_type, provider, encrypted_credentials, encryption_key_version,
           non_secret_config, enabled, verification_status, last_verified_at, updated_at
    FROM tenant_channels
    WHERE tenant_id = ${tenantId} AND channel_type IN ('email', 'sms', 'whatsapp')
    ORDER BY channel_type
  `;

  const byType = new Map(rows.map((row) => [row.channel_type, row]));
  return Object.fromEntries(
    Object.entries(CHANNEL_DEFINITIONS).map(([channelType, definition]) => {
      const row = byType.get(channelType);
      const secrets = row?.encrypted_credentials
        ? decryptChannelConfig(row.encrypted_credentials, associatedData(tenantId, channelType))
        : {};
      return [
        channelType,
        {
          provider: row?.provider || definition.defaultProvider,
          enabled: row?.enabled || false,
          verificationStatus: row?.verification_status || 'not_configured',
          lastVerifiedAt: row?.last_verified_at || null,
          keyVersion: row?.encryption_key_version || channelKeyVersion(),
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
    return successResponse(await readChannels(controlPlaneSql(), tenantId));
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

    for (const [channelType, definition] of Object.entries(CHANNEL_DEFINITIONS)) {
      const input = body[channelType];
      if (!input || typeof input !== 'object') continue;

      const [currentRow] = await sql`
        SELECT encrypted_credentials, non_secret_config, provider
        FROM tenant_channels
        WHERE tenant_id = ${tenantId} AND channel_type = ${channelType}
        LIMIT 1
      `;
      const currentSecrets = currentRow?.encrypted_credentials
        ? decryptChannelConfig(
            currentRow.encrypted_credentials,
            associatedData(tenantId, channelType),
          )
        : {};
      const nextSecrets = { ...currentSecrets };
      for (const field of definition.secretFields) {
        const value = input[field];
        if (typeof value === 'string' && value && value !== '••••••••') {
          nextSecrets[field] = value;
        }
      }

      const nextConfig = { ...(currentRow?.non_secret_config || {}) };
      for (const field of definition.configFields) {
        if (input[field] !== undefined) nextConfig[field] = input[field];
      }

      const provider = input.provider || currentRow?.provider || definition.defaultProvider;
      const encryptedCredentials = Object.keys(nextSecrets).length
        ? encryptChannelConfig(nextSecrets, associatedData(tenantId, channelType))
        : null;
      const enabled = Boolean(input.enabled);
      const verificationStatus = enabled ? 'pending_verification' : 'not_configured';

      await sql`
        INSERT INTO tenant_channels
          (tenant_id, channel_type, provider, encrypted_credentials,
           encryption_key_version, non_secret_config, enabled, verification_status)
        VALUES
          (${tenantId}, ${channelType}, ${provider}, ${encryptedCredentials},
           ${channelKeyVersion()}, ${JSON.stringify(nextConfig)}::jsonb,
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

    return successResponse(await readChannels(sql, tenantId));
  },
);
