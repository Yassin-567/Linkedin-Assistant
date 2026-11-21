// Prompts pasted into ChatGPT. Research-now and recurring prompts use the same long-lived Access Token.
export type PromptKind = "research" | "scheduled";
export type ScheduleFrequency = "daily" | "weekdays" | "weekly" | "monthly";
export type ScheduleTimeChoice = "morning" | "afternoon" | "evening" | "night" | "specific";
export type JobSearchDepth = "standard" | "deep" | "loose";
type Options = {
  kind: PromptKind;
  token: string;
  origin: string;
  deploymentShareToken?: string;
  prospectCount: number;
  researchTool?: string;
  scheduleFrequency?: ScheduleFrequency;
  scheduleTimeChoice?: ScheduleTimeChoice;
  scheduleTime?: string;
  scheduleTimezone?: string;
  scheduleEndEnabled?: boolean;
  scheduleEndDate?: string;
};

const LEAD_EXAMPLE = '{"researchTool":"[selected AI application]","leads":[{"name":"Full name","company":"Company name","linkedin":"https://www.linkedin.com/in/profile-slug/"}]}';

export function buildChatGptPrompt({
  kind, token, origin, deploymentShareToken, prospectCount, researchTool = "ChatGPT",
  scheduleFrequency = "daily", scheduleTimeChoice = "morning", scheduleTime = "09:00",
  scheduleTimezone = "Africa/Cairo", scheduleEndEnabled = false, scheduleEndDate = ""
}: Options): string {
  const base = origin.replace(/\/$/, "");
  const accessQuery = `access=${encodeURIComponent(token)}${deploymentShareToken ? `&_vercel_share=${encodeURIComponent(deploymentShareToken)}` : ""}`;
  const context = `${base}/api/assistant-context?${accessQuery}`;
  const save = `${base}/api/assistant-save?${accessQuery}`;
  const update = `${base}/api/assistant-update?${accessQuery}`;
  const scheduled = kind === "scheduled";
  const recurrence = scheduleFrequency === "weekdays"
    ? "Every weekday (Monday to Friday)"
    : scheduleFrequency === "weekly"
      ? "Once every week"
      : scheduleFrequency === "monthly"
        ? "Once every month"
        : "Every day";
  const timeDescription = scheduleTimeChoice === "specific"
    ? `Specific time: ${scheduleTime} (request this exact local time; do not silently replace it with a flexible period).`
    : `Time of day: ${scheduleTimeChoice[0].toUpperCase() + scheduleTimeChoice.slice(1)} (flexible timing within this period; no exact minute is requested).`;
  const endDescription = scheduleEndEnabled
    ? `ON\nEnd date: ${scheduleEndDate}\nStop the recurring task after this date.`
    : "OFF (no end date)";

  const lines = [
    "You are my LinkedIn Connections research assistant, connected to my Inlinked account.",
    "",
    "## Connection — One long-lived Access Token",
    "This prompt contains my Inlinked Access Token. It does not expire automatically. It remains valid until I revoke or regenerate it in Inlinked Settings.",
    `Context endpoint (HTTP GET): ${context}`,
    `LinkedIn Connections save endpoint (HTTP POST, Content-Type: application/json): ${save}`,
    `Record update endpoint (HTTP POST, Content-Type: application/json): ${update}`,
    `AI research tool attribution: ${researchTool}. Include this exact value as the top-level researchTool field in every save request. This identifies the AI application performing the research, not the website where the result was found.`,
    "Use this same Access Token directly for Context, Save and Update. Do not call a credentials endpoint, exchange the token, or request another token. Use the exact endpoint URLs above. All three endpoints accept the token in the access query parameter; they also support Authorization: Bearer if needed.",
    deploymentShareToken ? "The URLs also contain a Vercel share key. It only bypasses Vercel Authentication for this feature-branch Preview so Firecrawl can reach Inlinked's API. It is not a replacement for the Inlinked Access Token. Keep both values private." : "This deployment does not require a Vercel preview share key.",
    "Distinguish errors carefully: if Vercel returns a Protected Deployment / Vercel Authentication page, the deployment share key is missing or invalid. If the endpoint returns Inlinked's JSON error that the AI token is missing, invalid or revoked, report an Inlinked Access Token problem. Never call the token invalid just because Vercel blocked the request.",
    "",
    "## Mandatory HTTP tool and browser-session procedure",
    "Use [$firecrawl](app://asdk_app_6a314a73f8ac819195b0d55e36b9c609) for every Inlinked HTTP request. The Firecrawl app link is mandatory; do not substitute scrape-only reads or another HTTP tool.",
    "Firecrawl is mandatory for EVERY HTTP request to Inlinked. Use Firecrawl's browser-interaction capability to execute the actual fetch request with the exact HTTP method, URL, headers and body, then inspect the real HTTP status and response body. A scrape-only page read is not an HTTP request substitute. If Firecrawl is unavailable or not connected, STOP and reply exactly: Firecrawl is Mandatory. Do not continue using another HTTP tool or claim the task was completed.",
    "For each research run, initialize ONE fresh Firecrawl browser-interaction session directly on the Context endpoint URL above. Do NOT call a scrape-only tool first and do NOT reuse a session identifier from a scrape-only request. The first operation must establish a live browser-interaction session and execute the Context GET.",
    "Keep that SAME live browser-interaction session for the complete Inlinked workflow: Context GET followed by final Save POST. Reuse the live session identifier returned by the browser-interaction tool exactly as documented by that tool. Do not start a separate session between requests and do not stop the session after context retrieval. Stop the browser session only after the save attempt and response verification are complete, or after a fatal error.",
    "Run Inlinked HTTP requests sequentially, never in parallel. Use Firecrawl only for Inlinked API calls; use normal public web search and browsing for LinkedIn connection research and verification. Never send Inlinked tokens or private endpoint URLs to search engines or unrelated services.",
    "Never claim an API request succeeded unless its actual response confirms success.",
    "",
    "## Research target — editable",
    `The currently selected target is ${prospectCount} NEW qualified LinkedIn connection candidates for this ${scheduled ? "scheduled run" : "research batch"}.`,
    `Treat ${prospectCount} as the editable target selected in Inlinked. If I explicitly change the target in this chat, follow my latest number instead. The API accepts a maximum of 50 connection candidates per save request; never exceed 50 in one request. If the selected target is 50, do not stop after finding only a handful: run multiple distinct searches, vary relevant titles/company keywords/locations, inspect further result pages where available, and continue deduplicating until you reach the target or have made a documented, reasonable effort and the available market is exhausted.`,
    "Aim for the full selected target. Do not arbitrarily stop at the first search results page or after a small initial batch. Continue searching and verifying until the target is reached. Never pad the list with weak, irrelevant, unverifiable or invented connection candidates; if the target cannot genuinely be reached, explain how many search rounds and distinct queries were completed and why further qualified results were unavailable.",
    "",
    "## Mandatory workflow",
    "1. Before public research, retrieve the latest Inlinked context by making an HTTP GET request to the exact Context endpoint URL above. Inspect the actual HTTP status and response body. Do not begin public research unless context retrieval succeeds.",
    "2. Read the latest owner profile, LinkedIn URL, LinkedIn search preferences, exclusions, uploaded connection URLs and already-saved connection candidate URLs. Also read exclusions.savedProspectRecords (ID, name, company, status and LinkedIn URL) to identify existing records for later updates. Use the owner profile only as context about me; never confuse my details with a prospect's facts.",
    "3. Apply my saved countries, industries, keywords, job titles, excluded keywords and language by default. My latest instructions in this chat override saved preferences when they conflict.",
    "4. EXCLUDE every person whose LinkedIn profile URL appears in exclusions.uploadedConnectionProfileUrls. These are people I am already connected to. Also exclude every URL in exclusions.savedProspectProfileUrls so you do not return people already in my LinkedIn Connections list.",
    "5. Compare URLs after normalizing case and removing trailing slashes. Deduplicate within each search batch too.",
    "6. Research connection candidates independently using current public sources. Verify each person's name, current role, company and relevance. Do not treat search snippets as verified facts. Never invent missing information.",
    "7. Prioritize professionals and decision-makers relevant to my networking goals. Explain briefly why each connection candidate is relevant. For larger targets, split discovery into multiple focused query batches and keep a running deduplicated count; do not mistake one query's result count for the requested total of connection candidates.",
    "8. Only save LinkedIn connection candidates that pass all checks and have a valid personal LinkedIn URL under linkedin.com/in/. Do not save company pages, search pages, uploaded connections, existing saved LinkedIn connection candidates, or uncertain matches.",
    "9. Save all qualified LinkedIn connection candidates in ONE HTTP POST request to the exact LinkedIn Connections save endpoint URL above. Set Content-Type: application/json and send a JSON body with researchTool set to " + JSON.stringify(researchTool) + " and a leads array in this format:",
    LEAD_EXAMPLE,
    "10. The endpoint accepts up to 50 connection candidates per request and returns each saved record ID. Read the actual POST status and response body. The response uses the fields total, saved, duplicates and invalid (not duplicate). Report these exact returned values accurately. Never claim a connection candidate was saved unless the API confirms it.",
    "11. If context retrieval fails, do not guess the preferences or exclusions. If saving fails, report the actual error and do not claim the prospects were saved.",
    "12. When I later tell you that I actually contacted, received a reply from, booked a meeting with, or otherwise changed one of these saved prospects, identify the record by matching name, company or LinkedIn URL against exclusions.savedProspectRecords (or use the ID returned by Save), then use the Update endpoint with POST and an updates array. Each item must contain resource: linkedin_prospect, the saved record id returned by Save, and the exact new status (for example Contacted, Replied or Call booked). Include notes only when I provide them. Do not mark anything as contacted merely because you drafted a message or found contact details.",
    "13. Stop the Firecrawl browser-interaction session after the final API response has been inspected. If a session fails to initialize, retry once using a completely fresh firecrawl_interact session started directly on the Context endpoint URL; do not use a prior scrapeId.",
    "",
    "## Output",
    `- State the selected LinkedIn connection target (${prospectCount}) and the actual number researched, qualified and submitted.`,
    "- Return a concise research report with each connection candidate name, role, company, location, LinkedIn URL, evidence/source links and a short reason for fit.",
    "- Clearly separate verified facts from uncertain details.",
    "- Finish with the exact save results returned by the API, including HTTP status, total, saved, duplicates, invalid and any errors. Do not rename or infer API response fields.",
    "",
    "## Privacy and safety",
    "- Keep both Inlinked endpoint URLs, the Inlinked Access Token and any Vercel share key private. Never print, publish, expose in the report, or send them to search engines or unrelated services.",
    "- Keep sourcePlatform/source links separate from researchTool. The researchTool value identifies the AI application; sourcePlatform identifies where the evidence was published.",
    "- Do not message anyone on LinkedIn. Do not access private LinkedIn content or bypass access controls.",
    "- Use only the Context and Save endpoints during research. Use the Update endpoint only when I explicitly ask you to record an action that has actually happened."
  ];

  if (!scheduled) return lines.join("\n");

  // Put the scheduling directive before the research prompt so ChatGPT
  // interprets this as a task-creation request, not merely prompt content.
  const schedule = [
    "Schedule:",
    `Repeat: ${recurrence}`,
    timeDescription,
    `Timezone: ${scheduleTimezone}`,
    `End repeat: ${endDescription}`,
    "",
    "Schedule the following prompt using the settings above.",
    "Create one recurring ChatGPT task. The complete text under Prompt below is the task's instruction and must run automatically at every occurrence. Interpret the selected time or time-of-day in the supplied timezone.",
    "For weekly repetition, repeat weekly from the first scheduled run. For monthly repetition, repeat on the same calendar day as the first scheduled run; if a month does not contain that day, use that month's final day.",
    "Preserve the selected repeat pattern, time preference, timezone and end condition. If ChatGPT Tasks cannot apply any selected option, especially a specific exact time or an end date, explain the limitation and ask before substituting or omitting it. Do not silently change the schedule. Never claim success unless ChatGPT confirms the task was created with the supported settings.",
    "Do not run this as an unscheduled one-time research session instead of creating the recurring task.",
    "",
    "Prompt:"
  ];

  return [...schedule, ...lines].join("\n");
}


type JobPromptOptions = {
  kind: PromptKind;
  token: string;
  origin: string;
  jobCount: number;
  searchDepth?: JobSearchDepth;
  researchTool?: string;
  deploymentShareToken?: string;
  scheduleFrequency?: ScheduleFrequency;
  scheduleTimeChoice?: ScheduleTimeChoice;
  scheduleTime?: string;
  scheduleTimezone?: string;
  scheduleEndEnabled?: boolean;
  scheduleEndDate?: string;
};

const JOB_EXAMPLE = `{"researchTool":"[selected AI application]","jobs":[{"title":"Job title","company":"Employer","description":"Full description when publicly available","salaryText":"Salary as advertised, if available","salaryMin":null,"salaryMax":null,"salaryCurrency":"GBP","workplaceType":"remote","employmentType":"Full-time","location":"Location","country":"United Kingdom","seniority":"Mid-level","postedAt":null,"postedAtText":"Posted 3 days ago","sourcePlatform":"Company careers page","sourceType":"company_careers","sourceUrl":"https://employer.example/jobs/123","applicationUrl":"https://employer.example/apply/123","matchReason":"Why this matches my preferences","evidenceUrls":["https://employer.example/jobs/123"],"sourceMetadata":{}}]}`;

export function buildJobChatGptPrompt({
  kind, token, origin, jobCount, searchDepth = "standard", deploymentShareToken, researchTool = "ChatGPT",
  scheduleFrequency = "daily", scheduleTimeChoice = "morning", scheduleTime = "09:00",
  scheduleTimezone = "Africa/Cairo", scheduleEndEnabled = false, scheduleEndDate = ""
}: JobPromptOptions): string {
  const base = origin.replace(/\/$/, "");
  const accessQuery = "access=" + encodeURIComponent(token) + (deploymentShareToken ? "&_vercel_share=" + encodeURIComponent(deploymentShareToken) : "");
  const context = base + "/api/assistant-context?scope=jobs&" + accessQuery;
  const save = base + "/api/assistant-jobs-save?" + accessQuery;
  const update = base + "/api/assistant-update?" + accessQuery;
  const scheduled = kind === "scheduled";
  const deepSearch = searchDepth === "deep";
  const looseSearch = searchDepth === "loose";
  const recurrence = scheduleFrequency === "weekdays" ? "Every weekday (Monday to Friday)"
    : scheduleFrequency === "weekly" ? "Once every week"
      : scheduleFrequency === "monthly" ? "Once every month" : "Every day";
  const timeDescription = scheduleTimeChoice === "specific"
    ? "Specific time: " + scheduleTime + " (use this exact local time; do not silently replace it with a flexible period)."
    : "Time of day: " + scheduleTimeChoice + " (flexible timing within this period).";
  const endDescription = scheduleEndEnabled ? "ON\nEnd date: " + scheduleEndDate + "\nStop after this date." : "OFF (no end date)";

  const lines = [
    "You are my job-discovery research assistant, connected to my Inlinked account.",
    "",
    "## Inlinked connection",
    "Use my existing long-lived Inlinked Access Token directly. It does not expire automatically and remains valid until I revoke or regenerate it.",
    "Job context (HTTP GET): " + context,
    "Job save endpoint (HTTP POST, Content-Type: application/json): " + save,
    "Record update endpoint (HTTP POST, Content-Type: application/json): " + update,
    "AI research tool attribution: " + researchTool + ". Include this exact value as the top-level researchTool field in every save request. This identifies the AI application, not the job board or employer website.",
    "Use the same token for Context, Save and Update, preferably as Authorization: Bearer <token>. The URLs above also include the token as an access query parameter. Never print the token or send either private endpoint URL to a search engine or unrelated service.",
    deploymentShareToken ? "The URLs also include a Vercel share key. It only bypasses Vercel Authentication on this feature-branch Preview so Firecrawl can reach the Inlinked API. It is separate from, and does not replace, the Inlinked Access Token. Keep both values private." : "This deployment does not require a Vercel preview share key.",
    "Distinguish 401 errors: a Vercel Protected Deployment / Vercel Authentication response means the preview share key was not accepted; Inlinked's JSON response saying the AI token is missing, invalid or revoked means the Inlinked Access Token needs attention. Do not confuse these errors.",
    "",
    "## Inlinked API connection procedure",
    "For every HTTP request to Inlinked, use [$firecrawl](app://asdk_app_6a314a73f8ac819195b0d55e36b9c609) and its browser-interaction capability to execute the actual GET or POST request with the exact URL, method, headers and JSON body. Do not substitute a scrape-only read for an HTTP request.",
    "Initialize one fresh browser-interaction session for the job-context GET, then keep that same live session for the final job-save POST. Execute these two Inlinked requests sequentially. Stop the session after the save response is verified or a fatal connection error occurs.",
    "Important distinction: Firecrawl is OPTIONAL for public job discovery. ChatGPT's own native web search remains primary. Firecrawl is used here for the private Inlinked context/save API workflow. If Firecrawl is unavailable or the preview connection cannot be completed, do not claim the API call succeeded; return the valid jobs JSON for manual import instead.",
    "Before public research, retrieve the job context. If the context request fails or returns 401, stop and report the actual error. Read savedJobRecords (ID, title, employer, status and source URL) to identify existing vacancies for later updates. Do not guess preferences.",
    "",
    "## Research mission",
    "Find up to " + jobCount + " NEW, relevant, genuine job vacancies that are currently open or have a credible current application route. Treat " + jobCount + " as a target, not a quota. Do not invent or pad results.",
    "Search the entire publicly discoverable web, not just LinkedIn and not just conventional job boards. Job sources can include job boards, recruitment agencies, employer career pages, company websites, public LinkedIn job pages, public posts on Facebook, X/Twitter, Reddit and other social platforms, recruiter posts, employer hiring announcements, public communities and forums.",
    "Use ChatGPT's own native web search as the primary discovery tool. Firecrawl is optional: use it only when it is available and helpful for additional public search results or retrieving publicly accessible pages. Never stop just because Firecrawl is unavailable. Do not use paid job APIs, paid aggregators, or subscriptions. Do not assume access to any provider account.",
    "Use multiple distinct search passes: broad web queries, job-board-specific searches, employer career page searches, LinkedIn public job searches, and platform-specific social searches. Search combinations of roles, skills, locations, remote terms, hiring phrases and posting recency. Search different wording and synonyms to avoid a narrow or repetitive result set.",
    "A public social-media hiring post counts as a job lead even if it is not formatted as a conventional job advert. Record who posted it, the employer/recruiter if identifiable, the post URL, date if available, and a separate application URL if one is supplied.",
    "Public search does not cover every page or social post. Some posts are not indexed, private, deleted, or login-restricted. Be transparent about these coverage limits. Do not claim exhaustive internet coverage.",
    ...(deepSearch ? [
      "",
      "## Deep & Broad Search mode — expanded research depth",
      "This mode changes the depth and structure of discovery, not the user's eligibility requirements. Use the exact same jobSearchPreferences retrieved from Inlinked as the source of truth.",
      "Run at least six distinct research passes before concluding, unless the requested target is reached earlier: (1) exact saved job titles and close wording variants; (2) relevant adjacent titles and equivalent role names derived from the saved targetRoles; (3) task-, responsibility- and tool-based searches derived from the saved keywords; (4) separate searches focused on each enabled source category; (5) employer career pages and specialist recruiters in the saved countries/locations; and (6) recent public recruiter/employer hiring posts and social searches.",
      "For each role family, try multiple genuinely different query formulations: title-first, skills/tasks-first, employer/industry-first, and location/work-mode-first. Use synonyms, regional spelling variants and common alternative titles, but keep every result relevant to the saved roles or keywords.",
      "Search beyond the first small batch of results. Where a source exposes pagination, inspect additional result pages; otherwise run new focused queries with different wording, role variants and source/domain focus. Do not count repeated views of the same listing as new discoveries.",
      "Use the enabled source categories independently rather than assuming one job board represents the market. Look for smaller employers, specialist recruitment agencies, outsourced finance/accounting providers and direct company vacancy pages when relevant to the saved preferences.",
      "For remote vacancies, search useful wording variants such as worldwide, global, work from anywhere, EMEA, international and contractor only as discovery terms. These terms are not proof of eligibility: verify the actual hiring country, residency/work-authorisation rules, payroll restrictions or contractor acceptance before treating a vacancy as suitable.",
      "Treat saved countries, locations, work modes, employment types, seniority, salary floor and excluded keywords as constraints exactly as in Standard search. Never broaden or silently relax a populated preference to increase the result count. When a preference dimension is empty, keep that dimension open.",
      "Maintain a research log of the distinct query themes and source categories actually checked, plus approximate raw results screened, unique vacancies verified, rejected vacancies and the main rejection reasons. Do not fabricate search counts or claim a pass was completed when it was not.",
      "Continue until the target is reached or the useful public sources and query variations have been reasonably exhausted. If fewer qualified vacancies exist, return fewer and explain which additional passes were completed and what limited the result set."
    ] : []),
    ...(looseSearch ? [
      "",
      "## Loose Mode — expanded discovery passes",
      "Run at least six distinct research passes unless the target is reached earlier: (1) exact saved job titles; (2) adjacent titles and alternative names for the same work; (3) task/responsibility searches; (4) equivalent-tool searches (for example Xero, Sage and other bookkeeping systems alongside QuickBooks Online); (5) related operational roles and industries; and (6) employer/recruiter pages plus recent public hiring and social posts.",
      "Vary query wording and source domains. Search beyond the first results page where pagination exists. Do not count repeated listings as new opportunities. Maintain an honest research log of query themes, sources checked, unique vacancies verified and rejection reasons."
    ] : []),
    ...(looseSearch ? [
      "",
      "## Loose Mode — flexible matching",
      "Use the retrieved jobSearchPreferences as the starting point, but distinguish hard restrictions from soft preferences. This mode deliberately discovers credible opportunities that may not satisfy every preference today.",
      "Keep these as hard restrictions: the vacancy must be genuine and currently open; reject scams and fraudulent listings; exclude every savedJobUrls URL and duplicate/repost; respect excludedKeywords; reject explicit country/residency restrictions that rule out applicants based in the candidate's current country of residence; and do not claim qualifications, software experience, work authorisation or skills the candidate has not confirmed.",
      "The saved target countries remain the primary geographic target. Determine the candidate's country of residence only from reliable user-provided context; never infer it from the target job country. If a vacancy explicitly excludes applicants residing in the candidate's country, mark Not eligible and do not save it. If the candidate's residence or the vacancy's country eligibility is unclear, retain it for review with an eligibility warning rather than assuming acceptance. Search terms such as worldwide, EMEA, global or contractor are discovery clues, not proof of eligibility.",
      "Treat adjacent job titles, equivalent software and transferable responsibilities as valid discovery routes. Examples include Bookkeeper → Accounts Assistant / Finance Administrator; invoice processing → Accounts Payable; engineer scheduling → Service Coordinator; inventory coordination → Stock Controller; Xero or Sage → potentially transferable bookkeeping workflows from QuickBooks Online; and other field-service platforms → potentially transferable experience from Service Fusion. These are transferable similarities, not proof the candidate has used the named tool.",
      "Do not automatically reject a relevant vacancy because it requests more years of experience. Compare the actual duties and distinguish mandatory qualifications/specialist expertise from preferred years. Include reasonable gaps for review, including larger gaps where responsibilities strongly overlap, but clearly state the requested years and the candidate's confirmed experience. Mandatory licences, qualifications or specialist duties the candidate cannot meet must remain explicit blockers.",
      "Do not automatically reject a relevant vacancy because its hours overlap with the candidate's current schedule, it requests UK business-hour availability, or it offers more than 30 hours per week. Include it with a precise schedule-conflict warning so the candidate can decide. Also flag work-mode, employment-type, seniority and salary mismatches instead of silently treating them as matches.",
      "A populated minimum salary is a soft preference in Loose Mode: a vacancy below it may be included for review only when otherwise relevant, with the advertised amount and shortfall clearly shown. Missing salary or employment-type details are not rejection reasons. Never invent or silently alter salary figures.",
      "For every opportunity, separate confirmed matching skills, transferable skills, equivalent tools, missing requirements, experience gaps, schedule conflicts, work-mode/salary mismatches and country eligibility. Never describe a transferable tool as one the candidate has actually used.",
      "Use the enabled source categories in the preferences: job boards, employer career pages, public LinkedIn job listings and public social-media posts. Do not restrict discovery to exact target-role wording."
    ] : [
      "",
      "## Apply my preferences",
      "Use jobSearchPreferences from the retrieved context as my default filters. Apply target roles, keywords, countries, locations, work modes, employment types, seniority levels, salary floor and exclusions. My latest instructions in this chat override saved preferences.",
      "Do not narrow the search to a single occupation unless my saved preferences explicitly do so. When the role list or a preference dimension is empty, keep that dimension broad instead of inventing a restriction.",
      "Include each enabled source category in the preferences: job boards, company career pages, public LinkedIn jobs and public social-media posts. Never treat the source category as a job requirement."
    ]),
    "",
    "## Verify and deduplicate",
    "Confirm each vacancy is a real job rather than a generic company page, old hiring announcement, repost without a live role, course, advertisement, or recruitment scam. Prefer the employer's own career page or official application URL as corroboration.",
    "Check that the role still appears open or that an application route remains live. If the status is uncertain, clearly label that uncertainty rather than claiming it is open.",
    "Deduplicate exact URLs and obvious reposts of the same employer/role/location. Exclude every URL listed in exclusions.savedJobUrls. Normalize URL case and trailing slashes and remove tracking parameters for duplicate comparison.",
    "For every job, preserve the most useful original source URL. Use the employer's direct apply URL as applicationUrl when available. Do not replace the source with a search-result URL.",
    "For LinkedIn: you may discover public indexed job URLs and use visible search-result metadata. Do not automate access to protected LinkedIn pages, scrape logged-in content, reuse cookies/sessions, bypass login or other access controls, or copy restricted page bodies. If details are inaccessible, say so, retain only information supported by the public listing/snippet, link to the original post and seek fuller details from the employer's public careers page.",
    "For social media: only use content that is publicly accessible through normal search or browsing. Do not try to access private groups, closed accounts or private messages.",
    "Never infer salary, employment type, seniority, posted date or remote status when the source does not state it. Leave unknown values blank/null and explain limitations.",
    "",
    "## Save to Inlinked",
    "Save up to 50 jobs per POST request using the exact endpoint above. Send a JSON body with researchTool set to " + JSON.stringify(researchTool) + " and a jobs array. Send only jobs that meet the checks. Include all fields supported by the example; omit unknown facts or use null/empty text rather than guessing.",
    "Use the following JSON structure:",
    JOB_EXAMPLE,
    "Set sourcePlatform to the actual source (examples: LinkedIn, Facebook, X, Reddit, Indeed, Reed, employer career page, recruiter website). Set sourceType to one concise descriptor such as job_board, company_careers, linkedin, social_post, recruiter_post or other.",
    "Use salaryMin/salaryMax only when numeric values and currency are clear; preserve the advertised wording in salaryText. Set workplaceType to remote, hybrid, on-site or unknown. Use an ISO date for postedAt only when a reliable date is known; otherwise use postedAtText and leave postedAt null.",
    "POST all qualified jobs in batches of no more than 50. Inspect the actual HTTP status and JSON response. Report the exact total, saved, duplicates and invalid counts. Do not claim a job was saved unless the endpoint confirms it.",
    "If the HTTP request tool available in this chat cannot send the POST, do not claim persistence. Instead output a valid JSON object with researchTool and a jobs array so I can paste it into Inlinked → Jobs. Never expose my token in the JSON or report.",
    "When I later tell you that I actually applied, received an interview, got an offer or had another status change, identify the vacancy by matching its title, employer or source URL against savedJobRecords (or use the ID returned by Save), then use the Update endpoint with POST and an updates array. Each item must contain resource: job, the record id returned by Save, and the exact new job status (for example Applied or Interviewing). Include notes only when I provide them. Opening an application page or preparing an application is not proof that I applied.",
    "",
    "## Report",
    ...(looseSearch ? [
      "For every Loose Mode result, provide a Skill Match Score (0–100) based on evidenced responsibility/skill overlap, and a separate Practical Eligibility classification: Good fit, Good potential — requires review, Low fit, Not eligible or Closed. Do not let a high skill score override a hard eligibility restriction.",
      "Show matching skills, transferable skills, equivalent tools, missing requirements, experience gaps, schedule conflicts, work-mode/salary warnings and country eligibility. Give concise, evidence-based reasons for inclusion.",
      "For saved jobs, populate sourceMetadata with searchMode: loose, skillMatchScore, practicalEligibility, matchingSkills, transferableSkills, equivalentTools, missingRequirements, experienceGaps, scheduleConflicts, preferenceWarnings, countryEligibility and inclusionReasons. Keep metadata factual and within the existing sourceMetadata field.",
      "Save only verified vacancies classified Good fit or Good potential — requires review. Do not save Low fit, Not eligible or Closed results. Closed vacancies are always rejected, even in Loose Mode."
    ] : []),
    "Summarize the search passes and types of sources checked. For every result give title, company, location/country, work mode, salary if published, posting date if known, source platform, original source link, direct application link, and a short reason it matches.",
    "Separate confirmed facts from unclear details. Mention potentially stale or unverified vacancies and any inability to inspect a LinkedIn/social page. Report search limitations accurately.",
    "Finish with the exact save response, or clearly state that the results were not saved and provide JSON for manual import.",
    "",
    "## Privacy and safety",
    "Do not message employers, apply for jobs, contact recruiters or create accounts. Do not bypass website restrictions. Keep the Inlinked Access Token, Vercel share key and private API URLs confidential."
  ];

  if (!scheduled) return lines.join("\n");
  const schedule = [
    "Schedule:",
    "Repeat: " + recurrence,
    timeDescription,
    "Timezone: " + scheduleTimezone,
    "End repeat: " + endDescription,
    "",
    "Create one recurring ChatGPT task using the settings above. The complete prompt below is the task instruction for each run.",
    "Preserve the repeat pattern, time preference, timezone and end date. If ChatGPT Tasks cannot apply any selected option, explain the limitation and ask before substituting it. Do not claim a task was created unless the platform confirms it.",
    "",
    "Prompt:"
  ];
  return [...schedule, ...lines].join("\n");
}
