import { NextResponse } from 'next/server';

export async function POST() {
  // TODO: Revoke refresh token
  // TODO: Clear cookies

  return NextResponse.json({
    success: true,
    message: 'Logged out successfully',
  });
}
