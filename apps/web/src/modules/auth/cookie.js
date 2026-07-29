const ACCESS_COOKIE = 'access_token';
const REFRESH_COOKIE = 'refresh_token';

function cookieSecure() {
  return process.env.COOKIE_SECURE === 'true' || process.env.NODE_ENV === 'production';
}

/**
 * @param {string} name
 * @param {string} value
 * @param {{ maxAge?: number }} [opts]
 */
export function buildCookie(name, value, opts = {}) {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=Lax',
  ];
  if (cookieSecure()) parts.push('Secure');
  if (opts.maxAge != null) parts.push(`Max-Age=${opts.maxAge}`);
  return parts.join('; ');
}

export function clearCookie(name) {
  return buildCookie(name, '', { maxAge: 0 });
}

/**
 * @param {Response} response
 * @param {{ accessToken: string, refreshToken: string }} tokens
 */
export function attachAuthCookies(response, tokens) {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', buildCookie(ACCESS_COOKIE, tokens.accessToken, { maxAge: 15 * 60 }));
  headers.append(
    'Set-Cookie',
    buildCookie(REFRESH_COOKIE, tokens.refreshToken, { maxAge: 7 * 24 * 60 * 60 }),
  );
  return new Response(response.body, { status: response.status, headers });
}

/**
 * @param {Response} response
 */
export function clearAuthCookies(response) {
  const headers = new Headers(response.headers);
  headers.append('Set-Cookie', clearCookie(ACCESS_COOKIE));
  headers.append('Set-Cookie', clearCookie(REFRESH_COOKIE));
  return new Response(response.body, { status: response.status, headers });
}

/**
 * @param {Request} request
 * @param {string} name
 */
export function getCookie(request, name) {
  const header = request.headers.get('cookie') || '';
  const match = header.match(new RegExp(`(?:^|;\\s*)${name}=([^;]*)`));
  return match ? decodeURIComponent(match[1]) : null;
}

/**
 * Extract access token from cookie or Authorization Bearer.
 * @param {Request} request
 */
export function extractAccessToken(request) {
  const bearer = request.headers.get('authorization');
  if (bearer?.startsWith('Bearer ')) return bearer.slice(7);
  return getCookie(request, ACCESS_COOKIE);
}

export function extractRefreshToken(request) {
  const bearer = request.headers.get('x-refresh-token');
  if (bearer) return bearer;
  return getCookie(request, REFRESH_COOKIE);
}

export { ACCESS_COOKIE, REFRESH_COOKIE };
