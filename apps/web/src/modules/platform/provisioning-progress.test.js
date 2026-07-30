import { describe, expect, it, vi } from 'vitest';
import { reportProvisioningStep } from '../../../../worker/src/provisioning-progress.js';

describe('provisioning progress reporting', () => {
  it('persists the durable step even when BullMQ telemetry rejects', async () => {
    const updateDurableState = vi.fn().mockResolvedValue(undefined);
    const updateProgress = vi.fn().mockRejectedValue(new Error('Redis connection closed'));
    const onProgressError = vi.fn();

    await expect(
      reportProvisioningStep({
        currentStep: 'active',
        updateDurableState,
        updateProgress,
        onProgressError,
      }),
    ).resolves.toEqual({ durableRecorded: true, progressRecorded: false });

    expect(updateDurableState).toHaveBeenCalledWith('active');
    expect(updateProgress).toHaveBeenCalledWith('active');
    expect(onProgressError).toHaveBeenCalledWith(expect.any(Error), 'active');
  });

  it('keeps successful provisioning independent from a durable reporting failure', async () => {
    const updateDurableState = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const updateProgress = vi.fn().mockResolvedValue(undefined);
    const onDurableError = vi.fn();

    await expect(
      reportProvisioningStep({
        currentStep: 'active',
        updateDurableState,
        updateProgress,
        onDurableError,
      }),
    ).resolves.toEqual({ durableRecorded: false, progressRecorded: true });

    expect(onDurableError).toHaveBeenCalledWith(expect.any(Error), 'active');
    expect(updateProgress).toHaveBeenCalledWith('active');
  });

  it('contains simultaneous durable and telemetry failures', async () => {
    const onDurableError = vi.fn();
    const onProgressError = vi.fn();

    await expect(
      reportProvisioningStep({
        currentStep: 'defaults_seeded',
        updateDurableState: vi.fn().mockRejectedValue(new Error('database unavailable')),
        updateProgress: vi.fn().mockRejectedValue(new Error('redis unavailable')),
        onDurableError,
        onProgressError,
      }),
    ).resolves.toEqual({ durableRecorded: false, progressRecorded: false });

    expect(onDurableError).toHaveBeenCalledTimes(1);
    expect(onProgressError).toHaveBeenCalledTimes(1);
  });
});
