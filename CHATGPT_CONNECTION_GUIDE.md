# ChatGPT AI Auth Token Connection

## One-time setup for each Inlinked account

1. Sign in to your own Inlinked account.
2. Open **Search settings**.
3. Under **ChatGPT AI Authentication**, choose **Generate AI Auth Token**.
4. Copy the AI Auth Token and save it in your ChatGPT Memory/instructions yourself. The token is shown only once.
5. Keep the token private. Anyone with it can request temporary access to this Inlinked account. Revoke it immediately if exposed.

Each Inlinked user must generate their own token. Never share another user's token, Vercel access, login password, or deployment-protection bypass credentials.

## Authentication architecture

There are two token types:

- **Permanent AI Auth Token:** account-specific credential used only to request a temporary access token. It is never accepted by the Context or Save endpoints.
- **Temporary Access Token:** one random token valid for exactly 10 minutes. The same token is accepted by both the Context and Save endpoints.

The assistant requests a fresh temporary token by sending HTTP POST to the **Credential issuance endpoint** copied from Settings. Send the permanent AI Auth Token only in the `Authorization: Bearer <token>` header. Never put it in the URL, query string, request body, logs, or output. The response returns one temporary token plus Context and Save endpoint URLs that both carry that same temporary token.

## Mandatory Firecrawl requirement

Firecrawl is mandatory for every HTTP request in the ChatGPT prospecting workflow. Use Firecrawl's browser-interaction capability to execute fetch requests with the required HTTP method, headers, and body. A scrape-only page GET is not a substitute for HTTP POST. If Firecrawl is not installed and connected, stop and tell the user:

**"Connect Firecrawl, it is mandatory."**

Do not substitute another HTTP client or unrelated connector.

## Before every prospect search

1. Use Firecrawl to POST to the credential issuance endpoint and read the returned temporary access token, Context endpoint, Save endpoint, and expiry.
2. Use the Context endpoint with HTTP GET before every search and whenever preferences may have changed.
3. Read owner, searchPreferences, and exclusions.
4. Use the owner's profile only as context about the account owner, not as facts about prospects.
5. Apply saved countries, industries, keywords, job titles, excluded keywords and preferred language by default. The user's latest explicit instruction overrides a saved preference when they conflict.
6. Exclude every URL in exclusions.uploadedConnectionProfileUrls and exclusions.savedProspectProfileUrls.
7. Normalize LinkedIn profile URLs by ignoring case and trailing slashes. Deduplicate within each batch.
8. Research and verify prospects independently using current public sources.

The Context endpoint is read-only. It returns the latest preferences and uploaded connection counts/timestamps, uploaded connection profile URLs, and already-saved prospect profile URLs.

## Saving prospects

Use the Save endpoint returned in the same credential response. It carries the **same temporary access token** as the Context endpoint. Send HTTP POST with Content-Type application/json and this body:

```json
{
  "leads": [
    {
      "name": "Full name",
      "company": "Company name",
      "linkedin": "https://www.linkedin.com/in/profile-slug/"
    }
  ]
}
```

Send between 1 and 50 verified leads per request. Each lead needs a name, company, and personal LinkedIn profile URL. Company pages and search URLs are not accepted.

Read the actual response and report saved, duplicate, invalid and failed counts. Never claim a prospect was saved unless the API confirms it.

## Security and revocation

- The app stores only SHA-256 hashes of tokens, not their plaintext values.
- The AI Auth Token is shown only once. If lost, regenerate it in Settings.
- Regenerating the AI Auth Token revokes the previous permanent token and all previously issued temporary access tokens.
- **Revoke token** disables the permanent AI Auth Token and all active temporary access tokens.
- Temporary Access Tokens expire after 10 minutes. Request a new one using the permanent AI Auth Token.
- The permanent AI Auth Token is accepted only by the credential issuance endpoint, never directly by Context or Save endpoints.
- Never print tokens or endpoints in research reports, send them to search engines, or publish them.
