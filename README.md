# LinkedIn Assistant

A small Next.js application that connects one LinkedIn member account using LinkedIn OAuth and supports publishing reviewed text posts to that member's personal profile.

## Current scope

- LinkedIn OAuth 2.0 authorization-code flow.
- OpenID Connect profile lookup.
- Encrypted, HTTP-only session cookie.
- Publish a text-only member post through LinkedIn's Posts API.
- Disconnect the local session.

## Not included

The currently enabled self-serve LinkedIn permissions do not provide private inbox access, prospect search, automated connection requests, or general profile scraping. Do not treat this app as an inbox automation tool. These capabilities require separate approved access or another compliant data source.

## Required environment variables

Copy `.env.example` into your deployment environment and set:

- `LINKEDIN_CLIENT_ID`: LinkedIn app client ID.
- `LINKEDIN_CLIENT_SECRET`: LinkedIn app client secret. Keep it server-side only.
- `LINKEDIN_REDIRECT_URI`: Exact HTTPS callback URL registered in the LinkedIn developer app.
- `APP_URL`: Public base URL of this deployment.
- `SESSION_SECRET`: A random secret of at least 32 characters used to encrypt the session cookie.
- `LINKEDIN_VERSION`: LinkedIn REST API version in YYYYMM format.

Enable **Sign In with LinkedIn using OpenID Connect** and **Share on LinkedIn** in the LinkedIn developer portal. The OAuth scopes requested by this app are `openid profile email w_member_social`.

## Local development

```bash
npm install
npm run dev
```

Register `http://localhost:3000/api/linkedin/callback` as a redirect URI for local testing, and set matching local environment variables.

## Security notes

- OAuth state is checked on callback.
- Access tokens are encrypted before being stored in an HTTP-only, SameSite=Lax cookie.
- Never commit `.env` or expose the LinkedIn client secret.
- The first release is a supervised prototype. Test with a non-sensitive post before relying on it.
