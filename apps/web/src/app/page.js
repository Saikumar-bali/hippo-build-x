'use client';

import { Button, Typography, Space } from 'antd';
import { BuildOutlined } from '@ant-design/icons';

const { Title, Paragraph } = Typography;

export default function Home() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh' }}>
      <Space direction="vertical" size="large" align="center">
        <BuildOutlined style={{ fontSize: 64, color: '#1677ff' }} />
        <Title level={1}>Construction ERP</Title>
        <Paragraph>Multi-tenant construction management platform</Paragraph>
        <Space>
          <Button type="primary" href="/login">Login</Button>
          <Button href="/dashboard">Dashboard</Button>
        </Space>
      </Space>
    </div>
  );
}
