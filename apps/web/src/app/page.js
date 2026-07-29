'use client';

import { Button, Typography, Space, Card } from 'antd';
import { BuildOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

export default function Home() {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      minHeight: '100vh',
      background: 'var(--ui-background)',
    }}>
      <Card style={{ textAlign: 'center', maxWidth: 500, borderRadius: 'var(--ui-radius)' }}>
        <Space direction="vertical" size="large" align="center">
          <BuildOutlined style={{ fontSize: 64, color: 'var(--ui-primary)' }} />
          <Title level={1} style={{ margin: 0 }}>Construction ERP</Title>
          <Paragraph style={{ color: 'var(--ui-text-muted)' }}>
            Multi-tenant construction management platform
          </Paragraph>
          <Space>
            <Button type="primary" size="large" href="/login">Login</Button>
            <Button size="large" href="/dashboard">Dashboard</Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
