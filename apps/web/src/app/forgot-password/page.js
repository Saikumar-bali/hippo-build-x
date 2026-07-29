'use client';

import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';

const { Title, Paragraph } = Typography;

export default function ForgotPasswordPage() {
  const [message, setMessage] = useState('');
  const [devToken, setDevToken] = useState('');
  const [loading, setLoading] = useState(false);

  async function onFinish(values) {
    setLoading(true);
    setMessage('');
    setDevToken('');
    try {
      const res = await fetch('/api/v1/auth/forgot-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      setMessage(json.data?.message || 'If the account exists, a reset link was sent');
      if (json.data?.devToken) setDevToken(json.data.devToken);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card style={{ width: 420 }}>
        <Title level={3}>Forgot password</Title>
        <Paragraph type="secondary">Enter your tenant slug and email.</Paragraph>
        {message ? <Alert type="success" message={message} showIcon style={{ marginBottom: 12 }} /> : null}
        {devToken ? (
          <Alert
            type="info"
            message={`Dev reset token: ${devToken}`}
            style={{ marginBottom: 12 }}
          />
        ) : null}
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="slug" label="Tenant slug" rules={[{ required: true }]} initialValue="green-valley">
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Send reset link
          </Button>
          <Button href="/login" type="link" block>
            Back to login
          </Button>
        </Form>
      </Card>
    </div>
  );
}
