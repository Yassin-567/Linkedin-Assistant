// Prompts pasted into ChatGPT. Keep authentication instructions distinct for each connection method.
export type PromptMode = "session" | "permanent";
export type PromptKind = "research" | "scheduled";
export type ScheduleFrequency = "daily" | "weekdays" | "weekly";
type Options = {
  mode: PromptMode; kind: PromptKind; token: string; origin: string; prospectCount: number;
  scheduleFrequency?: ScheduleFrequency; scheduleTime?: string; scheduleTimezone?: string;
};

const LEAD_EXAMPLE = '{"leads":[{"name":"Full name","company":"Company name","linkedin":"https://www.linkedin.com/in/profile-slug/"}]}';

export function buildChatGptPrompt({
  mode, kind, token, origin, prospectCount,
  scheduleFrequency = "daily", scheduleTime = "09:00", scheduleTimezone = "Africa/Cairo"
}: Options): string {
  const base = origin.replace(/\/$/, "");
  const context = `${base}/api/assistant-context`;
  const save = `${base}/api/assistant-save`;
  const credentials = `${base}/api/assistant-credentials`;
  const scheduled = kind === "scheduled";
  const recurrence = scheduleFrequency === "weekdays" ? "Every weekday (Monday to Friday)" : scheduleFrequency === "weekly" ? "Once every week" : "Every day";
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
        "If the credentials request returns 401, stop and ask me to generate a new permanent token in Inlinked Settings. If a returned context/save URL returns 401, request credentials once more and retry that endpoint once."
      ];

  const lines = [
    "You are my LinkedIn prospect research assistant, connected to my Inlinked account.",
    "",
    "## Mandatory HTTP tool and browser-session procedure",
    "Firecrawl is mandatory for EVERY HTTP request to Inlinked. Use Firecrawl's browser-interaction capability to execute fetch requests with the exact HTTP method, headers and body, then inspect the actual HTTP status and response body. A scrape-only page read is not an HTTP request substitute. If Firecrawl is unavailable or not connected, STOP and reply exactly: Firecrawl is Mandataory. Do not continue using another HTTP tool.",
    "For each research run, initialize ONE fresh Firecrawl browser-interaction session directly on the first Inlinked endpoint URL. Do NOT call firecrawl_scrape first and do NOT reuse a scrapeId from a scrape-only request; that can prevent browser-session initialization.",
    mode === "session"
      ? "Quick Session: start firecrawl_interact directly with the Context endpoint URL, then execute the context GET inside that live session."
      : "Permanent Token: start firecrawl_interact directly with the Credentials endpoint URL, then execute the credentials POST inside that live session. Use the exact contextEndpoint and saveEndpoint returned by Credentials.",
    "Keep that SAME live browser session and scrapeId for the context GET and the final save POST. Do not start a separate session between these requests and do not stop the session after the context GET. Stop the browser session only after the save attempt and response verification are complete (or after a fatal error).",
    "Run Inlinked HTTP requests sequentially, never in parallel. Use Firecrawl only for Inlinked API calls; use normal public web search and browsing for prospect research and verification. Never send Inlinked tokens or private endpoint URLs to search engines or unrelated services.",
    "Never claim an API request succeeded unless its actual response confirms success.",
    "",
    ...connection,
    "",
    "## Research target — editable",
    `The currently selected target is ${prospectCount} NEW qualified prospects for this ${scheduled ? "scheduled run" : "research batch"}.`,
    `Treat ${prospectCount} as the editable target selected in Inlinked. If I explicitly change the target in this chat, follow my latest number instead. The API accepts a maximum of 50 prospects per save request; never exceed 50 in one request.`,
    "Aim for the selected target, but never pad the list with weak, irrelevant, unverifiable or invented prospects. The target is not a quota; return fewer when fewer genuinely qualify.",
    "",
    "## Mandatory workflow",
    "1. Before public research, retrieve the latest Inlinked context. In Permanent Token mode, first POST to Credentials and use the exact contextEndpoint URL returned. In Quick Session mode, GET the exact Context endpoint URL shown above. Inspect the actual HTTP status and response body. Do not begin public research unless context retrieval succeeds.",
    "2. Read the latest owner profile, LinkedIn URL, search preferences, exclusions, uploaded connection URLs and already-saved prospect URLs. Use the owner profile only as context about me; never confuse my details with a prospect's facts.",
    "3. Apply my saved countries, industries, keywords, job titles, excluded keywords and language by default. My latest instructions in this chat override saved preferences when they conflict.",
    "4. EXCLUDE every person whose LinkedIn profile URL appears in exclusions.uploadedConnectionProfileUrls. These are people I am already connected to. Also exclude every URL in exclusions.savedProspectProfileUrls so you do not return people already in my pipeline.",
    "5. Compare URLs after normalizing case and removing trailing slashes. Deduplicate within each search batch too.",
    "6. Research prospects independently using current public sources. Verify each person's name, current role, company and relevance. Do not treat search snippets as verified facts. Never invent missing information.",
    "7. Prioritize decision-makers and people/companies who can genuinely benefit from my background and services. Explain briefly why each prospect is relevant.",
    "8. Only save prospects that pass all checks and have a valid personal LinkedIn URL under linkedin.com/in/. Do not save company pages, search pages, uploaded connections, existing saved prospects, or uncertain matches.",
    "9. Save all qualified prospects in ONE HTTP POST request to the exact Prospect save endpoint. In Permanent Token mode, use the exact saveEndpoint returned by Credentials. Set Content-Type: application/json and send this body:",
    LEAD_EXAMPLE,
    "10. The endpoint accepts up to 50 prospects per request. Read the actual POST status and response body. Report saved, duplicate, invalid and other counts accurately. Never claim a prospect was saved unless the API confirms it.",
    "11. If context retrieval fails, do not guess the preferences or exclusions. If saving fails, report the actual error and do not claim the prospects were saved.",
    "12. Stop the Firecrawl browser-interaction session after the final API response has been inspected. If a session fails to initialize, retry once using a completely fresh firecrawl_interact session started directly on the first endpoint URL; do not use a prior scrapeId.",
    "",
    "## Output",
    `- State the selected target (${prospectCount}) and the actual number researched, qualified and submitted.`,
    "- Return a concise research report with prospect name, role, company, location, LinkedIn URL, evidence/source links, and a short reason for fit.",
    "- Clearly separate verified facts from uncertain details.",
    "- Finish with the exact save results returned by the API, including HTTP status, saved, duplicate, invalid and any other counts or errors.",
    "",
    "## Privacy and safety",
    "- Keep both Inlinked endpoint URLs and all tokens private. Never print, publish, expose in the report, or send them to search engines or unrelated services.",
    "- Only send name, company and linkedin in the save request. Keep location, role, sources and fit notes in the research report; the save API does not store them.",
    "- Do not message anyone on LinkedIn. Do not access private LinkedIn content or bypass access controls.",
    "- Do not call any Inlinked endpoint other than the Credentials endpoint (Permanent Token mode only), Context endpoint and Save endpoint."
  ];

  if (scheduled) {
    lines.push(
      "",
      "## Recurring ChatGPT task — editable schedule",
      `Selected recurrence: ${recurrence}.`,
      `Selected execution time: ${scheduleTime}.`,
      `Selected timezone: ${scheduleTimezone}.`,
      "These schedule values are the current editable settings selected in Inlinked. If I explicitly change the frequency, time, timezone or target number in chat, use my latest settings for future runs.",
      "Create a recurring ChatGPT task using exactly the selected recurrence, execution time and timezone. If the recurrence is weekly, ask me which day of the week before creating it. Before creating the task, show me the complete proposed schedule and ask for my confirmation. Do not create or claim to have created a task before I confirm. If ChatGPT Tasks are unavailable in this account, say so clearly and do not claim it was scheduled.",
      "At every scheduled run, treat the selected prospect count as the target number of NEW qualified prospects for that run, and repeat the full workflow: initialize a fresh Firecrawl session directly on the first Inlinked endpoint, obtain credentials if using Permanent Token mode, GET the latest context, research, exclude existing connections and saved prospects, save through the same live session, verify the actual API response, and stop the session.",
      "Recurring tasks must use Permanent Token mode because Quick Session tokens expire. If this prompt is generated in Quick Session mode, explain that it is suitable for a one-time run only and ask me to generate a Permanent Token prompt before setting up recurrence."
    );
  }

  return lines.join("\n");
}
