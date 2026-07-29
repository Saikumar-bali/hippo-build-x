'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Spin,
  Table,
  Tabs,
  Tag,
  message,
} from 'antd';
import { useParams, useRouter } from 'next/navigation';

async function api(path, opts) {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json', ...(opts?.headers || {}) },
    ...opts,
  });
  const json = await res.json();
  if (!res.ok || json.success === false) {
    throw new Error(json.errors?.[0]?.message || 'Request failed');
  }
  return json.data;
}

export default function ProjectDetailPage() {
  const { id } = useParams();
  const router = useRouter();
  const [project, setProject] = useState(null);
  const [structure, setStructure] = useState({
    blocks: [],
    towers: [],
    floors: [],
    categories: [],
  });
  const [units, setUnits] = useState([]);
  const [planning, setPlanning] = useState({ milestones: [], tasks: [], dependencies: [] });
  const [boq, setBoq] = useState([]);
  const [drawings, setDrawings] = useState([]);
  const [rfis, setRfis] = useState([]);
  const [issues, setIssues] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [modal, setModal] = useState(null);
  const [form] = Form.useForm();

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [p, s, u, t, b, d, r, i] = await Promise.all([
        api(`/api/v1/projects/${id}`),
        api(`/api/v1/projects/${id}/structure`),
        api(`/api/v1/projects/${id}/units`),
        api(`/api/v1/projects/${id}/tasks`),
        api(`/api/v1/projects/${id}/boq`),
        api(`/api/v1/projects/${id}/drawings`),
        api(`/api/v1/projects/${id}/rfis`),
        api(`/api/v1/projects/${id}/issues`),
      ]);
      setProject(p);
      setStructure(s);
      setUnits(u || []);
      setPlanning(t || { milestones: [], tasks: [], dependencies: [] });
      setBoq(b || []);
      setDrawings(d || []);
      setRfis(r || []);
      setIssues(i || []);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function submitModal(values) {
    try {
      if (modal === 'block') {
        await api(`/api/v1/projects/${id}/blocks`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      } else if (modal === 'tower') {
        await api(`/api/v1/projects/${id}/towers`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      } else if (modal === 'floor') {
        await api(`/api/v1/projects/${id}/floors`, {
          method: 'POST',
          body: JSON.stringify({
            towerId: values.towerId,
            floorNumber: values.floorNumber,
            name: values.name,
          }),
        });
      } else if (modal === 'category') {
        await api(`/api/v1/projects/${id}/categories`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      } else if (modal === 'generate') {
        await api(`/api/v1/projects/${id}/units`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      } else if (modal === 'status') {
        await api(`/api/v1/units/${values.unitId}`, {
          method: 'PATCH',
          body: JSON.stringify({ status: values.status, reason: values.reason }),
        });
      } else if (modal === 'milestone') {
        await api(`/api/v1/projects/${id}/tasks`, {
          method: 'POST',
          body: JSON.stringify({ ...values, type: 'milestone' }),
        });
      } else if (modal === 'task') {
        await api(`/api/v1/projects/${id}/tasks`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      } else if (modal === 'dependency') {
        await api(`/api/v1/tasks/${values.successorId}/dependencies`, {
          method: 'POST',
          body: JSON.stringify({ predecessorId: values.predecessorId }),
        });
      } else if (modal === 'boq') {
        await api(`/api/v1/projects/${id}/boq`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      } else if (modal === 'drawing') {
        await api(`/api/v1/projects/${id}/drawings`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      } else if (modal === 'rfi') {
        await api(`/api/v1/projects/${id}/rfis`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      } else if (modal === 'issue') {
        await api(`/api/v1/projects/${id}/issues`, {
          method: 'POST',
          body: JSON.stringify(values),
        });
      }
      message.success('Saved');
      setModal(null);
      form.resetFields();
      await loadAll();
    } catch (e) {
      message.error(e.message);
    }
  }

  if (loading) return <Spin />;
  if (error) {
    return (
      <Alert
        type="error"
        message={error}
        action={
          <Button size="small" onClick={() => router.push('/projects')}>
            Back
          </Button>
        }
      />
    );
  }

  const statusColors = {
    available: 'green',
    reserved: 'blue',
    sold: 'purple',
    blocked: 'orange',
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button onClick={() => router.push('/projects')}>Back</Button>
        <h2 style={{ margin: 0 }}>
          {project?.name} <Tag>{project?.code}</Tag>
        </h2>
      </Space>

      <Tabs
        items={[
          {
            key: 'structure',
            label: 'Structure',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="large">
                <Space wrap>
                  <Button onClick={() => setModal('block')}>Add block</Button>
                  <Button onClick={() => setModal('tower')}>Add tower</Button>
                  <Button onClick={() => setModal('floor')}>Add floor</Button>
                  <Button onClick={() => setModal('category')}>Add category</Button>
                </Space>
                <Table
                  title={() => 'Blocks'}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={structure.blocks}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Code', dataIndex: 'code' },
                  ]}
                />
                <Table
                  title={() => 'Towers'}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={structure.towers}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Code', dataIndex: 'code' },
                    { title: 'Floors planned', dataIndex: 'floors_planned' },
                  ]}
                />
                <Table
                  title={() => 'Floors'}
                  rowKey="id"
                  size="small"
                  dataSource={structure.floors}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Number', dataIndex: 'floor_number' },
                    { title: 'Tower', dataIndex: 'tower_id', ellipsis: true },
                  ]}
                />
                <Table
                  title={() => 'Unit categories'}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={structure.categories}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Code', dataIndex: 'code' },
                    { title: 'Beds', dataIndex: 'bedrooms' },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'units',
            label: 'Units',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Button type="primary" onClick={() => setModal('generate')}>
                  Generate units
                </Button>
                <Table
                  rowKey="id"
                  dataSource={units}
                  columns={[
                    { title: 'Unit', dataIndex: 'unit_number' },
                    { title: 'Tower', dataIndex: 'tower_code' },
                    { title: 'Floor', dataIndex: 'floor_number' },
                    { title: 'Category', dataIndex: 'category_name' },
                    {
                      title: 'Status',
                      dataIndex: 'status',
                      render: (v) => <Tag color={statusColors[v] || 'default'}>{v}</Tag>,
                    },
                    {
                      title: '',
                      render: (_, row) => (
                        <Button
                          size="small"
                          onClick={() => {
                            setModal('status');
                            form.setFieldsValue({ unitId: row.id, status: row.status });
                          }}
                        >
                          Change status
                        </Button>
                      ),
                    },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'tasks',
            label: 'Tasks',
            children: (
              <Space direction="vertical" style={{ width: '100%' }} size="middle">
                <Space wrap>
                  <Button onClick={() => setModal('milestone')}>Add milestone</Button>
                  <Button onClick={() => setModal('task')}>Add task</Button>
                  <Button onClick={() => setModal('dependency')}>Add dependency</Button>
                </Space>
                <Table
                  title={() => 'Milestones'}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={planning.milestones}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Start', dataIndex: 'start_date' },
                    { title: 'End', dataIndex: 'end_date' },
                  ]}
                />
                <Table
                  title={() => 'Tasks (Gantt-lite)'}
                  rowKey="id"
                  dataSource={planning.tasks}
                  columns={[
                    { title: 'Name', dataIndex: 'name' },
                    { title: 'Start', dataIndex: 'start_date' },
                    { title: 'End', dataIndex: 'end_date' },
                    { title: 'Status', dataIndex: 'status' },
                    {
                      title: 'Timeline',
                      render: (_, row) => (
                        <div
                          style={{
                            height: 8,
                            background: '#e6f4ff',
                            borderRadius: 4,
                            position: 'relative',
                            minWidth: 120,
                          }}
                        >
                          <div
                            style={{
                              position: 'absolute',
                              left: '10%',
                              width: '60%',
                              height: '100%',
                              background: '#1677ff',
                              borderRadius: 4,
                              opacity: 0.7,
                            }}
                            title={`${row.start_date || '?'} → ${row.end_date || '?'}`}
                          />
                        </div>
                      ),
                    },
                  ]}
                />
                <Table
                  title={() => 'Dependencies (FS)'}
                  rowKey="id"
                  size="small"
                  pagination={false}
                  dataSource={planning.dependencies}
                  columns={[
                    { title: 'Predecessor', dataIndex: 'predecessor_id', ellipsis: true },
                    { title: 'Successor', dataIndex: 'successor_id', ellipsis: true },
                    { title: 'Type', dataIndex: 'dependency_type' },
                  ]}
                />
              </Space>
            ),
          },
          {
            key: 'boq',
            label: 'BOQ',
            children: (
              <>
                <Button style={{ marginBottom: 12 }} onClick={() => setModal('boq')}>
                  Add BOQ item
                </Button>
                <Table
                  rowKey="id"
                  dataSource={boq}
                  columns={[
                    { title: 'Code', dataIndex: 'code' },
                    { title: 'Description', dataIndex: 'description' },
                    { title: 'Qty', dataIndex: 'quantity' },
                    { title: 'Rate', dataIndex: 'rate' },
                    { title: 'Amount', dataIndex: 'amount' },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'drawings',
            label: 'Drawings',
            children: (
              <>
                <Button style={{ marginBottom: 12 }} onClick={() => setModal('drawing')}>
                  Add / new version
                </Button>
                <Table
                  rowKey="id"
                  dataSource={drawings}
                  columns={[
                    { title: 'Number', dataIndex: 'drawing_number' },
                    { title: 'Title', dataIndex: 'title' },
                    { title: 'Version', dataIndex: 'version' },
                    { title: 'File', dataIndex: 'file_url', ellipsis: true },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'rfis',
            label: 'RFIs',
            children: (
              <>
                <Button style={{ marginBottom: 12 }} onClick={() => setModal('rfi')}>
                  Raise RFI
                </Button>
                <Table
                  rowKey="id"
                  dataSource={rfis}
                  columns={[
                    { title: 'Title', dataIndex: 'title' },
                    { title: 'Status', dataIndex: 'status' },
                    { title: 'Question', dataIndex: 'question', ellipsis: true },
                  ]}
                />
              </>
            ),
          },
          {
            key: 'issues',
            label: 'Issues',
            children: (
              <>
                <Button style={{ marginBottom: 12 }} onClick={() => setModal('issue')}>
                  Log issue
                </Button>
                <Table
                  rowKey="id"
                  dataSource={issues}
                  columns={[
                    { title: 'Title', dataIndex: 'title' },
                    { title: 'Severity', dataIndex: 'severity' },
                    { title: 'Status', dataIndex: 'status' },
                  ]}
                />
              </>
            ),
          },
        ]}
      />

      <Modal
        title={modal}
        open={Boolean(modal)}
        onCancel={() => {
          setModal(null);
          form.resetFields();
        }}
        footer={null}
        destroyOnClose
      >
        <Form form={form} layout="vertical" onFinish={submitModal}>
          {modal === 'block' && (
            <>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="code" label="Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
            </>
          )}
          {modal === 'tower' && (
            <>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="code" label="Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="blockId" label="Block">
                <Select
                  allowClear
                  options={structure.blocks.map((b) => ({ value: b.id, label: b.name }))}
                />
              </Form.Item>
              <Form.Item name="floorsPlanned" label="Floors planned">
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
            </>
          )}
          {modal === 'floor' && (
            <>
              <Form.Item name="towerId" label="Tower" rules={[{ required: true }]}>
                <Select options={structure.towers.map((t) => ({ value: t.id, label: t.name }))} />
              </Form.Item>
              <Form.Item name="floorNumber" label="Floor number" rules={[{ required: true }]}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
              <Form.Item name="name" label="Name">
                <Input />
              </Form.Item>
            </>
          )}
          {modal === 'category' && (
            <>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="code" label="Code" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="bedrooms" label="Bedrooms">
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </>
          )}
          {modal === 'generate' && (
            <>
              <Form.Item name="towerId" label="Tower" rules={[{ required: true }]}>
                <Select options={structure.towers.map((t) => ({ value: t.id, label: t.name }))} />
              </Form.Item>
              <Form.Item name="categoryId" label="Category">
                <Select
                  allowClear
                  options={structure.categories.map((c) => ({ value: c.id, label: c.name }))}
                />
              </Form.Item>
              <Form.Item name="floorFrom" label="Floor from" rules={[{ required: true }]} initialValue={1}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
              <Form.Item name="floorTo" label="Floor to" rules={[{ required: true }]} initialValue={10}>
                <InputNumber style={{ width: '100%' }} min={1} />
              </Form.Item>
              <Form.Item name="unitsPerFloor" label="Units per floor" initialValue={4}>
                <InputNumber style={{ width: '100%' }} min={1} max={50} />
              </Form.Item>
              <Form.Item name="unitPrefix" label="Unit prefix" initialValue="A">
                <Input />
              </Form.Item>
            </>
          )}
          {modal === 'status' && (
            <>
              <Form.Item name="unitId" hidden>
                <Input />
              </Form.Item>
              <Form.Item name="status" label="Status" rules={[{ required: true }]}>
                <Select
                  options={['available', 'reserved', 'sold', 'blocked'].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </Form.Item>
              <Form.Item name="reason" label="Reason">
                <Input />
              </Form.Item>
            </>
          )}
          {modal === 'milestone' && (
            <>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="startDate" label="Start (YYYY-MM-DD)">
                <Input />
              </Form.Item>
              <Form.Item name="endDate" label="End (YYYY-MM-DD)">
                <Input />
              </Form.Item>
            </>
          )}
          {modal === 'task' && (
            <>
              <Form.Item name="name" label="Name" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="milestoneId" label="Milestone">
                <Select
                  allowClear
                  options={planning.milestones.map((m) => ({ value: m.id, label: m.name }))}
                />
              </Form.Item>
              <Form.Item name="startDate" label="Start (YYYY-MM-DD)">
                <Input />
              </Form.Item>
              <Form.Item name="endDate" label="End (YYYY-MM-DD)">
                <Input />
              </Form.Item>
            </>
          )}
          {modal === 'dependency' && (
            <>
              <Form.Item name="predecessorId" label="Predecessor" rules={[{ required: true }]}>
                <Select options={planning.tasks.map((t) => ({ value: t.id, label: t.name }))} />
              </Form.Item>
              <Form.Item name="successorId" label="Successor" rules={[{ required: true }]}>
                <Select options={planning.tasks.map((t) => ({ value: t.id, label: t.name }))} />
              </Form.Item>
            </>
          )}
          {modal === 'boq' && (
            <>
              <Form.Item name="code" label="Code">
                <Input />
              </Form.Item>
              <Form.Item name="description" label="Description" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="quantity" label="Quantity" initialValue={1}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
              <Form.Item name="rate" label="Rate" initialValue={0}>
                <InputNumber style={{ width: '100%' }} min={0} />
              </Form.Item>
            </>
          )}
          {modal === 'drawing' && (
            <>
              <Form.Item name="drawingNumber" label="Drawing number" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="fileUrl" label="File URL">
                <Input />
              </Form.Item>
              <Form.Item name="notes" label="Notes">
                <Input.TextArea />
              </Form.Item>
            </>
          )}
          {modal === 'rfi' && (
            <>
              <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="question" label="Question" rules={[{ required: true }]}>
                <Input.TextArea />
              </Form.Item>
            </>
          )}
          {modal === 'issue' && (
            <>
              <Form.Item name="title" label="Title" rules={[{ required: true }]}>
                <Input />
              </Form.Item>
              <Form.Item name="description" label="Description">
                <Input.TextArea />
              </Form.Item>
              <Form.Item name="severity" label="Severity" initialValue="medium">
                <Select
                  options={['low', 'medium', 'high', 'critical'].map((v) => ({
                    value: v,
                    label: v,
                  }))}
                />
              </Form.Item>
            </>
          )}
          <Button type="primary" htmlType="submit" block>
            Save
          </Button>
        </Form>
      </Modal>
    </div>
  );
}
