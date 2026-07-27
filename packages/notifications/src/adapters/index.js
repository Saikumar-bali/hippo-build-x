/**
 * Notification channel adapters.
 */

export const NotificationChannel = Object.freeze({
  EMAIL: 'email',
  SMS: 'sms',
  WHATSAPP: 'whatsapp',
  PUSH: 'push',
});

/**
 * Email adapter stub — implement with SendGrid, SES, or SMTP.
 */
export class EmailAdapter {
  channel = NotificationChannel.EMAIL;

  async send(payload) {
    console.log(`[EMAIL] Sending to ${payload.to}: ${payload.subject}`);
    return { success: true, messageId: crypto.randomUUID(), channel: this.channel };
  }
}

/**
 * SMS adapter stub — implement with Twilio, MSG91, etc.
 */
export class SmsAdapter {
  channel = NotificationChannel.SMS;

  async send(payload) {
    console.log(`[SMS] Sending to ${payload.to}`);
    return { success: true, messageId: crypto.randomUUID(), channel: this.channel };
  }
}

/**
 * WhatsApp adapter stub — implement with WhatsApp Business API.
 */
export class WhatsAppAdapter {
  channel = NotificationChannel.WHATSAPP;

  async send(payload) {
    console.log(`[WHATSAPP] Sending to ${payload.to}`);
    return { success: true, messageId: crypto.randomUUID(), channel: this.channel };
  }
}
