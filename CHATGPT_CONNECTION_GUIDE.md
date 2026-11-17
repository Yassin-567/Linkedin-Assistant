# ChatGPT Prospect Saving

## One-time setup for each account

1. Sign in to your own LinkedIn Assistant account.
2. Open **Search settings**.
3. Under **ChatGPT Connection**, select **Generate ChatGPT connection**.
4. Copy both endpoints shown: **Search context endpoint** and **Prospect save endpoint**. Add them to your ChatGPT instructions or the chat where you do prospect research.
5. Keep the endpoint private. It grants permission to add prospects to that account. You can revoke it at any time from Settings.

Each user must generate their own endpoint. Do not share Vercel access, Vercel bypass secrets, or another user's endpoint.

## Before every prospect search

1. Make a GET request to the **Search context endpoint**.
2. Read the returned `owner` and `searchPreferences` fields.
3. Use the owner's LinkedIn URL and profile summary as context about the account owner, not as facts about the prospect being researched.
4. Apply the saved countries, industries, keywords, job titles, exclusions and preferred language as default search preferences. The user's latest explicit instruction in the current chat overrides a saved preference when they conflict.
5. Combine this context with your own research and reasoning. Verify prospect details independently; never assume the owner's profile describes the prospect.

The context endpoint is read-only and always returns the latest saved preferences. It also returns:
- `exclusions.uploadedConnectionProfileUrls`: profile URLs from the latest uploaded LinkedIn Connections.csv snapshot.
- `exclusions.savedProspectProfileUrls`: profile URLs already saved in the user's prospect pipeline.
- The imported connection count and last import timestamp.

ChatGPT must exclude these URLs before presenting or saving prospects. The endpoint is private to the account that generated the token and returns no-cache headers.

## Saving prospects

Send an HTTP POST request to the exact endpoint copied from Settings, with a JSON body:

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

Send between 1 and 50 leads per request. Each lead needs a name, company, and personal LinkedIn profile URL. Company pages and search URLs are not accepted.

The response reports saved, duplicate, and invalid counts for each lead. Duplicate LinkedIn profiles are not inserted twice into the same user's account.

## Security and troubleshooting

- Both endpoints contain the same private, random token. Treat them like passwords.
- A newly generated endpoint automatically revokes the previous endpoint.
- Use **Revoke connection** in Settings to disable access immediately.
- A 401 response means the endpoint token is invalid or revoked, or the request was blocked before reaching the application. Use the public production domain endpoint copied from Settings; do not add Vercel deployment-protection bypass credentials.
- Each endpoint is linked to the account that generated it. One user's prospects cannot be saved into another user's account through that endpoint.


## Copy-ready prompt

The Search settings page includes **Copy complete ChatGPT prompt**. It inserts both generated endpoints into a complete instruction set for a new ChatGPT chat, sets a default target of 50 qualified prospects, and instructs ChatGPT to exclude uploaded connections and prospects already saved in the pipeline. The target is an upper goal, not permission to invent or pad weak leads.
