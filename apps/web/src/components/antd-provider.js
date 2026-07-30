'use client';

import { ConfigProvider } from 'antd';

const corporateBlueTheme = {
  token: {
    colorPrimary: '#1e40af',
    colorPrimaryHover: '#1e3a8a',
    colorPrimaryActive: '#1e3a8a',
    colorPrimaryBg: '#dbeafe',
    colorPrimaryBgHover: '#bfdbfe',
    colorSuccess: '#16a34a',
    colorWarning: '#d97706',
    colorError: '#dc2626',
    colorInfo: '#3b82f6',
    colorText: '#0f172a',
    colorTextSecondary: '#64748b',
    colorBorder: '#e2e8f0',
    colorBgContainer: '#ffffff',
    colorBgLayout: '#f1f5f9',
    colorBgElevated: '#ffffff',
    borderRadius: 8,
    fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  },
  components: {
    Layout: {
      headerBg: '#0f2b46',
      headerColor: '#e0f2fe',
      siderBg: '#0f2b46',
      bodyBg: '#f1f5f9',
    },
    Menu: {
      darkItemBg: '#0f2b46',
      darkItemSelectedBg: '#1e40af',
      darkItemColor: '#e0f2fe',
      darkItemSelectedColor: '#ffffff',
      darkItemHoverColor: '#ffffff',
      darkItemHoverBg: '#1e3a5f',
    },
    Button: {
      primaryShadow: '0 2px 0 rgba(30, 64, 175, 0.3)',
    },
    Card: {
      borderRadiusLG: 8,
    },
    Table: {
      borderRadius: 8,
      headerBg: '#f1f5f9',
    },
  },
};

export default function AntdProvider({ children }) {
  return (
    <ConfigProvider theme={corporateBlueTheme}>
      {children}
    </ConfigProvider>
  );
}
