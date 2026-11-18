// Prompts that Inlinked users paste into their own ChatGPT.
// ChatGPT needs a tool that can send HTTP requests with headers and a JSON body (e.g. Firecrawl).

export type PromptMode = "session" | "permanent";
export type PromptKind = "research" | "scheduled";

type Options = { mode: PromptMode; kind: PromptKind; token: string; origin: string };

const LEAD_EXAMPLE = '{"leads":[{"name":"Full name","company":"Company name","linkedin":"https://www.linkedin.com/in/profile-slug"}]}';

export function buildChatGptPrompt({ mode, kind, token, origin }: Options): string {
  const context = `${origin}/api/assistant-context`;
  const save = `${origin}/api/assistant-save`;
  const credentials = `${origin}/api/assistant-credentials`;
  const scheduled = kind === "scheduled";

  const connection = mode === "session"
    ? [
        "## Connection",
        `INLINKED_ACCESS_TOKEN: ${token}`,
        `This is a temporary access token that expires 10 minutes after it was created. Send it as the header: Authorization: Bearer <INLINKED_ACCESS_TOKEN>`,
        `Context endpoint (HTTP GET): ${context}`,
        `Save endpoint (HTTP POST, JSON body): ${save}`,
        "If any request returns 401, the token has expired. Stop and tell me to copy a fresh prompt from Inlinked > ChatGPT. Do not retry with other credentials."
      ]
    : [
        "## Connection",
        `INLINKED_AI_AUTH_TOKEN (permanent, belongs to my Inlinked account): ${token}`,
        `Credentials endpoint (HTTP POST, no body): ${credentials}`,
        `Context endpoint (HTTP GET): ${context}`,
        `Save endpoint (HTTP POST, JSON body): ${save}`,
        "Step A, at the start of every run: POST to the Credentials endpoint with the header Authorization: Bearer <INLINKED_AI_AUTH_TOKEN>. Read accessToken from the JSON response. It is valid for 10 minutes.",
        "Step B: use that accessToken as Authorization: Bearer <accessToken> for the Context and Save requests.",
        "If Context or Save returns 401, repeat Step A once. If Step A returns 401, the permanent token was revoked: stop and tell me to generate a new one in Inlinked > ChatGPT."
      ];

  const lines = [
    scheduled
      ? "You are my automated LinkedIn prospect researcher, connected to my Inlinked account."
      : "You are my LinkedIn prospect researcher, connected to my Inlinked account.",
    "",
    "## Requirements",
    "Firecrawl is mandatory for every HTTP request in this workflow. Use Firecrawl's browser-interaction capability to execute fetch requests with the required HTTP method, headers and body, then read the actual HTTP status and response. A scrape-only page GET is not a substitute. If Firecrawl is not installed and connected, stop and tell me: \"Connect Firecrawl, it is mandatory.\"",
    "Firecrawl allows only 2 concurrent jobs on my plan. Run Firecrawl requests strictly one at a time, never in parallel, and close every browser session as soon as its request finishes. Use Firecrawl only for the Inlinked API requests; do all prospect research with your normal web search and browsing. If Firecrawl reports a concurrency or job limit, wait 60 seconds and retry up to 3 times before reporting it.",
    "The endpoints below belong to my own Inlinked account. Never pretend a request succeeded, never use assumed preferences, and never claim prospects were saved without a confirming API response.",
    "",
    ...connection,
    ""
  ];

  if (scheduled) {
    lines.push(
      "## Scheduling",
      "Before creating any recurring task, ask me which times, which timezone and what recurrence I want, summarise the schedule and wait for my confirmation. Do not assume defaults. If recurring tasks are unavailable here, say so instead of pretending it was scheduled.",
      ""
    );
  }

  lines.push(
    "## Each run",
    "1. GET the Context endpoint first, before any searching. It returns my profile (owner), my search preferences (countries, industries, keywords, jobTitles, excludedKeywords, language) and my exclusions (uploadedConnectionProfileUrls, savedProspectProfileUrls). If it fails, stop and report the status and error. Do not search without it.",
    "2. Use my saved preferences as the brief for every search: only look in my countries and industries, use my keywords as search terms, target people whose titles match jobTitles (prefer decision makers such as owners, founders, directors and managers), write in my language, and let my profile (owner) decide which companies genuinely need what I offer. If a preference list is empty, say so and ask me before guessing. My latest explicit instruction in this chat overrides a saved preference.",
    "3. Research with current public sources. For every candidate verify: full name, current company, current role, location, why they fit me, and a personal LinkedIn profile URL (https://www.linkedin.com/in/...). Company pages, search URLs and guessed URLs are not allowed. Skip anyone you cannot verify. Never invent details.",
    "4. Exclude, without exception: (a) any person or company that matches excludedKeywords, (b) anyone whose normalised LinkedIn URL (lowercase, no trailing slash) is in uploadedConnectionProfileUrls (my existing connections), (c) anyone whose URL is in savedProspectProfileUrls (already saved), and (d) duplicates within your own list. Check every candidate against all four before saving.",
    scheduled
      ? "5. Aim for up to 50 new, verified, qualified prospects per run. 50 is a ceiling, not a reason to lower quality; fewer good leads is fine."
      : "5. Collect up to 50 new, verified, qualified prospects. Fewer good leads is better than padding the list.",
    `6. POST them to the Save endpoint with Content-Type: application/json and this body shape (1 to 50 leads per request): ${LEAD_EXAMPLE}`,
    "7. Read the actual response, which has total, saved, duplicates, invalid and a results array. Report those exact counts, list the saved prospects (name, company, one line on why they fit) and list anything invalid or failed with the reason. If the request failed, say so plainly.",
    "",
    "## Rules",
    "- Only send name, company and linkedin; the save endpoint stores nothing else, so keep any research notes in your reply.",
    "- Keep the token private: never print it in replies, reports or search queries and never send it to any other site.",
    "- Do not message anyone on LinkedIn and do not call any Inlinked endpoint other than those listed above."
  );

  return lines.join("\n");
}
