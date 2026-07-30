'use client';

import { useEffect, useState } from 'react';
import {
  Button,
  Empty,
  Form,
  Input,
  InputNumber,
  Modal,
  Space,
  Spin,
  Table,
  Tag,
  message,
} from 'antd';
import { useRouter } from 'next/navigation';

export default function ProjectsPage() {
  const router = useRouter();
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();

  async function load() {
    setLoading(true);
    try {
      const res = await fetch('/api/v1/projects');
      const json = await res.json();
      setProjects(json.data || []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function createProject(values) {
    const res = await fetch('/api/v1/projects', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(values),
    });
    const json = await res.json();
    if (!res.ok) {
      message.error(json.errors?.[0]?.message || 'Create failed');
      return;
    }
    message.success('Project created');
    setOpen(false);
    form.resetFields();
    router.push(`/projects/${json.data.id}`);
  }

  if (loading) return <Spin />;

  return (
    <div>
      <Space style={{ width: '100%', justifyContent: 'space-between', marginBottom: 16 }}>
        <div>
          <h2 style={{ margin: 0 }}>Projects</h2>
          <div style={{ color: '#888' }}>Property structure, units, and planning</div>
        </div>
        <Button type="primary" onClick={() => setOpen(true)}>
          Create project
        </Button>
      </Space>
      {!projects.length ? (
        <Empty description="No projects yet">
          <Button type="primary" onClick={() => setOpen(true)}>
            Create project
          </Button>
        </Empty>
      ) : (
        <Table
          rowKey="id"
          dataSource={projects}
          onRow={(row) => ({
            onClick: () => router.push(`/projects/${row.id}`),
            style: { cursor: 'pointer' },
          })}
          columns={[
            { title: 'Name', dataIndex: 'name' },
            { title: 'Code', dataIndex: 'code' },
            {
              title: 'Status',
              dataIndex: 'status',
              render: (value) => (
                <Tag color={value === 'active' ? 'green' : 'default'}>{value}</Tag>
              ),
            },
            {
              title: 'Budget',
              dataIndex: 'budget',
              render: (value) =>
                value !== null && value !== undefined
                  ? Number(value).toLocaleString()
                  : '—',
            },
          ]}
        />
      )}
      <Modal title="Create project" open={open} onCancel={() => setOpen(false)} footer={null}>
        <Form form={form} layout="vertical" onFinish={createProject}>
          <Form.Item name="name" label="Name" rules={[{ required: true }]}>
            <Input placeholder="Green Valley Residency" />
          </Form.Item>
          <Form.Item name="code" label="Code" rules={[{ required: true }]}>
            <Input placeholder="GVR" />
          </Form.Item>
          <Form.Item name="description" label="Description">
            <Input.TextArea rows={2} />
          </Form.Item>
          <Form.Item name="budget" label="Budget">
            <InputNumber style={{ width: '100%' }} min={0} />
          </Form.Item>
          <Button type="primary" htmlType="submit" block>
            Create
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
