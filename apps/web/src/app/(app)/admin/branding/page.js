'use client';

import { useEffect, useState } from 'react';
import { Button, ColorPicker, Form, Input, Switch, message, Spin, Card } from 'antd';

export default function BrandingAdminPage() {
  const [loading, setLoading] = useState(true);
  const [form] = Form.useForm();

  useEffect(() => {
    fetch('/api/v1/admin/branding')
      .then((r) => r.json())
      .then((j) => {
        const branding = j.data?.branding || {};
        const flags = j.data?.feature_flags || {};
        form.setFieldsValue({
          appName: branding.appName,
          primaryColor: branding.primaryColor || '#1677ff',
          logoUrl: branding.logoUrl,
          crm: Boolean(flags.crm),
          progress: Boolean(flags.progress),
        });
      })
      .finally(() => setLoading(false));
  }, [form]);

  async function onFinish(values) {
    const primaryColor =
      typeof values.primaryColor === 'string'
        ? values.primaryColor
        : values.primaryColor?.toHexString?.() || '#1677ff';
    const res = await fetch('/api/v1/admin/branding', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        branding: {
          appName: values.appName,
          primaryColor,
          logoUrl: values.logoUrl || null,
        },
        feature_flags: {
          crm: values.crm,
          progress: values.progress,
        },
      }),
    });
    const json = await res.json();
    if (!res.ok) {
      message.error(json.errors?.[0]?.message || 'Save failed');
      return;
    }
    message.success('Branding saved');
  }

  if (loading) return <Spin />;

  return (
    <Card title="Tenant branding">
      <Form form={form} layout="vertical" onFinish={onFinish} style={{ maxWidth: 480 }}>
        <Form.Item name="appName" label="App name">
          <Input />
        </Form.Item>
        <Form.Item name="primaryColor" label="Primary color">
          <ColorPicker showText />
        </Form.Item>
        <Form.Item name="logoUrl" label="Logo URL">
          <Input />
        </Form.Item>
        <Form.Item name="crm" label="CRM enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Form.Item name="progress" label="Progress enabled" valuePropName="checked">
          <Switch />
        </Form.Item>
        <Button type="primary" htmlType="submit">
          Save
        </Button>
      </Form>
    </Card>
  );
}
