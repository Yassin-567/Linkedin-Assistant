# LinkedIn Assistant

A global, individual-account prospecting workspace. Every Google-authenticated user has private preferences, prospects, and imported connection data. There are no teams or shared prospect lists. Inlinked includes Free and Pro account plans; billing is integrated with Paddle.

## Current architecture

- Google OAuth 2.0 sign-in with verified email.
- Neon PostgreSQL as the source of truth.
- Per-user LinkedIn profile URL, countries, industries, keywords, decision-maker titles, exclusions, language and optional profile context.
- Per-user prospects and imported LinkedIn connections.
- Database uniqueness on `(user_id, normalized_linkedin_url)` prevents duplicate profile saves, including concurrent writes.
- ChatGPT handoff using one per-user, long-lived, revocable Access Token. It is stored as a SHA-256 hash and can directly read context and save prospects only for its owner. Bulk saves support up to 50 prospects per request and database uniqueness prevents duplicate LinkedIn profiles.
- Inlinked does not perform in-app web or LinkedIn profile searches. External AI assistants use the saved context and their own public-web research, then save verified LinkedIn prospects, commercial opportunities and jobs through authenticated Inlinked APIs.

## Professional context and external AI research

- Settings stores your LinkedIn profile URL, professional summary, skills, experience and other user-provided background for external AI assistants.
- These details are manually maintained. Inlinked does not inspect or search your LinkedIn profile.
- The ChatGPT research prompts use your saved context and preferences. ChatGPT or another AI assistant performs its own public-web research and submits qualified records to Inlinked.
- The former in-app Find Connections search and AI Intelligence research features have been removed. Their Serper and AI Gateway server routes are no longer part of the application.

## Phase 5: outreach and relationship management

- Private per-user outreach history for LinkedIn, email and other channels.
- Editable connection-request, LinkedIn follow-up, email-introduction and email-follow-up drafts.
- Every LinkedIn connection, Commercial Lead and Job can store an AI-generated `recommendedOutreach` draft. It is personalized to verified public evidence and the user's confirmed professional or Lead Profile context, and can be edited or copied from its record card. Inlinked never sends it automatically.
- The app never sends messages automatically. A user reviews, copies and sends manually, then explicitly records that it was sent.
- Sent messages, replies, meetings and notes are logged against the selected prospect. An outreach event's `occurred_at` (when it happened) is separate from `created_at` (when it was recorded). Older entries without a reliable event time remain blank until corrected. Logging a meeting records a completed meeting event and does not mean a future meeting is still booked.
- LinkedIn prospects store `connection_sent_at` and `connected_at` as event timestamps when known. The legacy `connected_on` field remains date-only; changing a pipeline status does not invent an event date or time.
- Follow-up dates create due/upcoming reminders. Duplicate profile saves are blocked by the existing per-user unique profile constraint; repeated identical sent-message logs are blocked for 10 minutes, and request idempotency keys prevent duplicate submissions.

## Phase 6: client acquisition dashboard

- Private counts for discovered, qualified, contacted, replies, prospects currently in the `Call booked` stage, meetings logged as events, and clients won.
- Reply and current booked-stage conversion rates based on prospect statuses.
- Industry and outreach-message performance summaries, where the user has recorded those details.
- Weekly outreach activity grouped by event occurrence time; older activity without a known event time is excluded until corrected.
- Upcoming/overdue follow-up actions are separate from completed meetings.

## Setup

1. Create a Neon PostgreSQL database (the Neon free tier may be sufficient for an early test).
2. **Fresh database:** run `db/schema.sql` once. It is the canonical current schema and includes every table and column used by the application. No phase migrations are needed for a fresh install.
3. **Existing database created from the earlier base schema:** run the historical migrations in their documented order, then apply Phase 8 and Phase 9 if those workspaces are enabled. Finally run `db/phase_11_recommended_outreach_and_remove_research.sql`, followed by the newer numbered migrations for the current deployment, including `db/phase_14_activity_timestamps.sql` and `db/phase_15_activity_occurrence_times.sql`. Back up important data before applying schema changes.
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

## ChatGPT connection

Open **Settings → ChatGPT connection**. Choose **Research now** or **Recurring (scheduled)**, generate one Access Token, and copy the generated prompt into ChatGPT. See `CHATGPT_GUIDE.md` for the full flow.

- **One Access Token:** `POST /api/assistant-access` generates a per-user token. `GET` checks its status and `DELETE` revokes it. Regenerating the token revokes previous tokens immediately.
- **No expiry or exchange:** the Access Token does not expire automatically. ChatGPT uses it directly; there is no separate permanent-token concept or Credentials endpoint.
- **Endpoints:** `GET /api/assistant-context` reads profile, preferences and exclusions; `POST /api/assistant-save` saves 1-50 leads of `{name, company, linkedin}`. Both use the same Access Token via `?access=<token>` or `Authorization: Bearer <token>`.
- Each Access Token resolves to exactly one user. URLs are normalised and duplicates are skipped by database uniqueness.
- ChatGPT needs a tool that can send HTTP requests (for example Firecrawl). Without one, ask ChatGPT for `Name | Company | LinkedIn URL` lines and use **Prospects → Paste from ChatGPT**.
- Treat the Access Token like a password. The raw token is shown only once; only its SHA-256 hash is stored. Regenerating or revoking it immediately stops previously copied prompts from working.

The app's bulk-save flow does not require a paid LinkedIn Assistant plan or a LinkedIn OAuth connection. ChatGPT or another external AI assistant performs public research; Inlinked stores the results and personalized message drafts. AI web-search availability depends on the external AI platform.

## Existing data

The previous prototype stored prospects and imported connections in private Vercel Blob JSON files, keyed by LinkedIn member ID. The new schema is ready for migration, but legacy Blob records are not automatically assigned to a Google account: they must be claimed by the original account owner before migration to avoid exposing one user's data to another. Browser-local prospects are migrated by the app on the first Google sign-in when no database prospects exist.

## AI prompt gateway and temporary sessions (Phase 12)

Use one public bootstrap endpoint to retrieve the selected AI prompt:

`GET /api/assistant-prompt?type=jobs&mode=loose&ai=<PERMANENT_AI_TOKEN>`

Supported `type` values are `connections`, `jobs`, `leads`, and `record_update`. Jobs support `standard`, `deep`, and `loose`; the other workflows currently use `mode=standard`. The Leads workflow automatically selects the account's active Lead Profile and its saved discovery engines.

The permanent `ai_access_tokens` credential is checked only by this bootstrap route. A successful request generates a random session token, stores only its SHA-256 hash in `assistant_session_tokens`, and returns the complete prompt as plain text. The prompt includes the temporary token, the relevant prompt instructions, all Context/Save/Update endpoint references and confidentiality instructions. Session tokens expire 15 minutes after issuance.

All AI Context, Save and Update routes use the same temporary token in an `Authorization: Bearer <SESSION_TOKEN>` header. They do not accept the permanent AI token. Regenerating or revoking the permanent credential also revokes active prompt sessions. Opening the bootstrap URL again creates a new independent 15-minute session.

The bootstrap URL itself contains the permanent credential and must be treated as a password. Anyone who receives it can open it in a browser, view the returned prompt and create temporary sessions. The confidentiality instructions are model guidance, not a technical guarantee that a model cannot disclose its context. Responses are marked no-store and no-referrer.

**Existing database upgrade:** apply `db/phase_12_ai_prompt_gateway.sql` after Phase 11. Fresh installations should use the updated `db/schema.sql`.

## Owner-only admin panel (Phase 13)

The owner account `yassinalaa3310@gmail.com` can open `/admin`. Admin access is checked on the server for both the page and its API; hiding the navigation item is not the security boundary.

The user table shows each account's latest saved job (the app does not currently store a separate current-employer field), total saved jobs, commercial leads, LinkedIn prospects and imported LinkedIn connections. The owner can freeze/unfreeze accounts, ban/unban accounts, or invalidate all active InLinked sessions. Administrative actions are written to `admin_audit_log`.

A frozen user can sign in but cannot use the workspace or AI prompt/token workflows. Their data and encrypted permanent AI token are preserved; unfreezing restores access without requiring a new LinkedIn connection. Bans block sign-in and invalidate existing sessions. The owner account is protected from these actions.

**Existing database upgrade:** apply `db/phase_13_admin_controls.sql` after Phase 12. The canonical `db/schema.sql` also includes the Phase 13 tables and columns for fresh installations.

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
- `POST /api/assistant-jobs-save`: saves 1–50 vacancies using the temporary session token issued by the AI prompt gateway.
- `GET /api/assistant-context?scope=jobs`: returns job preferences and already-saved source URLs to ChatGPT.

Job records keep the original source URL, application URL, title, employer, description, salary, workplace type, employment type, location, country, seniority, posting date, source platform, match reason, recommended outreach message and evidence links when these facts are available. Missing details stay blank rather than being invented. Source URLs are normalized for de-duplication.

Apply `db/phase_8_jobs_discovery.sql` to an existing database before enabling the Jobs feature, then apply `db/phase_9_leads_workspace.sql` to enable the independent commercial Leads workspace. For local development, run `db/schema.sql` and then Phase 9 until the canonical schema is updated.

## Commercial Leads workspace (Phase 9)

The navigation separates **LinkedIn Connections** from **Leads**. `/prospects` is the saved LinkedIn relationship pipeline; `/connections` remains the imported LinkedIn Connections CSV list. The in-app `/search` page has been removed.

The new `/leads` workspace is an independent business opportunity and customer-discovery module for freelancers and businesses. Users can create multiple private Lead Profiles, each with editable service, ideal-customer, geographic, commercial, source, discovery-engine and exclusion preferences.

- **Direct Demand Discovery** searches for public requests and recommendation-seeking posts.
- **Opportunity Signal Discovery** searches for public indications of operational problems, expansion or outsourcing needs. These are hypotheses, not confirmed purchase requests.
- **Ideal Customer Discovery** finds businesses matching a profile even when they have not publicly expressed buying intent.
- `GET/POST/PATCH/DELETE /api/lead-profiles`: manage private profile preferences.
- `GET /api/assistant-leads-context?profileId=<PROFILE_ID>`: returns the selected Lead Profile preferences and already-saved company/source exclusions to ChatGPT using a temporary session token.
- `POST /api/assistant-leads-save`: saves 1–50 researched commercial leads to the selected profile using the same temporary session token; duplicate companies and source URLs are skipped.
- `GET/POST/PATCH/DELETE /api/leads`: save and manage commercial opportunities, evidence, scoring, pipeline stages and confirmed won value.

Commercial lead discovery is prompt-driven. Inlinked generates a profile-specific AI research prompt; ChatGPT uses its own native web search and browsing, then submits qualified records and a personalized first-contact message to the authenticated Inlinked save API. Inlinked itself does not run searches.

Lead profiles and opportunities use separate PostgreSQL tables (`lead_profiles`, `business_leads`, `lead_activities`) and are isolated by authenticated user. Saved opportunities retain original public source URLs, evidence links, contact details when publicly verified, and separate direct demand from inferred signals and ideal-customer matches. ChatGPT-generated priority scores are research estimates, not verified buying intent, budget or revenue. Review original sources before contacting a prospect.

**Existing database upgrade:** run `db/phase_9_leads_workspace.sql` once after the Phase 8 migration. This does not alter or migrate existing LinkedIn prospects or imported connections. Existing individual accounts remain the initial ownership model; agency multi-client workspaces and permissions are a later phase.

## AI record updates and research attribution

AI save prompts for LinkedIn prospects, jobs and commercial Leads instruct the assistant to identify the AI application currently hosting the conversation and stamp its name into the top-level `researchTool` field automatically. No manual AI-app selector is shown. The assistant must use `Unknown` if it cannot reliably identify the host application. This attribution is separate from `sourcePlatform` / the original public source.

`POST /api/assistant-update` is an API route (not a browsable page). The UI exposes a separate reusable prompt under Settings → ChatGPT connection → Dedicated Record Update Assistant Prompt. It uses the same long-lived Access Token as the save endpoints. It accepts 1–50 updates for `linkedin_prospect`, `job` and `commercial_lead`. Each item can update a status, notes and/or `recommendedOutreach`; status is optional for recommendation-only changes. The endpoint verifies ownership and returns `updated`, `notFound`, `invalid` and per-item results. `recommendedOutreach` is stored separately from pipeline status and notes.

Assistant save responses include saved record IDs. Context responses expose recent `savedProspectRecords`, `savedJobRecords` and `savedLeadRecords`, including their current `recommendedOutreach`, so AI assistants can avoid overwriting an existing draft unless asked.

**Database upgrades:** apply `db/phase_10_ai_research_tool.sql` after Phase 9 if it has not already been applied. Then apply `db/phase_11_recommended_outreach_and_remove_research.sql`. Existing records receive an empty recommendation until an AI assistant generates one. The migration removes the retired `prospect_intelligence` report table but preserves prospects and outreach activities.

## Phase 15: event occurrence timestamps and data clarity

- Outreach activity `occurred_at` stores when an event happened; `created_at` remains the time the entry was recorded. Historical rows are not backfilled because the actual event time may differ from the record time.
- Prospect `connected_at` and `connection_sent_at` store actual event timestamps when known. `connected_on` remains a date-only compatibility field.
- Weekly activity counts use `occurred_at`, while "Meetings logged" counts meeting events and "Currently booked" counts the current `Call booked` pipeline status.
- Placeholder `Unknown` metadata is cleared rather than replaced with invented values; the UI suppresses missing metadata.
- Apply `db/phase_15_activity_occurrence_times.sql` to existing databases. Do not backfill occurrence timestamps from `created_at`.


## Phase 16: Paddle Billing (sandbox implementation)

- Billing is linked to the authenticated Inlinked account. The browser sends only a monthly/yearly choice; the server selects one of the two catalog price IDs and creates the Paddle transaction for the signed-in account.
- The server stores the Paddle customer-to-Inlinked-user mapping before a checkout transaction is opened. Webhook ownership is resolved from that server-side mapping, not from browser-supplied identity or editable transaction custom data.
- Pro is granted only when a verified, signed Paddle subscription webhook reports a supported Inlinked Pro price with status `active` or `trialing`. Every AI prompt/session API checks this entitlement server-side.
- The Free plan allows up to 100 LinkedIn prospects. Saved-job and lead-profile caps remain owner decisions and are not guessed in this build. Pro caps are also left as explicit placeholders; do not describe them as unlimited until approved.
- The current default status rule makes `past_due`, `paused` and `canceled` Free immediately. A scheduled cancellation remains Pro while Paddle continues to report the subscription as `active`; it becomes Free when Paddle reports `canceled`. This is the current technical default and still requires the owner's explicit policy review.
- Refunds, chargebacks and grace-period behavior are not defined by this implementation. Confirm these policies before live launch. Terms of Service, Privacy Policy and Refund Policy links are placeholders and must be completed before any live payment.
- The Paddle browser SDK uses the sandbox environment, and the server API helper always calls `https://sandbox-api.paddle.com`. Server startup/runtime checks reject missing sandbox configuration and API keys without the sandbox marker. Do not add live keys or change the environment to live in this branch.

### Isolated preview setup

This branch uses its own isolated Neon branch named `inlinked-paddle-sandbox`. Its connection string is configured only as a Vercel Preview environment variable scoped to this Git branch. The Phase 16 tables have been created on that isolated branch only. Do not copy this branch's database URL to Production.

Set these values for the Vercel Preview environment, scoped to Git branch `inlinked-paddle-sandbox`. Create a sandbox API key with only `transaction.write` and `customer_portal_session.write` permissions:

- `PADDLE_ENVIRONMENT=sandbox`
- `NEXT_PUBLIC_PADDLE_CLIENT_TOKEN`: sandbox client-side token beginning with `test_`
- `PADDLE_API_KEY`: sandbox API key (server-side secret only; never paste it into chat or commit it)
- `PADDLE_WEBHOOK_SECRET`: endpoint secret from the sandbox notification destination (server-side secret only)
- `PADDLE_PRICE_MONTHLY=pri_01m8a8bs00jpx3744wt0t43165`
- `PADDLE_PRICE_YEARLY=pri_01m8a8cb47d6zqb5q5svbdzb5n`

The preview's `DATABASE_URL` is already set to the isolated Neon branch. Keep it scoped to this Preview Git branch. Add the sandbox webhook notification destination with endpoint `/api/billing/webhook` on the current Vercel Preview URL and subscribe it to `transaction.completed`, `subscription.created`, `subscription.updated`, `subscription.canceled`, `customer.created` and `customer.updated`. Configure the Paddle sandbox default payment link to the same preview app origin. Do not create a live notification destination or use the live Paddle dashboard.

### Sandbox verification checklist

1. Sign in to the Paddle-configured Preview deployment and open **Plans & billing**.
2. Confirm Paddle's price preview displays the monthly and yearly totals. These are returned by Paddle.js; the app does not calculate or hard-code the totals.
3. Test monthly and yearly sandbox checkouts with Paddle's documented test cards. Use `4242 4242 4242 4242` for a successful non-3DS payment, `4000 0038 0000 0446` for a 3DS flow, `4000 0000 0000 0002` for a decline, and `4000 0027 6000 3184` for an initially successful payment followed by decline. Use a future expiry date and the other values requested by the sandbox form.
4. Verify the sandbox dashboard shows the transactions and that each webhook notification receives 2xx. A declined payment or a forged/modified webhook must never grant Pro. A browser-supplied unknown price or customer/user ID must not be accepted.
5. Verify the customer portal opens only for the authenticated user's mapped Paddle customer. Cancellation behavior, refunds and chargebacks require owner policy confirmation before live use.

No real payments have been enabled or tested by this branch. A successful Vercel build is not evidence that checkout, webhook delivery or entitlement changes have passed a live browser test.
