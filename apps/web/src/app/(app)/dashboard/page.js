'use client';

import { useEffect, useState } from 'react';
import { Card, Col, Row, Typography, Tag, Spin } from 'antd';

const { Title, Paragraph } = Typography;

export default function DashboardPage() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((r) => r.json())
      .then((j) => setMe(j.data));
  }, []);

  if (!me) return <Spin />;

  return (
    <div>
      <Title level={2}>Welcome, {me.user?.name}</Title>
      <Paragraph type="secondary">
        Tenant <Tag>{me.tenant?.slug}</Tag> · Roles{' '}
        {(me.roles || []).map((r) => (
          <Tag color="blue" key={r}>
            {r}
          </Tag>
        ))}
      </Paragraph>
      <Row gutter={[16, 16]}>
        <Col xs={24} md={8}>
          <Card title="Permissions">{(me.permissions || []).length}</Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Project scopes">{(me.projectIds || []).length}</Card>
        </Col>
        <Col xs={24} md={8}>
          <Card title="Location scopes">{(me.locationIds || []).length}</Card>
        </Col>
      </Row>
    </div>
  );
}
