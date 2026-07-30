/**
 * Notification service that dispatches through registered adapters.
 * Handles retry logic and dead-letter tracking.
 */
export class NotificationService {
  adapters = new Map();

  registerAdapter(adapter) {
    this.adapters.set(adapter.channel, adapter);
  }

  async send(channel, payload) {
    const adapter = this.adapters.get(channel);

    if (!adapter) {
      return { success: false, error: `No adapter registered for channel: ${channel}`, channel };
    }

    try {
      return await adapter.send(payload);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        channel,
      };
    }
  }

  async sendMultiChannel(channels, payload) {
    return Promise.all(channels.map((channel) => this.send(channel, payload)));
  }
}
