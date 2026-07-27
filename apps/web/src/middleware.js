import { NextResponse } from 'next/server';

/**
 * Next.js middleware — runs on every request.
 * Handles tenant resolution and auth checks.
 */
export function middleware(request) {
  const { pathname } = request.nextUrl;

  // API routes handle their own auth
  if (pathname.startsWith('/api/')) {
    return NextResponse.next();
  }

  // Public routes
  const publicPaths = ['/login', '/register', '/forgot-password'];
  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  // TODO: Check for auth token cookie
  // const token = request.cookies.get('access_token')?.value;
  // if (!token) {
  //   return NextResponse.redirect(new URL('/login', request.url));
  // }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|public/).*)',
  ],
};
