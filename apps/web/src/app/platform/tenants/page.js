'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Descriptions,
  Drawer,
  Form,
  Input,
  Layout,
  Modal,
  Progress,
  Row,
  Space,
  Statistic,
  Steps,
  Table,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  CrownOutlined,
  DatabaseOutlined,
  EyeOutlined,
  LogoutOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SyncOutlined,
} from '@ant-design/icons';
import { useRouter } from 'next/navigation';
import { shouldApplyTenantDetailResponse } from '@/modules/platform/tenant-detail-selection.js';

const { Header, Content } = Layout;
const { Title, Text, Paragraph } = Typography;

const STEP_ORDER = [
  'registered',
  'queued',
  'starting',
  'schema_created',
  'migrations_applied',
  'defaults_seeded',
  'channel_record_created',
  'active',
];

const STEP_LABELS = {
  registered: 'Tenant registered',
  queued: 'Provisioning queued',
  retrying: 'Provisioning retrying',
  starting: 'Worker started',
  schema_created: 'Isolated schema created',
  migrations_applied: 'Tenant migrations applied',
  defaults_seeded: 'Roles and administrator seeded',
  channel_record_created: 'Channel vault initialized',
  active: 'Tenant activated',
  failed: 'Provisioning failed',
  queue_failed: 'Queue unavailable',
};

function statusColor(status) {
  if (status === 'active' || status === 'completed') return 'green';
  if (['provisioning', 'queued', 'running', 'retrying'].includes(status)) return 'blue';
  if (status === 'failed') return 'red';
  if (status === 'suspended') return 'orange';
  return 'default';
}

function provisionPercent(step, status) {
  if (status === 'completed' || step === 'active') return 100;
  const index = STEP_ORDER.indexOf(step);
  if (index < 0) return status === 'failed' ? 100 : 5;
  return Math.max(8, Math.round(((index + 1) / STEP_ORDER.length) * 100));
}

function formatDate(value) {
  return value ? new Date(value).toLocaleString() : '—';
}

function isProvisioningState(tenant) {
  return (
    tenant?.status === 'provisioning' ||
    ['registered', 'queued', 'running', 'retrying'].includes(
      tenant?.provisioning_job_status || tenant?.provisioningJobs?.[0]?.status,
    )
  );
}

export default function PlatformTenantsPage() {
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const selectedIdRef = useRef(null);
  const [form] = Form.useForm();

  const load = useCallback(
    async ({ quiet = false } = {}) => {
      if (!quiet) setLoading(true);
      setError('');
      try {
        const meRes = await fetch('/api/v1/platform/auth/me', { cache: 'no-store' });
        if (meRes.status === 401) {
          router.replace('/platform/login');
          return false;
        }
        const meJson = await meRes.json();
        setMe(meJson.data?.user || null);

        const listRes = await fetch('/api/v1/platform/tenants', { cache: 'no-store' });
        const listJson = await listRes.json();
        if (!listRes.ok) {
          setError(listJson.errors?.[0]?.message || 'Failed to load tenants');
          return false;
        }
        setTenants(listJson.data || []);
        return true;
      } catch {
        setError('Unable to reach the platform API');
        return false;
      } finally {
        if (!quiet) setLoading(false);
      }
    },
    [router],
  );

  const closeDetail = useCallback(() => {
    selectedIdRef.current = null;
    setSelected(null);
    setDetailLoading(false);
  }, []);

  const loadDetail = useCallback(
    async (id, { quiet = false, signal } = {}) => {
      if (!id) return false;
      if (!quiet && selectedIdRef.current === id) setDetailLoading(true);

      try {
        const res = await fetch(`/api/v1/platform/tenants/${id}`, {
          cache: 'no-store',
          signal,
        });
        const json = await res.json();
        if (!shouldApplyTenantDetailResponse(selectedIdRef.current, id, signal?.aborted)) {
          return false;
        }
        if (!res.ok) {
          if (!quiet) {
            message.error(json.errors?.[0]?.message || 'Unable to load tenant');
            closeDetail();
          }
          return false;
        }
        setSelected(json.data);
        return true;
      } catch (requestError) {
        if (
          requestError?.name === 'AbortError' ||
          !shouldApplyTenantDetailResponse(selectedIdRef.current, id, signal?.aborted)
        ) {
          return false;
        }
        if (!quiet) {
          message.error('Unable to load tenant details');
          closeDetail();
        }
        return false;
      } finally {
        if (
          !quiet &&
          shouldApplyTenantDetailResponse(selectedIdRef.current, id, signal?.aborted)
        ) {
          setDetailLoading(false);
        }
      }
    },
    [closeDetail],
  );

  const openDetail = useCallback(
    async (id) => {
      selectedIdRef.current = id;
      setSelected({ id });
      await loadDetail(id);
    },
    [loadDetail],
  );

  useEffect(() => {
    load();
  }, [load]);

  const hasWorkInProgress = tenants.some(isProvisioningState);
  const selectedInProgress = isProvisioningState(selected);
  const selectedId = selected?.id || null;

  useEffect(() => {
    if (!hasWorkInProgress && !selectedInProgress) return undefined;

    const controller = new AbortController();
    let refreshing = false;
    const refresh = async () => {
      if (refreshing) return;
      refreshing = true;
      try {
        await load({ quiet: true });
        if (selectedId) {
          await loadDetail(selectedId, { quiet: true, signal: controller.signal });
        }
      } finally {
        refreshing = false;
      }
    };

    const timer = setInterval(refresh, 4000);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [hasWorkInProgress, load, loadDetail, selectedId, selectedInProgress]);

  const stats = useMemo(
    () => ({
      total: tenants.length,
      active: tenants.filter((tenant) => tenant.status === 'active').length,
      provisioning: tenants.filter((tenant) => tenant.status === 'provisioning').length,
      failed: tenants.filter((tenant) => tenant.status === 'failed').length,
    }),
    [tenants],
  );

  async function onCreate(values) {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/platform/tenants', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'idempotency-key': `tenant-create:${values.slug}`,
        },
        body: JSON.stringify({ ...values, isolationMode: 'shared_schema' }),
      });
      const json = await res.json();
      if (!res.ok || !json.success) {
        message.error(json.errors?.[0]?.message || 'Tenant creation failed');
        return;
      }
      message.success(`Provisioning started for ${json.data?.name}`);
      setOpen(false);
      form.resetFields();
      await load({ quiet: true });
      if (json.data?.id) await openDetail(json.data.id);
    } catch {
      message.error('Unable to reach the platform API');
    } finally {
      setSaving(false);
    }
  }

  async function retryTenant(id) {
    setRetryingId(id);
    try {
      const res = await fetch(`/api/v1/platform/tenants/${id}/retry-provisioning`, {
        method: 'POST',
        headers: { 'idempotency-key': `tenant-retry:${id}:${crypto.randomUUID()}` },
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.errors?.[0]?.message || 'Retry failed');
        return;
      }
      message.success('Provisioning retry queued');
      await load({ quiet: true });
      await loadDetail(id, { quiet: true });
    } catch {
      message.error('Unable to retry provisioning');
    } finally {
      setRetryingId(null);
    }
  }

  async function onLogout() {
    await fetch('/api/v1/platform/auth/logout', { method: 'POST' });
    router.replace('/platform/login');
  }

  async function refreshAll() {
    await load();
    if (selectedId) await loadDetail(selectedId, { quiet: true });
  }

  const columns = [
    {
      title: 'Organization',
      dataIndex: 'name',
      render: (name, tenant) => (
        <Space direction="vertical" size={0}>
          <Text strong>{name}</Text>
          <Text type="secondary">{tenant.slug}</Text>
        </Space>
      ),
    },
    {
      title: 'Isolation',
      dataIndex: 'isolation_mode',
      render: (mode) => (
        <Tag icon={<DatabaseOutlined />} color="geekblue">
          {mode === 'dedicated_database' ? 'Dedicated database' : 'Shared DB · isolated schema'}
        </Tag>
      ),
    },
    {
      title: 'Provisioning',
      width: 250,
      render: (_, tenant) => {
        const step = tenant.provisioning_current_step || 'registered';
        const jobStatus = tenant.provisioning_job_status;
        return (
          <Space direction="vertical" size={2} style={{ width: '100%' }}>
            <Space>
              {['queued', 'running', 'retrying'].includes(jobStatus) ? <SyncOutlined spin /> : null}
              <Text>{STEP_LABELS[step] || step.replaceAll('_', ' ')}</Text>
            </Space>
            <Progress
              percent={provisionPercent(step, jobStatus)}
              size="small"
              status={
                jobStatus === 'failed'
                  ? 'exception'
                  : jobStatus === 'completed'
                    ? 'success'
                    : 'active'
              }
              showInfo={false}
            />
          </Space>
        );
      },
    },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => <Tag color={statusColor(status)}>{status.toUpperCase()}</Tag>,
    },
    {
      title: 'Migration',
      dataIndex: 'migration_version',
      responsive: ['lg'],
      render: (value) => value || 'Pending',
    },
    {
      title: 'Created',
      dataIndex: 'created_at',
      responsive: ['xl'],
      render: formatDate,
    },
    {
      title: '',
      key: 'actions',
      width: 110,
      render: (_, tenant) => (
        <Space>
          <Tooltip title="View isolation and provisioning details">
            <Button icon={<EyeOutlined />} onClick={() => openDetail(tenant.id)} />
          </Tooltip>
          {tenant.status === 'failed' ? (
            <Tooltip title="Retry safely from the last idempotent step">
              <Button
                type="primary"
                icon={<ReloadOutlined />}
                loading={retryingId === tenant.id}
                onClick={() => retryTenant(tenant.id)}
              />
            </Tooltip>
          ) : null}
        </Space>
      ),
    },
  ];

  const latestJob = selected?.provisioningJobs?.[0];
  const activeStep = STEP_ORDER.indexOf(latestJob?.current_step);
  const stepItems = STEP_ORDER.map((key, index) => ({
    title: STEP_LABELS[key],
    status:
      latestJob?.status === 'failed' && index > Math.max(activeStep, 0)
        ? 'wait'
        : index < activeStep
          ? 'finish'
          : index === activeStep
            ? latestJob?.status === 'failed'
              ? 'error'
              : latestJob?.status === 'completed'
                ? 'finish'
                : 'process'
            : 'wait',
  }));

  return (
    <Layout style={{ minHeight: '100vh', background: '#f5f7fb' }}>
      <Header
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: '#111827',
          paddingInline: 24,
          boxShadow: '0 2px 10px rgba(0,0,0,.18)',
        }}
      >
        <Space>
          <CrownOutlined style={{ color: '#fbbf24', fontSize: 22 }} />
          <Title level={4} style={{ color: '#fff', margin: 0 }}>
            Platform Control Plane
          </Title>
        </Space>
        <Space>
          <Text style={{ color: '#d1d5db' }}>{me?.email}</Text>
          <Button icon={<LogoutOutlined />} onClick={onLogout}>
            Logout
          </Button>
        </Space>
      </Header>

      <Content style={{ padding: 24, maxWidth: 1400, margin: '0 auto', width: '100%' }}>
        <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 20 }}>
          <div>
            <Title level={2} style={{ marginBottom: 4 }}>
              Tenant isolation
            </Title>
            <Text type="secondary">
              Schema-per-tenant operations on the shared Neon control plane
            </Text>
          </div>
          <Space>
            <Button icon={<ReloadOutlined />} onClick={refreshAll} loading={loading}>
              Refresh
            </Button>
            <Button type="primary" icon={<PlusOutlined />} onClick={() => setOpen(true)}>
              Provision tenant
            </Button>
          </Space>
        </Space>

        <Row gutter={[16, 16]} style={{ marginBottom: 20 }}>
          <Col xs={12} lg={6}>
            <Card><Statistic title="Total tenants" value={stats.total} prefix={<DatabaseOutlined />} /></Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card><Statistic title="Active" value={stats.active} valueStyle={{ color: '#15803d' }} /></Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card><Statistic title="Provisioning" value={stats.provisioning} valueStyle={{ color: '#1d4ed8' }} /></Card>
          </Col>
          <Col xs={12} lg={6}>
            <Card><Statistic title="Needs attention" value={stats.failed} valueStyle={{ color: '#b91c1c' }} /></Card>
          </Col>
        </Row>

        <Alert
          type="info"
          showIcon
          icon={<SafetyCertificateOutlined />}
          message="Locked isolation policy"
          description="Every tenant receives an immutable ID-based PostgreSQL schema, forced row-level policies, independently tracked migrations and encrypted channel configuration. Slugs are routing labels and never select a database schema."
          style={{ marginBottom: 20 }}
        />

        {error ? <Alert type="error" message={error} showIcon style={{ marginBottom: 16 }} /> : null}
        <Card styles={{ body: { padding: 0 } }}>
          <Table
            rowKey="id"
            loading={loading}
            columns={columns}
            dataSource={tenants}
            pagination={{ pageSize: 20, showSizeChanger: false }}
            scroll={{ x: 1050 }}
          />
        </Card>
      </Content>

      <Modal
        title="Provision an isolated tenant"
        open={open}
        onCancel={() => setOpen(false)}
        onOk={() => form.submit()}
        okText="Start provisioning"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Alert
          type="success"
          showIcon
          message="Shared Neon database · dedicated tenant schema"
          description="The platform generates an immutable schema from the tenant UUID, applies all migrations, seeds the first administrator and initializes the encrypted channel vault."
          style={{ marginBottom: 18 }}
        />
        <Form form={form} layout="vertical" onFinish={onCreate} requiredMark={false}>
          <Form.Item label="Organization name" name="name" rules={[{ required: true }]}>
            <Input placeholder="Acme Developers" autoFocus />
          </Form.Item>
          <Form.Item
            label="Tenant slug"
            name="slug"
            extra="Used for login and URLs only. It does not determine the database schema."
            rules={[
              { required: true },
              {
                pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/,
                message: 'Use lowercase letters, numbers and hyphens',
              },
            ]}
          >
            <Input placeholder="acme-developers" />
          </Form.Item>
          <Form.Item
            label="Initial administrator email"
            name="adminEmail"
            rules={[{ required: true }, { type: 'email' }]}
          >
            <Input placeholder="admin@acme.example" />
          </Form.Item>
          <Form.Item label="Administrator name" name="adminName">
            <Input placeholder="Tenant Administrator" />
          </Form.Item>
        </Form>
      </Modal>

      <Drawer
        title={selected?.name || 'Tenant details'}
        open={Boolean(selected)}
        onClose={closeDetail}
        width={620}
        loading={detailLoading}
        extra={
          selected?.status === 'failed' ? (
            <Button
              type="primary"
              icon={<ReloadOutlined />}
              loading={retryingId === selected.id}
              onClick={() => retryTenant(selected.id)}
            >
              Retry provisioning
            </Button>
          ) : null
        }
      >
        {selected?.id && !detailLoading ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            {latestJob?.status === 'failed' ? (
              <Alert
                type="error"
                showIcon
                message={latestJob.error_code || 'Provisioning failed'}
                description={latestJob.error_message || 'Review the worker logs and retry safely.'}
              />
            ) : null}

            <Descriptions bordered size="small" column={1}>
              <Descriptions.Item label="Tenant ID"><Text copyable>{selected.id}</Text></Descriptions.Item>
              <Descriptions.Item label="Slug">{selected.slug}</Descriptions.Item>
              <Descriptions.Item label="Status"><Tag color={statusColor(selected.status)}>{selected.status}</Tag></Descriptions.Item>
              <Descriptions.Item label="Isolation mode">Shared database · dedicated schema</Descriptions.Item>
              <Descriptions.Item label="Schema"><Text copyable>{selected.schema_name}</Text></Descriptions.Item>
              <Descriptions.Item label="Migration version">{selected.migration_version || 'Pending'}</Descriptions.Item>
              <Descriptions.Item label="Data location">{selected.data_location_status}</Descriptions.Item>
              <Descriptions.Item label="Created">{formatDate(selected.created_at)}</Descriptions.Item>
            </Descriptions>

            <Card title="Latest provisioning attempt" size="small">
              <Steps direction="vertical" size="small" items={stepItems} />
              {latestJob ? (
                <Paragraph type="secondary" style={{ marginBottom: 0 }}>
                  Attempt {latestJob.attempt_count} · Started {formatDate(latestJob.started_at)} · Finished {formatDate(latestJob.finished_at)}
                </Paragraph>
              ) : null}
            </Card>

            <Card title="Channel credential vault" size="small">
              {selected.channels?.length ? (
                selected.channels.map((channel) => (
                  <Descriptions key={channel.channel_type} size="small" column={1} bordered>
                    <Descriptions.Item label="Channel">{channel.channel_type}</Descriptions.Item>
                    <Descriptions.Item label="Provider">{channel.provider}</Descriptions.Item>
                    <Descriptions.Item label="Verification">
                      <Tag color={channel.verification_status === 'verified' ? 'green' : 'default'}>
                        {channel.verification_status}
                      </Tag>
                    </Descriptions.Item>
                    <Descriptions.Item label="Key version">{channel.encryption_key_version}</Descriptions.Item>
                  </Descriptions>
                ))
              ) : (
                <Text type="secondary">Vault initialization is pending.</Text>
              )}
            </Card>
          </Space>
        ) : null}
      </Drawer>
    </Layout>
  );
}
