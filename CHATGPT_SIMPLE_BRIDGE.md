# ChatGPT bridge: two methods, GET requests only (no Firecrawl, no MCP)

Endpoints (base `https://inlinked.vercel.app`):

| Purpose | URL | Auth |
|---|---|---|
| Credentials | `/api/assistant-credentials?ai=<PERMANENT_TOKEN>` | permanent AI Auth Token |
| Context | `/api/assistant-context?access=<ACCESS_TOKEN>` | 10-minute access token |
| Save | `/api/save?access=<ACCESS_TOKEN>&l=Name\|Company\|LinkedInURL` (repeat `l=`, max 50) | 10-minute access token |

## Method 1: give ChatGPT an access token
Send ChatGPT the 10-minute access token with the Context and Save links already filled in. It opens Context, researches based on it, then saves with the Save link.

## Method 2: give ChatGPT the permanent token
Send the permanent AI Auth Token and the three endpoints. ChatGPT opens the Credentials URL (GET with `?ai=`, or POST with `Authorization: Bearer`), reads the returned `accessToken`, `contextEndpoint` and `saveEndpoint`, and continues as in Method 1.

## Save format
`l=Full name|Company|https://www.linkedin.com/in/profile-slug` (personal profiles only). Reply is plain text such as `Saved 3, duplicates 1, invalid 0, total 4.` plus one line per lead; add `&format=json` for JSON. Only report what the reply confirms.

## Fallback
If ChatGPT cannot open the links, have it list `Name | Company | LinkedIn URL` per line and paste them into **Prospects → Paste from ChatGPT**.

## Security
The permanent token only issues access tokens; access tokens expire in 10 minutes and can only read context and save prospects. Regenerate or revoke the permanent token in Settings if it is exposed. Never print tokens in research output.
