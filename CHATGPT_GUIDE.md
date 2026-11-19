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

## Security

- Treat the Access Token like a password. Anyone who has it can read your search context and save prospects to your Inlinked account.
- The raw token is not stored in the database; only its SHA-256 hash is stored.
- Do not paste prompts into public chats, repositories, documents or search engines.
- If a token is exposed, revoke it or generate a new one in **Settings → ChatGPT connection**. Previously copied prompts then stop working.

## Without an HTTP tool

Ask ChatGPT to list prospects as `Name | Company | LinkedIn profile URL`, one per line, then paste them into **Prospects → Paste from ChatGPT**. Duplicates are skipped.
