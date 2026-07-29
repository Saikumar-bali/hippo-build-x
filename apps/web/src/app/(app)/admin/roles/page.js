'use client';

import { useEffect, useState } from 'react';
import { Button, Form, Input, Modal, Select, Space, Table, Tag, message, Spin } from 'antd';

const ALL_PERMS = [
  'user.create',
  'user.read',
  'user.update',
  'user.delete',
  'role.create',
  'role.read',
  'role.update',
  'role.delete',
  'audit.read',
  'tenant.manage',
  'tenant.branding',
  'feature_flag.manage',
  'project.create',
  'project.read',
  'project.update',
  'project.delete',
  'unit.create',
  'unit.read',
  'unit.update',
  'task.create',
  'task.read',
  'task.update',
  'boq.manage',
  'drawing.manage',
  'rfi.manage',
  'issue.manage',
  'progress.submit',
  'progress.read',
  'progress.approve',
];

export default function RolesAdminPage() {
  const [roles, setRoles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [creating, setCreating] = useState(false);
  const [form] = Form.useForm();
  const [createForm] = Form.useForm();

  async function load() {
    setLoading(true);
    const res = await fetch('/api/v1/admin/roles');
    const json = await res.json();
    setRoles(json.data || []);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  async function save(values) {
    const res = await fetch(`/api/v1/admin/roles/${editing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!res.ok) {
      message.error(json.errors?.[0]?.message || 'Update failed');
      return;
    }
    message.success('Role updated');
    setEditing(null);
    load();
  }

  async function createRole(values) {
    const res = await fetch('/api/v1/admin/roles', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!res.ok) {
      message.error(json.errors?.[0]?.message || 'Create failed');
      return;
    }
    message.success('Role created');
    setCreating(false);
    createForm.resetFields();
    load();
  }

  if (loading) return <Spin />;

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Roles</h2>
        <Button type="primary" onClick={() => setCreating(true)}>
          Create role
        </Button>
      </Space>
      <Table
        rowKey="id"
        dataSource={roles}
        columns={[
          { title: 'Name', dataIndex: 'name' },
          { title: 'Description', dataIndex: 'description' },
          {
            title: 'System',
            dataIndex: 'is_system',
            render: (v) => (v ? <Tag>system</Tag> : null),
          },
          {
            title: 'Permissions',
            dataIndex: 'permissions',
            render: (p) => (Array.isArray(p) ? p.slice(0, 4).join(', ') : ''),
          },
          {
            title: '',
            render: (_, row) => (
              <Button
                size="small"
                onClick={() => {
                  setEditing(row);
                  form.setFieldsValue({
                    description: row.description,
                    permissions: Array.isArray(row.permissions) ? row.permissions : [],
                  });
                }}
              >
                Edit
              </Button>
            ),
          },
        ]}
      />
      <Modal
        title={`Edit ${editing?.name || ''}`}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        footer={null}
      >
        <Form form={form} layout="vertical" onFinish={save}>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item name="permissions" label="Permissions">
            <Select mode="multiple" options={ALL_PERMS.map((p) => ({ value: p, label: p }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Save
          </Button>
        </Form>
      </Modal>
      <Modal
        title="Create role"
        open={creating}
        onCancel={() => setCreating(false)}
        footer={null}
        destroyOnClose
      >
        <Form form={createForm} layout="vertical" onFinish={createRole}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input />
          </Form.Item>
          <Form.Item name="permissions" label="Permissions" initialValue={[]}>
            <Select mode="multiple" options={ALL_PERMS.map((p) => ({ value: p, label: p }))} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Create
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
