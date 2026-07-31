'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Alert,
  Avatar,
  Button,
  Card,
  Descriptions,
  Divider,
  Drawer,
  Dropdown,
  Empty,
  Form,
  Input,
  InputNumber,
  Layout,
  Menu,
  Modal,
  Progress,
  Select,
  Space,
  Spin,
  Switch,
  Table,
  Tabs,
  Tag,
  Tooltip,
  Typography,
  message,
} from 'antd';
import {
  ApartmentOutlined,
  AuditOutlined,
  CheckCircleFilled,
  CloudServerOutlined,
  CreditCardOutlined,
  CrownOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeleteOutlined,
  DownOutlined,
  EditOutlined,
  ExclamationCircleOutlined,
  ExportOutlined,
  EyeOutlined,
  FileProtectOutlined,
  GlobalOutlined,
  InfoCircleOutlined,
  KeyOutlined,
  LockOutlined,
  LogoutOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MoreOutlined,
  PauseCircleOutlined,
  PlayCircleOutlined,
  PlusOutlined,
  ReloadOutlined,
  SafetyCertificateOutlined,
  SearchOutlined,
  SettingOutlined,
  StopOutlined,
  TeamOutlined,
  UserOutlined,
  WarningFilled,
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
import styles from './PlatformControlCenter.module.css';

const { Header, Sider, Content } = Layout;
const { Title, Text, Paragraph } = Typography;
const JOB_PAGE_SIZE = 15;
const AUDIT_PAGE_SIZE = 25;

const MODULE_OPTIONS = [
  { value: 'projects', label: 'Projects & planning' },
  { value: 'crm', label: 'CRM & bookings' },
  { value: 'progress', label: 'Construction progress' },
  { value: 'notifications', label: 'Notifications' },
  { value: 'billing', label: 'Billing & receipts' },
  { value: 'finance', label: 'Finance' },
  { value: 'inventory', label: 'Inventory' },
  { value: 'procurement', label: 'Procurement' },
  { value: 'dashboards', label: 'Dashboards' },
  { value: 'ai', label: 'AI copilot' },
  { value: 'hrms', label: 'HRMS' },
  { value: 'mobile', label: 'Mobile application' },
];

const EMPTY = {
  summary: {
    total: 0,
    active: 0,
    provisioning: 0,
    failed: 0,
    suspended: 0,
    subscribed: 0,
    without_plan: 0,
    trials: 0,
    soft_deleted: 0,
    purged: 0,
  },
  tenants: [],
  platformUsers: [],
  plans: [],
  subscriptions: [],
  provisioningJobs: [],
  provisioningJobsPage: { page: 1, pageSize: JOB_PAGE_SIZE, total: 0, totalPages: 1 },
  channels: [],
  featureFlags: [],
  exportJobs: [],
  deletionJobs: [],
  recentAudit: [],
};

const EMPTY_OPS = {
  status: 'loading',
  checkedAt: null,
  services: {},
  queues: [],
  tenants: {},
  provisioning: {},
  offboarding: {},
  recentFailures: [],
  heartbeats: [],
};

const EMPTY_AUDIT = {
  rows: [],
  actions: [],
  page: { page: 1, pageSize: AUDIT_PAGE_SIZE, total: 0, totalPages: 1 },
};

const NAV_ITEMS = [
  { key: 'overview', icon: <DashboardOutlined />, label: 'Overview' },
  { key: 'organizations', icon: <ApartmentOutlined />, label: 'Organizations' },
  { key: 'commercial', icon: <CreditCardOutlined />, label: 'Plans & subscriptions' },
  { key: 'features', icon: <SettingOutlined />, label: 'Feature controls' },
  { key: 'operations', icon: <CloudServerOutlined />, label: 'Operations' },
  { key: 'audit', icon: <AuditOutlined />, label: 'Audit & access' },
];

const PAGE_META = {
  overview: {
    title: 'Platform overview',
    description: 'Monitor company health, commercial coverage and platform operations from one place.',
  },
  organizations: {
    title: 'Organizations',
    description: 'Provision, support, suspend and safely offboard every company using Hippo Build.',
  },
  commercial: {
    title: 'Plans & subscriptions',
    description: 'Define commercial plans, entitlements and the current subscription for each company.',
  },
  features: {
    title: 'Feature controls',
    description: 'Apply emergency global controls or targeted company overrides with a recorded reason.',
  },
  operations: {
    title: 'Platform operations',
    description: 'Inspect services, queues, provisioning, exports and scheduled data lifecycle work.',
  },
  audit: {
    title: 'Audit & access',
    description: 'Review every platform-level change and the administrators allowed to perform it.',
  },
};

function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
    hour: options.dateOnly ? undefined : '2-digit',
    minute: options.dateOnly ? undefined : '2-digit',
  });
}

function relativeTime(value) {
  if (!value) return '—';
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

function dateInput(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function toIsoDate(value) {
  if (!value) return null;
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function formatCurrency(cents, currency = 'INR') {
  if (!cents) return 'Custom';
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(Number(cents) / 100);
}

function formatBytes(value) {
  const bytes = Number(value || 0);
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function initials(value) {
  return String(value || 'HB')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((item) => item[0]?.toUpperCase())
    .join('');
}

function sentence(value) {
  return String(value || '—')
    .replaceAll('_', ' ')
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function subscriptionColor(status) {
  if (status === 'active') return 'green';
  if (status === 'trial') return 'blue';
  if (status === 'scheduled') return 'purple';
  if (status === 'paused') return 'orange';
  if (status === 'cancelled' || status === 'expired') return 'default';
  return 'default';
}

function subscriptionLabel(status) {
  return (
    {
      scheduled: 'Scheduled',
      active: 'Active',
      trial: 'Trial',
      paused: 'Paused',
      expired: 'Expired',
      cancelled: 'Cancelled',
    }[status] || sentence(status || 'Not assigned')
  );
}

function healthDefinition(status) {
  if (status === 'healthy') return { label: 'Healthy', color: 'green', tone: 'healthy' };
  if (status === 'critical') return { label: 'Needs attention', color: 'red', tone: 'critical' };
  if (status === 'paused') return { label: 'Paused', color: 'orange', tone: 'attention' };
  return { label: 'Review', color: 'gold', tone: 'attention' };
}

function serviceDefinition(status) {
  if (status === 'healthy' || status === 'ready') {
    return { label: 'Healthy', color: 'green', tone: 'healthy' };
  }
  if (status === 'loading') return { label: 'Checking', color: 'blue', tone: 'attention' };
  if (status === 'stopped') return { label: 'Stopped', color: 'default', tone: 'attention' };
  if (status === 'missing' || status === 'stale' || status === 'degraded') {
    return { label: sentence(status), color: 'gold', tone: 'attention' };
  }
  return { label: 'Unavailable', color: 'red', tone: 'critical' };
}

function flagValue(value) {
  if (value === true) return <Tag color="green">Forced on</Tag>;
  if (value === false) return <Tag color="red">Forced off</Tag>;
  return <Tag>Not forced</Tag>;
}

async function readJsonResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  const json = contentType.includes('application/json') ? await response.json() : null;
  if (!response.ok) {
    const error = new Error(json?.errors?.[0]?.message || `Request failed (${response.status})`);
    error.status = response.status;
    error.payload = json;
    throw error;
  }
  return json?.data;
}

async function apiRequest(url, options = {}) {
  const headers = { ...(options.headers || {}) };
  if (options.body && !headers['content-type']) headers['content-type'] = 'application/json';
  const response = await fetch(url, { cache: 'no-store', ...options, headers });
  return readJsonResponse(response);
}

function KpiCard({ label, value, hint, icon, tone = 'blue' }) {
  const toneClass = {
    blue: styles.iconBlue,
    green: styles.iconGreen,
    amber: styles.iconAmber,
    red: styles.iconRed,
  }[tone];
  return (
    <Card className={styles.kpiCard}>
      <div className={styles.kpiContent}>
        <div>
          <span className={styles.kpiLabel}>{label}</span>
          <div className={styles.kpiValue}>{value}</div>
          <span className={styles.kpiHint}>{hint}</span>
        </div>
        <div className={`${styles.kpiIcon} ${toneClass}`}>{icon}</div>
      </div>
    </Card>
  );
}

function ServiceTile({ name, service, metric, meta }) {
  const definition = serviceDefinition(service?.status || 'loading');
  const dotClass = {
    healthy: styles.statusHealthy,
    attention: styles.statusAttention,
    critical: styles.statusCritical,
  }[definition.tone];
  return (
    <div className={styles.healthTile}>
      <div className={styles.healthTop}>
        <span className={styles.healthName}>{name}</span>
        <Tooltip title={definition.label}>
          <span className={`${styles.statusDot} ${dotClass}`} />
        </Tooltip>
      </div>
      <span className={styles.healthMetric}>{metric || definition.label}</span>
      <span className={styles.healthMeta}>{meta || 'No additional details'}</span>
    </div>
  );
}

function CompanyCell({ tenant }) {
  return (
    <div className={styles.companyCell}>
      <Avatar className={styles.companyAvatar} shape="square">
        {initials(tenant.name)}
      </Avatar>
      <div>
        <span className={styles.companyName}>{tenant.name}</span>
        <span className={styles.companySlug}>{tenant.slug}</span>
      </div>
    </div>
  );
}

function HealthLabel({ status }) {
  const definition = healthDefinition(status);
  const dotClass = {
    healthy: styles.statusHealthy,
    attention: styles.statusAttention,
    critical: styles.statusCritical,
  }[definition.tone];
  return (
    <span className={styles.healthLabel}>
      <span className={`${styles.statusDot} ${dotClass}`} />
      {definition.label}
    </span>
  );
}

export default function PlatformControlCenter() {
  const router = useRouter();
  const requestSequence = useRef(0);
  const mainController = useRef(null);
  const opsController = useRef(null);
  const auditController = useRef(null);

  const [me, setMe] = useState(null);
  const [data, setData] = useState(EMPTY);
  const [ops, setOps] = useState(EMPTY_OPS);
  const [audit, setAudit] = useState(EMPTY_AUDIT);
  const [loading, setLoading] = useState(true);
  const [opsLoading, setOpsLoading] = useState(false);
  const [auditLoading, setAuditLoading] = useState(false);
  const [error, setError] = useState('');
  const [activeView, setActiveView] = useState('overview');
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [planModal, setPlanModal] = useState({ open: false, plan: null });
  const [subscriptionModal, setSubscriptionModal] = useState({ open: false, subscription: null });
  const [flagModal, setFlagModal] = useState({ open: false, flag: null, tenantId: null });
  const [tenantAction, setTenantAction] = useState({ open: false, type: null, tenant: null });
  const [selectedId, setSelectedId] = useState(null);
  const [selectedHealth, setSelectedHealth] = useState(null);
  const [selectedHealthLoading, setSelectedHealthLoading] = useState(false);
  const [selectedAudit, setSelectedAudit] = useState(null);
  const [saving, setSaving] = useState(false);
  const [retryingId, setRetryingId] = useState(null);
  const [jobPage, setJobPage] = useState(1);
  const [companySearch, setCompanySearch] = useState('');
  const [companyStatus, setCompanyStatus] = useState('all');
  const [companyPlan, setCompanyPlan] = useState('all');
  const [auditSearch, setAuditSearch] = useState('');
  const [auditAction, setAuditAction] = useState('all');

  const [createForm] = Form.useForm();
  const [planForm] = Form.useForm();
  const [subscriptionForm] = Form.useForm();
  const [flagForm] = Form.useForm();
  const [actionForm] = Form.useForm();

  const isSuperAdmin = me?.role === 'super_admin';
  const roleLabel =
    me?.role === 'super_admin'
      ? 'Super administrator'
      : me?.role === 'support'
        ? 'Support operator'
        : sentence(me?.role || 'platform user');

  function requireWriteAccess() {
    if (isSuperAdmin) return true;
    message.warning(
      'Your platform role is read-only. A super administrator must perform this action.',
    );
    return false;
  }

  const load = useCallback(
    async ({ quiet = false, page = jobPage } = {}) => {
      const sequence = ++requestSequence.current;
      mainController.current?.abort();
      const controller = new AbortController();
      mainController.current = controller;
      if (!quiet) setLoading(true);
      setError('');

      try {
        const meResponse = await fetch('/api/v1/platform/auth/me', {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (meResponse.status === 401) {
          router.replace('/platform/login');
          return;
        }
        const meJson = await meResponse.json();
        if (sequence !== requestSequence.current) return;
        if (!meResponse.ok) throw new Error(meJson.errors?.[0]?.message || 'Authentication failed');
        setMe(meJson.data?.user || null);

        const params = new URLSearchParams({
          jobsPage: String(page),
          jobsPageSize: String(JOB_PAGE_SIZE),
        });
        const overview = await apiRequest(`/api/v1/platform/control-center?${params}`, {
          signal: controller.signal,
        });
        if (sequence !== requestSequence.current) return;
        setData({ ...EMPTY, ...(overview || {}) });
      } catch (loadError) {
        if (loadError.name !== 'AbortError' && sequence === requestSequence.current) {
          setError(loadError.message || 'Unable to load the platform console');
        }
      } finally {
        if (sequence === requestSequence.current) setLoading(false);
      }
    },
    [jobPage, router],
  );

  const loadOps = useCallback(async ({ quiet = false } = {}) => {
    opsController.current?.abort();
    const controller = new AbortController();
    opsController.current = controller;
    if (!quiet) setOpsLoading(true);
    try {
      const result = await apiRequest('/api/v1/platform/ops', { signal: controller.signal });
      setOps({ ...EMPTY_OPS, ...(result || {}) });
    } catch (opsError) {
      if (opsError.name !== 'AbortError') {
        setOps((current) => ({
          ...current,
          status: 'attention',
          services: {
            ...current.services,
            web: { status: 'unavailable', error: opsError.message },
          },
        }));
      }
    } finally {
      if (!controller.signal.aborted) setOpsLoading(false);
    }
  }, []);

  const loadAudit = useCallback(
    async ({ page = 1, quiet = false } = {}) => {
      auditController.current?.abort();
      const controller = new AbortController();
      auditController.current = controller;
      if (!quiet) setAuditLoading(true);
      try {
        const params = new URLSearchParams({
          page: String(page),
          pageSize: String(AUDIT_PAGE_SIZE),
        });
        if (auditSearch.trim()) params.set('search', auditSearch.trim());
        if (auditAction !== 'all') params.set('action', auditAction);
        const result = await apiRequest(`/api/v1/platform/audit?${params}`, {
          signal: controller.signal,
        });
        setAudit({ ...EMPTY_AUDIT, ...(result || {}) });
      } catch (auditError) {
        if (auditError.name !== 'AbortError') message.error(auditError.message);
      } finally {
        if (!controller.signal.aborted) setAuditLoading(false);
      }
    },
    [auditAction, auditSearch],
  );

  useEffect(() => {
    load();
    return () => {
      requestSequence.current += 1;
      mainController.current?.abort();
      opsController.current?.abort();
      auditController.current?.abort();
    };
  }, [load]);

  useEffect(() => {
    if (activeView === 'overview' || activeView === 'operations') loadOps();
    if (activeView === 'audit') loadAudit();
  }, [activeView, loadAudit, loadOps]);

  const hasSetupWork = data.tenants.some(isSetupInProgress);
  useEffect(() => {
    if (!hasSetupWork) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      await load({ quiet: true });
      if (!cancelled) timer = setTimeout(poll, 4000);
    };
    timer = setTimeout(poll, 4000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [hasSetupWork, load]);

  useEffect(() => {
    if (!['overview', 'operations'].includes(activeView)) return undefined;
    let cancelled = false;
    let timer;
    const poll = async () => {
      await loadOps({ quiet: true });
      if (!cancelled) timer = setTimeout(poll, 15000);
    };
    timer = setTimeout(poll, 15000);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [activeView, loadOps]);

  const selected = useMemo(
    () => data.tenants.find((tenant) => tenant.id === selectedId) || null,
    [data.tenants, selectedId],
  );

  useEffect(() => {
    if (!selectedId) {
      setSelectedHealth(null);
      return;
    }
    let cancelled = false;
    setSelectedHealthLoading(true);
    apiRequest(`/api/v1/platform/tenants/${selectedId}/health`)
      .then((result) => {
        if (!cancelled) setSelectedHealth(result);
      })
      .catch((healthError) => {
        if (!cancelled) message.error(healthError.message);
      })
      .finally(() => {
        if (!cancelled) setSelectedHealthLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedId]);

  const selectedChannels = useMemo(
    () => data.channels.filter((channel) => channel.tenant_id === selectedId),
    [data.channels, selectedId],
  );
  const selectedFlags = useMemo(
    () =>
      data.featureFlags.filter(
        (flag) => flag.tenant_id === null || flag.tenant_id === selectedId,
      ),
    [data.featureFlags, selectedId],
  );
  const selectedSubscription = useMemo(
    () =>
      selected?.subscription_id
        ? data.subscriptions.find((item) => item.id === selected.subscription_id) || null
        : null,
    [data.subscriptions, selected],
  );

  const filteredTenants = useMemo(() => {
    const query = companySearch.trim().toLowerCase();
    return data.tenants.filter((tenant) => {
      const matchesSearch =
        !query ||
        tenant.name.toLowerCase().includes(query) ||
        tenant.slug.toLowerCase().includes(query) ||
        tenant.plan_name?.toLowerCase().includes(query);
      const matchesStatus = companyStatus === 'all' || tenant.status === companyStatus;
      const matchesPlan =
        companyPlan === 'all' ||
        (companyPlan === 'unassigned' ? !tenant.plan_id : tenant.plan_id === companyPlan);
      return matchesSearch && matchesStatus && matchesPlan;
    });
  }, [companyPlan, companySearch, companyStatus, data.tenants]);

  const attentionTenants = useMemo(
    () => data.tenants.filter((tenant) => tenant.health_status !== 'healthy').slice(0, 8),
    [data.tenants],
  );

  async function refreshCurrent() {
    await Promise.all([
      load(),
      ['overview', 'operations'].includes(activeView) ? loadOps() : Promise.resolve(),
      activeView === 'audit' ? loadAudit({ page: audit.page.page }) : Promise.resolve(),
    ]);
  }

  async function createTenant(values) {
    if (!requireWriteAccess()) return;
    setSaving(true);
    try {
      const result = await apiRequest('/api/v1/platform/tenants', {
        method: 'POST',
        headers: { 'idempotency-key': `tenant-create:${values.slug}` },
        body: JSON.stringify({ ...values, isolationMode: 'shared_schema' }),
      });
      message.success(`Setup started for ${result.name}`);
      setCreateOpen(false);
      createForm.resetFields();
      setSelectedId(result.id);
      setActiveView('organizations');
      setJobPage(1);
      await load({ quiet: true, page: 1 });
    } catch (createError) {
      message.error(createError.message);
    } finally {
      setSaving(false);
    }
  }

  async function retryTenant(id) {
    if (!requireWriteAccess()) return;
    setRetryingId(id);
    try {
      await apiRequest(`/api/v1/platform/tenants/${id}/retry-provisioning`, {
        method: 'POST',
        headers: { 'idempotency-key': `tenant-retry:${id}:${crypto.randomUUID()}` },
      });
      message.success('Company setup retry started');
      setJobPage(1);
      await load({ quiet: true, page: 1 });
    } catch (retryError) {
      message.error(retryError.message);
    } finally {
      setRetryingId(null);
    }
  }

  function openPlanModal(plan = null) {
    if (!requireWriteAccess()) return;
    setPlanModal({ open: true, plan });
    planForm.setFieldsValue(
      plan
        ? {
            code: plan.code,
            name: plan.name,
            description: plan.description,
            status: plan.status,
            monthlyPriceRupees: Number(plan.monthly_price_cents || 0) / 100,
            annualPriceRupees: Number(plan.annual_price_cents || 0) / 100,
            currency: plan.currency || 'INR',
            trialDays: plan.trial_days || 0,
            displayOrder: plan.display_order || 0,
            users: plan.entitlements?.users ?? 0,
            projects: plan.entitlements?.projects ?? 0,
            modules: plan.entitlements?.modules || [],
          }
        : {
            status: 'active',
            currency: 'INR',
            trialDays: 14,
            displayOrder: (data.plans.length + 1) * 10,
            users: 25,
            projects: 3,
            modules: ['projects', 'crm', 'progress', 'notifications'],
          },
    );
  }

  async function savePlan(values) {
    if (!requireWriteAccess()) return;
    setSaving(true);
    const existing = planModal.plan;
    try {
      const payload = {
        code: values.code,
        name: values.name,
        description: values.description,
        status: values.status,
        monthlyPriceCents: Math.round(Number(values.monthlyPriceRupees || 0) * 100),
        annualPriceCents: Math.round(Number(values.annualPriceRupees || 0) * 100),
        currency: values.currency,
        trialDays: values.trialDays,
        displayOrder: values.displayOrder,
        entitlements: {
          users: values.users,
          projects: values.projects,
          modules: values.modules || [],
        },
      };
      await apiRequest(
        existing ? `/api/v1/platform/plans/${existing.id}` : '/api/v1/platform/plans',
        {
          method: existing ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      message.success(existing ? 'Plan updated' : 'Plan created');
      setPlanModal({ open: false, plan: null });
      planForm.resetFields();
      await load({ quiet: true });
    } catch (planError) {
      message.error(planError.message);
    } finally {
      setSaving(false);
    }
  }

  function openSubscriptionModal(subscription = null, tenantId = null) {
    if (!requireWriteAccess()) return;
    setSubscriptionModal({ open: true, subscription });
    subscriptionForm.setFieldsValue(
      subscription
        ? {
            tenantId: subscription.tenant_id,
            planId: subscription.plan_id,
            status: subscription.status,
            startsAt: dateInput(subscription.starts_at),
            endsAt: dateInput(subscription.ends_at),
            notes: subscription.notes,
          }
        : {
            tenantId: tenantId || undefined,
            status: 'active',
            startsAt: dateInput(new Date()),
          },
    );
  }

  async function saveSubscription(values) {
    if (!requireWriteAccess()) return;
    const existing = subscriptionModal.subscription;
    setSaving(true);
    try {
      const payload = {
        tenantId: values.tenantId,
        planId: values.planId,
        status: values.status,
        startsAt: toIsoDate(values.startsAt),
        endsAt: toIsoDate(values.endsAt),
        notes: values.notes,
      };
      if (existing) delete payload.tenantId;
      await apiRequest(
        existing
          ? `/api/v1/platform/subscriptions/${existing.id}`
          : '/api/v1/platform/subscriptions',
        {
          method: existing ? 'PATCH' : 'POST',
          body: JSON.stringify(payload),
        },
      );
      message.success(existing ? 'Subscription updated' : 'Plan assigned');
      setSubscriptionModal({ open: false, subscription: null });
      subscriptionForm.resetFields();
      await load({ quiet: true });
    } catch (subscriptionError) {
      message.error(subscriptionError.message);
    } finally {
      setSaving(false);
    }
  }

  function openFlagModal(flag = null, tenantId = null) {
    if (!requireWriteAccess()) return;
    setFlagModal({ open: true, flag, tenantId });
    flagForm.setFieldsValue(
      flag
        ? {
            scope: flag.tenant_id ? 'company' : 'global',
            tenantId: flag.tenant_id || undefined,
            flagKey: flag.flag_key,
            forcedValue: flag.forced_value ? 'on' : 'off',
            reason: flag.reason,
          }
        : {
            scope: tenantId ? 'company' : 'global',
            tenantId: tenantId || undefined,
            forcedValue: 'off',
          },
    );
  }

  async function saveFlag(values) {
    if (!requireWriteAccess()) return;
    setSaving(true);
    try {
      await apiRequest('/api/v1/platform/feature-flags', {
        method: 'POST',
        body: JSON.stringify({
          tenantId: values.scope === 'company' ? values.tenantId : null,
          flagKey: values.flagKey,
          forcedValue: values.forcedValue === 'on',
          reason: values.reason,
        }),
      });
      message.success(flagModal.flag ? 'Feature control updated' : 'Feature control applied');
      setFlagModal({ open: false, flag: null, tenantId: null });
      flagForm.resetFields();
      await load({ quiet: true });
    } catch (flagError) {
      message.error(flagError.message);
    } finally {
      setSaving(false);
    }
  }

  async function deleteFlag(flag) {
    if (!requireWriteAccess()) return;
    setSaving(true);
    try {
      await apiRequest(`/api/v1/platform/feature-flags?id=${flag.id}`, { method: 'DELETE' });
      message.success('Feature control removed');
      await load({ quiet: true });
    } catch (flagError) {
      message.error(flagError.message);
    } finally {
      setSaving(false);
    }
  }

  function openTenantAction(type, tenant) {
    if (!requireWriteAccess()) return;
    setTenantAction({ open: true, type, tenant });
    actionForm.resetFields();
    actionForm.setFieldsValue({
      retentionDays: 30,
      legalHold: false,
    });
  }

  async function exportTenant(tenant) {
    if (!requireWriteAccess()) return;
    setSaving(true);
    try {
      const response = await fetch(`/api/v1/platform/tenants/${tenant.id}/export`, {
        method: 'POST',
      });
      if (!response.ok) {
        await readJsonResponse(response);
        return;
      }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') || '';
      const matched = disposition.match(/filename="([^"]+)"/);
      const filename = matched?.[1] || `${tenant.slug}-export.json`;
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = filename;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
      message.success('Verified company export downloaded');
      await load({ quiet: true });
    } catch (exportError) {
      message.error(exportError.message || 'Company export failed');
    } finally {
      setSaving(false);
    }
  }

  async function submitTenantAction(values) {
    if (!requireWriteAccess()) return;
    const { type, tenant } = tenantAction;
    if (!tenant) return;
    setSaving(true);
    try {
      if (type === 'suspend' || type === 'resume') {
        const status = type === 'suspend' ? 'suspended' : 'active';
        const result = await apiRequest(`/api/v1/platform/tenants/${tenant.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status, reason: values.reason }),
        });
        message.success(
          type === 'suspend'
            ? `Company suspended; ${result.revokedSessions || 0} sessions revoked`
            : 'Company resumed',
        );
      } else if (type === 'revoke') {
        const result = await apiRequest(
          `/api/v1/platform/tenants/${tenant.id}/revoke-sessions`,
          {
            method: 'POST',
            body: JSON.stringify({ reason: values.reason }),
          },
        );
        message.success(`${result.revokedSessions || 0} active sessions revoked`);
      } else if (type === 'offboard' || type === 'purge' || type === 'release_hold') {
        const result = await apiRequest(`/api/v1/platform/tenants/${tenant.id}/delete`, {
          method: 'POST',
          body: JSON.stringify({
            mode:
              type === 'offboard'
                ? 'soft_delete'
                : type === 'purge'
                  ? 'purge'
                  : 'release_hold',
            reason: values.reason,
            legalHold: Boolean(values.legalHold),
            retentionDays: values.retentionDays,
            confirmation: values.confirmation,
          }),
        });
        message.success(
          type === 'offboard'
            ? 'Company offboarded into the recovery window'
            : type === 'release_hold'
              ? 'Legal hold released; permanent purge can now be scheduled'
              : `Permanent purge scheduled for ${formatDate(result.scheduled_for)}`,
        );
        if (type === 'offboard') setSelectedId(null);
      }
      setTenantAction({ open: false, type: null, tenant: null });
      actionForm.resetFields();
      await Promise.all([load({ quiet: true }), loadOps({ quiet: true })]);
    } catch (actionError) {
      message.error(actionError.message);
    } finally {
      setSaving(false);
    }
  }

  async function logout() {
    await fetch('/api/v1/platform/auth/logout', { method: 'POST' });
    router.replace('/platform/login');
  }

  function changeView(key) {
    setActiveView(key);
    setMobileNavOpen(false);
  }

  function toggleNavigation() {
    if (typeof window !== 'undefined' && window.matchMedia('(max-width: 720px)').matches) {
      setMobileNavOpen(true);
      return;
    }
    setCollapsed((value) => !value);
  }

  function companyActionItems(tenant) {
    const viewItem = { key: 'view', icon: <EyeOutlined />, label: 'Open company details' };
    if (!isSuperAdmin) {
      return {
        items: [viewItem],
        onClick: ({ key, domEvent }) => {
          domEvent?.stopPropagation();
          if (key === 'view') setSelectedId(tenant.id);
        },
      };
    }

    const ready = ['active', 'suspended'].includes(tenant.status);
    const lifecycleItem =
      tenant.status === 'suspended'
        ? { key: 'resume', icon: <PlayCircleOutlined />, label: 'Resume company' }
        : tenant.status === 'active'
          ? { key: 'suspend', icon: <PauseCircleOutlined />, label: 'Suspend company' }
          : {
              key: 'lifecycle_unavailable',
              icon: <PauseCircleOutlined />,
              label: 'Lifecycle actions unavailable during setup',
              disabled: true,
            };
    const items = [
      viewItem,
      {
        key: 'plan',
        icon: <CreditCardOutlined />,
        label: 'Assign or change plan',
        disabled: !ready,
      },
      { type: 'divider' },
      lifecycleItem,
      {
        key: 'revoke',
        icon: <KeyOutlined />,
        label: 'Revoke all sessions',
        disabled: !ready,
      },
      {
        key: 'export',
        icon: <ExportOutlined />,
        label: 'Export company data',
        disabled: !ready,
      },
      { type: 'divider' },
      {
        key: 'offboard',
        icon: <DeleteOutlined />,
        label: tenant.status === 'suspended' ? 'Offboard company' : 'Suspend before offboarding',
        disabled: tenant.status !== 'suspended',
        danger: true,
      },
    ];
    return {
      items,
      onClick: ({ key, domEvent }) => {
        domEvent?.stopPropagation();
        if (key === 'view') setSelectedId(tenant.id);
        if (key === 'plan') openSubscriptionModal(null, tenant.id);
        if (['suspend', 'resume', 'revoke', 'offboard'].includes(key)) {
          openTenantAction(key, tenant);
        }
        if (key === 'export') exportTenant(tenant);
      },
    };
  }

  const organizationColumns = [
    {
      title: 'Company',
      key: 'company',
      render: (_, tenant) => <CompanyCell tenant={tenant} />,
    },
    {
      title: 'Health',
      dataIndex: 'health_status',
      width: 150,
      render: (value) => <HealthLabel status={value} />,
    },
    {
      title: 'Lifecycle',
      dataIndex: 'status',
      width: 130,
      render: (status) => (
        <Tag color={tenantStatusColor(status)}>{tenantStatusLabel(status)}</Tag>
      ),
    },
    {
      title: 'Plan',
      width: 180,
      render: (_, tenant) =>
        tenant.plan_name ? (
          <Space direction="vertical" size={0}>
            <Text strong>{tenant.plan_name}</Text>
            <Text type="secondary" style={{ fontSize: 11 }}>
              {subscriptionLabel(tenant.subscription_status)}
            </Text>
          </Space>
        ) : (
          <Tag>Not assigned</Tag>
        ),
    },
    {
      title: 'Communication',
      width: 150,
      render: (_, tenant) => (
        <Space direction="vertical" size={0}>
          <Text>{tenant.channel_verified || 0} verified</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {tenant.channel_enabled || 0} enabled / {tenant.channel_total || 0} total
          </Text>
        </Space>
      ),
    },
    {
      title: 'Last change',
      dataIndex: 'updated_at',
      width: 150,
      render: (value) => (
        <Tooltip title={formatDate(value)}>
          <Text type="secondary">{relativeTime(value)}</Text>
        </Tooltip>
      ),
    },
    {
      title: '',
      key: 'actions',
      width: 56,
      fixed: 'right',
      render: (_, tenant) => (
        <Dropdown menu={companyActionItems(tenant)} trigger={['click']}>
          <Button
            type="text"
            icon={<MoreOutlined />}
            aria-label={`Actions for ${tenant.name}`}
            onClick={(event) => event.stopPropagation()}
          />
        </Dropdown>
      ),
    },
  ];

  const subscriptionColumns = [
    { title: 'Company', render: (_, item) => <CompanyCell tenant={{ name: item.tenant_name, slug: item.tenant_slug }} /> },
    { title: 'Plan', dataIndex: 'plan_name' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => <Tag color={subscriptionColor(status)}>{subscriptionLabel(status)}</Tag>,
    },
    { title: 'Starts', dataIndex: 'starts_at', render: (value) => formatDate(value, { dateOnly: true }) },
    { title: 'Ends', dataIndex: 'ends_at', render: (value) => formatDate(value, { dateOnly: true }) },
    {
      title: 'Assigned by',
      dataIndex: 'assigned_by_email',
      render: (value) => value || 'System',
    },
    {
      title: '',
      width: 60,
      render: (_, item) =>
        isSuperAdmin ? (
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={`Edit subscription for ${item.tenant_name}`}
            onClick={() => openSubscriptionModal(item)}
          />
        ) : (
          <Text type="secondary">Read only</Text>
        ),
    },
  ];

  const featureColumns = [
    {
      title: 'Feature',
      dataIndex: 'flag_key',
      render: (value) => (
        <Space direction="vertical" size={0}>
          <Text strong>{value}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            Runtime enforced
          </Text>
        </Space>
      ),
    },
    {
      title: 'Scope',
      render: (_, flag) =>
        flag.tenant_id ? (
          <Tag icon={<ApartmentOutlined />}>{flag.tenant_name}</Tag>
        ) : (
          <Tag color="blue" icon={<GlobalOutlined />}>
            All companies
          </Tag>
        ),
    },
    { title: 'Control', dataIndex: 'forced_value', render: flagValue },
    { title: 'Reason', dataIndex: 'reason', render: (value) => value || '—' },
    { title: 'Updated', dataIndex: 'updated_at', render: relativeTime },
    {
      title: '',
      width: 96,
      render: (_, flag) =>
        isSuperAdmin ? (
          <Space size={2}>
            <Button type="text" icon={<EditOutlined />} onClick={() => openFlagModal(flag)} />
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              onClick={() =>
                Modal.confirm({
                  title: 'Remove this feature control?',
                  content: 'The company-owned setting and plan entitlement will apply again immediately.',
                  okText: 'Remove control',
                  okButtonProps: { danger: true },
                  onOk: () => deleteFlag(flag),
                })
              }
            />
          </Space>
        ) : null,
    },
  ];

  const jobColumns = [
    { title: 'Company', render: (_, item) => <CompanyCell tenant={{ name: item.tenant_name, slug: item.tenant_slug }} /> },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => (
        <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'blue'}>
          {jobStatusLabel(status)}
        </Tag>
      ),
    },
    { title: 'Current step', dataIndex: 'current_step', render: setupStepLabel },
    { title: 'Attempts', dataIndex: 'attempt_count' },
    { title: 'Started', dataIndex: 'started_at', render: formatDate },
    { title: 'Finished', dataIndex: 'finished_at', render: formatDate },
    {
      title: 'Error',
      dataIndex: 'error_message',
      ellipsis: true,
      render: (value) => value || '—',
    },
  ];

  const exportColumns = [
    { title: 'Company', dataIndex: 'tenant_name' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => (
        <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'blue'}>
          {sentence(status)}
        </Tag>
      ),
    },
    { title: 'Tables', dataIndex: 'table_count' },
    { title: 'Rows', dataIndex: 'row_count' },
    { title: 'Size', dataIndex: 'byte_count', render: formatBytes },
    { title: 'Requested', dataIndex: 'requested_at', render: formatDate },
    { title: 'Completed', dataIndex: 'completed_at', render: formatDate },
  ];

  const deletionColumns = [
    { title: 'Company', render: (_, item) => <CompanyCell tenant={{ name: item.tenant_name, slug: item.tenant_slug }} /> },
    { title: 'Mode', dataIndex: 'mode', render: sentence },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => (
        <Tag color={status === 'completed' ? 'green' : status === 'failed' ? 'red' : 'blue'}>
          {sentence(status)}
        </Tag>
      ),
    },
    {
      title: 'Legal hold',
      dataIndex: 'legal_hold',
      render: (value) => (value ? <Tag color="gold">On hold</Tag> : 'No'),
    },
    { title: 'Scheduled', dataIndex: 'scheduled_for', render: formatDate },
    { title: 'Reason', dataIndex: 'reason', ellipsis: true },
    {
      title: '',
      width: 160,
      render: (_, item) => {
        if (!isSuperAdmin || item.mode !== 'soft_delete' || item.status !== 'completed') return null;
        const tenant = {
          id: item.tenant_id,
          name: item.tenant_name,
          slug: item.tenant_slug,
          status: 'suspended',
        };
        return item.legal_hold ? (
          <Button size="small" onClick={() => openTenantAction('release_hold', tenant)}>
            Release legal hold
          </Button>
        ) : (
          <Button size="small" danger onClick={() => openTenantAction('purge', tenant)}>
            Schedule purge
          </Button>
        );
      },
    },
  ];

  const auditColumns = [
    {
      title: 'Time',
      dataIndex: 'created_at',
      width: 165,
      render: (value) => (
        <Space direction="vertical" size={0}>
          <Text>{formatDate(value)}</Text>
          <Text type="secondary" style={{ fontSize: 11 }}>
            {relativeTime(value)}
          </Text>
        </Space>
      ),
    },
    {
      title: 'Action',
      dataIndex: 'action',
      render: (value) => <Tag color="blue">{sentence(value.replaceAll('.', ' '))}</Tag>,
    },
    { title: 'Company', dataIndex: 'tenant_name', render: (value) => value || 'Platform-wide' },
    { title: 'Actor', dataIndex: 'actor_email', render: (value) => value || 'System worker' },
    { title: 'Entity', render: (_, item) => `${sentence(item.entity_type)} · ${item.entity_id || '—'}` },
    {
      title: '',
      width: 70,
      render: (_, item) => (
        <Button type="text" icon={<EyeOutlined />} onClick={() => setSelectedAudit(item)} />
      ),
    },
  ];

  const adminColumns = [
    {
      title: 'Administrator',
      render: (_, user) => (
        <Space>
          <Avatar icon={<UserOutlined />} />
          <Space direction="vertical" size={0}>
            <Text strong>{user.name || 'Platform administrator'}</Text>
            <Text type="secondary">{user.email}</Text>
          </Space>
        </Space>
      ),
    },
    { title: 'Role', dataIndex: 'role', render: sentence },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (status) => <Tag color={status === 'active' ? 'green' : 'default'}>{sentence(status)}</Tag>,
    },
    { title: 'Added', dataIndex: 'created_at', render: formatDate },
  ];

  function renderOverview() {
    const summary = data.summary;
    const attention = summary.failed + summary.provisioning + summary.suspended;
    const database = ops.services.database || { status: opsLoading ? 'loading' : 'unavailable' };
    const redis = ops.services.redis || { status: opsLoading ? 'loading' : 'unavailable' };
    const worker = ops.services.worker || { status: opsLoading ? 'loading' : 'missing' };
    return (
      <>
        <div className={styles.kpiGrid}>
          <KpiCard
            label="Organizations"
            value={summary.total}
            hint={`${summary.active} active companies`}
            icon={<ApartmentOutlined />}
            tone="blue"
          />
          <KpiCard
            label="Current subscriptions"
            value={summary.subscribed}
            hint={`${summary.without_plan} companies need a plan`}
            icon={<CreditCardOutlined />}
            tone="green"
          />
          <KpiCard
            label="Active trials"
            value={summary.trials}
            hint="Included in current subscriptions"
            icon={<CrownOutlined />}
            tone="amber"
          />
          <KpiCard
            label="Requires review"
            value={attention}
            hint={`${summary.failed} setup failures`}
            icon={<ExclamationCircleOutlined />}
            tone={attention ? 'red' : 'green'}
          />
        </div>

        <div className={styles.dashboardGrid}>
          <Card
            className={`${styles.card} ${styles.tableCard}`}
            title={
              <div className={styles.cardHeader}>
                <div>
                  <span>Organizations requiring attention</span>
                  <div className={styles.cardSubtitle}>Prioritized by setup and lifecycle state</div>
                </div>
                <Button type="link" onClick={() => setActiveView('organizations')}>
                  View all
                </Button>
              </div>
            }
          >
            <Table
              rowKey="id"
              size="middle"
              columns={organizationColumns.filter((column) => !['Communication', 'Last change'].includes(column.title))}
              dataSource={attentionTenants}
              pagination={false}
              loading={loading}
              scroll={{ x: 760 }}
              rowClassName={() => styles.clickableRow}
              onRow={(tenant) => ({ onClick: () => setSelectedId(tenant.id) })}
              locale={{ emptyText: <Empty className={styles.emptyState} description="All organizations are healthy" /> }}
            />
          </Card>

          <Card
            className={styles.card}
            title="Service health"
            extra={
              <Button type="link" onClick={() => setActiveView('operations')}>
                Operations
              </Button>
            }
          >
            <Spin spinning={opsLoading && !ops.checkedAt}>
              <div className={styles.healthGrid}>
                <ServiceTile
                  name="Web application"
                  service={ops.services.web || { status: 'healthy' }}
                  metric="Online"
                  meta="Current platform console"
                />
                <ServiceTile
                  name="PostgreSQL"
                  service={database}
                  metric={database.latencyMs !== undefined ? `${database.latencyMs} ms` : undefined}
                  meta="Control-plane database"
                />
                <ServiceTile
                  name="Redis"
                  service={redis}
                  metric={redis.latencyMs !== undefined && redis.latencyMs !== null ? `${redis.latencyMs} ms` : undefined}
                  meta="Queues and cache"
                />
                <ServiceTile
                  name="Background worker"
                  service={worker}
                  metric={worker.status === 'healthy' ? 'Running' : undefined}
                  meta={worker.last_seen_at ? `Seen ${relativeTime(worker.last_seen_at)}` : 'No recent heartbeat'}
                />
              </div>
            </Spin>
          </Card>
        </div>

        <div className={styles.dashboardGrid}>
          <Card className={styles.card} title="Recent platform activity">
            {data.recentAudit.length ? (
              <div className={styles.activityList}>
                {data.recentAudit.slice(0, 8).map((item) => (
                  <div className={styles.activityItem} key={item.id}>
                    <div className={styles.activityIcon}>
                      <AuditOutlined />
                    </div>
                    <div>
                      <span className={styles.activityTitle}>{sentence(item.action.replaceAll('.', ' '))}</span>
                      <span className={styles.activityMeta}>
                        {item.tenant_name || 'Platform-wide'} · {item.actor_email || 'System worker'}
                      </span>
                    </div>
                    <span className={styles.activityTime}>{relativeTime(item.created_at)}</span>
                  </div>
                ))}
              </div>
            ) : (
              <Empty description="No platform activity recorded yet" />
            )}
          </Card>

          <Card className={styles.card} title="Commercial coverage">
            <Space direction="vertical" size="large" style={{ width: '100%' }}>
              <div>
                <div className={styles.cardHeader}>
                  <Text>Companies with a current plan</Text>
                  <Text strong>
                    {summary.total ? Math.round((summary.subscribed / summary.total) * 100) : 0}%
                  </Text>
                </div>
                <Progress
                  percent={summary.total ? Math.round((summary.subscribed / summary.total) * 100) : 0}
                  showInfo={false}
                  strokeColor="#2563eb"
                />
              </div>
              <Divider style={{ margin: 0 }} />
              <Space direction="vertical" size={10} style={{ width: '100%' }}>
                {data.plans.slice(0, 5).map((plan) => (
                  <div className={styles.cardHeader} key={plan.id}>
                    <Space>
                      <span className={`${styles.statusDot} ${styles.statusHealthy}`} />
                      <Text>{plan.name}</Text>
                    </Space>
                    <Text strong>{plan.active_subscription_count || 0}</Text>
                  </div>
                ))}
              </Space>
              <Button block onClick={() => setActiveView('commercial')}>
                Manage plans and subscriptions
              </Button>
            </Space>
          </Card>
        </div>
      </>
    );
  }

  function renderOrganizations() {
    return (
      <Card className={`${styles.card} ${styles.tableCard}`}>
        <div style={{ padding: '18px 20px 4px' }}>
          <div className={styles.toolbar}>
            <div className={styles.filters}>
              <Input
                className={styles.search}
                prefix={<SearchOutlined />}
                placeholder="Search company, slug or plan"
                value={companySearch}
                onChange={(event) => setCompanySearch(event.target.value)}
                allowClear
              />
              <Select
                value={companyStatus}
                onChange={setCompanyStatus}
                style={{ minWidth: 150 }}
                options={[
                  { value: 'all', label: 'All lifecycle states' },
                  { value: 'active', label: 'Active' },
                  { value: 'provisioning', label: 'Setting up' },
                  { value: 'failed', label: 'Needs attention' },
                  { value: 'suspended', label: 'Suspended' },
                ]}
              />
              <Select
                value={companyPlan}
                onChange={setCompanyPlan}
                style={{ minWidth: 160 }}
                options={[
                  { value: 'all', label: 'All plans' },
                  { value: 'unassigned', label: 'No plan assigned' },
                  ...data.plans.map((plan) => ({ value: plan.id, label: plan.name })),
                ]}
              />
            </div>
            <Text type="secondary">
              {filteredTenants.length} of {data.tenants.length} companies
            </Text>
          </div>
        </div>
        <Table
          rowKey="id"
          columns={organizationColumns}
          dataSource={filteredTenants}
          loading={loading}
          scroll={{ x: 1120 }}
          pagination={{ pageSize: 15, showSizeChanger: false }}
          rowClassName={() => styles.clickableRow}
          onRow={(tenant) => ({ onClick: () => setSelectedId(tenant.id) })}
          locale={{ emptyText: <Empty className={styles.emptyState} description="No organizations match these filters" /> }}
        />
      </Card>
    );
  }

  function renderCommercial() {
    return (
      <>
        <div className={styles.planGrid}>
          {data.plans.map((plan) => {
            const entitlements = plan.entitlements || {};
            return (
              <Card
                key={plan.id}
                className={`${styles.planCard} ${plan.status === 'archived' ? styles.planCardArchived : ''}`}
              >
                <div className={styles.planHeader}>
                  <div>
                    <span className={styles.planCode}>{plan.code}</span>
                    <Title level={4} className={styles.planName}>
                      {plan.name}
                    </Title>
                  </div>
                  <Space>
                    <Tag color={plan.status === 'active' ? 'green' : 'default'}>{sentence(plan.status)}</Tag>
                    {isSuperAdmin ? (
                      <Button type="text" icon={<EditOutlined />} onClick={() => openPlanModal(plan)} />
                    ) : null}
                  </Space>
                </div>
                <div className={styles.planPrice}>
                  {formatCurrency(plan.monthly_price_cents, plan.currency)}
                  {plan.monthly_price_cents ? <span className={styles.planPeriod}> / month</span> : null}
                </div>
                <Paragraph className={styles.planDescription}>
                  {plan.description || 'Commercial plan for Hippo Build organizations.'}
                </Paragraph>
                <div className={styles.entitlementList}>
                  <Tag>{entitlements.users === -1 ? 'Unlimited' : entitlements.users || 0} users</Tag>
                  <Tag>{entitlements.projects === -1 ? 'Unlimited' : entitlements.projects || 0} projects</Tag>
                  <Tag>{Array.isArray(entitlements.modules) ? entitlements.modules.length : 0} modules</Tag>
                </div>
                <div className={styles.planFooter}>
                  <Text type="secondary">{plan.active_subscription_count || 0} current companies</Text>
                  <Text type="secondary">{plan.trial_days || 0}-day trial</Text>
                </div>
              </Card>
            );
          })}
          {!data.plans.length ? <Empty description="No commercial plans have been created" /> : null}
        </div>

        <Card
          className={`${styles.card} ${styles.tableCard}`}
          title="Subscriptions"
          extra={
            isSuperAdmin ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openSubscriptionModal()}>
                Assign plan
              </Button>
            ) : null
          }
        >
          <Table
            rowKey="id"
            columns={subscriptionColumns}
            dataSource={data.subscriptions}
            loading={loading}
            scroll={{ x: 930 }}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            locale={{ emptyText: <Empty className={styles.emptyState} description="No subscriptions assigned" /> }}
          />
        </Card>
      </>
    );
  }

  function renderFeatures() {
    return (
      <>
        <div className={styles.featureIntro}>
          <FileProtectOutlined className={styles.featureIntroIcon} />
          <div>
            <span className={styles.featureIntroTitle}>Controls are enforced on every protected API request</span>
            <span className={styles.featureIntroText}>
              A global forced-off value is an emergency kill switch. Company-specific controls apply next,
              followed by the assigned plan and the company-owned setting. Every change is audited.
            </span>
          </div>
        </div>
        <Card className={`${styles.card} ${styles.tableCard}`}>
          <div style={{ padding: '18px 20px 4px' }}>
            <div className={styles.toolbar}>
              <Space>
                <Tag color="blue" icon={<GlobalOutlined />}>
                  {data.featureFlags.filter((flag) => !flag.tenant_id).length} global
                </Tag>
                <Tag icon={<ApartmentOutlined />}>
                  {data.featureFlags.filter((flag) => flag.tenant_id).length} company-specific
                </Tag>
              </Space>
              <Text type="secondary">Forced controls override tenant-owned preferences</Text>
            </div>
          </div>
          <Table
            rowKey="id"
            columns={featureColumns}
            dataSource={data.featureFlags}
            loading={loading}
            scroll={{ x: 900 }}
            pagination={{ pageSize: 15, showSizeChanger: false }}
            locale={{ emptyText: <Empty className={styles.emptyState} description="No platform feature controls are active" /> }}
          />
        </Card>
      </>
    );
  }

  function renderOperations() {
    const services = ops.services || {};
    return (
      <>
        <div className={styles.kpiGrid}>
          <KpiCard
            label="Platform status"
            value={ops.status === 'healthy' ? 'Healthy' : 'Review'}
            hint={`Checked ${ops.checkedAt ? relativeTime(ops.checkedAt) : 'now'}`}
            icon={ops.status === 'healthy' ? <CheckCircleFilled /> : <WarningFilled />}
            tone={ops.status === 'healthy' ? 'green' : 'red'}
          />
          <KpiCard
            label="Provisioning work"
            value={(ops.provisioning.queued || 0) + (ops.provisioning.running || 0)}
            hint={`${ops.provisioning.stale || 0} stale jobs`}
            icon={<CloudServerOutlined />}
            tone={ops.provisioning.stale ? 'red' : 'blue'}
          />
          <KpiCard
            label="Queue failures"
            value={ops.queues.reduce((sum, queue) => sum + Number(queue.failed || 0), 0)}
            hint="Across all worker queues"
            icon={<StopOutlined />}
            tone={ops.queues.some((queue) => queue.failed) ? 'red' : 'green'}
          />
          <KpiCard
            label="Scheduled purges"
            value={ops.offboarding.scheduled || 0}
            hint={ops.offboarding.next_scheduled_for ? `Next ${formatDate(ops.offboarding.next_scheduled_for)}` : 'No purge due'}
            icon={<DeleteOutlined />}
            tone={ops.offboarding.failed ? 'red' : 'amber'}
          />
        </div>

        <Card className={styles.card} title="Service dependencies" style={{ marginBottom: 18 }}>
          <Spin spinning={opsLoading && !ops.checkedAt}>
            <div className={styles.healthGrid}>
              <ServiceTile name="Web application" service={services.web} metric="Online" meta="Platform API and admin console" />
              <ServiceTile
                name="PostgreSQL"
                service={services.database}
                metric={services.database?.latencyMs !== undefined ? `${services.database.latencyMs} ms` : undefined}
                meta="Control plane and tenant schemas"
              />
              <ServiceTile
                name="Redis"
                service={services.redis}
                metric={services.redis?.latencyMs !== undefined && services.redis?.latencyMs !== null ? `${services.redis.latencyMs} ms` : undefined}
                meta="Queue transport and cache"
              />
              <ServiceTile
                name="Background worker"
                service={services.worker}
                metric={services.worker?.status === 'healthy' ? 'Running' : undefined}
                meta={services.worker?.last_seen_at ? `Heartbeat ${relativeTime(services.worker.last_seen_at)}` : 'Heartbeat unavailable'}
              />
            </div>
          </Spin>
        </Card>

        <div className={styles.queueGrid}>
          {ops.queues.map((queue) => (
            <Card className={styles.queueCard} key={queue.name}>
              <div className={styles.cardHeader}>
                <span className={styles.queueName}>{queue.name}</span>
                <Tag color={queue.status === 'healthy' ? 'green' : queue.status === 'attention' ? 'gold' : 'red'}>
                  {sentence(queue.status)}
                </Tag>
              </div>
              <div className={styles.queueCounts}>
                {[
                  ['waiting', queue.waiting],
                  ['active', queue.active],
                  ['failed', queue.failed],
                  ['delayed', queue.delayed],
                ].map(([label, value]) => (
                  <div className={styles.queueMetric} key={label}>
                    <strong>{value || 0}</strong>
                    <span>{label}</span>
                  </div>
                ))}
              </div>
            </Card>
          ))}
        </div>

        <Tabs
          items={[
            {
              key: 'provisioning',
              label: 'Provisioning activity',
              children: (
                <Card className={`${styles.card} ${styles.tableCard}`}>
                  <Table
                    rowKey="id"
                    columns={jobColumns}
                    dataSource={data.provisioningJobs}
                    loading={loading}
                    scroll={{ x: 1050 }}
                    pagination={{
                      current: data.provisioningJobsPage.page,
                      pageSize: data.provisioningJobsPage.pageSize,
                      total: data.provisioningJobsPage.total,
                      showSizeChanger: false,
                      onChange: (page) => {
                        setJobPage(page);
                        load({ page });
                      },
                    }}
                    locale={{ emptyText: <Empty className={styles.emptyState} description="No provisioning activity" /> }}
                  />
                </Card>
              ),
            },
            {
              key: 'exports',
              label: 'Data exports',
              children: (
                <Card className={`${styles.card} ${styles.tableCard}`}>
                  <Table
                    rowKey="id"
                    columns={exportColumns}
                    dataSource={data.exportJobs}
                    scroll={{ x: 900 }}
                    pagination={{ pageSize: 15, showSizeChanger: false }}
                    locale={{ emptyText: <Empty className={styles.emptyState} description="No company exports" /> }}
                  />
                </Card>
              ),
            },
            {
              key: 'offboarding',
              label: 'Offboarding & purge',
              children: (
                <Card className={`${styles.card} ${styles.tableCard}`}>
                  <Table
                    rowKey="id"
                    columns={deletionColumns}
                    dataSource={data.deletionJobs}
                    scroll={{ x: 1050 }}
                    pagination={{ pageSize: 15, showSizeChanger: false }}
                    locale={{ emptyText: <Empty className={styles.emptyState} description="No offboarding work" /> }}
                  />
                </Card>
              ),
            },
          ]}
        />
      </>
    );
  }

  function renderAudit() {
    return (
      <div className={styles.dashboardGrid} style={{ gridTemplateColumns: 'minmax(0, 1.6fr) minmax(330px, 0.6fr)' }}>
        <Card className={`${styles.card} ${styles.tableCard}`}>
          <div style={{ padding: '18px 20px 4px' }}>
            <div className={styles.toolbar}>
              <div className={styles.filters}>
                <Input
                  className={styles.search}
                  prefix={<SearchOutlined />}
                  placeholder="Search action, actor, company or entity"
                  value={auditSearch}
                  onChange={(event) => setAuditSearch(event.target.value)}
                  onPressEnter={() => loadAudit({ page: 1 })}
                  allowClear
                />
                <Select
                  value={auditAction}
                  onChange={setAuditAction}
                  style={{ minWidth: 190 }}
                  options={[
                    { value: 'all', label: 'All actions' },
                    ...audit.actions.map((action) => ({ value: action, label: sentence(action.replaceAll('.', ' ')) })),
                  ]}
                />
                <Button onClick={() => loadAudit({ page: 1 })}>Apply filters</Button>
              </div>
              <Text type="secondary">{audit.page.total} recorded changes</Text>
            </div>
          </div>
          <Table
            rowKey="id"
            columns={auditColumns}
            dataSource={audit.rows}
            loading={auditLoading}
            scroll={{ x: 980 }}
            pagination={{
              current: audit.page.page,
              pageSize: audit.page.pageSize,
              total: audit.page.total,
              showSizeChanger: false,
              onChange: (page) => loadAudit({ page }),
            }}
            locale={{ emptyText: <Empty className={styles.emptyState} description="No audit records match these filters" /> }}
          />
        </Card>

        <Card className={`${styles.card} ${styles.tableCard}`} title="Platform administrators">
          <Table
            rowKey="id"
            size="small"
            columns={adminColumns}
            dataSource={data.platformUsers}
            pagination={false}
            scroll={{ x: 520 }}
            locale={{ emptyText: <Empty description="No platform administrators" /> }}
          />
        </Card>
      </div>
    );
  }

  function renderView() {
    if (activeView === 'organizations') return renderOrganizations();
    if (activeView === 'commercial') return renderCommercial();
    if (activeView === 'features') return renderFeatures();
    if (activeView === 'operations') return renderOperations();
    if (activeView === 'audit') return renderAudit();
    return renderOverview();
  }

  function primaryAction() {
    if (!isSuperAdmin) return null;
    if (activeView === 'overview' || activeView === 'organizations') {
      return (
        <Button className={styles.primaryAction} type="primary" icon={<PlusOutlined />} onClick={() => setCreateOpen(true)}>
          Add company
        </Button>
      );
    }
    if (activeView === 'commercial') {
      return (
        <Space>
          <Button icon={<PlusOutlined />} onClick={() => openPlanModal()}>
            New plan
          </Button>
          <Button className={styles.primaryAction} type="primary" icon={<CreditCardOutlined />} onClick={() => openSubscriptionModal()}>
            Assign plan
          </Button>
        </Space>
      );
    }
    if (activeView === 'features') {
      return (
        <Button className={styles.primaryAction} type="primary" icon={<PlusOutlined />} onClick={() => openFlagModal()}>
          Add control
        </Button>
      );
    }
    return null;
  }

  const selectedLatestJob = selected?.provisioning_job_id
    ? {
        id: selected.provisioning_job_id,
        status: selected.provisioning_job_status,
        current_step: selected.provisioning_current_step,
        attempt_count: selected.provisioning_attempt_count,
        error_message: selected.provisioning_error_message,
      }
    : null;

  const tenantActionMeta = {
    suspend: {
      title: `Suspend ${tenantAction.tenant?.name || 'company'}?`,
      description: 'All tenant logins and protected APIs will be blocked immediately. Active sessions are revoked.',
      okText: 'Suspend company',
      danger: true,
    },
    resume: {
      title: `Resume ${tenantAction.tenant?.name || 'company'}?`,
      description: 'Tenant logins and APIs will become available again after readiness checks pass.',
      okText: 'Resume company',
      danger: false,
    },
    revoke: {
      title: 'Revoke every active session?',
      description: 'All users in this company will be signed out and must authenticate again.',
      okText: 'Revoke sessions',
      danger: true,
    },
    offboard: {
      title: `Offboard ${tenantAction.tenant?.name || 'company'}?`,
      description: 'The company is soft-deleted into a recovery window. Subscriptions close and new logins remain blocked.',
      okText: 'Offboard company',
      danger: true,
    },
    release_hold: {
      title: `Release the legal hold for ${tenantAction.tenant?.name || 'company'}?`,
      description: 'This removes the compliance hold. The company remains soft-deleted until a separate permanent purge is scheduled.',
      okText: 'Release legal hold',
      danger: true,
    },
    purge: {
      title: `Schedule permanent purge for ${tenantAction.tenant?.name || 'company'}?`,
      description: 'After the retention period, the worker permanently destroys tenant database and object-storage data. Audit evidence remains.',
      okText: 'Schedule purge',
      danger: true,
    },
  }[tenantAction.type] || {};

  const selectedActionMenu = selected ? companyActionItems(selected) : { items: [] };
  const profileMenu = {
    items: [
      {
        key: 'identity',
        label: `${me?.email || 'Platform user'} · ${roleLabel}`,
        disabled: true,
      },
      { type: 'divider' },
      { key: 'logout', icon: <LogoutOutlined />, label: 'Sign out' },
    ],
    onClick: ({ key }) => {
      if (key === 'logout') logout();
    },
  };

  return (
    <Layout className={styles.shell}>
      <Sider
        className={styles.sider}
        width={248}
        collapsedWidth={80}
        collapsed={collapsed}
        trigger={null}
      >
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <CrownOutlined />
          </div>
          {!collapsed ? (
            <div className={styles.brandText}>
              <span className={styles.brandName}>Hippo Build</span>
              <span className={styles.brandCaption}>Platform operations</span>
            </div>
          ) : null}
        </div>
        <Menu
          className={styles.menu}
          theme="dark"
          mode="inline"
          selectedKeys={[activeView]}
          items={NAV_ITEMS}
          onClick={({ key }) => changeView(key)}
        />
        <div className={styles.siderBottom}>
          <Button
            className={styles.securityButton}
            block
            icon={<SafetyCertificateOutlined />}
            onClick={() => setSecurityOpen(true)}
          >
            {!collapsed ? 'Security & isolation' : null}
          </Button>
        </div>
      </Sider>

      <Layout className={`${styles.mainLayout} ${collapsed ? styles.mainLayoutCollapsed : ''}`}>
        <Header className={styles.header}>
          <div className={styles.headerLeft}>
            <Button
              className={styles.collapseButton}
              type="text"
              icon={collapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleNavigation}
              aria-label="Toggle navigation"
            />
            <div className={styles.headerDivider} />
            <span className={styles.headerProduct}>Platform Admin</span>
            <span className={styles.environmentBadge}>{process.env.NODE_ENV === 'production' ? 'Production' : 'Local'}</span>
          </div>
          <div className={styles.headerRight}>
            <Tooltip title="Refresh platform data">
              <Button type="text" icon={<ReloadOutlined />} loading={loading} onClick={refreshCurrent} />
            </Tooltip>
            <Dropdown menu={profileMenu} trigger={['click']}>
              <Button className={styles.profileButton}>
                <Avatar size={34} icon={<UserOutlined />} />
                <span className={styles.profileMeta}>
                  <span className={styles.profileName}>{me?.name || 'Platform user'}</span>
                  <span className={styles.profileRole}>{roleLabel}</span>
                </span>
                <DownOutlined style={{ fontSize: 10, color: '#64748b' }} />
              </Button>
            </Dropdown>
          </div>
        </Header>

        <Content className={styles.content}>
          <div className={styles.pageHeader}>
            <div>
              <Title level={2} className={styles.pageHeading}>
                {PAGE_META[activeView].title}
              </Title>
              <span className={styles.pageDescription}>{PAGE_META[activeView].description}</span>
            </div>
            <div className={styles.pageActions}>
              <Button icon={<FileProtectOutlined />} onClick={() => setSecurityOpen(true)}>
                Security & isolation
              </Button>
              {primaryAction()}
            </div>
          </div>

          {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
          {!isSuperAdmin ? (
            <Alert
              type="info"
              showIcon
              message="Read-only platform access"
              description="You can inspect organizations, plans, operations and audit evidence. A super administrator must perform commercial, lifecycle or destructive changes."
              style={{ marginBottom: 16 }}
            />
          ) : null}
          {renderView()}
        </Content>
      </Layout>

      <Drawer
        placement="left"
        width={280}
        open={mobileNavOpen}
        onClose={() => setMobileNavOpen(false)}
        styles={{ body: { padding: 0, background: '#0b1f35' }, header: { display: 'none' } }}
      >
        <div className={styles.brand}>
          <div className={styles.brandMark}>
            <CrownOutlined />
          </div>
          <div className={styles.brandText}>
            <span className={styles.brandName}>Hippo Build</span>
            <span className={styles.brandCaption}>Platform operations</span>
          </div>
        </div>
        <Menu
          className={styles.menu}
          theme="dark"
          mode="inline"
          selectedKeys={[activeView]}
          items={NAV_ITEMS}
          onClick={({ key }) => changeView(key)}
        />
      </Drawer>

      <Drawer
        title="Security & isolation"
        width={520}
        open={securityOpen}
        onClose={() => setSecurityOpen(false)}
      >
        <div className={styles.securityHero}>
          <div className={styles.securityHeroIcon}>
            <SafetyCertificateOutlined />
          </div>
          <Title level={4} className={styles.securityTitle}>
            Platform protection model
          </Title>
          <Paragraph className={styles.securityDescription}>
            These controls are built into provisioning, database access, authentication and operational
            workflows. They are not optional settings that a company can bypass.
          </Paragraph>
        </div>
        {[
          {
            title: 'Private company data boundaries',
            text: 'Every company uses an independently addressed tenant schema with request-bound tenant context and forced row-level security.',
          },
          {
            title: 'Restricted runtime database role',
            text: 'The running application cannot create schemas or bypass tenant isolation. Elevated credentials are limited to checked-in migrations and controlled purge work.',
          },
          {
            title: 'Encrypted communication credentials',
            text: 'Email, SMS and WhatsApp secrets are stored encrypted and are never returned by platform overview APIs.',
          },
          {
            title: 'Immediate lifecycle enforcement',
            text: 'Suspension blocks all tenant authentication and APIs. Incident response can revoke every active company session immediately.',
          },
          {
            title: 'Audited commercial and feature controls',
            text: 'Plan assignments, forced module controls, exports and offboarding actions create immutable platform audit evidence.',
          },
          {
            title: 'Recoverable deletion process',
            text: 'Offboarding begins with soft deletion and an explicit retention window. Legal holds block permanent purge, which is executed only by the worker.',
          },
        ].map((item) => (
          <div className={styles.securityItem} key={item.title}>
            <CheckCircleFilled className={styles.securityItemIcon} />
            <div>
              <span className={styles.securityItemTitle}>{item.title}</span>
              <span className={styles.securityItemText}>{item.text}</span>
            </div>
          </div>
        ))}
      </Drawer>

      <Modal
        title="Add organization"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={() => createForm.submit()}
        okText="Start setup"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Alert
          className={styles.modalHint}
          type="info"
          showIcon
          message="The workspace is prepared automatically"
          description="Hippo Build creates the private company workspace, applies migrations, seeds the first administrator and initializes communication records."
        />
        <Form form={createForm} layout="vertical" onFinish={createTenant} requiredMark={false}>
          <Form.Item label="Company name" name="name" rules={[{ required: true, message: 'Enter the company name' }]}>
            <Input placeholder="Example Construction Pvt Ltd" autoFocus />
          </Form.Item>
          <Form.Item
            label="Login slug"
            name="slug"
            extra="Lowercase identifier used during company login"
            rules={[
              { required: true, message: 'Enter the login slug' },
              { pattern: /^[a-z0-9]+(?:-[a-z0-9]+)*$/, message: 'Use lowercase letters, numbers and hyphens only' },
            ]}
          >
            <Input placeholder="example-construction" />
          </Form.Item>
          <Form.Item label="Administrator email" name="adminEmail" rules={[{ required: true }, { type: 'email' }]}>
            <Input placeholder="admin@example.com" />
          </Form.Item>
          <Form.Item label="Administrator name" name="adminName">
            <Input placeholder="Company Administrator" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={planModal.plan ? 'Edit commercial plan' : 'Create commercial plan'}
        open={planModal.open}
        onCancel={() => setPlanModal({ open: false, plan: null })}
        onOk={() => planForm.submit()}
        okText={planModal.plan ? 'Save changes' : 'Create plan'}
        confirmLoading={saving}
        width={760}
        destroyOnHidden
      >
        <Form form={planForm} layout="vertical" onFinish={savePlan} requiredMark={false}>
          <div className={styles.formGrid}>
            <Form.Item label="Plan code" name="code" rules={[{ required: true }]}>
              <Input placeholder="GROWTH" />
            </Form.Item>
            <Form.Item label="Plan name" name="name" rules={[{ required: true }]}>
              <Input placeholder="Growth" />
            </Form.Item>
            <Form.Item className={styles.formFull} label="Description" name="description">
              <Input.TextArea rows={2} placeholder="Who this plan is intended for" />
            </Form.Item>
            <Form.Item label="Monthly price" name="monthlyPriceRupees">
              <InputNumber min={0} precision={0} prefix="₹" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Annual price" name="annualPriceRupees">
              <InputNumber min={0} precision={0} prefix="₹" style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Currency" name="currency" rules={[{ required: true }]}>
              <Select options={[{ value: 'INR', label: 'INR — Indian Rupee' }, { value: 'USD', label: 'USD — US Dollar' }]} />
            </Form.Item>
            <Form.Item label="Status" name="status" rules={[{ required: true }]}>
              <Select options={[{ value: 'active', label: 'Active' }, { value: 'archived', label: 'Archived' }]} />
            </Form.Item>
            <Form.Item label="Trial days" name="trialDays">
              <InputNumber min={0} max={365} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Display order" name="displayOrder">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="User limit" name="users" extra="Use -1 for unlimited">
              <InputNumber min={-1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item label="Project limit" name="projects" extra="Use -1 for unlimited">
              <InputNumber min={-1} style={{ width: '100%' }} />
            </Form.Item>
            <Form.Item className={styles.formFull} label="Included modules" name="modules">
              <Select mode="multiple" options={[{ value: 'all', label: 'All modules' }, ...MODULE_OPTIONS]} placeholder="Select plan modules" />
            </Form.Item>
          </div>
        </Form>
      </Modal>

      <Modal
        title={subscriptionModal.subscription ? 'Update subscription' : 'Assign plan to company'}
        open={subscriptionModal.open}
        onCancel={() => setSubscriptionModal({ open: false, subscription: null })}
        onOk={() => subscriptionForm.submit()}
        okText={subscriptionModal.subscription ? 'Save subscription' : 'Assign plan'}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Form form={subscriptionForm} layout="vertical" onFinish={saveSubscription} requiredMark={false}>
          <Form.Item label="Company" name="tenantId" rules={[{ required: true }]}>
            <Select
              disabled={Boolean(subscriptionModal.subscription)}
              showSearch
              optionFilterProp="label"
              options={data.tenants
                .filter((tenant) => ['active', 'suspended'].includes(tenant.status))
                .map((tenant) => ({ value: tenant.id, label: `${tenant.name} (${tenant.slug})` }))}
            />
          </Form.Item>
          <Form.Item label="Plan" name="planId" rules={[{ required: true }]}>
            <Select options={data.plans.filter((plan) => plan.status === 'active').map((plan) => ({ value: plan.id, label: plan.name }))} />
          </Form.Item>
          <div className={styles.formGrid}>
            <Form.Item label="Status" name="status" rules={[{ required: true }]}>
              <Select options={[
                { value: 'scheduled', label: 'Scheduled — starts in the future' },
                { value: 'trial', label: 'Trial' },
                { value: 'active', label: 'Active' },
                { value: 'paused', label: 'Paused' },
                { value: 'expired', label: 'Expired' },
                { value: 'cancelled', label: 'Cancelled' },
              ]} />
            </Form.Item>
            <div />
            <Form.Item label="Starts on" name="startsAt" rules={[{ required: true }]}>
              <Input type="date" />
            </Form.Item>
            <Form.Item label="Ends on" name="endsAt">
              <Input type="date" />
            </Form.Item>
          </div>
          <Form.Item label="Internal notes" name="notes">
            <Input.TextArea rows={2} placeholder="Commercial approval or support context" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={flagModal.flag ? 'Edit feature control' : 'Add feature control'}
        open={flagModal.open}
        onCancel={() => setFlagModal({ open: false, flag: null, tenantId: null })}
        onOk={() => flagForm.submit()}
        okText="Apply control"
        confirmLoading={saving}
        destroyOnHidden
      >
        <Alert
          className={styles.modalHint}
          type="warning"
          showIcon
          message="This change is enforced at runtime"
          description="Use forced-off for incidents or contractual restrictions. Include a clear operational reason for the audit record."
        />
        <Form form={flagForm} layout="vertical" onFinish={saveFlag} requiredMark={false}>
          <Form.Item label="Scope" name="scope" rules={[{ required: true }]}>
            <Select options={[{ value: 'global', label: 'All companies' }, { value: 'company', label: 'One company' }]} />
          </Form.Item>
          <Form.Item noStyle shouldUpdate={(previous, current) => previous.scope !== current.scope}>
            {({ getFieldValue }) =>
              getFieldValue('scope') === 'company' ? (
                <Form.Item label="Company" name="tenantId" rules={[{ required: true }]}>
                  <Select
                    showSearch
                    optionFilterProp="label"
                    options={data.tenants.map((tenant) => ({ value: tenant.id, label: `${tenant.name} (${tenant.slug})` }))}
                  />
                </Form.Item>
              ) : null
            }
          </Form.Item>
          <Form.Item label="Feature key" name="flagKey" rules={[{ required: true }]}>
            <Select
              showSearch
              options={MODULE_OPTIONS.map((module) => ({ value: `module.${module.value}`, label: module.label }))}
              placeholder="Select a runtime module"
            />
          </Form.Item>
          <Form.Item label="Forced value" name="forcedValue" rules={[{ required: true }]}>
            <Select options={[{ value: 'off', label: 'Forced off — block the module' }, { value: 'on', label: 'Forced on — override tenant preference within plan' }]} />
          </Form.Item>
          <Form.Item label="Reason" name="reason" rules={[{ required: true, min: 5, message: 'Enter a clear operational reason' }]}>
            <Input.TextArea rows={3} placeholder="Incident, compliance or support reason" />
          </Form.Item>
        </Form>
      </Modal>

      <Modal
        title={tenantActionMeta.title}
        open={tenantAction.open}
        onCancel={() => setTenantAction({ open: false, type: null, tenant: null })}
        onOk={() => actionForm.submit()}
        okText={tenantActionMeta.okText}
        okButtonProps={{ danger: tenantActionMeta.danger }}
        confirmLoading={saving}
        destroyOnHidden
      >
        <Alert
          className={styles.modalHint}
          type={tenantActionMeta.danger ? 'warning' : 'info'}
          showIcon
          message={tenantActionMeta.description}
        />
        <Form form={actionForm} layout="vertical" onFinish={submitTenantAction} requiredMark={false}>
          {tenantAction.type !== 'resume' ? (
            <Form.Item label="Reason" name="reason" rules={[
              {
                required: true,
                min:
                  tenantAction.type === 'offboard' ||
                  tenantAction.type === 'purge' ||
                  tenantAction.type === 'release_hold'
                    ? 10
                    : 5,
              },
            ]}>
              <Input.TextArea rows={3} placeholder="Why this action is required" />
            </Form.Item>
          ) : null}
          {tenantAction.type === 'offboard' ? (
            <Form.Item label="Legal hold" name="legalHold" valuePropName="checked">
              <Switch checkedChildren="On" unCheckedChildren="Off" />
            </Form.Item>
          ) : null}
          {tenantAction.type === 'purge' ? (
            <Form.Item label="Retention period (days)" name="retentionDays" rules={[{ required: true }]}>
              <InputNumber min={1} max={365} style={{ width: '100%' }} />
            </Form.Item>
          ) : null}
          {tenantAction.type === 'offboard' ||
          tenantAction.type === 'purge' ||
          tenantAction.type === 'release_hold' ? (
            <Form.Item
              label={
                <span>
                  Type <span className={styles.confirmCode}>DELETE {tenantAction.tenant?.slug}</span> to confirm
                </span>
              }
              name="confirmation"
              rules={[
                { required: true },
                {
                  validator: (_, value) =>
                    value === `DELETE ${tenantAction.tenant?.slug}`
                      ? Promise.resolve()
                      : Promise.reject(new Error('Confirmation text does not match')),
                },
              ]}
            >
              <Input autoComplete="off" />
            </Form.Item>
          ) : null}
        </Form>
      </Modal>

      <Drawer
        width={760}
        open={Boolean(selected)}
        onClose={() => setSelectedId(null)}
        title={
          selected ? (
            <div className={styles.drawerHeader}>
              <Avatar className={styles.companyAvatar} shape="square">
                {initials(selected.name)}
              </Avatar>
              <div>
                <span className={styles.drawerTitle}>{selected.name}</span>
                <span className={styles.drawerSubtitle}>{selected.slug}</span>
              </div>
            </div>
          ) : null
        }
        extra={
          selected && isSuperAdmin ? (
            <Dropdown menu={selectedActionMenu} trigger={['click']}>
              <Button icon={<MoreOutlined />}>Actions</Button>
            </Dropdown>
          ) : null
        }
      >
        {selected ? (
          <Spin spinning={selectedHealthLoading}>
            <div className={styles.drawerSummary}>
              <div className={styles.drawerMetric}>
                <span className={styles.drawerMetricLabel}>Health</span>
                <span className={styles.drawerMetricValue}>
                  <HealthLabel status={selected.health_status} />
                </span>
              </div>
              <div className={styles.drawerMetric}>
                <span className={styles.drawerMetricLabel}>Lifecycle</span>
                <span className={styles.drawerMetricValue}>{tenantStatusLabel(selected.status)}</span>
              </div>
              <div className={styles.drawerMetric}>
                <span className={styles.drawerMetricLabel}>Current plan</span>
                <span className={styles.drawerMetricValue}>{selected.plan_name || 'Not assigned'}</span>
              </div>
            </div>

            <Tabs
              items={[
                {
                  key: 'overview',
                  label: 'Overview',
                  children: (
                    <>
                      <Alert
                        type={selected.status === 'failed' ? 'error' : selected.status === 'active' ? 'success' : 'info'}
                        showIcon
                        message={tenantStatusLabel(selected.status)}
                        description={
                          selected.status === 'active'
                            ? 'This company is available to authenticated users.'
                            : selected.status === 'failed'
                              ? selectedLatestJob?.error_message || 'Company setup requires attention.'
                              : selected.status === 'suspended'
                                ? 'All company logins and APIs are currently blocked.'
                                : `${setupStepLabel(selectedLatestJob?.current_step)}. Progress refreshes automatically.`
                        }
                        action={
                          selected.status === 'failed' && isSuperAdmin ? (
                            <Button
                              size="small"
                              type="primary"
                              icon={<ReloadOutlined />}
                              loading={retryingId === selected.id}
                              onClick={() => retryTenant(selected.id)}
                            >
                              Retry setup
                            </Button>
                          ) : null
                        }
                        style={{ marginBottom: 16 }}
                      />
                      <Card className={styles.detailSection} title="Company profile" size="small">
                        <Descriptions column={1} size="small">
                          <Descriptions.Item label="Company name">{selected.name}</Descriptions.Item>
                          <Descriptions.Item label="Login slug">{selected.slug}</Descriptions.Item>
                          <Descriptions.Item label="Added">{formatDate(selected.created_at)}</Descriptions.Item>
                          <Descriptions.Item label="Last updated">{formatDate(selected.updated_at)}</Descriptions.Item>
                        </Descriptions>
                      </Card>
                      <Card className={styles.detailSection} title="Setup progress" size="small">
                        <div className={styles.cardHeader}>
                          <Text>{setupStepLabel(selectedLatestJob?.current_step || (selected.status === 'active' ? 'active' : 'registered'))}</Text>
                          <Text type="secondary">{setupPercent(selectedLatestJob?.current_step, selectedLatestJob?.status)}%</Text>
                        </div>
                        <Progress
                          percent={setupPercent(selectedLatestJob?.current_step, selectedLatestJob?.status)}
                          status={selectedLatestJob?.status === 'failed' ? 'exception' : selectedLatestJob?.status === 'completed' ? 'success' : 'active'}
                          showInfo={false}
                        />
                        <Text type="secondary">Attempts: {selectedLatestJob?.attempt_count || 0}</Text>
                      </Card>
                    </>
                  ),
                },
                {
                  key: 'commercial',
                  label: 'Plan & access',
                  children: (
                    <>
                      <Card
                        className={styles.detailSection}
                        title="Current subscription"
                        size="small"
                        extra={
                          isSuperAdmin ? (
                            <Button type="link" onClick={() => openSubscriptionModal(selectedSubscription, selected.id)}>
                              {selectedSubscription ? 'Edit' : 'Assign plan'}
                            </Button>
                          ) : null
                        }
                      >
                        {selectedSubscription ? (
                          <Descriptions column={1} size="small">
                            <Descriptions.Item label="Plan">{selectedSubscription.plan_name}</Descriptions.Item>
                            <Descriptions.Item label="Status"><Tag color={subscriptionColor(selectedSubscription.status)}>{subscriptionLabel(selectedSubscription.status)}</Tag></Descriptions.Item>
                            <Descriptions.Item label="Starts">{formatDate(selectedSubscription.starts_at)}</Descriptions.Item>
                            <Descriptions.Item label="Ends">{formatDate(selectedSubscription.ends_at)}</Descriptions.Item>
                            <Descriptions.Item label="Notes">{selectedSubscription.notes || '—'}</Descriptions.Item>
                          </Descriptions>
                        ) : (
                          <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No plan assigned" />
                        )}
                      </Card>
                      <Card
                        className={styles.detailSection}
                        title="Platform feature controls"
                        size="small"
                        extra={
                          isSuperAdmin ? (
                            <Button type="link" onClick={() => openFlagModal(null, selected.id)}>
                              Add control
                            </Button>
                          ) : null
                        }
                      >
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={selectedFlags}
                          columns={[
                            { title: 'Feature', dataIndex: 'flag_key' },
                            { title: 'Scope', render: (_, flag) => flag.tenant_id ? 'This company' : 'All companies' },
                            { title: 'Control', dataIndex: 'forced_value', render: flagValue },
                          ]}
                          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="No forced controls apply" /> }}
                        />
                      </Card>
                    </>
                  ),
                },
                {
                  key: 'security',
                  label: 'Security',
                  children: (
                    <>
                      <Card className={styles.detailSection} title="Communication security" size="small">
                        <Table
                          rowKey="id"
                          size="small"
                          pagination={false}
                          dataSource={selectedChannels}
                          columns={[
                            { title: 'Channel', dataIndex: 'channel_type', render: sentence },
                            { title: 'Provider', dataIndex: 'provider', render: (value) => value === 'unconfigured' ? 'Not configured' : value },
                            { title: 'Status', render: (_, channel) => channelStatusLabel(channel) },
                          ]}
                          locale={{ emptyText: <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description="Communication setup pending" /> }}
                        />
                      </Card>
                      <Card className={styles.detailSection} title="Active sessions" size="small">
                        <div className={styles.cardHeader}>
                          <div>
                            <Text strong>{selectedHealth?.checks?.sessions?.active ?? '—'} active sessions</Text>
                            <div><Text type="secondary">{selectedHealth?.checks?.sessions?.total ?? '—'} total session records</Text></div>
                          </div>
                          {isSuperAdmin ? (
                            <Button danger icon={<KeyOutlined />} onClick={() => openTenantAction('revoke', selected)}>
                              Revoke all
                            </Button>
                          ) : null}
                        </div>
                      </Card>
                    </>
                  ),
                },
                {
                  key: 'system',
                  label: 'System',
                  children: (
                    <>
                      <Card className={styles.detailSection} title="Readiness checks" size="small">
                        <Descriptions column={1} size="small" bordered>
                          <Descriptions.Item label="Overall">{selectedHealth?.healthy ? <Tag color="green">Healthy</Tag> : <Tag color="gold">Review</Tag>}</Descriptions.Item>
                          <Descriptions.Item label="Private schema">{sentence(selectedHealth?.checks?.schema || 'checking')}</Descriptions.Item>
                          <Descriptions.Item label="Data location">{sentence(selectedHealth?.checks?.dataLocation || selected.data_location_status)}</Descriptions.Item>
                          <Descriptions.Item label="Applied migrations">{selectedHealth?.checks?.migrations?.applied ?? '—'}</Descriptions.Item>
                          <Descriptions.Item label="Provisioning stale">{selectedHealth?.checks?.provisioningStale ? 'Yes' : 'No'}</Descriptions.Item>
                        </Descriptions>
                      </Card>
                      <Card className={styles.detailSection} title="Advanced identifiers" size="small">
                        <Descriptions column={1} size="small" bordered>
                          <Descriptions.Item label="Organization ID"><Text copyable>{selected.id}</Text></Descriptions.Item>
                          <Descriptions.Item label="Storage prefix"><Text copyable>{selected.storage_prefix}</Text></Descriptions.Item>
                          <Descriptions.Item label="Isolation">{selected.isolation_mode === 'dedicated_database' ? 'Dedicated database' : 'Private schema in shared database'}</Descriptions.Item>
                          <Descriptions.Item label="Migration version">{selected.migration_version || 'Pending'}</Descriptions.Item>
                        </Descriptions>
                      </Card>
                      <Card className={`${styles.detailSection} ${styles.dangerZone}`} title="Lifecycle controls" size="small">
                        {isSuperAdmin ? (
                          <>
                            <Space wrap>
                              {selected.status === 'suspended' ? (
                                <Button icon={<PlayCircleOutlined />} onClick={() => openTenantAction('resume', selected)}>
                                  Resume company
                                </Button>
                              ) : selected.status === 'active' ? (
                                <Button danger icon={<PauseCircleOutlined />} onClick={() => openTenantAction('suspend', selected)}>
                                  Suspend company
                                </Button>
                              ) : null}
                              <Button
                                icon={<ExportOutlined />}
                                disabled={!['active', 'suspended'].includes(selected.status)}
                                onClick={() => exportTenant(selected)}
                              >
                                Export data
                              </Button>
                              <Button
                                danger
                                type="primary"
                                icon={<DeleteOutlined />}
                                disabled={selected.status !== 'suspended'}
                                onClick={() => openTenantAction('offboard', selected)}
                              >
                                Offboard
                              </Button>
                            </Space>
                            {selected.status !== 'suspended' ? (
                              <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>
                                Suspend the company before offboarding.
                              </Paragraph>
                            ) : null}
                          </>
                        ) : (
                          <Alert type="info" showIcon message="Lifecycle controls require a super administrator" />
                        )}
                      </Card>
                    </>
                  ),
                },
              ]}
            />
          </Spin>
        ) : null}
      </Drawer>

      <Drawer
        title="Audit record"
        width={620}
        open={Boolean(selectedAudit)}
        onClose={() => setSelectedAudit(null)}
      >
        {selectedAudit ? (
          <Space direction="vertical" size="large" style={{ width: '100%' }}>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="Action">{sentence(selectedAudit.action.replaceAll('.', ' '))}</Descriptions.Item>
              <Descriptions.Item label="Time">{formatDate(selectedAudit.created_at)}</Descriptions.Item>
              <Descriptions.Item label="Actor">{selectedAudit.actor_email || 'System worker'}</Descriptions.Item>
              <Descriptions.Item label="Company">{selectedAudit.tenant_name || 'Platform-wide'}</Descriptions.Item>
              <Descriptions.Item label="Entity">{selectedAudit.entity_type} · {selectedAudit.entity_id || '—'}</Descriptions.Item>
              <Descriptions.Item label="Request ID"><Text copyable>{selectedAudit.request_id || '—'}</Text></Descriptions.Item>
            </Descriptions>
            <div>
              <Title level={5}>Before</Title>
              <pre className={styles.auditBeforeAfter}>{JSON.stringify(selectedAudit.before_state, null, 2) || 'No previous state recorded'}</pre>
            </div>
            <div>
              <Title level={5}>After</Title>
              <pre className={styles.auditBeforeAfter}>{JSON.stringify(selectedAudit.after_state, null, 2) || 'No resulting state recorded'}</pre>
            </div>
            <div>
              <Title level={5}>Metadata</Title>
              <pre className={styles.auditBeforeAfter}>{JSON.stringify(selectedAudit.metadata, null, 2) || '{}'}</pre>
            </div>
          </Space>
        ) : null}
      </Drawer>
    </Layout>
  );
}
