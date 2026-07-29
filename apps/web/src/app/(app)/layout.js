'use client';

import { useEffect, useState } from 'react';
import { Layout, Menu, Typography, Button, Spin, theme } from 'antd';
import {
  DashboardOutlined,
  TeamOutlined,
  SafetyOutlined,
  BgColorsOutlined,
  ApiOutlined,
  AuditOutlined,
  LogoutOutlined,
  ProjectOutlined,
} from '@ant-design/icons';
import { usePathname, useRouter } from 'next/navigation';

const { Header, Sider, Content } = Layout;

const items = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: 'Dashboard' },
  { key: '/projects', icon: <ProjectOutlined />, label: 'Projects' },
  { key: '/admin/users', icon: <TeamOutlined />, label: 'Users' },
  { key: '/admin/roles', icon: <SafetyOutlined />, label: 'Roles' },
  { key: '/admin/branding', icon: <BgColorsOutlined />, label: 'Branding' },
  { key: '/admin/channels', icon: <ApiOutlined />, label: 'Channels' },
  { key: '/admin/audit', icon: <AuditOutlined />, label: 'Audit' },
];

export default function AppShellLayout({ children }) {
  const pathname = usePathname();
  const router = useRouter();
  const [me, setMe] = useState(null);
  const [loading, setLoading] = useState(true);
  const { token } = theme.useToken();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/v1/auth/me');
        if (res.status === 401) {
          router.replace('/login');
          return;
        }
        const json = await res.json();
        if (!cancelled) setMe(json.data);
      } catch {
        router.replace('/login');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST' });
    router.replace('/login');
  }

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center' }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth={64} theme="light" style={{ borderRight: `1px solid ${token.colorBorderSecondary}` }}>
        <div style={{ padding: 16, fontWeight: 700 }}>Hippo Build X</div>
        <Menu
          mode="inline"
          selectedKeys={[pathname.startsWith('/projects') ? '/projects' : pathname]}
          items={items}
          onClick={({ key }) => router.push(key)}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: token.colorBgContainer,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingInline: 24,
            borderBottom: `1px solid ${token.colorBorderSecondary}`,
          }}
        >
          <Typography.Text>
            {me?.user?.name} · {me?.tenant?.slug}
          </Typography.Text>
          <Button icon={<LogoutOutlined />} onClick={logout}>
            Logout
          </Button>
        </Header>
        <Content style={{ padding: 24 }}>{children}</Content>
      </Layout>
    </Layout>
  );
}
