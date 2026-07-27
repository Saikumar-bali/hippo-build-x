import { query, queryOne } from '@/lib/db';

export async function GET() {
  try {
    const result = await queryOne('SELECT 1 as test');
    return Response.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      service: 'hippo-web',
      database: result ? 'ok' : 'error',
    });
  } catch (error) {
    return Response.json({
      status: 'error',
      timestamp: new Date().toISOString(),
      database: error.message,
    }, { status: 503 });
  }
}
