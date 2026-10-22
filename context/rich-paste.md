# Rich Paste

How Gemma’s **Rich Paste** replaces Emarsys’s plain-text paste in the email body, and the TinyMCE quirks it has to work around to land content in the right place.

## What Rich Paste does

Emarsys’s body editor normally flattens pasted content to plain text. Rich Paste intercepts the paste, keeps a small allowlist of formatting, and inserts the cleaned HTML at the user’s caret or selection.

| Setting (Settings panel) | Storage key (`chrome.storage.sync`) | Config field | Effect |
|--------------------------|-------------------------------------|--------------|--------|
| Enable Gemma’s Rich Paste behavior | `gemCustomPasteEnabled` | `enabled` | Off = Gemma does not intercept; Emarsys paste runs normally |
| Allow bold | `gemCustomPasteAllowBold` | `allowBold` | Keeps `<b>`, `<strong>`, `font-weight` |
| Allow italic | `gemCustomPasteAllowItalic` | `allowItalic` | Keeps `<i>`, `<em>`, `font-style` |
| Allow strikethrough | `gemCustomPasteAllowStrikethrough` | `allowStrikethrough` | Keeps `<strike>`, `text-decoration: line-through` |
| Allow underline | `gemCustomPasteAllowUnderline` | `allowUnderline` | Keeps `<u>`, `text-decoration: underline` |
| Allow superscript | `gemCustomPasteAllowSuperscript` | `allowSuperscript` | Keeps `<sup>` |
| Allow links | `gemCustomPasteAllowAnchor` | `allowAnchor` | Keeps `<a href>`, **except** when pasting inside an existing link (see below) |

Rich Paste only acts when the clipboard has `text/html`. Plain-text-only pastes fall through to Emarsys.

## Architecture

```
settings-panel.js ──writes──▶ chrome.storage.sync
                                     │
custom-paste-loader.js (isolated content script, campaign editor page)
  ├─ reads storage, builds config
  ├─ injects <script src="custom-paste.js"> into the page (MAIN world), once
  └─ dispatches window CustomEvent 'gem-custom-paste-config' {detail: config}
                                     │
custom-paste.js (page MAIN world)
  ├─ waits for window.tinymce.editors
  ├─ MutationObserver on document.body → syncEditors()
  └─ patchEditor(ed) per TinyMCE editor → paste handler on ed.getBody()
```

Why this split:

- **TinyMCE lives in the page MAIN world.** Content scripts run in an isolated world and cannot see `window.tinymce`, so the paste logic has to be injected as a page script.
- **Config crosses worlds via a DOM `CustomEvent`.** No inline scripts (CSP-safe). The loader re-dispatches on every storage change; `custom-paste.js` merges the config and calls `rebuildAllPatches()` (tear down all, re-attach).
- **Editors appear lazily and get recreated.** Emarsys initializes TinyMCE per editable on hover/focus and rebuilds editors when blocks change. A `MutationObserver` calls `syncEditors()`, which patches new editors (`activePatches` keyed by `ed.id`) and destroys patches for editors no longer in `tinymce.editors`.

Loader is registered in `manifest.json` for the `contentBlocks/campaign` editor URLs (excluding `gemStripped=true`). `custom-paste.js` is listed under `web_accessible_resources`.

## How Emarsys uses TinyMCE (the parts that matter)

Emarsys runs **TinyMCE 4** in **inline mode** inside the preview iframe. That has consequences:

| Fact | Consequence for paste |
|------|------------------------|
| Each `[e-editable]` field becomes its own inline editor (`id="mce_N"`, `class="mce-content-body"`, `contenteditable="true"`) | `ed.getBody()` is the editable element (often a `<span>`), **not** a `<body>` |
| All inline editors in a block share **one iframe `document`** | `doc.getSelection()` is shared; a selection may belong to a different field. Always check the range is inside *this* editor’s body |
| Link/CTA blocks wrap the editable in an outer `<a e-editable="…Url">`, with the text field as an inner span (`e-editable="…Text"`, `e-link-id="…Url"`) | The enclosing link is an **ancestor of the editor body**, so walking up from the caret and stopping at the body never finds it |
| TinyMCE’s paste plugin creates a hidden **paste bin** `div#mcepastebin` on Ctrl/Cmd+V **keydown**, appends it to the **end of the editor body**, and moves the selection into it | At `paste` event time, the live selection points at the end of the field, not at the user’s caret or selection |

Example of the CTA structure (trimmed):

```html
<a e-editable="article_CTAUrl" href="https://…" class="button">
  <span class="{{ grumpy }}{{ doc }}">
    <span e-editable="article_CTAText" e-link-id="article_CTAUrl"
          id="mce_2" class="mce-content-body" contenteditable="true">Claim my discount</span>
  </span>
</a>
```

## The paste flow (`handlePaste` in `custom-paste.js`)

Bound as a **capture-phase** `paste` listener on `ed.getBody()`.

1. Bail out (native paste) if disabled or no `text/html` on the clipboard.
2. **Resolve the target range** (`resolvePasteRange`):
   - Use the live DOM selection **only if** it is inside this body **and not** inside `#mcepastebin`.
   - Otherwise use `savedRange`, the last usable range captured by `saveCaret`.
   - If neither is usable, return and let native paste run.
3. **Decide whether links are allowed for this paste:** `allowAnchor && !isRangeInsideExistingAnchor(range, body)`.
4. **Sanitize** (`sanitizeHTML(html, { allowAnchor })`). If it throws, return (native paste).
5. Only now `preventDefault()` + `stopImmediatePropagation()`.
6. **Remove any `#mcepastebin`** left in the body (TinyMCE’s own handler, which would clean it up, never runs).
7. **Insert** (`insertSanitizedAtRange`): if the range is non-collapsed, `range.deleteContents()` and collapse; set the DOM selection and `ed.selection.setRng(range)`; then `ed.execCommand('mceInsertContent', false, cleaned)` and `ed.nodeChanged()`.

### Caret tracking (`saveCaret`)

`saveCaret` stores `doc.getSelection()`’s range only when it passes `isUsablePasteRange` (inside this body, not in the paste bin). It runs on:

- `keydown` / `keyup` / `mouseup` in **document capture phase**
- `focus` on the body

Document-level **keydown capture** is the important one. It fires before TinyMCE’s paste plugin handles Ctrl/Cmd+V, so the user’s real selection (including Select All) is saved *before* the paste bin steals it. Because every patched editor adds its own `doc` listeners, the body check is what keeps editors from saving each other’s selections.

## Tricks and considerations (and what failed)

### 1. Never trust the live selection at paste time

| Approach | Result |
|----------|--------|
| Live `doc.getSelection()` first | Selection is inside `#mcepastebin` at end of body → paste **appended at end**, selected text **not replaced** |
| Prefer any non-collapsed range from TinyMCE / DOM / saved | A stale selection from **another field** (shared document) could win → paste went nowhere |
| `ed.selection.getRng()` + `SelectionChange` listener | Also observes the paste bin selection; no improvement |
| Custom Cmd/Ctrl+A handler + `ed.selection.setContent` | Paste stopped working entirely (exception after `preventDefault`) |
| **Saved range captured on keydown (document capture), paste bin excluded** | **Works**: caret insert, partial selection replace, Select All replace |

### 2. Fail open: decide before `preventDefault`

Everything that can fail (range resolution, sanitizing) happens **before** the native paste is cancelled. If Gemma can’t produce a target range or clean HTML, the user still gets Emarsys’s normal paste instead of nothing. The insert step catches range errors and falls back to inserting at TinyMCE’s current caret.

### 3. Clean up the paste bin

Stopping propagation means TinyMCE’s paste handler doesn’t run, so it can’t remove `#mcepastebin`. `removePasteBins()` deletes it before inserting so a stray hidden div doesn’t end up in the email.

### 4. Delete the selection explicitly

`mceInsertContent` does not reliably replace a non-collapsed range in these inline editors. Calling `range.deleteContents()` first makes replace deterministic.

### 5. No nested links

HTML does not allow `<a>` inside `<a>`, and email clients handle it badly. When “Allow links” is on but the paste target is inside a link, pasted anchors are **unwrapped** (label and inner formatting kept). `isRangeInsideExistingAnchor` returns true when either:

- `body.closest('a')` matches: the editor body sits inside a block-level link (CTA/banner case), or
- an `<a>` is an ancestor of the range start, walking up to `documentElement` (a link inside the field’s own content).

Stopping the walk at the editor body was the original bug. It missed the outer CTA link entirely.

### 6. Sanitizer rules (`sanitizeHTML`)

Order matters:

1. `trimClipboardContentEdges`: strip leading/trailing whitespace, zero-width chars, and edge `<br>` / empty wrappers, even nested inside `P`/`DIV`/`SPAN`. Never treats ESL token spans as empty.
2. Remove `<meta>`, `<style>`, `<script>` (with their text), and HTML comments (Google Sheets inserts these).
3. Unwrap any tag not in the allowlist, keeping its children. `SPAN` and `BR` are always allowed.
4. Strip all `data-*` attributes.
5. `<a>`: keep only `href`.
6. **ESL tokens** (`span[e-token]`): keep `e-token`, `token-template`, `token-content`, `token-meta`, `class`, `contenteditable`, and **all** inline styles. These are Emarsys personalization pills and must survive intact.
7. Other spans: keep only `style`, filtered to allowed properties (`font-weight`, `font-style`, `text-decoration` limited to `underline` / `line-through` per settings).
8. Replace `<span>&nbsp;</span>` with a space; remove empty unstyled non-token spans.

## Code map

| Concern | Where |
|---------|-------|
| Settings UI + storage keys | `extension/settings-panel.js` (`GEM_CUSTOM_PASTE_*_KEY`, `opt-custom-paste-*`) |
| Read storage, inject page script, push config | `extension/custom-paste-loader.js` |
| Editor discovery, patching, paste handling, sanitizer | `extension/custom-paste.js` |
| Manifest registration | `extension/manifest.json` (content script + `web_accessible_resources`) |
| User-facing description | `extension/welcome-modal.js` |

Key functions in `custom-paste.js`:

| Function | Role |
|----------|------|
| `trimClipboardContentEdges` | Edge whitespace / empty-node trim |
| `sanitizeHTML(html, { allowAnchor })` | Allowlist sanitize; `allowAnchor` overrides config per paste |
| `isRangeInsideExistingAnchor` | Nested-link guard (checks ancestors of body and range) |
| `isRangeWithinBody` / `isRangeInPasteBin` / `isUsablePasteRange` | Range validity checks |
| `resolvePasteRange` | Live selection if usable, else saved range |
| `patchEditor` → `saveCaret`, `removePasteBins`, `insertSanitizedAtRange`, `handlePaste` | Per-editor wiring |
| `syncEditors` / `cleanupDestroyedEditors` / `rebuildAllPatches` | Lifecycle |

## Rules for future edits

1. **Do not read the live selection at paste time without excluding `#mcepastebin`.** It will point at the end of the field.
2. **Keep `saveCaret` on document-level `keydown` capture.** Body-level or bubble-phase listeners can run after TinyMCE moves the selection.
3. **Always check ranges are inside `ed.getBody()`.** Editors share a document.
4. **Do all fallible work before `preventDefault()`.** A throw after cancelling native paste means the user’s paste disappears silently.
5. **Remove `#mcepastebin` whenever you stop TinyMCE’s paste handler.**
6. **Check for enclosing links above the editor body**, not just inside it.
7. **Never strip or restyle `span[e-token]`.**
8. Test every change against: caret mid-text, partial selection, Select All, a plain text field, a CTA/banner link field, and pasting linked text with “Allow links” on and off.

## Limits and known risks

- Depends on TinyMCE 4 internals: the paste bin id `mcepastebin` and its keydown timing. A TinyMCE upgrade by Emarsys could change either.
- Only `text/html` clipboards are handled. Plain-text pastes (including bare URLs) go through Emarsys’s own paste, so the nested-link guard does not apply to them. Untested whether TinyMCE autolinks a bare URL pasted inside an existing link.
- Right-click → Paste has no Ctrl/Cmd+V keydown, so TinyMCE should not create a paste bin and the live selection is used directly. This is a different path from keyboard paste and has not been explicitly tested.
- `saveCaret` listeners are added to the shared iframe `document` once per patched editor. They’re removed on patch destroy, but many editors means many listeners.

## Debug log crumbs

Enable via Settings → **Enable debug logging** (or `gemSetDebugLogging(true, true)`).

- `[Gem][CustomPaste] Patching live editor: mce_N`: editor patched
- `[Gem][CustomPaste] Cleaning up destroyed editor: mce_N`: patch removed
- `[Gem][CustomPaste] Paste inside existing link — stripping pasted anchors`: nested-link guard fired
- `[Gem][CustomPaste] No caret inside editor for mce_N — using native paste`: no usable range; Emarsys handled it
- `[Gem][CustomPaste] Sanitize failed — using native paste`: sanitizer threw
- `[Gem][CustomPaste] Could not apply paste range; inserting at current caret`: range restore failed; inserted at TinyMCE’s caret

## Mental model (short)

When Ctrl/Cmd+V is pressed, TinyMCE **hides the user’s selection in its pocket** (internal state) and points the cursor at a hidden box at the end of the field. Gemma photographs the selection a moment earlier (keydown capture), ignores the hidden box, throws the box away, and pastes the cleaned HTML where the photo says, minus any links if the spot is already inside a link.
