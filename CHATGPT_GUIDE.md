# Connecting ChatGPT to Inlinked

Inlinked now uses a prompt gateway. You share one URL with the AI assistant; opening it returns the full selected prompt and creates a temporary 15-minute session. The permanent AI token is used only to open the gateway. Context, Save and Update requests use the temporary session token.

## Quick start

1. Sign in to Inlinked and open **Settings → ChatGPT connection**.
2. Generate or load your permanent AI token.
3. Select the workflow and search mode, then copy its prompt URL.
4. Give the URL to the AI assistant. When the assistant opens it, Inlinked returns the complete prompt and a new 15-minute session token.
5. The assistant uses the same temporary token for the workflow's Context, Save and Update endpoints.

You can also open the link in any ordinary browser. The response is plain text. Each successful visit creates a new session. Revoke or regenerate the permanent token to prevent future exchanges and revoke active sessions.

## Prompt URL formats

- Jobs: `/api/assistant-prompt?type=jobs&mode=standard&ai=<PERMANENT_AI_TOKEN>`
- Deep jobs: `/api/assistant-prompt?type=jobs&mode=deep&ai=<PERMANENT_AI_TOKEN>`
- Loose jobs: `/api/assistant-prompt?type=jobs&mode=loose&ai=<PERMANENT_AI_TOKEN>`
- LinkedIn Connections: `/api/assistant-prompt?type=connections&mode=standard&ai=<PERMANENT_AI_TOKEN>`
- Commercial Leads: `/api/assistant-prompt?type=leads&mode=standard&ai=<PERMANENT_AI_TOKEN>`
- Record updates: `/api/assistant-prompt?type=record_update&mode=standard&ai=<PERMANENT_AI_TOKEN>`

The Leads workflow automatically uses the active saved Lead Profile. Save and activate the intended profile before opening its link.

## Without an HTTP tool

Ask ChatGPT for structured JSON with one `recommendedOutreach` message per prospect. Use the manual import fallback in the Prospects workspace where available; verify that the message is included before importing. Never claim the records were saved automatically unless the API confirms it.


## Jobs: public-web job discovery

Use the same temporary session token used for lead research. The generated job prompt first calls:

`GET /api/assistant-context?scope=jobs&access=<ACCESS_TOKEN>`

Then, after research, it saves records with:

`POST /api/assistant-jobs-save?access=<ACCESS_TOKEN>`

Body (1–50 jobs per request):

```json
{"jobs":[{"title":"Job title","company":"Employer","description":"Publicly available description","salaryText":"Salary as advertised","workplaceType":"remote","employmentType":"Full-time","location":"Location","country":"Country","postedAt":null,"postedAtText":"Posted 3 days ago","sourcePlatform":"Company careers page","sourceType":"company_careers","sourceUrl":"https://employer.example/jobs/123","applicationUrl":"https://employer.example/apply/123","matchReason":"Why it matches","evidenceUrls":[]}]}
```

Job discovery searches public web sources broadly: job boards, employer career pages, public LinkedIn job listings, and public social-media/recruiter hiring posts. ChatGPT native web search is primary; Firecrawl is optional. Inlinked does not call a paid job provider. Private, deleted, unindexed or login-restricted posts may not be discoverable. Do not bypass platform controls or scrape protected LinkedIn content.

If ChatGPT cannot send the POST request, it should return a JSON object for manual import at **Jobs → Import from ChatGPT**. A successful HTTP response reports `total`, `saved`, `duplicates` and `invalid`.

### Job search modes

- **Standard search** is the default and keeps the saved eligibility preferences.
- **Deep & Broad Search** performs additional structured research passes and explores alternative relevant role wording without relaxing populated eligibility preferences.
- **Loose Mode** expands matching to adjacent titles, transferable responsibilities and equivalent software (for example, Xero/Sage workflows compared with QuickBooks Online). It can retain relevant vacancies with experience gaps, schedule conflicts or other soft-preference mismatches, but must show those warnings clearly. It must not claim the candidate has used unfamiliar software or has unconfirmed qualifications.

Loose Mode still rejects closed vacancies, scams, duplicates, excluded keywords and explicit country/residency restrictions that make the candidate ineligible. Unknown country eligibility is flagged for review. For each Loose Mode result, the prompt requests a skill-match score and a separate practical-eligibility classification. Matching details and warnings are stored in the existing `sourceMetadata` field; no new database columns or migration are required. Standard remains the default.


## Commercial Leads: ChatGPT-powered customer discovery

Commercial Leads uses a separate prompt generated inside the /leads workspace. Select a Lead Profile, choose one or more discovery engines, optionally add a location or query override, choose a target count, and copy the prompt into ChatGPT.

ChatGPT uses its own native web search and browsing to research public sources. It does not use Serper, Google Search API or another external discovery provider for this workflow. Firecrawl is used only to execute the authenticated Inlinked context and save API requests.

The prompt first calls GET /api/assistant-leads-context?profileId=PROFILE_ID&access=ACCESS_TOKEN. It then researches and saves the qualified batch through POST /api/assistant-leads-save?access=ACCESS_TOKEN.

The save body contains a top-level profileId and a leads array (1–50 records). Every record must contain a title or company, an original public sourceUrl, and a recognized discoveryEngine. Optional fields include contact details, website, location, public evidence URLs, opportunity summary, source metadata, conservative confidence and prioritisation scores. Unknown information should be blank or null, never invented.

The context response includes the selected profile's preferences, prior saved-record IDs and existing recommendations. The save prompt instructs the AI to create a personalized message for every qualified commercial lead. The save endpoint verifies token ownership and profile ownership, validates public HTTP(S) source URLs, sanitizes scores, stores recommendedOutreach, and skips duplicates. A successful response reports total, saved, duplicates, invalid and per-record statuses.

The discovery engines must remain distinct:
- Direct Demand: public requests, recommendations or explicit searches for a service.
- Opportunity Signals: observable business conditions that suggest a possible need; these are hypotheses, not confirmed buying requests.
- Ideal Customers: businesses matching the customer profile even without evidence they are currently buying.

Do not access private messages, closed groups, private profiles or login-restricted pages. Do not message prospects. ChatGPT must report the actual API result and must never say a lead was saved unless Inlinked confirms it.


## Personalized recommendations

Every AI research prompt now requires a `recommendedOutreach` message for each saved record:
- LinkedIn connections: short, natural connection request grounded in verified profile facts and your manually maintained professional context.
- Jobs: tailored recruiter or hiring-team introduction based on the vacancy requirements and your confirmed experience.
- Commercial Leads: a concise, business-relevant first message using the selected Lead Profile, verified contact details and public evidence.

The messages are drafts only. Inlinked does not send them. Each record card shows an editable recommendation field with a Copy message action. Existing records initially have an empty recommendation; ask an AI assistant to generate one and save it through the update endpoint.
