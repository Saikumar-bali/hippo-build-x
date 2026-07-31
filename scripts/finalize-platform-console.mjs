import { readFileSync, writeFileSync } from 'node:fs';

const file = new URL('../apps/web/src/modules/platform/PlatformControlCenter.js', import.meta.url);
let source = readFileSync(file, 'utf8');

function replaceOnce(label, from, to) {
  const index = source.indexOf(from);
  if (index < 0) throw new Error(`Missing source contract: ${label}`);
  if (source.indexOf(from, index + from.length) >= 0) {
    throw new Error(`Source contract is not unique: ${label}`);
  }
  source = `${source.slice(0, index)}${to}${source.slice(index + from.length)}`;
}

function replaceBlock(label, start, end, replacement) {
  const startIndex = source.indexOf(start);
  if (startIndex < 0) throw new Error(`Missing block start: ${label}`);
  const endIndex = source.indexOf(end, startIndex + start.length);
  if (endIndex < 0) throw new Error(`Missing block end: ${label}`);
  if (source.indexOf(start, startIndex + start.length) >= 0) {
    throw new Error(`Block start is not unique: ${label}`);
  }
  source = `${source.slice(0, startIndex)}${replacement}${source.slice(endIndex)}`;
}

if (source.includes('Read-only platform access') && source.includes('Release legal hold')) {
  console.log('Platform console hardening already applied');
  process.exit(0);
}

replaceOnce(
  'scheduled subscription presentation',
  `function subscriptionColor(status) {
  if (status === 'active') return 'green';
  if (status === 'trial') return 'blue';
  if (status === 'paused') return 'orange';
  if (status === 'cancelled' || status === 'expired') return 'default';
  return 'default';
}

function subscriptionLabel(status) {
  return (
    {
      active: 'Active',
      trial: 'Trial',
      paused: 'Paused',
      expired: 'Expired',
      cancelled: 'Cancelled',
    }[status] || sentence(status || 'Not assigned')
  );
}`,
  `function subscriptionColor(status) {
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
}`,
);

replaceOnce(
  'role state',
  `  const [actionForm] = Form.useForm();

  const load = useCallback(`,
  `  const [actionForm] = Form.useForm();

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

  const load = useCallback(`,
);

for (const [label, before, after] of [
  ['create tenant guard', `async function createTenant(values) {\n    setSaving(true);`, `async function createTenant(values) {\n    if (!requireWriteAccess()) return;\n    setSaving(true);`],
  ['retry tenant guard', `async function retryTenant(id) {\n    setRetryingId(id);`, `async function retryTenant(id) {\n    if (!requireWriteAccess()) return;\n    setRetryingId(id);`],
  ['open plan guard', `function openPlanModal(plan = null) {\n    setPlanModal`, `function openPlanModal(plan = null) {\n    if (!requireWriteAccess()) return;\n    setPlanModal`],
  ['save plan guard', `async function savePlan(values) {\n    setSaving(true);`, `async function savePlan(values) {\n    if (!requireWriteAccess()) return;\n    setSaving(true);`],
  ['open subscription guard', `function openSubscriptionModal(subscription = null, tenantId = null) {\n    setSubscriptionModal`, `function openSubscriptionModal(subscription = null, tenantId = null) {\n    if (!requireWriteAccess()) return;\n    setSubscriptionModal`],
  ['save subscription guard', `async function saveSubscription(values) {\n    const existing`, `async function saveSubscription(values) {\n    if (!requireWriteAccess()) return;\n    const existing`],
  ['open feature guard', `function openFlagModal(flag = null, tenantId = null) {\n    setFlagModal`, `function openFlagModal(flag = null, tenantId = null) {\n    if (!requireWriteAccess()) return;\n    setFlagModal`],
  ['save feature guard', `async function saveFlag(values) {\n    setSaving(true);`, `async function saveFlag(values) {\n    if (!requireWriteAccess()) return;\n    setSaving(true);`],
  ['delete feature guard', `async function deleteFlag(flag) {\n    setSaving(true);`, `async function deleteFlag(flag) {\n    if (!requireWriteAccess()) return;\n    setSaving(true);`],
  ['open tenant action guard', `function openTenantAction(type, tenant) {\n    setTenantAction`, `function openTenantAction(type, tenant) {\n    if (!requireWriteAccess()) return;\n    setTenantAction`],
  ['export guard', `async function exportTenant(tenant) {\n    setSaving(true);`, `async function exportTenant(tenant) {\n    if (!requireWriteAccess()) return;\n    setSaving(true);`],
  ['submit action guard', `async function submitTenantAction(values) {\n    const { type, tenant }`, `async function submitTenantAction(values) {\n    if (!requireWriteAccess()) return;\n    const { type, tenant }`],
]) {
  replaceOnce(label, before, after);
}

for (const line of [
  `            storageGb: plan.entitlements?.storageGb ?? 0,\n`,
  `            storageGb: 25,\n`,
  `          storageGb: values.storageGb,\n`,
  `                  <Tag>{entitlements.storageGb || 0} GB storage</Tag>\n`,
]) {
  replaceOnce(`remove storage quota ${line.trim()}`, line, '');
}
replaceOnce(
  'remove storage field',
  `            <Form.Item label="Storage (GB)" name="storageGb">
              <InputNumber min={0} style={{ width: '100%' }} />
            </Form.Item>
`,
  '',
);

replaceOnce(
  'scheduled option',
  `              <Select options={[
                { value: 'trial', label: 'Trial' },`,
  `              <Select options={[
                { value: 'scheduled', label: 'Scheduled — starts in the future' },
                { value: 'trial', label: 'Trial' },`,
);

replaceOnce(
  'release hold action request',
  `      } else if (type === 'offboard' || type === 'purge') {
        const result = await apiRequest(\`/api/v1/platform/tenants/\${tenant.id}/delete\`, {
          method: 'POST',
          body: JSON.stringify({
            mode: type === 'offboard' ? 'soft_delete' : 'purge',
            reason: values.reason,
            legalHold: Boolean(values.legalHold),
            retentionDays: values.retentionDays,
            confirmation: values.confirmation,
          }),
        });
        message.success(
          type === 'offboard'
            ? 'Company offboarded into the recovery window'
            : \`Permanent purge scheduled for \${formatDate(result.scheduled_for)}\`,
        );
        if (type === 'offboard') setSelectedId(null);
      }`,
  `      } else if (type === 'offboard' || type === 'purge' || type === 'release_hold') {
        const result = await apiRequest(\`/api/v1/platform/tenants/\${tenant.id}/delete\`, {
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
              : \`Permanent purge scheduled for \${formatDate(result.scheduled_for)}\`,
        );
        if (type === 'offboard') setSelectedId(null);
      }`,
);

replaceBlock(
  'role and lifecycle company menu',
  `  function companyActionItems(tenant) {`,
  `  const organizationColumns = [`,
  `  function companyActionItems(tenant) {
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

`,
);

replaceOnce(
  'subscription row access',
  `      render: (_, item) => (
        <Button type="text" icon={<EditOutlined />} onClick={() => openSubscriptionModal(item)} />
      ),`,
  `      render: (_, item) =>
        isSuperAdmin ? (
          <Button
            type="text"
            icon={<EditOutlined />}
            aria-label={\`Edit subscription for \${item.tenant_name}\`}
            onClick={() => openSubscriptionModal(item)}
          />
        ) : (
          <Text type="secondary">Read only</Text>
        ),`,
);

replaceOnce(
  'feature row access',
  `      render: (_, flag) => (
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
      ),`,
  `      render: (_, flag) =>
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
        ) : null,`,
);

replaceBlock(
  'legal hold controls',
  `  const deletionColumns = [`,
  `  const auditColumns = [`,
  `  const deletionColumns = [
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

`,
);

replaceOnce(
  'plan edit access',
  `                    <Button type="text" icon={<EditOutlined />} onClick={() => openPlanModal(plan)} />`,
  `                    {isSuperAdmin ? (
                      <Button type="text" icon={<EditOutlined />} onClick={() => openPlanModal(plan)} />
                    ) : null}`,
);
replaceOnce(
  'assign plan access',
  `          extra={
            <Button type="primary" icon={<PlusOutlined />} onClick={() => openSubscriptionModal()}>
              Assign plan
            </Button>
          }`,
  `          extra={
            isSuperAdmin ? (
              <Button type="primary" icon={<PlusOutlined />} onClick={() => openSubscriptionModal()}>
                Assign plan
              </Button>
            ) : null
          }`,
);
replaceOnce(
  'primary actions access',
  `  function primaryAction() {
    if (activeView === 'overview' || activeView === 'organizations') {`,
  `  function primaryAction() {
    if (!isSuperAdmin) return null;
    if (activeView === 'overview' || activeView === 'organizations') {`,
);

replaceOnce(
  'release hold modal metadata',
  `    purge: {
      title: \`Schedule permanent purge for \${tenantAction.tenant?.name || 'company'}?\`,
      description: 'After the retention period, the worker permanently destroys the tenant data schema. Audit evidence remains.',
      okText: 'Schedule purge',
      danger: true,
    },`,
  `    release_hold: {
      title: \`Release the legal hold for \${tenantAction.tenant?.name || 'company'}?\`,
      description: 'This removes the compliance hold. The company remains soft-deleted until a separate permanent purge is scheduled.',
      okText: 'Release legal hold',
      danger: true,
    },
    purge: {
      title: \`Schedule permanent purge for \${tenantAction.tenant?.name || 'company'}?\`,
      description: 'After the retention period, the worker permanently destroys tenant database and object-storage data. Audit evidence remains.',
      okText: 'Schedule purge',
      danger: true,
    },`,
);

replaceOnce(
  'profile menu role',
  `      { key: 'email', label: me?.email || 'Platform administrator', disabled: true },`,
  `      {
        key: 'identity',
        label: \`\${me?.email || 'Platform user'} · \${roleLabel}\`,
        disabled: true,
      },`,
);
replaceOnce(
  'profile header role',
  `                  <span className={styles.profileName}>{me?.name || 'Platform Administrator'}</span>
                  <span className={styles.profileRole}>Super administrator</span>`,
  `                  <span className={styles.profileName}>{me?.name || 'Platform user'}</span>
                  <span className={styles.profileRole}>{roleLabel}</span>`,
);
replaceOnce(
  'read only banner',
  `          {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
          {renderView()}`,
  `          {error ? <Alert type="error" showIcon message={error} style={{ marginBottom: 16 }} /> : null}
          {!isSuperAdmin ? (
            <Alert
              type="info"
              showIcon
              message="Read-only platform access"
              description="You can inspect organizations, plans, operations and audit evidence. A super administrator must perform commercial, lifecycle or destructive changes."
              style={{ marginBottom: 16 }}
            />
          ) : null}
          {renderView()}`,
);

replaceOnce(
  'drawer menu access',
  `          selected ? (
            <Dropdown menu={selectedActionMenu} trigger={['click']}>
              <Button icon={<MoreOutlined />}>Actions</Button>
            </Dropdown>
          ) : null`,
  `          selected && isSuperAdmin ? (
            <Dropdown menu={selectedActionMenu} trigger={['click']}>
              <Button icon={<MoreOutlined />}>Actions</Button>
            </Dropdown>
          ) : null`,
);
replaceOnce('retry setup access', `                          selected.status === 'failed' ? (`, `                          selected.status === 'failed' && isSuperAdmin ? (`);
replaceOnce(
  'drawer plan access',
  `                        extra={<Button type="link" onClick={() => openSubscriptionModal(selectedSubscription, selected.id)}>{selectedSubscription ? 'Edit' : 'Assign plan'}</Button>}`,
  `                        extra={
                          isSuperAdmin ? (
                            <Button type="link" onClick={() => openSubscriptionModal(selectedSubscription, selected.id)}>
                              {selectedSubscription ? 'Edit' : 'Assign plan'}
                            </Button>
                          ) : null
                        }`,
);
replaceOnce(
  'drawer feature access',
  `                      <Card className={styles.detailSection} title="Platform feature controls" size="small" extra={<Button type="link" onClick={() => openFlagModal(null, selected.id)}>Add control</Button>}>`,
  `                      <Card
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
                      >`,
);
replaceOnce(
  'drawer revoke access',
  `                          <Button danger icon={<KeyOutlined />} onClick={() => openTenantAction('revoke', selected)}>
                            Revoke all
                          </Button>`,
  `                          {isSuperAdmin ? (
                            <Button danger icon={<KeyOutlined />} onClick={() => openTenantAction('revoke', selected)}>
                              Revoke all
                            </Button>
                          ) : null}`,
);

replaceOnce(
  'drawer lifecycle access',
  `                        <Space wrap>
                          {selected.status === 'suspended' ? (
                            <Button icon={<PlayCircleOutlined />} onClick={() => openTenantAction('resume', selected)}>Resume company</Button>
                          ) : (
                            <Button danger icon={<PauseCircleOutlined />} onClick={() => openTenantAction('suspend', selected)}>Suspend company</Button>
                          )}
                          <Button icon={<ExportOutlined />} onClick={() => exportTenant(selected)}>Export data</Button>
                          <Button danger type="primary" icon={<DeleteOutlined />} disabled={selected.status !== 'suspended'} onClick={() => openTenantAction('offboard', selected)}>Offboard</Button>
                        </Space>
                        {selected.status !== 'suspended' ? <Paragraph type="secondary" style={{ marginTop: 12, marginBottom: 0 }}>Suspend the company before offboarding.</Paragraph> : null}`,
  `                        {isSuperAdmin ? (
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
                        )}`,
);

replaceOnce(
  'release hold reason length',
  `rules={[{ required: true, min: tenantAction.type === 'offboard' || tenantAction.type === 'purge' ? 10 : 5 }]}`,
  `rules={[
              {
                required: true,
                min:
                  tenantAction.type === 'offboard' ||
                  tenantAction.type === 'purge' ||
                  tenantAction.type === 'release_hold'
                    ? 10
                    : 5,
              },
            ]}`,
);
replaceOnce(
  'release hold confirmation',
  `{tenantAction.type === 'offboard' || tenantAction.type === 'purge' ? (`,
  `{tenantAction.type === 'offboard' ||
          tenantAction.type === 'purge' ||
          tenantAction.type === 'release_hold' ? (`,
);

writeFileSync(file, source);
console.log('Applied professional role-aware platform console hardening');
