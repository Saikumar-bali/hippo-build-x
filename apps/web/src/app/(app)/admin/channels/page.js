'use client';

import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, message, Spin } from 'antd';

export default function ChannelsAdminPage() {
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();

  useEffect(() => {
    fetch('/api/v1/admin/channel-config')
      .then((r) => r.json())
      .then((j) => form.setFieldsValue(j.data || {}))
      .finally(() => setLoading(false));
  }, [form]);

  async function onFinish(values) {
    const res = await fetch('/api/v1/admin/channel-config', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!res.ok) {
      message.error(json.errors?.[0]?.message || 'Save failed');
      return;
    }
    form.setFieldsValue(json.data || {});
    message.success('Channel config saved');
  }

  if (loading) return <Spin />;

  return (
    <Card title="Notification channel configuration">
      <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 480 }}>
        <Form.Item name="emailFrom" label="Email from">
          <Input />
        </Form.Item>
        <Form.Item name="smtpApiKey" label="SMTP / Brevo API key">
          <Input.Password />
        </Form.Item>
        <Form.Item name="smsProvider" label="SMS provider">
          <Input placeholder="twilio" />
        </Form.Item>
        <Form.Item name="smsApiKey" label="SMS API key">
          <Input.Password />
        </Form.Item>
        <Form.Item name="whatsappToken" label="WhatsApp token">
          <Input.Password />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          Save
        </Button>
      </Form>
    </Card>
  );
}
