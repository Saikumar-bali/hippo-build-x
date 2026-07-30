'use client';

import { useEffect, useState } from 'react';
import { Card, Col, Row, Typography, Tag, Spin, Statistic } from 'antd';
import {
  TeamOutlined,
  ProjectOutlined,
  HomeOutlined,
  DollarOutlined,
} from '@ant-design/icons';

const { Title } = Typography;

export default function DashboardPage() {
  const [me, setMe] = useState(null);

  useEffect(() => {
    fetch('/api/v1/auth/me')
      .then((r) => r.json())
      .then((j) => setMe(j.data));
  }, []);

  if (!me) return <Spin />;

  const stats = [
    { title: 'Total Leads', value: '1,234', icon: <TeamOutlined />, color: '#1e40af' },
    { title: 'Projects', value: '56', icon: <ProjectOutlined />, color: '#16a34a' },
    { title: 'Units Sold', value: '342', icon: <HomeOutlined />, color: '#d97706' },
    { title: 'Revenue', value: '₹2.45 Cr', icon: <DollarOutlined />, color: '#7c3aed' },
  ];

  return (
    <div>
      <Title level={3} style={{ marginBottom: 20 }}>Dashboard</Title>

      <Row gutter={[16, 16]} style={{ marginBottom: 24 }}>
        {stats.map((s) => (
          <Col xs={24} sm={12} lg={6} key={s.title}>
            <Card
              style={{
                borderRadius: 8,
                borderTop: `3px solid ${s.color}`,
              }}
              styles={{ body: { padding: '16px 20px' } }}
            >
              <Statistic
                title={s.title}
                value={s.value}
                prefix={s.icon}
                valueStyle={{ color: s.color, fontSize: 24, fontWeight: 600 }}
              />
            </Card>
          </Col>
        ))}
      </Row>

      <Row gutter={[16, 16]}>
        <Col xs={24} lg={12}>
          <Card title="Project Progress" style={{ borderRadius: 8 }}>
            {[
              { name: 'Green Valley Residency', progress: 72 },
              { name: 'Valley Heights', progress: 45 },
              { name: 'Sunrise Towers', progress: 28 },
            ].map((p) => (
              <div key={p.name} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <span>{p.name}</span>
                  <strong>{p.progress}%</strong>
                </div>
                <div
                  style={{
                    height: 8,
                    background: '#e2e8f0',
                    borderRadius: 4,
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${p.progress}%`,
                      height: '100%',
                      background: '#1e40af',
                      borderRadius: 4,
                    }}
                  />
                </div>
              </div>
            ))}
          </Card>
        </Col>
        <Col xs={24} lg={12}>
          <Card
            title={
              <span>
                Welcome, <span style={{ color: '#1e40af' }}>{me.user?.name}</span>
              </span>
            }
            style={{ borderRadius: 8 }}
          >
            <p style={{ marginBottom: 8, color: '#64748b' }}>
              Tenant <Tag color="blue">{me.tenant?.slug}</Tag>
            </p>
            <p style={{ marginBottom: 8, color: '#64748b' }}>
              Roles{' '}
              {(me.roles || []).map((r) => (
                <Tag color="blue" key={r}>
                  {r}
                </Tag>
              ))}
            </p>
            <Row gutter={[16, 16]} style={{ marginTop: 16 }}>
              <Col span={8}>
                <Statistic title="Permissions" value={(me.permissions || []).length} />
              </Col>
              <Col span={8}>
                <Statistic title="Projects" value={(me.projectIds || []).length} />
              </Col>
              <Col span={8}>
                <Statistic title="Locations" value={(me.locationIds || []).length} />
              </Col>
            </Row>
          </Card>
        </Col>
      </Row>
    </div>
  );
}
