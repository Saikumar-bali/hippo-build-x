'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button, DatePicker, Empty, Form, Input, Select, Space, Spin, Table, Tag } from 'antd';

const { RangePicker } = DatePicker;

export default function AuditAdminPage() {
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();

  const load = useCallback(async (filters = {}) => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ limit: '100' });
      if (filters.entityType) params.set('entityType', filters.entityType);
      if (filters.action) params.set('action', filters.action);
      if (filters.actorId) params.set('actorId', filters.actorId);
      if (filters.from) params.set('from', filters.from);
      if (filters.to) params.set('to', filters.to);
      const res = await fetch(`/api/v1/admin/audit?${params}`);
      const json = await res.json();
      setRows(json.data || []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function onFilter(values) {
    const range = values.range || [];
    load({
      entityType: values.entityType,
      action: values.action,
      actorId: values.actorId,
      from: range[0]?.toISOString?.(),
      to: range[1]?.toISOString?.(),
    });
  }

  return (
    <div>
      <h2>Audit log</h2>
      <Form
        form={form}
        layout="inline"
        onFinish={onFilter}
        style={{ marginBottom: 16, rowGap: 8 }}
      >
        <Form.Item name="entityType">
          <Select
            allowClear
            placeholder="Entity type"
            style={{ width: 140 }}
            options={['user', 'role', 'project', 'unit', 'task', 'branding', 'channel_config'].map(
              (v) => ({ value: v, label: v }),
            )}
          />
        </Form.Item>
        <Form.Item name="action">
          <Select
            allowClear
            placeholder="Action"
            style={{ width: 120 }}
            options={['create', 'update', 'delete', 'status_change'].map((v) => ({
              value: v,
              label: v,
            }))}
          />
        </Form.Item>
        <Form.Item name="actorId">
          <Input placeholder="Actor ID" allowClear style={{ width: 180 }} />
        </Form.Item>
        <Form.Item name="range">
          <RangePicker showTime />
        </Form.Item>
        <Form.Item>
          <Space>
            <Button type="primary" htmlType="submit">
              Filter
            </Button>
            <Button
              onClick={() => {
                form.resetFields();
                load();
              }}
            >
              Reset
            </Button>
          </Space>
        </Form.Item>
      </Form>
      {loading ? (
        <Spin />
      ) : !rows.length ? (
        <Empty description="No audit events" />
      ) : (
        <Table
          rowKey="id"
          dataSource={rows}
          columns={[
            {
              title: 'When',
              dataIndex: 'created_at',
              render: (v) => new Date(v).toLocaleString(),
            },
            { title: 'Action', dataIndex: 'action', render: (v) => <Tag>{v}</Tag> },
            { title: 'Entity', dataIndex: 'entity_type' },
            { title: 'Entity ID', dataIndex: 'entity_id', ellipsis: true },
            { title: 'Actor', dataIndex: 'actor_id', ellipsis: true },
          ]}
        />
      )}
    </div>
  );
}
