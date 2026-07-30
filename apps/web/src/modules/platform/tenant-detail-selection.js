export function shouldApplyTenantDetailResponse(currentTenantId, requestedTenantId, aborted = false) {
  return !aborted && Boolean(requestedTenantId) && currentTenantId === requestedTenantId;
}
