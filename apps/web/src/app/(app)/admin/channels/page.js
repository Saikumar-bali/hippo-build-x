'use client';

import { useEffect, useState } from 'react';
import {
  Alert,
  Button,
  Card,
  Col,
  Form,
  Input,
  Row,
  Select,
  Space,
  Spin,
  Switch,
  Tag,
  Typography,
  message,
} from 'antd';
import {
  LockOutlined,
  MailOutlined,
  MessageOutlined,
  MobileOutlined,
  SafetyCertificateOutlined,
} from '@ant-design/icons';

const { Title, Text } = Typography;

function statusColor(status) {
  if (status === 'verified') return 'green';
  if (status === 'pending_verification') return 'blue';
  if (status === 'failed') return 'red';
  return 'default';
}

function ChannelHeader({ icon, title, status }) {
  return (
    <Space style={{ width: '100%', justifyContent: 'space-between' }}>
      <Space>{icon}<Text strong>{title}</Text></Space>
      <Tag color={statusColor(status)}>{(status || 'not_configured').replaceAll('_', ' ')}</Tag>
    </Space>
  );
}

export default function ChannelsAdminPage() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [form] = Form.useForm();
  const values = Form.useWatch([], form) || {};

  useEffect(() => {
    fetch('/api/v1/admin/channel-config', { cache: 'no-store' })
      .then((response) => response.json())
      .then((json) => form.setFieldsValue(json.data || {}))
      .catch(() => message.error('Unable to load channel configuration'))
      .finally(() => setLoading(false));
  }, [form]);

  async function onFinish(nextValues) {
    setSaving(true);
    try {
      const res = await fetch('/api/v1/admin/channel-config', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(nextValues),
      });
      const json = await res.json();
      if (!res.ok) {
        message.error(json.errors?.[0]?.message || 'Save failed');
        return;
      }
      form.setFieldsValue(json.data || {});
      message.success('Encrypted channel settings saved');
    } catch {
      message.error('Unable to save channel configuration');
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <Spin />;

  return (
    <div style={{ maxWidth: 1100 }}>
      <Title level={3} style={{ marginBottom: 4 }}>Notification channels</Title>
      <Text type="secondary">
        Configure tenant-owned email, SMS and WhatsApp providers.
      </Text>

      <Alert
        type="info"
        showIcon
        icon={<SafetyCertificateOutlined />}
        message="Credentials are isolated in the control plane"
        description="API keys and tokens are encrypted with AES-256-GCM, bound to this tenant and channel, versioned for key rotation, and never returned in plaintext. Existing masked values are preserved when you save."
        style={{ marginBlock: 20 }}
      />

      <Form form={form} layout="vertical" onFinish={onFinish} requiredMark={false}>
        <Row gutter={[16, 16]}>
          <Col xs={24} lg={12}>
            <Card
              title={
                <ChannelHeader
                  icon={<MailOutlined />}
                  title="Email"
                  status={values.email?.verificationStatus}
                />
              }
            >
              <Form.Item name={['email', 'enabled']} label="Enabled" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name={['email', 'provider']} label="Provider">
                <Select options={[{ value: 'brevo', label: 'Brevo' }, { value: 'smtp', label: 'SMTP' }]} />
              </Form.Item>
              <Form.Item name={['email', 'from']} label="From address" rules={[{ type: 'email' }]}>
                <Input placeholder="notifications@example.com" />
              </Form.Item>
              <Form.Item name={['email', 'username']} label="SMTP username">
                <Input autoComplete="off" />
              </Form.Item>
              <Form.Item name={['email', 'apiKey']} label="API key / password">
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
            </Card>
          </Col>

          <Col xs={24} lg={12}>
            <Card
              title={
                <ChannelHeader
                  icon={<MobileOutlined />}
                  title="SMS"
                  status={values.sms?.verificationStatus}
                />
              }
            >
              <Form.Item name={['sms', 'enabled']} label="Enabled" valuePropName="checked">
                <Switch />
              </Form.Item>
              <Form.Item name={['sms', 'provider']} label="Provider">
                <Select
                  options={[
                    { value: 'twilio', label: 'Twilio' },
                    { value: '2factor', label: '2Factor.in' },
                  ]}
                />
              </Form.Item>
              <Form.Item name={['sms', 'senderId']} label="Sender ID">
                <Input placeholder="HIPPOX" />
              </Form.Item>
              <Form.Item name={['sms', 'accountSid']} label="Account SID">
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
              <Form.Item name={['sms', 'apiKey']} label="API key / auth token">
                <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
              </Form.Item>
            </Card>
          </Col>

          <Col xs={24}>
            <Card
              title={
                <ChannelHeader
                  icon={<MessageOutlined />}
                  title="WhatsApp Business"
                  status={values.whatsapp?.verificationStatus}
                />
              }
            >
              <Row gutter={16}>
                <Col xs={24} md={8}>
                  <Form.Item name={['whatsapp', 'enabled']} label="Enabled" valuePropName="checked">
                    <Switch />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['whatsapp', 'provider']} label="Provider">
                    <Select options={[{ value: 'meta', label: 'Meta Cloud API' }, { value: 'infobip', label: 'Infobip' }]} />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['whatsapp', 'phoneNumberId']} label="Phone number ID">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['whatsapp', 'businessAccountId']} label="Business account ID">
                    <Input />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['whatsapp', 'token']} label="Access token">
                    <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
                  </Form.Item>
                </Col>
                <Col xs={24} md={8}>
                  <Form.Item name={['whatsapp', 'appSecret']} label="App secret">
                    <Input.Password prefix={<LockOutlined />} autoComplete="new-password" />
                  </Form.Item>
                </Col>
              </Row>
            </Card>
          </Col>
        </Row>

        <Space style={{ marginTop: 20 }}>
          <Button type="primary" htmlType="submit" loading={saving}>
            Save encrypted settings
          </Button>
          <Text type="secondary">Secret fields showing •••••••• will not be replaced.</Text>
        </Space>
      </Form>
    </div>
  );
}
