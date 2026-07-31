import { describe, expect, it } from 'vitest';
import {
  channelStatusLabel,
  isSetupInProgress,
  jobStatusLabel,
  setupPercent,
  setupStepLabel,
  tenantStatusLabel,
} from './control-center-presenter.js';

describe('platform control center presenter', () => {
  it('uses plain-language organization and setup labels', () => {
    expect(tenantStatusLabel('active')).toBe('Ready');
    expect(tenantStatusLabel('failed')).toBe('Needs attention');
    expect(jobStatusLabel('retrying')).toBe('Trying again');
    expect(setupStepLabel('schema_created')).toBe('Private workspace created');
    expect(setupStepLabel('defaults_seeded')).toBe('Admin account created');
  });

  it('calculates setup progress and polling state', () => {
    expect(setupPercent('registered', 'queued')).toBeGreaterThan(0);
    expect(setupPercent('active', 'completed')).toBe(100);
    expect(isSetupInProgress({ status: 'provisioning' })).toBe(true);
    expect(isSetupInProgress({ status: 'active', provisioning_job_status: 'completed' })).toBe(false);
  });

  it('never exposes technical channel states to the operator', () => {
    expect(channelStatusLabel({ provider: 'unconfigured', enabled: false })).toBe('Not configured');
    expect(channelStatusLabel({ provider: 'twilio', enabled: true })).toBe('Enabled, not verified');
    expect(channelStatusLabel({ verification_status: 'verified' })).toBe('Verified');
  });
});
