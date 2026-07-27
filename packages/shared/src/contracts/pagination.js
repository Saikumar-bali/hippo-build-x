export const DEFAULT_PAGE = 1;
export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

export function normalizePagination(params) {
  const page = Math.max(1, params.page ?? DEFAULT_PAGE);
  const pageSize = Math.min(Math.max(1, params.pageSize ?? DEFAULT_PAGE_SIZE), MAX_PAGE_SIZE);
  const offset = (page - 1) * pageSize;

  return { page, pageSize, offset };
}
