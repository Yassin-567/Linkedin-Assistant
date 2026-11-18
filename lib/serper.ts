const MAX_QUERY_LENGTH = 420;
const MAX_RESULTS_PER_PAGE = 10;

export type SerperSearchOptions = {
  gl?: string;
  hl?: string;
  page?: number;
};

/**
 * Keep queries within the plain-text subset supported by Serper free accounts.
 * Exact-phrase quotes and Google search operators (for example site:) are
 * intentionally removed. Results are filtered by the app after retrieval.
 */
export function normalizeSerperQuery(value: string): string {
  return value
    .replace(/["'“”‘’]/g, " ")
    .replace(/\b(?:OR|AND|NOT)\b/gi, " ")
    .replace(/(?:^|\s)(?:site|inurl|intitle|allintitle|intext|allintext|filetype|cache|related):\S+/gi, " ")
    .replace(/[()[\]{}|]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, MAX_QUERY_LENGTH);
}

export async function serperSearch(
  apiKey: string,
  query: string,
  options: SerperSearchOptions = {}
): Promise<any> {
  const q = normalizeSerperQuery(query);
  if (!q) throw new Error("Search query is empty after removing unsupported search operators.");

  const payload: Record<string, string | number> = {
    q,
    hl: options.hl || "en",
    num: MAX_RESULTS_PER_PAGE
  };
  if (options.gl) payload.gl = options.gl;
  if (Number.isInteger(options.page) && (options.page || 0) > 1) {
    payload.page = Math.min(options.page as number, 10);
  }

  const response = await fetch("https://google.serper.dev/search", {
    method: "POST",
    headers: {
      "X-API-KEY": apiKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload),
    cache: "no-store"
  });

  if (!response.ok) {
    console.error("Serper search failed", response.status);
    if (response.status === 429) {
      throw new Error("Search provider limit reached. Try again later.");
    }
    if (response.status === 400) {
      throw new Error("Search provider rejected the query (HTTP 400). Check the Serper account restrictions and query settings.");
    }
    throw new Error(`Search provider returned HTTP ${response.status}.`);
  }

  return response.json();
}
