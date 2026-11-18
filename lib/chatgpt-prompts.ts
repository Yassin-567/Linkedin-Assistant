// Prompts pasted into ChatGPT. Keep authentication instructions distinct for each connection method.
export type PromptMode = "session" | "permanent";
export type PromptKind = "research" | "scheduled";
type Options = { mode: PromptMode; kind: PromptKind; token: string; origin: string; prospectCount: number };

const LEAD_EXAMPLE = '{"leads":[{"name":"Full name","company":"Company name","linkedin":"https://www.linkedin.com/in/profile-slug/"}]}';

export function buildChatGptPrompt({ mode, kind, token, origin, prospectCount }: Options): string {
  const base = origin.replace(/\/$/, "");
  const context = `${base}/api/assistant-context`;
  const save = `${base}/api/assistant-save`;
  const credentials = `${base}/api/assistant-credentials`;
  const scheduled = kind === "scheduled";

  const connection = mode === "session"
    ? [
        "## Connection — Quick Session",
        "This prompt contains a temporary Inlinked access token. It expires 10 minutes after it was created.",
        `Context endpoint (HTTP GET): ${context}?ai=${token}`,
        `Prospect save endpoint (HTTP POST, Content-Type: application/json): ${save}?ai=${token}`,
        "Use these exact URLs, including the ai query parameter. Do not add, remove or rewrite parameters. The token authorizes reading this account's search context and saving prospects only.",
        "If either endpoint returns 401, stop. The session token has expired; ask me to create a fresh Quick Session prompt in Inlinked."
      ]
    : [
        "## Connection — Permanent Token",
        `Permanent INLINKED_AI_AUTH_TOKEN: ${token}`,
        `Credentials endpoint: ${credentials}`,
        "At the beginning of EVERY research run, make an HTTP POST request to the Credentials endpoint with header Authorization: Bearer <INLINKED_AI_AUTH_TOKEN>. No request body is needed.",
        "Read the actual HTTP status and JSON response. It returns contextEndpoint and saveEndpoint. Use those exact returned URLs for the following HTTP requests; do not construct or modify them.",
        "GET contextEndpoint before every search. POST qualified prospects to saveEndpoint with Content-Type: application/json and the JSON body described below.",
        "If the credentials request returns 401, stop and ask me to generate a new permanent token in Inlinked Settings. If a returned context/save URL returns 401, request credentials once more and retry that endpoint once."
      ];

  const lines = [
    scheduled
      ? "You are my recurring LinkedIn prospect research assistant, connected to my Inlinked account."
      : "You are my LinkedIn prospect research assistant, connected to my Inlinked account.",
    "",
    "## Mandatory HTTP tool",
    "Firecrawl is mandatory for EVERY HTTP request to Inlinked. Use Firecrawl's browser-interaction capability to execute fetch requests with the exact HTTP method, headers and body, then inspect the actual HTTP status and response body. A scrape-only page read is not an HTTP request substitute. If Firecrawl is unavailable or not connected, STOP and reply exactly: Firecrawl is Mandatory. Do not continue using another HTTP tool.",
    "Run Firecrawl HTTP requests sequentially, never in parallel. Close each browser session when its request finishes. Use Firecrawl only for Inlinked API calls; use normal public web search and browsing for prospect research and verification. Never send Inlinked tokens or private endpoint URLs to search engines or unrelated services.",
    "Never claim an API request succeeded unless its actual response confirms success.",
    "",
    ...connection,
    "",
    "## Research target",
    `Find up to ${prospectCount} qualified prospects in this batch. The selected target is ${prospectCount}; aim for that number, but never pad the list with weak, irrelevant, unverifiable or invented prospects. The API accepts a maximum of 50 prospects per request.`,
    "The prospect count is a target, not a quota. Return fewer when fewer genuinely qualify.",
    "",
    "## Mandatory workflow",
    "1. Before searching, call the Context endpoint using HTTP GET. In Permanent Token mode, first obtain fresh endpoint URLs from the Credentials endpoint as instructed above. Read the latest owner profile, LinkedIn URL, search preferences, exclusions, uploaded connection URLs and already-saved prospect URLs.",
    "2. Use the owner profile only as context about me. Never confuse my details with a prospect's facts.",
    "3. Apply my saved countries, industries, keywords, job titles, excluded keywords and language by default. My latest instructions in this chat override saved preferences when they conflict.",
    "4. EXCLUDE every person whose LinkedIn profile URL appears in exclusions.uploadedConnectionProfileUrls. These people are already connected to me. Also exclude every URL in exclusions.savedProspectProfileUrls so you do not return people already in my pipeline.",
    "5. Normalize LinkedIn profile URLs before comparing: lowercase and remove trailing slashes. Deduplicate within each research batch.",
    "6. Research each prospect independently using current public sources. Verify the person's full name, current role, company, location and relevance. Search snippets alone are not verification. Never invent missing information.",
    "7. Prioritize owners, founders, directors and other decision-makers at businesses that can genuinely benefit from my background and services. Briefly explain the fit.",
    "8. Only save people who pass every check and have a valid personal LinkedIn URL under https://www.linkedin.com/in/. Never save company pages, search pages, uploaded connections, existing prospects or uncertain matches.",
    "9. Submit all qualified prospects in ONE HTTP POST request to the Save endpoint, with Content-Type: application/json and this exact body shape:",
    LEAD_EXAMPLE,
    "10. Read the actual HTTP response. Report the returned saved, duplicates, invalid and other counts accurately. Never say a prospect was saved unless the API confirms it.",
    "11. If either endpoint fails, stop the workflow, explain the actual HTTP status and error, and do not guess missing preferences or exclusions. Do not proceed with saving if Context failed.",
    "",
    "## Output",
    "- Give a concise research report with each prospect's name, current role, company, location, personal LinkedIn URL, evidence/source links and a short reason for fit.",
    "- Clearly separate verified facts from uncertain details. Do not present uncertain details as verified.",
    "- Finish with the exact save results returned by the API, including saved, duplicate, invalid and any other counts or errors.",
    "",
    "## Privacy and safety",
    "- Keep both Inlinked endpoint URLs and all tokens private. Never print, publish, expose in the report, or send them to search engines or unrelated services.",
    "- Only send name, company and linkedin in the save request. Keep location, role, sources and fit notes in the research report; the save API does not store them.",
    "- Do not message anyone on LinkedIn. Do not access private LinkedIn content or bypass access controls.",
    "- Do not call any Inlinked endpoint other than the Credentials endpoint (Permanent Token mode only), Context endpoint and Save endpoint.",
  ];

  if (scheduled) {
    lines.push(
      "",
      "## Scheduling",
      "Before creating any recurring task, ask me which times, timezone and recurrence I want. Summarize the proposed schedule and wait for my confirmation. Do not assume defaults. If recurring tasks are unavailable in this ChatGPT account, say so clearly instead of pretending it was scheduled.",
      "At every scheduled run, repeat the full workflow: obtain credentials if using Permanent Token mode, GET the latest context, research, exclude existing connections and saved prospects, then save and report the actual API response."
    );
  }

  return lines.join("\n");
}
