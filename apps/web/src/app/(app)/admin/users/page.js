'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Form,
  Input,
  Modal,
  Popconfirm,
  Select,
  Space,
  Table,
  Tag,
  message,
  Empty,
  Spin,
} from 'antd';

export default function UsersAdminPage() {
  const [users, setUsers] = useState([]);
  const [roles, setRoles] = useState([]);
  const [scope, setScope] = useState({ projects: [], locations: [] });
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form] = Form.useForm();
  const [editForm] = Form.useForm();

  async function load() {
    setLoading(true);
    try {
      const [u, r, s] = await Promise.all([
        fetch('/api/v1/admin/users').then((x) => x.json()),
        fetch('/api/v1/admin/roles').then((x) => x.json()),
        fetch('/api/v1/admin/scope-options').then((x) => x.json()),
      ]);
      setUsers(u.data || []);
      setRoles(r.data || []);
      setScope(s.data || { projects: [], locations: [] });
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createUser(values) {
    const res = await fetch('/api/v1/admin/users', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      message.error(json.errors?.[0]?.message || 'Create failed');
      return;
    }
    message.success('User created');
    setOpen(false);
    form.resetFields();
    load();
  }

  async function updateUser(values) {
    const res = await fetch(`/api/v1/admin/users/${editing.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!res.ok || !json.success) {
      message.error(json.errors?.[0]?.message || 'Update failed');
      return;
    }
    message.success('User updated');
    setEditing(null);
    editForm.resetFields();
    load();
  }

  async function setStatus(user, status) {
    const res = await fetch(`/api/v1/admin/users/${user.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    const json = await res.json();
    if (!res.ok) {
      message.error(json.errors?.[0]?.message || 'Status update failed');
      return;
    }
    message.success(status === 'active' ? 'User activated' : 'User suspended');
    load();
  }

  async function removeUser(user) {
    const res = await fetch(`/api/v1/admin/users/${user.id}`, { method: 'DELETE' });
    const json = await res.json();
    if (!res.ok) {
      message.error(json.errors?.[0]?.message || 'Delete failed');
      return;
    }
    message.success('User deleted');
    load();
  }

  function openEdit(user) {
    const first = (user.assignments || [])[0];
    setEditing(user);
    editForm.setFieldsValue({
      name: user.name,
      email: user.email,
      status: user.status,
      roleId: first?.roleId || first?.role_id,
      projectId: first?.projectId || first?.project_id,
      locationId: first?.locationId || first?.location_id,
    });
  }

  const columns = [
    { title: 'Name', dataIndex: 'name' },
    { title: 'Email', dataIndex: 'email' },
    {
      title: 'Status',
      dataIndex: 'status',
      render: (v) => <Tag color={v === 'active' ? 'green' : 'orange'}>{v}</Tag>,
    },
    {
      title: 'Assignments',
      dataIndex: 'assignments',
      render: (a) =>
        (a || []).map((x) => (
          <Tag key={`${x.roleId || x.role_id}-${x.projectId || x.project_id}`}>
            {x.roleName || x.role_name}
            {(x.projectId || x.project_id) ? ' · project' : ''}
          </Tag>
        )),
    },
    {
      title: 'Actions',
      render: (_, row) => (
        <Space wrap>
          <Button size="small" onClick={() => openEdit(row)}>
            Edit
          </Button>
          {row.status === 'active' ? (
            <Button size="small" danger onClick={() => setStatus(row, 'suspended')}>
              Suspend
            </Button>
          ) : (
            <Button size="small" onClick={() => setStatus(row, 'active')}>
              Activate
            </Button>
          )}
          <Popconfirm title="Delete this user?" onConfirm={() => removeUser(row)}>
            <Button size="small" danger>
              Delete
            </Button>
          </Popconfirm>
        </Space>
      ),
    },
  ];

  const assignmentFields = (
    <>
      <Form.Item name="roleId" label="Role">
        <Select options={roles.map((r) => ({ value: r.id, label: r.name }))} allowClear />
      </Form.Item>
      <Form.Item name="projectId" label="Project">
        <Select
          options={(scope.projects || []).map((p) => ({ value: p.id, label: p.name }))}
          allowClear
        />
      </Form.Item>
      <Form.Item name="locationId" label="Location">
        <Select
          options={(scope.locations || []).map((l) => ({ value: l.id, label: l.name }))}
          allowClear
        />
      </Form.Item>
    </>
  );

  if (loading) return <Spin />;

  return (
    <div>
      <Space style={{ marginBottom: 16, width: '100%', justifyContent: 'space-between' }}>
        <h2 style={{ margin: 0 }}>Users</h2>
        <Button type="primary" onClick={() => setOpen(true)}>
          Create user
        </Button>
      </Space>
      {!users.length ? (
        <Empty description="No users" />
      ) : (
        <Table rowKey="id" dataSource={users} columns={columns} />
      )}

      <Modal title="Create user" open={open} onCancel={() => setOpen(false)} footer={null} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={createUser}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="password" label="Password" rules={[{ required: true, min: 8 }]}>
            <Input.Password />
          </Form.Item>
          {assignmentFields}
          <Button type="primary" htmlType="submit" block>
            Save
          </Button>
        </Form>
      </Modal>

      <Modal
        title={`Edit ${editing?.name || ''}`}
        open={Boolean(editing)}
        onCancel={() => setEditing(null)}
        footer={null}
        destroyOnHidden
      >
        <Form form={editForm} layout="vertical" onFinish={updateUser}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input />
          </Form.Item>
          <Form.Item name="email" label="Email" rules={[{ required: true, type: 'email' }]}>
            <Input />
          </Form.Item>
          <Form.Item name="status" label="Status">
            <Select
              options={[
                { value: 'active', label: 'active' },
                { value: 'suspended', label: 'suspended' },
                { value: 'inactive', label: 'inactive' },
              ]}
            />
          </Form.Item>
          <Form.Item name="password" label="New password">
            <Input.Password placeholder="Leave blank to keep" />
          </Form.Item>
          {assignmentFields}
          <Button type="primary" htmlType="submit" block>
            Save changes
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
