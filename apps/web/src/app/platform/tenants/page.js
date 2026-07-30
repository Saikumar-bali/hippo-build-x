'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  Layout,
  Modal,
  Space,
  Table,
  Tag,
  Typography,
  message,
} from 'antd';
import { CrownOutlined, LogoutOutlined, PlusOutlined } from '@ant-design/icons';
import { useRouter } from 'next/navigation';

const { Header, Content } = Layout;
const { Title, Text } = Typography;

export default function PlatformTenantsPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const meRes = await fetch('/api/v1/platform/auth/me');
      if (meRes.status === 401) {
        router.replace('/platform/login');
        return;
      }
      const meJson = await meRes.json();
      setMe(meJson.data?.user || null);

      const listRes = await fetch('/api/v1/platform/tenants');
      const listJson = await listRes.json();
      if (!listRes.ok) {
        setError(listJson.errors?.[0]?.message || 'Failed to load tenants');
        return;
      }
      setTenants(listJson.data || []);
    } catch {
      setError('Unable to reach server');
    } finally {
      setLoading(false);
    }
  }, [router]);

  useEffect(() => {
    load();
  }, [load]);

  async function onCreate(values) {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/platform/tenants', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(values),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        message.error(json.errors?.[0]?.message || 'Create failed');
        return;
      }
      message.success(`Tenant ${json.data?.slug} created (${json.data?.status})`);
      setOpen(false);
      form.resetFields();
      await load();
    } catch {
      message.error('Unable to reach server');
    } finally {
      setSaving(false);
    }
  }

  async function onLogout() {
    await fetch('/api/v1/platform/auth/logout', { method: 'POST' });
    router.replace('/platform/login');
  }

  const columns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Slug', dataIndex: 'slug' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => (
        <Tag color={status === 'active' ? 'green' : status === 'provisioning' ? 'blue' : 'orange'}>
          {status}
        </Tag>
      ),
    },
    { title: 'Schema', dataIndex: 'schema_name' },
    {
      title: 'Created',
      dataIndex: 'created_at',
      render: (v) => (v ? new Date(v).toLocaleString() : '—'),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#141414',
          paddingInline: 24,
        }}
      >
        <Space>
          <CrownOutlined style={{ color: '#faad14', fontSize: 20 }} />
          <Title level={4} style={{ color: '#fff', margin: 0 }}>
            Platform Console
          </Title>
        </Space>
        <Space>
          <Text style={{ color: '#d9d9d9' }}>{me?.email}</Text>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            Logout
          </Button>
        </Space>
      </Header>
      <Content style={{ padding: 24, maxWidth: 1100, margin: '0 auto', width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
          <div>
            <Title level={3} style={{ marginBottom: 4 }}>
              Tenants
            </Title>
            <Text type="secondary">Create and provision builder organizations</Text>
          </div>
          <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
            Create tenant
          </Button>
        </Space>
        {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}
        <Table
          rowKey="id"
          loading={loading}
          columns={columns}
          dataSource={tenants}
          pagination={{ pageSize: 20 }}
        />
      </Content>

      <Modal
        title="Create tenant"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={form} layout="vertical" onFinish={onCreate} requiredMark={false}>
          <Form.Item label="Name" name="name" rules={[{ required: true }]}>
            <Input placeholder="Acme Developers" />
          </Form.Item>
          <Form.Item
            label="Slug"
            name="slug"
            rules={[
              { required: true },
              {
                pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                message: 'Lowercase alphanumeric with hyphens',
              },
            ]}
          >
            <Input placeholder="acme" />
          </Form.Item>
          <Form.Item label="Admin email" name="adminEmail" rules={[{ type: 'email' }]}>
            <Input placeholder="admin@acme.example" />
          </Form.Item>
          <Form.Item label="Admin name" name="adminName">
            <Input placeholder="Tenant Administrator" />
          </Form.Item>
        </Form>
      </Modal>
    </Layout>
  );
}
