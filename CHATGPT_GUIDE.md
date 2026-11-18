# Connecting ChatGPT to Inlinked

ChatGPT researches prospects and saves them to your Prospects list. ChatGPT must use Firecrawl's browser-interaction capability to execute the fetch requests. It must apply your saved preferences and exclude your excluded keywords, existing connections and saved prospects. Without Firecrawl, use the paste fallback at the bottom.

## Quick start
1. Sign in and open **ChatGPT** in the menu.
2. Choose **Research now** or **Recurring (scheduled)**.
3. Choose **Quick session** (prompt valid for 10 minutes) or **Permanent token** (generate once, shown once).
4. Click **Copy prompt** and paste it into a new ChatGPT chat.

## Endpoints
Context and Save accept the token as `?access=<token>` in the URL (what the generated prompt uses, so ChatGPT sends no custom headers) or as `Authorization: Bearer <token>`. The credentials endpoint needs the permanent token as a Bearer header.

| Purpose | Request | Token |
|---|---|---|
| Get a 10-minute access token | `POST /api/assistant-credentials` (no body) | permanent token |
| Read profile, preferences, exclusions | `GET /api/assistant-context` | access or permanent |
| Save prospects | `POST /api/assistant-save` | access or permanent |

Save body (1 to 50 leads; personal `linkedin.com/in/` profiles only):

```json
{"leads":[{"name":"Full name","company":"Company name","linkedin":"https://www.linkedin.com/in/profile-slug"}]}
```

Response: `total`, `saved`, `duplicates`, `invalid` and a per-lead `results` array. Prospects are stored with status "To research".

## Security
- Tokens are stored only as SHA-256 hashes. The permanent token is shown once.
- Regenerating or revoking the permanent token revokes every active access token.
- Access tokens expire after 10 minutes and can only read your search context and save prospects.
- Never paste a prompt anywhere public. If a token is exposed, regenerate it on the ChatGPT page.

## Without an HTTP tool
Ask ChatGPT to list prospects as `Name | Company | LinkedIn profile URL`, one per line, then paste them into **Prospects → Paste from ChatGPT**. Duplicates are skipped.
