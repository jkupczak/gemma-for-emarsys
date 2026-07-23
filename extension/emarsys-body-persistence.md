# Emarsys body persistence (language switch)

How Emarsys stores email body text, why Gemma edits used to vanish on language switch, and what finally fixed it.

## The problem

Find & Replace, Magic Fill, and Keyword Swap could change body text in the live preview. Switching language A → B → A put the **old** text back.

## How Emarsys thinks about body content

Emarsys keeps **more than one copy** of the email body:

| Layer | What it is | Durable across language switch? |
|-------|------------|----------------------------------|
| Preview iframe DOM | What you see/edit (`[e-editable]`, TinyMCE chrome) | No — rebuilt on language change |
| `vce-iframes-container[content]` | HTML snapshot for the **currently shown** language | No — rewritten from the model on switch |
| `campaign.contents[lang].blocks[]._id` → `.content[e-editable].value` | Per-language field map (draft/handshake JSON shape) | **Yes** — this is the backpack |

Language switch roughly:

1. Leave language A (Emarsys keeps A from its **model**, not necessarily from the live iframe).
2. Load language B into the preview (writes `vce-iframes-container[content]`, iframe rebuilds).
3. Return to A — same: preview is rebuilt from the **model** for A.

If Gemma only changed the iframe (or only wrote the `content` attribute without updating the live model), A comes back stale.

### Lazy TinyMCE

Emarsys initializes TinyMCE **per editable on interaction**:

- Cold: `[e-editable="h1"]` only — no `contenteditable`, no `mce-content-body`
- After hover/focus: `contenteditable="true"`, `mce-content-body`, `id="mce_N"`

Priming dormant editables (hover/focus) is required before editor-level APIs matter. TinyMCE’s global (`window.tinymce`) lives in the **page MAIN world** (often parent page), not in the isolated content-script world.

## What we tried (and why it failed)

| Approach | Result |
|----------|--------|
| Mutate iframe DOM + fake `input`/`change` | Preview looks right; A→B→A reverts |
| Surgical write of touched fields into `vce-iframes-container[content]` | Attribute updates; model unchanged; still reverts |
| Full live iframe HTML dumped into `content` | Sometimes *appeared* to stick; polluted snapshot (`mce-*`, chrome) and broke toolbars |
| TinyMCE `setDirty` / `fire('change')` / `setContent` via MAIN-world bridge | Reachable (`mce_0`); still not enough for language model |
| Synthetic `vce-plugin-editable-text` events | Plugins not present in light/shadow DOM (`plugins=0`) |
| Patch `window.__gemContentBlocksSnapshots[…]` | Gemma’s fetch **clone**, not Emarsys’s live object — `changed=1/1` on snapshot only |

## What worked

**Per-language field overrides + intercept preview `content` rebuilds.**

1. After a body edit commit, remember overrides keyed by language + block + field, e.g.  
   `en-US` → `69dfed7b…:h1` → new inner HTML  
   (`rememberFieldOverrides` in `gem-snippet-iframe-bridge.js`).
2. Hook `vce-iframes-container` `setAttribute('content')` / `content` property / attribute mutations  
   (`installPreviewContentOverrideHook`).
3. When Emarsys writes preview HTML for a language (including on A→B→A), surgically rewrite matching `[e-editable]` inners from the override map **before** the snapshot sticks.

We did not teach Emarsys’s backpack to remember. We correct the picture every time Emarsys hangs the old one back up.

### Supporting pieces still useful

- **Prime** dormant `[e-editable]` before apply (`primeEmarsysEditablesInDoc` in `find-replace-dom-utils.js`).
- **MAIN-world bridge** for TinyMCE commit / override remember (`gem-snippet-iframe-bridge.js`, `world: "MAIN"`).
- **Release** editor chrome after commit so TinyMCE/block toolbars stay usable (`releaseEmarsysEditorSession`).
- Surgical container sync remains a secondary snapshot write; the language-switch fix is the override hook.

## Code map

| Concern | Where |
|---------|--------|
| Prime / release / surgical sync / `markEmailBodyDirty` | `extension/find-replace-dom-utils.js` |
| MAIN-world TinyMCE + overrides + `content` hook | `extension/gem-snippet-iframe-bridge.js` |
| Find & Replace / Magic Fill / keyword swap call sites | `find-replace-panel.js`, `magic-fill-panel.js`, `snippets-tab.js`, `content-block-toolbar.js` |
| Draft/handshake snapshot cache (not the live model) | `campaign-draft-data.js`, `content-blocks-fetch-bridge.js` |
| Field merge shape (links / templates) | `campaign-links-data.js` → `mergeBlockContentIntoHtml` |

## Limits / next risks

- Overrides are **in-page session state** (`window.__gemBodyFieldOverrides`). Full reload clears them unless the durable model or a later draft PUT is also updated.
- Save/publish may still persist **pre-edit** model values if Emarsys never absorbed the edit into `campaign.contents[lang]…`.
- Finding Emarsys’s **live** campaign object (same reference the editor uses) remains unsolved; shared `response.json()` was attempted but language switch still used a different store.
- Do not reintroduce full live-DOM dumps into `content` — they break toolbars.

## Debug log crumbs

Prefixes intentionally bypass the debug-logging gate:

- `[GemBodySync]` — content-script probes / dirty / surgical sync
- `[GemBodySync][bridge]` — MAIN-world bridge

Useful flat lines:

- `overrides-remember` — override stored for current language
- `content-override-hook: installed on container`
- `content-override-flat via=… applied=N` — Emarsys rebuilt preview; we rewrote fields
- `campaign-model-flat … sources=snapshot:…` — snapshot-only patch (insufficient alone)
- `commit-editable-flat … ed=mce_0:isDirty=…` — TinyMCE path

## Mental model (short)

**Screen** = iframe. **Mailbox paste** = `vce-iframes-container[content]`. **Backpack** = `campaign.contents[lang].blocks[].content[field].value`.

Gemma must either update the backpack (live model) or fix the paste when Emarsys rebuilds the screen. The current fix does the latter.
