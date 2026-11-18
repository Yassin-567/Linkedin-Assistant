# ChatGPT Simple Bridge (no Firecrawl, no MCP, free ChatGPT)

ChatGPT saves prospects by opening one link with its normal web browsing. Nothing else is needed.

## One-time setup
1. Sign in to Inlinked, open **Search settings**, and generate your **AI Auth Token**. It is shown once; keep it private.
2. Tell ChatGPT (Memory or Custom Instructions): "My Inlinked AI Auth Token is `<token>`. Never print it in reports."

## Save link format

```
https://inlinked.vercel.app/api/save?ai=<TOKEN>&l=Name|Company|LinkedInProfileURL&l=Name2|Company2|LinkedInProfileURL2
```

- Open it with a normal browse/open-URL action (HTTP GET). No POST, no headers, no encoding.
- Repeat `l=` once per prospect, up to 50 per link.
- Each lead is `Full name|Company|https://www.linkedin.com/in/profile-slug` (personal profile only; company pages and search URLs are rejected).
- URL-encode spaces as `%20` if your browser tool requires it.
- The reply is plain text, for example `Saved 3, duplicates 1, invalid 0, total 4.` followed by one line per lead. Add `&format=json` for JSON.
- Report only what the reply confirms. If the page cannot be opened, say so; never claim prospects were saved.

## If ChatGPT cannot open the link
Ask it to list prospects one per line as `Name | Company | LinkedIn profile URL`, then paste them into **Prospects → Paste from ChatGPT** in Inlinked.

## Security
- The token only allows saving prospects. Revoke or regenerate it in Settings if exposed.
- A token in a URL can appear in browser history or logs, so do not share the link.
