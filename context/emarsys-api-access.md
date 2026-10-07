# Emarsys API access (Gemma)

How Gemma calls Emarsys and gservice APIs without breaking auth, CORS, or CSP. Written for humans and for agents extending the extension.

## Two JavaScript worlds on every Emarsys tab

Chrome MV3 loads Gemma in two places:

| World | Where | Can read `window.e`? | Typical role |
|-------|--------|----------------------|--------------|
| **Isolated content script** | Extension JS (`emarsys-auth.js`, UI panels, etc.) | No (separate `window`) | UI, `chrome.*` APIs, orchestration |
| **MAIN (page)** | Injected via `manifest.json` `"world": "MAIN"` | Yes | Same realm as Emarsys SPA, `fetch`, shadow DOM, TinyMCE |

**CSP:** Inline `<script>` injection into the page is blocked. Anything that must run as the page (wrap `window.fetch`, read `window.e`, touch datagrid shadow trees) belongs in a **MAIN** entry in `extension/manifest.json`, not in a string executed from an isolated script.

Global MAIN bundle (all `https://*.emarsys.net/*` pages, `document_start`):

- `platform.js` — shared helpers (e.g. route detection)
- `debug-logging-page-bridge.js` — logging gate in page context
- `gservice-page-fetch-bridge.js` — postMessage proxy for gservice `fetch`
- `email-campaign-list-fetch-patch.js` — patches page `fetch` for category filter merge
- `email-campaign-list-category-filter-main.js` — list UI in page DOM
- `gem-campaign-category-catalog.js` — catalog + harvest (also duplicated on some isolated entries where needed)

Other MAIN bridges are loaded per-route or via `web_accessible_resources` + script tag when iframes need them (`content-blocks-fetch-bridge.js`, `gem-snippet-iframe-bridge.js`, `campaign-draft-data.js`, etc.).

## Authentication model

Emarsys does **not** give Gemma a long-lived API key. We use the **user’s existing browser session** on `*.emarsys.net`.

### Step 1: `session_id`

Almost all bootstrap URLs include `session_id=…` in the query string. Gemma reads it from the current tab:

```javascript
new URL(window.location.href).searchParams.get('session_id')
```

If it is missing, token-based gservice calls cannot run (`no_auth_token` / `missing_session`).

### Step 2: Short-lived JWT (gservice token)

**Same-origin** request to Emarsys bootstrap (session cookies sent automatically):

```
GET {origin}/bootstrap.php?r=frontendAuthentication/getToken
    &session_id={session_id}
    &integration={integration_name}
```

Implemented as `window.gemFetchGserviceToken(sessionId, integration)` in `extension/emarsys-auth.js` (`credentials: "include"`).

| `integration` value | Used for |
|---------------------|----------|
| `email-campaign-list` | Email campaign list gservice (duplicate, list API tests) |
| `personalization-editor` | ESL validate API (`extension/esl-validate-api.js`) |
| `content-blocks` / `contentBlocks` | Content blocks handshake (see auth retry list in `emarsys-auth.js`) |

Response shape varies; the helper accepts a raw string JWT or `{ data: { token } }` / `{ token }`.

### Step 3: Call `*.gservice.emarsys.net` with Bearer JWT

```http
Authorization: Bearer {jwt}
Accept: */*
```

JWTs are often bound to **allowed Origins** (the Emarsys suite host, e.g. `https://suite8.emarsys.net`). Requests that look like they come from the **extension origin** or a mismatched context may get **403** even with a valid token.

That is why “we have host_permissions, why CORS?” is the wrong question for gservice: **CORS/extension permissions ≠ JWT origin policy**.

## Avoiding CORS and context problems

### A. Same-origin bootstrap (no CORS issue)

`frontendAuthentication/getToken` is on the same host as the SPA → normal `fetch` from a content script with cookies.

### B. gservice from **page MAIN world** (preferred for new gservice calls)

Pattern:

1. Isolated script gets JWT via `gemFetchGserviceToken`.
2. Isolated script calls `window.gemFetchGserviceFromPage(url, { method, headers })` (`emarsys-auth.js`).
3. That **postMessage**s to `gservice-page-fetch-bridge.js` (MAIN), which runs `fetch(url)` in page context and postMessages the result back.

Message contract:

- Request: `{ source: "gem-gservice-fetch-request", requestId, url, method, headers }`
- Response: `{ source: "gem-gservice-page-fetch", requestId, ok, status, data?, error? }`

The bridge **only allows** `https://*.gservice.emarsys.net` URLs (`gservice-page-fetch-bridge.js`).

This matches DevTools behavior: Origin is the Emarsys site, not `chrome-extension://…`.

### C. gservice from **isolated content script** `fetch`

`emarsys-auth.js` also exposes direct `fetch` helpers (e.g. `gemCallGserviceDuplicate`, `gemFetchEmailCampaignListGserviceWithToken`). Extension **`host_permissions`** for `https://*.gservice.emarsys.net/*` allow the request to be **sent** without browser CORS blocking the extension.

This works for some endpoints (duplicate is implemented this way first). If the service rejects non-Emarsys Origins, prefer pattern **B** or **D**.

### D. gservice from **background** service worker (fallback)

`background.js` → `gemGserviceAuthenticatedFetch` (message action `gemGserviceAuthenticatedFetch`).

Used as **fallback** when content-script `fetch` throws (see `gemFetchEmailCampaignListApi`). Background requests use the **extension origin**; many JWTs return **403**. Do not assume background is equivalent to page fetch.

`duplicateEmarsysCampaign` in background exists for the `duplicateEmarsysCampaign` message path; the primary UX flow uses page/content `gemDuplicateCampaign` → `gemCallGserviceDuplicate`.

### E. Piggyback on Emarsys’s own `fetch` (no separate API call)

For campaign list **category filtering**, `email-campaign-list-fetch-patch.js` (MAIN) wraps `window.fetch`. When Emarsys requests:

`https://email-campaign-list.gservice.emarsys.net/api/client/campaigns?...&filterValues=...`

Gemma merges `filterValues.category` from session state and forwards the same request Emarsys already authorized. **No extra token fetch**, no second client—minimal CORS/auth surface.

Response bodies can be harvested for category names (`gem-campaign-category-catalog.js`).

### F. Intercept handshake / draft traffic (content blocks)

`content-blocks-fetch-bridge.js` (MAIN) wraps `window.fetch` to capture handshake tokens and campaign snapshots into `window.__gemContentBlocksSnapshots` and answer content-script requests via postMessage. Same idea as **E**: stay on the page’s natural request flow.

## Decision guide (for new features)

```
Need data from gservice or bootstrap API?
│
├─ Can Emarsys already fetch it on this page?
│   └─ YES → MAIN world: wrap fetch or read response (E/F). Best for filters, lists, handshakes.
│
├─ Need a one-off GET/POST with JWT?
│   ├─ Try isolated fetch + Bearer (C) if endpoint is known to accept extension context
│   └─ Else → gemFetchGserviceFromPage (B) via gservice-page-fetch-bridge
│
├─ Need token?
│   └─ gemFetchGserviceToken(sessionId, integration) on bootstrap (same origin)
│
└─ Background fetch (D) only as last resort; expect 403 on origin-scoped JWTs
```

Always:

- Allowlist hostnames (`*.gservice.emarsys.net`, specific service subdomains).
- Pass `session_id` from the **active tab URL**, not from storage, unless you intentionally reuse a stored session.
- Use the correct **`integration`** string for that gservice product.

## Reference implementations

| Feature | Auth | Transport | Files |
|---------|------|-----------|--------|
| Duplicate campaign | `getToken` → Bearer | Content `fetch` POST duplicate URL | `emarsys-auth.js`, `email-campaign-list.js` |
| Campaign list API probe | `getToken` → Bearer | Content `fetch`, fallback background | `emarsys-auth.js` (`gemFetchEmailCampaignListApi`) |
| Category filter on list | (Emarsys’s fetch) | MAIN `fetch` patch | `email-campaign-list-fetch-patch.js`, `gem-campaign-category-catalog.js` |
| ESL validate | `getToken` (`personalization-editor`) | Page-context fetch / inline MAIN snippet | `esl-validate-api.js` |
| Review links / draft snapshots | Handshake from page fetch | MAIN fetch wrap + postMessage | `content-blocks-fetch-bridge.js`, `campaign-draft-data.js` |
| Generic gservice from isolated UI | JWT from `gemFetchGserviceToken` | postMessage → MAIN bridge | `emarsys-auth.js`, `gservice-page-fetch-bridge.js` |

## Manifest permissions

```json
"host_permissions": [
  "https://*.emarsys.net/*",
  "https://*.gservice.emarsys.net/*",
  "https://*.cf.emarsys.net/*"
]
```

Required for content-script and background fetches to gservice and suite hosts. Token issuance still depends on **cookies** on `*.emarsys.net` via `credentials: "include"` on bootstrap.

## Debugging

- Console prefixes: `[Gem][Auth]`, `[Gem][CampaignListCategoryFilter][MAIN]`.
- Page console: `gemDebugCampaignListCategoryFilter()` when on email campaign list (MAIN helper).
- If gservice returns **403** with a valid-looking JWT: suspect **Origin** — switch to MAIN bridge (`gemFetchGserviceFromPage`).
- If bootstrap token returns null: check **session_id**, login/session expiry, and **integration** name.
- If isolated code “cannot see” DOM or `window.e`: use MAIN script or postMessage, not more isolated DOM hacks.

## Related docs

- `context/emarsys-body-persistence.md` — MAIN world for TinyMCE / preview (not gservice, but same world split).
- `context/review-links.md` — content blocks snapshot pipeline.
- `api-responses/request-for--campaign-get-response.md` — sample API shapes.

## Agent checklist (adding a new gservice integration)

1. Identify the gservice host and path; confirm Emarsys already calls it on the target page or you need a new client call.
2. Find or discover the correct `integration` for `frontendAuthentication/getToken`.
3. Implement allowlisted URL checks before any fetch bridge executes.
4. Prefer MAIN `fetch` wrap or `gemFetchGserviceFromPage` over background.
5. Register new MAIN scripts in `manifest.json` `world: "MAIN"` — do not rely on inline script injection.
6. Document response JSON shape under `api-responses/` if non-obvious.
