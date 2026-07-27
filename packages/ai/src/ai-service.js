import { enforceAiGuardrail } from './guardrails/index.js';

/**
 * AI service — provider-agnostic interface with guardrails and logging.
 */
export class AiService {
  providers = [];
  defaultProvider = null;

  registerProvider(provider, isDefault = false) {
    this.providers.push(provider);
    if (isDefault || !this.defaultProvider) {
      this.defaultProvider = provider;
    }
  }

  async generate(prompt, action) {
    if (action) {
      enforceAiGuardrail(action);
    }

    const provider = await this.resolveProvider();
    return provider.generate(prompt);
  }

  async resolveProvider() {
    for (const provider of this.providers) {
      if (await provider.isAvailable()) {
        return provider;
      }
    }
    throw new Error('No AI provider available');
  }
}
