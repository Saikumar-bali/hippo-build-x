'use client';

import { useState } from 'react';
import { Alert, Button, Card, Form, Input, Space, Typography } from 'antd';
import { CrownOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

const { Title, Paragraph, Text } = Typography;

export default function PlatformLoginPage() {
  const router = useRouter();
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function onFinish(values) {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/v1/platform/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        setError(json.errors?.[0]?.message || 'Login failed');
        return;
      }
      router.push('/platform/tenants');
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
        background: 'linear-gradient(160deg, #141414 0%, #1f1f1f 50%, #262626 100%)',
        padding: 24,
      }}
    >
      <Card style={{ width: 420, maxWidth: '100%' }}>
        <Space direction="vertical" size="middle" style={{ width: '100%' }} align="center">
          <CrownOutlined style={{ fontSize: 40, color: '#faad14' }} />
          <Title level={3} style={{ margin: 0 }}>
            Platform Super Admin
          </Title>
          <Paragraph type="secondary" style={{ textAlign: 'center', marginBottom: 0 }}>
            Create and manage tenants across Hippo Build X
          </Paragraph>
        </Space>
        {error ? (
          <Alert type="error" message={error} showIcon style={{ marginTop: 16, marginBottom: 8 }} />
        ) : null}
        <Form layout="vertical" onFinish={onFinish} style={{ marginTop: 16 }} requiredMark={false}>
          <Form.Item
            label="Email"
            name="email"
            initialValue="superadmin@hippo.example"
            rules={[{ required: true, type: 'email' }]}
          >
            <Input size="large" />
          </Form.Item>
          <Form.Item
            label="Password"
            name="password"
            initialValue="SuperAdmin@12345"
            rules={[{ required: true }]}
          >
            <Input.Password size="large" />
          </Form.Item>
          <Button type="primary" htmlType="submit" block size="large" loading={loading}>
            Sign in
          </Button>
        </Form>
        <div style={{ marginTop: 16, textAlign: 'center' }}>
          <Text type="secondary">
            Tenant admin? <Link href="/login">Sign in here</Link>
          </Text>
        </div>
      </Card>
    </div>
  );
}
