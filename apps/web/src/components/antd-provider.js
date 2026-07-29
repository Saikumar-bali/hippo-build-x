'use client';

import { ConfigProvider } from 'antd';

const theme = {
  token: {
    colorPrimary: '#1677ff',
    borderRadius: 6,
  },
};

export default function AntdProvider({ children }) {
  return (
    <ConfigProvider theme={theme}>
      {children}
    </ConfigProvider>
  );
}
