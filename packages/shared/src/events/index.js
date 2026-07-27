/**
 * Domain event contracts.
 * Events are emitted by modules and consumed by workers.
 */

export function createEvent(eventType, tenantId, actorId, payload) {
  return {
    eventId: crypto.randomUUID(),
    eventType,
    occurredAt: new Date().toISOString(),
    tenantId,
    actorId,
    correlationId: crypto.randomUUID(),
    payload,
  };
}
