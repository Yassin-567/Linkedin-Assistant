# ChatGPT Prospect Saving

## One-time setup for each account

1. Sign in to your own LinkedIn Assistant account.
2. Open **Search settings**.
3. Under **ChatGPT Connection**, select **Generate ChatGPT connection**.
4. Copy the private endpoint and paste it into your ChatGPT instructions or the chat where you do prospect research.
5. Keep the endpoint private. It grants permission to add prospects to that account. You can revoke it at any time from Settings.

Each user must generate their own endpoint. Do not share Vercel access, Vercel bypass secrets, or another user's endpoint.

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

- The endpoint contains a private, random token. Treat it like a password.
- A newly generated endpoint automatically revokes the previous endpoint.
- Use **Revoke connection** in Settings to disable access immediately.
- A 401 response means the endpoint token is invalid or revoked, or the request was blocked before reaching the application. Use the public production domain endpoint copied from Settings; do not add Vercel deployment-protection bypass credentials.
- Each endpoint is linked to the account that generated it. One user's prospects cannot be saved into another user's account through that endpoint.
