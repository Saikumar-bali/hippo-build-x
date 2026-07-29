'use client';

import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Typography } from 'antd';
import { useRouter } from 'next/navigation';

const { Title } = Typography;

export default function ResetPasswordPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onFinish(values) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.errors?.[0]?.message || 'Reset failed');
        return;
      }
      router.push('/login');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', padding: 24 }}>
      <Card style={{ width: 420 }}>
        <Title level={3}>Reset password</Title>
        {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 12 }} /> : null}
        <Form layout="vertical" onFinish={onFinish}>
          <Form.Item name="slug" label="Tenant slug" rules={[{ required: true }]} initialValue="green-valley">
            <Input />
          </Form.Item>
          <Form.Item name="token" label="Reset token" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="New password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          <Button type="primary" htmlType="submit" loading={loading} block>
            Update password
          </Button>
        </Form>
      </Card>
    </div>
  );
}
