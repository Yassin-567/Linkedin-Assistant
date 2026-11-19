# Isolated HTTP Executor

This is an optional, standalone HTTP utility. It does not modify Inlinked's prospect research, Firecrawl, database, or saving logic. It reuses the existing per-user Inlinked assistant token only to authorize requests.

## Access

No new API key, database table, ChatGPT API, or environment variable is required. Send the same Inlinked assistant token already used by your ChatGPT prompt:

```http
Authorization: Bearer YOUR_INLINKED_ASSISTANT_TOKEN
Content-Type: application/json
```

The token remains user-scoped and revocable under Inlinked's existing authentication rules.

## Endpoint

`POST /api/http-executor`

Example GET request:

```json
{
  "url": "https://example.com/api/resource",
  "method": "GET",
  "headers": {
    "Accept": "application/json"
  }
}
```

Example JSON POST:

```json
{
  "url": "https://example.com/api/resource",
  "method": "POST",
  "headers": {
    "Accept": "application/json",
    "Authorization": "Bearer UPSTREAM_TOKEN"
  },
  "body": {
    "example": true
  }
}
```

## Reusing an HTTP session

This utility uses ordinary HTTP requests, not a full browser. To maintain a cookie-based session:

1. Make the first request.
2. Read the returned `setCookies` array.
3. Keep the cookie name/value pairs.
4. Send them on the next request in a `Cookie` header.
5. Continue using the same cookie jar for requests that belong to that session.

The executor returns the upstream HTTP status, selected response headers, response body, and any `Set-Cookie` values. Redirects are returned as 3xx responses with a `location` header; the caller decides whether and how to follow them.

## Limits

- HTTPS destinations only; local hostnames and IP-literal destinations are blocked.
- GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS are supported.
- Request and response bodies are limited to 1 MB.
- Each upstream request has a 20-second timeout.
- No JavaScript rendering, CAPTCHA solving, browser automation, or proxy rotation.
