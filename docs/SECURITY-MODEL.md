# Security model

## Reporting a vulnerability

Email **security@whabuzz.com**. Please don't open a public issue. Include the version (the commit or tag) and the steps to reproduce.

## Supported versions

Only the latest release on `main` gets security fixes. Each deployment is its own Worker, so an operator stays supported by redeploying from the latest `main`.

## What a deployment is

- **Single tenant.** One Worker serves one business. It has its own D1 database, R2 bucket (`MEDIA`), Durable Object (`LiveHub`) and secrets. No data is shared between deployments.
- **Who has access:** the operator (who deploys the Worker and holds its secrets), staff (admins and members), and the outside world (WhatsApp senders, website form visitors, the WhatsApp gateway).

## Trust boundaries

| Boundary | Who crosses it | Wall |
|---|---|---|
| Internet → `/webhooks/meta`, `/webhooks/whabuzz` | Meta, WhaBuzz | HMAC over the raw body, constant-time compare, 300 s timestamp tolerance (WhaBuzz), 401 on failure. Idempotent by wamid. |
| Internet → `POST /api/leads` | Website forms | Origin must be in `allowed_origins`; 10/min per IP. |
| Internet → `/api/setup` | The operator, once | Setup key = `SESSION_SECRET`, compared in constant time; 5 per 15 min per IP; locks once any staff row exists. |
| Browser → `/api/*` | Staff | Session cookie (HttpOnly, Secure, SameSite=Lax) + `X-CSRF-Token` + same `Origin` on writes; role checks in `require()`; per-route limits. See [ROUTES.md](ROUTES.md). |
| Script → `/api/*` | Operator tooling | `ADMIN_KEY` bearer (see below). |
| Worker → outside | Meta Graph, WhaBuzz, push services, flow HTTP nodes, Anthropic | Flow HTTP nodes go through `safeFetch`, which blocks private, loopback and link-local addresses and checks every redirect. Meta media downloads only go to Meta CDN hosts. Push endpoints must be https. |
| Worker → browser | Media, SPA | Media: served by DB id only, `CSP: sandbox`, nosniff, only allowlisted image/audio/video inline. SPA: strict CSP (`script-src 'self'`), no framing. |

## ADMIN_KEY

A bearer token with full admin power. It can:

- read and change every setting and the WhatsApp adaptor config (secrets come back masked);
- add staff and reset their passwords;
- export all data;
- publish flows;
- send messages.

It has no CSRF check, because it is never sent by a browser: it is only read from the `Authorization` header, never from a cookie.

- Keep it in a secret manager.
- Rotate it with `wrangler secret put ADMIN_KEY`; the old key stops working at once.
- Leave it unset if no tooling needs it. Without it the bearer path is closed.

## Secrets at rest

All secrets live in D1, encrypted with AES-GCM. Each purpose has its own key, derived with HKDF from `SESSION_SECRET`:

| Purpose | HKDF info |
|---|---|
| Session cookie MAC | `whaleads/session/v1` |
| CSRF tokens | `whaleads/csrf/v1` |
| Setup key check | `whaleads/setup/v1` |
| Adaptor config (WhatsApp credentials) | `whaleads/adaptor-config/v1` |
| Anthropic key | `whaleads/anthropic/v1` |
| VAPID private key | `whaleads/vapid/v1` |

Session tokens are stored only as hashes. Passwords use PBKDF2.

Secrets are never:

- returned by a GET (masked to the last four characters);
- written to logs or events;
- built into `dist/`;
- included in the JSON export.

## Rotating SESSION_SECRET

Rotating it (`wrangler secret put SESSION_SECRET`) invalidates everything derived from it:

1. Every session ends, so all staff sign in again.
2. The WhatsApp adaptor config can't be decrypted. `/api/health` reports `config_undecryptable`. Re-enter it in Settings → WhatsApp (or re-run Connect).
3. The Anthropic key can't be decrypted. Re-enter it in Settings.
4. The VAPID private key can't be decrypted, so staff push notifications stop. The pair is only created at first-boot setup, and there is no in-app way to make a new one yet. Until that ships, a rotation costs push.

Rotate when you suspect a leak, not on a schedule.

## Limits and known trade-offs

- Rate limits use D1 fixed windows. They stop casual abuse, not a distributed attacker. Put Cloudflare WAF rate-limiting rules in front for that.
- One staff member can open up to 100 live sockets, which would push other staff's sockets out (they fall back to polling). This is an insider-only nuisance.
- Inbound media is stored in R2 under predictable keys. The bucket must stay private (no `r2.dev` or custom domain); media is only served through `/api/media/:id`.
- HSTS: set it on the zone (SSL/TLS → Edge Certificates → HSTS). The Worker doesn't send it, because the `workers.dev` host can't use it.
