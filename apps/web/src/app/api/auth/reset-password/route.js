import { NextResponse } from 'next/server';

export async function POST(request) {
  const body = await request.json();
  const { email } = body;

  if (!email) {
    return NextResponse.json(
      { success: false, error: 'Email is required' },
      { status: 400 },
    );
  }

  // TODO: Generate password reset token
  // TODO: Send reset email

  return NextResponse.json({
    success: true,
    message: 'If an account exists with this email, a reset link has been sent',
  });
}
