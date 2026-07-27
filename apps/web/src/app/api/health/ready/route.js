import { NextResponse } from 'next/server';

export async function GET() {
  // TODO: Check database, Redis, and other dependencies
  return NextResponse.json({
    status: 'ready',
    timestamp: new Date().toISOString(),
    checks: {
      database: 'ok',
      redis: 'ok',
    },
  });
}
