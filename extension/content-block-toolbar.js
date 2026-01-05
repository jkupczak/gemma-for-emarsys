console.log("[gem] content-block-toolbar.js loaded");

// Content Block Toolbar management - CSS-only approach
function initializeContentBlockToolbar() {
  console.log("[gem] Initializing content block toolbar management");

  // Apply initial settings as CSS classes on body
  applyToolbarSettingsAsClasses();

  // Watch for setting changes
  chrome.storage.onChanged.addListener((changes, namespace) => {
    if (namespace !== "sync") return;

    // Check if chrome APIs are still available (extension context not invalidated)
    if (!chrome || !chrome.storage || !chrome.storage.sync) {
      console.warn("[Gem] Chrome storage API not available - extension context may be invalidated");
      return;
    }

    // Check if any toolbar settings changed
    const toolbarSettings = [
      'manageOptionalContent',
      'predictRecommendationSettings',
      'productFinder',
      'productSource',
      'saveToReuse',
      'resetBlock',
      'convertEslToTokens',
      'swapKeywords'
    ];

    const hasToolbarChange = toolbarSettings.some(setting =>
      changes.hasOwnProperty(setting)
    );

    if (hasToolbarChange) {
      console.log("[gem] Toolbar settings changed, reapplying CSS classes");
      applyToolbarSettingsAsClasses();
    }
  });

  // Inject extra toolbar actions when the toolbar appears
  setupToolbarInjectionObserver();
}

function applyToolbarSettingsAsClasses() {
  chrome.storage.sync.get({
    manageOptionalContent: "hide-if-disabled",
    predictRecommendationSettings: "hide-if-disabled",
    productFinder: "always-show",
    productSource: "hide-if-disabled",
    saveToReuse: "always-show",
    resetBlock: "always-show",
    convertEslToTokens: "always-show",
    swapKeywords: "always-show"
  }, (settings) => {
    console.log("[gem] Applying toolbar settings as CSS classes:", settings);

    // Remove all existing toolbar classes
    document.body.classList.forEach(className => {
      if (className.startsWith('gem-toolbar-')) {
        document.body.classList.remove(className);
      }
    });

    // Add classes based on settings
    Object.entries(settings).forEach(([setting, value]) => {
      document.body.classList.add(`gem-toolbar-${setting}-${value}`);
    });
  });
}

// ------------------------------------------------------------
// Convert ESL → Tokens toolbar button
// ------------------------------------------------------------

const GEM_TOOLBAR_SELECTOR = '.toolbar.e-contentblocks-toolbar';
const GEM_TOOLBAR_ACTIONS_SELECTOR = '.toolbar.e-contentblocks-toolbar .e-contentblocks-toolbar__actions';
const GEM_REORDER_BTN_SELECTOR = '[e-button-id="reorder-block"] > .e-btn';
const GEM_TARGET_IFRAME_SELECTOR = 'iframe.e-contentblocks-preview__iframe';

const GEM_CONVERT_BTN_ID = 'gem-convert-esl-to-tokens';
const GEM_CONVERT_BTN_CLASS = 'gemConvertESLToTokens';

// Text Swap toolbar button
const GEM_TEXT_SWAP_BTN_ID = 'gem-swap-keywords';
const GEM_TEXT_SWAP_BTN_CLASS = 'gemSwapKeywords';
// Swap configuration is stored on snippets themselves
const GEM_SNIPPETS_STORAGE_KEY = 'gemSnippets';

const GEM_ESL_TOKEN_NAME = 'ESL snippet';
// Match ESL variable-ish strings like {{ something }} but avoid curly-quote noise.
const GEM_ESL_REGEX = /\{\{[^”“‘’}]+\}\}/g;
const GEM_ESL_RDS_PREFIX_REGEX = /^\{\{\s*rds\./;
const GEM_ESL_RDS_NAME_REGEX = /\]\.[^\s\|]+/;
const GEM_ESL_CONTACT_NAME_REGEX = /contact\.\d+/;
// Note: GEM_SNIPPETS_STORAGE_KEY is shared between features

let gemToolbarObserver = null;

function setupToolbarInjectionObserver() {
  if (gemToolbarObserver) return;

  const injectIfPresent = () => {
    const toolbar = document.querySelector(GEM_TOOLBAR_SELECTOR);
    if (!toolbar) return;
    injectConvertButtonIntoToolbar(toolbar);
    injectTextSwapButtonIntoToolbar(toolbar);
  };

  gemToolbarObserver = new MutationObserver(() => injectIfPresent());
  gemToolbarObserver.observe(document.body, { childList: true, subtree: true });

  // Also try once immediately
  injectIfPresent();
}

function injectConvertButtonIntoToolbar(toolbarEl) {
  const actions = toolbarEl.querySelector(GEM_TOOLBAR_ACTIONS_SELECTOR);
  if (!actions) return;

  // Avoid duplicates per toolbar instance
  if (actions.querySelector(`[block-toolbar-button="${GEM_CONVERT_BTN_ID}"]`)) return;

  const reorderBtn = toolbarEl.querySelector(GEM_REORDER_BTN_SELECTOR);
  if (!reorderBtn) return;

  const eBlockId = reorderBtn.getAttribute('e-block-id') || '';
  const blockTemplateName = reorderBtn.getAttribute('blocktemplatename') || '';
  const blockPosition = reorderBtn.getAttribute('blockposition') || '';

  // Only show this action if the target block contains contenteditable areas.
  // The toolbar is per-block and appears/disappears on hover, so we can gate injection here.
  if (eBlockId && !blockHasEditableInPreviewIframe(eBlockId)) {
    return;
  }

  const tooltip = document.createElement('e-tooltip');
  tooltip.setAttribute('content', 'Convert ESL to Tokens');
  tooltip.setAttribute('e-button-id', GEM_CONVERT_BTN_ID);
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-description', 'Convert ESL to Tokens');

  // Inner button (matches Emarsys structure closely)
  const btn = document.createElement('div');
  btn.className = `e-btn e-btn-onlyicon e-btn-on_overlay e-svgclickfix ${GEM_CONVERT_BTN_CLASS}`;
  btn.setAttribute('block-toolbar-button', GEM_CONVERT_BTN_ID);
  if (eBlockId) btn.setAttribute('e-block-id', eBlockId);
  if (blockTemplateName) btn.setAttribute('blocktemplatename', blockTemplateName);
  if (blockPosition) btn.setAttribute('blockposition', blockPosition);

  btn.innerHTML = `
    <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon">&#xF199;</div>
      </div>
    </gem-e-icon>
  `.trim();

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const id = btn.getAttribute('e-block-id');
    if (!id) return;
    convertEslToTokensForBlock(id);
  });

  tooltip.appendChild(btn);
  // Insert as the second child (index 1). If there is no second child, append.
  const secondChild = actions.children && actions.children.length > 1 ? actions.children[1] : null;
  if (secondChild) {
    actions.insertBefore(tooltip, secondChild);
  } else {
    actions.appendChild(tooltip);
  }
}

function injectTextSwapButtonIntoToolbar(toolbarEl) {
  const actions = toolbarEl.querySelector(GEM_TOOLBAR_ACTIONS_SELECTOR);
  if (!actions) return;

  // Respect settings: allow user to always hide this icon
  if (document.body.classList.contains('gem-toolbar-swapKeywords-always-hide')) {
    return;
  }

  // Avoid duplicates per toolbar instance
  if (actions.querySelector(`[block-toolbar-button="${GEM_TEXT_SWAP_BTN_ID}"]`)) return;

  const reorderBtn = toolbarEl.querySelector(GEM_REORDER_BTN_SELECTOR);
  if (!reorderBtn) return;

  const eBlockId = reorderBtn.getAttribute('e-block-id') || '';
  const blockTemplateName = reorderBtn.getAttribute('blocktemplatename') || '';
  const blockPosition = reorderBtn.getAttribute('blockposition') || '';

  // Only show this action if the target block contains contenteditable areas.
  if (eBlockId && !blockHasEditableInPreviewIframe(eBlockId)) {
    return;
  }

  // Only show this action if the user has at least one snippet with a swap keyword configured.
  // This requires an async storage read; gate injection with a one-time async check per toolbar instance.
  if (!actions._gemSwapKeywordChecked) {
    actions._gemSwapKeywordChecked = true;
    hasAnySwapKeywordConfigured((hasAny) => {
      actions._gemSwapKeywordHasAny = !!hasAny;
      if (!hasAny) return;
      // Toolbar might already be gone by the time storage returns.
      if (!document.contains(toolbarEl)) return;
      injectTextSwapButtonIntoToolbar(toolbarEl);
    });
    return;
  }
  if (actions._gemSwapKeywordHasAny === false) return;

  const tooltip = document.createElement('e-tooltip');
  tooltip.setAttribute('content', 'Swap Keywords');
  tooltip.setAttribute('e-button-id', GEM_TEXT_SWAP_BTN_ID);
  tooltip.setAttribute('role', 'tooltip');
  tooltip.setAttribute('aria-description', 'Swap Keywords');

  const btn = document.createElement('div');
  btn.className = `e-btn e-btn-onlyicon e-btn-on_overlay e-svgclickfix ${GEM_TEXT_SWAP_BTN_CLASS}`;
  btn.setAttribute('block-toolbar-button', GEM_TEXT_SWAP_BTN_ID);
  if (eBlockId) btn.setAttribute('e-block-id', eBlockId);
  if (blockTemplateName) btn.setAttribute('blocktemplatename', blockTemplateName);
  if (blockPosition) btn.setAttribute('blockposition', blockPosition);

  // Icon font glyph (U+F0DE)
  btn.innerHTML = `
    <gem-e-icon icon="style">
      <div aria-hidden="true" class="e-icon-wrapper">
        <div class="gem-e-icon">&#xF0DE;</div>
      </div>
    </gem-e-icon>
  `.trim();

  btn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    e.stopImmediatePropagation();

    const id = btn.getAttribute('e-block-id');
    if (!id) return;
    applyTextSwapForBlock(id);
  });

  tooltip.appendChild(btn);

  // Insert right after the token converter icon (if present). Otherwise, fall back to being after the first icon.
  const convertBtn = actions.querySelector(`[block-toolbar-button="${GEM_CONVERT_BTN_ID}"]`);
  const convertTooltip = convertBtn && convertBtn.closest && convertBtn.closest('e-tooltip');
  if (convertTooltip && convertTooltip.parentElement === actions) {
    convertTooltip.insertAdjacentElement('afterend', tooltip);
    return;
  }

  // Fallback: try to be the third child (index 2). If there isn't one, append.
  const thirdChild = actions.children && actions.children.length > 2 ? actions.children[2] : null;
  if (thirdChild) {
    actions.insertBefore(tooltip, thirdChild);
  } else {
    actions.appendChild(tooltip);
  }
}

function blockHasEditableInPreviewIframe(eBlockId) {
  const iframe = document.querySelector(GEM_TARGET_IFRAME_SELECTOR);
  if (!iframe) return false;

  let doc;
  try {
    doc = iframe.contentDocument || iframe.contentWindow?.document;
  } catch (e) {
    return false;
  }
  if (!doc) return false;

  try {
    const block = doc.querySelector(`[e-block-id="${CSS.escape(eBlockId)}"]`);
    if (!block) return false;
    return !!block.querySelector('[contenteditable="true"]');
  } catch (e) {
    return false;
  }
}

function hasAnySwapKeywordConfigured(callback) {
  try {
    chrome.storage.sync.get({ [GEM_SNIPPETS_STORAGE_KEY]: [] }, (result) => {
      const snippets = result && result[GEM_SNIPPETS_STORAGE_KEY];
      const list = Array.isArray(snippets) ? snippets : [];
      const hasAny = list.some((s) => !!(s && typeof s.swapKeyword === 'string' && s.swapKeyword.trim()));
      callback(hasAny);
    });
  } catch (e) {
    callback(false);
  }
}

function applyTextSwapForBlock(eBlockId) {
  // Load snippets and derive swap rules from snippet.swapKeyword/swapMode.
  getSavedSnippets((snippets) => {
    const list = Array.isArray(snippets) ? snippets : [];

    // First snippet wins per keyword (keywords are supposed to be unique anyway).
    const ruleByKeyword = new Map();
    list.forEach((s) => {
      const keyword = (s && typeof s.swapKeyword === 'string') ? s.swapKeyword.trim() : '';
      if (!keyword) return;
      if (ruleByKeyword.has(keyword)) return;
      ruleByKeyword.set(keyword, {
        keyword,
        mode: s.swapMode === 'plain' ? 'plain' : 'token',
        snippet: s
      });
    });

    const keywords = Array.from(ruleByKeyword.keys());
    if (keywords.length === 0) return;

      // Prefer longer keywords to avoid partial matches eating longer ones
      keywords.sort((a, b) => b.length - a.length);

      const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const union = keywords.map(escapeRegExp).join('|');
      const re = new RegExp(union, 'g');

      const iframe = document.querySelector(GEM_TARGET_IFRAME_SELECTOR);
      if (!iframe) return;

      let doc;
      try {
        doc = iframe.contentDocument || iframe.contentWindow?.document;
      } catch (e) {
        return;
      }
      if (!doc) return;

      const blockEls = Array.from(doc.querySelectorAll(`[e-block-id="${CSS.escape(eBlockId)}"]`));
      if (!blockEls.length) return;

      const isInsideExistingToken = (node) => {
        let cur = node;
        while (cur) {
          if (cur.nodeType === 1) {
            const el = cur;
            if (el.matches && (el.matches('span[e-token="cust_esl"]') || el.classList.contains('cbNonEditable'))) {
              return true;
            }
          }
          cur = cur.parentNode;
        }
        return false;
      };

      let didChange = false;
      const touchedEditables = new Set();

      blockEls.forEach((blockEl) => {
        const editables = Array.from(blockEl.querySelectorAll('[contenteditable="true"]'));
        editables.forEach((editable) => {
          const walker = doc.createTreeWalker(
            editable,
            NodeFilter.SHOW_TEXT,
            {
              acceptNode(node) {
                if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
                // Reset lastIndex because re is global.
                re.lastIndex = 0;
                const has = re.test(node.nodeValue);
                re.lastIndex = 0;
                if (!has) return NodeFilter.FILTER_REJECT;
                if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
                return NodeFilter.FILTER_ACCEPT;
              }
            }
          );

          const nodes = [];
          let n;
          while ((n = walker.nextNode())) nodes.push(n);

          nodes.forEach((textNode) => {
            const text = textNode.nodeValue;
            re.lastIndex = 0;

            const frag = doc.createDocumentFragment();
            let lastIdx = 0;
            let match;

            while ((match = re.exec(text)) !== null) {
              const start = match.index;
              const end = start + match[0].length;
              const keyword = match[0];
              const rule = ruleByKeyword.get(keyword);
              const snippet = rule && rule.snippet;
              const mode = rule && rule.mode ? rule.mode : 'token';

              // text before
              if (start > lastIdx) {
                frag.appendChild(doc.createTextNode(text.slice(lastIdx, start)));
              }

              if (!snippet || typeof snippet.content !== 'string') {
                // If the rule is misconfigured (missing snippet), leave the keyword as-is.
                frag.appendChild(doc.createTextNode(keyword));
              } else if (mode === 'token') {
                frag.appendChild(createEslTokenSpan(doc, snippet.name || GEM_ESL_TOKEN_NAME, snippet.content));
              } else {
                frag.appendChild(doc.createTextNode(snippet.content));
              }

              if (snippet && typeof snippet.content === 'string') {
                didChange = true;
                touchedEditables.add(editable);
              }
              lastIdx = end;
            }

            // trailing text
            if (lastIdx < text.length) {
              frag.appendChild(doc.createTextNode(text.slice(lastIdx)));
            }

            if (didChange && textNode.parentNode) {
              textNode.parentNode.replaceChild(frag, textNode);
            }
          });

          if (didChange) {
            editable.dispatchEvent(new Event('input', { bubbles: true }));
            editable.dispatchEvent(new Event('change', { bubbles: true }));
          }
        });
      });

      if (didChange) {
        markEmarsysDraftDirty(doc, Array.from(touchedEditables));
        nudgeEmarsysDirtyDetectionViaFocus(doc, Array.from(touchedEditables));
      }
  });
}

function escapeTokenContentForAttribute(value) {
  // Must match snippets-tab.js "escapeHtmlAttribute" behavior used for token-content.
  return String(value)
    .replace(/%/g, '%25')
    .replace(/&/g, '&amp;')
    .replace(/ /g, '%20')
    .replace(/\{/g, '%7B')
    .replace(/\|/g, '%7C')
    .replace(/\}/g, '%7D')
    .replace(/\\/g, '%5C')
    .replace(/\[/g, '%5B')
    .replace(/\]/g, '%5D')
    .replace(/</g, '%3C')
    .replace(/>/g, '%3E')
    .replace(/"/g, '%22');
}

function createEslTokenSpan(doc, name, script) {
  const tokenContent = JSON.stringify({ script });
  const encodedTokenContent = escapeTokenContentForAttribute(tokenContent);
  const encodedTokenTemplate = '%22%3C%25=%20script%20%25%3E%22';
  const encodedTokenMeta = '%7B%7D';

  const span = doc.createElement('span');
  span.setAttribute('e-token', 'cust_esl');
  span.setAttribute('token-template', encodedTokenTemplate);
  span.setAttribute('token-content', encodedTokenContent);
  span.setAttribute('token-meta', encodedTokenMeta);
  span.setAttribute('contenteditable', 'false');
  span.className = 'cbNonEditable';
  span.style.backgroundColor = '#6597cf';
  span.style.borderRadius = '.3em';
  span.style.boxShadow = '0 0 0 0.2em #6597cf';
  span.style.color = '#fff';
  span.textContent = name;
  return span;
}

function getSavedSnippets(callback) {
  try {
    chrome.storage.sync.get({ [GEM_SNIPPETS_STORAGE_KEY]: [] }, (result) => {
      const snippets = result && result[GEM_SNIPPETS_STORAGE_KEY];
      callback(Array.isArray(snippets) ? snippets : []);
    });
  } catch (e) {
    callback([]);
  }
}

function deriveTokenNameFromMatch(raw, savedSnippets = []) {
  const s = String(raw || '');

  // Step 1 (new): match against user's saved snippets by exact code match
  // Use the first match's snippet name.
  if (Array.isArray(savedSnippets) && savedSnippets.length) {
    const found = savedSnippets.find((snip) => {
      if (!snip) return false;
      const code = typeof snip.content === 'string' ? snip.content : '';
      return code === s;
    });
    if (found && typeof found.name === 'string' && found.name.trim()) {
      return found.name.trim();
    }
  }

  // If starts with {{ rds.
  if (GEM_ESL_RDS_PREFIX_REGEX.test(s)) {
    const m = s.match(GEM_ESL_RDS_NAME_REGEX);
    if (m && m[0]) {
      // Strip leading "]."
      return m[0].startsWith('].') ? m[0].slice(2) : m[0];
    }
    return GEM_ESL_TOKEN_NAME;
  }

  // Else, if contains contact.<digits>
  const c = s.match(GEM_ESL_CONTACT_NAME_REGEX);
  if (c && c[0]) return c[0];

  return GEM_ESL_TOKEN_NAME;
}

function convertEslToTokensForBlock(eBlockId) {
  getSavedSnippets((savedSnippets) => {
    const iframe = document.querySelector(GEM_TARGET_IFRAME_SELECTOR);
    if (!iframe) return;

    let doc;
    try {
      doc = iframe.contentDocument || iframe.contentWindow?.document;
    } catch (e) {
      return;
    }
    if (!doc) return;

    const blockEls = Array.from(doc.querySelectorAll(`[e-block-id="${CSS.escape(eBlockId)}"]`));
    if (!blockEls.length) return;

  const isInsideExistingToken = (node) => {
    let cur = node;
    while (cur) {
      if (cur.nodeType === 1) {
        const el = cur;
        if (el.matches && (el.matches('span[e-token="cust_esl"]') || el.classList.contains('cbNonEditable'))) {
          return true;
        }
      }
      cur = cur.parentNode;
    }
    return false;
  };

  let didChange = false;
  const touchedEditables = new Set();

    blockEls.forEach((blockEl) => {
      const editables = Array.from(blockEl.querySelectorAll('[contenteditable="true"]'));
      editables.forEach((editable) => {
        const walker = doc.createTreeWalker(
          editable,
          NodeFilter.SHOW_TEXT,
          {
            acceptNode(node) {
              if (!node.nodeValue) return NodeFilter.FILTER_REJECT;
              // reset regex state due to global flag usage
              GEM_ESL_REGEX.lastIndex = 0;
              if (!GEM_ESL_REGEX.test(node.nodeValue)) return NodeFilter.FILTER_REJECT;
              GEM_ESL_REGEX.lastIndex = 0;
              if (isInsideExistingToken(node.parentNode)) return NodeFilter.FILTER_REJECT;
              return NodeFilter.FILTER_ACCEPT;
            }
          }
        );

        const nodes = [];
        let n;
        while ((n = walker.nextNode())) nodes.push(n);

        nodes.forEach((textNode) => {
          const text = textNode.nodeValue;
          GEM_ESL_REGEX.lastIndex = 0;

          const frag = doc.createDocumentFragment();
          let lastIdx = 0;
          let match;

          while ((match = GEM_ESL_REGEX.exec(text)) !== null) {
            const start = match.index;
            const end = start + match[0].length;

            // text before
            if (start > lastIdx) {
              frag.appendChild(doc.createTextNode(text.slice(lastIdx, start)));
            }

            // token
            frag.appendChild(createEslTokenSpan(doc, deriveTokenNameFromMatch(match[0], savedSnippets), match[0]));
            didChange = true;
            touchedEditables.add(editable);

            lastIdx = end;
          }

          // trailing text
          if (lastIdx < text.length) {
            frag.appendChild(doc.createTextNode(text.slice(lastIdx)));
          }

          if (textNode.parentNode) {
            textNode.parentNode.replaceChild(frag, textNode);
          }
        });

        if (didChange) {
          // Notify editor (basic)
          editable.dispatchEvent(new Event('input', { bubbles: true }));
          editable.dispatchEvent(new Event('change', { bubbles: true }));
        }
      });
    });

    // Ensure Emarsys recognizes the draft as modified (dirty)
    if (didChange) {
      markEmarsysDraftDirty(doc, Array.from(touchedEditables));
      // Emarsys appears to only detect dirty state after the user "enters" the block (focus/click).
      // Nudge the edited block through a lightweight focus + click path so the draft becomes dirty
      // without requiring manual user interaction.
      nudgeEmarsysDirtyDetectionViaFocus(doc, Array.from(touchedEditables));
    }
  });
}

function markEmarsysDraftDirty(doc, editables = []) {
  // 1) Dispatch richer input-ish events from the edited nodes
  editables.forEach((el) => {
    try {
      // InputEvent is often what editors hook for dirty tracking.
      el.dispatchEvent(new InputEvent('input', { bubbles: true, cancelable: true, inputType: 'insertReplacementText', data: '' }));
    } catch (_) {
      // ignore if InputEvent constructor isn't available
    }
    try {
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new Event('keyup', { bubbles: true }));
    } catch (_) {}
  });

  // 2) If TinyMCE is present in the iframe, explicitly mark dirty + fire change
  try {
    const win = doc.defaultView;
    const tm = win && (win.tinymce || win.tinyMCE);
    const editor = tm && (tm.activeEditor || (Array.isArray(tm.editors) ? tm.editors[0] : null));
    if (editor) {
      if (typeof editor.setDirty === 'function') editor.setDirty(true);
      if (editor.undoManager && typeof editor.undoManager.add === 'function') editor.undoManager.add();
      if (typeof editor.fire === 'function') editor.fire('change');
    }
  } catch (_) {}

  // 3) Also bubble an input event off the document body as a last-resort signal
  try {
    if (doc.body) doc.body.dispatchEvent(new Event('input', { bubbles: true }));
  } catch (_) {}
}

function nudgeEmarsysDirtyDetectionViaFocus(doc, editables = []) {
  const target = editables && editables.find((el) => el && typeof el.focus === 'function');
  if (!target) return;

  const win = doc.defaultView;
  const prevActive = doc.activeElement;

  try {
    // Focus the editable (similar to user clicking into it)
    target.focus({ preventScroll: true });
  } catch (_) {
    try { target.focus(); } catch (_) {}
  }

  // Place a caret at end (selectionchange is often observed by editors)
  try {
    const sel = doc.getSelection && doc.getSelection();
    if (sel && typeof sel.removeAllRanges === 'function' && typeof sel.addRange === 'function') {
      const range = doc.createRange();
      range.selectNodeContents(target);
      range.collapse(false);
      sel.removeAllRanges();
      sel.addRange(range);
      try { doc.dispatchEvent(new Event('selectionchange', { bubbles: true })); } catch (_) {}
    }
  } catch (_) {}

  // Fire a minimal pointer/click sequence to trigger editor wiring
  try {
    const mkPointer = (type) => {
      if (typeof PointerEvent === 'function') {
        return new PointerEvent(type, { bubbles: true, cancelable: true, view: win, pointerType: 'mouse' });
      }
      return new MouseEvent(type, { bubbles: true, cancelable: true, view: win });
    };
    const mkMouse = (type) => new MouseEvent(type, { bubbles: true, cancelable: true, view: win });

    target.dispatchEvent(mkPointer('pointerdown'));
    target.dispatchEvent(mkMouse('mousedown'));
    target.dispatchEvent(mkMouse('mouseup'));
    target.dispatchEvent(mkMouse('click'));
  } catch (_) {}

  // Emarsys seems to mark dirty only after the user enters AND leaves the block.
  // So we also trigger a lightweight "focus out" path after handlers run.
  // Restore focus back to what the user had if possible; otherwise blur the target.
  try {
    if (win && win.setTimeout) {
      win.setTimeout(() => {
        // Always explicitly blur the target (and fire focusout) to mimic the "click in then click out" path.
        try {
          if (typeof FocusEvent === 'function') {
            target.dispatchEvent(new FocusEvent('focusout', { bubbles: true, cancelable: false, relatedTarget: null }));
            target.dispatchEvent(new FocusEvent('blur', { bubbles: false, cancelable: false, relatedTarget: null }));
          } else {
            target.dispatchEvent(new Event('focusout', { bubbles: true }));
            target.dispatchEvent(new Event('blur'));
          }
        } catch (_) {}
        try { target.blur(); } catch (_) {}

        // Prefer restoring previous focus if it exists and differs from target
        if (prevActive && prevActive !== target && typeof prevActive.focus === 'function') {
          try { prevActive.focus({ preventScroll: true }); } catch (_) {
            try { prevActive.focus(); } catch (_) {}
          }
        } else {
          // Otherwise focus something inert so the active element isn't left on the editable.
          try {
            if (doc.body && typeof doc.body.focus === 'function') doc.body.focus({ preventScroll: true });
          } catch (_) {
            try { if (doc.body) doc.body.focus(); } catch (_) {}
          }
        }
      }, 0);
    }
  } catch (_) {}
}

// Wait for page to be ready before initializing
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initializeContentBlockToolbar);
} else {
  initializeContentBlockToolbar();
}
