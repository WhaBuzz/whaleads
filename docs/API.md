# API reference

Routes, auth and payloads. Staff routes take a session cookie (browser) or, if you set the optional `ADMIN_KEY` secret, `Authorization: Bearer <ADMIN_KEY>` (scripts).

## Endpoints
| Route | Auth | Purpose |
|---|---|---|
| `GET /api/health` | none | `{ok, instance, schema_version, adaptor}` (`adaptor` = active kind or null). If the stored config cannot be decrypted: `ok:false, adaptor_error:"config_undecryptable"` (HTTP 200) |
| `GET/POST /webhooks/meta` | verify token / `X-Hub-Signature-256` | Cloud API: Meta verification + inbound messages and statuses |
| `POST /webhooks/whabuzz` | `X-WhaBuzz-Signature` (`t=…,v1=…`, 300 s tolerance) | WhaBuzz envelopes (`message.inbound`, `message.status`, `lead.*`) |
| `POST /api/leads` | origin allow-list, honeypot `hp`, 10/min/IP | website form intake |
| `GET /api/setup/status` | none | `{needs_setup, default_country}` (`default_country` from `DEFAULT_COUNTRY`, else `null`) |
| `POST /api/setup` | setup key (= `SESSION_SECRET`), 5/15 min/IP | first boot: creates the admin, settings and VAPID keys, signs in. 409 once any staff exists |
| `POST /api/auth/login` | none, 10 attempts/15 min/IP; per email, 5 failures/15 min allowed then 429 (a success clears it) | sets the session cookie, returns `me` + `csrf` |
| `POST /api/auth/recover` | setup key (= `SESSION_SECRET`), same-origin; 5 attempts/15 min/IP and 20/hour across all IPs | `{setup_key, email, new_password}`: sets a new password for an active account, ends all its sessions, signs in (same body and cookie as login). Wrong key or unknown/inactive email: the same 403 `invalid_recovery`. `must_change_pw` is cleared |
| `POST /api/auth/logout`, `GET /api/auth/me`, `POST /api/auth/password` | session | logout; current staff + settings; change password (revokes other sessions) |
| `GET /api/leads?limit=`, `POST /api/send` | session (any staff) or `Bearer <ADMIN_KEY>` | staff API |
| `GET /api/inbox?filter=all\|unread\|mine\|open\|closed&q=&before=&limit=` | session or `Bearer <ADMIN_KEY>` | conversations, unread first then newest; keyset cursor `next_before`; each row has `window_open`, `window_closes_at`; `unread_total`; `connected_number` when the inbox is empty |
| `GET /api/inbox/unread` | session or Bearer | `{unread}` conversations with unread messages (nav badge) |
| `POST /api/inbox/:id/send` | session + CSRF | `{text}` (1 to 4096 chars) to contact `:id`. `409 window_closed` outside the 24h window (free text is not allowed then; use `/api/inbox/:id/send-template`). Upstream Meta errors come back as `502` with `source` and `graph`, verbatim, and nothing is stored |
| `POST /api/inbox/:id/send-media` | session + CSRF | multipart: `file`, optional `caption` (max 1024, ignored for audio). Types: JPEG/PNG (5 MB), MP4/3GPP video, AAC/MP4/MP3/AMR/OGG audio, PDF/Word/Excel/PowerPoint/text (16 MB each). Magic bytes are checked for JPEG, PNG and PDF. `415` bad type, `413` too large, `409 window_closed`. Uploads to the provider, then sends; the file is kept in R2 |
| `GET /api/media/:messageId` | session or Bearer | the stored file. Always `X-Content-Type-Options: nosniff` and `Content-Security-Policy: sandbox`, `Cache-Control: private`. Inline only for JPEG/PNG/WebP/GIF, MP4/3GPP and common audio; everything else is `application/octet-stream` with `Content-Disposition: attachment`. Supports `Range`. `410` when the file was too large or could not be copied |
| `GET\|POST /api/quick-replies`, `PATCH\|DELETE /api/quick-replies/:id` | session (+ CSRF on writes) | `{shortcut, body}`; shortcut is 1 to 32 letters, digits, `-` or `_`, unique ignoring case. `{name}` in a body is replaced with the contact's first name in the composer |
| `GET /api/contacts/:id/messages?before=&limit=` | session or Bearer | thread, oldest first, message-id cursor, `media` row per message, `conversation`, `window_open`, `window_closes_at` |
| `POST /api/conversations/:id/read` | session + CSRF, or Bearer | resets `unread_count`; marks the last inbound message read upstream, best effort (a failure is logged as `mark_read_failed`, never surfaced) |
| `PATCH /api/conversations/:id` | session + CSRF, or Bearer | `{status?: 'open'\|'closed', assigned_to?: staffId\|null}`; assignee must be active staff; recorded in `activity` |
| `POST /api/admin/setup` | session (admin) or `Bearer <ADMIN_KEY>` | Cloud API webhook setup (needs the `cloud_api` adaptor) |
| `GET /api/admin/adaptor` | session (admin) or `Bearer <ADMIN_KEY>` | `{kind, source: 'd1'\|'env', onboarding, config (secrets masked), status}`; `status` is a live call |
| `PUT /api/admin/adaptor` | session (admin) or `Bearer <ADMIN_KEY>` | `{kind, config}`; calls `status()` first, saves (AES-GCM, in D1) only if the upstream accepts the credentials, else 422 |
| `GET /api/flows?status=`, `GET /api/flows/:id` | session (any staff) or Bearer | list with 7-day run counts by outcome (no graphs); one flow with its draft `graph` and `published_graph` |
| `POST /api/flows`, `PUT /api/flows/:id` | session (admin) + CSRF, or Bearer | `{name, description?, graph?, shadow?, reentry?, priority?}`. Edits the DRAFT only; a live flow keeps running `published_graph`. 400 field errors, 409 `name_taken` / `flow_archived`, 422 `{errors:[{node,msg}]}` for an unstorable graph; incompleteness comes back as `warnings` |
| `POST /api/flows/:id/publish` | admin + CSRF | full check (warnings become errors, template approved and param counts, AI key set, http URL guard, regex guard), then copies the draft to `published_graph`, bumps `version`, sets `active` and derives `trigger_kind` and `reentry` from the trigger node |
| `POST /api/flows/:id/pause`, `/archive`, `/duplicate`; `DELETE /api/flows/:id` | admin + CSRF | pause stops new runs (parked runs hold); archive cancels awaiting runs; duplicate makes an unpublished shadow copy; delete is drafts only (409 `not_draft`) |
| `POST /api/flows/:id/dry-run` | session (any staff) + CSRF, 10/min/staff | `{lead_id, event?:{text}, reply?}` runs the DRAFT with no writes and no external calls; returns `{status, trace, context}`, 25 s cap |
| `GET /api/flows/:id/runs?status=&before=&limit=`, `GET /api/leads/:id/flow-runs`, `GET /api/flow-runs/:id` | session or Bearer | newest first, `next_before` cursor; the detail adds `trace` and `context` |
| `POST /api/flow-runs/:id/cancel` | admin + CSRF | compare-and-swap on the run; 409 `not_cancellable` once finished |

Both webhook routes feed one inbound pipeline and are idempotent (unique `wamid` on messages, unique `(wamid, status)` on statuses). During a cutover Meta may deliver the same message to the old Meta app and to WhaBuzz; it is stored once.

## Form payload
`{name, phone, email?, message?, source: 'contact_form'|'pilot_form', page?, utm_source?, utm_medium?, utm_campaign?, gclid?, hp?}`. Indian numbers are normalised to E.164 digits (`919999000012`).
