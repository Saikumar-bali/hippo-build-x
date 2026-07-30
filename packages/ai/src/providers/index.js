/**
 * AI provider abstraction layer.
 * Supports multiple AI providers through a unified interface.
 */

/** OpenAI adapter stub — implement with OpenAI SDK. */
export class OpenAiProvider {
  name = 'openai';

  async generate(_prompt) {
    return {
      content: '',
      tokenUsage: { prompt: 0, completion: 0, total: 0 },
      model: 'gpt-4o',
      provider: this.name,
    };
  }

  async isAvailable() {
    return !!process.env.OPENAI_API_KEY;
  }
}
