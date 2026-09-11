export const DEFAULT_PAGE = 1;
export const DEFAULT_LIMIT = 20;
export const MAX_LIMIT = 100;

export type PageParams = {
  page: number;
  limit: number;
};

export type Page<T> = {
  items: T[];
  page: number;
  limit: number;
  has_more: boolean;
};

export function parsePage(rawPage?: string, rawLimit?: string): PageParams {
  const page = rawPage === undefined ? DEFAULT_PAGE : Number(rawPage);
  const limit = rawLimit === undefined ? DEFAULT_LIMIT : Number(rawLimit);
  if (!Number.isInteger(page) || page < 1) {
    throw new Error("invalid_page");
  }
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw new Error("invalid_limit");
  }
  return { page, limit };
}

export function slicePage<T>(rows: T[], page: number, limit: number): Page<T> {
  const hasMore = rows.length > limit;
  return {
    items: hasMore ? rows.slice(0, limit) : rows,
    page,
    limit,
    has_more: hasMore,
  };
}
