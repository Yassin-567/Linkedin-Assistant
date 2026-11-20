export type CommercialLeadEngine = "direct_demand" | "opportunity_signal" | "ideal_customer";

type Options = {
  token: string;
  origin: string;
  deploymentShareToken?: string;
  profileId: string;
  profileName: string;
  targetCount: number;
  engines: string[];
  locationOverride?: string;
  queryOverride?: string;
};

const descriptions: Record<CommercialLeadEngine, string> = {
  direct_demand: "Direct Demand Discovery: find people or organisations publicly asking for a provider, recommendation, quote, proposal, support or a specific service. Save only when the request itself is evidenced by a public source.",
  opportunity_signal: "Opportunity Signal Discovery: find businesses with observable operational, growth, hiring, expansion, outsourcing or service-delivery signals that could create a need. These are hypotheses, not confirmed buying requests.",
  ideal_customer: "Ideal Customer Discovery: find organisations matching the saved ideal-customer profile even when they have not publicly expressed buying intent. Label these as ideal-customer prospects, never as active buyers."
};

export function buildCommercialLeadPrompt(options: Options): string {
  const base = options.origin.replace(/\/$/, "");
  const query = "access=" + encodeURIComponent(options.token) +
    (options.deploymentShareToken ? "&_vercel_share=" + encodeURIComponent(options.deploymentShareToken) : "");
  const contextUrl = base + "/api/assistant-leads-context?profileId=" + encodeURIComponent(options.profileId) + "&" + query;
  const saveUrl = base + "/api/assistant-leads-save?" + query;
  const selectedEngines = options.engines.filter((engine): engine is CommercialLeadEngine =>
    engine === "direct_demand" || engine === "opportunity_signal" || engine === "ideal_customer"
  );
  const engineDescriptions = selectedEngines.map(engine => "- " + descriptions[engine]).join("\n");
  const target = Math.max(1, Math.min(50, Math.round(options.targetCount || 20)));
  const location = (options.locationOverride || "").trim();
  const extra = (options.queryOverride || "").trim();

  const lines = [
    "You are my commercial lead-discovery research assistant, connected to my Inlinked account.",
    "",
    "## Inlinked connection",
    "Use my existing long-lived Inlinked Access Token directly. It remains valid until I revoke or regenerate it.",
    "Selected Lead Profile: " + options.profileName + " (ID: " + options.profileId + ")",
    "Lead Profile context (HTTP GET): " + contextUrl,
    "Commercial lead save endpoint (HTTP POST, Content-Type: application/json): " + saveUrl,
    "Use the same Access Token for both endpoints. The URLs contain the access query parameter; Authorization: Bearer is also supported. Never print the token, share key or private endpoint URLs in your report, and never send them to public search engines or unrelated services.",
    options.deploymentShareToken
      ? "The URLs include a Vercel preview share key as well as the Inlinked Access Token. Keep both private. The share key only provides access to this deployment; it is not a substitute for the Inlinked token."
      : "This deployment does not require a Vercel preview share key.",
    "If a response is a Vercel Protected Deployment page, diagnose a deployment access issue. If Inlinked returns JSON saying the Access Token is invalid or revoked, diagnose an Inlinked token issue. Do not confuse these errors.",
    "",
    "## Mandatory API procedure",
    "Use [$firecrawl](app://asdk_app_6a314a73f8ac819195b0d55e36b9c609) and its browser-interaction capability for every HTTP request to Inlinked. Execute the actual GET or POST with the exact URL, method, headers and JSON body. A scrape-only read is not a substitute for an HTTP request.",
    "For this run, start one fresh Firecrawl browser-interaction session directly on the Lead Profile context URL above. Execute the context GET first. Keep the same live browser-interaction session for the final save POST, run the two requests sequentially, inspect the actual HTTP status and response body, and stop the session only after the save result is verified or a fatal error occurs.",
    "If Firecrawl is unavailable or cannot execute the authenticated API request, do not claim anything was saved. Continue the research if useful, then return the valid JSON payload for manual recovery and clearly state that automatic saving was not completed. Do not use another HTTP tool as a substitute for Inlinked API calls.",
    "",
    "## Research method — ChatGPT is the search engine",
    "Use ChatGPT's own native web search and browsing as the primary and only discovery method. Do not call Serper, Google Search API, paid search APIs, scraping APIs or another external search provider. Firecrawl is used only for the private Inlinked context and save API requests described above, not for prospect discovery.",
    "Retrieve and read the Lead Profile context before researching. Use the latest profile preferences and exclusions from that response. The user may override them in this conversation, and explicit current instructions take priority.",
    "Run multiple distinct search passes using natural-language web searches and varied combinations of services, problem statements, customer types, industries, decision-maker roles, target countries and cities. Search public company websites, public social posts, professional communities, public forums, project marketplaces and other publicly accessible pages that match the selected source categories.",
    "Prioritise original evidence pages. Open and inspect promising source pages where possible; do not treat a search-result snippet alone as proof when the original page can be checked. Capture the exact public source URL and a separate company website or public professional profile when available.",
    "Do not access private messages, closed groups, private profiles or login-restricted content. Do not bypass robots, authentication, paywalls or platform controls. Public LinkedIn posts may be used when actually accessible; never imply access to private LinkedIn data.",
    "",
    "## Selected discovery engines",
    engineDescriptions || "- No engine was selected. Stop and ask the user to select at least one discovery engine.",
    "",
    "## Research constraints",
    "Target: up to " + target + " new commercial leads for this profile. Treat the target as a goal, not a quota. Never invent, pad or lower evidence standards to reach it. Search multiple passes and report how many qualified leads were genuinely available.",
    "Location override for this run: " + (location || "None; use the profile's saved markets."),
    "Additional search context: " + (extra || "None."),
    "Apply source-category preferences and excluded keywords from the profile. Exclude companies and source URLs already listed in exclusions.savedCompanies, exclusions.savedWebsites and exclusions.savedSourceUrls. Normalize URLs and remove tracking parameters before comparing them.",
    "Prefer one pipeline record per distinct business for this profile. Do not create multiple records for the same business simply because several pages mention it. Within this run, deduplicate by canonical source URL, website domain and company identity.",
    "For each candidate, distinguish an explicit request from an inferred opportunity signal and an ideal-customer match. Never label a company as actively buying without direct public evidence. A company's fit with the ideal customer profile is not buying intent.",
    "Verify the organisation exists, its location and its relevance. Include a decision-maker name or role only when supported by evidence. Do not guess email addresses, phone numbers, budgets, project values, employee counts or posting dates. Leave unknown fields blank or null.",
    "Use confidence High only when a clear, current primary source supports the key claim; Medium for partial or indirect evidence; Low for weak or older evidence; Unverified when the organisation itself is not sufficiently confirmed. Include a concise reason and direct evidence URLs.",
    "",
    "## Mandatory workflow",
    "1. Make an HTTP GET request to the exact Lead Profile context URL above. Confirm success and read profile.preferences and all exclusions before starting discovery. Do not guess context if retrieval fails.",
    "2. Run several distinct searches for every selected discovery engine. Vary the query wording, target sectors, location terms and source types. Open and check useful original pages, not just search snippets.",
    "3. Build a deduplicated shortlist. Reject closed or stale requests when they are presented as current demand. For opportunity signals and ideal-customer fits, describe the observed fact separately from the commercial hypothesis.",
    "4. Prepare up to " + target + " records. Each record must contain a valid original public sourceUrl and a recognized discoveryEngine. Use only source URLs you actually inspected or verified in public results.",
    "5. Save the qualified batch in one HTTP POST request to the exact commercial lead save endpoint above. Set Content-Type: application/json and send a JSON body with profileId set to " + options.profileId + " and a leads array containing 1–50 records.",
    "6. Each lead object should follow this schema:",
    "{\"title\":\"Business or opportunity title\",\"company\":\"Company name\",\"contactName\":\"Verified contact name or blank\",\"contactRole\":\"Verified role or blank\",\"website\":\"https://company.example/\",\"profileUrl\":\"Public company or professional profile URL if available\",\"email\":\"Verified public business email or blank\",\"phone\":\"Verified public phone or blank\",\"location\":\"City or region\",\"country\":\"Country\",\"opportunitySummary\":\"Evidence-led summary and why it may matter\",\"serviceRequested\":\"Relevant service from the profile or blank\",\"discoveryEngine\":\"direct_demand | opportunity_signal | ideal_customer\",\"buyingIntent\":\"Explicit demand | Strong buying signal | Ideal customer prospect | Potential opportunity\",\"confidence\":\"High | Medium | Low | Unverified\",\"projectType\":\"one_time | recurring | either | unknown\",\"budgetText\":\"Only a publicly stated budget, otherwise blank\",\"estimatedValueMin\":null,\"estimatedValueMax\":null,\"valueCurrency\":\"Currency code or blank\",\"sourcePlatform\":\"Name of public source platform or website\",\"sourceType\":\"social_post | forum_post | business_website | project_site | public_web\",\"sourceUrl\":\"Exact original public evidence URL\",\"publishedAt\":null,\"evidenceUrls\":[\"https://...\"],\"scores\":{\"serviceMatch\":0,\"buyingIntent\":0,\"freshness\":0,\"commercialPotential\":0,\"contactability\":0,\"priority\":0},\"sourceMetadata\":{\"observedEvidence\":\"What the source actually states\",\"commercialRationale\":\"Why it could fit\",\"limitations\":\"Missing or uncertain details\"}}",
    "The numerical scores are prioritisation estimates, not verified probabilities. Use 0–100 values and score conservatively. Use null for unknown estimated value fields. Do not convert an inferred signal into a confirmed request.",
    "7. Read the actual POST status and JSON response. Report the exact returned total, saved, duplicates and invalid counts. A lead is saved only when its per-item status is saved or the aggregate saved count confirms it. Never claim success before the endpoint confirms it.",
    "8. If context retrieval fails, stop. If saving fails, do not claim that anything was saved; present the researched JSON and actual error so the user can retry.",
    "9. Stop the Firecrawl browser-interaction session after checking the save response.",
    "",
    "## Final report",
    "Return a concise table of the researched businesses with company, location, discovery engine, buying-intent classification, confidence, priority score, source link and the reason it fits. Separate observed evidence from your commercial interpretation.",
    "Then report the exact API save result: HTTP status, total, saved, duplicates, invalid and any failed records. Clearly state whether automatic saving succeeded.",
    "",
    "## Privacy",
    "Keep the Access Token, Vercel share key and authenticated API URLs private. Do not reproduce them in the report or send them to public web search. Do not contact prospects or send outreach messages; discovery and saving only."
  ];
  return lines.join("\n");
}
