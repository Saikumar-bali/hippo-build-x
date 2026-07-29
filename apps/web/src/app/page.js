'use client';

import { Button, Typography, Space, Card } from 'antd';
import { BuildOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

export default function Home() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: '100vh',
        background: 'linear-gradient(160deg, #f0f5ff 0%, #ffffff 50%, #f6ffed 100%)',
      }}
    >
      <Card style={{ textAlign: 'center', maxWidth: 520 }}>
        <Space direction="vertical" size="large" align="center">
          <BuildOutlined style={{ fontSize: 64, color: '#1677ff' }} />
          <Title level={1} style={{ margin: 0 }}>
            Hippo Build X
          </Title>
          <Paragraph type="secondary">
            Multi-tenant construction management platform
          </Paragraph>
          <Space>
            <Button type="primary" size="large" href="/login">
              Tenant login
            </Button>
            <Button size="large" href="/platform/login">
              Super admin
            </Button>
            <Button size="large" href="/dashboard">
              Dashboard
            </Button>
          </Space>
        </Space>
      </Card>
    </div>
  );
}
