# LinkedIn Assistant

A global, individual-account prospecting workspace. Every Google-authenticated user has private preferences, prospects, and imported connection data. There are no teams, shared prospect lists, or in-app subscription tiers.

## Current architecture

- Google OAuth 2.0 sign-in with verified email.
- Neon PostgreSQL as the source of truth.
- Per-user LinkedIn profile URL, countries, industries, keywords, decision-maker titles, exclusions, language and optional profile context.
- Per-user prospects and imported LinkedIn connections.
- Database uniqueness on `(user_id, normalized_linkedin_url)` prevents duplicate profile saves, including concurrent writes.
- ChatGPT handoff using per-user, revocable tokens (10-minute access tokens or a permanent token). Each token can read context and create prospects only for its owner. Bulk saves support up to 50 prospects per request and database uniqueness prevents duplicate LinkedIn profiles.
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

Open **ChatGPT** in the app menu (`/chatgpt`). Pick what ChatGPT should do (research now or recurring), pick a connection method, and copy the generated prompt into ChatGPT. See `CHATGPT_GUIDE.md` for the full flow.

- **Quick session:** the app issues a 10-minute access token (`POST /api/assistant-access`, signed-in users only). The prompt carries that token.
- **Permanent token:** a revocable per-user `INLINKED_AI_AUTH_TOKEN`, shown once. ChatGPT exchanges it for a 10-minute access token with `POST /api/assistant-credentials`.
- **Endpoints:** `POST /api/assistant-credentials?access=<permanent-token>` exchanges a permanent token for a 10-minute access token (the existing `Authorization: Bearer <token>` method remains supported). The returned Context and Save URLs carry the temporary token in `?access=`. `GET /api/assistant-context` reads profile, preferences and exclusions; `POST /api/assistant-save` saves 1-50 leads of `{name, company, linkedin}`. Context and Save also accept Bearer tokens. Credentials validates permanent tokens only; temporary tokens cannot be exchanged again. Every token resolves to exactly one user; URLs are normalised and duplicates are skipped by database uniqueness.
- ChatGPT needs a tool that can send HTTP requests with headers and a JSON body (for example Firecrawl). Without one, ask ChatGPT for `Name | Company | LinkedIn URL` lines and use **Prospects → Paste from ChatGPT**.
- Regenerating or revoking the permanent token revokes all active access tokens. Treat tokens like passwords and never commit them.

The app's bulk-save flow does not require a paid LinkedIn Assistant plan or a LinkedIn OAuth connection. ChatGPT plan/feature availability is controlled by ChatGPT itself. Search-provider and AI-model usage may have their own limits or charges.

## Existing data

The previous prototype stored prospects and imported connections in private Vercel Blob JSON files, keyed by LinkedIn member ID. The new schema is ready for migration, but legacy Blob records are not automatically assigned to a Google account: they must be claimed by the original account owner before migration to avoid exposing one user's data to another. Browser-local prospects are migrated by the app on the first Google sign-in when no database prospects exist.

## Local development

```bash
npm install
npm run dev
```

Run `db/schema.sql` before signing in. Never commit real environment variables or tokens.
