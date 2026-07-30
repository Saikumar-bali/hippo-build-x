export function getProvisioningAttemptState(job) {
  const configuredAttempts = Math.max(1, Number(job?.opts?.attempts) || 1);
  const attemptsMade = Math.max(0, Number(job?.attemptsMade) || 0);
  const attemptsStarted = Math.max(0, Number(job?.attemptsStarted) || 0);
  const attemptNumber = Math.max(attemptsStarted, attemptsMade + 1);

  return {
    configuredAttempts,
    attemptNumber,
    remainingAttempts: Math.max(0, configuredAttempts - attemptNumber),
    isFinalAttempt: attemptNumber >= configuredAttempts,
  };
}

export function getProvisioningFailureTransition(job, errorMessage) {
  const attempt = getProvisioningAttemptState(job);

  if (attempt.isFinalAttempt) {
    return {
      ...attempt,
      tenantStatus: 'failed',
      dataLocationStatus: 'attention_required',
      jobStatus: 'failed',
      currentStep: 'failed',
      errorCode: 'PROVISIONING_FAILED',
      errorMessage,
      finished: true,
      clearFinished: false,
    };
  }

  return {
    ...attempt,
    tenantStatus: 'provisioning',
    dataLocationStatus: 'retrying',
    jobStatus: 'retrying',
    currentStep: 'retrying',
    errorCode: 'PROVISIONING_RETRY',
    errorMessage,
    finished: false,
    clearFinished: true,
  };
}
