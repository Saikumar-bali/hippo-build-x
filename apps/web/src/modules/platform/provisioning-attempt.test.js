import { describe, expect, it } from 'vitest';
import {
  getProvisioningAttemptState,
  getProvisioningFailureTransition,
} from '../../../../worker/src/provisioning-attempt.js';

describe('BullMQ provisioning attempt state', () => {
  it('keeps intermediate failures retrying without finishing the durable job', () => {
    const transition = getProvisioningFailureTransition(
      { attemptsMade: 0, attemptsStarted: 1, opts: { attempts: 3 } },
      'temporary database outage',
    );

    expect(transition).toMatchObject({
      attemptNumber: 1,
      configuredAttempts: 3,
      isFinalAttempt: false,
      tenantStatus: 'provisioning',
      dataLocationStatus: 'retrying',
      jobStatus: 'retrying',
      currentStep: 'retrying',
      finished: false,
      clearFinished: true,
    });
  });

  it('marks only the final configured attempt terminally failed', () => {
    const transition = getProvisioningFailureTransition(
      { attemptsMade: 2, attemptsStarted: 3, opts: { attempts: 3 } },
      'migration still failing',
    );

    expect(transition).toMatchObject({
      attemptNumber: 3,
      configuredAttempts: 3,
      remainingAttempts: 0,
      isFinalAttempt: true,
      tenantStatus: 'failed',
      dataLocationStatus: 'attention_required',
      jobStatus: 'failed',
      currentStep: 'failed',
      finished: true,
      clearFinished: false,
    });
  });

  it('treats an unconfigured retry count as a single final attempt', () => {
    expect(getProvisioningAttemptState({ attemptsMade: 0, opts: {} })).toEqual({
      configuredAttempts: 1,
      attemptNumber: 1,
      remainingAttempts: 0,
      isFinalAttempt: true,
    });
  });
});
