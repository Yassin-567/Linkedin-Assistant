# Connecting ChatGPT to Inlinked

ChatGPT researches prospects and saves them to your Prospects list. It uses one long-lived, per-user Inlinked Access Token for both context retrieval and prospect saving. The token does not expire automatically. It remains valid until you revoke or regenerate it.

ChatGPT must use Firecrawl's browser-interaction capability to execute the HTTP requests. It must apply your saved preferences and exclude your excluded keywords, existing connections and saved prospects. Without Firecrawl, use the paste fallback at the bottom.

## Quick start

1. Sign in to Inlinked and open **Settings → ChatGPT connection**.
2. Choose **Research now** or **Recurring (scheduled)**.
3. Generate an **Access Token**. It is shown once; keep it private.
4. Copy the generated prompt into ChatGPT.

Both prompt types use exactly the same Access Token. Recurring tasks do not need a credentials exchange or a separate permanent token.

## Access Token

- Generate or regenerate: `POST /api/assistant-access` (signed-in Inlinked users only).
- Check status: `GET /api/assistant-access`.
- Revoke: `DELETE /api/assistant-access`.
- The token is stored in the database as a SHA-256 hash.
- It is associated with one Inlinked user and can only read that user's search context and save prospects to that user's account.
- It has no automatic expiry. Regenerating or revoking it invalidates the previous token immediately.
- The raw token is shown only when generated. If you lose it, regenerate it.

## Context and Save endpoints

Use the same Access Token directly with both endpoints. No Credentials endpoint or token exchange is involved.

| Purpose | Request | Authentication |
|---|---|---|
| Read profile, preferences and exclusions | `GET /api/assistant-context?access=<ACCESS_TOKEN>` | Access Token |
| Save prospects | `POST /api/assistant-save?access=<ACCESS_TOKEN>` | Same Access Token |

Both endpoints also accept `Authorization: Bearer <ACCESS_TOKEN>` instead of the query parameter. The generated ChatGPT prompt uses the `access` query parameter.

Save body (1 to 50 leads; personal `linkedin.com/in/` profiles only):

```json
{"leads":[{"name":"Full name","company":"Company name","linkedin":"https://www.linkedin.com/in/profile-slug"}]}
```

Response: `total`, `saved`, `duplicates`, `invalid` and a per-lead `results` array. Prospects are stored with status "To research".


## Update saved records

Use the same long-lived Access Token with:

`POST /api/assistant-update?access=<ACCESS_TOKEN>`

Body (1–50 updates per request):

```json
{"updates":[{"resource":"job","id":"saved-record-uuid","status":"Applied","notes":"Application submitted through the employer website."},{"resource":"linkedin_prospect","id":"saved-prospect-uuid","status":"Contacted"},{"resource":"commercial_lead","id":"saved-lead-uuid","status":"Contacted"}]}
```

Allowed resources are `linkedin_prospect`, `job`, and `commercial_lead`. The status must exactly match that workspace's existing status choices. Notes are optional. The response reports `updated`, `notFound`, `invalid` and per-item results. Every record is checked against the user owning the Access Token.

The assistant save endpoints return the database ID for each saved record. Context responses also include recent saved record IDs: `savedProspectRecords` in normal LinkedIn context, `savedJobRecords` in `scope=jobs` context, and `savedLeadRecords` in commercial Lead context. Match a record unambiguously by its name/company/title/source URL before using its ID. Ask the user to clarify when more than one record could match.

Only send an update after the user confirms that the action actually happened. A drafted message, an opened company website, or an opened application page does not mean that the prospect was contacted or the job was applied for.

## AI research tool attribution

Every assistant save request may include a top-level `researchTool` field, such as `ChatGPT`, `Claude`, `Gemini`, `Perplexity`, `Grok`, `Microsoft Copilot` or a custom label. Inlinked stores this separately from `sourcePlatform` / the original website or job board and displays it on saved records. New prompts include the selected tool automatically; for manual API requests, pass the tool name explicitly. Older records show `Unknown`.

## Security

- Treat the Access Token like a password. Anyone who has it can read your search context and save prospects to your Inlinked account.
- The raw token is not stored in the database; only its SHA-256 hash is stored.
- Do not paste prompts into public chats, repositories, documents or search engines.
- If a token is exposed, revoke it or generate a new one in **Settings → ChatGPT connection**. Previously copied prompts then stop working.

## Without an HTTP tool

Ask ChatGPT to list prospects as `Name | Company | LinkedIn profile URL`, one per line, then paste them into **Prospects → Paste from ChatGPT**. Duplicates are skipped.


## Jobs: public-web job discovery

Use the same long-lived Access Token used for lead research. The generated job prompt first calls:

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

The context response includes the selected profile's preferences and previously saved company, website and source URL exclusions. The save endpoint verifies token ownership and profile ownership, validates public HTTP(S) source URLs, sanitizes scores, and skips duplicates. A successful response reports total, saved, duplicates, invalid and per-record statuses.

The discovery engines must remain distinct:
- Direct Demand: public requests, recommendations or explicit searches for a service.
- Opportunity Signals: observable business conditions that suggest a possible need; these are hypotheses, not confirmed buying requests.
- Ideal Customers: businesses matching the customer profile even without evidence they are currently buying.

Do not access private messages, closed groups, private profiles or login-restricted pages. Do not message prospects. ChatGPT must report the actual API result and must never say a lead was saved unless Inlinked confirms it.
