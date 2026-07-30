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
    ).resolves.toBeUndefined();

    expect(updateDurableState).toHaveBeenCalledWith('active');
    expect(updateProgress).toHaveBeenCalledWith('active');
    expect(onProgressError).toHaveBeenCalledWith(expect.any(Error), 'active');
  });

  it('still rejects when the durable provisioning state cannot be recorded', async () => {
    const updateDurableState = vi.fn().mockRejectedValue(new Error('database unavailable'));
    const updateProgress = vi.fn();

    await expect(
      reportProvisioningStep({
        currentStep: 'migrations_applied',
        updateDurableState,
        updateProgress,
      }),
    ).rejects.toThrow('database unavailable');

    expect(updateProgress).not.toHaveBeenCalled();
  });
});
