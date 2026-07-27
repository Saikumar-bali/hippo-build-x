/**
 * AI guardrails — enforce what AI can and cannot do.
 *
 * AI MAY: summarize, predict, recommend, draft, classify, answer questions.
 * AI MAY NOT: create/modify financial records, change pipeline stages,
 *             approve purchases, modify stock, create demand letters.
 */

export const AiAction = Object.freeze({
  SUMMARIZE: 'summarize',
  PREDICT: 'predict',
  RECOMMEND: 'recommend',
  DRAFT: 'draft',
  CLASSIFY: 'classify',
  ANSWER: 'answer',
});

const BLOCKED_ACTIONS = [
  'create_demand_letter',
  'record_receipt',
  'change_stock',
  'create_ledger_entry',
  'change_payment_plan',
  'approve_purchase',
  'modify_financial_record',
  'change_pipeline_stage',
];

/**
 * Check if an AI action is permitted.
 */
export function isActionAllowed(action) {
  return !BLOCKED_ACTIONS.includes(action);
}

/**
 * Guard function that throws if an action is not permitted.
 */
export function enforceAiGuardrail(action) {
  if (!isActionAllowed(action)) {
    throw new Error(`AI action blocked by guardrail: ${action}. AI cannot perform write operations.`);
  }
}

/**
 * Check if the tenant is within their AI usage limits.
 */
export function checkUsageLimits(currentUsage, limit) {
  return {
    withinLimit: currentUsage < limit,
    remaining: Math.max(0, limit - currentUsage),
  };
}
