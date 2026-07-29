'use client';

import { Button, Result } from 'antd';

export default function Error({ error, reset }) {
  return (
    <Result
      status="500"
      title="Something went wrong"
      subTitle={error.message}
      extra={<Button type="primary" onClick={() => reset()}>Try again</Button>}
    />
  );
}
