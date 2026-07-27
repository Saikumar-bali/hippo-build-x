/**
 * Notification templates.
 */

export const TEMPLATES = Object.freeze({
  WELCOME: {
    id: 'welcome',
    name: 'Welcome Email',
    channel: 'email',
    subject: 'Welcome to {{tenantName}}',
    bodyTemplate: 'Hello {{userName}}, welcome to {{tenantName}}!',
    variables: ['tenantName', 'userName'],
  },
  DEMAND_LETTER: {
    id: 'demand-letter',
    name: 'Payment Demand Letter',
    channel: 'email',
    subject: 'Payment Demand - {{unitName}}',
    bodyTemplate: 'Dear {{customerName}}, a payment of {{amount}} is due for {{unitName}}.',
    variables: ['customerName', 'unitName', 'amount'],
  },
  PROGRESS_UPDATE: {
    id: 'progress-update',
    name: 'Construction Progress Update',
    channel: 'whatsapp',
    bodyTemplate: 'Your unit {{unitName}} progress is now {{progress}}%.',
    variables: ['unitName', 'progress'],
  },
});

/**
 * Render a template with the provided data.
 */
export function renderTemplate(template, data) {
  let body = template.bodyTemplate;
  let subject = template.subject;

  for (const [key, value] of Object.entries(data)) {
    body = body.replace(new RegExp(`{{${key}}}`, 'g'), value);
    if (subject) {
      subject = subject.replace(new RegExp(`{{${key}}}`, 'g'), value);
    }
  }

  return { subject, body };
}
