import { NextResponse } from 'next/server';

export async function GET() {
  // TODO: Get current user from JWT token

  return NextResponse.json({
    success: true,
    data: {
      id: 'demo-user',
      email: 'demo@example.com',
      name: 'Demo User',
      roles: ['admin'],
      permissions: ['*'],
    },
  });
}
