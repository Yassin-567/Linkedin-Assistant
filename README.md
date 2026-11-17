# LinkedIn Assistant

A global, individual-account prospecting workspace. Every Google-authenticated user has private preferences, prospects, and imported connection data. There are no teams, shared prospect lists, or in-app subscription tiers.

## Current architecture

- Google OAuth 2.0 sign-in with verified email.
- Neon PostgreSQL as the source of truth.
- Per-user LinkedIn profile URL, countries, industries, keywords, decision-maker titles, exclusions, language and optional profile context.
- Per-user prospects and imported LinkedIn connections.
- Database uniqueness on `(user_id, normalized_linkedin_url)` prevents duplicate profile saves, including concurrent writes.
- ChatGPT handoff using per-user, revocable AI Access Tokens. Each token can create prospects only for its owner; users can regenerate or revoke it at any time. Bulk saves support up to 50 prospects per request and database uniqueness prevents duplicate LinkedIn profiles.
- Public search via the existing Serper provider. Search defaults come from each user's preferences; one-off industry or location inputs can narrow a search. Publicly indexed profile snippets may be used as optional context when a user supplies their own LinkedIn URL.

## Phase 3: personalized discovery

- Users can add their own LinkedIn personal-profile URL in Search settings.
- The app attempts to find that profile's publicly indexed Google search result. A LinkedIn URL does not grant access to private or login-protected profile data.
- Profile context, saved interests, industries, countries, keywords and target titles guide the prospect search.
- Search results receive a transparent keyword-based match estimate and match reasons.
- Existing prospects and imported connections are filtered out in the search page before saving.

## Setup

1. Create a Neon PostgreSQL database (the Neon free tier may be sufficient for an early test).
2. For a new database, run the SQL in `db/schema.sql`. For an existing database, run `db/phase_3_preferences.sql` against that database before deploying this version.
3. Create Google OAuth credentials in Google Cloud Console. Add this exact redirect URI: `https://YOUR_DOMAIN/api/auth/google/callback`.
4. Configure the environment variables below in Vercel and redeploy.
5. Set `APP_URL` to the public application origin.

## Environment variables

- `DATABASE_URL`: Neon PostgreSQL connection string. Keep server-side only.
- `GOOGLE_CLIENT_ID`: Google OAuth client ID.
- `GOOGLE_CLIENT_SECRET`: Google OAuth client secret. Keep server-side only.
- `GOOGLE_REDIRECT_URI`: Exact HTTPS callback URL registered in Google Cloud.
- `APP_URL`: Public application origin.
- `SESSION_SECRET`: Random secret of at least 32 characters.
- `SERPER_API_KEY`: Search provider API key. This is separate from any LinkedIn Assistant app subscription.

## ChatGPT bulk-save workflow

1. Sign in to the app with Google.
2. Run `db/ai_access_tokens.sql` once against the Neon database (existing databases only). New databases also receive the table from `db/schema.sql`.
3. On the home page, generate an AI Access Token. Copy it immediately; the raw token is displayed only once.
4. Give ChatGPT the token and the generated save endpoint. ChatGPT can POST a JSON `{ "leads": [...] }` body (up to 50 prospects) to that endpoint, or build a GET URL by adding `data=` with base64url-encoded JSON. GET payloads are limited to 6,500 encoded characters to avoid oversized URLs.
5. Each request is scoped to the token owner. LinkedIn profile URLs are normalized and database uniqueness skips duplicates.
6. Regenerating a token revokes the previous one. Users can also revoke it from the home page. Treat the token like a password; do not publish it or commit it to source control.

The app's bulk-save flow does not require a paid LinkedIn Assistant plan or a LinkedIn OAuth connection. ChatGPT plan/feature availability is controlled by ChatGPT itself. Search-provider usage may have its own limits or charges.

## Existing data

The previous prototype stored prospects and imported connections in private Vercel Blob JSON files, keyed by LinkedIn member ID. The new schema is ready for migration, but legacy Blob records are not automatically assigned to a Google account: they must be claimed by the original account owner before migration to avoid exposing one user's data to another. Browser-local prospects are migrated by the app on the first Google sign-in when no database prospects exist.

## Local development

```bash
npm install
npm run dev
```

Run `db/schema.sql` before signing in. Never commit real environment variables or tokens.
