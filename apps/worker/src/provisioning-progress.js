export async function reportProvisioningStep({
  currentStep,
  updateDurableState,
  updateProgress,
  onProgressError = () => {},
}) {
  await updateDurableState(currentStep);

  try {
    await updateProgress(currentStep);
  } catch (error) {
    onProgressError(error, currentStep);
  }
}
