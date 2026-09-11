import { escapeIlike, query } from "../../../infrastructure/persistence/executor.ts";

type SearchRow = {
  id: string;
  title: string;
  category: string;
  body: string;
  reference_date: string | null;
  status: string;
  scan_status: string;
  scan_progress: number;
  version: number;
  created_at: Date;
  updated_at: Date;
};

function toPublic(row: SearchRow) {
  return {
    id: row.id,
    title: row.title,
    category: row.category,
    body: row.body,
    reference_date: row.reference_date,
    status: row.status,
    scan_status: row.scan_status,
    scan_progress: row.scan_progress,
    version: row.version,
    created_at: row.created_at.toISOString(),
    updated_at: row.updated_at.toISOString(),
  };
}

export async function searchSubmissions(input: {
  q: string;
  category?: string;
  page: number;
  limit: number;
}) {
  const offset = (input.page - 1) * input.limit;
  const like = `%${escapeIlike(input.q)}%`;
  const params: unknown[] = [like, input.limit + 1, offset];
  let categorySql = "";
  if (input.category) {
    params.push(input.category);
    categorySql = `AND category = $4`;
  }
  // Tiny datasets often skip the trigram index; EXPLAIN on larger data can use
  // submissions_title_trgm_idx / submissions_body_trgm_idx. No index hint.
  const result = await query<SearchRow>(
    `SELECT id, title, category, body, reference_date, status,
            scan_status, scan_progress, version, created_at, updated_at
     FROM submissions
     WHERE (title ILIKE $1 ESCAPE '\\' OR body ILIKE $1 ESCAPE '\\')
     ${categorySql}
     ORDER BY created_at ASC, id ASC
     LIMIT $2 OFFSET $3`,
    params,
  );
  const hasMore = result.rows.length > input.limit;
  const rows = hasMore ? result.rows.slice(0, input.limit) : result.rows;
  return {
    items: rows.map(toPublic),
    page: input.page,
    limit: input.limit,
    has_more: hasMore,
  };
}
