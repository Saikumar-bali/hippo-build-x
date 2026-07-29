import { NextResponse } from 'next/server';

const PUBLIC_PREFIXES = [
  '/login',
  '/forgot-password',
  '/reset-password',
  '/platform/login',
  '/api/v1/auth/login',
  '/api/v1/auth/refresh',
  '/api/v1/auth/forgot-password',
  '/api/v1/auth/reset-password',
  '/api/v1/platform/auth/login',
  '/api/v1/platform/auth/logout',
  '/api/v1/health',
];

export function middleware(request) {
  const requestId = request.headers.get('x-request-id') || crypto.randomUUID();
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-request-id', requestId);

  const { pathname } = request.nextUrl;
  const isPublic =
    pathname === '/' ||
    PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  const hasAccess = Boolean(
    request.cookies.get('access_token')?.value ||
      request.headers.get('authorization')?.startsWith('Bearer '),
  );

  if (!isPublic && pathname.startsWith('/platform') && !hasAccess) {
    return NextResponse.redirect(new URL('/platform/login', request.url));
  }
  if (!isPublic && pathname.startsWith('/projects') && !hasAccess) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (!isPublic && pathname.startsWith('/admin') && !hasAccess) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (!isPublic && pathname.startsWith('/dashboard') && !hasAccess) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const response = NextResponse.next({ request: { headers: requestHeaders } });
  response.headers.set('x-request-id', requestId);
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public/).*)'],
};
