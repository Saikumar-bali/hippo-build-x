'use client';

import { Spin } from 'antd';

export default function Loading() {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
      <Spin size="large" />
    </div>
  );
}
