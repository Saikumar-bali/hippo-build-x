export async function reportProvisioningStep({
  currentStep,
  updateDurableState,
  updateProgress,
  onDurableError = () => {},
  onProgressError = () => {},
}) {
  let durableRecorded = true;
  let progressRecorded = true;

  try {
    await updateDurableState(currentStep);
  } catch (error) {
    durableRecorded = false;
    onDurableError(error, currentStep);
  }

  try {
    await updateProgress(currentStep);
  } catch (error) {
    progressRecorded = false;
    onProgressError(error, currentStep);
  }

  return { durableRecorded, progressRecorded };
}
