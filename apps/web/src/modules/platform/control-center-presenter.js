export const SETUP_STEPS = [
  'registered',
  'queued',
  'starting',
  'schema_created',
  'migrations_applied',
  'defaults_seeded',
  'channel_record_created',
  'active',
];

const TENANT_LABELS = Object.freeze({
  active: 'Ready',
  provisioning: 'Setting up',
  failed: 'Needs attention',
  suspended: 'Paused',
});

const TENANT_COLORS = Object.freeze({
  active: 'green',
  provisioning: 'blue',
  failed: 'red',
  suspended: 'orange',
});

const JOB_LABELS = Object.freeze({
  queued: 'Waiting',
  running: 'In progress',
  retrying: 'Trying again',
  completed: 'Completed',
  failed: 'Failed',
});

const STEP_LABELS = Object.freeze({
  registered: 'Request received',
  queued: 'Waiting to start',
  starting: 'Setup started',
  schema_created: 'Private workspace created',
  migrations_applied: 'System prepared',
  defaults_seeded: 'Admin account created',
  channel_record_created: 'Communication settings prepared',
  active: 'Ready to use',
  failed: 'Setup failed',
  queue_failed: 'Setup service unavailable',
  retrying: 'Trying again',
});

export function tenantStatusLabel(status) {
  return TENANT_LABELS[status] || status || 'Unknown';
}

export function tenantStatusColor(status) {
  return TENANT_COLORS[status] || 'default';
}

export function jobStatusLabel(status) {
  return JOB_LABELS[status] || status || 'Not started';
}

export function setupStepLabel(step) {
  return STEP_LABELS[step] || String(step || 'Not started').replaceAll('_', ' ');
}

export function setupPercent(step, status) {
  if (status === 'completed' || step === 'active') return 100;
  const index = SETUP_STEPS.indexOf(step);
  if (index < 0) return status === 'failed' ? 100 : 5;
  return Math.max(8, Math.round(((index + 1) / SETUP_STEPS.length) * 100));
}

export function isSetupInProgress(tenant) {
  const status = tenant?.provisioning_job_status || tenant?.provisioningJobs?.[0]?.status;
  return tenant?.status === 'provisioning' || ['registered', 'queued', 'running', 'retrying'].includes(status);
}

export function channelStatusLabel(channel) {
  if (channel?.verification_status === 'verified') return 'Verified';
  if (channel?.enabled) return 'Enabled, not verified';
  if (channel?.provider && channel.provider !== 'unconfigured') return 'Configured';
  return 'Not configured';
}
