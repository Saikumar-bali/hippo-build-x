'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Collapse,
  Descriptions,
  Drawer,
  Empty,
  Form,
  Input,
  Layout,
  Modal,
  Progress,
  Space,
  Statistic,
  Table,
  Tabs,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  CheckCircleOutlined,
  CrownOutlined,
  EyeOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  TeamOutlined,
  WarningOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import {
  channelStatusLabel,
  isSetupInProgress,
  jobStatusLabel,
  setupPercent,
  setupStepLabel,
  tenantStatusColor,
  tenantStatusLabel,
} from './control-center-presenter.js';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const EMPTY = {
  summary: { total: 0, active: 0, provisioning: 0, failed: 0, suspended: 0 },
  tenants: [],
  plans: [],
  subscriptions: [],
  provisioningJobs: [],
  channels: [],
  featureFlags: [],
};

const formatDate = (value) => (value ? new Date(value).toLocaleString() : '—');
const subscriptionColor = (status) =>
  status === 'active' ? 'green' : status === 'trial' ? 'blue' : status === 'paused' ? 'orange' : 'default';
const subscriptionLabel = (status) =>
  ({ active: 'Active', trial: 'Trial', paused: 'Paused', expired: 'Expired', cancelled: 'Cancelled' })[status] || status || 'Not assigned';
const flagValue = (value) =>
  value === true ? <Tag color="green">On</Tag> : value === false ? <Tag color="red">Off</Tag> : <Tag>Not forced</Tag>;

export default function PlatformControlCenter() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [data, setData] = useState(EMPTY);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [retryingId, setRetryingId] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setLoading(true);
      setError('');
      try {
        const meResponse = await fetch('/api/v1/platform/auth/me', { cache: 'no-store' });
        if (meResponse.status === 401) {
          router.replace('/platform/login');
          return;
        }
        setMe((await meResponse.json()).data?.user || null);

        const response = await fetch('/api/v1/platform/control-center', { cache: 'no-store' });
        const json = await response.json();
        if (!response.ok) {
          setError(json.errors?.[0]?.message || 'Unable to load the platform overview');
          return;
        }
        setData({ ...EMPTY, ...(json.data || {}) });
      } catch {
        setError('Unable to reach the platform service');
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [router],
  );

  useEffect(() => {
    load();
  }, [load]);

  const hasWork = data.tenants.some(isSetupInProgress);
  useEffect(() => {
    if (!hasWork) return undefined;
    const timer = setInterval(() => load({ quiet: true }), 4000);
    return () => clearInterval(timer);
  }, [hasWork, load]);

  const selected = data.tenants.find((tenant) => tenant.id === selectedId) || null;
  const selectedJobs = data.provisioningJobs.filter((job) => job.tenant_id === selectedId);
  const selectedChannels = data.channels.filter((channel) => channel.tenant_id === selectedId);
  const selectedFlags = data.featureFlags.filter((flag) => flag.tenant_id === selectedId);
  const selectedSubscription = data.subscriptions.find((item) => item.tenant_id === selectedId);
  const latestJob = selectedJobs[0];

  async function createTenant(values) {
    setSaving(true);
    try {
      const response = await fetch('/api/v1/platform/tenants', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `tenant-create:${values.slug}`,
        },
        body: JSON.stringify({ ...values, isolationMode: 'shared_schema' }),
      });
      const json = await response.json();
      if (!response.ok || !json.success) {
        message.error(json.errors?.[0]?.message || 'Company setup could not be started');
        return;
      }
      message.success(`Setup started for ${json.data?.name}`);
      setCreateOpen(false);
      form.resetFields();
      setSelectedId(json.data?.id || null);
      await load({ quiet: true });
    } catch {
      message.error('Unable to reach the platform service');
    } finally {
      setSaving(false);
    }
  }

  async function retryTenant(id) {
    setRetryingId(id);
    try {
      const response = await fetch(`/api/v1/platform/tenants/${id}/retry-provisioning`, {
        method: 'POST',
        headers: { 'idempotency-key': `tenant-retry:${id}:${crypto.randomUUID()}` },
      });
      const json = await response.json();
      if (!response.ok) {
        message.error(json.errors?.[0]?.message || 'Setup could not be retried');
        return;
      }
      message.success('Setup retry started');
      await load({ quiet: true });
    } catch {
      message.error('Unable to retry setup');
    } finally {
      setRetryingId(null);
    }
  }

  async function logout() {
    await fetch('/api/v1/platform/auth/logout', { method: 'POST' });
    router.replace('/platform/login');
  }

  const organizationColumns = useMemo(
    () => [
      {
        title: 'Company',
        dataIndex: 'name',
        render: (name, tenant) => (
          <Space direction="vertical" size={0}>
            <Text strong>{name}</Text>
            <Text type="secondary">{tenant.slug}</Text>
          </Space>
        ),
      },
      {
        title: 'Current state',
        dataIndex: 'status',
        render: (status) => <Tag color={tenantStatusColor(status)}>{tenantStatusLabel(status)}</Tag>,
      },
      { title: 'Plan', dataIndex: 'plan_name', render: (value) => value || 'Not assigned' },
      {
        title: 'Setup',
        width: 245,
        render: (_, tenant) => (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Text>{setupStepLabel(tenant.provisioning_current_step || (tenant.status === 'active' ? 'active' : 'registered'))}</Text>
            <Progress
              percent={setupPercent(tenant.provisioning_current_step, tenant.provisioning_job_status)}
              size="small"
              showInfo={false}
              status={tenant.provisioning_job_status === 'failed' ? 'exception' : tenant.provisioning_job_status === 'completed' ? 'success' : 'active'}
            />
          </Space>
        ),
      },
      {
        title: 'Communication',
        render: (_, tenant) => `${tenant.channel_verified || 0} verified / ${tenant.channel_total || 0}`,
      },
      {
        title: '',
        render: (_, tenant) => (
          <Button icon={<EyeOutlined />} onClick={() => setSelectedId(tenant.id)}>View</Button>
        ),
      },
    ],
    [],
  );

  const plansColumns = [
    { title: 'Plan name', dataIndex: 'name' },
    { title: 'Code', dataIndex: 'code', render: (value) => <Text code>{value}</Text> },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag color={value === 'active' ? 'green' : 'default'}>{value}</Tag> },
    { title: 'Companies', dataIndex: 'subscription_count' },
    { title: 'Active', dataIndex: 'active_subscription_count' },
  ];

  const subscriptionColumns = [
    { title: 'Company', dataIndex: 'tenant_name' },
    { title: 'Plan', dataIndex: 'plan_name' },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag color={subscriptionColor(value)}>{subscriptionLabel(value)}</Tag> },
    { title: 'Starts', dataIndex: 'starts_at', render: formatDate },
    { title: 'Ends', dataIndex: 'ends_at', render: formatDate },
  ];

  const jobColumns = [
    { title: 'Company', dataIndex: 'tenant_name' },
    { title: 'Status', dataIndex: 'status', render: (value) => <Tag color={value === 'completed' ? 'green' : value === 'failed' ? 'red' : 'blue'}>{jobStatusLabel(value)}</Tag> },
    { title: 'Current step', dataIndex: 'current_step', render: setupStepLabel },
    { title: 'Attempts', dataIndex: 'attempt_count' },
    { title: 'Started', dataIndex: 'started_at', render: formatDate },
    { title: 'Finished', dataIndex: 'finished_at', render: formatDate },
  ];

  const channelColumns = [
    { title: 'Company', dataIndex: 'tenant_name' },
    { title: 'Type', dataIndex: 'channel_type', render: (value) => <span style={{ textTransform: 'capitalize' }}>{value}</span> },
    { title: 'Provider', dataIndex: 'provider', render: (value) => value === 'unconfigured' ? 'Not selected' : value },
    { title: 'Status', render: (_, channel) => channelStatusLabel(channel) },
  ];

  const flagColumns = [
    { title: 'Feature', dataIndex: 'flag_key' },
    { title: 'Applies to', render: (_, flag) => flag.tenant_name || 'All companies' },
    { title: 'Forced value', dataIndex: 'forced_value', render: flagValue },
    { title: 'Reason', dataIndex: 'reason', render: (value) => value || '—' },
  ];

  const tabs = [
    {
      key: 'organizations',
      label: 'Organizations',
      children: (
        <Card styles={{ body: { padding: 0 } }}>
          <Table rowKey="id" columns={organizationColumns} dataSource={data.tenants} loading={loading} scroll={{ x: 950 }} pagination={{ pageSize: 15, showSizeChanger: false }} locale={{ emptyText: <Empty description="No companies have been added yet" /> }} />
        </Card>
      ),
    },
    {
      key: 'plans',
      label: 'Plans & subscriptions',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Alert showIcon type="info" message="Plan records are ready" description="Plans and subscriptions already exist in the shared platform database. Creating, editing and assigning them is owned by Phase 12; this page makes the records visible now." />
          <Card title="Plans"><Table rowKey="id" columns={plansColumns} dataSource={data.plans} pagination={false} locale={{ emptyText: <Empty description="No plans have been created yet" /> }} /></Card>
          <Card title="Subscriptions"><Table rowKey="id" columns={subscriptionColumns} dataSource={data.subscriptions} scroll={{ x: 700 }} pagination={{ pageSize: 10, showSizeChanger: false }} locale={{ emptyText: <Empty description="No subscriptions have been assigned yet" /> }} /></Card>
        </Space>
      ),
    },
    {
      key: 'setup',
      label: 'Setup activity',
      children: (
        <Card>
          <Paragraph type="secondary">Every company setup request is recorded here. Failed work can be reviewed and safely retried.</Paragraph>
          <Table rowKey="id" columns={jobColumns} dataSource={data.provisioningJobs} scroll={{ x: 800 }} pagination={{ pageSize: 15, showSizeChanger: false }} locale={{ emptyText: <Empty description="No setup activity yet" /> }} />
        </Card>
      ),
    },
    {
      key: 'settings',
      label: 'Communication & features',
      children: (
        <Space direction="vertical" size="large" style={{ width: '100%' }}>
          <Card title="Communication setup"><Table rowKey="id" columns={channelColumns} dataSource={data.channels} pagination={{ pageSize: 15, showSizeChanger: false }} locale={{ emptyText: <Empty description="No communication records yet" /> }} /></Card>
          <Card title="Platform feature controls">
            <Alert showIcon type="info" message="Management starts in Phase 12" description="Tenant-owned settings are already available inside each company. Platform-wide forced controls are visible here and become editable in Phase 12." style={{ marginBottom: 16 }} />
            <Table rowKey="id" columns={flagColumns} dataSource={data.featureFlags} pagination={{ pageSize: 15, showSizeChanger: false }} locale={{ emptyText: <Empty description="No platform feature controls have been set" /> }} />
          </Card>
        </Space>
      ),
    },
  ];

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f6f8' }}>
      <Header style={{ height: 64, display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#fff', borderBottom: '1px solid #e5e7eb', paddingInline: 24 }}>
        <Space><CrownOutlined style={{ fontSize: 22 }} /><Text strong style={{ fontSize: 17 }}>Hippo Build Platform Admin</Text></Space>
        <Space><Text type="secondary">{me?.email}</Text><Button icon={<LogoutOutlined />} onClick={logout}>Logout</Button></Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1380, margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 16, flexWrap: 'wrap', marginBottom: 20 }}>
          <div><Title level={2} style={{ margin: 0 }}>Organizations</Title><Text type="secondary">Manage the companies that use Hippo Build.</Text></div>
          <Space><Button icon={<ReloadOutlined />} loading={loading} onClick={() => load()}>Refresh</Button><Button type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>Add company</Button></Space>
        </div>

        {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 14, marginBottom: 18 }}>
          <Card><Statistic title="All companies" value={data.summary.total} prefix={<TeamOutlined />} /></Card>
          <Card><Statistic title="Ready" value={data.summary.active} prefix={<CheckCircleOutlined />} /></Card>
          <Card><Statistic title="Setting up" value={data.summary.provisioning} prefix={<SettingOutlined />} /></Card>
          <Card><Statistic title="Needs attention" value={data.summary.failed} prefix={<WarningOutlined />} /></Card>
        </div>

        <Card style={{ marginBottom: 18 }}>
          <Space direction="vertical" size={8}>
            <Text strong><SafetyCertificateOutlined /> Automatic protection</Text>
            <Text><CheckCircleOutlined /> Each company has its own private data area.</Text>
            <Text><CheckCircleOutlined /> New company setup runs automatically without manual database work.</Text>
            <Text><CheckCircleOutlined /> Database updates are applied and recorded for every company.</Text>
            <Text><CheckCircleOutlined /> Email, SMS and WhatsApp passwords are encrypted and never shown in plain text.</Text>
          </Space>
        </Card>

        <Tabs items={tabs} />
      </Content>

      <Modal title="Add a company" open={createOpen} onCancel={() => setCreateOpen(false)} onOk={() => form.submit()} okText="Start setup" confirmLoading={saving} destroyOnHidden>
        <Alert type="info" showIcon message="Setup is automatic" description="Hippo Build creates the company workspace, prepares the system, creates the first administrator and communication settings, then marks the company ready." style={{ marginBottom: 18 }} />
        <Form form={form} layout="vertical" onFinish={createTenant} requiredMark={false}>
          <Form.Item label="Company name" name="name" rules={[{ required: true, message: 'Enter the company name' }]}><Input placeholder="Example Construction Pvt Ltd" autoFocus /></Form.Item>
          <Form.Item label="Login name" name="slug" extra="A short lowercase name used on the login screen" rules={[{ required: true }, { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: 'Use lowercase letters, numbers and hyphens only' }]}><Input placeholder="example-construction" /></Form.Item>
          <Form.Item label="Administrator email" name="adminEmail" rules={[{ required: true }, { type: 'email' }]}><Input placeholder="admin@example.com" /></Form.Item>
          <Form.Item label="Administrator name" name="adminName"><Input placeholder="Company Administrator" /></Form.Item>
        </Form>
      </Modal>

      <Drawer title={selected?.name || 'Company details'} open={Boolean(selected)} onClose={() => setSelectedId(null)} width={620} extra={selected?.status === 'failed' ? <Button type="primary" icon={<ReloadOutlined />} loading={retryingId === selected.id} onClick={() => retryTenant(selected.id)}>Retry setup</Button> : null}>
        {selected ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Alert type={selected.status === 'failed' ? 'error' : selected.status === 'active' ? 'success' : 'info'} showIcon message={tenantStatusLabel(selected.status)} description={selected.status === 'active' ? 'This company is ready to use Hippo Build.' : selected.status === 'failed' ? latestJob?.error_message || 'Setup needs attention.' : `${setupStepLabel(latestJob?.current_step)}. This page refreshes automatically.`} />
            <Card title="Company" size="small"><Descriptions column={1} size="small"><Descriptions.Item label="Company name">{selected.name}</Descriptions.Item><Descriptions.Item label="Login name">{selected.slug}</Descriptions.Item><Descriptions.Item label="Current state"><Tag color={tenantStatusColor(selected.status)}>{tenantStatusLabel(selected.status)}</Tag></Descriptions.Item><Descriptions.Item label="Added on">{formatDate(selected.created_at)}</Descriptions.Item></Descriptions></Card>
            <Card title="Setup progress" size="small"><Text>{setupStepLabel(latestJob?.current_step || (selected.status === 'active' ? 'active' : 'registered'))}</Text><Progress percent={setupPercent(latestJob?.current_step, latestJob?.status)} status={latestJob?.status === 'failed' ? 'exception' : latestJob?.status === 'completed' ? 'success' : 'active'} /><Text type="secondary">Attempts: {latestJob?.attempt_count || 0}</Text></Card>
            <Card title="Plan & subscription" size="small">{selectedSubscription ? <Descriptions column={1} size="small"><Descriptions.Item label="Plan">{selectedSubscription.plan_name}</Descriptions.Item><Descriptions.Item label="Status"><Tag color={subscriptionColor(selectedSubscription.status)}>{subscriptionLabel(selectedSubscription.status)}</Tag></Descriptions.Item><Descriptions.Item label="Started">{formatDate(selectedSubscription.starts_at)}</Descriptions.Item><Descriptions.Item label="Ends">{formatDate(selectedSubscription.ends_at)}</Descriptions.Item></Descriptions> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No plan is assigned yet" />}</Card>
            <Card title="Communication" size="small">{selectedChannels.length ? <Table rowKey="id" size="small" pagination={false} dataSource={selectedChannels} columns={[{ title: 'Type', dataIndex: 'channel_type', render: (value) => <span style={{ textTransform: 'capitalize' }}>{value}</span> }, { title: 'Provider', dataIndex: 'provider', render: (value) => value === 'unconfigured' ? 'Not selected' : value }, { title: 'Status', render: (_, channel) => channelStatusLabel(channel) }]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Communication setup is pending" />}</Card>
            <Card title="Feature controls" size="small">{selectedFlags.length ? <Table rowKey="id" size="small" pagination={false} dataSource={selectedFlags} columns={[{ title: 'Feature', dataIndex: 'flag_key' }, { title: 'Forced value', dataIndex: 'forced_value', render: flagValue }]} /> : <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No platform controls are applied" />}</Card>
            <Collapse items={[{ key: 'advanced', label: 'Advanced details', children: <Descriptions column={1} size="small" bordered><Descriptions.Item label="Organization ID"><Text copyable>{selected.id}</Text></Descriptions.Item><Descriptions.Item label="Storage folder"><Text copyable>{selected.storage_prefix}</Text></Descriptions.Item><Descriptions.Item label="Isolation">{selected.isolation_mode === 'dedicated_database' ? 'Dedicated database' : 'Private schema in shared database'}</Descriptions.Item><Descriptions.Item label="Database version">{selected.migration_version || 'Pending'}</Descriptions.Item><Descriptions.Item label="Data status">{selected.data_location_status || '—'}</Descriptions.Item></Descriptions> }]} />
          </Space>
        ) : null}
      </Drawer>
    </Layout>
  );
}
