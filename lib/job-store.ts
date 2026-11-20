type SqlClient = any;

type PreparedJob = {
  index: number;
  title: string;
  company: string;
  description: string;
  salaryText: string;
  salaryMin: number | null;
  salaryMax: number | null;
  salaryCurrency: string;
  workplaceType: "remote" | "hybrid" | "on-site" | "unknown";
  employmentType: string;
  location: string;
  country: string;
  seniority: string;
  postedAt: Date | null;
  postedAtText: string;
  sourcePlatform: string;
  sourceType: string;
  sourceUrl: string;
  normalizedSourceUrl: string;
  applicationUrl: string;
  matchReason: string;
  evidenceUrls: string[];
  sourceMetadata: Record<string, unknown>;
  error: string | null;
};

function textValue(value: unknown, max: number): string {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}

function safeHttpUrl(value: unknown): string {
  if (typeof value !== "string" || !value.trim() || value.length > 2048) return "";
  try {
    const url = new URL(value.trim());
    if (url.protocol !== "https:" && url.protocol !== "http:") return "";
    if (url.username || url.password) return "";
    return url.toString();
  } catch {
    return "";
  }
}

function normalizedUrl(value: string): string {
  try {
    const url = new URL(value);
    url.hash = "";
    const trackingParams = ["fbclid", "gclid", "ref", "referrer", "source", "trk"];
    for (const key of Array.from(url.searchParams.keys())) {
      if (key.toLowerCase().startsWith("utm_") || trackingParams.includes(key.toLowerCase())) {
        url.searchParams.delete(key);
      }
    }
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return value;
  }
}

function numericValue(value: unknown): number | null {
  if (typeof value !== "number" && typeof value !== "string") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 && number <= 1_000_000_000_000 ? number : null;
}

function workplaceValue(value: unknown): PreparedJob["workplaceType"] {
  const normalized = textValue(value, 40).toLowerCase().replace(/[_\s]+/g, "-");
  if (["remote", "fully-remote", "work-from-home", "wfh"].includes(normalized)) return "remote";
  if (["hybrid", "flexible-hybrid"].includes(normalized)) return "hybrid";
  if (["on-site", "onsite", "office", "in-office", "onpremise"].includes(normalized)) return "on-site";
  return "unknown";
}

function prepareJob(value: unknown, index: number): PreparedJob {
  const job = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const title = textValue(job.title, 300);
  const sourceUrl = safeHttpUrl(job.sourceUrl ?? job.url);
  const applicationUrl = safeHttpUrl(job.applicationUrl ?? job.applyUrl);
  const error = !title
    ? "A job title is required."
    : !sourceUrl
      ? "A valid public source URL (http or https) is required."
      : null;
  const postedAtRaw = job.postedAt;
  const postedAtDate = typeof postedAtRaw === "string" || typeof postedAtRaw === "number"
    ? new Date(postedAtRaw)
    : null;
  const postedAt = postedAtDate && Number.isFinite(postedAtDate.getTime()) ? postedAtDate : null;
  const evidenceInput = Array.isArray(job.evidenceUrls) ? job.evidenceUrls : [];
  const evidenceUrls = Array.from(new Set(evidenceInput
    .map(item => safeHttpUrl(item))
    .filter(Boolean))).slice(0, 20);
  const metadata = job.sourceMetadata && typeof job.sourceMetadata === "object" && !Array.isArray(job.sourceMetadata)
    ? job.sourceMetadata as Record<string, unknown>
    : {};
  let sourceMetadata: Record<string, unknown> = {};
  try {
    const encoded = JSON.stringify(metadata);
    if (encoded.length <= 8000) sourceMetadata = metadata;
  } catch {
    sourceMetadata = {};
  }

  return {
    index,
    title,
    company: textValue(job.company, 300),
    description: textValue(job.description, 20000),
    salaryText: textValue(job.salaryText ?? job.salary, 500),
    salaryMin: numericValue(job.salaryMin),
    salaryMax: numericValue(job.salaryMax),
    salaryCurrency: textValue(job.salaryCurrency ?? job.currency, 10).toUpperCase(),
    workplaceType: workplaceValue(job.workplaceType ?? job.workMode),
    employmentType: textValue(job.employmentType ?? job.type, 80) || "unknown",
    location: textValue(job.location, 300),
    country: textValue(job.country, 120),
    seniority: textValue(job.seniority, 120),
    postedAt,
    postedAtText: textValue(job.postedAtText ?? job.postedDate, 200),
    sourcePlatform: textValue(job.sourcePlatform ?? job.source, 80) || "Other",
    sourceType: textValue(job.sourceType, 60) || "other",
    sourceUrl,
    normalizedSourceUrl: sourceUrl ? normalizedUrl(sourceUrl) : "",
    applicationUrl,
    matchReason: textValue(job.matchReason ?? job.reasonForFit, 1500),
    evidenceUrls,
    sourceMetadata,
    error
  };
}

export async function saveJobBatch(sql: SqlClient, userId: string, values: unknown[]) {
  const prepared = values.map(prepareJob);
  const results: Record<string, unknown>[] = [];
  const seen = new Set<string>();
  let saved = 0;
  let duplicates = 0;
  let invalid = 0;

  for (const job of prepared) {
    if (job.error) {
      invalid++;
      results.push({ index: job.index, status: "invalid", title: job.title, error: job.error });
      continue;
    }
    if (seen.has(job.normalizedSourceUrl)) {
      duplicates++;
      results.push({ index: job.index, status: "duplicate", title: job.title, sourceUrl: job.sourceUrl });
      continue;
    }
    seen.add(job.normalizedSourceUrl);

    const rows: any = await sql`
      INSERT INTO jobs (
        user_id, title, company, description, salary_text, salary_min, salary_max,
        salary_currency, workplace_type, employment_type, location, country,
        seniority, posted_at, posted_at_text, source_platform, source_type,
        source_url, normalized_source_url, application_url, match_reason,
        evidence_urls, source_metadata, status, notes
      ) VALUES (
        ${userId}, ${job.title}, ${job.company}, ${job.description}, ${job.salaryText},
        ${job.salaryMin}, ${job.salaryMax}, ${job.salaryCurrency}, ${job.workplaceType},
        ${job.employmentType}, ${job.location}, ${job.country}, ${job.seniority},
        ${job.postedAt}, ${job.postedAtText}, ${job.sourcePlatform}, ${job.sourceType},
        ${job.sourceUrl}, ${job.normalizedSourceUrl}, ${job.applicationUrl}, ${job.matchReason},
        ${JSON.stringify(job.evidenceUrls)}::jsonb, ${JSON.stringify(job.sourceMetadata)}::jsonb,
        'Saved', ''
      )
      ON CONFLICT (user_id, normalized_source_url) DO NOTHING
      RETURNING id::text
    `;

    if (rows.length) {
      saved++;
      results.push({ index: job.index, status: "saved", title: job.title, company: job.company, sourceUrl: job.sourceUrl });
    } else {
      duplicates++;
      results.push({ index: job.index, status: "duplicate", title: job.title, sourceUrl: job.sourceUrl });
    }
  }

  return { total: prepared.length, saved, duplicates, invalid, results };
}
