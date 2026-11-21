# LinkedIn Assistant

A global, individual-account prospecting workspace. Every Google-authenticated user has private preferences, prospects, and imported connection data. There are no teams, shared prospect lists, or in-app subscription tiers.

## Current architecture

- Google OAuth 2.0 sign-in with verified email.
- Neon PostgreSQL as the source of truth.
- Per-user LinkedIn profile URL, countries, industries, keywords, decision-maker titles, exclusions, language and optional profile context.
- Per-user prospects and imported LinkedIn connections.
- Database uniqueness on `(user_id, normalized_linkedin_url)` prevents duplicate profile saves, including concurrent writes.
- ChatGPT handoff using one per-user, long-lived, revocable Access Token. It is stored as a SHA-256 hash and can directly read context and save prospects only for its owner. Bulk saves support up to 50 prospects per request and database uniqueness prevents duplicate LinkedIn profiles.
- Public search via Serper. Search requests use plain-text queries (without exact-phrase quotes or Google search operators) and request up to 10 results per page; the app then filters results to public LinkedIn personal profiles. Search defaults come from each user's preferences; one-off industry or location inputs can narrow a search. Publicly indexed profile snippets may be used as optional context when a user supplies their own LinkedIn URL.

## Phase 3: personalized discovery

- Users can add their own LinkedIn personal-profile URL in Search settings.
- The app attempts to find that profile's publicly indexed Google search result. A LinkedIn URL does not grant access to private or login-protected profile data.
- Profile context, saved interests, industries, countries, keywords and target titles guide the prospect search.
- Search results receive a transparent keyword-based match estimate and match reasons.
- Existing prospects and imported connections are filtered out in the search page before saving.

## Phase 4: profile verification and AI lead intelligence

- Profile verification checks the exact LinkedIn URL against public search results and displays the title and snippet actually found.
- Missing profile sections remain marked as not found. Users can correct or enter name, headline, company, About context, skills, experience and education.
- On confirmation, each field is labelled as public indexed data or user-entered/edited data. The confirmed summary is saved to that user's account and used for lead matching and tailored research.
- AI Lead Intelligence searches public company, hiring, growth and operational signals, then creates an evidence-led company snapshot, hypotheses, opportunities, a reason to contact, a tailored value proposition and an outreach angle.
- Sources are shown with the report. Reports are private to the account and saved against the selected prospect.
- AI synthesis uses Vercel AI Gateway. Vercel deployments can authenticate with the deployment OIDC token; local development can use `AI_GATEWAY_API_KEY`. The model is configurable with `AI_GATEWAY_MODEL` (default: `openai/gpt-5.6-sol`).
- Public search results may be incomplete or outdated. Signals and pain points are not verified internal facts.

## Phase 5: outreach and relationship management

- Private per-user outreach history for LinkedIn, email and other channels.
- Editable connection-request, LinkedIn follow-up, email-introduction and email-follow-up drafts.
- The app never sends messages automatically. A user reviews, copies and sends manually, then explicitly records that it was sent.
- Sent messages, replies, meetings and notes are logged against the selected prospect. Sent/replied/meeting events update the prospect pipeline status.
- Follow-up dates create due/upcoming reminders. Duplicate profile saves are blocked by the existing per-user unique profile constraint; repeated identical sent-message logs are blocked for 10 minutes, and request idempotency keys prevent duplicate submissions.

## Phase 6: client acquisition dashboard

- Private counts for discovered, qualified, contacted, replies, meetings and clients won.
- Reply, meeting and client conversion rates based on recorded prospect statuses.
- Industry and outreach-message performance summaries, where the user has recorded those details.
- Weekly outreach activity and upcoming/overdue next actions.

## Setup

1. Create a Neon PostgreSQL database (the Neon free tier may be sufficient for an early test).
2. **Fresh database:** run `db/schema.sql` once. It is the canonical current schema and includes every table and column used by the application. No phase migrations are needed for a fresh install.
3. **Existing database created from the earlier base schema:** run `db/phase_3_preferences.sql`, `db/phase_4_intelligence_profile_verification.sql`, `db/phase_5_6_outreach_dashboard.sql`, and finally `db/phase_7_schema_alignment.sql`, in that order. The migrations are designed to be re-runnable. If Phases 3–6 have already been applied, run only Phase 7. Take a database backup before applying migrations to a database containing important data.
4. Create Google OAuth credentials in Google Cloud Console. Add this exact redirect URI: `https://YOUR_DOMAIN/api/auth/google/callback`.
5. Configure the environment variables below in Vercel and redeploy.
6. Set `APP_URL` to the public application origin.

## Environment variables

- `DATABASE_URL`: Neon PostgreSQL connection string. Keep server-side only.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret. Keep server-side only.
- `GOOGLE_REDIRECT_URI`: Exact HTTPS callback URL registered in Google Cloud.
- `APP_URL`: Public application origin.
- `SESSION_SECRET`: Random secret of at least 32 characters.
- `SERPER_API_KEY`: Search provider API key.
- `AI_GATEWAY_MODEL`: Optional model override for AI Lead Intelligence. Defaults to `openai/gpt-5.6-sol`.
- `AI_GATEWAY_API_KEY`: Optional local-development credential. Vercel deployments use OIDC authentication when AI Gateway is enabled.

## ChatGPT connection

Open **Settings → ChatGPT connection**. Choose **Research now** or **Recurring (scheduled)**, generate one Access Token, and copy the generated prompt into ChatGPT. See `CHATGPT_GUIDE.md` for the full flow.

- **One Access Token:** `POST /api/assistant-access` generates a per-user token. `GET` checks its status and `DELETE` revokes it. Regenerating the token revokes previous tokens immediately.
- **No expiry or exchange:** the Access Token does not expire automatically. ChatGPT uses it directly; there is no separate permanent-token concept or Credentials endpoint.
- **Endpoints:** `GET /api/assistant-context` reads profile, preferences and exclusions; `POST /api/assistant-save` saves 1-50 leads of `{name, company, linkedin}`. Both use the same Access Token via `?access=<token>` or `Authorization: Bearer <token>`.
- Each Access Token resolves to exactly one user. URLs are normalised and duplicates are skipped by database uniqueness.
- ChatGPT needs a tool that can send HTTP requests (for example Firecrawl). Without one, ask ChatGPT for `Name | Company | LinkedIn URL` lines and use **Prospects → Paste from ChatGPT**.
- Treat the Access Token like a password. The raw token is shown only once; only its SHA-256 hash is stored. Regenerating or revoking it immediately stops previously copied prompts from working.

The app's bulk-save flow does not require a paid LinkedIn Assistant plan or a LinkedIn OAuth connection. ChatGPT plan/feature availability is controlled by ChatGPT itself. Search-provider and AI-model usage may have their own limits or charges.

## Existing data

The previous prototype stored prospects and imported connections in private Vercel Blob JSON files, keyed by LinkedIn member ID. The new schema is ready for migration, but legacy Blob records are not automatically assigned to a Google account: they must be claimed by the original account owner before migration to avoid exposing one user's data to another. Browser-local prospects are migrated by the app on the first Google sign-in when no database prospects exist.

## Local development

```bash
npm install
npm run dev
```

Run `db/schema.sql` before signing in. Never commit real environment variables or tokens.


## Job discovery and tracking

Jobs are a separate workspace from Leads. Job-search preferences live in `job_search_preferences`; saved vacancies live in `jobs`. The app generates a ChatGPT prompt rather than performing its own job search. ChatGPT uses its native web search first and may optionally use Firecrawl when available. No paid job API or mandatory Firecrawl credential is required by Inlinked.

The job prompt searches public job boards, employer career pages, public LinkedIn job listings, and publicly discoverable social-media and recruiter hiring posts. The prompt builder offers **Standard search** (the existing default), **Deep & Broad Search** (additional structured research passes while keeping saved eligibility filters), and **Loose Mode** (expanded matching through adjacent roles, transferable skills and equivalent software, with experience, schedule and other soft-preference gaps clearly flagged). Loose Mode continues to enforce genuine/open-vacancy checks, country eligibility restrictions, excluded keywords, saved-job exclusions and deduplication. It does not claim experience with unfamiliar tools or qualifications. Search coverage is not exhaustive: unindexed, private, deleted or login-restricted content may not be discoverable. It instructs ChatGPT not to bypass access controls or scrape protected LinkedIn content.

- `GET/PUT /api/job-preferences`: authenticated per-user job preferences.
- `GET/POST/PATCH/DELETE /api/jobs`: signed-in user's saved jobs and application status.
- `POST /api/assistant-jobs-save`: saves 1–50 vacancies using the same long-lived Access Token as lead research.
- `GET /api/assistant-context?scope=jobs`: returns job preferences and already-saved source URLs to ChatGPT.

Job records keep the original source URL, application URL, title, employer, description, salary, workplace type, employment type, location, country, seniority, posting date, source platform, match reason and evidence links when these facts are available. Missing details stay blank rather than being invented. Source URLs are normalized for de-duplication.

Apply `db/phase_8_jobs_discovery.sql` to an existing database before enabling the Jobs feature, then apply `db/phase_9_leads_workspace.sql` to enable the independent commercial Leads workspace. For local development, run `db/schema.sql` and then Phase 9 until the canonical schema is updated.

## Commercial Leads workspace (Phase 9)

The navigation separates **LinkedIn Connections** from **Leads**. The existing `/prospects` and `/search` routes remain the LinkedIn professional discovery and relationship-management workflow; their existing records and APIs are preserved. The `/connections` route remains the imported LinkedIn connections list.

The new `/leads` workspace is an independent business opportunity and customer-discovery module for freelancers and businesses. Users can create multiple private Lead Profiles, each with editable service, ideal-customer, geographic, commercial, source, discovery-engine and exclusion preferences.

- **Direct Demand Discovery** searches for public requests and recommendation-seeking posts.
- **Opportunity Signal Discovery** searches for public indications of operational problems, expansion or outsourcing needs. These are hypotheses, not confirmed purchase requests.
- **Ideal Customer Discovery** finds businesses matching a profile even when they have not publicly expressed buying intent.
- `GET/POST/PATCH/DELETE /api/lead-profiles`: manage private profile preferences.
- `GET /api/assistant-leads-context?profileId=<PROFILE_ID>`: returns the selected Lead Profile preferences and already-saved company/source exclusions to ChatGPT using the long-lived Access Token.
- `POST /api/assistant-leads-save`: saves 1–50 researched commercial leads to the selected profile using the same Access Token; duplicate companies and source URLs are skipped.
- `GET/POST/PATCH/DELETE /api/leads`: save and manage commercial opportunities, evidence, scoring, pipeline stages and confirmed won value.

Commercial lead discovery is prompt-driven. Inlinked generates a profile-specific ChatGPT research prompt; ChatGPT uses its own native web search and browsing, then submits qualified records to the authenticated Inlinked save API. The commercial Leads workspace does not call Serper or another search provider. Serper remains in the separate existing LinkedIn prospect-intelligence feature.

Lead profiles and opportunities use separate PostgreSQL tables (`lead_profiles`, `business_leads`, `lead_activities`) and are isolated by authenticated user. Saved opportunities retain original public source URLs, evidence links, contact details when publicly verified, and separate direct demand from inferred signals and ideal-customer matches. ChatGPT-generated priority scores are research estimates, not verified buying intent, budget or revenue. Review original sources before contacting a prospect.

**Existing database upgrade:** run `db/phase_9_leads_workspace.sql` once after the Phase 8 migration. This does not alter or migrate existing LinkedIn prospects or imported connections. Existing individual accounts remain the initial ownership model; agency multi-client workspaces and permissions are a later phase.

## AI record updates and research attribution

AI save prompts for LinkedIn prospects, jobs and commercial Leads instruct the assistant to identify the AI application currently hosting the conversation and stamp its name into the top-level `researchTool` field automatically. No manual AI-app selector is shown. The assistant must use `Unknown` if it cannot reliably identify the host application. This attribution is separate from `sourcePlatform` / the original public source.

`POST /api/assistant-update` is an API route (not a browsable page) and is available at `https://inlinked.vercel.app/api/assistant-update` on the production app. The UI exposes a separate reusable prompt under Settings → ChatGPT connection → Dedicated Record Update Assistant Prompt. Research prompts do not contain update instructions; copy the dedicated prompt into an AI conversation once to enable follow-up status updates there. It uses the same long-lived Inlinked Access Token as the assistant save endpoints, sent as `Authorization: Bearer <ACCESS_TOKEN>` or through `?access=<ACCESS_TOKEN>`. It accepts 1–50 updates in an `updates` array. Each item contains `resource` (`linkedin_prospect`, `job` or `commercial_lead`), the saved record `id`, the new valid `status`, and optional `notes`. Supported resources are saved Jobs, LinkedIn research prospects (not the separate CSV-imported Connections snapshot), and Commercial Leads. The endpoint verifies record ownership and returns `updated`, `notFound` and `invalid` counts. Only use it after the user confirms that the contact or application action actually happened.

Assistant save responses now include saved record IDs. Context responses also expose recent `savedProspectRecords`, `savedJobRecords` and `savedLeadRecords` with IDs so older records can be updated by a later AI request.

**Database upgrade:** apply `db/phase_10_ai_research_tool.sql` after Phase 9. Existing records keep their history and receive `research_tool = 'Unknown'` until a new save is made by a self-identifying AI prompt or an API request supplies `researchTool` explicitly.