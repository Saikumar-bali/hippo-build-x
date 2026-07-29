'use client';

import { ConfigProvider } from 'antd';

const corporateBlueTheme = {
  token: {
    colorPrimary: '#1D4ED8',
    colorPrimaryHover: '#1E40AF',
    colorPrimaryActive: '#1E3A8A',
    colorPrimaryBg: '#DBEAFE',
    colorPrimaryBgHover: '#BFDBFE',
    colorSuccess: '#15803D',
    colorWarning: '#D97706',
    colorError: '#B91C1C',
    colorInfo: '#0369A1',
    colorText: '#0F172A',
    colorTextSecondary: '#64748B',
    colorBorder: '#D7E0EC',
    colorBgContainer: '#FFFFFF',
    colorBgLayout: '#F4F7FB',
    colorBgElevated: '#FFFFFF',
    borderRadius: 10,
    fontFamily: '-apple-system, BlinkMacSystemFont, Segoe UI, Roboto, Helvetica Neue, Arial, sans-serif',
  },
  components: {
    Layout: {
      headerBg: '#082F49',
      headerColor: '#E0F2FE',
      siderBg: '#082F49',
      bodyBg: '#F4F7FB',
    },
    Menu: {
      darkItemBg: '#082F49',
      darkItemSelectedBg: '#1D4ED8',
      darkItemColor: '#E0F2FE',
      darkItemSelectedColor: '#FFFFFF',
    },
    Button: {
      primaryShadow: '0 2px 0 rgba(29, 78, 216, 0.3)',
    },
    Card: {
      borderRadiusLG: 10,
    },
    Table: {
      borderRadius: 10,
      headerBg: '#F4F7FB',
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
