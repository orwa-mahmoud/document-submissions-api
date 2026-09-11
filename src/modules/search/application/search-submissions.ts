import { searchSubmissions as searchRows } from "../infra/search-repo.ts";

export async function searchSubmissions(input: {
  q: string;
  category?: string;
  page: number;
  limit: number;
}) {
  return searchRows(input);
}
