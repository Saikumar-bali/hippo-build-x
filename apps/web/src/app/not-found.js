'use client';

import { Button, Result } from 'antd';

export default function NotFound() {
  return (
    <Result
      status="404"
      title="404"
      subTitle="Page not found"
      extra={<Button type="primary" href="/">Back Home</Button>}
    />
  );
}
