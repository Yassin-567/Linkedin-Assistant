# Isolated HTTP Executor

This is an optional, standalone HTTP utility. It does not modify or call Inlinked's prospect research, Firecrawl, authentication, database, or saving logic.

## Enable it

Set a strong random secret in Vercel:

- `HTTP_EXECUTOR_API_KEY`

Redeploy after adding the environment variable. Keep the key private.

## Endpoint

`POST /api/http-executor`

Send the executor key in the authorization header:

```http
Authorization: Bearer YOUR_HTTP_EXECUTOR_API_KEY
Content-Type: application/json
```

Example request:

```json
{
  "url": "https://example.com/api/resource",
  "method": "GET",
  "headers": {
    "Accept": "application/json"
  }
}
```

For a JSON POST:

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

## Limits and safety

- HTTPS destinations only; local hostnames and IP-literal destinations are blocked.
- GET, HEAD, POST, PUT, PATCH, DELETE and OPTIONS are supported.
- Request and response bodies are limited to 1 MB.
- Each upstream request has a 20-second timeout.
- No JavaScript rendering, CAPTCHA solving, browser automation, or proxy rotation.
- The API key protects access to this executor; upstream credentials should be sent only to the intended upstream host.
