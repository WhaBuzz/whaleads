# Decisions

The product decisions behind WhaLeads and what is in and out of scope. A change here is a decision, not drift.

## What it is
An open-source, self-hosted lead CRM for one WhatsApp number. Three features: **CRM** (leads pipeline, contacts), **Inbox** (WhatsApp conversations), **Automation Builder** (graph flows). Runs as one Cloudflare Worker + D1 (+ R2 for media) on the Workers Free plan. One deployment = one business = one number.

Multi-number, multi-client, broadcasts and managed hosting are out of scope.

## Decisions

| # | Decision |
|---|---|
| D2 | **One WhatsApp number per deployment.** Number identity is config, never a table or a routing key |
| D3 | Repo under the **WhaBuzz GitHub org**, licence **Apache-2.0** |
| D4 | Meta behind an **adaptor interface**; prebuilt **WhaBuzz** and **Cloud API** adaptors ship in-repo; one adaptor active per deployment |
| D5 | **Connecting to WhaBuzz is guided**: sign in on WhaBuzz, pick or create the number, and the instance receives its keys and webhook. The Cloud API adaptor uses a manual form instead. |
| D6 | **Lead Ads via the WhaBuzz adaptor only.** The Cloud API adaptor is WhatsApp only. |
| D7 | **Broadcasts out.** No bulk template sends, no segments. One-to-one tool |
| D8 | **R2 bucket** provisioned on deploy; inbound media copied durably |
| D10 | Auth: password login; Worker-signed HttpOnly session; never a third-party identity provider. |
| D11 | Free plan: no Queues. **Amended 2026-10-19: ONE SQLite-backed Durable Object per instance is allowed** (SQLite DOs are on the Workers Free plan; WebSocket Hibernation keeps idle cost ~0). Cron for delays/resumes |
| D13 | AI node kept behind an optional bring-your-own Anthropic key; voice node dropped |
| D14 | No email anywhere in v1. No telemetry, no phone-home |
| D15 | **Name: WhaLeads.** No standalone domain; the README is the website. |
| D16 | **Media templates are essential**: image / video / document header templates in v1, create + send; media send inside the 24h window pulled into v1 on the same upload path |
| D17 | **No WhatsApp alerts to staff.** Web push through the installed web app is the only notification channel. |
| D18 | **This repository contains nothing of any particular business**: no instance configs, ids, hosts, account ids or names. Your instance configuration belongs in your own repository. |
| D19 | **Send latency is visible.** The Worker returns `Server-Timing` (`worker`, `upstream`) on send and webhook responses so time spent in the Worker, the adaptor and Meta can be told apart; the UI sends optimistically. |
| D20 | **Live channel = WebSocket from the Worker to the browser via one Durable Object per instance**. Webhook/send handlers post each event to the DO; it broadcasts to connected staff browsers (inbound, outbound, status ticks, assignment/read changes). Browser falls back to the 4 s polling when the socket is unavailable. Meta→WhaBuzz and WhaBuzz→Worker stay HTTP (WhaBuzz's own WebSocket push stream may replace the latter later) |
| D21 | **The public repo references nothing except WhaBuzz**. No other product, company, client or person name anywhere in the published tree: README, docs, code comments, tests, fixtures, licence (copyright holder "WhaBuzz"). The scrub step hard-fails on any such name. Positioning line: one number, one team, self-hosted = WhaLeads; many numbers or clients = WhaBuzz directly |

## Functional scope (v1)
### 3.1 CRM
- Leads: configurable stages (Settings, stored in D1), sources, tags, owner (staff), notes, activity timeline, won/lost with reason.
- Contacts: one per phone (E.164), merged across form + WhatsApp.
- Intake: `POST /api/leads` from website forms (origin allow-list, honeypot, rate limit; source / page / utm_* / gclid); Meta Lead Ads via WhaBuzz adaptor (D6); manual add.
- Click-to-WhatsApp attribution: Meta `referral` object + prefilled-text reference codes → the ad's id, headline and link are saved on the lead.
- Click logging for call / WhatsApp taps.
- Reports: leads by source / stage / week; first-response time. Nothing more.

### 3.2 Inbox
- Conversations for the one number: text, images, documents, audio inbound; text, images, documents and approved templates (incl. media-header templates) outbound.
- 24h window surfaced; outside it only templates (Meta error passed through verbatim).
- Quick replies. Assign conversation to staff. Mark read. Search by name/phone.
- Media copied to R2 on receipt (D8); served through the Worker behind auth.
- Delivery ticks from status webhooks.

### 3.3 Automation builder
- Triggers: lead created (filter by source/stage), message received (any / keyword), stage changed.
- Nodes: condition, action (stage/tag/assign/note), message (text), template, delay, wait for reply, HTTP request, variable, lead write-back, AI (optional key).
- Runs log with shadow mode (flow executes, nothing sent). Resume via cron. Flow snapshot per run.
- Out of scope: voice, segments, broadcasts, org-level anything.

### 3.4 Templates
- List, create text templates AND media-header templates (image / video / document; file uploaded through the adaptor's media-handle path, D16), variables with samples, sync approval status via the adaptor. Rejection reason shown verbatim.
- Sending a media template = header media + body params, from the Inbox and from the flow template node.

### 3.5 Staff & auth
- Roles: admin, staff. Admin adds/revokes staff and resets passwords in Settings. Everyone sees everything; assignment drives ownership.
- `/setup` first-boot page creates the first admin and VAPID keys, then locks itself. No secrets-seeded admin.
- Session cookie HMAC-signed with a Worker secret, 30 days; login rate limit in D1; CSRF token on state-changing routes.

### 3.6 Notifications
- New lead and new message: web push to the installed web app (VAPID). This is the only notification channel (D17); there are no WhatsApp alerts to staff.

### 3.7 Settings (all in D1, editable in UI)
Business name, default country code, timezone, working hours, stages, sources, tags, allowed form origins, active adaptor + its credentials (encrypted with the session secret), optional Anthropic key.

## Non-goals (v1)
Broadcasts and segments, multi-number, multi-tenant, telephony, email, calendar and booking, payments, invoices, Messenger and Instagram DMs, and any industry-specific flow.

## Adaptor interface (contract)
```
interface MetaAdaptor {
  kind: 'whabuzz' | 'cloud_api'
  status(): Promise<NumberStatus>                       // connected, quality, tier, display number
  sendText(to, text, ctx?): Promise<SendResult>
  sendTemplate(to, name, lang, params): Promise<SendResult>
  markRead(messageId): Promise<void>
  fetchMedia(mediaId): Promise<{ bytes: ReadableStream, mime: string }>
  uploadMedia(bytes, mime): Promise<{ media_id }>        // for free-form media sends
  templates: { list(), create(def), syncStatus(), mediaHandle(bytes, mime) }  // handle for media-header templates
  verifyWebhook(req): Promise<boolean>                  // X-WhaBuzz-Signature or X-Hub-Signature-256
  parseWebhook(body): InboundEvent[]                    // normalised: message | status | lead (lead only on whabuzz)
  onboarding: 'connect_button' | 'manual_form'          // drives the Settings UI
}
```
Meta error objects pass through verbatim with `source: 'meta'`; no business logic in the adaptor.

## Connecting to WhaBuzz
1. Settings → **Connect to WhaBuzz** → redirect to `app.whabuzz.com/connect?app=whaleads&callback=<instance>/api/whabuzz/callback&state=…`.
2. Sign in / sign up (Google) → tenant created or picked → Meta Embedded Signup popup verifies the number.
3. WhaBuzz creates a scoped API key + a webhook endpoint pointed at the instance (with secret) → redirects back with a one-time code.
4. Instance exchanges the code for `{api_key, webhook_secret, phone_number_id, waba_id}` → stored encrypted in D1 → inbox live.
No CLI and no pasted secrets on this path.
