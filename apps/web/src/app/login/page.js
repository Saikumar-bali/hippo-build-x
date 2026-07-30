'use client';

import { useState } from 'react';
import { Button, Card, Form, Input, Typography, Alert, Space } from 'antd';
import { BuildOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Title, Paragraph, Text } = Typography;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onFinish(values) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.errors?.[0]?.message || 'Login failed');
        return;
      }
      router.push('/dashboard');
    } catch {
      setError('Unable to reach server');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(160deg, #f0f5ff 0%, #ffffff 45%, #f6ffed 100%)',
        padding: 24,
      }}
    >
      <Card style={{ width: 420, maxWidth: '100%' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }} align="center">
          <BuildOutlined style={{ fontSize: 40, color: '#1677ff' }} />
          <Title level={3} style={{ margin: 0 }}>
            Sign in
          </Title>
          <Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 0 }}>
            Construction ERP — tenant administrator access
          </Paragraph>
        </Space>
        {error ? (
          <Alert type="error" message={error} showIcon style={{ marginTop: 16, marginBottom: 8 }} />
        ) : null}
        <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 16 }} requiredMark={false}>
          <Form.Item
            label="Tenant slug"
            name="slug"
            rules={[{ required: true, message: 'Tenant slug is required' }]}
          >
            <Input placeholder="green-valley" size="large" autoComplete="organization" />
          </Form.Item>
          <Form.Item label="Email" name="email" rules={[{ required: true, type: 'email' }]}>
            <Input size="large" placeholder="admin@company.com" autoComplete="username" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            rules={[{ required: true, message: 'Password is required' }]}
          >
            <Input.Password size="large" autoComplete="current-password" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Login
          </Button>
          <div style={{ marginTop: 12, textAlign: 'center' }}>
            <Text type="secondary">
              <a href="/forgot-password">Forgot password</a>
            </Text>
          </div>
        </Form>
      </Card>
    </div>
  );
}
