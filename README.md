# LinkedIn Assistant

A global, individual-account prospecting workspace. Every Google-authenticated user has private preferences, prospects, and imported connection data. There are no teams, shared prospect lists, or in-app subscription tiers.

## Current architecture

- Google OAuth 2.0 sign-in with verified email.
- Neon PostgreSQL as the source of truth.
- Per-user countries, industries, keywords, decision-maker titles, exclusions, language and profile summary.
- Per-user prospects and imported LinkedIn connections.
- Database uniqueness on `(user_id, normalized_linkedin_url)` prevents duplicate profile saves, including concurrent writes.
- ChatGPT handoff using short-lived user-scoped read and bulk-save links. ChatGPT can read a user's prospect list once and save one batch of up to 50 prospects. Read and write links expire after 10 minutes; the save token can be used for one batch only.
- Public search via the existing Serper provider. Results are filtered against each user's own saved prospects and imported connections in the app.

## Setup

1. Create a Neon PostgreSQL database (the Neon free tier may be sufficient for an early test).
2. Run the SQL in `db/schema.sql` against that database.
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
2. Generate the temporary ChatGPT links on the home page.
3. Give ChatGPT both links. First it calls the read link to check existing prospects and the user's profile context; then it researches new prospects and POSTs a batch to the save link.
4. The save endpoint validates LinkedIn personal profile URLs and inserts records only for the user who generated the token. Existing profile URLs are returned as duplicates.
5. The temporary links are credentials. Do not share them publicly. Generate a fresh pair for each ChatGPT task.

The app's bulk-save flow does not require a paid LinkedIn Assistant plan or a LinkedIn OAuth connection. ChatGPT plan/feature availability is controlled by ChatGPT itself. Search-provider usage may have its own limits or charges.

## Existing data

The previous prototype stored prospects and imported connections in private Vercel Blob JSON files, keyed by LinkedIn member ID. The new schema is ready for migration, but legacy Blob records are not automatically assigned to a Google account: they must be claimed by the original account owner before migration to avoid exposing one user's data to another. Browser-local prospects are migrated by the app on the first Google sign-in when no database prospects exist.

## Local development

```bash
npm install
npm run dev
```

Run `db/schema.sql` before signing in. Never commit real environment variables or tokens.
