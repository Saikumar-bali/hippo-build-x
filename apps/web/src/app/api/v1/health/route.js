import { query, queryOne } from '@/lib/db';
import { successResponse, errorResponse } from '@/lib/api-utils';

export async function GET() {
  try {
    const result = await queryOne('SELECT 1 as test');
    return successResponse({ status: 'ok', database: result ? 'ok' : 'error' });
  } catch (error) {
    return errorResponse(error.message, 503, 'DATABASE_ERROR');
  }
}
